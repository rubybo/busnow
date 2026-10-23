import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { WEEKDAYS, weekdayOf, type Weekday } from "./schedule.ts";
import { ensureSeedData, SEED_VERSION } from "./seed/reseed.ts";

export type StopRow = { id: number; name: string; slug: string };
export type DepartureRow = {
  id: number;
  departs: string;
  direction: string;
  directionPos: number;
  pattern: string;
  routeId: number;
  routeCode: string;
  routeSlug: string;
  kind: string;
  title: string;
  stopFrac: number;
  headwayMin: number;
  rideMin: number;
  atOrigin: number;
  atTerminus: number;
  hubRoutes: number;
};

type DepartureQuery = {
  id: number;
  departs: string;
  direction: string;
  directionPos: number;
  pattern: string;
  routeId: number;
  routeCode: string;
  routeSlug: string;
  kind: string;
  title: string;
  sequence: number;
  lastSeq: number | null;
  firstSeq: number | null;
  hubRoutes: number | null;
  prevDeparts: string | null;
  originDeparts: string | null;
};

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stops (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('bus', 'minibus')),
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS directions (
  id INTEGER PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS patterns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sun INTEGER NOT NULL,
  mon INTEGER NOT NULL,
  tue INTEGER NOT NULL,
  wed INTEGER NOT NULL,
  thu INTEGER NOT NULL,
  fri INTEGER NOT NULL,
  sat INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY,
  direction_id INTEGER NOT NULL REFERENCES directions(id) ON DELETE CASCADE,
  pattern_id INTEGER NOT NULL REFERENCES patterns(id)
);
CREATE TABLE IF NOT EXISTS stop_times (
  id INTEGER PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  stop_id INTEGER NOT NULL REFERENCES stops(id),
  sequence INTEGER NOT NULL,
  departs TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  morning_stop_id INTEGER REFERENCES stops(id) ON DELETE SET NULL,
  evening_stop_id INTEGER REFERENCES stops(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stop_id INTEGER NOT NULL REFERENCES stops(id),
  route_id INTEGER NOT NULL REFERENCES routes(id),
  direction_name TEXT NOT NULL,
  departs TEXT NOT NULL,
  lead_minutes INTEGER NOT NULL,
  sun INTEGER NOT NULL,
  mon INTEGER NOT NULL,
  tue INTEGER NOT NULL,
  wed INTEGER NOT NULL,
  thu INTEGER NOT NULL,
  fri INTEGER NOT NULL,
  sat INTEGER NOT NULL,
  UNIQUE (user_id, stop_id, route_id, direction_name, departs)
);
CREATE TABLE IF NOT EXISTS reminder_logs (
  reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  sent_on TEXT NOT NULL,
  PRIMARY KEY (reminder_id, sent_on)
);
CREATE INDEX IF NOT EXISTS stop_times_stop ON stop_times(stop_id);
CREATE INDEX IF NOT EXISTS stop_times_stop_departs ON stop_times(stop_id, departs);
CREATE INDEX IF NOT EXISTS stop_times_trip ON stop_times(trip_id);
`;

export function createDatabase(filename: string): DatabaseSync {
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(SCHEMA);
  ensureSeedData(db);
  return db;
}

const globalDb = globalThis as unknown as { busnow?: DatabaseSync; busnowSeed?: string; busnowIndexed?: boolean };

const resetListeners = new Set<(db: DatabaseSync) => void>();

export function onDatabaseReset(listener: (db: DatabaseSync) => void): void {
  resetListeners.add(listener);
}

function ensureIndexes(db: DatabaseSync): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS stop_times_stop_departs ON stop_times(stop_id, departs);
    CREATE INDEX IF NOT EXISTS stop_times_trip ON stop_times(trip_id);
  `);
}

export function databasePath(): string {
  return path.join(process.cwd(), "data", "busnow.sqlite");
}

export function getDb(): DatabaseSync {
  if (!globalDb.busnow) {
    globalDb.busnow = createDatabase(databasePath());
    globalDb.busnowSeed = SEED_VERSION;
    globalDb.busnowIndexed = true;
  } else if (globalDb.busnowSeed !== SEED_VERSION) {
    // The connection survives dev hot reloads, so a new seed must be applied to it in place.
    ensureSeedData(globalDb.busnow);
    globalDb.busnowSeed = SEED_VERSION;
    for (const listener of resetListeners) listener(globalDb.busnow);
  }
  if (!globalDb.busnowIndexed) {
    ensureIndexes(globalDb.busnow);
    globalDb.busnowIndexed = true;
  }
  return globalDb.busnow;
}

const CARD_BATCH = 48;

function departureSql(weekday: Weekday, tail: string): string {
  return `SELECT st.id AS id, st.departs AS departs, d.name AS direction, d.position AS directionPos, p.name AS pattern,
              r.id AS routeId, r.code AS routeCode, r.slug AS routeSlug, r.kind AS kind, r.title AS title,
              st.sequence AS sequence,
              (SELECT MAX(s2.sequence) FROM stop_times s2 WHERE s2.trip_id = st.trip_id) AS lastSeq,
              (SELECT MIN(s1.sequence) FROM stop_times s1 WHERE s1.trip_id = st.trip_id) AS firstSeq,
              (SELECT COUNT(DISTINCT dh.route_id)
                 FROM stop_times hs
                 JOIN trips ht ON ht.id = hs.trip_id
                 JOIN directions dh ON dh.id = ht.direction_id
                 WHERE hs.stop_id = st.stop_id) AS hubRoutes,
              (SELECT s0.departs FROM stop_times s0
                 WHERE s0.trip_id = st.trip_id
                 ORDER BY s0.sequence ASC LIMIT 1) AS originDeparts,
              (SELECT prev.departs FROM stop_times prev
                 JOIN trips tp ON tp.id = prev.trip_id
                 JOIN patterns pp ON pp.id = tp.pattern_id
                 WHERE prev.stop_id = st.stop_id AND tp.direction_id = t.direction_id
                   AND pp.${weekday} = 1 AND prev.departs < st.departs
                 ORDER BY prev.departs DESC LIMIT 1) AS prevDeparts
       FROM stop_times st
       JOIN trips t ON t.id = st.trip_id
       JOIN patterns p ON p.id = t.pattern_id
       JOIN directions d ON d.id = t.direction_id
       JOIN routes r ON r.id = d.route_id
       WHERE st.stop_id = ? AND p.${weekday} = 1
       ${tail}`;
}

function clockMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function clockRide(departs: string, origin: string | null): number {
  if (!origin) return 14;
  const gap = clockMinutes(departs) - clockMinutes(origin);
  if (gap < 0 || gap > 90) return 14;
  return gap;
}

function clockGap(departs: string, prev: string | null): number {
  if (!prev) return 45;
  const gap = clockMinutes(departs) - clockMinutes(prev);
  if (gap <= 0) return 45;
  return Math.min(90, Math.max(5, gap));
}

function withRide(rows: DepartureQuery[]): DepartureRow[] {
  return rows.map((row) => {
    const last = row.lastSeq ?? 0;
    const first = row.firstSeq ?? 0;
    const stopFrac = last > 0 ? row.sequence / last : 0.5;
    const atOrigin = row.sequence === first ? 1 : 0;
    return {
      id: row.id,
      departs: row.departs,
      direction: row.direction,
      directionPos: row.directionPos,
      pattern: row.pattern,
      routeId: row.routeId,
      routeCode: row.routeCode,
      routeSlug: row.routeSlug,
      kind: row.kind,
      title: row.title,
      stopFrac,
      headwayMin: clockGap(row.departs, row.prevDeparts),
      rideMin: clockRide(row.departs, row.originDeparts),
      atOrigin,
      atTerminus: row.sequence === last && atOrigin === 0 ? 1 : 0,
      hubRoutes: row.hubRoutes ?? 1,
    };
  });
}

function uniqueUpcoming(rows: DepartureRow[], now: string, limit: number): DepartureRow[] {
  const seen = new Set<string>();
  const out: DepartureRow[] = [];
  for (const row of rows) {
    if (row.departs < now) continue;
    const key = `${row.routeId}:${row.directionPos}:${row.departs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length === limit) break;
  }
  return out;
}

function boardSlice(rows: DepartureRow[], now: string): DepartureRow[] {
  const groups = new Map<string, { future: DepartureRow[]; past: DepartureRow | null }>();
  for (const row of rows) {
    const key = `${row.routeId}:${row.directionPos}`;
    let group = groups.get(key);
    if (!group) {
      group = { future: [], past: null };
      groups.set(key, group);
    }
    if (row.departs >= now) {
      if (group.future.length < 2 && !group.future.some((item) => item.departs === row.departs)) group.future.push(row);
    } else {
      group.past = row;
    }
  }
  const out: DepartureRow[] = [];
  for (const group of groups.values()) {
    if (group.future.length) out.push(...group.future);
    else if (group.past) out.push(group.past);
  }
  out.sort((a, b) => a.departs.localeCompare(b.departs) || a.routeCode.localeCompare(b.routeCode, "ru"));
  return out;
}

export function departuresForStop(
  db: DatabaseSync,
  stopId: number,
  isoDate: string,
  view: "full" | "card" | "board" = "full",
  now = "00:00",
): DepartureRow[] {
  const weekday = weekdayOf(isoDate);
  if (!WEEKDAYS.includes(weekday)) throw new Error("Дата задаётся как ГГГГ-ММ-ДД");
  const ordered = "ORDER BY st.departs, r.code, d.position";
  if (view === "card") {
    const batch = withRide(
      db.prepare(`${departureSql(weekday, `AND st.departs >= ? ${ordered} LIMIT ${CARD_BATCH}`)}`).all(stopId, now) as DepartureQuery[],
    );
    const picked = uniqueUpcoming(batch, now, 6);
    if (picked.length === 6 || batch.length < CARD_BATCH) return picked;
    const rest = withRide(
      db.prepare(`${departureSql(weekday, `AND st.departs >= ? ${ordered}`)}`).all(stopId, now) as DepartureQuery[],
    );
    return uniqueUpcoming(rest, now, 6);
  }
  const rows = withRide(db.prepare(`${departureSql(weekday, ordered)}`).all(stopId) as DepartureQuery[]);
  if (view === "board") return boardSlice(rows, now);
  return rows;
}

export function findStop(db: DatabaseSync, id: number): StopRow | null {
  return (db.prepare("SELECT id, name, slug FROM stops WHERE id = ?").get(id) as StopRow | undefined) ?? null;
}

export function searchStops(db: DatabaseSync, query: string): StopRow[] {
  const q = query.trim();
  if (!q) return db.prepare("SELECT id, name, slug FROM stops ORDER BY name").all() as StopRow[];
  return db
    .prepare("SELECT id, name, slug FROM stops WHERE name LIKE ? ORDER BY name")
    .all(`%${q.replace(/[%_]/g, "")}%`) as StopRow[];
}

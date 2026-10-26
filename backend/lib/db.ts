import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
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
  directionId: number;
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
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ''
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
  stop_name TEXT NOT NULL,
  route_code TEXT NOT NULL,
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
  UNIQUE (user_id, stop_name, route_code, direction_name, departs)
);
CREATE TABLE IF NOT EXISTS reminder_logs (
  reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  sent_on TEXT NOT NULL,
  PRIMARY KEY (reminder_id, sent_on)
);
CREATE TABLE IF NOT EXISTS presence (
  visitor_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (visitor_hash, day)
);
CREATE INDEX IF NOT EXISTS presence_day_seen ON presence(day, last_seen);
CREATE INDEX IF NOT EXISTS stop_times_stop ON stop_times(stop_id);
CREATE INDEX IF NOT EXISTS stop_times_stop_departs ON stop_times(stop_id, departs);
CREATE INDEX IF NOT EXISTS stop_times_trip ON stop_times(trip_id);
`;

export function createDatabase(filename: string): DatabaseSync {
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(SCHEMA);
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
  }
  db.exec("PRAGMA temp_store = MEMORY");
  db.exec("PRAGMA cache_size = -16000");
  ensureIndexes(db);
  ensureSeedData(db);
  return db;
}

const SCHEMA_MARK = 4;
const globalDb = globalThis as unknown as { busnow?: DatabaseSync; busnowSeed?: string; busnowSchema?: number };

const resetListeners = new Set<(db: DatabaseSync) => void>();

export function onDatabaseReset(listener: (db: DatabaseSync) => void): void {
  resetListeners.add(listener);
}

/** Old reminders pointed at stop and route ids, which a reseed deletes. Keep the name, route number and time. */
export function migrateReminders(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(reminders)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "stop_id")) return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(`
    CREATE TABLE reminders_next (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stop_name TEXT NOT NULL,
      route_code TEXT NOT NULL,
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
      UNIQUE (user_id, stop_name, route_code, direction_name, departs)
    );
    INSERT INTO reminders_next (
      id, user_id, stop_name, route_code, direction_name, departs, lead_minutes,
      sun, mon, tue, wed, thu, fri, sat
    )
    SELECT r.id, r.user_id, s.name, rt.code, r.direction_name, r.departs, r.lead_minutes,
           r.sun, r.mon, r.tue, r.wed, r.thu, r.fri, r.sat
    FROM reminders r
    JOIN stops s ON s.id = r.stop_id
    JOIN routes rt ON rt.id = r.route_id;
    DROP TABLE reminders;
    ALTER TABLE reminders_next RENAME TO reminders;
    CREATE INDEX IF NOT EXISTS reminders_user ON reminders(user_id);
  `);
  db.exec("PRAGMA foreign_keys = ON");
}

function ensureIndexes(db: DatabaseSync): void {
  migrateReminders(db);
  const columns = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "created_at")) {
    db.exec("ALTER TABLE sessions ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS stop_times_stop_departs ON stop_times(stop_id, departs);
    CREATE INDEX IF NOT EXISTS stop_times_trip ON stop_times(trip_id);
    CREATE INDEX IF NOT EXISTS stop_times_trip_seq ON stop_times(trip_id, sequence, departs);
    CREATE INDEX IF NOT EXISTS trips_pattern ON trips(pattern_id, direction_id);
    CREATE INDEX IF NOT EXISTS directions_route ON directions(route_id);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS reminders_user ON reminders(user_id);
    CREATE INDEX IF NOT EXISTS push_user ON push_subscriptions(user_id);
  `);
}

export function databasePath(): string {
  return path.join(process.cwd(), "data", "busnow.sqlite");
}

export function getDb(): DatabaseSync {
  if (!globalDb.busnow) {
    globalDb.busnow = createDatabase(databasePath());
    globalDb.busnowSeed = SEED_VERSION;
    globalDb.busnowSchema = SCHEMA_MARK;
  } else if (globalDb.busnowSeed !== SEED_VERSION) {
    // The connection survives dev hot reloads, so a new seed must be applied to it in place.
    ensureSeedData(globalDb.busnow);
    forgetCaches(globalDb.busnow);
    globalDb.busnowSeed = SEED_VERSION;
    for (const listener of resetListeners) listener(globalDb.busnow);
  }
  if (globalDb.busnowSchema !== SCHEMA_MARK) {
    ensureIndexes(globalDb.busnow);
    globalDb.busnowSchema = SCHEMA_MARK;
  }
  return globalDb.busnow;
}

const statements = new WeakMap<DatabaseSync, Map<string, StatementSync>>();
const stopCaches = new WeakMap<DatabaseSync, { all: StopRow[]; byId: Map<number, StopRow> }>();
const hubCaches = new WeakMap<DatabaseSync, Map<number, number>>();

function forgetCaches(db: DatabaseSync): void {
  statements.delete(db);
  stopCaches.delete(db);
  hubCaches.delete(db);
}

function statement(db: DatabaseSync, sql: string): StatementSync {
  let cached = statements.get(db);
  if (!cached) {
    cached = new Map();
    statements.set(db, cached);
  }
  const ready = cached.get(sql);
  if (ready) return ready;
  const prepared = db.prepare(sql);
  cached.set(sql, prepared);
  return prepared;
}

function stopsOf(db: DatabaseSync): { all: StopRow[]; byId: Map<number, StopRow> } {
  const cached = stopCaches.get(db);
  if (cached) return cached;
  const all = statement(db, "SELECT id, name, slug FROM stops ORDER BY name").all() as StopRow[];
  const next = { all, byId: new Map(all.map((stop) => [stop.id, stop])) };
  stopCaches.set(db, next);
  return next;
}

function hubOf(db: DatabaseSync, stopId: number): number {
  let cached = hubCaches.get(db);
  if (!cached) {
    const rows = statement(
      db,
      `SELECT st.stop_id AS stopId, COUNT(DISTINCT d.route_id) AS total
       FROM stop_times st
       JOIN trips t ON t.id = st.trip_id
       JOIN directions d ON d.id = t.direction_id
       GROUP BY st.stop_id`,
    ).all() as Array<{ stopId: number; total: number }>;
    cached = new Map(rows.map((row) => [row.stopId, row.total]));
    hubCaches.set(db, cached);
  }
  return cached.get(stopId) ?? 1;
}

function departureSql(weekday: Weekday): string {
  return `WITH visits AS MATERIALIZED (
    SELECT st.id AS id, st.departs AS departs, st.sequence AS sequence, st.trip_id AS trip_id,
           t.direction_id AS directionId,
           d.name AS direction, d.position AS directionPos, p.name AS pattern,
           r.id AS routeId, r.code AS routeCode, r.slug AS routeSlug, r.kind AS kind, r.title AS title
    FROM stop_times st
    JOIN trips t ON t.id = st.trip_id
    JOIN patterns p ON p.id = t.pattern_id
    JOIN directions d ON d.id = t.direction_id
    JOIN routes r ON r.id = d.route_id
    WHERE st.stop_id = ? AND p.${weekday} = 1
  )
  SELECT v.id AS id, v.departs AS departs, v.direction AS direction, v.directionId AS directionId,
         v.directionPos AS directionPos, v.pattern AS pattern,
         v.routeId AS routeId, v.routeCode AS routeCode, v.routeSlug AS routeSlug,
         v.kind AS kind, v.title AS title, v.sequence AS sequence,
         b.firstSeq AS firstSeq, b.lastSeq AS lastSeq, o.departs AS originDeparts
  FROM visits v
  JOIN (
    SELECT s.trip_id AS trip_id, MIN(s.sequence) AS firstSeq, MAX(s.sequence) AS lastSeq
    FROM stop_times s
    WHERE s.trip_id IN (SELECT trip_id FROM visits)
    GROUP BY s.trip_id
  ) b ON b.trip_id = v.trip_id
  JOIN stop_times o ON o.trip_id = v.trip_id AND o.sequence = b.firstSeq
  ORDER BY v.departs, v.routeCode, v.directionPos`;
}

function fillPrevious(rows: DepartureQuery[]): void {
  const groups = new Map<number, DepartureQuery[]>();
  for (const row of rows) {
    const list = groups.get(row.directionId);
    if (list) list.push(row);
    else groups.set(row.directionId, [row]);
  }
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.departs.localeCompare(b.departs));
    let earlier: string | null = null;
    let index = 0;
    while (index < sorted.length) {
      let end = index + 1;
      while (end < sorted.length && sorted[end].departs === sorted[index].departs) end += 1;
      for (let cursor = index; cursor < end; cursor += 1) sorted[cursor].prevDeparts = earlier;
      earlier = sorted[index].departs;
      index = end;
    }
  }
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

function withRide(rows: DepartureQuery[], hub: number): DepartureRow[] {
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
      hubRoutes: hub,
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
  const rows = statement(db, departureSql(weekday)).all(stopId) as DepartureQuery[];
  fillPrevious(rows);
  const shaped = withRide(rows, hubOf(db, stopId));
  if (view === "card") return uniqueUpcoming(shaped, now, 6);
  if (view === "board") return boardSlice(shaped, now);
  return shaped;
}

export function findStop(db: DatabaseSync, id: number): StopRow | null {
  return stopsOf(db).byId.get(id) ?? null;
}

export function searchStops(db: DatabaseSync, query: string): StopRow[] {
  const stops = stopsOf(db).all;
  const q = query.trim().replace(/[%_]/g, "");
  if (!q) return stops;
  return stops.filter((stop) => stop.name.includes(q));
}

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { weekdayOf } from "./schedule.ts";
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
`;

export function createDatabase(filename: string): DatabaseSync {
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(SCHEMA);
  ensureSeedData(db);
  return db;
}

const globalDb = globalThis as unknown as { busnow?: DatabaseSync; busnowSeed?: string };

export function databasePath(): string {
  return path.join(process.cwd(), "data", "busnow.sqlite");
}

export function getDb(): DatabaseSync {
  if (!globalDb.busnow) {
    globalDb.busnow = createDatabase(databasePath());
    globalDb.busnowSeed = SEED_VERSION;
  } else if (globalDb.busnowSeed !== SEED_VERSION) {
    // The connection survives dev hot reloads, so a new seed must be applied to it in place.
    ensureSeedData(globalDb.busnow);
    globalDb.busnowSeed = SEED_VERSION;
  }
  return globalDb.busnow;
}

export function departuresForStop(db: DatabaseSync, stopId: number, isoDate: string): DepartureRow[] {
  const weekday = weekdayOf(isoDate);
  return db
    .prepare(
      `SELECT st.id AS id, st.departs AS departs, d.name AS direction, d.position AS directionPos, p.name AS pattern,
              r.id AS routeId, r.code AS routeCode, r.slug AS routeSlug, r.kind AS kind, r.title AS title
       FROM stop_times st
       JOIN trips t ON t.id = st.trip_id
       JOIN patterns p ON p.id = t.pattern_id
       JOIN directions d ON d.id = t.direction_id
       JOIN routes r ON r.id = d.route_id
       WHERE st.stop_id = ? AND p.${weekday} = 1
       ORDER BY st.departs, r.code, d.position`,
    )
    .all(stopId) as DepartureRow[];
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

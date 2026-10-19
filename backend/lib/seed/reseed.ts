import type { DatabaseSync } from "node:sqlite";
import { seedZippyNetwork } from "./zippy.ts";

export const SEED_VERSION = "2026-10-19-zippy-2";

const SCHEMA_META = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function ensureMetaTable(db: DatabaseSync): void {
  db.exec(SCHEMA_META);
}

export function clearTimetable(db: DatabaseSync): void {
  db.exec(`
    DELETE FROM reminder_logs;
    DELETE FROM reminders;
    DELETE FROM stop_times;
    DELETE FROM trips;
    DELETE FROM directions;
    DELETE FROM routes;
    DELETE FROM stops;
    DELETE FROM patterns;
  `);
}

export function reseedTimetable(db: DatabaseSync): void {
  ensureMetaTable(db);
  clearTimetable(db);
  seedNetwork(db);
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_version', ?)").run(SEED_VERSION);
}

export function seedNetwork(db: DatabaseSync): void {
  db.exec("BEGIN");
  try {
    seedZippyNetwork(db);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function ensureSeedData(db: DatabaseSync): void {
  ensureMetaTable(db);
  const row = db.prepare("SELECT value FROM meta WHERE key = 'seed_version'").get() as { value: string } | undefined;
  if (row?.value === SEED_VERSION) return;
  reseedTimetable(db);
}

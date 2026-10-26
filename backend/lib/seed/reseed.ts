import type { DatabaseSync } from "node:sqlite";
import { WEEKDAYS } from "../schedule.ts";
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
    DELETE FROM stop_times;
    DELETE FROM trips;
    DELETE FROM directions;
    DELETE FROM routes;
    DELETE FROM stops;
    DELETE FROM patterns;
  `);
}

/** Point saved reminders at the freshly seeded trips. A missing stop is dropped; a missing time stays quiet. */
export function reattachReminders(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(reminders)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "stop_name")) return;
  db.prepare(
    `DELETE FROM reminders
     WHERE NOT EXISTS (SELECT 1 FROM stops s WHERE s.name = reminders.stop_name)`,
  ).run();
  for (const day of WEEKDAYS) {
    db.prepare(
      `UPDATE reminders
       SET ${day} = COALESCE((
         SELECT p.${day}
         FROM stop_times st
         JOIN stops s ON s.id = st.stop_id
         JOIN trips t ON t.id = st.trip_id
         JOIN patterns p ON p.id = t.pattern_id
         JOIN directions d ON d.id = t.direction_id
         JOIN routes rt ON rt.id = d.route_id
         WHERE s.name = reminders.stop_name
           AND rt.code = reminders.route_code
           AND d.name = reminders.direction_name
           AND st.departs = reminders.departs
         LIMIT 1
       ), 0)`,
    ).run();
  }
}

export function reseedTimetable(db: DatabaseSync): void {
  ensureMetaTable(db);
  clearTimetable(db);
  seedNetwork(db);
  reattachReminders(db);
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

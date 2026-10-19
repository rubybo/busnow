import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SEED_VERSION, ensureMetaTable, reseedTimetable } from "../lib/seed/reseed.ts";

const SCHEMA = `PRAGMA foreign_keys = ON;`;

function databasePath(): string {
  return path.join(process.cwd(), "data", "busnow.sqlite");
}

function needsReseed(db: DatabaseSync): boolean {
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'seed_version'").get() as { value: string } | undefined;
    return row?.value !== SEED_VERSION;
  } catch {
    return true;
  }
}

const file = databasePath();
mkdirSync(path.dirname(file), { recursive: true });
const db = new DatabaseSync(file);
db.exec(SCHEMA);
ensureMetaTable(db);

if (needsReseed(db)) {
  reseedTimetable(db);
  console.log(`[busnow] database seeded (${SEED_VERSION})`);
} else {
  console.log(`[busnow] database up to date (${SEED_VERSION})`);
}

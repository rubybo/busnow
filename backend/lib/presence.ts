import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { hashToken } from "./crypto.ts";
import { minskClock, TIMEZONE } from "./schedule.ts";

/** A visitor stays online until this long after the last check-in. */
export const ONLINE_MS = 2 * 60 * 1000;
export const VISITOR_COOKIE = "busnow_visitor";
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 400;

const KEEP_DAYS = 14;

export type OnlineStatus = {
  date: string;
  timezone: typeof TIMEZONE;
  visitors: number;
  online: number;
};

const ready = new WeakSet<DatabaseSync>();

function ensure(db: DatabaseSync): void {
  if (ready.has(db)) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS presence (
      visitor_hash TEXT NOT NULL,
      day TEXT NOT NULL,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (visitor_hash, day)
    );
    CREATE INDEX IF NOT EXISTS presence_day_seen ON presence(day, last_seen);
  `);
  ready.add(db);
}

export function newVisitorToken(): string {
  return randomBytes(32).toString("hex");
}

export function validVisitorToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function dayShift(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const stamp = new Date(Date.UTC(year, month - 1, day));
  stamp.setUTCDate(stamp.getUTCDate() + days);
  return stamp.toISOString().slice(0, 10);
}

function count(db: DatabaseSync, sql: string, param: string | number): number {
  const row = db.prepare(sql).get(param) as { n: number | bigint } | undefined;
  return Number(row?.n ?? 0);
}

export function onlineStatus(db: DatabaseSync, now = new Date()): OnlineStatus {
  ensure(db);
  const date = minskClock(now).date;
  return {
    date,
    timezone: TIMEZONE,
    visitors: count(db, "SELECT COUNT(*) AS n FROM presence WHERE day = ?", date),
    online: count(db, "SELECT COUNT(*) AS n FROM presence WHERE last_seen >= ?", now.getTime() - ONLINE_MS),
  };
}

/** Records one browser for today. The same token on the same day counts once. */
export function touchVisitor(db: DatabaseSync, token: string, now = new Date()): OnlineStatus {
  ensure(db);
  const day = minskClock(now).date;
  db.prepare(
    `INSERT INTO presence (visitor_hash, day, last_seen) VALUES (?, ?, ?)
     ON CONFLICT(visitor_hash, day) DO UPDATE SET last_seen = MAX(presence.last_seen, excluded.last_seen)`,
  ).run(hashToken(token), day, now.getTime());
  db.prepare("DELETE FROM presence WHERE day < ?").run(dayShift(day, -KEEP_DAYS));
  return onlineStatus(db, now);
}

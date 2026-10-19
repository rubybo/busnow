import type { DatabaseSync } from "node:sqlite";
import { hashToken } from "./crypto.ts";
import { findStop, type StopRow } from "./db.ts";
import { HttpError } from "./http.ts";
import { isReminderDue, minskClock } from "./schedule.ts";

export type ReminderView = {
  id: number;
  stopId: number;
  stopName: string;
  routeCode: string;
  direction: string;
  departs: string;
  leadMinutes: number;
};

export type UserView = {
  id: number;
  email: string;
  morningStop: StopRow | null;
  eveningStop: StopRow | null;
  reminders: ReminderView[];
};

type UserRecord = { id: number; email: string; password_hash: string };

export function findUserByEmail(db: DatabaseSync, email: string): UserRecord | null {
  return (
    (db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email) as UserRecord | undefined) ??
    null
  );
}

export function createUser(db: DatabaseSync, email: string, passwordHash: string): number {
  const created = new Date().toISOString();
  const result = db.prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)").run(
    email,
    passwordHash,
    created,
  );
  const id = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO profiles (user_id) VALUES (?)").run(id);
  return id;
}

export function saveSession(db: DatabaseSync, userId: number, tokenHash: string): void {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, userId, expires);
}

export function deleteSession(db: DatabaseSync, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function userFromToken(db: DatabaseSync, token: string | null): UserView | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id AS id FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), new Date().toISOString()) as { id: number } | undefined;
  if (!row) return null;
  return userView(db, row.id);
}

export function requireUser(db: DatabaseSync, token: string | null): UserView {
  const user = userFromToken(db, token);
  if (!user) throw new HttpError(401, "Нужно войти");
  return user;
}

export function userView(db: DatabaseSync, id: number): UserView {
  const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(id) as { id: number; email: string };
  const profile = db
    .prepare("SELECT morning_stop_id, evening_stop_id FROM profiles WHERE user_id = ?")
    .get(id) as { morning_stop_id: number | null; evening_stop_id: number | null };
  return {
    id: user.id,
    email: user.email,
    morningStop: profile.morning_stop_id ? findStop(db, profile.morning_stop_id) : null,
    eveningStop: profile.evening_stop_id ? findStop(db, profile.evening_stop_id) : null,
    reminders: listReminders(db, id),
  };
}

export function setStops(
  db: DatabaseSync,
  userId: number,
  patch: { morningStop?: number | null; eveningStop?: number | null },
): void {
  if (patch.morningStop) assertStop(db, patch.morningStop);
  if (patch.eveningStop) assertStop(db, patch.eveningStop);
  if ("morningStop" in patch) {
    db.prepare("UPDATE profiles SET morning_stop_id = ? WHERE user_id = ?").run(patch.morningStop ?? null, userId);
  }
  if ("eveningStop" in patch) {
    db.prepare("UPDATE profiles SET evening_stop_id = ? WHERE user_id = ?").run(patch.eveningStop ?? null, userId);
  }
}

function assertStop(db: DatabaseSync, id: number): void {
  if (!findStop(db, id)) throw new HttpError(400, "Остановка не найдена");
}

export function listReminders(db: DatabaseSync, userId: number): ReminderView[] {
  return db
    .prepare(
      `SELECT r.id AS id, r.stop_id AS stopId, s.name AS stopName, rt.code AS routeCode, r.direction_name AS direction,
              r.departs AS departs, r.lead_minutes AS leadMinutes
       FROM reminders r
       JOIN stops s ON s.id = r.stop_id
       JOIN routes rt ON rt.id = r.route_id
       WHERE r.user_id = ?
       ORDER BY r.departs`,
    )
    .all(userId) as ReminderView[];
}

type ReminderSource = {
  stop_id: number;
  route_id: number;
  direction_name: string;
  departs: string;
  sun: number;
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
};

export function addReminder(db: DatabaseSync, userId: number, stopTimeId: number): number {
  const source = db
    .prepare(
      `SELECT st.stop_id AS stop_id, d.route_id AS route_id, d.name AS direction_name, st.departs AS departs,
              p.sun AS sun, p.mon AS mon, p.tue AS tue, p.wed AS wed, p.thu AS thu, p.fri AS fri, p.sat AS sat
       FROM stop_times st
       JOIN trips t ON t.id = st.trip_id
       JOIN patterns p ON p.id = t.pattern_id
       JOIN directions d ON d.id = t.direction_id
       WHERE st.id = ?`,
    )
    .get(stopTimeId) as ReminderSource | undefined;
  if (!source) throw new HttpError(404, "Рейс не найден");
  const existing = db
    .prepare(
      `SELECT id FROM reminders
       WHERE user_id = ? AND stop_id = ? AND route_id = ? AND direction_name = ? AND departs = ?`,
    )
    .get(userId, source.stop_id, source.route_id, source.direction_name, source.departs) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db
    .prepare(
      `INSERT INTO reminders (
         user_id, stop_id, route_id, direction_name, departs, lead_minutes,
         sun, mon, tue, wed, thu, fri, sat
       ) VALUES (?, ?, ?, ?, ?, 10, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      source.stop_id,
      source.route_id,
      source.direction_name,
      source.departs,
      source.sun,
      source.mon,
      source.tue,
      source.wed,
      source.thu,
      source.fri,
      source.sat,
    );
  return Number(result.lastInsertRowid);
}

export function deleteReminder(db: DatabaseSync, userId: number, reminderId: number): void {
  const result = db.prepare("DELETE FROM reminders WHERE id = ? AND user_id = ?").run(reminderId, userId);
  if (result.changes === 0) throw new HttpError(404, "Напоминание не найдено");
}

export type DueReminder = ReminderView & { id: number; endpoint: string; p256dh: string; auth: string };

export function dueReminders(db: DatabaseSync, now = new Date()): DueReminder[] {
  const clock = minskClock(now);
  const rows = db
    .prepare(
      `SELECT r.id AS id, r.stop_id AS stopId, s.name AS stopName, rt.code AS routeCode, r.direction_name AS direction,
              r.departs AS departs, r.lead_minutes AS leadMinutes, r.${clock.weekday} AS runs,
              p.endpoint AS endpoint, p.p256dh AS p256dh, p.auth AS auth
       FROM reminders r
       JOIN stops s ON s.id = r.stop_id
       JOIN routes rt ON rt.id = r.route_id
       JOIN push_subscriptions p ON p.user_id = r.user_id
       WHERE NOT EXISTS (
         SELECT 1 FROM reminder_logs l WHERE l.reminder_id = r.id AND l.sent_on = ?
       )`,
    )
    .all(clock.date) as Array<DueReminder & { runs: number }>;
  return rows.filter((row) => row.runs === 1 && isReminderDue(clock.minutes, row.departs, row.leadMinutes));
}

export function markReminderSent(db: DatabaseSync, reminderId: number, sentOn: string): void {
  db.prepare("INSERT OR IGNORE INTO reminder_logs (reminder_id, sent_on) VALUES (?, ?)").run(reminderId, sentOn);
}

export function savePush(db: DatabaseSync, userId: number, subscription: { endpoint: string; p256dh: string; auth: string }): void {
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).run(userId, subscription.endpoint, subscription.p256dh, subscription.auth);
}

export function deletePush(db: DatabaseSync, userId: number, endpoint: string): void {
  db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(userId, endpoint);
}

export type RouteListItem = {
  id: number;
  code: string;
  slug: string;
  kind: string;
  title: string;
  note: string;
  hasTimes: boolean;
};

export function listRoutes(db: DatabaseSync): RouteListItem[] {
  return db
    .prepare(
      `SELECT r.id AS id, r.code AS code, r.slug AS slug, r.kind AS kind, r.title AS title, r.note AS note,
              EXISTS(SELECT 1 FROM directions d WHERE d.route_id = r.id) AS hasTimes
       FROM routes r
       ORDER BY r.kind, r.code`,
    )
    .all() as RouteListItem[];
}

export function routeDetail(db: DatabaseSync, slug: string) {
  const route = db
    .prepare("SELECT id, code, slug, kind, title, source_url AS sourceUrl, note FROM routes WHERE slug = ?")
    .get(slug) as
    | { id: number; code: string; slug: string; kind: string; title: string; sourceUrl: string; note: string }
    | undefined;
  if (!route) return null;
  const rows = db
    .prepare(
      `SELECT d.name AS direction, d.position AS position, p.name AS pattern, s.name AS stop,
              st.departs AS departs, st.sequence AS sequence, t.id AS tripId
       FROM directions d
       JOIN trips t ON t.direction_id = d.id
       JOIN patterns p ON p.id = t.pattern_id
       JOIN stop_times st ON st.trip_id = t.id
       JOIN stops s ON s.id = st.stop_id
       WHERE d.route_id = ?
       ORDER BY d.position, p.id, t.id, st.sequence`,
    )
    .all(route.id) as Array<{
    direction: string;
    position: number;
    pattern: string;
    stop: string;
    departs: string;
    sequence: number;
    tripId: number;
  }>;
  const directions: Array<{ name: string; patterns: Array<{ name: string; stops: Array<{ name: string; times: string[] }> }> }> = [];
  for (const row of rows) {
    let direction = directions.find((item) => item.name === row.direction);
    if (!direction) {
      direction = { name: row.direction, patterns: [] };
      directions.push(direction);
    }
    let pattern = direction.patterns.find((item) => item.name === row.pattern);
    if (!pattern) {
      pattern = { name: row.pattern, stops: [] };
      direction.patterns.push(pattern);
    }
    let stop = pattern.stops.find((item) => item.name === row.stop);
    if (!stop) {
      stop = { name: row.stop, times: [] };
      pattern.stops.push(stop);
    }
    stop.times.push(row.departs);
  }
  return { route, directions };
}

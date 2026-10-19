import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, departuresForStop, searchStops } from "./db.ts";
import { isReminderDue, minskClock, weekdayOf } from "./schedule.ts";
import { hashPassword } from "./crypto.ts";
import { addReminder, createUser, dueReminders, markReminderSent } from "./users.ts";

test("weekday and reminder window use Minsk time", () => {
  assert.equal(weekdayOf("2026-10-19"), "mon");
  assert.equal(weekdayOf("2026-10-18"), "sun");
  const morning = minskClock(new Date("2026-10-19T04:05:00.000Z"));
  assert.equal(morning.date, "2026-10-19");
  assert.equal(morning.minutes, 7 * 60 + 5);
  assert.equal(isReminderDue(morning.minutes, "07:15", 10), true);
  assert.equal(isReminderDue(morning.minutes, "07:16", 10), false);
  assert.equal(isReminderDue(7 * 60 + 6, "07:15", 10), true);
  assert.equal(isReminderDue(7 * 60 + 7, "07:15", 10), false);
});

test("seeded stop board follows the published weekday and weekend columns", () => {
  const db = createDatabase(":memory:");
  const stops = searchStops(db, "Подкастельцы");
  const stop = stops.find((item) => item.name === "Подкастельцы");
  assert.ok(stop);
  const monday = departuresForStop(db, stop.id, "2026-10-19").map((row) => row.departs);
  const sunday = departuresForStop(db, stop.id, "2026-10-18").map((row) => row.departs);
  assert.equal(monday[0], "08:44");
  assert.equal(monday.includes("08:32"), false);
  assert.equal(sunday[0], "08:32");
  assert.equal(sunday.includes("08:44"), false);
  const micro = searchStops(db, "9-й").find((item) => item.slug === "micro9");
  assert.ok(micro);
  const school = departuresForStop(db, micro.id, "2026-10-19");
  assert.deepEqual(school.map((row) => row.departs), ["07:15", "07:48", "08:21"]);
  assert.equal(departuresForStop(db, micro.id, "2026-10-18").length, 0);
});

test("a reminder is due once per day and only on the route's days", () => {
  const db = createDatabase(":memory:");
  const userId = createUser(db, "a@example.com", hashPassword("password1"));
  const monday = departuresForStop(db, searchStops(db, "Подкастельцы")[0].id, "2026-10-19");
  const first = monday.find((row) => row.departs === "08:44");
  assert.ok(first);
  addReminder(db, userId, first.id);
  db.prepare(
    "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)",
  ).run(userId, "https://push.example/1", "key", "auth");
  const due = dueReminders(db, new Date("2026-10-19T05:34:00.000Z"));
  assert.equal(due.length, 1);
  assert.equal(due[0].routeCode, "4");
  markReminderSent(db, due[0].id, "2026-10-19");
  assert.equal(dueReminders(db, new Date("2026-10-19T05:34:30.000Z")).length, 0);
  assert.equal(dueReminders(db, new Date("2026-10-18T05:34:00.000Z")).length, 0);
});

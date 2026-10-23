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
  assert.equal(isReminderDue(7 * 60 + 9, "07:15", 10), true);
  assert.equal(isReminderDue(7 * 60 + 10, "07:15", 10), false);
});

test("route 5 has both directions from ATP tables", () => {
  const db = createDatabase(":memory:");
  const avtovokzal = searchStops(db, "Автовокзал Новополоцк")[0];
  const shveynaya = searchStops(db, "Швейная")[0];
  assert.ok(avtovokzal);
  assert.ok(shveynaya);
  const mondayFromNp = departuresForStop(db, avtovokzal.id, "2026-10-19").filter((row) => row.routeCode === "5");
  const mondayFromPl = departuresForStop(db, shveynaya.id, "2026-10-19").filter((row) => row.routeCode === "5");
  assert.ok(mondayFromNp.some((row) => row.direction.startsWith("Новополоцк → Полоцк")));
  assert.ok(mondayFromPl.some((row) => row.direction.startsWith("Полоцк → Новополоцк")));
});

test("seeded stop board follows the published weekday and weekend columns", () => {
  const db = createDatabase(":memory:");
  const stops = searchStops(db, "Подкастельцы");
  const stop = stops.find((item) => item.name === "ДС Подкастельцы");
  assert.ok(stop);
  const monday = departuresForStop(db, stop.id, "2026-10-19")
    .filter((row) => row.routeCode === "4")
    .map((row) => row.departs);
  const sunday = departuresForStop(db, stop.id, "2026-10-18")
    .filter((row) => row.routeCode === "4")
    .map((row) => row.departs);
  assert.equal(monday[0], "08:44");
  assert.equal(monday.includes("08:32"), false);
  assert.equal(sunday[0], "08:32");
  assert.equal(sunday.includes("08:44"), false);
  const vosmoy = searchStops(db, "Восьмой микрорайон")[0];
  assert.ok(vosmoy);
  const vosmoyMonday = departuresForStop(db, vosmoy.id, "2026-10-19").filter((row) => row.routeCode === "4");
  assert.equal(vosmoyMonday[0]?.departs, "08:45");
});

test("card and board views keep the same trips as the full day", () => {
  const db = createDatabase(":memory:");
  const stop = searchStops(db, "ДС Подкастельцы")[0];
  assert.ok(stop);
  const full = departuresForStop(db, stop.id, "2026-10-19");
  const now = "10:00";
  const seen = new Set<string>();
  const expectedCard = [];
  for (const row of full) {
    if (row.departs < now) continue;
    const key = `${row.routeId}:${row.directionPos}:${row.departs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    expectedCard.push(row);
    if (expectedCard.length === 6) break;
  }
  assert.deepEqual(departuresForStop(db, stop.id, "2026-10-19", "card", now), expectedCard);

  const groups = new Map<string, { future: typeof full; past: (typeof full)[number] | null }>();
  for (const row of full) {
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
  const expectedBoard = [];
  for (const group of groups.values()) {
    if (group.future.length) expectedBoard.push(...group.future);
    else if (group.past) expectedBoard.push(group.past);
  }
  expectedBoard.sort((a, b) => a.departs.localeCompare(b.departs) || a.routeCode.localeCompare(b.routeCode, "ru"));
  assert.deepEqual(departuresForStop(db, stop.id, "2026-10-19", "board", now), expectedBoard);
});

test("each departure carries its place on the route and the gap since the previous bus", () => {
  const db = createDatabase(":memory:");
  const stop = searchStops(db, "ДС Подкастельцы").find((item) => item.name === "ДС Подкастельцы");
  assert.ok(stop);
  const rows = departuresForStop(db, stop.id, "2026-10-19").filter((row) => row.routeCode === "4");
  assert.ok(rows.length > 2);
  for (const row of rows) {
    assert.ok(row.stopFrac >= 0 && row.stopFrac <= 1);
    assert.ok(row.headwayMin >= 5 && row.headwayMin <= 90);
    assert.ok(row.rideMin >= 0 && row.rideMin <= 90);
    assert.ok(row.atOrigin === 0 || row.atOrigin === 1);
    assert.ok(row.atTerminus === 0 || row.atTerminus === 1);
    assert.ok(row.hubRoutes >= 1);
  }
  assert.equal(rows[0]?.headwayMin, 45);
  assert.ok(rows.slice(1).some((row) => row.headwayMin < 45));
});

test("a reminder is due once per day and only on the route's days", () => {
  const db = createDatabase(":memory:");
  const userId = createUser(db, "a@example.com", hashPassword("password1"));
  const podk = searchStops(db, "ДС Подкастельцы")[0];
  assert.ok(podk);
  const monday = departuresForStop(db, podk.id, "2026-10-19");
  const first = monday.find((row) => row.routeCode === "4" && row.departs === "08:44");
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

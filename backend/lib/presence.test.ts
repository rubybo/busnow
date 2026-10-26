import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "./db.ts";
import { ONLINE_MS, onlineStatus, touchVisitor } from "./presence.ts";

test("a visitor counts once per day and drops off the live count", () => {
  const db = createDatabase(":memory:");
  const noon = new Date("2026-10-24T12:00:00+03:00");
  const empty = onlineStatus(db, noon);
  assert.deepEqual(empty, { date: "2026-10-24", timezone: "Europe/Minsk", visitors: 0, online: 0 });

  const first = touchVisitor(db, "a".repeat(64), noon);
  assert.equal(first.visitors, 1);
  assert.equal(first.online, 1);
  const again = touchVisitor(db, "a".repeat(64), new Date(noon.getTime() + 1000));
  assert.equal(again.visitors, 1);
  assert.equal(again.online, 1);

  touchVisitor(db, "b".repeat(64), noon);
  const both = onlineStatus(db, noon);
  assert.equal(both.visitors, 2);
  assert.equal(both.online, 2);

  const later = onlineStatus(db, new Date(noon.getTime() + 1000 + ONLINE_MS + 1));
  assert.equal(later.date, "2026-10-24");
  assert.equal(later.visitors, 2);
  assert.equal(later.online, 0);

  const nextDay = touchVisitor(db, "a".repeat(64), new Date("2026-10-25T09:00:00+03:00"));
  assert.equal(nextDay.date, "2026-10-25");
  assert.equal(nextDay.visitors, 1);
  assert.equal(nextDay.online, 1);
});

test("someone seen inside the window is online and old days are dropped", () => {
  const db = createDatabase(":memory:");
  const now = new Date("2026-10-24T12:00:00+03:00");
  touchVisitor(db, "c".repeat(64), new Date("2026-09-01T12:00:00+03:00"));
  touchVisitor(db, "d".repeat(64), new Date(now.getTime() - ONLINE_MS));
  touchVisitor(db, "e".repeat(64), new Date(now.getTime() - ONLINE_MS - 1));
  const status = onlineStatus(db, now);
  assert.equal(status.visitors, 2);
  assert.equal(status.online, 1);
  const days = db.prepare("SELECT day FROM presence ORDER BY day").all() as Array<{ day: string }>;
  assert.deepEqual(
    days.map((row) => row.day),
    ["2026-10-24", "2026-10-24"],
  );
});

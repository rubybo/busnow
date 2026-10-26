import assert from "node:assert/strict";
import test from "node:test";
import type { RouteDetail } from "./api.ts";
import { minskDateIso, reminderAt } from "./clock.ts";
import { departuresFromRoutes } from "./offline-board.ts";
import { parseProfile } from "./profile-store.ts";
import { scheduledReminders } from "./sw-reminders.ts";

const monday = new Date("2026-10-26T09:00:00.000Z");

function route(): RouteDetail {
  return {
    route: {
      id: 1,
      code: "15",
      slug: "15",
      kind: "bus",
      title: "Новополоцк — Ксты",
      sourceUrl: "",
      note: "",
    },
    directions: [
      {
        name: "Новополоцк → Ксты",
        stops: [],
        patterns: [
          {
            name: "ежедневно",
            stops: [{ id: 18, name: "Василевцы", slug: "vasilevtsy", times: ["14:13", "08:00"] }],
          },
          {
            name: "воскресенье",
            stops: [{ id: 18, name: "Василевцы", slug: "vasilevtsy", times: ["23:40"] }],
          },
        ],
      },
    ],
  };
}

test("табло на понедельник собирается из маршрута, воскресный рейс не входит", () => {
  const board = departuresFromRoutes(18, [route()], [], monday);
  assert.ok(board);
  assert.equal(board.date, minskDateIso(monday));
  assert.deepEqual(
    board.departures.map((row) => row.departs),
    ["08:00", "14:13"],
  );
  assert.equal(board.stop.name, "Василевцы");
});

test("напоминание ставится на минское время за 10 минут", () => {
  const at = reminderAt("14:13", 10, monday);
  assert.equal(at, Date.parse("2026-10-26T11:03:00.000Z"));
  assert.equal(reminderAt("08:00", 10, monday), null);
});

test("профиль без почты не читается", () => {
  assert.equal(parseProfile(null), null);
  assert.equal(parseProfile('{"email":""}'), null);
  const profile = parseProfile(
    '{"email":"a@b.c","morning":18,"evening":null,"morningName":"Василевцы","reminders":[{"id":1},{"id":2,"stopId":18,"stopName":"Василевцы","routeCode":"15","direction":"Ксты","departs":"14:13","leadMinutes":10}]}',
  );
  assert.equal(profile?.email, "a@b.c");
  assert.equal(profile?.morning, 18);
  assert.equal(profile?.reminders.length, 1);
  assert.equal(profile?.reminders[0].departs, "14:13");
});

test("в воркер уходит только будущее напоминание", () => {
  const items = scheduledReminders(
    [
      { id: 1, stopId: 18, stopName: "Василевцы", routeCode: "15", direction: "Ксты", departs: "14:13", leadMinutes: 10 },
      { id: 2, stopId: 18, stopName: "Василевцы", routeCode: "15", direction: "Ксты", departs: "08:00", leadMinutes: 10 },
    ],
    monday,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].tag, "reminder-1-2026-10-26");
  assert.match(items[0].body, /14:13/);
});

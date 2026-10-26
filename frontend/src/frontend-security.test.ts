import assert from "node:assert/strict";
import test from "node:test";
import { appPath } from "./app-path.ts";
import { parseProfile } from "./profile-store.ts";

test("router path stays on this site", () => {
  assert.equal(appPath("/routes/22", "?dir=0", ""), "/routes/22?dir=0");
  assert.equal(appPath("//evil.example"), null);
  assert.equal(appPath("/\\evil.example"), null);
  assert.equal(appPath("https://evil.example"), null);
});

test("stored profile drops broken reminders and keeps a real one", () => {
  const raw = JSON.stringify({
    email: "a@example.com",
    morning: 18,
    evening: "nope",
    morningName: "Василевцы",
    eveningName: null,
    reminders: [
      { id: 4, stopId: 18, stopName: "Василевцы", routeCode: "15", direction: "Ксты", departs: "14:13", leadMinutes: 10 },
      { id: 5, stopId: 1, stopName: "x", routeCode: "1", direction: "y", departs: "99:99", leadMinutes: 10 },
      { id: "bad" },
    ],
  });
  const profile = parseProfile(raw);
  assert.ok(profile);
  assert.equal(profile.email, "a@example.com");
  assert.equal(profile.morning, 18);
  assert.equal(profile.evening, null);
  assert.equal(profile.reminders.length, 1);
  assert.equal(profile.reminders[0].departs, "14:13");
  assert.equal(parseProfile(JSON.stringify({ email: "", morning: 1 })), null);
});

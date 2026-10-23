import assert from "node:assert/strict";
import test from "node:test";
import { delayCopy, describeFill, featuresOf, forecastTrip, modelChecks, predict, scoreFeatures, tripFlags, type Sky } from "./forecast.ts";

function sky(base: Pick<Sky, "temp" | "precip" | "snow" | "wind" | "code">, extra: Partial<Sky> = {}): Sky {
  return { ...base, precip3h: base.precip, snow3h: base.snow, tempVsYdayMorn: 0, firstFrost: 0, ...extra };
}

const winter = sky({ temp: -4, precip: 0.4, snow: 0.2, wind: 4, code: 71 });
const dry = sky({ temp: 8, precip: 0, snow: 0, wind: 2, code: 1 });
const rain = sky({ temp: 3, precip: 2, snow: 0, wind: 6, code: 63 });

test("the served network matches the PyTorch export", () => {
  for (const check of modelChecks()) {
    const built = featuresOf({
      date: check.input.date,
      minute: check.input.minute,
      sky: {
        temp: check.input.temp,
        precip: check.input.precip,
        snow: check.input.snow,
        wind: check.input.wind,
        code: check.input.code,
        precip3h: check.input.precip3h,
        snow3h: check.input.snow3h,
        tempVsYdayMorn: check.input.tempVsYdayMorn,
        firstFrost: check.input.firstFrost,
      },
      toPlant: check.input.toPlant,
      fromPlant: check.input.fromPlant,
      bridge: check.input.bridge,
      minibus: check.input.minibus,
      stopFrac: check.input.stopFrac,
      headwayMin: check.input.headwayMin,
      rideMin: check.input.rideMin,
      atOrigin: check.input.atOrigin,
      atTerminus: check.input.atTerminus,
      hubRoutes: check.input.hubRoutes,
    });
    assert.equal(built.length, check.features.length);
    built.forEach((value, index) => assert.ok(Math.abs(value - check.features[index]) < 1e-6, `feature ${index}`));
    const score = scoreFeatures(check.features);
    assert.ok(Math.abs(score.occupancy - check.occupancy) < 0.05);
    assert.ok(Math.abs(score.delay - check.delay) < 0.05);
    assert.ok(Math.abs(score.delayP90 - check.delayP90) < 0.05);
    assert.ok(score.delayP90 >= score.delay - 1e-6);
  }
});

test("a plant commute is fuller than a Sunday midday bus", () => {
  const plant = predict({
    date: "2026-10-19",
    minute: 7 * 60 + 20,
    sky: winter,
    toPlant: 1,
    fromPlant: 0,
    bridge: 0,
    minibus: 0,
  });
  const sunday = predict({
    date: "2026-10-18",
    minute: 12 * 60,
    sky: dry,
    toPlant: 0,
    fromPlant: 0,
    bridge: 0,
    minibus: 0,
  });
  assert.ok(plant.occupancy >= sunday.occupancy + 25);
  assert.notEqual(plant.level, "free");
  assert.equal(sunday.level, "free");
  assert.equal(sunday.label, "Можно сесть");
});

test("term-time morning is fuller than the July holidays", () => {
  const term = predict({
    date: "2026-10-14",
    minute: 8 * 60 + 15,
    sky: dry,
    toPlant: 0,
    fromPlant: 0,
    bridge: 0,
    minibus: 0,
  });
  const july = predict({
    date: "2026-07-15",
    minute: 8 * 60 + 15,
    sky: dry,
    toPlant: 0,
    fromPlant: 0,
    bridge: 0,
    minibus: 0,
  });
  assert.ok(term.occupancy > july.occupancy + 8);
});

test("the bridge at 17:30 in the rain is later than a dry midday bus", () => {
  const bridge = predict({
    date: "2026-10-16",
    minute: 17 * 60 + 30,
    sky: rain,
    toPlant: 0,
    fromPlant: 0,
    bridge: 1,
    minibus: 0,
  });
  const midday = predict({
    date: "2026-10-14",
    minute: 11 * 60,
    sky: dry,
    toPlant: 0,
    fromPlant: 0,
    bridge: 0,
    minibus: 0,
  });
  assert.ok(bridge.delayMin >= midday.delayMin + 3);
  assert.ok(bridge.delayP90 >= bridge.delayMin + 2);
  assert.ok(bridge.delayP90 - bridge.delayMin > midday.delayP90 - midday.delayMin);
  assert.match(bridge.hint, /в плохой день до \d+ минут/);
  assert.match(bridge.hint, /Ожидайте в \d{2}:\d{2}$/);
  assert.equal(midday.hint, "Обычно приходит по расписанию");
});

test("leaving the plant at shift end is a full bus and a late one", () => {
  const trip = forecastTrip({
    date: "2026-10-16",
    departs: "17:30",
    routeCode: "2",
    direction: "ОАО «Нафтан» → Подкастельцы",
    stopName: "ОАО Нафтан",
    kind: "bus",
    sky: sky({ temp: 6, precip: 0, snow: 0, wind: 3, code: 2 }),
  });
  assert.notEqual(trip.level, "free");
  assert.ok(trip.delayMin >= 3);
  assert.match(trip.expected, /^\d{2}:\d{2}$/);
});

test("rain that already fell still slows the bridge", () => {
  const clear = sky({ temp: 6, precip: 0, snow: 0, wind: 3, code: 1 });
  const soaked = sky({ temp: 6, precip: 0, snow: 0, wind: 3, code: 1 }, { precip3h: 5 });
  const trip = {
    date: "2026-10-16",
    minute: 17 * 60 + 30,
    toPlant: 0,
    fromPlant: 0,
    bridge: 1,
    minibus: 0,
  };
  const dryBridge = predict({ ...trip, sky: clear });
  const wetBridge = predict({ ...trip, sky: soaked });
  assert.ok(wetBridge.delayMin >= dryBridge.delayMin + 1);
  assert.ok(wetBridge.delayP90 >= dryBridge.delayP90);
});

test("the first frost morning is fuller than the same cold hour in a long freeze", () => {
  const held = sky({ temp: -3, precip: 0, snow: 0, wind: 3, code: 0 });
  const first = sky({ temp: -3, precip: 0, snow: 0, wind: 3, code: 0 }, { tempVsYdayMorn: -10, firstFrost: 1 });
  const trip = {
    date: "2026-10-20",
    minute: 8 * 60,
    toPlant: 0,
    fromPlant: 0,
    bridge: 0,
    minibus: 0,
  };
  const later = predict({ ...trip, sky: held });
  const snap = predict({ ...trip, sky: first });
  assert.ok(snap.occupancy >= later.occupancy + 4);
  assert.ok(snap.delayMin >= later.delayMin);
});

test("a plant bus is fuller at the gate than at the first stop", () => {
  const trip = {
    date: "2026-10-19",
    minute: 7 * 60 + 20,
    sky: winter,
    toPlant: 1,
    fromPlant: 0,
    bridge: 0,
    minibus: 0,
    headwayMin: 15,
  };
  const early = predict({ ...trip, stopFrac: 0.05 });
  const gate = predict({ ...trip, stopFrac: 0.95 });
  assert.ok(gate.occupancy >= early.occupancy + 8);
});

test("a long gap fills the plant bus more than a bus that just left", () => {
  const trip = {
    date: "2026-10-19",
    minute: 7 * 60 + 20,
    sky: winter,
    toPlant: 1,
    fromPlant: 0,
    bridge: 0,
    minibus: 0,
    stopFrac: 0.8,
  };
  const tight = predict({ ...trip, headwayMin: 8 });
  const gap = predict({ ...trip, headwayMin: 45 });
  assert.ok(gap.occupancy >= tight.occupancy + 6);
});

test("a long timetable run is later than the same bridge just after it leaves", () => {
  const trip = {
    date: "2026-10-16",
    minute: 17 * 60 + 30,
    sky: rain,
    toPlant: 0,
    fromPlant: 0,
    bridge: 1,
    minibus: 0,
    stopFrac: 0.7,
    headwayMin: 20,
  };
  const hop = predict({ ...trip, rideMin: 6 });
  const polotsk = predict({ ...trip, rideMin: 55 });
  assert.ok(polotsk.delayMin >= hop.delayMin + 2);
  assert.ok(polotsk.delayP90 >= hop.delayP90);
});

test("a stop where many routes meet is fuller than a one-route stop", () => {
  const trip = {
    date: "2026-10-19",
    minute: 12 * 60 + 10,
    sky: dry,
    toPlant: 0,
    fromPlant: 0,
    bridge: 0,
    minibus: 0,
    stopFrac: 0.45,
    headwayMin: 18,
    rideMin: 14,
    atOrigin: 0,
    atTerminus: 0,
  };
  const quiet = predict({ ...trip, hubRoutes: 2 });
  const station = predict({ ...trip, hubRoutes: 15 });
  assert.ok(station.occupancy >= quiet.occupancy + 4);
});

test("the last stop of a city route is emptier than the same bus mid-way", () => {
  const trip = {
    date: "2026-10-19",
    minute: 17 * 60 + 10,
    sky: dry,
    toPlant: 0,
    fromPlant: 0,
    bridge: 0,
    minibus: 0,
    stopFrac: 0.55,
    headwayMin: 18,
    rideMin: 16,
    hubRoutes: 6,
    atOrigin: 0,
  };
  const midway = predict({ ...trip, atTerminus: 0 });
  const last = predict({ ...trip, atTerminus: 1 });
  assert.ok(last.occupancy <= midway.occupancy - 6);
});

test("the evening before Radonitsa is fuller than the Monday before", () => {
  const trip = {
    minute: 16 * 60 + 30,
    sky: dry,
    toPlant: 0,
    fromPlant: 0,
    bridge: 0,
    minibus: 0,
    stopFrac: 0.5,
    headwayMin: 20,
  };
  const ordinary = predict({ ...trip, date: "2026-04-13" });
  const eve = predict({ ...trip, date: "2026-04-20" });
  assert.ok(eve.occupancy >= ordinary.occupancy + 4);
});

test("delay copy uses the passenger sentence", () => {
  assert.equal(delayCopy(4, "14:26").hint, "Обычно этот рейс задерживается на 4 минуты. Ожидайте в 14:26");
  assert.equal(delayCopy(4, "14:26").shortHint, "ожидайте 14:26");
  assert.equal(
    delayCopy(4, "14:26", 9, "14:31").hint,
    "Обычно этот рейс задерживается на 4 минуты, в плохой день до 9 минут. Ожидайте в 14:26",
  );
  assert.equal(delayCopy(4, "14:26", 9, "14:31").shortHint, "ожидайте 14:26, до 14:31");
  assert.equal(delayCopy(1, "08:01").hint, "Обычно приходит по расписанию");
  assert.equal(
    delayCopy(1, "08:01", 6, "08:06").hint,
    "Обычно приходит по расписанию, в плохой день до 6 минут. Ожидайте в 08:06",
  );
  assert.equal(delayCopy(21, "18:00").hint, "Обычно этот рейс задерживается на 21 минуту. Ожидайте в 18:00");
  assert.equal(describeFill(20).level, "free");
  assert.equal(describeFill(55).level, "standing");
  assert.equal(describeFill(90).label, "Лучше следующий");
});

test("route and stop names pick the plant and the bridge", () => {
  const toPlant = tripFlags("2", "Подкастельцы → ОАО «Нафтан»", "Молодёжная", "bus");
  assert.equal(toPlant.toPlant, 1);
  assert.equal(toPlant.fromPlant, 0);
  const bridge = tripFlags("10", "Автовокзал → Ж/д вокзал Полоцк", "Молодёжная", "bus");
  assert.equal(bridge.bridge, 1);
  assert.equal(bridge.toPlant, 0);
  const marsh = tripFlags("10Тк", "Новополоцк → Полоцк", "Комсомольская", "minibus");
  assert.equal(marsh.minibus, 1);
  assert.equal(marsh.bridge, 1);
});

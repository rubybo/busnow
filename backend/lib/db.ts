import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { weekdayOf, type Weekday } from "./schedule.ts";

export type StopRow = { id: number; name: string; slug: string };
export type DepartureRow = {
  id: number;
  departs: string;
  direction: string;
  pattern: string;
  routeId: number;
  routeCode: string;
  routeSlug: string;
  kind: string;
  title: string;
};

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stops (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('bus', 'minibus')),
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS directions (
  id INTEGER PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS patterns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sun INTEGER NOT NULL,
  mon INTEGER NOT NULL,
  tue INTEGER NOT NULL,
  wed INTEGER NOT NULL,
  thu INTEGER NOT NULL,
  fri INTEGER NOT NULL,
  sat INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY,
  direction_id INTEGER NOT NULL REFERENCES directions(id) ON DELETE CASCADE,
  pattern_id INTEGER NOT NULL REFERENCES patterns(id)
);
CREATE TABLE IF NOT EXISTS stop_times (
  id INTEGER PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  stop_id INTEGER NOT NULL REFERENCES stops(id),
  sequence INTEGER NOT NULL,
  departs TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  morning_stop_id INTEGER REFERENCES stops(id) ON DELETE SET NULL,
  evening_stop_id INTEGER REFERENCES stops(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stop_id INTEGER NOT NULL REFERENCES stops(id),
  route_id INTEGER NOT NULL REFERENCES routes(id),
  direction_name TEXT NOT NULL,
  departs TEXT NOT NULL,
  lead_minutes INTEGER NOT NULL,
  sun INTEGER NOT NULL,
  mon INTEGER NOT NULL,
  tue INTEGER NOT NULL,
  wed INTEGER NOT NULL,
  thu INTEGER NOT NULL,
  fri INTEGER NOT NULL,
  sat INTEGER NOT NULL,
  UNIQUE (user_id, stop_id, route_id, direction_name, departs)
);
CREATE TABLE IF NOT EXISTS reminder_logs (
  reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  sent_on TEXT NOT NULL,
  PRIMARY KEY (reminder_id, sent_on)
);
CREATE INDEX IF NOT EXISTS stop_times_stop ON stop_times(stop_id);
`;

export function createDatabase(filename: string): DatabaseSync {
  if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(SCHEMA);
  seedIfEmpty(db);
  return db;
}

const globalDb = globalThis as unknown as { busnow?: DatabaseSync };

export function databasePath(): string {
  return path.join(process.cwd(), "data", "busnow.sqlite");
}

export function getDb(): DatabaseSync {
  if (!globalDb.busnow) globalDb.busnow = createDatabase(databasePath());
  return globalDb.busnow;
}

type PatternName = "weekdays" | "weekend";

const PATTERN_DAYS: Record<PatternName, Record<Weekday, number>> = {
  weekdays: { sun: 0, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0 },
  weekend: { sun: 1, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 1 },
};

type TripStop = { stop: string; departs: string };

export function seedIfEmpty(db: DatabaseSync): void {
  const count = db.prepare("SELECT COUNT(*) AS count FROM routes").get() as { count: number };
  if (count.count > 0) return;
  db.exec("BEGIN");
  try {
    const patternIds = insertPatterns(db);
    const stopId = insertStops(db);
    insertNetwork(db, patternIds, stopId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function insertPatterns(db: DatabaseSync): Record<PatternName, number> {
  const insert = db.prepare(
    `INSERT INTO patterns (name, sun, mon, tue, wed, thu, fri, sat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const ids = {} as Record<PatternName, number>;
  const labels: Record<PatternName, string> = {
    weekdays: "По рабочим дням",
    weekend: "По выходным",
  };
  for (const key of Object.keys(PATTERN_DAYS) as PatternName[]) {
    const days = PATTERN_DAYS[key];
    const result = insert.run(labels[key], days.sun, days.mon, days.tue, days.wed, days.thu, days.fri, days.sat);
    ids[key] = Number(result.lastInsertRowid);
  }
  return ids;
}

function insertStops(db: DatabaseSync): Map<string, number> {
  const insert = db.prepare("INSERT INTO stops (name, slug) VALUES (?, ?)");
  const ids = new Map<string, number>();
  for (const stop of STOPS) {
    const result = insert.run(stop.name, stop.slug);
    ids.set(stop.slug, Number(result.lastInsertRowid));
  }
  return ids;
}

function insertNetwork(
  db: DatabaseSync,
  patterns: Record<PatternName, number>,
  stops: Map<string, number>,
): void {
  const insertRoute = db.prepare(
    `INSERT INTO routes (code, slug, kind, title, source_url, note) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertDirection = db.prepare(
    `INSERT INTO directions (route_id, name, position) VALUES (?, ?, ?)`,
  );
  const insertTrip = db.prepare(`INSERT INTO trips (direction_id, pattern_id) VALUES (?, ?)`);
  const insertTime = db.prepare(
    `INSERT INTO stop_times (trip_id, stop_id, sequence, departs) VALUES (?, ?, ?, ?)`,
  );

  for (const route of ROUTES) {
    const result = insertRoute.run(route.code, route.slug, route.kind, route.title, route.sourceUrl, route.note);
    const routeId = Number(result.lastInsertRowid);
    route.directions.forEach((direction, index) => {
      const directionId = Number(insertDirection.run(routeId, direction.name, index).lastInsertRowid);
      for (const [pattern, trips] of Object.entries(direction.trips) as Array<[PatternName, TripStop[][]]>) {
        for (const trip of trips) {
          const tripId = Number(insertTrip.run(directionId, patterns[pattern]).lastInsertRowid);
          trip.forEach((call, sequence) => {
            const stop = stops.get(call.stop);
            if (!stop) throw new Error(`Unknown stop ${call.stop}`);
            insertTime.run(tripId, stop, sequence, call.departs);
          });
        }
      }
    });
  }
}

export function departuresForStop(db: DatabaseSync, stopId: number, isoDate: string): DepartureRow[] {
  const weekday = weekdayOf(isoDate);
  return db
    .prepare(
      `SELECT st.id AS id, st.departs AS departs, d.name AS direction, p.name AS pattern,
              r.id AS routeId, r.code AS routeCode, r.slug AS routeSlug, r.kind AS kind, r.title AS title
       FROM stop_times st
       JOIN trips t ON t.id = st.trip_id
       JOIN patterns p ON p.id = t.pattern_id
       JOIN directions d ON d.id = t.direction_id
       JOIN routes r ON r.id = d.route_id
       WHERE st.stop_id = ? AND p.${weekday} = 1
       ORDER BY st.departs, r.code`,
    )
    .all(stopId) as DepartureRow[];
}

const ATP = "https://atp6voat.by/gorodskie-avtobusy/";
const ROUTE4 = "https://atp6voat.by/marshrut-%E2%84%964/";
const TAXI = "http://www.vitoperator.by/raspisanie/raspisanie-marshrutnyh-taksi-novopolock";

const STOPS: Array<{ slug: string; name: string }> = [
  { slug: "podkasteltsy", name: "Подкастельцы" },
  { slug: "gaydara", name: "Гайдара" },
  { slug: "micro9", name: "9-й микрорайон" },
  { slug: "denisova", name: "ул. Денисова" },
  { slug: "kalinina", name: "ул. Калинина" },
];

function times(stop: string, values: string[]): TripStop[][] {
  return values.map((departs) => [{ stop, departs }]);
}

type DirectionSeed = {
  name: string;
  trips: Partial<Record<PatternName, TripStop[][]>>;
};

type RouteSeed = {
  code: string;
  slug: string;
  kind: "bus" | "minibus";
  title: string;
  sourceUrl: string;
  note: string;
  directions: DirectionSeed[];
};

const BUS4_WEEKDAY_FROM = [
  "08:44", "09:15", "09:37", "09:44", "10:08", "11:12", "11:26", "12:20",
  "13:00", "13:25", "13:58", "14:05", "14:40", "14:54", "15:05", "15:25",
  "17:55", "18:07", "18:23",
];
const BUS4_WEEKDAY_BACK = [
  "09:09", "09:40", "10:02", "10:09", "10:33", "11:37", "11:51", "12:45",
  "13:25", "13:50", "14:23", "14:30", "15:05", "15:09", "15:30", "15:50",
  "18:20", "18:32", "18:48",
];
const BUS4_WEEKEND_FROM = ["08:32", "09:35", "12:30", "14:40", "16:25", "16:55", "17:40", "18:10"];
const BUS4_WEEKEND_BACK = ["08:57", "10:00", "12:55", "15:05", "16:50", "17:20", "18:05", "18:35"];

const ROUTES: RouteSeed[] = [
  {
    code: "4",
    slug: "4",
    kind: "bus",
    title: "Подкастельцы — Гайдара",
    sourceUrl: ROUTE4,
    note: "Время отправления с конечных, таблица АТП №6 с 01.09.2026.",
    directions: [
      {
        name: "Подкастельцы → Гайдара",
        trips: {
          weekdays: times("podkasteltsy", BUS4_WEEKDAY_FROM),
          weekend: times("podkasteltsy", BUS4_WEEKEND_FROM),
        },
      },
      {
        name: "Гайдара → Подкастельцы",
        trips: {
          weekdays: times("gaydara", BUS4_WEEKDAY_BACK),
          weekend: times("gaydara", BUS4_WEEKEND_BACK),
        },
      },
    ],
  },
  {
    code: "4А",
    slug: "4a",
    kind: "bus",
    title: "Подкастельцы — Калинина",
    sourceUrl: ROUTE4,
    note: "В таблице АТП отправления от 9-го микрорайона, ул. Денисова и ул. Калинина. По рабочим дням, с 01.09.2026.",
    directions: [
      {
        name: "9-й микрорайон → ул. Калинина",
        trips: {
          weekdays: [
            [
              { stop: "micro9", departs: "07:15" },
              { stop: "denisova", departs: "07:25" },
              { stop: "kalinina", departs: "07:40" },
            ],
            [
              { stop: "micro9", departs: "07:48" },
              { stop: "denisova", departs: "07:58" },
              { stop: "kalinina", departs: "08:12" },
            ],
            [
              { stop: "micro9", departs: "08:21" },
              { stop: "denisova", departs: "08:31" },
              { stop: "kalinina", departs: "08:45" },
            ],
          ],
        },
      },
    ],
  },
  bare("5", "5", "bus", "Новополоцк — Полоцк через Экимань", "Стоимость проезда 1,15 рубля."),
  bare("6", "6", "bus", "Автовокзал — Боровуха", ""),
  bare("7", "7", "bus", "Подкастельцы — ТСБ через 9-ю проходную", ""),
  bare("8", "8", "bus", "Подкастельцы — БВК", ""),
  bare("9", "9", "bus", "Подкастельцы — 3-я проходная", ""),
  bare("10", "10", "bus", "Новополоцк — Полоцк через Ропно", "Стоимость проезда 1,15 рубля."),
  bare("10А", "10a", "bus", "Подкастельцы — Полоцк через Ропно", "Стоимость проезда 1,15 рубля."),
  bare("11", "11", "bus", "Подкастельцы — Слободская", "Только по рабочим дням."),
  bare("13", "13", "bus", "Ропнянская — Автовокзал", ""),
  bare("14", "14", "bus", "Ропнянская — Подкастельцы", ""),
  bare("15", "15", "bus", "Новополоцк — Ксты", "Стоимость проезда 1,15 рубля."),
  bare("17", "17", "bus", "Подкастельцы — Весовая БВК", "С 04.04.2026."),
  bare("18", "18", "bus", "Подкастельцы — Первая палатка", ""),
  bare("20", "20", "bus", "Подкастельцы — Автовокзал", ""),
  bare("20А", "20a", "bus", "Подкастельцы — Автовокзал", ""),
  bare("21", "21", "bus", "Автовокзал — Междуречье", ""),
  bare("21А", "21a", "bus", "Автовокзал — Междуречье-1", "С 01.09.2026, по рабочим дням и субботам."),
  bare("22", "22", "bus", "Подкастельцы — Белсантехмонтаж", "Только по рабочим дням."),
  bare("2Тк", "2tk", "minibus", "Подкастельцы — ОАО «Нафтан»", "Будние дни.", TAXI),
  bare("4Тк", "4tk", "minibus", "Подкастельцы — Больничный городок", "Будние дни.", TAXI),
  bare("5Тк", "5tk", "minibus", "Новополоцк — Полоцк через Экимань", "Будние дни.", TAXI),
];

function bare(
  code: string,
  slug: string,
  kind: "bus" | "minibus",
  title: string,
  note: string,
  sourceUrl = ATP,
): RouteSeed {
  return { code, slug, kind, title, sourceUrl, note, directions: [] };
}

export function findStop(db: DatabaseSync, id: number): StopRow | null {
  return (db.prepare("SELECT id, name, slug FROM stops WHERE id = ?").get(id) as StopRow | undefined) ?? null;
}

export function searchStops(db: DatabaseSync, query: string): StopRow[] {
  const q = query.trim();
  if (!q) return db.prepare("SELECT id, name, slug FROM stops ORDER BY name").all() as StopRow[];
  return db
    .prepare("SELECT id, name, slug FROM stops WHERE name LIKE ? ORDER BY name")
    .all(`%${q.replace(/[%_]/g, "")}%`) as StopRow[];
}

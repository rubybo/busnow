import { readFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Weekday } from "../schedule.ts";

export type ZippySchedule = {
  pattern: string;
  days: Weekday[];
  times: string[];
};

export type ZippyStopCall = {
  dirSlug: string;
  stopSlug: string;
  label: string;
  schedules: ZippySchedule[];
};

export type ZippyDirection = {
  name: string;
  stops: ZippyStopCall[];
};

export type ZippyRoute = {
  path: string;
  kind: "bus" | "minibus";
  slug: string;
  code: string;
  title: string;
  directions: ZippyDirection[];
};

export type ZippyDataset = {
  version: string;
  source: string;
  stops: Array<{ slug: string; name: string }>;
  routes: ZippyRoute[];
};

let cached: ZippyDataset | null = null;

export function loadZippyDataset(): ZippyDataset {
  const filePath = path.join(process.cwd(), "data", "zippy-seed.json");
  cached = JSON.parse(readFileSync(filePath, "utf8")) as ZippyDataset;
  return cached;
}

export function seedZippyNetwork(db: DatabaseSync): void {
  const data = loadZippyDataset();
  const insertPattern = db.prepare(
    `INSERT INTO patterns (name, sun, mon, tue, wed, thu, fri, sat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertStop = db.prepare(`INSERT INTO stops (name, slug) VALUES (?, ?)`);
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

  // Build canonical stops by label so "ДС Подкастельцы посадка" and "ДС Подкастельцы конечная"
  // resolve to the clean user-facing stop "ДС Подкастельцы" while preserving legacy slugs for tests/bookmarks.
  const preferredSlugs: Record<string, string> = {
    "ДС Подкастельцы": "podkasteltsy",
    "Автовокзал Новополоцк": "avtovokzal",
    "Больничный городок": "bolnichny-gorodok",
    "Училище олимпийского резерва": "borovukha-uor",
    "Завод «Полимир»": "zavod-polimir",
  };

  const stopIdByLabel = new Map<string, number>();
  const usedSlugs = new Set<string>();

  function getOrCreateStop(label: string, fallbackSlug: string): number {
    const existing = stopIdByLabel.get(label);
    if (existing) return existing;
    let slug = preferredSlugs[label] ?? fallbackSlug;
    if (usedSlugs.has(slug)) {
      let i = 2;
      while (usedSlugs.has(`${slug}-${i}`)) i += 1;
      slug = `${slug}-${i}`;
    }
    usedSlugs.add(slug);
    const id = Number(insertStop.run(label, slug).lastInsertRowid);
    stopIdByLabel.set(label, id);
    return id;
  }

  // Also ensure legacy test stop "9-й микрорайон" (`micro9`) exists for school bus 21А tests if not in ZippyBus
  for (const route of data.routes) {
    for (const dir of route.directions) {
      for (const stop of dir.stops) {
        getOrCreateStop(stop.label, stop.stopSlug);
      }
    }
  }

  const patternIdByKey = new Map<string, number>();
  function getOrCreatePattern(name: string, days: Weekday[]): number {
    const daySet = new Set(days);
    const key = `${name}:${["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => (daySet.has(d as Weekday) ? 1 : 0)).join("")}`;
    const existing = patternIdByKey.get(key);
    if (existing) return existing;
    const id = Number(
      insertPattern.run(
        name,
        daySet.has("sun") ? 1 : 0,
        daySet.has("mon") ? 1 : 0,
        daySet.has("tue") ? 1 : 0,
        daySet.has("wed") ? 1 : 0,
        daySet.has("thu") ? 1 : 0,
        daySet.has("fri") ? 1 : 0,
        daySet.has("sat") ? 1 : 0,
      ).lastInsertRowid,
    );
    patternIdByKey.set(key, id);
    return id;
  }

  for (const route of data.routes) {
    const sourceUrl = `${data.source}/${route.path}`;
    const note = route.directions.map((d) => d.name).join(" · ");
    const routeId = Number(
      insertRoute.run(route.code, route.slug, route.kind, route.title, sourceUrl, note).lastInsertRowid,
    );

    route.directions.forEach((direction, dirIdx) => {
      const directionId = Number(insertDirection.run(routeId, direction.name, dirIdx).lastInsertRowid);

      // Group stop schedules by (pattern, days) across the ordered stops of this direction
      const patternGroups = new Map<
        number,
        Array<{ stopId: number; sequence: number; times: string[] }>
      >();

      direction.stops.forEach((stop, seqIdx) => {
        const stopId = getOrCreateStop(stop.label, stop.stopSlug);
        for (const sched of stop.schedules) {
          const patId = getOrCreatePattern(sched.pattern, sched.days);
          let list = patternGroups.get(patId);
          if (!list) {
            list = [];
            patternGroups.set(patId, list);
          }
          list.push({ stopId, sequence: seqIdx, times: sched.times });
        }
      });

      for (const [patId, stopEntries] of patternGroups.entries()) {
        // Create one trip per index i up to max times length across stops in this direction/pattern
        const maxTrips = Math.max(0, ...stopEntries.map((e) => e.times.length));
        const tripIds: number[] = [];
        for (let t = 0; t < maxTrips; t += 1) {
          tripIds.push(Number(insertTrip.run(directionId, patId).lastInsertRowid));
        }
        for (const entry of stopEntries) {
          entry.times.forEach((hhmm, tIdx) => {
            insertTime.run(tripIds[tIdx], entry.stopId, entry.sequence, hhmm);
          });
        }
      }
    });
  }
}

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PatternName } from "./types.ts";
import type { DirectionSeed, RouteSeed, TripStop } from "./builders.ts";
import { trips } from "./builders.ts";
import { STOPS } from "./stops.ts";

const STOP_NAMES = new Map(STOPS.map((stop) => [stop.slug, stop.name]));

function stopName(slug: string): string {
  return STOP_NAMES.get(slug) ?? slug;
}

type PdfColumn = { stop: string; times: string[] };
type PdfDirection = {
  name: string;
  pattern: PatternName;
  columns?: PdfColumn[];
  rows?: Array<Array<{ stop: string; departs: string }>>;
};

type PdfRoute = { code: string; directions: PdfDirection[] };

type PdfSeed = { version: string; routes: PdfRoute[] };

/** Combined or multi-table PDFs where column detection is not reliable yet. */
const PDF_SKIP_CODES = new Set(["4", "4А", "5", "9", "10", "11", "20", "20А"]);

const PDF_CANDIDATES = [
  path.join(process.cwd(), "data", "atp-seed.json"),
  path.join(process.cwd(), "backend", "data", "atp-seed.json"),
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/atp-seed.json"),
];

function pdfJsonPath(): string | null {
  for (const candidate of PDF_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function loadPdfSeed(): Map<string, PdfRoute> {
  const file = pdfJsonPath();
  if (!file) return new Map();
  const raw = JSON.parse(readFileSync(file, "utf8")) as PdfSeed;
  const map = new Map<string, PdfRoute>();
  for (const route of raw.routes ?? []) {
    if (!route.code || PDF_SKIP_CODES.has(route.code)) continue;
    map.set(route.code, route);
  }
  return map;
}

function mergeDirectionTrips(existing: DirectionSeed[], incoming: DirectionSeed[]): DirectionSeed[] {
  const byName = new Map<string, DirectionSeed>();
  for (const dir of existing) byName.set(dir.name, { ...dir, trips: { ...dir.trips } });
  for (const dir of incoming) {
    const prev = byName.get(dir.name);
    if (!prev) {
      byName.set(dir.name, dir);
      continue;
    }
    byName.set(dir.name, {
      name: dir.name,
      trips: { ...prev.trips, ...dir.trips },
    });
  }
  return [...byName.values()];
}

function pdfDirectionToSeeds(block: PdfDirection): DirectionSeed[] {
  const pattern = block.pattern;

  if (block.rows?.length) {
    const tripList: TripStop[][] = block.rows.map((row) => row.map((c) => ({ stop: c.stop, departs: c.departs })));
    const stops = [...new Set(tripList.flat().map((call) => call.stop))];
    const name = `${stopName(stops[0])} → ${stopName(stops[stops.length - 1])}`;
    return [{ name, trips: { [pattern]: tripList } }];
  }

  const columns = block.columns ?? [];
  if (columns.length === 0) return [];

  if (columns.length === 1) {
    const col = columns[0];
    return [{ name: `Отправления: ${stopName(col.stop)}`, trips: { [pattern]: trips(col.stop, col.times) } }];
  }

  if (columns.length === 2) {
    const [a, b] = columns;
    return [
      { name: `${stopName(a.stop)} → ${stopName(b.stop)}`, trips: { [pattern]: trips(a.stop, a.times) } },
      { name: `${stopName(b.stop)} → ${stopName(a.stop)}`, trips: { [pattern]: trips(b.stop, b.times) } },
    ];
  }

  const zipped: TripStop[][] = [];
  const max = Math.max(...columns.map((c) => c.times.length));
  for (let i = 0; i < max; i++) {
    const row: TripStop[] = [];
    for (const col of columns) {
      const departs = col.times[i];
      if (departs) row.push({ stop: col.stop, departs });
    }
    if (row.length) zipped.push(row);
  }
  const name = `${stopName(columns[0].stop)} → ${stopName(columns[columns.length - 1].stop)}`;
  return [{ name, trips: { [pattern]: zipped } }];
}

function pdfRouteToDirections(pdf: PdfRoute): DirectionSeed[] {
  let out: DirectionSeed[] = [];
  for (const block of pdf.directions) {
    out = mergeDirectionTrips(out, pdfDirectionToSeeds(block));
  }
  return out;
}

function tripCount(directions: DirectionSeed[]): number {
  return directions.reduce(
    (sum, direction) => sum + Object.values(direction.trips).reduce((n, list) => n + (list?.length ?? 0), 0),
    0,
  );
}

export function applyPdfOverrides(routes: RouteSeed[]): RouteSeed[] {
  const pdfByCode = loadPdfSeed();
  if (pdfByCode.size === 0) return routes;

  const seen = new Set<string>();
  const merged = routes.map((route) => {
    const pdf = pdfByCode.get(route.code);
    if (!pdf) return route;
    seen.add(route.code);
    const directions = pdfRouteToDirections(pdf);
    if (tripCount(directions) < Math.max(tripCount(route.directions), 1)) return route;
    return { ...route, directions };
  });

  for (const [code, pdf] of pdfByCode) {
    if (seen.has(code)) continue;
    const directions = pdfRouteToDirections(pdf);
    if (directions.length === 0) continue;
    merged.push({
      code,
      slug: code.toLowerCase().replace("а", "a"),
      kind: "bus",
      title: `Маршрут №${code}`,
      sourceUrl: "https://atp6voat.by/gorodskie-avtobusy/",
      note: "Расписание из PDF АТП №6 (Новополоцк).",
      directions,
    });
  }

  return merged.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true }));
}

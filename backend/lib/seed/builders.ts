import type { PatternName } from "./types.ts";
import { parseAtpTime, timesFromColumn, timesFromColumns } from "./atp-time.ts";

export type TripStop = { stop: string; departs: string };

export type DirectionSeed = {
  name: string;
  trips: Partial<Record<PatternName, TripStop[][]>>;
};

export type RouteSeed = {
  code: string;
  slug: string;
  kind: "bus" | "minibus";
  title: string;
  sourceUrl: string;
  note: string;
  directions: DirectionSeed[];
};

export function trip(stop: string, departs: string): TripStop[] {
  return [{ stop, departs }];
}

export function trips(stop: string, times: string[]): TripStop[][] {
  return times.map((departs) => trip(stop, departs));
}

export function tripRow(stops: Array<{ stop: string; departs: string }>): TripStop[] {
  return stops;
}

export function twoDirections(
  meta: Omit<RouteSeed, "directions">,
  a: { label: string; stop: string; weekdays: string[]; weekend?: string[] },
  b: { label: string; stop: string; weekdays: string[]; weekend?: string[] },
): RouteSeed {
  return {
    ...meta,
    directions: [
      {
        name: a.label,
        trips: {
          weekdays: trips(a.stop, a.weekdays),
          ...(a.weekend ? { weekend: trips(a.stop, a.weekend) } : {}),
        },
      },
      {
        name: b.label,
        trips: {
          weekdays: trips(b.stop, b.weekdays),
          ...(b.weekend ? { weekend: trips(b.stop, b.weekend) } : {}),
        },
      },
    ],
  };
}

export function fromTable(
  meta: Omit<RouteSeed, "directions">,
  a: { label: string; stop: string; column: number | number[] },
  b: { label: string; stop: string; column: number | number[] },
  weekdays: readonly (readonly string[])[],
  weekend?: readonly (readonly string[])[],
): RouteSeed {
  const pick = (rows: readonly (readonly string[])[], col: number | number[]) =>
    Array.isArray(col) ? timesFromColumns(rows, ...col) : timesFromColumn(rows, col);

  return twoDirections(
    meta,
    { label: a.label, stop: a.stop, weekdays: pick(weekdays, a.column), weekend: weekend ? pick(weekend, a.column) : undefined },
    { label: b.label, stop: b.stop, weekdays: pick(weekdays, b.column), weekend: weekend ? pick(weekend, b.column) : undefined },
  );
}

export function oneDirection(
  meta: Omit<RouteSeed, "directions">,
  label: string,
  stop: string,
  weekdays: string[],
  weekend?: string[],
): RouteSeed {
  return {
    ...meta,
    directions: [
      {
        name: label,
        trips: {
          weekdays: trips(stop, weekdays),
          ...(weekend ? { weekend: trips(stop, weekend) } : {}),
        },
      },
    ],
  };
}

export function multiStopDirection(
  label: string,
  rows: Array<Array<{ stop: string; raw: string }>>,
  pattern: PatternName,
): DirectionSeed {
  const tripsOut: TripStop[][] = [];
  for (const row of rows) {
    const calls: TripStop[] = [];
    for (const cell of row) {
      const departs = parseAtpTime(cell.raw);
      if (departs) calls.push({ stop: cell.stop, departs });
    }
    if (calls.length > 0) tripsOut.push(calls);
  }
  return { name: label, trips: { [pattern]: tripsOut } };
}

export function bareRoute(
  code: string,
  slug: string,
  kind: "bus" | "minibus",
  title: string,
  note: string,
  sourceUrl: string,
): RouteSeed {
  return { code, slug, kind, title, sourceUrl, note, directions: [] };
}

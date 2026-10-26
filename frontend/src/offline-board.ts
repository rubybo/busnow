import type { Departure, Kind, RouteDetail, StopRef } from "./api.ts";
import { minskDateIso, patternMatchesToday } from "./clock.ts";

export type BuiltBoard = {
  stop: StopRef;
  date: string;
  timezone: "Europe/Minsk";
  departures: Departure[];
};

/** Рейсы остановки на календарный день `now` из уже сохранённых маршрутов. Дата в адресе не нужна. */
export function departuresFromRoutes(
  stopId: number,
  details: RouteDetail[],
  stops: StopRef[] = [],
  now = new Date(),
): BuiltBoard | null {
  const known = stops.find((stop) => stop.id === stopId);
  let name = known?.name ?? "";
  let slug = known?.slug ?? "";
  const seen = new Set<string>();
  const departures: Departure[] = [];
  let id = 1;
  for (const detail of details) {
    detail.directions.forEach((direction, directionPos) => {
      for (const pattern of direction.patterns) {
        if (!patternMatchesToday(pattern.name, now)) continue;
        const stop = pattern.stops.find((item) => item.id === stopId);
        if (!stop) continue;
        if (!name) {
          name = stop.name;
          slug = stop.slug;
        }
        for (const time of stop.times) {
          const stamp = `${detail.route.slug}:${directionPos}:${time}`;
          if (seen.has(stamp)) continue;
          seen.add(stamp);
          departures.push({
            id,
            departs: time,
            direction: direction.name,
            directionPos,
            pattern: pattern.name,
            routeCode: detail.route.code,
            routeSlug: detail.route.slug,
            kind: detail.route.kind as Kind,
            title: detail.route.title,
          });
          id += 1;
        }
      }
    });
  }
  if (!name) return null;
  departures.sort(
    (a, b) => a.departs.localeCompare(b.departs) || a.routeCode.localeCompare(b.routeCode, "ru", { numeric: true }),
  );
  return { stop: { id: stopId, name, slug }, date: minskDateIso(now), timezone: "Europe/Minsk", departures };
}

import { departuresForStop, type DepartureRow, findStop, getDb } from "../../../../../lib/db.ts";
import { forecastTrip } from "../../../../../lib/forecast.ts";
import { fail, HttpError, json } from "../../../../../lib/http.ts";
import { isCalendarDate, minskClock, nextDepartureIds } from "../../../../../lib/schedule.ts";
import { currentWeather } from "../../../../../lib/weather.ts";

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function forecastRouteOf(value: string | null): string | null {
  if (!value || value.length > 80 || /[\u0000-\u001f]/.test(value)) return null;
  return value;
}

async function withForecast(
  rows: DepartureRow[],
  stopName: string,
  date: string,
  view: string | null,
  now: string,
  routeSlug: string | null,
) {
  if (view !== "board" || !routeSlug) return rows;
  const chosen = nextDepartureIds(rows, now, routeSlug);
  if (chosen.size === 0) return rows;
  try {
    const sky = await currentWeather();
    return rows.map((row) => {
      if (!chosen.has(row.id)) return row;
      return {
        ...row,
        forecast: forecastTrip({
          date,
          departs: row.departs,
          routeCode: row.routeCode,
          direction: row.direction,
          stopName,
          kind: row.kind,
          sky,
          stopFrac: row.stopFrac,
          headwayMin: row.headwayMin,
          rideMin: row.rideMin,
          atOrigin: row.atOrigin,
          atTerminus: row.atTerminus,
          hubRoutes: row.hubRoutes,
        }),
      };
    });
  } catch {
    return rows;
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const stopId = Number(id);
    const db = getDb();
    const stop = findStop(db, stopId);
    if (!stop) throw new HttpError(404, "Остановка не найдена");
    const url = new URL(request.url);
    const requested = url.searchParams.get("date");
    if (requested && !isCalendarDate(requested)) throw new HttpError(400, "Дата задаётся как ГГГГ-ММ-ДД");
    const clock = minskClock(new Date());
    const date = requested ?? clock.date;
    const view = url.searchParams.get("view");
    const now = hhmm(clock.minutes);
    const departures =
      date === clock.date && (view === "card" || view === "board")
        ? departuresForStop(db, stopId, date, view, now)
        : departuresForStop(db, stopId, date);
    const routeSlug = url.searchParams.get("forecast") === "next" ? forecastRouteOf(url.searchParams.get("route")) : null;
    const body = await withForecast(departures, stop.name, date, view, now, routeSlug);
    return json({
      stop,
      date,
      timezone: "Europe/Minsk",
      departures: body,
    });
  } catch (error) {
    return fail(error);
  }
}

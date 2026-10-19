import { departuresForStop, findStop, getDb } from "../../../../../lib/db.ts";
import { fail, HttpError, json } from "../../../../../lib/http.ts";
import { minskClock } from "../../../../../lib/schedule.ts";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const stopId = Number(id);
    const db = getDb();
    const stop = findStop(db, stopId);
    if (!stop) throw new HttpError(404, "Остановка не найдена");
    const requested = new URL(request.url).searchParams.get("date");
    const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : minskClock(new Date()).date;
    return json({
      stop,
      date,
      timezone: "Europe/Minsk",
      departures: departuresForStop(db, stopId, date),
    });
  } catch (error) {
    return fail(error);
  }
}

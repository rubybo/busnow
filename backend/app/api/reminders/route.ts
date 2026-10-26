import { readSessionToken } from "../../../lib/auth.ts";
import { getDb } from "../../../lib/db.ts";
import { assertUserRate } from "../../../lib/guard.ts";
import { fail, HttpError, json, PRIVATE, readBody } from "../../../lib/http.ts";
import { addReminder, requireUser, userView } from "../../../lib/users.ts";

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const stopTimeId = body.stopTimeId;
    if (typeof stopTimeId !== "number" || !Number.isInteger(stopTimeId) || stopTimeId < 1) {
      throw new HttpError(400, "Рейс не найден");
    }
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    assertUserRate("reminder", user.id, 30, 10 * 60 * 1000);
    addReminder(db, user.id, stopTimeId);
    return json({ user: userView(db, user.id) }, 200, PRIVATE);
  } catch (error) {
    return fail(error);
  }
}

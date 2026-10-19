import { readSessionToken } from "../../../lib/auth.ts";
import { getDb } from "../../../lib/db.ts";
import { fail, HttpError, json, readBody } from "../../../lib/http.ts";
import { addReminder, requireUser, userView } from "../../../lib/users.ts";

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const stopTimeId = body.stopTimeId;
    if (typeof stopTimeId !== "number" || !Number.isInteger(stopTimeId)) {
      throw new HttpError(400, "Рейс не найден");
    }
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    addReminder(db, user.id, stopTimeId);
    return json({ user: userView(db, user.id) });
  } catch (error) {
    return fail(error);
  }
}

import { readSessionToken } from "../../../../lib/auth.ts";
import { getDb } from "../../../../lib/db.ts";
import { assertUserRate } from "../../../../lib/guard.ts";
import { fail, json, PRIVATE, readBody } from "../../../../lib/http.ts";
import { sendDueReminders } from "../../../../lib/push.ts";
import { requireUser } from "../../../../lib/users.ts";

/** Отправляет push по напоминаниям текущего пользователя, если сейчас окно «за 10 мин». */
export async function POST(request: Request) {
  try {
    await readBody(request);
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    assertUserRate("dispatch", user.id, 30, 60 * 1000);
    return json(await sendDueReminders(new Date(), user.id), 200, PRIVATE);
  } catch (error) {
    return fail(error);
  }
}

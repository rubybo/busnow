import { readSessionToken } from "../../../../lib/auth.ts";
import { getDb } from "../../../../lib/db.ts";
import { fail, json } from "../../../../lib/http.ts";
import { sendDueReminders } from "../../../../lib/push.ts";
import { requireUser } from "../../../../lib/users.ts";

/** Отправляет push по напоминаниям текущего пользователя, если сейчас окно «за 10 мин». */
export async function POST(request: Request) {
  try {
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    return json(await sendDueReminders(new Date(), user.id));
  } catch (error) {
    return fail(error);
  }
}

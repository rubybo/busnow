import { fail, HttpError, json } from "../../../../lib/http.ts";
import { sendDueReminders } from "../../../../lib/push.ts";

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new HttpError(503, "CRON_SECRET не задан");
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      throw new HttpError(401, "Нет доступа");
    }
    return json(await sendDueReminders());
  } catch (error) {
    return fail(error);
  }
}

import { readSessionToken } from "../../../../lib/auth.ts";
import { getDb } from "../../../../lib/db.ts";
import { assertUserRate } from "../../../../lib/guard.ts";
import { fail, HttpError, json, PRIVATE, readBody } from "../../../../lib/http.ts";
import { pushSubscriptionOf } from "../../../../lib/push-endpoint.ts";
import { vapidKeys } from "../../../../lib/push.ts";
import { deletePush, requireUser, savePush } from "../../../../lib/users.ts";

export async function GET() {
  try {
    return json({ publicKey: vapidKeys().publicKey });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const subscription = pushSubscriptionOf(body);
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    assertUserRate("push-save", user.id, 20, 60 * 60 * 1000);
    savePush(db, user.id, subscription);
    return json({ ok: true }, 200, PRIVATE);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await readBody(request);
    if (typeof body.endpoint !== "string") throw new HttpError(400, "Подписка браузера не подошла");
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    deletePush(db, user.id, body.endpoint);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

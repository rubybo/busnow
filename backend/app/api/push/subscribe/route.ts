import { readSessionToken } from "../../../../lib/auth.ts";
import { getDb } from "../../../../lib/db.ts";
import { fail, HttpError, json, readBody } from "../../../../lib/http.ts";
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
    const endpoint = body.endpoint;
    const keys = body.keys as { p256dh?: unknown; auth?: unknown } | undefined;
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
      throw new HttpError(400, "Подписка браузера не подошла");
    }
    if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
      throw new HttpError(400, "Подписка браузера не подошла");
    }
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    savePush(db, user.id, { endpoint, p256dh: keys.p256dh, auth: keys.auth });
    return json({ ok: true });
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

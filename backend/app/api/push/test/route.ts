import { readSessionToken } from "../../../../lib/auth.ts";
import { getDb } from "../../../../lib/db.ts";
import { assertUserRate } from "../../../../lib/guard.ts";
import { fail, json, PRIVATE, readBody } from "../../../../lib/http.ts";
import { sendTestPush } from "../../../../lib/push.ts";
import { requireUser } from "../../../../lib/users.ts";

export async function POST(request: Request) {
  try {
    await readBody(request);
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    assertUserRate("push-test", user.id, 5, 60 * 60 * 1000);
    await sendTestPush(user.id);
    return json({ ok: true }, 200, PRIVATE);
  } catch (error) {
    return fail(error);
  }
}

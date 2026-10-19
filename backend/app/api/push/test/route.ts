import { readSessionToken } from "../../../../lib/auth.ts";
import { getDb } from "../../../../lib/db.ts";
import { fail, json } from "../../../../lib/http.ts";
import { sendTestPush } from "../../../../lib/push.ts";
import { requireUser } from "../../../../lib/users.ts";

export async function POST() {
  try {
    const db = getDb();
    const user = requireUser(db, await readSessionToken());
    await sendTestPush(user.id);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

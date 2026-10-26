import { clearSessionToken, readSessionToken } from "../../../../lib/auth.ts";
import { getDb } from "../../../../lib/db.ts";
import { fail, json, PRIVATE, readBody } from "../../../../lib/http.ts";
import { deleteSession } from "../../../../lib/users.ts";

export async function POST(request: Request) {
  try {
    await readBody(request);
    const token = await readSessionToken();
    if (token) deleteSession(getDb(), token);
    await clearSessionToken();
    return json({ ok: true }, 200, PRIVATE);
  } catch (error) {
    return fail(error);
  }
}

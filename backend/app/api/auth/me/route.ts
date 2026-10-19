import { readSessionToken } from "../../../../lib/auth.ts";
import { getDb } from "../../../../lib/db.ts";
import { fail, json } from "../../../../lib/http.ts";
import { userFromToken } from "../../../../lib/users.ts";

export async function GET() {
  try {
    const token = await readSessionToken();
    return json({ user: userFromToken(getDb(), token) });
  } catch (error) {
    return fail(error);
  }
}

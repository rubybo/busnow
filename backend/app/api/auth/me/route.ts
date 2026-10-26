import { readSessionToken } from "../../../../lib/auth.ts";
import { getDb } from "../../../../lib/db.ts";
import { fail, json, PRIVATE } from "../../../../lib/http.ts";
import { userFromToken } from "../../../../lib/users.ts";

export async function GET() {
  try {
    const token = await readSessionToken();
    return json({ user: userFromToken(getDb(), token) }, 200, PRIVATE);
  } catch (error) {
    return fail(error);
  }
}

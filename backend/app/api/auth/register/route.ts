import { writeSessionToken } from "../../../../lib/auth.ts";
import { hashPassword, newSessionToken } from "../../../../lib/crypto.ts";
import { getDb } from "../../../../lib/db.ts";
import { emailOf, fail, json, passwordOf, readBody } from "../../../../lib/http.ts";
import { createUser, findUserByEmail, saveSession, userView } from "../../../../lib/users.ts";
import { HttpError } from "../../../../lib/http.ts";

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const email = emailOf(body.email);
    const password = passwordOf(body.password);
    const db = getDb();
    if (findUserByEmail(db, email)) throw new HttpError(409, "Такая почта уже зарегистрирована");
    const id = createUser(db, email, hashPassword(password));
    const session = newSessionToken();
    saveSession(db, id, session.hash);
    await writeSessionToken(session.token);
    return json({ user: userView(db, id) });
  } catch (error) {
    return fail(error);
  }
}

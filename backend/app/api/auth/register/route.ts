import { writeSessionToken } from "../../../../lib/auth.ts";
import { verifyCaptcha } from "../../../../lib/captcha.ts";
import { hashPassword, newSessionToken } from "../../../../lib/crypto.ts";
import { getDb } from "../../../../lib/db.ts";
import { assertAuthFlood, assertRegisterAllowed } from "../../../../lib/guard.ts";
import { emailOf, fail, HttpError, json, passwordOf, PRIVATE, readBody } from "../../../../lib/http.ts";
import { createUser, findUserByEmail, saveSession, userView } from "../../../../lib/users.ts";

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    assertAuthFlood(request);
    if (!verifyCaptcha(body.captchaId, body.captcha)) throw new HttpError(400, "Код с картинки не подошёл");
    assertRegisterAllowed(request);
    const email = emailOf(body.email);
    const password = passwordOf(body.password);
    const db = getDb();
    if (findUserByEmail(db, email)) throw new HttpError(409, "Такая почта уже зарегистрирована");
    const id = createUser(db, email, await hashPassword(password));
    const session = newSessionToken();
    saveSession(db, id, session.hash);
    await writeSessionToken(session.token);
    return json({ user: userView(db, id) }, 200, PRIVATE);
  } catch (error) {
    return fail(error);
  }
}

import { writeSessionToken } from "../../../../lib/auth.ts";
import { verifyCaptcha } from "../../../../lib/captcha.ts";
import { checkPassword, newSessionToken } from "../../../../lib/crypto.ts";
import { getDb } from "../../../../lib/db.ts";
import { assertAuthFlood, assertLoginAllowed, clearLoginFailures, recordLoginFailure } from "../../../../lib/guard.ts";
import { emailOf, fail, HttpError, json, passwordOf, PRIVATE, readBody } from "../../../../lib/http.ts";
import { findUserByEmail, saveSession, userView } from "../../../../lib/users.ts";

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    assertAuthFlood(request);
    const email = emailOf(body.email);
    const password = passwordOf(body.password);
    if (!verifyCaptcha(body.captchaId, body.captcha)) throw new HttpError(400, "Код с картинки не подошёл");
    assertLoginAllowed(request, email);
    const db = getDb();
    const user = findUserByEmail(db, email);
    const matches = await checkPassword(password, user?.password_hash ?? null);
    if (!user || !matches) {
      recordLoginFailure(email);
      throw new HttpError(401, "Почта или пароль не подходят");
    }
    clearLoginFailures(email);
    const session = newSessionToken();
    saveSession(db, user.id, session.hash);
    await writeSessionToken(session.token);
    return json({ user: userView(db, user.id) }, 200, PRIVATE);
  } catch (error) {
    return fail(error);
  }
}

import { writeSessionToken } from "../../../../lib/auth.ts";
import { verifyCaptcha } from "../../../../lib/captcha.ts";
import { newSessionToken, verifyPassword } from "../../../../lib/crypto.ts";
import { getDb } from "../../../../lib/db.ts";
import { emailOf, fail, HttpError, json, passwordOf, readBody } from "../../../../lib/http.ts";
import { findUserByEmail, saveSession, userView } from "../../../../lib/users.ts";

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (!verifyCaptcha(body.captchaId, body.captcha)) throw new HttpError(400, "Код с картинки не подошёл");
    const email = emailOf(body.email);
    const password = passwordOf(body.password);
    const db = getDb();
    const user = findUserByEmail(db, email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, "Почта или пароль не подходят");
    }
    const session = newSessionToken();
    saveSession(db, user.id, session.hash);
    await writeSessionToken(session.token);
    return json({ user: userView(db, user.id) });
  } catch (error) {
    return fail(error);
  }
}

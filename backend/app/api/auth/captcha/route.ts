import { createChallenge } from "../../../../lib/captcha.ts";
import { assertCaptchaAllowed } from "../../../../lib/guard.ts";
import { fail, json, PRIVATE } from "../../../../lib/http.ts";

export function GET(request: Request) {
  try {
    assertCaptchaAllowed(request);
    const challenge = createChallenge();
    return json({ id: challenge.id, svg: challenge.svg }, 200, PRIVATE);
  } catch (error) {
    return fail(error);
  }
}

import { createChallenge } from "../../../../lib/captcha.ts";
import { fail, json } from "../../../../lib/http.ts";

export function GET() {
  try {
    const challenge = createChallenge();
    return json({ id: challenge.id, svg: challenge.svg });
  } catch (error) {
    return fail(error);
  }
}

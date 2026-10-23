import assert from "node:assert/strict";
import test from "node:test";
import { createChallenge, verifyCaptcha } from "./captcha.ts";

test("captcha accepts the pictured code once and hides it from the markup", () => {
  const challenge = createChallenge();
  assert.equal(challenge.svg.includes("<text"), false);
  assert.equal(challenge.svg.includes(challenge.code), false);
  assert.equal(verifyCaptcha(challenge.id, challenge.code), true);
  assert.equal(verifyCaptcha(challenge.id, challenge.code), false);
});

test("captcha rejects a wrong code and spends the picture", () => {
  const challenge = createChallenge();
  assert.equal(verifyCaptcha(challenge.id, "00000"), false);
  assert.equal(verifyCaptcha(challenge.id, challenge.code), false);
});

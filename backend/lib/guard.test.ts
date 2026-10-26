import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "./http.ts";
import {
  LOGIN_EMAIL_LIMIT,
  assertLoginAllowed,
  assertRate,
  clearLoginFailures,
  clientKey,
  recordLoginFailure,
  resetRates,
  safeEqual,
} from "./guard.ts";

function requestFrom(ip: string): Request {
  return new Request("https://busnow.online/api/auth/login", { headers: { "x-busnow-client": ip } });
}

test("rate limit stops the call that would exceed the window", () => {
  resetRates();
  assertRate("one", 2, 60_000);
  assertRate("one", 2, 60_000);
  assert.throws(
    () => assertRate("one", 2, 60_000),
    (error: unknown) => error instanceof HttpError && error.status === 429,
  );
  assertRate("two", 2, 60_000);
});

test("login lock follows the email, not the address", () => {
  resetRates();
  const home = requestFrom("203.0.113.10");
  const other = requestFrom("203.0.113.11");
  for (let i = 0; i < LOGIN_EMAIL_LIMIT; i += 1) {
    assertLoginAllowed(home, "a@example.com");
    recordLoginFailure("a@example.com");
  }
  assert.throws(
    () => assertLoginAllowed(other, "a@example.com"),
    (error: unknown) => error instanceof HttpError && error.status === 429,
  );
  assertLoginAllowed(other, "b@example.com");
  clearLoginFailures("a@example.com");
  assertLoginAllowed(other, "a@example.com");
});

test("client address ignores a header that is not an ip", () => {
  assert.equal(clientKey(requestFrom("203.0.113.5")), "203.0.113.5");
  assert.equal(clientKey(requestFrom("not an ip")), "local");
});

test("secret compare does not care about length", () => {
  assert.equal(safeEqual("same", "same"), true);
  assert.equal(safeEqual("short", "much-longer-secret"), false);
});

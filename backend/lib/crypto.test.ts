import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import { checkPassword, hashPassword } from "./crypto.ts";

test("async scrypt accepts a hash made the same way as the old sync one", async () => {
  const salt = "ab".repeat(16);
  const stored = `${salt}:${scryptSync("password1", salt, 32).toString("hex")}`;
  assert.equal(await checkPassword("password1", stored), true);
  assert.equal(await checkPassword("password2", stored), false);
  assert.equal(await checkPassword("password1", null), false);
});

test("a new password round-trips through the thread pool", async () => {
  const stored = await hashPassword("correct horse");
  assert.equal(await checkPassword("correct horse", stored), true);
  assert.equal(await checkPassword("wrong", stored), false);
});

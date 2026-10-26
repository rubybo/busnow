import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

function scryptKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptKey(password, salt)).toString("hex");
  return `${salt}:${hash}`;
}

const dummySalt = randomBytes(16).toString("hex");
const DUMMY_HASH = `${dummySalt}:${scryptSync("busnow-missing-account", dummySalt, 32).toString("hex")}`;

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = await scryptKey(password, salt);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Checks the password even when the account is missing, so the reply takes the same time. */
export async function checkPassword(password: string, stored: string | null): Promise<boolean> {
  return verifyPassword(password, stored && stored.includes(":") ? stored : DUMMY_HASH);
}

export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

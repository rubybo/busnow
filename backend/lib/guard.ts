import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http.ts";

const LOGIN_WINDOW = 15 * 60 * 1000;
const LOGIN_IP_LIMIT = 30;
export const LOGIN_EMAIL_LIMIT = 8;
const REGISTER_WINDOW = 60 * 60 * 1000;
const REGISTER_LIMIT = 8;
const CAPTCHA_WINDOW = 10 * 60 * 1000;
const CAPTCHA_LIMIT = 40;

type Buckets = Map<string, number[]>;

function buckets(): Buckets {
  const holder = globalThis as { busnowRates?: Buckets };
  return (holder.busnowRates ??= new Map());
}

export function resetRates(): void {
  buckets().clear();
}

export function clientKey(request: Request): string {
  const raw = request.headers.get("x-busnow-client")?.trim() ?? "";
  if (/^[0-9A-Fa-f:.]{3,64}$/.test(raw)) return raw;
  return "local";
}

function freshHits(name: string, windowMs: number, now: number): number[] {
  return (buckets().get(name) ?? []).filter((stamp) => now - stamp < windowMs);
}

function reject(hits: number[], windowMs: number, now: number): never {
  const retry = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
  throw new HttpError(429, "Слишком много попыток. Подождите немного.", { "Retry-After": String(retry) });
}

function remember(name: string, hits: number[]): void {
  const map = buckets();
  map.delete(name);
  map.set(name, hits);
  if (map.size <= 2000) return;
  const oldest = map.keys().next().value;
  if (oldest) map.delete(oldest);
}

/** Counts this call. Throws 429 when the window is already full. */
export function assertRate(name: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const hits = freshHits(name, windowMs, now);
  if (hits.length >= limit) reject(hits, windowMs, now);
  hits.push(now);
  remember(name, hits);
}

function assertRoom(name: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const hits = freshHits(name, windowMs, now);
  remember(name, hits);
  if (hits.length >= limit) reject(hits, windowMs, now);
}

function addHit(name: string, windowMs: number): void {
  const now = Date.now();
  const hits = freshHits(name, windowMs, now);
  hits.push(now);
  remember(name, hits);
}

export function assertAuthFlood(request: Request): void {
  assertRate(`auth-flood:${clientKey(request)}`, 60, 60_000);
}

export function assertLoginAllowed(request: Request, email: string): void {
  assertRate(`login-ip:${clientKey(request)}`, LOGIN_IP_LIMIT, LOGIN_WINDOW);
  assertRoom(`login-email:${email}`, LOGIN_EMAIL_LIMIT, LOGIN_WINDOW);
}

export function recordLoginFailure(email: string): void {
  addHit(`login-email:${email}`, LOGIN_WINDOW);
}

export function clearLoginFailures(email: string): void {
  buckets().delete(`login-email:${email}`);
}

export function assertRegisterAllowed(request: Request): void {
  assertRate(`register-ip:${clientKey(request)}`, REGISTER_LIMIT, REGISTER_WINDOW);
}

export function assertCaptchaAllowed(request: Request): void {
  assertRate(`captcha-ip:${clientKey(request)}`, CAPTCHA_LIMIT, CAPTCHA_WINDOW);
}

export function assertUserRate(action: string, userId: number, limit: number, windowMs: number): void {
  assertRate(`user:${action}:${userId}`, limit, windowMs);
}

export function safeEqual(left: string, right: string): boolean {
  const actual = createHash("sha256").update(left).digest();
  const expected = createHash("sha256").update(right).digest();
  return timingSafeEqual(actual, expected);
}

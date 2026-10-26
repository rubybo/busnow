import { HttpError } from "./http.ts";

const HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);

/** Browser push services the server is allowed to contact. */
export function isPushEndpoint(value: string): boolean {
  if (value.length < 12 || value.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname;
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return false;
  if (host.includes(":") || /^\d/.test(host)) return false;
  if (HOSTS.has(host)) return true;
  return host.endsWith(".notify.windows.com");
}

function pushKey(value: unknown): string {
  if (typeof value !== "string" || value.length < 16 || value.length > 200 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new HttpError(400, "Подписка браузера не подошла");
  }
  return value;
}

export function pushSubscriptionOf(body: Record<string, unknown>): { endpoint: string; p256dh: string; auth: string } {
  const endpoint = body.endpoint;
  if (typeof endpoint !== "string" || !isPushEndpoint(endpoint)) {
    throw new HttpError(400, "Подписка браузера не подошла");
  }
  const keys = body.keys as { p256dh?: unknown; auth?: unknown } | undefined;
  if (!keys) throw new HttpError(400, "Подписка браузера не подошла");
  return { endpoint, p256dh: pushKey(keys.p256dh), auth: pushKey(keys.auth) };
}

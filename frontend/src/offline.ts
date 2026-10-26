import { useEffect, useState } from "react";
import type { RouteDetail, StopRef } from "./api.ts";
import { minskDateIso } from "./clock.ts";
import { departuresFromRoutes, type BuiltBoard } from "./offline-board.ts";

const SCHEDULE = "busnow-schedule-v2";
const SHELL = "busnow-shell-v1";
const WARMED = "busnow.schedule-warmed";

let warming: Promise<void> | null = null;

export function departuresPath(stopId: number, view: "card" | "board" = "board", now = new Date()): string {
  return `/api/stops/${stopId}/departures?date=${minskDateIso(now)}&view=${view}`;
}

/** Кладёт табло избранных остановок в тот же кэш, что и сервис-воркер. */
export function cacheFavoriteStops(ids: number[]): void {
  if (!navigator.onLine || !("caches" in window) || ids.length === 0) return;
  void (async () => {
    const cache = await caches.open(SCHEDULE);
    await Promise.all(ids.map((id) => putFavoriteStop(cache, id)));
  })().catch(() => undefined);
}

export function forgetSessionCache(): void {
  if (!("caches" in window)) return;
  void (async () => {
    const cache = await caches.open(SCHEDULE);
    const keys = await cache.keys();
    await Promise.all(
      keys.filter((key) => new URL(key.url).pathname === "/api/auth/me").map((key) => cache.delete(key)),
    );
  })().catch(() => undefined);
}

export function dropFavoriteStop(stopId: number): void {
  if (!("caches" in window)) return;
  void (async () => {
    const cache = await caches.open(SCHEDULE);
    const keys = await cache.keys();
    await Promise.all(
      keys
        .filter((key) => new URL(key.url).pathname === `/api/stops/${stopId}/departures`)
        .map((key) => cache.delete(key)),
    );
  })().catch(() => undefined);
}

async function putFavoriteStop(cache: Cache, stopId: number): Promise<void> {
  for (const view of ["card", "board"] as const) {
    const path = departuresPath(stopId, view);
    const response = await fetch(path, { credentials: "include", headers: { "X-BusNow": "1" } });
    if (response.ok) await cache.put(path, response);
  }
}

export function useOffline(): boolean {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return offline;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    priority: "low",
    headers: { "X-BusNow": "1" },
  });
  if (!response.ok) throw new Error("Не получилось");
  return response.json() as Promise<T>;
}

async function savedRouteCount(): Promise<number> {
  if (!("caches" in window)) return 0;
  const cache = await caches.open(SCHEDULE);
  const keys = await cache.keys();
  return keys.filter((key) => /^\/api\/routes\/[^/]+$/.test(new URL(key.url).pathname)).length;
}

async function dropStaleDepartures(today: string): Promise<void> {
  if (!("caches" in window)) return;
  const cache = await caches.open(SCHEDULE);
  const keys = await cache.keys();
  await Promise.all(
    keys.map((key) => {
      const url = new URL(key.url);
      if (!/\/departures$/.test(url.pathname)) return undefined;
      if (url.searchParams.get("date") === today) return undefined;
      return cache.delete(key);
    }),
  );
}

/** Сохраняет список остановок и полное расписание маршрутов, чтобы они открывались без сети. */
export function warmSchedule(): void {
  if (!navigator.onLine || !("caches" in window)) return;
  if (warming) return;
  warming = (async () => {
    const today = minskDateIso();
    if (localStorage.getItem(WARMED) === today && (await savedRouteCount()) > 0) return;
    const { routes } = await getJson<{ routes: Array<{ slug: string }> }>("/api/routes");
    await getJson("/api/stops?q=");
    let index = 0;
    const slugs = routes.map((route) => route.slug);
    async function next(): Promise<void> {
      const slug = slugs[index];
      index += 1;
      if (!slug) return;
      try {
        await getJson(`/api/routes/${encodeURIComponent(slug)}`);
      } catch {
        // Один маршрут не должен срывать остальное расписание.
      }
      await next();
    }
    await Promise.all([next(), next()]);
    await dropStaleDepartures(today);
    if ((await savedRouteCount()) > 0) localStorage.setItem(WARMED, today);
  })()
    .catch(() => undefined)
    .finally(() => {
      warming = null;
    });
}

async function cacheShell(): Promise<void> {
  if (!("caches" in window)) return;
  const cache = await caches.open(SHELL);
  const urls = new Set(["/", "/favicon.svg", "/og-cover.svg"]);
  document.querySelectorAll("script[src], link[href]").forEach((el) => {
    const value = el.getAttribute("src") ?? el.getAttribute("href");
    if (!value) return;
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin) return;
    if (url.pathname.startsWith("/@") || url.pathname.startsWith("/src/") || url.pathname.startsWith("/node_modules/")) return;
    urls.add(`${url.pathname}${url.search}`);
  });
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch {
        // Оболочка докэшируется при следующем заходе.
      }
    }),
  );
}

function afterFirstScreen(work: () => void): void {
  window.setTimeout(() => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(work, { timeout: 1500 });
    else work();
  }, 2500);
}

export function startOffline(): void {
  if (!("serviceWorker" in navigator)) return;
  const boot = () => {
    afterFirstScreen(() => {
      void cacheShell();
      warmSchedule();
    });
  };
  navigator.serviceWorker.addEventListener("controllerchange", boot);
  void navigator.serviceWorker.ready.then(() => {
    if (navigator.serviceWorker.controller) boot();
  });
  window.addEventListener("online", () => afterFirstScreen(() => warmSchedule()));
}

/** Собирает рейсы остановки из сохранённых маршрутов на сегодняшний день, без даты в адресе. */
export async function departuresFromSchedule(stopId: number, now = new Date()): Promise<BuiltBoard | null> {
  if (!("caches" in window)) return null;
  const cache = await caches.open(SCHEDULE);
  const keys = await cache.keys();
  let stops: StopRef[] = [];
  const details: RouteDetail[] = [];
  for (const key of keys) {
    const path = new URL(key.url).pathname;
    const response = await cache.match(key);
    if (!response) continue;
    if (path === "/api/stops") {
      const body = (await response.json()) as { stops?: StopRef[] };
      stops = body.stops ?? stops;
    } else if (/^\/api\/routes\/[^/]+$/.test(path)) {
      const body = (await response.json()) as RouteDetail;
      if (body.route && body.directions) details.push(body);
    }
  }
  if (details.length === 0) return null;
  return departuresFromRoutes(stopId, details, stops, now);
}

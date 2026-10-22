import { useEffect, useState } from "react";
import type { Departure, Kind, RouteDetail, StopRef } from "./api.ts";
import { minskDateIso, patternMatchesToday } from "./clock.ts";

const SCHEDULE = "busnow-schedule-v1";
const SHELL = "busnow-shell-v1";
const WARMED = "busnow.schedule-warmed";

let warming: Promise<void> | null = null;

export function departuresPath(stopId: number, now = new Date()): string {
  return `/api/stops/${stopId}/departures?date=${minskDateIso(now)}`;
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
  const response = await fetch(path, { credentials: "include", headers: { "X-BusNow": "1" } });
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
    await Promise.all([next(), next(), next(), next()]);
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

export function startOffline(): void {
  if (!("serviceWorker" in navigator)) return;
  const boot = () => {
    void cacheShell();
    warmSchedule();
  };
  navigator.serviceWorker.addEventListener("controllerchange", boot);
  void navigator.serviceWorker.ready.then(() => {
    if (navigator.serviceWorker.controller) boot();
  });
  window.addEventListener("online", () => warmSchedule());
}

type Built = {
  stop: StopRef;
  date: string;
  timezone: "Europe/Minsk";
  departures: Departure[];
};

/** Собирает рейсы остановки из сохранённых маршрутов, если сеть недоступна. */
export async function departuresFromSchedule(stopId: number): Promise<Built | null> {
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

  const known = stops.find((stop) => stop.id === stopId);
  let name = known?.name ?? "";
  let slug = known?.slug ?? "";
  const seen = new Set<string>();
  const departures: Departure[] = [];
  let id = 1;
  for (const detail of details) {
    detail.directions.forEach((direction, directionPos) => {
      for (const pattern of direction.patterns) {
        if (!patternMatchesToday(pattern.name)) continue;
        const stop = pattern.stops.find((item) => item.id === stopId);
        if (!stop) continue;
        if (!name) {
          name = stop.name;
          slug = stop.slug;
        }
        for (const time of stop.times) {
          const stamp = `${detail.route.slug}:${directionPos}:${time}`;
          if (seen.has(stamp)) continue;
          seen.add(stamp);
          departures.push({
            id: id,
            departs: time,
            direction: direction.name,
            directionPos,
            pattern: pattern.name,
            routeCode: detail.route.code,
            routeSlug: detail.route.slug,
            kind: detail.route.kind as Kind,
            title: detail.route.title,
          });
          id += 1;
        }
      }
    });
  }
  if (!name) return null;
  departures.sort(
    (a, b) => a.departs.localeCompare(b.departs) || a.routeCode.localeCompare(b.routeCode, "ru", { numeric: true }),
  );
  return { stop: { id: stopId, name, slug }, date: minskDateIso(), timezone: "Europe/Minsk", departures };
}

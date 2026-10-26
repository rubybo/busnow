const SHELL = "busnow-shell-v1";
const SCHEDULE = "busnow-schedule-v2";
const PRECACHE = ["/", "/favicon.svg"]; // busnow-precache

function isScheduleGet(url) {
  const path = url.pathname;
  return (
    path === "/api/stops" ||
    path === "/api/routes" ||
    /^\/api\/routes\/[^/]+$/.test(path) ||
    /^\/api\/stops\/\d+\/departures$/.test(path)
  );
}

function isAsset(url) {
  return url.pathname.startsWith("/assets/") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".woff2");
}

function isStableSchedule(url) {
  const path = url.pathname;
  return path === "/api/stops" || path === "/api/routes" || /^\/api\/routes\/[^/]+$/.test(path);
}

function canStore(response, url) {
  if (!response || !response.ok) return false;
  const path = url.pathname;
  if (path.startsWith("/api/auth/") || path.startsWith("/api/me") || path.startsWith("/api/reminders") || path.startsWith("/api/push")) {
    return false;
  }
  const control = response.headers.get("cache-control") ?? "";
  return !/no-store|private/i.test(control);
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(SCHEDULE);
  const url = new URL(request.url);
  const cached = await cache.match(request);
  const refreshing = fetch(request)
    .then((response) => {
      if (canStore(response, url)) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  if (cached) {
    event.waitUntil(refreshing.catch(() => undefined));
    return cached;
  }
  const fresh = await refreshing;
  if (fresh) return fresh;
  return new Response(JSON.stringify({ error: "Нет сети" }), {
    status: 503,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const url = new URL(request.url);
  try {
    const fresh = await fetch(request);
    if (canStore(fresh, url)) await cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await cache.match("/");
      if (shell) return shell;
    }
    return new Response(JSON.stringify({ error: "Нет сети" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}

async function asset(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok && canStore(response, new URL(request.url))) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached || new Response("", { status: 504 }));
  return cached || fresh;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, SCHEDULE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)));
      const schedule = await caches.open(SCHEDULE);
      const saved = await schedule.keys();
      await Promise.all(
        saved
          .filter((key) => {
            const path = new URL(key.url).pathname;
            return path.startsWith("/api/auth/") || path.startsWith("/api/me") || path.startsWith("/api/reminders") || path.startsWith("/api/push");
          })
          .map((key) => schedule.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

let reminderTimer = 0;

async function shownReminders() {
  try {
    return await self.registration.getNotifications({ includeTriggered: true });
  } catch {
    return await self.registration.getNotifications();
  }
}

function noteText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function reminderItems(raw) {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const latest = now + 36 * 60 * 60 * 1000;
  const items = [];
  for (const item of raw) {
    if (items.length >= 40) break;
    if (!item || typeof item !== "object") continue;
    const body = noteText(item.body, 180);
    if (!Number.isFinite(item.at) || item.at <= now || item.at > latest) continue;
    if (typeof item.tag !== "string" || !/^reminder-\d{1,12}-\d{4}-\d{2}-\d{2}$/.test(item.tag)) continue;
    if (!body) continue;
    items.push({ at: item.at, tag: item.tag, title: "BusNow", body });
  }
  return items;
}

async function scheduleReminders(items) {
  const notes = await shownReminders();
  const keep = new Set(items.map((item) => item.tag));
  for (const note of notes) {
    if (typeof note.tag === "string" && note.tag.startsWith("reminder-") && !keep.has(note.tag)) note.close();
  }
  if (reminderTimer) clearTimeout(reminderTimer);
  const Trigger = globalThis.TimestampTrigger;
  if (typeof Trigger === "function") {
    await Promise.all(
      items.map((item) =>
        self.registration.showNotification(item.title, {
          body: item.body,
          tag: item.tag,
          lang: "ru",
          icon: "/favicon.svg",
          showTrigger: new Trigger(item.at),
        }),
      ),
    );
    return;
  }
  const next = items.filter((item) => item.at > Date.now()).sort((a, b) => a.at - b.at)[0];
  if (!next) return;
  reminderTimer = setTimeout(() => {
    void self.registration.showNotification(next.title, {
      body: next.body,
      tag: next.tag,
      lang: "ru",
      icon: "/favicon.svg",
    });
  }, Math.min(next.at - Date.now(), 2147000000));
}

function senderOrigin(event) {
  if (event.origin) return event.origin;
  if (event.source && typeof event.source.url === "string") {
    try {
      return new URL(event.source.url).origin;
    } catch {
      return "";
    }
  }
  return "";
}

self.addEventListener("message", (event) => {
  if (senderOrigin(event) !== self.location.origin) return;
  if (!event.source) return;
  if (event.data?.type !== "busnow:reminders") return;
  const items = reminderItems(event.data.items);
  event.waitUntil(scheduleReminders(items));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/api/status/online") return;
  if (url.pathname.startsWith("/@") || url.pathname.startsWith("/src/") || url.pathname.startsWith("/node_modules/")) return;

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    event.waitUntil(
      caches.open(SCHEDULE).then(async (cache) => {
        const keys = await cache.keys();
        await Promise.all(keys.filter((key) => key.url.includes("/api/auth/me")).map((key) => cache.delete(key)));
      }),
    );
    return;
  }

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL));
    return;
  }
  if (isStableSchedule(url)) {
    event.respondWith(staleWhileRevalidate(event, request));
    return;
  }
  if (isScheduleGet(url)) {
    event.respondWith(networkFirst(request, SCHEDULE));
    return;
  }
  if (isAsset(url)) event.respondWith(asset(request));
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let body = "Скоро отправление";
      if (event.data) {
        try {
          const data = event.data.json();
          const text = noteText(data.body, 180);
          if (text) body = text;
        } catch {
          const text = noteText(event.data.text(), 180);
          if (text) body = text;
        }
      }
      await self.registration.showNotification("BusNow", {
        body,
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        tag: "busnow-reminder",
        renotify: true,
        lang: "ru",
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow("/");
    }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const client = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const item of client) {
        item.postMessage({ type: "busnow:resubscribe" });
      }
    })(),
  );
});

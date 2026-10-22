const SHELL = "busnow-shell-v1";
const SCHEDULE = "busnow-schedule-v1";

function isScheduleGet(url) {
  const path = url.pathname;
  return (
    path === "/api/stops" ||
    path === "/api/routes" ||
    path === "/api/auth/me" ||
    /^\/api\/routes\/[^/]+$/.test(path) ||
    /^\/api\/stops\/\d+\/departures$/.test(path)
  );
}

function isAsset(url) {
  return url.pathname.startsWith("/assets/") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".woff2");
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) await cache.put(request, fresh.clone());
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
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached || new Response("", { status: 504 }));
  return cached || fresh;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(["/", "/favicon.svg"]).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, SCHEDULE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
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
  if (isScheduleGet(url)) {
    event.respondWith(networkFirst(request, SCHEDULE));
    return;
  }
  if (isAsset(url)) event.respondWith(asset(request));
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let title = "BusNow";
      let body = "Скоро отправление";
      if (event.data) {
        try {
          const data = event.data.json();
          if (data.title) title = data.title;
          if (data.body) body = data.body;
        } catch {
          const text = event.data.text();
          if (text) body = text;
        }
      }
      await self.registration.showNotification(title, {
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

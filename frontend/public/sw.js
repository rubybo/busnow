self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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

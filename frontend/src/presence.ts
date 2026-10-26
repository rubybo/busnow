const EVERY_MS = 45_000;

function ping(): void {
  if (!navigator.onLine || document.visibilityState === "hidden") return;
  void fetch("/api/status/online", {
    credentials: "include",
    cache: "no-store",
    keepalive: true,
    priority: "low",
    headers: { "X-BusNow": "1" },
  }).catch(() => undefined);
}

/** Checks in while the tab is visible so /api/status/online can count the visit. */
export function startPresence(): void {
  const flag = globalThis as { busnowPresence?: boolean };
  if (flag.busnowPresence) return;
  flag.busnowPresence = true;
  ping();
  window.setInterval(ping, EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") ping();
  });
  window.addEventListener("online", ping);
}

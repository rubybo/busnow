import { api } from "./api.ts";

export type PushStatus = "ok" | "unsupported" | "denied" | "error";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js?v=6", { scope: "/", updateViaCache: "none" });
  } catch {
    return null;
  }
}

async function saveSubscription(registration: ServiceWorkerRegistration, publicKey: string): Promise<PushStatus> {
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return "error";
  await api("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
  return "ok";
}

/** Запрашивает разрешение и сохраняет push-подписку на сервере. */
export async function ensurePushSubscription(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";

  const permission = Notification.permission === "granted"
    ? "granted"
    : Notification.permission === "denied"
      ? "denied"
      : await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const registration = (await navigator.serviceWorker.getRegistration("/")) ?? (await registerServiceWorker());
  if (!registration) return "error";
  await navigator.serviceWorker.ready;

  const { publicKey } = await api<{ publicKey: string }>("/api/push/subscribe");
  return saveSubscription(registration, publicKey);
}

/** Сбрасывает старую подписку и создаёт новую (помогает после обновления SW или VAPID). */
export async function refreshPushSubscription(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";
  }
  const registration = (await navigator.serviceWorker.getRegistration("/")) ?? (await registerServiceWorker());
  if (!registration) return "error";
  await navigator.serviceWorker.ready;
  const old = await registration.pushManager.getSubscription();
  if (old) await old.unsubscribe();
  const { publicKey } = await api<{ publicKey: string }>("/api/push/subscribe");
  return saveSubscription(registration, publicKey);
}

export function initPushListeners(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "busnow:resubscribe") void refreshPushSubscription();
  });
}

function pushStatusError(status: PushStatus): Error {
  if (status === "denied") return new Error("Разрешите уведомления в браузере");
  if (status === "unsupported") return new Error("Браузер не поддерживает уведомления");
  return new Error("Не удалось подключить уведомления");
}

/** Локальная проверка + push с сервера. */
export async function sendTestNotification(): Promise<void> {
  const status = await refreshPushSubscription();
  if (status !== "ok") throw pushStatusError(status);

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification("BusNow", {
    body: "Проверка: уведомления в браузере работают",
    icon: "/favicon.svg",
    tag: "busnow-test-local",
    lang: "ru",
  });

  await api("/api/push/test", { method: "POST", body: "{}" });
}

export async function syncPushIfNeeded(hasReminders: boolean): Promise<void> {
  if (!hasReminders || !pushSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    await ensurePushSubscription();
  } catch {
    // сеть или временная ошибка — повторим при следующем заходе
  }
}

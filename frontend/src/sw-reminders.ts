import { minskDateIso, reminderAt } from "./clock.ts";
import type { StoredReminder } from "./profile-store.ts";

export type ScheduledReminder = {
  id: number;
  at: number;
  tag: string;
  title: string;
  body: string;
};

function kindLabel(routeCode: string): string {
  return routeCode.endsWith("Тк") ? "маршрутка" : "автобус";
}

export function scheduledReminders(reminders: StoredReminder[], now = new Date()): ScheduledReminder[] {
  const date = minskDateIso(now);
  const items: ScheduledReminder[] = [];
  for (const item of reminders) {
    const lead = item.leadMinutes || 10;
    const at = reminderAt(item.departs, lead, now);
    if (at == null) continue;
    items.push({
      id: item.id,
      at,
      tag: `reminder-${item.id}-${date}`,
      title: "BusNow",
      body: `Через ${lead} мин ${kindLabel(item.routeCode)} ${item.routeCode} от «${item.stopName}», ${item.departs}`,
    });
  }
  return items.sort((a, b) => a.at - b.at);
}

/** Просит сервис-воркер показать напоминание в срок, даже если вкладка закрыта и сети нет. */
export function publishReminders(reminders: StoredReminder[], now = new Date()): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const message = { type: "busnow:reminders", items: scheduledReminders(reminders, now) };
  const post = (worker: ServiceWorker | null) => worker?.postMessage(message);
  post(navigator.serviceWorker.controller);
  void navigator.serviceWorker.ready.then((registration) => post(registration.active));
}

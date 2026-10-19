import { isReminderDue, minskDateIso, minskMinutes } from "./clock.ts";

export type LocalReminder = {
  id: number;
  stopName: string;
  routeCode: string;
  direction: string;
  departs: string;
  leadMinutes: number;
};

let timer: ReturnType<typeof setInterval> | null = null;

function kindLabel(routeCode: string): string {
  return routeCode.endsWith("Тк") ? "маршрутка" : "автобус";
}

function tick(reminders: LocalReminder[]): void {
  if (!reminders.length || Notification.permission !== "granted") return;
  const now = new Date();
  const nowMinutes = minskMinutes(now);
  const today = minskDateIso(now);

  for (const item of reminders) {
    const lead = item.leadMinutes || 10;
    if (!isReminderDue(nowMinutes, item.departs, lead)) continue;
    const key = `busnow.local.${item.id}.${today}`;
    if (localStorage.getItem(key)) continue;
    localStorage.setItem(key, "1");
    const body = `Через ${lead} мин ${kindLabel(item.routeCode)} ${item.routeCode} от «${item.stopName}», ${item.departs}`;
    try {
      new Notification("BusNow", { body, icon: "/favicon.svg", tag: `reminder-${item.id}`, lang: "ru" });
    } catch {
      // ignore
    }
  }
}

/** Пока вкладка открыта — системное уведомление без push-сервера. */
export function syncLocalReminders(reminders: LocalReminder[], active: boolean): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (!active || !("Notification" in window)) return;
  const run = () => tick(reminders);
  run();
  timer = setInterval(run, 30_000);
}

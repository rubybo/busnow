import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { getDb } from "./db.ts";
import { minskClock } from "./schedule.ts";
import { HttpError } from "./http.ts";
import { deletePush, dueReminders, markReminderSent } from "./users.ts";

type Keys = { publicKey: string; privateKey: string };

function keysPath(): string {
  return path.join(process.cwd(), "data", "vapid.json");
}

export function vapidKeys(): Keys {
  const file = keysPath();
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Keys;
  } catch {
    const keys = webpush.generateVAPIDKeys();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(keys));
    return keys;
  }
}

export async function sendDueReminders(now = new Date(), userId?: number): Promise<{ sent: number }> {
  const keys = vapidKeys();
  webpush.setVapidDetails("mailto:busnow@busnow.online", keys.publicKey, keys.privateKey);
  const db = getDb();
  const clock = minskClock(now);
  const due = dueReminders(db, now, userId);
  const sentIds = new Set<number>();
  for (const reminder of due) {
    const kind = reminder.routeCode.endsWith("Тк") ? "маршрутка" : "автобус";
    const payload = JSON.stringify({
      title: "BusNow",
      body: `Через ${reminder.leadMinutes} мин ${kind} ${reminder.routeCode} от «${reminder.stopName}», ${reminder.departs}`,
    });
    try {
      await webpush.sendNotification(
        { endpoint: reminder.endpoint, keys: { p256dh: reminder.p256dh, auth: reminder.auth } },
        payload,
        { urgency: "high", TTL: 120 },
      );
      if (!sentIds.has(reminder.id)) {
        markReminderSent(db, reminder.id, clock.date);
        sentIds.add(reminder.id);
      }
    } catch (error) {
      const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (status === 404 || status === 410) {
        const row = db
          .prepare("SELECT user_id FROM push_subscriptions WHERE endpoint = ?")
          .get(reminder.endpoint) as { user_id: number } | undefined;
        if (row) deletePush(db, row.user_id, reminder.endpoint);
      } else {
        console.error(error);
      }
    }
  }
  return { sent: sentIds.size };
}

export async function sendTestPush(userId: number): Promise<void> {
  const keys = vapidKeys();
  webpush.setVapidDetails("mailto:busnow@busnow.online", keys.publicKey, keys.privateKey);
  const db = getDb();
  const rows = db
    .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
    .all(userId) as Array<{ endpoint: string; p256dh: string; auth: string }>;
  if (rows.length === 0) throw new HttpError(400, "Сначала разрешите уведомления на сайте");
  const payload = JSON.stringify({
    title: "BusNow",
    body: "Проверка: уведомления работают",
  });
  let ok = false;
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
        { urgency: "high", TTL: 120 },
      );
      ok = true;
    } catch (error) {
      const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (status === 404 || status === 410) deletePush(db, userId, row.endpoint);
      else console.error(error);
    }
  }
  if (!ok) throw new HttpError(502, "Не удалось отправить push — разрешите уведомления ещё раз");
}

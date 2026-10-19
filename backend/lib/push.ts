import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { getDb } from "./db.ts";
import { minskClock } from "./schedule.ts";
import { dueReminders, markReminderSent } from "./users.ts";

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

export async function sendDueReminders(now = new Date()): Promise<{ sent: number }> {
  const keys = vapidKeys();
  webpush.setVapidDetails("mailto:busnow@busnow.online", keys.publicKey, keys.privateKey);
  const db = getDb();
  const clock = minskClock(now);
  const due = dueReminders(db, now);
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
      );
      if (!sentIds.has(reminder.id)) {
        markReminderSent(db, reminder.id, clock.date);
        sentIds.add(reminder.id);
      }
    } catch (error) {
      console.error(error);
    }
  }
  return { sent: sentIds.size };
}

import { getDb } from "../lib/db.ts";
import { sendTestPush } from "../lib/push.ts";
import webpush from "web-push";
import { vapidKeys } from "../lib/push.ts";

const db = getDb();
const subs = db.prepare("SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions").all() as Array<{
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}>;
console.log("subscriptions:", subs.length);
const keys = vapidKeys();
webpush.setVapidDetails("mailto:busnow@busnow.online", keys.publicKey, keys.privateKey);

async function main(): Promise<void> {
  for (const sub of subs) {
    console.log("user", sub.user_id, sub.endpoint.slice(0, 72) + "...");
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: "BusNow", body: "CLI test" }),
      );
      console.log("  -> OK");
    } catch (error) {
      console.log("  -> FAIL", error);
    }
  }

  if (subs[0]) {
    try {
      await sendTestPush(subs[0].user_id);
      console.log("sendTestPush OK");
    } catch (error) {
      console.log("sendTestPush error", error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

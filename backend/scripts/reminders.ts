import { sendDueReminders } from "../lib/push.ts";

const result = await sendDueReminders();
console.log(`Отправлено напоминаний: ${result.sent}`);

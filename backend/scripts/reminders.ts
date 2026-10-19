import { sendDueReminders } from "../lib/push.ts";

sendDueReminders()
  .then((result) => console.log(`Отправлено напоминаний: ${result.sent}`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

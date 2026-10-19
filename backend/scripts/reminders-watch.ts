import { sendDueReminders } from "../lib/push.ts";

const everyMs = 30_000;

async function loop(): Promise<void> {
  console.log(`Проверка напоминаний каждые ${everyMs / 1000} с…`);
  for (;;) {
    try {
      const result = await sendDueReminders();
      if (result.sent > 0) console.log(`Отправлено: ${result.sent}`);
    } catch (error) {
      console.error(error);
    }
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
}

void loop();

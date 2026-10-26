import { sendDueReminders } from "./push.ts";

const globalClock = globalThis as unknown as { busnowReminderClock?: boolean };

/** Sends due pushes about once a minute. Open tabs do not poll for this. */
export function startReminderClock(): void {
  if (globalClock.busnowReminderClock) return;
  globalClock.busnowReminderClock = true;
  const tick = () => {
    void sendDueReminders().catch((error) => console.error("[busnow] reminders", error));
  };
  tick();
  const timer = setInterval(tick, 60_000);
  timer.unref();
}

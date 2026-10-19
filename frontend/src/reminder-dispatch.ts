import { api } from "./api.ts";

let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  void api<{ sent: number }>("/api/reminders/dispatch", { method: "POST", body: "{}" }).catch(() => undefined);
}

/** Каждую минуту шлёт push, если открыт сайт (дополнение к cron на сервере). */
export function syncReminderDispatch(active: boolean): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (!active) return;
  tick();
  timer = setInterval(tick, 30_000);
}

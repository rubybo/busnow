export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startReminderClock } = await import("./lib/reminder-clock.ts");
  startReminderClock();
}

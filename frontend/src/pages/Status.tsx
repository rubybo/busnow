import { clockMinutes } from "../clock.ts";

export function NowStatus({
  nextTime,
  onShowHour,
}: {
  nextTime: string | null;
  onShowHour: (hour: number) => void;
}) {
  if (!nextTime) {
    return (
      <section className="status" aria-live="polite">
        <p className="status-title">На сегодня рейсов больше нет</p>
      </section>
    );
  }
  const hour = Math.floor(clockMinutes(nextTime) / 60);
  const label = `${String(hour).padStart(2, "0")}:00`;
  return (
    <section className="status" aria-live="polite">
      <p className="status-title">Сейчас отправлений нет</p>
      <p className="status-next">Следующий рейс в {nextTime}</p>
      <button type="button" className="status-jump" onClick={() => onShowHour(hour)}>
        Показать {label}
      </button>
    </section>
  );
}

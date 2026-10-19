import { useEffect, useState } from "react";
import type { Departure } from "../data.ts";

function minutesUntil(time: string, now: Date): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute - (now.getHours() * 60 + now.getMinutes());
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function Countdown({ minutes }: { minutes: number }) {
  const radius = 30;
  const length = 2 * Math.PI * radius;
  const share = Math.min(Math.max(minutes, 0), 60) / 60;
  const soon = minutes <= 5;
  const hours = Math.round(minutes / 60);
  const value = minutes < 60 ? String(minutes) : String(hours);
  const unit = minutes < 60 ? "мин" : "ч";
  return (
    <div className={soon ? "ring soon" : "ring"} role="img" aria-label={`Через ${value} ${unit}`}>
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r={radius} className="ring-track" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          className="ring-fill"
          strokeDasharray={length}
          strokeDashoffset={length * share}
        />
      </svg>
      <span className="ring-value">
        {value}
        <small>{unit}</small>
      </span>
    </div>
  );
}

export function Next({ rows }: { rows: Departure[] }) {
  const now = useNow();
  const [row, ...later] = rows;
  const minutes = minutesUntil(row.time, now);
  const [from, to] = row.direction.split(" → ");

  return (
    <section className="next" aria-label="Ближайший рейс">
      <p className="next-label">Ближайший</p>

      <div className="next-main">
        <p className="next-time time">{row.time}</p>
        <Countdown minutes={minutes} />
      </div>

      <div className="next-route">
        <span className="badge">{row.route}</span>
        <span className="leg">
          <span className="leg-stop">{from}</span>
          <span className="leg-line" aria-hidden="true" />
          <span className="leg-stop">{to ?? ""}</span>
        </span>
      </div>

      {later.length > 0 ? (
        <div className="next-then">
          <span>Затем</span>
          <ul>
            {later.slice(0, 2).map((item) => (
              <li key={item.id}>
                <span className="time">{item.time}</span>
                <b>{item.route}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function RouteArt() {
  return (
    <svg className="route-art" viewBox="0 0 342 120" aria-hidden="true">
      <path
        d="M24 92 C 90 92, 92 28, 160 28 S 250 92, 318 40"
        fill="none"
        stroke="var(--line)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M24 92 C 90 92, 92 28, 160 28" fill="none" stroke="var(--ink)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="24" cy="92" r="9" fill="var(--surface)" stroke="var(--ink)" strokeWidth="4" />
      <circle cx="318" cy="40" r="9" fill="var(--surface)" stroke="var(--line)" strokeWidth="4" />
      <circle cx="160" cy="28" r="14" fill="var(--ink)" />
      <circle cx="160" cy="28" r="5" fill="var(--surface)" />
    </svg>
  );
}

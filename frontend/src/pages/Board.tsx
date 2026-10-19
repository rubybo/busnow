import { useEffect, useState, type ReactNode } from "react";
import type { Departure } from "../data.ts";

type BoardProps = {
  rows: Departure[];
  variant: "home" | "day";
  aside?: (row: Departure, past: boolean) => ReactNode;
};

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function minutesOf(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function relative(minutes: number): string {
  if (minutes <= 0) return "отправляется";
  if (minutes < 60) return `через ${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `через ${hours} ч` : `через ${hours} ч ${rest} мин`;
}

export function Board({ rows, variant, aside }: BoardProps) {
  const now = useNow();
  const current = now.getHours() * 60 + now.getMinutes();
  const nextId = rows.find((row) => minutesOf(row.time) >= current)?.id;

  return (
    <div className={variant === "day" ? "card day-board" : "card"}>
      {rows.map((row) => {
        const left = minutesOf(row.time) - current;
        const past = left < 0;
        const next = row.id === nextId;
        const [from, to] = row.direction.split(" → ");
        return (
          <div key={row.id} className={["trip", past && "past", next && "is-next"].filter(Boolean).join(" ")}>
            <p className="time">{row.time}</p>
            <div className="trip-body">
              <p className="line">
                <span className={`badge ${row.kind === "bus" ? "bus" : "minibus"}`}>{row.route}</span>
                <span className="dir">
                  {from}
                  {to ? <span className="arrow"> → </span> : null}
                  {to}
                </span>
              </p>
              <p className="meta">
                {past ? <span>ушёл</span> : left < 60 || next ? <span className="rel">{relative(left)}</span> : null}
                <span>{row.days}</span>
              </p>
            </div>
            {aside ? aside(row, past) : null}
          </div>
        );
      })}
      {nextId === undefined ? <p className="trip done">На сегодня рейсов больше нет</p> : null}
    </div>
  );
}

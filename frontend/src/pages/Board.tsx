import type { ReactNode } from "react";
import { clockMinutes, dayTag, waitLabel } from "../clock.ts";
import type { Departure } from "../data.ts";

type BoardProps = {
  rows: Departure[];
  variant: "home" | "day";
  nowMinutes: number;
  soonId: string | null;
  aside?: (row: Departure, past: boolean) => ReactNode;
};

function groupByDirection(rows: Departure[]): Array<{ direction: string; rows: Departure[] }> {
  const groups: Array<{ direction: string; rows: Departure[] }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.direction === row.direction) last.rows.push(row);
    else groups.push({ direction: row.direction, rows: [row] });
  }
  return groups;
}

export function Board({ rows, variant, nowMinutes, soonId, aside }: BoardProps) {
  const groups = groupByDirection(rows);

  return (
    <div className={variant === "day" ? "card day-board" : "card"}>
      {groups.map((group) => (
        <section key={`${group.direction}-${group.rows[0]?.id}`} className="dir-group">
          <h2 className="dir-name">{group.direction}</h2>
          {group.rows.map((row) => {
            const left = clockMinutes(row.time) - nowMinutes;
            const past = left < 0;
            const soon = row.id === soonId;
            const days = dayTag(row.days);
            return (
              <div key={row.id} className={["trip", past && "past", soon && "is-next"].filter(Boolean).join(" ")}>
                <p className="time">{row.time}</p>
                <div className="trip-body">
                  <p className="line">
                    <span className={`badge ${row.kind === "bus" ? "bus" : "minibus"}`}>{row.route}</span>
                    {row.kind === "minibus" ? <span className="kind-label">маршрутка</span> : null}
                    <span className={`day-tag ${days.tone}`}>{days.text}</span>
                    {soon ? <span className="wait-tag">{waitLabel(left)}</span> : null}
                    {past ? <span className="gone-tag">ушёл</span> : null}
                  </p>
                </div>
                {aside ? aside(row, past) : null}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

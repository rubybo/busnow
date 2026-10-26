export const TIMEZONE = "Europe/Minsk";

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const SHORT: Record<string, Weekday> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

export type Clock = { date: string; minutes: number; weekday: Weekday };

export function minskClock(instant: Date): Clock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(instant);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = SHORT[pick("weekday")];
  if (!weekday) throw new Error(`Unknown weekday ${pick("weekday")}`);
  const hour = Number(pick("hour"));
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    minutes: hour * 60 + Number(pick("minute")),
    weekday,
  };
}

export function isCalendarDate(isoDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) return false;
  const stamp = new Date(Date.UTC(year, month - 1, day));
  return stamp.getUTCFullYear() === year && stamp.getUTCMonth() === month - 1 && stamp.getUTCDate() === day;
}

export function weekdayOf(isoDate: string): Weekday {
  if (!isCalendarDate(isoDate)) throw new Error("Дата задаётся как ГГГГ-ММ-ДД");
  return minskClock(new Date(`${isoDate}T12:00:00+03:00`)).weekday;
}

export function clockMinutes(hhmm: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new Error(`Время задаётся как ЧЧ:ММ, получено ${hhmm}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Некорректное время ${hhmm}`);
  return hour * 60 + minute;
}

export function formatMinutes(total: number): string {
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** True from `leadMinutes` before departure until a few minutes after. The process checks about once a minute. */
export function isReminderDue(nowMinutes: number, departs: string, leadMinutes: number): boolean {
  const target = clockMinutes(departs) - leadMinutes;
  if (target < 0) return false;
  const delta = nowMinutes - target;
  return delta >= 0 && delta < 5;
}

/** Soonest upcoming departure in each direction of one route. Other rows stay without a forecast. */
export function nextDepartureIds(
  rows: Array<{ id: number; routeSlug: string; directionPos: number; departs: string }>,
  now: string,
  routeSlug: string,
): Set<number> {
  const best = new Map<number, { id: number; departs: string }>();
  for (const row of rows) {
    if (row.routeSlug !== routeSlug || row.departs < now) continue;
    const current = best.get(row.directionPos);
    if (!current || row.departs < current.departs) best.set(row.directionPos, { id: row.id, departs: row.departs });
  }
  return new Set([...best.values()].map((row) => row.id));
}

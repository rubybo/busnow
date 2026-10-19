import { useEffect, useState } from "react";

/** A departure this far ahead is still “the next one”. Beyond that, the day has a gap. */
export const SOON_MINUTES = 90;

export type HourPick = "now" | number;

export function minskMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Minsk",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return pick("hour") * 60 + pick("minute");
}

export function useMinskMinutes(): number {
  const [minutes, setMinutes] = useState(() => minskMinutes(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setMinutes(minskMinutes(new Date())), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return minutes;
}

export function minskIsWeekend(now: Date = new Date()): boolean {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Minsk", weekday: "short" }).format(now);
  return day === "Sat" || day === "Sun";
}

export function clockMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

export function minskDateIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Minsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** Совпадает с логикой на сервере (окно ~5 мин для опроса). */
export function isReminderDue(nowMinutes: number, departs: string, leadMinutes: number): boolean {
  const target = clockMinutes(departs) - leadMinutes;
  if (target < 0) return false;
  const delta = nowMinutes - target;
  return delta >= 0 && delta < 5;
}

export function hoursOf(times: string[]): number[] {
  return [...new Set(times.map((time) => Math.floor(clockMinutes(time) / 60)))].sort((a, b) => a - b);
}

export function filterByHour<T extends { time: string }>(rows: T[], pick: HourPick, nowMin: number): T[] {
  if (pick === "now") {
    return rows.filter((row) => {
      const left = clockMinutes(row.time) - nowMin;
      return left >= 0 && left <= SOON_MINUTES;
    });
  }
  return rows.filter((row) => Math.floor(clockMinutes(row.time) / 60) === pick);
}

export function nextUpcoming<T extends { time: string }>(rows: T[], nowMin: number): T | null {
  return rows.find((row) => clockMinutes(row.time) >= nowMin) ?? null;
}

export function waitLabel(minutes: number): string {
  if (minutes <= 0) return "отправляется";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `через ${rest} мин.`;
  if (rest === 0) return `через ${hours} ч.`;
  return `через ${hours} ч. ${rest} мин.`;
}

export function agoLabel(minutes: number): string {
  if (minutes <= 0) return "только что";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} мин. назад`;
  if (rest === 0) return `${hours} ч. назад`;
  return `${hours} ч. ${rest} мин. назад`;
}

export function minskWeekday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Minsk", weekday: "short" })
    .format(now)
    .toLowerCase();
}

export function patternMatchesToday(patternName: string, now: Date = new Date()): boolean {
  const wd = minskWeekday(now); // sun, mon, tue, wed, thu, fri, sat
  const p = patternName.toLocaleLowerCase("ru");
  if (p.includes("ежеднев") || p.includes("каждый")) return true;
  if (p.includes("пн-сб")) return wd !== "sun";
  if (p.includes("пн-чт")) return wd === "mon" || wd === "tue" || wd === "wed" || wd === "thu";
  if (p.includes("пятниц")) return wd === "fri";
  if (p.includes("суббот")) return wd === "sat";
  if (p.includes("воскрес")) return wd === "sun";
  if (p.includes("пн,ср,пт")) return wd === "mon" || wd === "wed" || wd === "fri";
  if (p.includes("вт,чт")) return wd === "tue" || wd === "thu";
  if (p.includes("выход")) return wd === "sat" || wd === "sun";
  if (p.includes("будн") || p.includes("рабоч")) return wd !== "sat" && wd !== "sun";
  return true;
}

export function dayTag(days: string): { text: string; tone: "weekday" | "weekend" | "daily" } {
  const value = days.toLocaleLowerCase("ru");
  if (value.includes("выход") || value.includes("суббот") || value.includes("воскрес")) {
    return { text: days, tone: "weekend" };
  }
  if (value.includes("ежеднев") || value.includes("каждый")) return { text: "ежедневно", tone: "daily" };
  if (value.includes("рабоч") || value.includes("будн")) return { text: "будни", tone: "weekday" };
  return { text: days, tone: "weekday" };
}

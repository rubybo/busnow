import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { climateSky, type Sky } from "./forecast.ts";
import { minskClock } from "./schedule.ts";

const FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=55.532&longitude=28.665&current=temperature_2m,precipitation,snowfall,wind_speed_10m,weather_code&hourly=temperature_2m,precipitation,snowfall&past_days=14&forecast_days=1&wind_speed_unit=ms&timezone=Europe%2FMinsk";
const TTL = 30 * 60 * 1000;

type Cache = { at: number; sky: Sky };

type Hourly = {
  time?: string[];
  temperature_2m?: Array<number | null>;
  precipitation?: Array<number | null>;
  snowfall?: Array<number | null>;
};

let memory: Cache | null = null;

function cacheFile(): string {
  const direct = path.join(process.cwd(), "data");
  const nested = path.join(process.cwd(), "backend", "data");
  const dir = existsSync(direct) ? direct : nested;
  return path.join(dir, "weather-now.json");
}

function monthNow(): number {
  return Number(minskClock(new Date()).date.slice(5, 7));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function previousDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const stamp = new Date(Date.UTC(year, month - 1, day));
  stamp.setUTCDate(stamp.getUTCDate() - 1);
  return stamp.toISOString().slice(0, 10);
}

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function fresh(sky: Sky | undefined): sky is Sky {
  return !!sky && Number.isFinite(sky.precip3h) && Number.isFinite(sky.tempVsYdayMorn) && Number.isFinite(sky.firstFrost);
}

function memoryOf(hourly: Hourly, date: string, hour: number, temp: number, precip: number, snow: number): Pick<Sky, "precip3h" | "snow3h" | "tempVsYdayMorn" | "firstFrost"> {
  const times = hourly.time ?? [];
  const stamp = `${date}T${pad(hour)}:00`;
  let index = times.indexOf(stamp);
  if (index < 0) {
    index = -1;
    for (let cursor = times.length - 1; cursor >= 0; cursor -= 1) {
      if ((times[cursor] ?? "") <= stamp) {
        index = cursor;
        break;
      }
    }
  }
  if (index < 0) return { precip3h: precip, snow3h: snow, tempVsYdayMorn: 0, firstFrost: 0 };
  const prec = hourly.precipitation ?? [];
  const flakes = hourly.snowfall ?? [];
  const temps = hourly.temperature_2m ?? [];
  let precip3h = precip;
  let snow3h = snow;
  for (let cursor = Math.max(0, index - 2); cursor < index; cursor += 1) {
    precip3h += Math.max(0, num(prec[cursor]));
    snow3h += Math.max(0, num(flakes[cursor]));
  }
  const yesterday = times.indexOf(`${previousDate(date)}T08:00`);
  const morning = yesterday >= 0 ? temps[yesterday] : null;
  const tempVsYdayMorn = morning == null || !Number.isFinite(morning) ? 0 : temp - Number(morning);
  let firstFrost = 0;
  const hourOfDay = Number(times[index]?.slice(11, 13));
  const day = times[index]?.slice(0, 10) ?? "";
  if (hourOfDay >= 6 && hourOfDay <= 10 && day) {
    let todayMin = Infinity;
    const dayLow = new Map<string, number>();
    for (let cursor = 0; cursor <= index; cursor += 1) {
      const value = temps[cursor];
      const cursorDay = times[cursor]?.slice(0, 10) ?? "";
      if (typeof value !== "number" || !Number.isFinite(value) || !cursorDay) continue;
      if (cursorDay === day) todayMin = Math.min(todayMin, value);
      else if (cursor < index) dayLow.set(cursorDay, Math.min(dayLow.get(cursorDay) ?? Infinity, value));
    }
    let priorMin = Infinity;
    let priorDays = 0;
    const [year, month, dayNum] = day.split("-").map(Number);
    for (let back = 1; back <= 14; back += 1) {
      const when = new Date(Date.UTC(year, month - 1, dayNum));
      when.setUTCDate(when.getUTCDate() - back);
      const low = dayLow.get(when.toISOString().slice(0, 10));
      if (low == null) {
        priorDays = 0;
        break;
      }
      priorMin = Math.min(priorMin, low);
      priorDays += 1;
    }
    if (priorDays === 14 && todayMin <= 0 && priorMin > 0) firstFrost = 1;
  }
  return { precip3h, snow3h, tempVsYdayMorn, firstFrost };
}

export async function currentWeather(): Promise<Sky> {
  const now = Date.now();
  if (memory && fresh(memory.sky) && now - memory.at < TTL) return memory.sky;
  try {
    const file = cacheFile();
    if (existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, "utf8")) as Cache;
      if (fresh(saved.sky) && now - saved.at < TTL) {
        memory = saved;
        return saved.sky;
      }
    }
  } catch {
    // A broken cache file just means we ask the weather service.
  }
  try {
    const response = await fetch(FORECAST_URL, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { current?: Record<string, number>; hourly?: Hourly };
    const current = body.current;
    if (!current || !Number.isFinite(current.temperature_2m)) throw new Error("empty");
    const clock = minskClock(new Date());
    const temp = Number(current.temperature_2m);
    const precip = Math.max(0, Number(current.precipitation) || 0);
    const snow = Math.max(0, Number(current.snowfall) || 0);
    const sky: Sky = {
      temp,
      precip,
      snow,
      wind: Math.max(0, Number(current.wind_speed_10m) || 0),
      code: Number(current.weather_code) || 0,
      ...memoryOf(body.hourly ?? {}, clock.date, Math.floor(clock.minutes / 60), temp, precip, snow),
    };
    memory = { at: now, sky };
    try {
      const file = cacheFile();
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(memory));
    } catch {
      // The answer is already in memory.
    }
    return sky;
  } catch {
    return climateSky(monthNow());
  }
}

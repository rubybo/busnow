import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatMinutes, weekdayOf, type Weekday } from "./schedule.ts";

export type Sky = {
  temp: number;
  precip: number;
  snow: number;
  wind: number;
  code: number;
  precip3h: number;
  snow3h: number;
  tempVsYdayMorn: number;
  firstFrost: number;
};

export type FillLevel = "free" | "standing" | "packed";

export type Forecast = {
  occupancy: number;
  level: FillLevel;
  label: string;
  detail: string;
  delayMin: number;
  delayP90: number;
  expected: string;
  hint: string;
  shortHint: string;
};

export type ForecastInput = {
  date: string;
  minute: number;
  sky: Sky;
  toPlant: number;
  fromPlant: number;
  bridge: number;
  minibus: number;
  stopFrac?: number;
  headwayMin?: number;
  rideMin?: number;
  atOrigin?: number;
  atTerminus?: number;
  hubRoutes?: number;
};

type Layer = { w: number[][]; b: number[] };

type CheckInput = {
  date: string;
  minute: number;
  temp: number;
  precip: number;
  snow: number;
  wind: number;
  code: number;
  precip3h: number;
  snow3h: number;
  tempVsYdayMorn: number;
  firstFrost: number;
  toPlant: number;
  fromPlant: number;
  bridge: number;
  minibus: number;
  stopFrac: number;
  headwayMin: number;
  rideMin: number;
  atOrigin: number;
  atTerminus: number;
  hubRoutes: number;
};

type Model = {
  features: string[];
  mean: number[];
  std: number[];
  trunk: Layer[];
  occupancy: Layer[];
  delay: Layer[];
  holidays: string[];
  climate: Array<{ temp: number; precip: number; snow: number; wind: number; wet: number }>;
  checks: Array<{ input: CheckInput; features: number[]; occupancy: number; delay: number; delayP90: number }>;
  metrics: { rows: number; occupancyMae: number; delayMae: number; delayP90Mae: number };
};

const DOW: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

const SHIFT_STARTS = [7 * 60, 8 * 60, 16 * 60, 20 * 60];
const SHIFT_ENDS = [8 * 60, 16 * 60, 17 * 60, 19 * 60, 20 * 60];
const PAIR_MARKS = [
  8 * 60 + 30,
  10 * 60 + 5,
  10 * 60 + 25,
  12 * 60,
  12 * 60 + 30,
  14 * 60 + 5,
  14 * 60 + 20,
  15 * 60 + 55,
  16 * 60 + 5,
  17 * 60 + 40,
  17 * 60 + 50,
  19 * 60 + 25,
];
const SCHOOL_MARKS = [7 * 60 + 40, 8 * 60, 13 * 60 + 20, 13 * 60 + 50, 14 * 60 + 30, 18 * 60 + 10];
const WET = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);

let cached: Model | null = null;
let holidaySet: Set<string> | null = null;

function modelFile(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "data", "forecast-model.json"),
    path.join(process.cwd(), "backend", "data", "forecast-model.json"),
    path.join(here, "..", "data", "forecast-model.json"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) return file;
  }
  throw new Error("Нет файла модели прогноза");
}

export function loadModel(): Model {
  if (!cached) cached = JSON.parse(readFileSync(modelFile(), "utf8")) as Model;
  return cached;
}

function holidays(): Set<string> {
  if (!holidaySet) holidaySet = new Set(loadModel().holidays);
  return holidaySet;
}

export function climateSky(month: number): Sky {
  const row = loadModel().climate[month - 1];
  return {
    temp: row.temp,
    precip: row.precip,
    snow: row.snow,
    wind: row.wind,
    code: row.wet >= 0.35 ? 61 : 1,
    precip3h: row.precip,
    snow3h: row.snow,
    tempVsYdayMorn: 0,
    firstFrost: 0,
  };
}

export function modelChecks(): Model["checks"] {
  return loadModel().checks;
}

function hoursToNearest(minute: number, marks: number[]): number {
  let best = 12;
  for (const mark of marks) {
    const delta = Math.min(Math.abs(minute - mark), 1440 - Math.abs(minute - mark));
    best = Math.min(best, delta / 60);
  }
  return best;
}

function wet(precip: number, snow: number, code: number): number {
  if (precip >= 0.2 || snow >= 0.05 || WET.has(code)) return 1;
  return 0;
}

function schoolSession(month: number, day: number, dow: number, holiday: boolean): number {
  if (holiday || dow >= 5) return 0;
  if (month === 7 || month === 8 || (month === 6 && day >= 1)) return 0;
  if ((month === 12 && day >= 23) || (month === 1 && day <= 10)) return 0;
  if (month === 3 && day >= 23 && day <= 31) return 0;
  if ((month === 10 && day >= 27) || (month === 11 && day <= 4)) return 0;
  return 1;
}

function uniSession(month: number, day: number, dow: number, holiday: boolean): number {
  if (holiday || dow >= 5) return 0;
  if (month === 7 || month === 8) return 0;
  if (month === 1 && day <= 14) return 0;
  return 1;
}

function examSession(month: number, day: number, dow: number, holiday: boolean): number {
  if (holiday || dow >= 5) return 0;
  if (month === 1 && day >= 15) return 1;
  if (month === 6 && day <= 25) return 1;
  return 0;
}

function dayBeforeHoliday(date: string): number {
  const dow = DOW[weekdayOf(date)];
  if (dow >= 5 || holidays().has(date)) return 0;
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const iso = next.toISOString().slice(0, 10);
  return holidays().has(iso) ? 1 : 0;
}

function placedStop(input: ForecastInput): number {
  if (input.stopFrac != null) return input.stopFrac;
  if (input.toPlant) return 0.8;
  if (input.fromPlant) return 0.2;
  return 0.5;
}

function placedRide(input: ForecastInput): number {
  if (input.rideMin != null) return input.rideMin;
  if (input.bridge) return 32;
  return 14;
}

export function featuresOf(input: ForecastInput): number[] {
  const month = Number(input.date.slice(5, 7));
  const day = Number(input.date.slice(8, 10));
  const dow = DOW[weekdayOf(input.date)];
  const holiday = holidays().has(input.date);
  const hourAngle = (2 * Math.PI * input.minute) / 1440;
  const dowAngle = (2 * Math.PI * dow) / 7;
  const monthAngle = (2 * Math.PI * (month - 1)) / 12;
  return [
    Math.sin(hourAngle),
    Math.cos(hourAngle),
    Math.sin(dowAngle),
    Math.cos(dowAngle),
    Math.sin(monthAngle),
    Math.cos(monthAngle),
    dow >= 5 ? 1 : 0,
    holiday ? 1 : 0,
    input.sky.temp,
    input.sky.precip,
    input.sky.snow,
    input.sky.wind,
    wet(input.sky.precip, input.sky.snow, input.sky.code),
    input.sky.precip3h,
    input.sky.snow3h,
    input.sky.tempVsYdayMorn,
    input.sky.firstFrost,
    input.toPlant,
    input.fromPlant,
    input.bridge,
    input.minibus,
    schoolSession(month, day, dow, holiday),
    uniSession(month, day, dow, holiday),
    hoursToNearest(input.minute, SHIFT_STARTS),
    hoursToNearest(input.minute, SHIFT_ENDS),
    hoursToNearest(input.minute, PAIR_MARKS),
    hoursToNearest(input.minute, SCHOOL_MARKS),
    examSession(month, day, dow, holiday),
    dayBeforeHoliday(input.date),
    placedStop(input),
    input.headwayMin ?? 20,
    placedRide(input),
    input.atOrigin ?? 0,
    input.atTerminus ?? 0,
    input.hubRoutes ?? 4,
  ];
}

function linear(vector: number[], layer: Layer): number[] {
  return layer.w.map((row, index) => row.reduce((sum, weight, column) => sum + weight * vector[column], layer.b[index]));
}

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const z = Math.exp(value);
  return z / (1 + z);
}

function softplus(value: number): number {
  return Math.max(value, 0) + Math.log1p(Math.exp(-Math.abs(value)));
}

function relu(values: number[]): number[] {
  return values.map((value) => (value > 0 ? value : 0));
}

function trunk(vector: number[]): number[] {
  const model = loadModel();
  let current = vector.map((value, index) => (value - model.mean[index]) / model.std[index]);
  for (const layer of model.trunk) current = relu(linear(current, layer));
  return current;
}

export function scoreFeatures(vector: number[]): { occupancy: number; delay: number; delayP90: number } {
  const model = loadModel();
  const hidden = trunk(vector);
  const occupancy = sigmoid(linear(hidden, model.occupancy[0])[0] ?? 0) * 100;
  const raw = linear(hidden, model.delay[0]);
  const usual = softplus(raw[0] ?? 0);
  const high = usual + softplus(raw[1] ?? 0);
  return { occupancy, delay: usual, delayP90: high };
}

export function describeFill(occupancy: number): { level: FillLevel; label: string; detail: string } {
  if (occupancy < 40) return { level: "free", label: "Можно сесть", detail: "можно сесть" };
  if (occupancy < 75) return { level: "standing", label: "Только стоя", detail: "зайти можно" };
  return { level: "packed", label: "Лучше следующий", detail: "лучше следующий" };
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function genitiveMinutes(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "минуты";
  return "минут";
}

export function delayCopy(
  delayMin: number,
  expected: string,
  delayHigh = delayMin,
  expectedHigh = expected,
): { hint: string; shortHint: string } {
  const high = Math.max(delayHigh, delayMin);
  const spread = high - delayMin;
  if (delayMin < 2 && spread < 2) return { hint: "Обычно приходит по расписанию", shortHint: "" };
  if (delayMin < 2) {
    return {
      hint: `Обычно приходит по расписанию, в плохой день до ${high} ${genitiveMinutes(high)}. Ожидайте в ${expectedHigh}`,
      shortHint: `до ${expectedHigh}`,
    };
  }
  const word = plural(delayMin, "минуту", "минуты", "минут");
  if (spread < 2) {
    return {
      hint: `Обычно этот рейс задерживается на ${delayMin} ${word}. Ожидайте в ${expected}`,
      shortHint: `ожидайте ${expected}`,
    };
  }
  return {
    hint: `Обычно этот рейс задерживается на ${delayMin} ${word}, в плохой день до ${high} ${genitiveMinutes(high)}. Ожидайте в ${expected}`,
    shortHint: `ожидайте ${expected}, до ${expectedHigh}`,
  };
}

export function predict(input: ForecastInput): Forecast {
  const raw = scoreFeatures(featuresOf(input));
  const occupancy = Math.round(Math.min(100, Math.max(0, raw.occupancy)));
  const delayMin = Math.round(Math.min(40, Math.max(0, raw.delay)));
  const delayP90 = Math.round(Math.min(40, Math.max(delayMin, raw.delayP90)));
  const expected = formatMinutes((input.minute + delayMin) % (24 * 60));
  const expectedHigh = formatMinutes((input.minute + delayP90) % (24 * 60));
  return {
    occupancy,
    ...describeFill(occupancy),
    delayMin,
    delayP90,
    expected,
    ...delayCopy(delayMin, expected, delayP90, expectedHigh),
  };
}

function norm(value: string): string {
  return value.toLocaleLowerCase("ru").replace(/ё/g, "е");
}

function plant(value: string): boolean {
  return /нафтан|полимир|промзон|измерител|стекловолокн|проходн|тсб|(?:^|[^а-я])кпд(?:[^а-я]|$)/.test(value);
}

export function tripFlags(routeCode: string, direction: string, stopName: string, kind: string): {
  toPlant: number;
  fromPlant: number;
  bridge: number;
  minibus: number;
} {
  const dir = norm(direction);
  const stop = norm(stopName);
  const parts = dir.split("→");
  const origin = parts[0] ?? "";
  const dest = parts[parts.length - 1] ?? dir;
  const hasArrow = parts.length > 1;
  const toPlant = hasArrow ? plant(dest) : plant(dir) && !plant(stop);
  const fromPlant = hasArrow ? plant(origin) || (plant(stop) && !plant(dest)) : plant(stop);
  const code = norm(routeCode).replace(/\s/g, "");
  const bridge =
    /полоцк|ропн|швейн|ж\/д|жд вокзал/.test(`${dir} ${stop}`) ||
    /^(5|10|10а|24|30)$/.test(code) ||
    code === "10тк" ||
    code === "31тк";
  const minibus = kind === "minibus" || code.includes("тк");
  return { toPlant: toPlant ? 1 : 0, fromPlant: fromPlant ? 1 : 0, bridge: bridge ? 1 : 0, minibus: minibus ? 1 : 0 };
}

export function forecastTrip(args: {
  date: string;
  departs: string;
  routeCode: string;
  direction: string;
  stopName: string;
  kind: string;
  sky: Sky;
  stopFrac?: number;
  headwayMin?: number;
  rideMin?: number;
  atOrigin?: number;
  atTerminus?: number;
  hubRoutes?: number;
}): Forecast {
  const [hour, minute] = args.departs.split(":").map(Number);
  const flags = tripFlags(args.routeCode, args.direction, args.stopName, args.kind);
  return predict({
    date: args.date,
    minute: hour * 60 + minute,
    sky: args.sky,
    ...flags,
    stopFrac: args.stopFrac,
    headwayMin: args.headwayMin,
    rideMin: args.rideMin,
    atOrigin: args.atOrigin,
    atTerminus: args.atTerminus,
    hubRoutes: args.hubRoutes,
  });
}

export type StoredReminder = {
  id: number;
  stopId: number;
  stopName: string;
  routeCode: string;
  direction: string;
  departs: string;
  leadMinutes: number;
};

export type StoredProfile = {
  email: string;
  morning: number | null;
  evening: number | null;
  morningName: string | null;
  eveningName: string | null;
  reminders: StoredReminder[];
};

const KEY = "busnow.profile";

function plain(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!clean || clean.length > max) return null;
  return clean;
}

function stopId(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return null;
  return value;
}

function reminderOf(value: unknown): StoredReminder | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<StoredReminder>;
  const id = stopId(item.id);
  const stop = stopId(item.stopId);
  const stopName = plain(item.stopName, 80);
  const routeCode = plain(item.routeCode, 16);
  const direction = plain(item.direction, 80);
  if (!id || !stop || !stopName || !routeCode || !direction) return null;
  if (typeof item.departs !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.departs)) return null;
  const lead = Number.isInteger(item.leadMinutes) && (item.leadMinutes ?? 0) >= 1 && (item.leadMinutes ?? 0) <= 120 ? item.leadMinutes : 10;
  return { id, stopId: stop, stopName, routeCode, direction, departs: item.departs, leadMinutes: lead ?? 10 };
}

export function parseProfile(raw: string | null): StoredProfile | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredProfile>;
    const email = plain(value?.email, 254);
    if (!email || !email.includes("@")) return null;
    return {
      email,
      morning: stopId(value.morning),
      evening: stopId(value.evening),
      morningName: plain(value.morningName, 80),
      eveningName: plain(value.eveningName, 80),
      reminders: Array.isArray(value.reminders)
        ? value.reminders.map(reminderOf).filter((item): item is StoredReminder => item !== null).slice(0, 40)
        : [],
    };
  } catch {
    return null;
  }
}

export function readProfile(): StoredProfile | null {
  try {
    return parseProfile(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function writeProfile(profile: StoredProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Приватный режим: профиль останется до закрытия вкладки.
  }
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Нечего чистить.
  }
}

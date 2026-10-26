import { useSyncExternalStore } from "react";
import { api, type User } from "./api.ts";
import { cacheFavoriteStops, forgetSessionCache } from "./offline.ts";
import { clearProfile, readProfile, writeProfile, type StoredProfile, type StoredReminder } from "./profile-store.ts";
import { ensurePushSubscription, syncPushIfNeeded } from "./push.ts";
import { syncLocalReminders } from "./local-reminders.ts";
import { publishReminders } from "./sw-reminders.ts";

export type Period = "morning" | "evening";

export type BusState = {
  email: string | null;
  morning: number | null;
  evening: number | null;
  morningName: string | null;
  eveningName: string | null;
  reminders: Array<{
    id: number;
    stopId: number;
    stopName: string;
    routeCode: string;
    direction: string;
    departs: string;
    leadMinutes: number;
  }>;
  period: Period;
  guestStop: number | null;
  ready: boolean;
};

const hour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Minsk",
  hour: "2-digit",
  hourCycle: "h23",
}).format(new Date());

let state: BusState = {
  email: null,
  morning: null,
  evening: null,
  morningName: null,
  eveningName: null,
  reminders: [],
  period: hour < "14" ? "morning" : "evening",
  guestStop: null,
  ready: false,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function patch(next: Partial<BusState>): void {
  state = { ...state, ...next };
  emit();
}

function engage(reminders: StoredReminder[]): void {
  const active = reminders.length > 0;
  syncLocalReminders(reminders, active);
  publishReminders(reminders);
}

function applyStored(saved: StoredProfile): void {
  patch({
    email: saved.email,
    morning: saved.morning,
    evening: saved.evening,
    morningName: saved.morningName,
    eveningName: saved.eveningName,
    reminders: saved.reminders,
    ready: true,
  });
  engage(saved.reminders);
  cacheFavoriteStops([saved.morning, saved.evening].filter((id): id is number => id != null));
}

function applyUser(user: User | null): void {
  if (!user) {
    clearProfile();
    engage([]);
    patch({ email: null, morning: null, evening: null, morningName: null, eveningName: null, reminders: [], ready: true });
    return;
  }
  const reminders = user.reminders.map((item) => ({
    id: item.id,
    stopId: item.stopId,
    stopName: item.stopName,
    routeCode: item.routeCode,
    direction: item.direction,
    departs: item.departs,
    leadMinutes: item.leadMinutes,
  }));
  const profile: StoredProfile = {
    email: user.email,
    morning: user.morningStop?.id ?? null,
    evening: user.eveningStop?.id ?? null,
    morningName: user.morningStop?.name ?? null,
    eveningName: user.eveningStop?.name ?? null,
    reminders,
  };
  writeProfile(profile);
  patch({ ...profile, ready: true });
  engage(reminders);
  void syncPushIfNeeded(reminders.length > 0);
  cacheFavoriteStops([profile.morning, profile.evening].filter((id): id is number => id != null));
}

export async function loadMe(): Promise<void> {
  const saved = readProfile();
  if (saved) applyStored(saved);
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    if (!saved) applyUser(null);
    return;
  }
  try {
    const data = await api<{ user: User | null }>("/api/auth/me");
    applyUser(data.user);
  } catch {
    if (saved) patch({ ready: true });
    else applyUser(null);
  }
}

export function useBusNow(): BusState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export function activeStopId(current: BusState): number | null {
  if (!current.email) return current.guestStop;
  const preferred = current.period === "morning" ? current.morning : current.evening;
  if (preferred != null) return preferred;
  return current.period === "morning" ? current.evening : current.morning;
}

export function setPeriod(period: Period): void {
  patch({ period });
}

export async function chooseStop(id: number): Promise<void> {
  if (!state.email) {
    patch({ guestStop: id });
    return;
  }
  await assignStop(state.period, id);
}

export async function clearStop(period: Period): Promise<void> {
  const body = period === "morning" ? { morningStop: null } : { eveningStop: null };
  const data = await api<{ user: User }>("/api/me", { method: "PATCH", body: JSON.stringify(body) });
  applyUser(data.user);
}

export async function removeReminder(id: number): Promise<void> {
  const data = await api<{ user: User }>(`/api/reminders/${id}`, { method: "DELETE", body: "{}" });
  applyUser(data.user);
}

export async function assignStop(period: Period, id: number): Promise<void> {
  const body = period === "morning" ? { morningStop: id } : { eveningStop: id };
  const data = await api<{ user: User }>("/api/me", { method: "PATCH", body: JSON.stringify(body) });
  applyUser(data.user);
}

export function reminderKey(stopId: number, rowId: string): string {
  return `${stopId}:${rowId}`;
}

export function isReminded(current: BusState, stopId: number, route: string, direction: string, time: string): boolean {
  return current.reminders.some(
    (item) => item.stopId === stopId && item.routeCode === route && item.direction === direction && item.departs === time,
  );
}

export async function toggleReminder(stopId: number, stopTimeId: number, route: string, direction: string, time: string): Promise<void> {
  const existing = state.reminders.find(
    (item) => item.stopId === stopId && item.routeCode === route && item.direction === direction && item.departs === time,
  );
  if (existing) {
    const data = await api<{ user: User }>(`/api/reminders/${existing.id}`, { method: "DELETE", body: "{}" });
    applyUser(data.user);
    return;
  }
  const push = await ensurePushSubscription();
  if (push === "unsupported") throw new Error("Этот браузер не умеет уведомления");
  if (push === "denied") throw new Error("Разрешите уведомления в настройках браузера");
  if (push === "error") throw new Error("Не удалось подключить уведомления");
  const data = await api<{ user: User }>("/api/reminders", {
    method: "POST",
    body: JSON.stringify({ stopTimeId }),
  });
  applyUser(data.user);
}

export async function signIn(email: string, password: string, captchaId: string, captcha: string): Promise<void> {
  const data = await api<{ user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, captchaId, captcha }),
  });
  applyUser(data.user);
}

export async function signUp(email: string, password: string, captchaId: string, captcha: string): Promise<void> {
  const data = await api<{ user: User }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, captchaId, captcha }),
  });
  applyUser(data.user);
}

export async function signOut(): Promise<void> {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // Без сети сессия на сервере доживёт до следующего входа, на устройстве выход уже локальный.
  }
  forgetSessionCache();
  applyUser(null);
}

void loadMe();

import { useSyncExternalStore } from "react";
import { api, type User } from "./api.ts";
import { ensurePushSubscription, syncPushIfNeeded } from "./push.ts";
import { syncLocalReminders } from "./local-reminders.ts";
import { syncReminderDispatch } from "./reminder-dispatch.ts";

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

function applyUser(user: User | null): void {
  if (!user) {
    syncReminderDispatch(false);
    syncLocalReminders([], false);
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
  patch({
    email: user.email,
    morning: user.morningStop?.id ?? null,
    evening: user.eveningStop?.id ?? null,
    morningName: user.morningStop?.name ?? null,
    eveningName: user.eveningStop?.name ?? null,
    reminders,
    ready: true,
  });
  syncReminderDispatch(reminders.length > 0);
  syncLocalReminders(reminders, reminders.length > 0);
  void syncPushIfNeeded(reminders.length > 0);
}

export async function loadMe(): Promise<void> {
  try {
    const data = await api<{ user: User | null }>("/api/auth/me");
    applyUser(data.user);
  } catch {
    applyUser(null);
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
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  applyUser(null);
}

void loadMe();

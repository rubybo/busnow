import { useSyncExternalStore } from "react";
import { api, type User } from "./api.ts";

export type Period = "morning" | "evening";

export type BusState = {
  email: string | null;
  morning: number | null;
  evening: number | null;
  reminders: Array<{ id: number; stopId: number; routeCode: string; direction: string; departs: string }>;
  period: Period;
  guestStop: number | null;
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
  reminders: [],
  period: hour < "14" ? "morning" : "evening",
  guestStop: null,
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
    patch({ email: null, morning: null, evening: null, reminders: [] });
    return;
  }
  patch({
    email: user.email,
    morning: user.morningStop?.id ?? null,
    evening: user.eveningStop?.id ?? null,
    reminders: user.reminders.map((item) => ({
      id: item.id,
      stopId: item.stopId,
      routeCode: item.routeCode,
      direction: item.direction,
      departs: item.departs,
    })),
  });
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
  if (current.email) return current.period === "morning" ? current.morning : current.evening;
  return current.guestStop;
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
  const data = await api<{ user: User }>("/api/reminders", {
    method: "POST",
    body: JSON.stringify({ stopTimeId }),
  });
  applyUser(data.user);
}

export async function signIn(email: string, password: string): Promise<void> {
  const data = await api<{ user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  applyUser(data.user);
}

export async function signUp(email: string, password: string): Promise<void> {
  const data = await api<{ user: User }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  applyUser(data.user);
}

export async function signOut(): Promise<void> {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  applyUser(null);
}

void loadMe();

export type Kind = "bus" | "minibus";

export type StopRef = { id: number; name: string; slug: string };

export type Reminder = {
  id: number;
  stopId: number;
  stopName: string;
  routeCode: string;
  direction: string;
  departs: string;
  leadMinutes: number;
};

export type User = {
  id: number;
  email: string;
  morningStop: StopRef | null;
  eveningStop: StopRef | null;
  reminders: Reminder[];
};

export type Departure = {
  id: number;
  departs: string;
  direction: string;
  pattern: string;
  routeCode: string;
  routeSlug: string;
  kind: Kind;
  title: string;
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-BusNow", "1");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || "Не получилось");
  return data as T;
}

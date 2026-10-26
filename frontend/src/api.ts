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

export type Departure = {
  id: number;
  departs: string;
  direction: string;
  directionPos: number;
  pattern: string;
  routeCode: string;
  routeSlug: string;
  kind: Kind;
  title: string;
  forecast?: Forecast;
};

export type RouteListItem = {
  id: number;
  code: string;
  slug: string;
  kind: Kind;
  title: string;
  note: string;
  hasTimes: boolean;
  directions: string[];
  patterns: string[];
  trips: number;
  first: string | null;
  last: string | null;
};

export type RouteDetail = {
  route: {
    id: number;
    code: string;
    slug: string;
    kind: Kind;
    title: string;
    sourceUrl: string;
    note: string;
  };
  directions: Array<{
    name: string;
    stops: Array<{ id: number; name: string; slug: string }>;
    patterns: Array<{
      name: string;
      stops: Array<{ id: number; name: string; slug: string; times: string[] }>;
    }>;
  }>;
};

function departureStopId(path: string, init: RequestInit): number | null {
  if (init.method && init.method !== "GET") return null;
  const match = path.match(/^\/api\/stops\/(\d+)\/departures(?:\?|$)/);
  return match ? Number(match[1]) : null;
}

async function boardFromRoutes<T>(path: string, init: RequestInit): Promise<T | null> {
  const stopId = departureStopId(path, init);
  if (!stopId) return null;
  const { departuresFromSchedule } = await import("./offline.ts");
  const built = await departuresFromSchedule(stopId);
  return built ? (built as T) : null;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-BusNow", "1");
  if (init.body) headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(path, { ...init, headers, credentials: "include" });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      const built = await boardFromRoutes<T>(path, init);
      if (built) return built;
      throw new Error(data.error || "Не получилось");
    }
    return data as T;
  } catch (error) {
    const built = await boardFromRoutes<T>(path, init);
    if (built) return built;
    if (error instanceof Error && error.message) throw error;
    throw new Error("Нет сети");
  }
}

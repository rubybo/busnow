export type Kind = "bus" | "minibus";
export type Period = "morning" | "evening";

export type Stop = {
  id: number;
  name: string;
};

export type Departure = {
  id: string;
  stopId: number;
  time: string;
  route: string;
  kind: Kind;
  direction: string;
  days: string;
  period: Period;
};

export const stops: Stop[] = [
  { id: 1, name: "Молодёжная" },
  { id: 2, name: "Подкастельцы" },
  { id: 3, name: "Гайдара" },
  { id: 4, name: "Центр" },
  { id: 5, name: "Полимир" },
];

// Sample times for the interface. These are placeholders, not official ATP tables.
const trips: Departure[] = [
  row(1, "m1", "07:05", "4", "bus", "Подкастельцы → Гайдара", "будни", "morning"),
  row(1, "m2", "07:22", "4А", "bus", "Подкастельцы → Гайдара", "будни", "morning"),
  row(1, "m3", "07:40", "10Тк", "minibus", "Центр → Подкастельцы", "ежедневно", "morning"),
  row(1, "m4", "07:55", "4", "bus", "Подкастельцы → Гайдара", "будни", "morning"),
  row(1, "m5", "08:10", "2Тк", "minibus", "Молодёжная → Полимир", "будни", "morning"),
  row(1, "e1", "17:40", "4", "bus", "Гайдара → Подкастельцы", "будни", "evening"),
  row(1, "e2", "18:05", "4А", "bus", "Гайдара → Подкастельцы", "будни", "evening"),
  row(1, "e3", "18:20", "10Тк", "minibus", "Подкастельцы → Центр", "ежедневно", "evening"),
  row(1, "e4", "18:45", "4", "bus", "Гайдара → Подкастельцы", "будни", "evening"),
  row(1, "e5", "19:10", "2Тк", "minibus", "Полимир → Молодёжная", "будни", "evening"),
  row(2, "p1", "07:18", "4", "bus", "Подкастельцы → Гайдара", "будни", "morning"),
  row(2, "p2", "07:46", "10Тк", "minibus", "Подкастельцы → Центр", "ежедневно", "morning"),
  row(2, "p3", "18:12", "4", "bus", "Гайдара → Подкастельцы", "будни", "evening"),
  row(3, "g1", "07:30", "4А", "bus", "Подкастельцы → Гайдара", "будни", "morning"),
  row(3, "g2", "18:28", "4А", "bus", "Гайдара → Подкастельцы", "будни", "evening"),
  row(4, "c1", "07:12", "10Тк", "minibus", "Центр → Подкастельцы", "ежедневно", "morning"),
  row(4, "c2", "18:02", "10Тк", "minibus", "Подкастельцы → Центр", "ежедневно", "evening"),
  row(5, "l1", "08:25", "2Тк", "minibus", "Молодёжная → Полимир", "будни", "morning"),
  row(5, "l2", "18:55", "2Тк", "minibus", "Полимир → Молодёжная", "будни", "evening"),
];

function row(
  stopId: number,
  id: string,
  time: string,
  route: string,
  kind: Kind,
  direction: string,
  days: string,
  period: Period,
): Departure {
  return { id, stopId, time, route, kind, direction, days, period };
}

export function stopById(id: number): Stop | null {
  return stops.find((stop) => stop.id === id) ?? null;
}

export function searchStops(query: string): Stop[] {
  const needle = query.trim().toLocaleLowerCase("ru");
  if (!needle) return stops.slice(0, 4);
  return stops.filter((stop) => stop.name.toLocaleLowerCase("ru").includes(needle));
}

export function boardFor(stopId: number, period: Period): Departure[] {
  return trips.filter((trip) => trip.stopId === stopId && trip.period === period);
}

export function dayBoard(stopId: number): Departure[] {
  return trips
    .filter((trip) => trip.stopId === stopId)
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function isPast(time: string): boolean {
  const [hour, minute] = time.split(":").map((part) => Number(part));
  const now = new Date();
  return hour * 60 + minute <= now.getHours() * 60 + now.getMinutes();
}

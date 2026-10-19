import type { Kind } from "./api.ts";

/** "Подкастельцы → ОАО Нафтан (через Гайдара)" → "ОАО Нафтан (через Гайдара)" */
export function toward(direction: string): string {
  const parts = direction.split("→");
  return (parts[parts.length - 1] ?? direction).trim();
}

export function kindOf(code: string, kind: Kind): "bus" | "tram" | "minibus" {
  if (code.startsWith("Тр")) return "tram";
  return kind;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const KIND_LABEL = { bus: "Автобусы", tram: "Трамвай", minibus: "Маршрутки" } as const;

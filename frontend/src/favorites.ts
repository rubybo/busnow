import { useSyncExternalStore } from "react";
import type { StopRef } from "./api.ts";

const KEY = "busnow.favorites";
const LIMIT = 8;

function read(): StopRef[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as StopRef[];
    return Array.isArray(raw) ? raw.filter((item) => item && typeof item.id === "number") : [];
  } catch {
    return [];
  }
}

let items = read();
const listeners = new Set<() => void>();

function save(next: StopRef[]): void {
  items = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode: favourites live for this session only.
  }
  for (const listener of listeners) listener();
}

export function useFavorites(): StopRef[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
  );
}

export function isFavorite(list: StopRef[], id: number): boolean {
  return list.some((item) => item.id === id);
}

export function toggleFavorite(stop: StopRef): void {
  if (isFavorite(items, stop.id)) save(items.filter((item) => item.id !== stop.id));
  else save([stop, ...items].slice(0, LIMIT));
}

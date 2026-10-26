import { useSyncExternalStore } from "react";
import type { StopRef } from "./api.ts";
import { cacheFavoriteStops, dropFavoriteStop } from "./offline.ts";

const KEY = "busnow.favorites";
const LIMIT = 8;

function plain(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!clean || clean.length > max) return null;
  return clean;
}

function favoriteOf(value: unknown): StopRef | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<StopRef>;
  if (typeof item.id !== "number" || !Number.isInteger(item.id) || item.id < 1) return null;
  const name = plain(item.name, 80);
  const slug = plain(item.slug, 80);
  if (!name || !slug || /[\\/:?#]/.test(slug)) return null;
  return { id: item.id, name, slug };
}

function read(): StopRef[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.map(favoriteOf).filter((item): item is StopRef => item !== null).slice(0, LIMIT) : [];
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
  if (isFavorite(items, stop.id)) {
    save(items.filter((item) => item.id !== stop.id));
    dropFavoriteStop(stop.id);
    return;
  }
  save([stop, ...items].slice(0, LIMIT));
  cacheFavoriteStops([stop.id]);
}

export function keepFavoritesOffline(): void {
  cacheFavoriteStops(items.map((item) => item.id));
}

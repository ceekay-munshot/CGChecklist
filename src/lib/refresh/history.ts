"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type {
  CompanyIdentity,
  CountryCode,
  ExchangeCode,
  RefreshOutcome,
} from "@/lib/types/company";

export interface RefreshHistoryEntry {
  ticker: string;
  name: string;
  exchange: ExchangeCode | "";
  country: CountryCode | "";
  lastRefreshedAt: string;
  lastOutcome: RefreshOutcome;
}

const STORAGE_KEY = "cgchecklist:refresh-history";
const HISTORY_LIMIT = 10;
const UPDATE_EVENT = "cgchecklist:history-updated";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readStorage(): RefreshHistoryEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeStorage(entries: RefreshHistoryEntry[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  } catch {
    // ignore quota / privacy errors
  }
}

function isValidEntry(value: unknown): value is RefreshHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.ticker === "string" &&
    typeof e.name === "string" &&
    typeof e.lastRefreshedAt === "string" &&
    (e.lastOutcome === "success" || e.lastOutcome === "error")
  );
}

export function recordRefreshHistory(
  identity: CompanyIdentity,
  outcome: RefreshOutcome,
  refreshedAtIso: string,
) {
  const ticker = identity.ticker.trim().toUpperCase();
  const name = identity.name.trim();
  if (!ticker || !name) return;

  const entry: RefreshHistoryEntry = {
    ticker,
    name,
    exchange: identity.exchange,
    country: identity.country,
    lastRefreshedAt: refreshedAtIso,
    lastOutcome: outcome,
  };

  const existing = readStorage().filter((e) => e.ticker !== ticker);
  const next = [entry, ...existing].slice(0, HISTORY_LIMIT);
  writeStorage(next);
}

export function clearRefreshHistory() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function subscribe(callback: () => void): () => void {
  if (!isBrowser()) return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener(UPDATE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(UPDATE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getRawSnapshot(): string {
  if (!isBrowser()) return "[]";
  return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
}

function getServerSnapshot(): string {
  return "[]";
}

export function useRefreshHistory(): {
  entries: RefreshHistoryEntry[];
  remove: (ticker: string) => void;
  clear: () => void;
} {
  const raw = useSyncExternalStore(
    subscribe,
    getRawSnapshot,
    getServerSnapshot,
  );

  const entries = useMemo<RefreshHistoryEntry[]>(() => {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidEntry).slice(0, HISTORY_LIMIT);
    } catch {
      return [];
    }
  }, [raw]);

  const remove = useCallback((ticker: string) => {
    const t = ticker.trim().toUpperCase();
    const next = readStorage().filter((e) => e.ticker !== t);
    writeStorage(next);
  }, []);

  const clear = useCallback(() => {
    clearRefreshHistory();
  }, []);

  return { entries, remove, clear };
}

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const diffMs = Math.max(0, now - then);
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon} mo${mon === 1 ? "" : "s"} ago`;
  const yr = Math.round(mon / 12);
  return `${yr} yr${yr === 1 ? "" : "s"} ago`;
}

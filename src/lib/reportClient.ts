// Client for the source-first engine reports. The engine runs in GitHub Actions
// (it needs a real browser + PDF parsing, which the Worker can't do), writes its
// GovernanceRow[] into KV, and the dashboard reads them back here.
//
//   fetchEngineReport  — read an existing report (no run)
//   dispatchEngineRun  — trigger analyze.yml for a ticker
//   pollEngineReport   — wait for a freshly dispatched run to land in KV

import type { GovernanceRow } from "@/lib/types/governance";

export interface EngineReport {
  ticker: string;
  company: string;
  country: string;
  total: number;
  max: number;
  rows: GovernanceRow[];
  harvestNote: string | null;
  storedAt: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Read an existing engine report from KV. Returns null on a miss or any error. */
export async function fetchEngineReport(
  ticker: string,
  country?: string,
  signal?: AbortSignal,
): Promise<EngineReport | null> {
  try {
    const qs = new URLSearchParams({ ticker });
    if (country) qs.set("country", country);
    const res = await fetch(`/api/report/get?${qs.toString()}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as
      | { ok: true; found: false }
      | ({ ok: true; found: true } & EngineReport)
      | { ok: false };
    if (!("found" in data) || !data.found) return null;
    return {
      ticker: data.ticker,
      company: data.company,
      country: data.country,
      total: data.total,
      max: data.max,
      rows: data.rows,
      harvestNote: data.harvestNote,
      storedAt: data.storedAt,
    };
  } catch {
    return null;
  }
}

export interface DispatchResult {
  ok: boolean;
  error?: string;
}

/** Trigger the analyze.yml workflow for a company. */
export async function dispatchEngineRun(
  ticker: string,
  company: string,
  signal?: AbortSignal,
): Promise<DispatchResult> {
  try {
    const res = await fetch("/api/report/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, company }),
      signal,
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (res.ok && data.ok) return { ok: true };
    return { ok: false, error: data.error || `Dispatch failed (HTTP ${res.status}).` };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { ok: false, error: "cancelled" };
    return { ok: false, error: (e as Error).message };
  }
}

export interface PollOptions {
  signal?: AbortSignal;
  /** Ignore any report stored at or before this ISO time (wait for a fresh one). */
  after?: string | null;
  /** Give up after this long. The workflow itself caps at 60 min. */
  timeoutMs?: number;
  intervalMs?: number;
  onTick?: (elapsedMs: number) => void;
}

/**
 * Poll KV until a report newer than `after` appears (or timeout). Used right
 * after dispatchEngineRun to surface the run when GitHub Actions finishes.
 */
export async function pollEngineReport(
  ticker: string,
  country: string | undefined,
  opts: PollOptions = {},
): Promise<EngineReport | null> {
  const timeoutMs = opts.timeoutMs ?? 18 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 12_000;
  const afterMs = opts.after ? Date.parse(opts.after) : 0;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (opts.signal?.aborted) return null;
    const report = await fetchEngineReport(ticker, country, opts.signal);
    if (report) {
      const stamp = report.storedAt ? Date.parse(report.storedAt) : Date.now();
      if (!afterMs || stamp > afterMs) return report;
    }
    opts.onTick?.(Date.now() - started);
    await sleep(intervalMs);
  }
  return null;
}

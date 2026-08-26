import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { GovernanceRow } from "@/lib/types/governance";

/**
 * Minimal surface of the Cloudflare KV namespace we depend on. Declared locally
 * so we don't take a hard dependency on @cloudflare/workers-types here.
 */
export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
  }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  delete(key: string): Promise<void>;
}

interface StoredRun {
  raw: string;
  storedAt: number; // epoch milliseconds
}

export interface CachedRun {
  raw: string;
  storedAt: number;
}

/** A cached run is considered fresh for one month. */
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Let KV keep entries a little past the freshness window so a read can still
 * inspect (and discard) a just-stale value rather than silently missing.
 */
const KV_TTL_SECONDS = Math.ceil((ONE_MONTH_MS * 1.2) / 1000);

/**
 * Resolve the MUNS_RUNS KV namespace.
 *
 * Prefers an explicitly supplied binding: the durable coordinator captures
 * `env` at request scope and passes it in, because the ambient Cloudflare
 * context is not guaranteed to be available inside a detached `waitUntil` task.
 * Falls back to the request-scoped context for ordinary route handlers, and
 * resolves to `null` when no binding exists (e.g. plain `next dev`).
 */
export const getMunsKv = (
  kv?: KVNamespaceLike | null,
): KVNamespaceLike | null => {
  if (kv) return kv;
  try {
    const { env } = getCloudflareContext();
    const ns = (env as Record<string, unknown>).MUNS_RUNS;
    return (ns as KVNamespaceLike | undefined) ?? null;
  } catch {
    // No Cloudflare context (e.g. plain `next dev`) — caching is unavailable.
    return null;
  }
};

/** Build the KV key identifying a run for a ticker in a given country. */
export const runCacheKey = (input: {
  ticker: string;
  country: string;
}): string => `run:${input.country.toUpperCase()}:${input.ticker.toUpperCase()}`;

/**
 * Return a cached run only if one exists and was stored within the last month.
 * Best-effort: any error or missing binding resolves to `null` (a cache miss).
 */
export const getCachedRun = async (
  key: string,
  kv?: KVNamespaceLike | null,
): Promise<CachedRun | null> => {
  const ns = getMunsKv(kv);
  if (!ns) return null;

  try {
    const stored = await ns.get(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as StoredRun;
    if (typeof parsed?.raw !== "string" || typeof parsed?.storedAt !== "number") {
      return null;
    }

    if (Date.now() - parsed.storedAt > ONE_MONTH_MS) return null;

    return { raw: parsed.raw, storedAt: parsed.storedAt };
  } catch {
    return null;
  }
};

/**
 * Store a run keyed by ticker/country. Best-effort: failures (including a
 * missing KV binding) never propagate, so they can't break the request.
 */
export const putCachedRun = async (
  key: string,
  raw: string,
  kv?: KVNamespaceLike | null,
): Promise<void> => {
  const ns = getMunsKv(kv);
  if (!ns) return;

  try {
    const value: StoredRun = { raw, storedAt: Date.now() };
    await ns.put(key, JSON.stringify(value), { expirationTtl: KV_TTL_SECONDS });
  } catch {
    // Intentionally swallowed — caching is an optimization, not a requirement.
  }
};

// ---------------------------------------------------------------------------
// Source-first engine reports
//
// The GitHub Actions engine (scripts/analyze.ts) produces GovernanceRow[]
// directly, with source+page citations. Those are stored under a SEPARATE key
// family — `report:<COUNTRY>:<TICKER>` — so engine runs and the legacy MUNS
// cache (`run:*`, `job:*`) never collide, and clearing one leaves the other
// intact. Values are the engine results.json verbatim plus a storedAt stamp.
// ---------------------------------------------------------------------------

export interface StoredReport {
  ticker: string;
  company: string;
  total: number;
  max: number;
  rows: GovernanceRow[];
  harvestNote?: string;
  /** Identity of the source this was built from (the artifact's created_at), so
   *  a read can tell when a newer engine run exists and refresh the cache. */
  sourceStamp?: string;
  storedAt: number; // epoch milliseconds
}

/** Engine reports don't expire the way MUNS runs do — keep them ~a year. */
const REPORT_TTL_SECONDS = 365 * 24 * 60 * 60;

/** Build the KV key identifying an engine report for a ticker/country. */
export const reportCacheKey = (input: {
  ticker: string;
  country: string;
}): string =>
  `report:${input.country.toUpperCase()}:${input.ticker.toUpperCase()}`;

/** Read a stored engine report. Best-effort: any error resolves to `null`. */
export const getReport = async (
  key: string,
  kv?: KVNamespaceLike | null,
): Promise<StoredReport | null> => {
  const ns = getMunsKv(kv);
  if (!ns) return null;
  try {
    const stored = await ns.get(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<StoredReport>;
    if (!Array.isArray(parsed?.rows)) return null;
    return {
      ticker: parsed.ticker ?? "",
      company: parsed.company ?? "",
      total: typeof parsed.total === "number" ? parsed.total : 0,
      max: typeof parsed.max === "number" ? parsed.max : 0,
      rows: parsed.rows as GovernanceRow[],
      harvestNote: parsed.harvestNote,
      sourceStamp: parsed.sourceStamp,
      storedAt: typeof parsed.storedAt === "number" ? parsed.storedAt : Date.now(),
    };
  } catch {
    return null;
  }
};

/** Store an engine report. Best-effort — failures never propagate. */
export const putReport = async (
  key: string,
  report: Omit<StoredReport, "storedAt">,
  kv?: KVNamespaceLike | null,
): Promise<boolean> => {
  const ns = getMunsKv(kv);
  if (!ns) return false;
  try {
    const value: StoredReport = { ...report, storedAt: Date.now() };
    await ns.put(key, JSON.stringify(value), { expirationTtl: REPORT_TTL_SECONDS });
    return true;
  } catch {
    return false;
  }
};

/**
 * Delete every key under a prefix (paginating through KV's list cursor). Used
 * to clear the legacy MUNS runs (`run:`/`job:`) while leaving engine reports
 * (`report:`) in place. Returns how many keys were removed.
 */
export const deleteByPrefix = async (
  prefix: string,
  kv?: KVNamespaceLike | null,
): Promise<number> => {
  const ns = getMunsKv(kv);
  if (!ns) return 0;
  let removed = 0;
  let cursor: string | undefined;
  try {
    do {
      const page = await ns.list({ prefix, cursor });
      for (const k of page.keys) {
        await ns.delete(k.name);
        removed++;
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  } catch {
    // Return whatever we managed to delete before the error.
  }
  return removed;
};

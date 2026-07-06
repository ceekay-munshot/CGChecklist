import { getCloudflareContext } from "@opennextjs/cloudflare";

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

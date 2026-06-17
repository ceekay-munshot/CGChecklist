import { parseMunsResponse } from "./munsParse";
import { PARALLEL_LANES } from "./munsConfig";

export interface MunsGovernanceResponse {
  ok: boolean;
  raw: string;
  parsed: ReturnType<typeof parseMunsResponse> | null;
  error?: string;
  /** True when the result came from the KV cache rather than a fresh run. */
  cached?: boolean;
  /** ISO timestamp of when a cached result was originally stored. */
  cachedAt?: string;
  /** True when the request was aborted by the caller. */
  cancelled?: boolean;
}

export interface FetchGovernanceOptions {
  /** Abort signal used to cancel an in-flight run. */
  signal?: AbortSignal;
  /** When true, bypass the cached run and force a fresh model run. */
  force?: boolean;
}

export interface MunsAgentInput {
  ticker: string;
  companyName: string;
  country?: string;
}

/** A single question's result as returned by a lane (passed through opaquely). */
interface LaneQuestionResult {
  questionId: string;
  sectionId: string;
  sectionTitle: string;
  particulars: string;
  rawResponse: string;
}

interface LaneRouteResponse {
  ok: boolean;
  /** True when a cached full run was served — `raw` is the complete document. */
  full?: boolean;
  raw?: string;
  results?: LaneQuestionResult[];
  error?: string;
  cached?: boolean;
  cachedAt?: string;
}

interface AssembleRouteResponse {
  ok: boolean;
  raw?: string;
  error?: string;
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

/**
 * Runs the governance checklist by fanning out one /api/muns/run call per lane.
 * Each lane is a separate Worker invocation with its own Cloudflare subrequest
 * budget, so the full checklist stays under the per-invocation cap. The lanes
 * run concurrently; their partial results are merged and posted to
 * /api/muns/assemble, which orders, scores, and caches the final document.
 */
export const fetchGovernanceAnalysis = async (
  input: MunsAgentInput,
  options: FetchGovernanceOptions = {},
): Promise<MunsGovernanceResponse> => {
  if (!input.ticker?.trim() || !input.companyName?.trim()) {
    return {
      ok: false,
      raw: "",
      parsed: null,
      error: "Ticker and company name are required to run analysis.",
    };
  }

  const ticker = input.ticker.trim();
  const companyName = input.companyName.trim();

  try {
    // ── Fan out: one invocation per lane, all in parallel ─────────────────
    const laneResponses = await Promise.all(
      Array.from({ length: PARALLEL_LANES }, async (_, lane) => {
        const response = await fetch("/api/muns/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker,
            companyName,
            country: input.country,
            force: options.force,
            lane,
          }),
          signal: options.signal,
        });
        return (await response.json()) as LaneRouteResponse;
      }),
    );

    // If any lane failed, surface the first error.
    const failed = laneResponses.find((r) => !r.ok);
    if (failed) {
      return {
        ok: false,
        raw: "",
        parsed: null,
        error: failed.error || "MUNS request failed.",
      };
    }

    // Cache hit: a lane returned the full assembled run — use it directly and
    // skip merging/assembly entirely.
    const cachedHit = laneResponses.find(
      (r) => r.full && typeof r.raw === "string",
    );
    if (cachedHit && typeof cachedHit.raw === "string") {
      return {
        ok: true,
        raw: cachedHit.raw,
        parsed: parseMunsResponse(cachedHit.raw),
        cached: cachedHit.cached,
        cachedAt: cachedHit.cachedAt,
      };
    }

    // ── Merge every lane's partial results, then assemble + cache ─────────
    const merged = laneResponses.flatMap((r) => r.results ?? []);
    const assembleResponse = await fetch("/api/muns/assemble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        country: input.country,
        results: merged,
      }),
      signal: options.signal,
    });
    const assembled = (await assembleResponse.json()) as AssembleRouteResponse;

    if (!assembled.ok || typeof assembled.raw !== "string") {
      return {
        ok: false,
        raw: "",
        parsed: null,
        error:
          assembled.error ||
          `MUNS assembly failed with status ${assembleResponse.status}.`,
      };
    }

    return {
      ok: true,
      raw: assembled.raw,
      parsed: parseMunsResponse(assembled.raw),
      cached: false,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        raw: "",
        parsed: null,
        cancelled: true,
        error: "Run cancelled.",
      };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      ok: false,
      raw: "",
      parsed: null,
      error: `Failed to fetch: ${message}`,
    };
  }
};

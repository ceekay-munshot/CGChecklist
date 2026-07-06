import { parseMunsResponse } from "./munsParse";

export interface MunsGovernanceResponse {
  ok: boolean;
  raw: string;
  parsed: ReturnType<typeof parseMunsResponse> | null;
  error?: string;
  /** True when the result came from the KV cache rather than a fresh run. */
  cached?: boolean;
  /** ISO timestamp of when a cached result was originally stored. */
  cachedAt?: string;
  /** True when the caller stopped following the run (it may still finish). */
  cancelled?: boolean;
  /** Questions that failed in a partial run (0/undefined when fully clean). */
  errorCount?: number;
  /** Total checklist questions attempted (paired with errorCount). */
  total?: number;
}

/** A single live progress update, reconstructed from a status poll. */
export interface GovernanceProgress {
  chain: "A" | "B";
  phase: "mega" | "question";
  section: string;
  particulars: string;
  ok: boolean;
  error?: string;
  completed: number;
  total: number;
}

export interface FetchGovernanceOptions {
  /**
   * Abort signal used to stop *following* an in-flight run. Aborting detaches
   * this client from the run; the run itself keeps going on the server and its
   * result is cached, so a later call returns it immediately.
   */
  signal?: AbortSignal;
  /** When true, bypass the cached run and force a fresh model run. */
  force?: boolean;
  /** Called for each progress update observed while polling. */
  onProgress?: (event: GovernanceProgress) => void;
}

export interface MunsAgentInput {
  ticker: string;
  companyName: string;
  country?: string;
}

// Shape of the /api/muns/start response.
interface StartResponse {
  ok: boolean;
  status?: "running" | "done" | "error";
  jobId?: string;
  raw?: string;
  cached?: boolean;
  cachedAt?: string;
  error?: string;
}

// Shape of the /api/muns/status response.
interface StatusProgress {
  chain: "A" | "B";
  phase: "mega" | "question";
  section: string;
  particulars: string;
  ok: boolean;
  error?: string;
  completed: number;
  total: number;
  failed: number;
}

interface StatusResponse {
  ok: boolean;
  status: "running" | "done" | "error" | "unknown";
  progress?: StatusProgress;
  raw?: string;
  errorCount?: number;
  total?: number;
  error?: string;
  cached?: boolean;
  cachedAt?: string;
}

// How often to poll the run's status while it's in flight.
const POLL_INTERVAL_MS = 1500;

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

/** A cancellable delay that rejects with an AbortError if the signal fires. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function doneResponse(
  raw: string,
  extra: {
    cached?: boolean;
    cachedAt?: string;
    errorCount?: number;
    total?: number;
  },
): MunsGovernanceResponse {
  return {
    ok: true,
    raw,
    parsed: parseMunsResponse(raw),
    cached: extra.cached,
    cachedAt: extra.cachedAt,
    errorCount: extra.errorCount,
    total: extra.total,
  };
}

/**
 * Run the governance checklist as a durable, server-side job.
 *
 * This no longer orchestrates the run from the browser. Instead it asks the
 * server to start (or re-attach to) a run and then polls for progress and the
 * result. The consequence is the whole point of the change: once the run has
 * started, it completes on the server even if this browser navigates away,
 * loses its connection, or is closed — the result is written to the run cache,
 * so the next call (this session or a later one) returns it instantly.
 *
 * The signature and return type are unchanged from the old client-orchestrated
 * version, so callers need no changes.
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
  const country = input.country ?? "";

  try {
    // ── Start (or re-attach to) the server-side run ────────────────────────
    const startRes = await fetch("/api/muns/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, companyName, country, force: options.force }),
      signal: options.signal,
    });
    const start = (await startRes.json()) as StartResponse;

    if (!start.ok) {
      return {
        ok: false,
        raw: "",
        parsed: null,
        error: start.error || `Failed to start run (HTTP ${startRes.status}).`,
      };
    }

    // A cached run comes straight back from start — nothing to poll.
    if (start.status === "done" && typeof start.raw === "string") {
      return doneResponse(start.raw, {
        cached: start.cached,
        cachedAt: start.cachedAt,
      });
    }

    // ── Poll the durable job until it terminates ───────────────────────────
    const statusUrl = `/api/muns/status?ticker=${encodeURIComponent(
      ticker,
    )}&country=${encodeURIComponent(country)}`;
    let lastCompleted = -1;

    while (true) {
      await sleep(POLL_INTERVAL_MS, options.signal);

      const statusRes = await fetch(statusUrl, { signal: options.signal });
      const status = (await statusRes.json()) as StatusResponse;

      if (status.status === "running") {
        const p = status.progress;
        // Emit one progress event per advance so the live log doesn't fill with
        // duplicate polls of the same snapshot.
        if (p && p.completed !== lastCompleted) {
          lastCompleted = p.completed;
          options.onProgress?.({
            chain: p.chain,
            phase: p.phase,
            section: p.section,
            particulars: p.particulars,
            ok: p.ok,
            error: p.error,
            completed: p.completed,
            total: p.total,
          });
        }
        continue;
      }

      if (status.status === "done" && typeof status.raw === "string") {
        return doneResponse(status.raw, {
          cached: status.cached,
          cachedAt: status.cachedAt,
          errorCount: status.errorCount,
          total: status.total,
        });
      }

      if (status.status === "error") {
        return {
          ok: false,
          raw: "",
          parsed: null,
          error: status.error || "MUNS run failed.",
        };
      }

      // "unknown": the job record expired and no run was cached — the run was
      // lost before it finished. The caller can retry.
      return {
        ok: false,
        raw: "",
        parsed: null,
        error:
          status.error ||
          "Run was lost before it completed. Please run again.",
      };
    }
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

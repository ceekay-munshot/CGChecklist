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

// Poll pacing. A governance run takes minutes, so polling on a fixed 1.5s tick
// the whole time floods the status endpoint with hundreds of near-identical
// requests. Start responsive (a cached/short run resolves within a couple of
// seconds) then back off to a steady cadence — live progress still lands within
// a few seconds, but a full run makes tens of polls instead of hundreds.
const POLL_INTERVAL_START_MS = 1500;
const POLL_INTERVAL_MAX_MS = 8000;
const POLL_BACKOFF_FACTOR = 1.5;

// The run is started before its job record is guaranteed visible: /start writes
// it to an eventually-consistent store, so the first poll(s) can momentarily
// read no record ("unknown") before it propagates. Tolerate a few consecutive
// unknowns rather than declaring the freshly-started run lost on the first blip.
const MAX_CONSECUTIVE_UNKNOWN = 5;

// Absolute ceiling on how long a single client follows one run. The run is
// durable — it keeps going and caches its result server-side — so if it outlives
// this window we stop polling and let the user pick the result up on a later
// run, rather than poll a possibly-evicted job indefinitely.
const MAX_POLL_DURATION_MS = 15 * 60 * 1000;

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
    let lastTotal = -1;
    let pollInterval = POLL_INTERVAL_START_MS;
    let consecutiveUnknown = 0;
    const pollDeadline = Date.now() + MAX_POLL_DURATION_MS;

    while (true) {
      await sleep(pollInterval, options.signal);
      // Ramp toward a steady cadence so a multi-minute run doesn't fire hundreds
      // of status polls; the run advances on the order of seconds per question,
      // so an ~8s poll still keeps the live counter current.
      pollInterval = Math.min(
        Math.round(pollInterval * POLL_BACKOFF_FACTOR),
        POLL_INTERVAL_MAX_MS,
      );

      const statusRes = await fetch(statusUrl, { signal: options.signal });
      const status = (await statusRes.json()) as StatusResponse;

      if (status.status === "running") {
        consecutiveUnknown = 0;
        const p = status.progress;
        // Emit a progress event whenever the snapshot advances — including the
        // moment the mega prompt returns and `total` first becomes non-zero,
        // which is what flips the UI from the simulated timer to the live
        // question counter — while still collapsing duplicate polls.
        if (p && (p.completed !== lastCompleted || p.total !== lastTotal)) {
          lastCompleted = p.completed;
          lastTotal = p.total;
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
        // Stop following a run that outlives the expected window rather than
        // poll a possibly-evicted job indefinitely. It keeps running and caches
        // its result server-side, so a later run picks it up instantly.
        if (Date.now() > pollDeadline) {
          return {
            ok: false,
            raw: "",
            parsed: null,
            error:
              "Analysis is taking longer than expected and is still running in the background. Run again in a few minutes to pick up the completed result.",
          };
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

      // "unknown": no job record and no cached run. Right after /start this is
      // almost always the just-written record not having propagated yet, so
      // retry a few times before concluding the run was genuinely lost — a
      // single transient blip must not fail a run that is actually starting.
      consecutiveUnknown += 1;
      if (
        consecutiveUnknown < MAX_CONSECUTIVE_UNKNOWN &&
        Date.now() < pollDeadline
      ) {
        continue;
      }
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

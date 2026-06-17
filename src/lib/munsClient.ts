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

/** A single live progress update streamed from the server during a run. */
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
  /** Abort signal used to cancel an in-flight run. */
  signal?: AbortSignal;
  /** When true, bypass the cached run and force a fresh model run. */
  force?: boolean;
  /** Called for each live progress event streamed from the server. */
  onProgress?: (event: GovernanceProgress) => void;
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
 * Reads the SSE body of a fresh lane run, forwarding "progress" events to the
 * caller and resolving with the terminal "done" payload (the lane's results).
 */
async function consumeRunStream(
  response: Response,
  onProgress: (event: GovernanceProgress) => void,
): Promise<LaneRouteResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { ok: false, error: "Empty response stream." };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let done: LaneRouteResponse | null = null;

  const handleFrame = (frame: string) => {
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    let payload: unknown;
    try {
      payload = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }
    if (eventName === "progress") {
      onProgress(payload as GovernanceProgress);
    } else if (eventName === "done") {
      done = payload as LaneRouteResponse;
    }
  };

  while (true) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (frame.trim()) handleFrame(frame);
    }
  }
  if (buffer.trim()) handleFrame(buffer);

  return done ?? { ok: false, error: "Run ended without a result." };
}

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
    // Aggregate progress from every lane into a single combined counter before
    // it reaches the UI — each lane reports its own completed/total.
    const tally: Record<string, { completed: number; total: number }> = {};
    const handleProgress = (event: GovernanceProgress) => {
      tally[event.chain] = { completed: event.completed, total: event.total };
      let completed = 0;
      let total = 0;
      for (const key in tally) {
        completed += tally[key].completed;
        total += tally[key].total;
      }
      options.onProgress?.({ ...event, completed, total });
    };

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
        // Fresh runs stream SSE; a cached full run comes back as plain JSON.
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("text/event-stream")) {
          return consumeRunStream(response, handleProgress);
        }
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

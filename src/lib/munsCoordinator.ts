import {
  MUNS_LANE_COUNT,
  assembleMunsResults,
  runMunsChatLane,
  type LaneProgress,
  type QuestionResult,
} from "@/lib/munsChatService";
import {
  putCachedRun,
  runCacheKey,
  type KVNamespaceLike,
} from "@/lib/munsCache";
import { jobKey, putJob, type JobProgress, type JobRecord } from "@/lib/munsJob";
import { consumeRunStream, type LaneRouteResponse } from "@/lib/munsStream";

// A Cloudflare service binding is just a Fetcher. Declared locally so we take
// no hard dependency on the generated worker types.
export interface SelfService {
  fetch(request: Request): Promise<Response>;
}

/**
 * Everything the coordinator needs, resolved at request scope and passed in
 * explicitly. Nothing here reads the ambient Cloudflare context, so the
 * coordinator runs correctly inside a detached `waitUntil` task (where that
 * context is not guaranteed) and is trivially testable.
 */
export interface CoordinatorEnv {
  kv: KVNamespaceLike | null;
  /** Worker self-reference used to run each lane as its own invocation. */
  self: SelfService | null;
  token?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  /** LLM_PROVIDER toggle — "claude" routes scoring through Bedrock instead. */
  llmProvider?: "openai" | "claude";
  claudeApiKey?: string;
  claudeModel?: string;
  claudeRegion?: string;
}

export interface CoordinatorInput {
  ticker: string;
  companyName: string;
  /** Canonical country name (e.g. "INDIA"), already resolved by the caller. */
  country: string;
  force?: boolean;
}

// KV writes to a single key are rate-limited (~1/s) and eventually consistent,
// so progress checkpoints are throttled. The terminal state is always written.
const PROGRESS_WRITE_INTERVAL_MS = 2000;

/**
 * Run one lane in its own invocation via the worker self-reference so it gets a
 * fresh Cloudflare subrequest budget — the entire reason the checklist is split
 * into lanes. When no self-reference is bound (e.g. `next dev`), fall back to
 * running the lane in-process, where there is no subrequest cap to respect.
 */
async function runLane(
  self: SelfService | null,
  lane: number,
  input: CoordinatorInput,
  token: string,
  onProgress: (event: LaneProgress) => void,
): Promise<LaneRouteResponse> {
  if (!self) {
    const result = await runMunsChatLane(
      lane,
      input.ticker,
      input.companyName,
      token,
      undefined,
      onProgress,
    );
    return result.ok
      ? { ok: true, full: false, results: result.results }
      : { ok: false, error: result.error };
  }

  const response = await self.fetch(
    new Request("https://worker/api/muns/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: input.ticker,
        companyName: input.companyName,
        country: input.country,
        force: input.force,
        lane,
      }),
    }),
  );

  // Fresh runs stream SSE; a cached full run comes back as plain JSON.
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    return consumeRunStream(response, onProgress);
  }
  return (await response.json()) as LaneRouteResponse;
}

/**
 * Drive a full governance run to completion, independent of any client
 * connection. Intended to be launched via `ctx.waitUntil(...)`: it fans the
 * lanes out, merges + scores + caches the result, and checkpoints progress and
 * the final outcome to the job store so a polling (or returning) client can
 * follow along and pick up the result even if the original browser is gone.
 *
 * Never throws — every terminal path writes a job record.
 */
export async function runCoordinator(
  input: CoordinatorInput,
  env: CoordinatorEnv,
): Promise<void> {
  const key = jobKey(input);
  const cacheKey = runCacheKey(input);
  const startedAt = Date.now();

  // Aggregate each lane's completed/total into one combined counter, mirroring
  // the tally the browser used to keep.
  const tally: Record<string, { completed: number; total: number }> = {};
  let failed = 0;
  let lastWrite = 0;
  let latest: JobProgress = {
    chain: "A",
    phase: "mega",
    section: "",
    particulars: "Connecting to MUNS…",
    ok: true,
    completed: 0,
    total: 0,
    failed: 0,
  };

  const writeRunning = async (force = false): Promise<void> => {
    const now = Date.now();
    if (!force && now - lastWrite < PROGRESS_WRITE_INTERVAL_MS) return;
    lastWrite = now;
    const record: JobRecord = {
      status: "running",
      ticker: input.ticker,
      country: input.country,
      startedAt,
      updatedAt: now,
      progress: latest,
    };
    await putJob(key, record, env.kv);
  };

  const writeTerminal = (rec: {
    status: JobStatus;
    raw?: string;
    errorCount?: number;
    total?: number;
    error?: string;
    cached?: boolean;
    cachedAt?: string;
  }): Promise<void> =>
    putJob(
      key,
      {
        status: rec.status,
        ticker: input.ticker,
        country: input.country,
        startedAt,
        updatedAt: Date.now(),
        progress: latest,
        raw: rec.raw,
        errorCount: rec.errorCount,
        total: rec.total,
        error: rec.error,
        cached: rec.cached,
        cachedAt: rec.cachedAt,
      },
      env.kv,
    );

  const handleProgress = (event: LaneProgress): void => {
    tally[event.chain] = { completed: event.completed, total: event.total };
    let completed = 0;
    let total = 0;
    for (const k in tally) {
      completed += tally[k].completed;
      total += tally[k].total;
    }
    if (!event.ok) failed += 1;
    latest = {
      chain: event.chain,
      phase: event.phase,
      section: event.section,
      particulars: event.particulars,
      ok: event.ok,
      error: event.error,
      completed,
      total,
      failed,
    };
    // Fire-and-forget, throttled checkpoint. putJob never rejects, so an
    // unawaited write can't surface as an unhandled rejection.
    void writeRunning();
  };

  try {
    // Seed an initial running record immediately so the first status poll has
    // something to show before the mega prompt returns.
    await writeRunning(true);

    // ── Fan out: one invocation per lane, all in parallel ──────────────────
    const laneResponses = await Promise.all(
      Array.from({ length: MUNS_LANE_COUNT }, (_, lane) =>
        runLane(env.self, lane, input, env.token ?? "", handleProgress),
      ),
    );

    // Any lane that failed to even seed its session fails the whole run.
    const failedLane = laneResponses.find((r) => !r.ok);
    if (failedLane) {
      await writeTerminal({
        status: "error",
        error: failedLane.error || "MUNS request failed.",
      });
      return;
    }

    // Cache hit surfaced by a lane: use the full assembled document directly.
    const cachedHit = laneResponses.find(
      (r) => r.full && typeof r.raw === "string",
    );
    if (cachedHit && typeof cachedHit.raw === "string") {
      latest = { ...latest, completed: latest.total, particulars: "" };
      await writeTerminal({
        status: "done",
        raw: cachedHit.raw,
        errorCount: 0,
        total: latest.total,
        cached: cachedHit.cached,
        cachedAt: cachedHit.cachedAt,
      });
      return;
    }

    // ── Merge every lane's partial results, then score + cache ─────────────
    const merged: QuestionResult[] = laneResponses.flatMap(
      (r) => r.results ?? [],
    );
    const { raw, errorCount, total } = await assembleMunsResults(merged, {
      openaiApiKey: env.openaiApiKey,
      openaiModel: env.openaiModel,
      llmProvider: env.llmProvider,
      claudeApiKey: env.claudeApiKey,
      claudeModel: env.claudeModel,
      claudeRegion: env.claudeRegion,
    });

    // A wholesale failure (every question errored) yields a useless scorecard.
    if (total > 0 && errorCount === total) {
      await writeTerminal({
        status: "error",
        error: `All ${total} questions failed. Check subrequest limits or token validity and retry.`,
      });
      return;
    }

    // Persist the durable run only when fully clean, matching the assemble
    // route: a partial run is shown but never frozen for a month.
    if (errorCount === 0) {
      await putCachedRun(cacheKey, raw, env.kv);
    }

    latest = { ...latest, completed: latest.total, particulars: "" };
    await writeTerminal({ status: "done", raw, errorCount, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await writeTerminal({ status: "error", error: `Failed to run: ${message}` });
  }
}

// Local alias so the terminal writer's status is typed without importing the
// value form of the union.
type JobStatus = JobRecord["status"];

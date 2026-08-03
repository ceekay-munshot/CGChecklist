import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCachedRun, getMunsKv, runCacheKey } from "@/lib/munsCache";
import { getJob, isStale, jobKey } from "@/lib/munsJob";
import {
  runCoordinator,
  type CoordinatorEnv,
  type SelfService,
} from "@/lib/munsCoordinator";
import { resolveCountry } from "@/lib/munsConfig";

// Starting a run detaches background work from the request, so this route must
// never be statically optimized.
export const dynamic = "force-dynamic";
// Hint the platform to allow the detached run to keep going after the response.
export const maxDuration = 300;

interface StartRequest {
  ticker?: string;
  companyName?: string;
  country?: string;
  /** When true, bypass the cached run and force a fresh model run. */
  force?: boolean;
}

// Minimal shape of the execution context we rely on (ctx.waitUntil). Declared
// locally to avoid a hard dependency on @cloudflare/workers-types.
interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Kick off (or re-attach to) a durable governance run.
 *
 * The heavy work is handed to the coordinator and kept alive with
 * `ctx.waitUntil`, so it runs to completion on the server regardless of what
 * the browser does next. The response returns immediately; the client then
 * polls /api/muns/status. A finished run is served straight from the cache, and
 * an already-running run is joined rather than duplicated.
 */
export async function POST(request: Request) {
  let body: StartRequest;
  try {
    body = (await request.json()) as StartRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const ticker = body.ticker?.trim();
  const companyName = body.companyName?.trim();
  if (!ticker || !companyName) {
    return NextResponse.json(
      {
        ok: false,
        error: "Ticker and company name are required to run analysis.",
      },
      { status: 400 },
    );
  }

  const country = resolveCountry(body.country);

  // Resolve bindings + secrets now, at request scope, and hand them to the
  // coordinator — the ambient context is not guaranteed inside waitUntil.
  let env: CoordinatorEnv;
  let ctx: ExecutionContextLike | null = null;
  try {
    const cf = getCloudflareContext();
    const bindings = cf.env as Record<string, unknown>;
    env = {
      kv: getMunsKv((bindings.MUNS_RUNS as never) ?? null),
      self: (bindings.WORKER_SELF_REFERENCE as SelfService | undefined) ?? null,
      token:
        (bindings.TEMPORARY_TOKEN as string | undefined) ??
        process.env.TEMPORARY_TOKEN,
      openaiApiKey:
        (bindings.OPENAI_API_KEY as string | undefined) ??
        process.env.OPENAI_API_KEY,
      openaiModel:
        (bindings.OPENAI_SCORING_MODEL as string | undefined) ??
        process.env.OPENAI_SCORING_MODEL,
      llmProvider:
        ((bindings.LLM_PROVIDER as string | undefined) ??
          process.env.LLM_PROVIDER) === "claude"
          ? "claude"
          : "openai",
      claudeApiKey:
        (bindings.temp_claude_token as string | undefined) ??
        process.env.temp_claude_token,
      claudeModel:
        (bindings.BEDROCK_MODEL_ID as string | undefined) ??
        process.env.BEDROCK_MODEL_ID,
      claudeRegion:
        (bindings.BEDROCK_REGION as string | undefined) ??
        process.env.BEDROCK_REGION,
    };
    ctx = (cf.ctx as ExecutionContextLike | undefined) ?? null;
  } catch {
    // No Cloudflare context (plain `next dev` without the OpenNext dev shim):
    // fall back to process.env + the in-memory job store, and run inline.
    env = {
      kv: null,
      self: null,
      token: process.env.TEMPORARY_TOKEN,
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiModel: process.env.OPENAI_SCORING_MODEL,
      llmProvider: process.env.LLM_PROVIDER === "claude" ? "claude" : "openai",
      claudeApiKey: process.env.temp_claude_token,
      claudeModel: process.env.BEDROCK_MODEL_ID,
      claudeRegion: process.env.BEDROCK_REGION,
    };
  }

  if (!env.token) {
    return NextResponse.json(
      { ok: false, error: "TEMPORARY_TOKEN not configured." },
      { status: 500 },
    );
  }

  const key = jobKey({ ticker, country });

  if (!body.force) {
    // Fast path: a fresh stored run already satisfies this request.
    const cached = await getCachedRun(runCacheKey({ ticker, country }), env.kv);
    if (cached) {
      return NextResponse.json({
        ok: true,
        status: "done",
        jobId: key,
        full: true,
        raw: cached.raw,
        cached: true,
        cachedAt: new Date(cached.storedAt).toISOString(),
      });
    }

    // Attach to a live run instead of starting a duplicate one.
    const existing = await getJob(key, env.kv);
    if (
      existing &&
      existing.status === "running" &&
      !isStale(existing, Date.now())
    ) {
      return NextResponse.json({ ok: true, status: "running", jobId: key });
    }
  }

  // Launch the detached coordinator. It runs to completion independent of this
  // request; the browser follows along via /api/muns/status.
  const task = runCoordinator({ ticker, companyName, country, force: body.force }, env);
  if (ctx) {
    ctx.waitUntil(task);
  } else {
    // Dev fallback: no waitUntil available. Don't block the response on the
    // full run; in a single Node process the in-memory job store still lets the
    // status poll observe progress.
    void task.catch(() => {});
  }

  return NextResponse.json({ ok: true, status: "running", jobId: key });
}

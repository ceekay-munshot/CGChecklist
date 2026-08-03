import { NextResponse } from "next/server";
import { putCachedRun, runCacheKey } from "@/lib/munsCache";
import { assembleMunsResults, type QuestionResult } from "@/lib/munsChatService";
import { resolveCountry } from "@/lib/munsConfig";

interface AssembleRequest {
  ticker?: string;
  country?: string;
  results?: QuestionResult[];
}

// Receives the merged lane results from the browser, assembles them into the
// markdown the parser reads, enforces the all-questions-must-succeed rule, and
// (only on success) writes the full run to the KV cache. Caching lives here
// because the KV binding is server-side and no single lane invocation holds the
// complete result set. This step makes no chat subrequests.
export async function POST(request: Request) {
  let body: AssembleRequest;
  try {
    body = (await request.json()) as AssembleRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const ticker = body.ticker?.trim();
  if (!ticker) {
    return NextResponse.json(
      { ok: false, error: "Ticker is required to assemble a run." },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.results)) {
    return NextResponse.json(
      { ok: false, error: "results must be an array." },
      { status: 400 },
    );
  }

  const country = resolveCountry(body.country);
  // When OPENAI_API_KEY is configured, answers are graded by the LLM scorer
  // (negation- and magnitude-aware); otherwise assembleMunsResults falls back
  // to the local heuristic. Scoring failures degrade gracefully — never fatal.
  const { raw, errorCount, total } = await assembleMunsResults(body.results, {
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_SCORING_MODEL,
    llmProvider: process.env.LLM_PROVIDER === "claude" ? "claude" : "openai",
    claudeApiKey: process.env.temp_claude_token,
    claudeModel: process.env.BEDROCK_MODEL_ID,
    claudeRegion: process.env.BEDROCK_REGION,
    signal: request.signal,
  });

  // A wholesale failure (every question errored — e.g. an invalid token or a
  // dead lane) produces a useless scorecard, so reject it outright. A few
  // transient per-question failures should NOT discard the run: we return the
  // partial scorecard so the questions that did succeed are still shown.
  if (total > 0 && errorCount === total) {
    return NextResponse.json(
      {
        ok: false,
        error: `All ${total} questions failed. Check subrequest limits or token validity and retry.`,
      },
      { status: 502 },
    );
  }

  // Cache only a fully-successful run. A partial run is shown to the user but
  // never persisted, so the failed question(s) aren't frozen for 30 days — the
  // next run retries them.
  if (errorCount === 0) {
    await putCachedRun(runCacheKey({ ticker, country }), raw);
  }

  return NextResponse.json({ ok: true, raw, cached: false, errorCount, total });
}

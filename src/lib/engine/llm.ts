// Shared LLM client for the source-first engine — Claude via the AWS Bedrock
// Converse API, the same raw-HTTP + bearer-token path the governance scorer
// (src/lib/scoring/claudeScore.ts) and cgchecklist2.0 already use. No AWS SDK,
// no SigV4. The engine reads the company's filings and answers each checklist
// question through complete()/completeJSON() here.
//
// Config comes from env (set by the analyze workflow):
//   CLAUDE_BEDROCK_API_KEY   — Bedrock API key (bearer token); the workflow maps
//                              the TEMP_CLAUDE_TOKEN repo secret to this.
//   CLAUDE_BEDROCK_REGION    — default us-east-1
//   CLAUDE_BEDROCK_MODEL_ID  — default Sonnet 4.5 inference profile; set to the
//                              Sonnet 5 Bedrock id to switch models (one var, no
//                              code change).

const DEFAULT_REGION = "us-east-1";
const DEFAULT_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const COMPLETE_TIMEOUT_MS = 60_000;

const apiKey = (): string => process.env.CLAUDE_BEDROCK_API_KEY?.trim() ?? "";
const region = (): string =>
  process.env.CLAUDE_BEDROCK_REGION?.trim() || DEFAULT_REGION;
const modelId = (override?: string): string =>
  override || process.env.CLAUDE_BEDROCK_MODEL_ID?.trim() || DEFAULT_MODEL_ID;

const endpoint = (model: string): string =>
  `https://bedrock-runtime.${region()}.amazonaws.com/model/${encodeURIComponent(model)}/converse`;

export interface CompleteOpts {
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  signal?: AbortSignal;
}

interface ConverseResponse {
  output?: { message?: { content?: Array<{ text?: string }> } };
}

export function isConfigured(): boolean {
  return apiKey().length > 0;
}

export function activeModelId(): string {
  return modelId();
}

export function activeRegion(): string {
  return region();
}

/** One Bedrock Converse call. Throws on missing key or a non-2xx response. */
export async function complete(opts: CompleteOpts): Promise<{ text: string }> {
  const key = apiKey();
  if (!key) throw new Error("CLAUDE_BEDROCK_API_KEY is not set");

  const body: Record<string, unknown> = {
    messages: [{ role: "user", content: [{ text: opts.prompt }] }],
    inferenceConfig: {
      temperature: opts.temperature ?? 0,
      ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}),
    },
  };
  if (opts.system) body.system = [{ text: opts.system }];

  const res = await fetch(endpoint(modelId(opts.model)), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal ?? AbortSignal.timeout(COMPLETE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Bedrock HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as ConverseResponse;
  const text = (data.output?.message?.content ?? [])
    .map((c) => c.text ?? "")
    .join("");
  return { text };
}

// Bedrock sometimes wraps JSON in a markdown fence despite instructions; strip
// it before parsing (same defensive step as claudeScore.ts).
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

/**
 * complete() + JSON.parse, with one retry that echoes the parse error back to
 * the model. Returns the parsed value; throws if it still isn't valid JSON.
 */
export async function completeJSON<T = unknown>(opts: CompleteOpts): Promise<T> {
  const first = await complete(opts);
  try {
    return JSON.parse(stripCodeFence(first.text)) as T;
  } catch {
    const retry = await complete({
      ...opts,
      prompt: `${opts.prompt}\n\nYour previous reply was not valid JSON. Reply with a single valid JSON value and nothing else.`,
    });
    return JSON.parse(stripCodeFence(retry.text)) as T;
  }
}

/**
 * Loud preflight — a 1-token probe so a bad key / wrong region / model that
 * isn't enabled fails clearly at the start of a run instead of degrading every
 * item to "not available". Returns a human-readable status, never throws.
 */
export async function preflight(): Promise<{ ok: boolean; detail: string }> {
  if (!isConfigured()) {
    return { ok: false, detail: "CLAUDE_BEDROCK_API_KEY not set" };
  }
  try {
    const res = await fetch(endpoint(modelId()), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ text: "ping" }] }],
        inferenceConfig: { maxTokens: 1, temperature: 0 },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      return { ok: true, detail: `${modelId()} @ ${region()} reachable` };
    }
    const detail = await res.text().catch(() => "");
    return {
      ok: false,
      detail: `${modelId()} @ ${region()} → HTTP ${res.status}: ${detail.slice(0, 200)}`,
    };
  } catch (e) {
    return { ok: false, detail: `unreachable: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Claude-via-AWS-Bedrock governance scorer — a drop-in alternative to the
// OpenAI scorer in `llmScore.ts`.
//
// This module is intentionally self-contained: it duplicates the small
// prompt/normalization logic from `llmScore.ts` rather than importing runtime
// code from it, so the entire Claude path can be deleted (this file, plus its
// call site behind the LLM_PROVIDER toggle) without touching the OpenAI path
// at all. It is selected ONLY when LLM_PROVIDER="claude" and a Claude/Bedrock
// key is configured; see `assembleMunsResults` in `munsChatService.ts`.
//
// Output contract matches `scoreAnswersWithLLM` exactly: same input shape
// (ScoreItem[]), same output shape (Map<questionId, ScoreResult>), same
// fallback-by-throwing behavior on transport/parse failure. Callers cannot
// tell which provider produced a given Map.
// ---------------------------------------------------------------------------

import type { ScoreItem, ScoreResult, ScoreValue, Verdict } from "./llmScore";

export const DEFAULT_BEDROCK_REGION = "us-east-1";
export const DEFAULT_BEDROCK_MODEL_ID =
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

// Mirrors `polarityHint` in llmScore.ts.
function polarityHint(polarity: 1 | -1 | 0): string {
  if (polarity === 1) {
    return "affirmative_good: a Yes / high / present / comprehensive finding is GOOD (score 2); its absence or a low/No finding is bad (score 0).";
  }
  if (polarity === -1) {
    return "affirmative_bad: a Yes / high / present finding is a RED FLAG (score 0); its absence (no cases, no pledge, not material, low) is GOOD (score 2).";
  }
  return "descriptive: judge the answer on plain governance merit. A benign or neutral fact (e.g. 'no government-facing business', 'no promoter feud') is NOT negative — score it Neutral (1) or Positive (2), never Negative merely because it contains the words 'no'/'not'.";
}

// Mirrors SYSTEM_PROMPT in llmScore.ts, word for word, so the two providers
// grade against the same rubric.
const SYSTEM_PROMPT = `You are a corporate-governance analyst grading answers to a fixed due-diligence checklist.

For each question you receive: the question text, its answer TYPE, a polarity hint (which direction is GOOD for that question), and an analyst's answer. Return a governance SCORE and a type-appropriate one-word VERDICT.

SCORE (drives the risk colour and the governance total) — always 0, 1 or 2:
- 2 = GOOD for governance quality / low risk.
- 1 = mixed, partial, borderline, or the fact could not be established.
- 0 = RED FLAG / bad for governance / high risk.

VERDICT — depends on the question's TYPE:
- type "boolean": answer the yes/no question factually with "Yes", "No", or "Unclear". This is the literal answer, INDEPENDENT of good/bad — a genuine red flag can be verdict "Yes" with score 0 (e.g. a shareholding pledge: "Yes", score 0), and a reassuring finding can be "No" with score 2 (e.g. no SEBI cases: "No", score 2).
- type "sentiment": use "Positive", "Neutral", or "Negative", agreeing with the score (2 -> Positive, 1 -> Neutral, 0 -> Negative), or "Unclear".
If the answer says the fact could not be established / is not available / unknown, use score 1 and verdict "Unclear".

Hard rules:
1. Respect negation. "No red flags", "no litigation", "no pledge", "no SEBI cases", "not a material driver" are REASSURING (good).
2. Judge magnitude and nature, not just keywords. Example: for related-party transactions, LARGE or unusual related-party dealings are a concern even if "disclosed"; routine, fully-disclosed RPTs are fine.
3. Follow the polarity hint to decide which direction is good for the SCORE.
4. Base everything ONLY on the answer text provided. Do not invent facts.

Return STRICT JSON only, shaped exactly as:
{"scores":[{"id":"<question id>","score":<0|1|2>,"verdict":"<Yes|No for boolean; Positive|Neutral|Negative for sentiment; Unclear if unknown>","reason":"<= 15 words"}]}
Return one entry for every question id you are given, and nothing outside the JSON object.`;

function verdictFromScore(score: ScoreValue): Verdict {
  if (score === 2) return "Positive";
  if (score === 0) return "Negative";
  return "Neutral";
}

function clampScore(n: number): ScoreValue {
  if (n >= 2) return 2;
  if (n <= 0) return 0;
  return 1;
}

function boolAnswerFromScore(
  polarity: number,
  score: ScoreValue,
): "Yes" | "No" | null {
  if (polarity === 0 || score === 1) return null;
  const good = score === 2;
  if (polarity === 1) return good ? "Yes" : "No";
  return good ? "No" : "Yes";
}

function normalizeEntry(
  raw: unknown,
  itemsById: Map<string, ScoreItem>,
): { id: string; result: ScoreResult } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  if (!id) return null;

  const item = itemsById.get(id);
  const type = item?.type ?? "sentiment";
  const polarity = item?.polarity ?? 0;

  const score = clampScore(Number(obj.score));
  const verdictRaw = (
    typeof obj.verdict === "string"
      ? obj.verdict
      : typeof obj.answer === "string"
        ? obj.answer
        : ""
  )
    .toLowerCase()
    .trim();
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";

  if (
    verdictRaw.startsWith("unclear") ||
    verdictRaw.startsWith("n/a") ||
    verdictRaw.startsWith("not ") ||
    verdictRaw.includes("unknown")
  ) {
    return { id, result: { score: 1, response: "Unclear", reason } };
  }

  if (type === "boolean") {
    let answer: "Yes" | "No" | null = null;
    if (verdictRaw.startsWith("yes")) answer = "Yes";
    else if (verdictRaw.startsWith("no")) answer = "No";
    else answer = boolAnswerFromScore(polarity, score);
    return { id, result: { score, response: answer ?? "Unclear", reason } };
  }

  return { id, result: { score, response: verdictFromScore(score), reason } };
}

// Bedrock Converse API sometimes wraps JSON in a markdown fence despite
// instructions not to; strip it defensively before parsing.
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

/**
 * Grade every answer in `items` with a single Claude (Bedrock Converse) call.
 * Same contract as `scoreAnswersWithLLM` in llmScore.ts: returns a map keyed
 * by questionId, omitting any id the model didn't return usably, and throws
 * on transport/auth/parse failure so the caller can fall back.
 */
export async function scoreAnswersWithClaude(
  items: ScoreItem[],
  opts: {
    apiKey: string;
    model?: string;
    region?: string;
    signal?: AbortSignal;
  },
): Promise<Map<string, ScoreResult>> {
  const map = new Map<string, ScoreResult>();
  if (items.length === 0) return map;

  const itemsById = new Map<string, ScoreItem>();
  for (const it of items) itemsById.set(it.id, it);

  const payloadQuestions = items.map((it) => ({
    id: it.id,
    section: it.section,
    question: it.question,
    type: it.type,
    polarity: polarityHint(it.polarity),
    answer: it.answer,
  }));

  const region = opts.region || DEFAULT_BEDROCK_REGION;
  const modelId = opts.model || DEFAULT_BEDROCK_MODEL_ID;
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      system: [{ text: SYSTEM_PROMPT }],
      messages: [
        {
          role: "user",
          content: [
            { text: JSON.stringify({ questions: payloadQuestions }) },
          ],
        },
      ],
      inferenceConfig: { temperature: 0 },
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Claude (Bedrock) scoring failed (HTTP ${res.status}): ${body.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    output?: { message?: { content?: { text?: string }[] } };
  };
  const content = json.output?.message?.content
    ?.map((block) => block.text ?? "")
    .join("");
  if (!content) throw new Error("Claude (Bedrock) scoring returned no content.");

  const parsed = JSON.parse(stripCodeFence(content)) as Record<
    string,
    unknown
  >;
  const rows = Array.isArray(parsed.scores)
    ? parsed.scores
    : Array.isArray(parsed.results)
      ? parsed.results
      : [];

  for (const row of rows) {
    const norm = normalizeEntry(row, itemsById);
    if (norm) map.set(norm.id, norm.result);
  }

  return map;
}

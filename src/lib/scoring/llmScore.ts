// ---------------------------------------------------------------------------
// LLM-based governance scorer.
//
// The MUNS model returns prose answers with no explicit score, so historically
// we inferred a 0/1/2 score with a keyword counter (see `scoreAnswer` in
// munsChatService.ts). That counter is negation-blind — "no red flags" and
// "not a material driver" score the same as "red flags" / "material" — so a
// GOOD answer often reads as Negative and vice-versa.
//
// This module grades the answers with a single batched OpenAI call instead.
// The model is told, per question, which direction is GOOD (the polarity hint),
// and is explicitly instructed to respect negation and weigh magnitude. It is
// used ONLY when OPENAI_API_KEY is configured; the caller falls back to the
// (now negation-aware) heuristic when it is not, or if this call fails, so the
// dashboard never hard-depends on OpenAI.
// ---------------------------------------------------------------------------

export type ScoreValue = 0 | 1 | 2;

// One-word verdict shown in the Response column. Boolean questions read
// "Yes"/"No"; sentiment questions read "Positive"/"Neutral"/"Negative". Either
// way the badge COLOUR comes from the score, so a red-flag "Yes" shows red.
export type Verdict =
  | "Yes"
  | "No"
  | "Positive"
  | "Neutral"
  | "Negative"
  | "Unclear";

export type QuestionType = "boolean" | "sentiment";

export interface ScoreResult {
  score: ScoreValue;
  response: Verdict;
  reason: string;
}

// What the caller hands us for each checklist question.
export interface ScoreItem {
  id: string; // questionId, e.g. "BOARD-5"
  section: string; // human-readable section title
  question: string; // the checklist particulars
  polarity: 1 | -1 | 0; // +1 affirmative-good, -1 affirmative-bad, 0 descriptive
  type: QuestionType; // "boolean" → Yes/No answer; "sentiment" → Positive/…
  answer: string; // the cleaned MUNS answer prose
}

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

// Translate the numeric polarity into a label + guidance the model can reason
// about. This is the crux: it tells the model which direction is GOOD for THIS
// question, so "shareholding pledge: Yes" scores 0 while "independent board:
// Yes" scores 2.
function polarityHint(polarity: 1 | -1 | 0): string {
  if (polarity === 1) {
    return "affirmative_good: a Yes / high / present / comprehensive finding is GOOD (score 2); its absence or a low/No finding is bad (score 0).";
  }
  if (polarity === -1) {
    return "affirmative_bad: a Yes / high / present finding is a RED FLAG (score 0); its absence (no cases, no pledge, not material, low) is GOOD (score 2).";
  }
  return "descriptive: judge the answer on plain governance merit. A benign or neutral fact (e.g. 'no government-facing business', 'no promoter feud') is NOT negative — score it Neutral (1) or Positive (2), never Negative merely because it contains the words 'no'/'not'.";
}

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

// Derive Yes/No from the good/bad score plus polarity, for a boolean question
// where the model didn't give a clean Yes/No. On a "+1" question the good
// answer is Yes; on a "-1" question the good answer is No.
function boolAnswerFromScore(
  polarity: number,
  score: ScoreValue,
): "Yes" | "No" | null {
  if (polarity === 0 || score === 1) return null;
  const good = score === 2;
  if (polarity === 1) return good ? "Yes" : "No";
  return good ? "No" : "Yes";
}

// Coerce one raw model entry into a validated ScoreResult, keeping the score
// and the word consistent regardless of what the model returned. The verdict
// vocabulary is chosen by the question's type: boolean → Yes/No, sentiment →
// Positive/Neutral/Negative. Returns null if the entry is unusable (missing id)
// so the caller can fall back for it.
function normalizeEntry(
  raw: unknown,
  itemsById: Map<string, ScoreItem>,
): { id: string; result: ScoreResult } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  if (!id) return null;

  const item = itemsById.get(id);
  const type: QuestionType = item?.type ?? "sentiment";
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

  // Explicit "could not establish" always lands in the neutral bucket.
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

  // sentiment: keep the word in lockstep with the score.
  return { id, result: { score, response: verdictFromScore(score), reason } };
}

/**
 * Grade every answer in `items` with a single OpenAI call.
 *
 * Returns a map keyed by questionId. Any id the model omits or returns garbage
 * for is simply absent from the map, so the caller falls back to the heuristic
 * for that row. Throws on transport / auth / parse failure so the caller can
 * fall back wholesale.
 */
export async function scoreAnswersWithLLM(
  items: ScoreItem[],
  opts: { apiKey: string; model?: string; signal?: AbortSignal },
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

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ questions: payloadQuestions }) },
      ],
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `OpenAI scoring failed (HTTP ${res.status}): ${body.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI scoring returned no content.");

  const parsed = JSON.parse(content) as Record<string, unknown>;
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

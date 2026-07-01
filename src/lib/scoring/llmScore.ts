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

// One-word verdict shown in the Response column. Kept in lockstep with the
// score so the badge colour and the word never disagree.
export type Verdict = "Positive" | "Neutral" | "Negative" | "Unclear";

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

For each question you receive: the question text, a polarity hint (which direction is GOOD for that question), and an analyst's answer. Assign a governance score and a matching one-word verdict.

Scoring rubric:
- 2 = Positive: the finding is GOOD for governance quality / low risk.
- 1 = Neutral: mixed, partial, borderline, or the answer could not establish the fact.
- 0 = Negative: the finding is a RED FLAG / bad for governance / high risk.

The verdict MUST agree with the score: 2 -> "Positive", 1 -> "Neutral", 0 -> "Negative". If the answer says the fact could not be established / is not available / not disclosed / unknown, use score 1 and verdict "Unclear".

Hard rules:
1. Respect negation. "No red flags", "no litigation", "no pledge", "no SEBI cases", "not a material driver" are REASSURING (good), never negative.
2. Judge magnitude and nature, not just keywords. Example: for related-party transactions, LARGE or unusual related-party dealings are a concern even if "disclosed"; routine, fully-disclosed RPTs are fine.
3. Follow the polarity hint to decide which direction is good for each question.
4. Base the score ONLY on the answer text provided. Do not invent facts.

Return STRICT JSON only, shaped exactly as:
{"scores":[{"id":"<question id>","score":<0|1|2>,"verdict":"Positive|Neutral|Negative|Unclear","reason":"<= 15 words"}]}
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

// Coerce one raw model entry into a validated ScoreResult, keeping the score
// and the word consistent regardless of what the model returned. Returns null
// if the entry is unusable (missing id) so the caller can fall back for it.
function normalizeEntry(
  raw: unknown,
): { id: string; result: ScoreResult } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  if (!id) return null;

  const score = clampScore(Number(obj.score));
  const verdictRaw =
    typeof obj.verdict === "string" ? obj.verdict.toLowerCase().trim() : "";
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";

  // "Unclear" is the only verdict allowed to override the score-derived word,
  // and it always lands in the neutral bucket so the colour stays amber.
  if (verdictRaw.startsWith("unclear") || verdictRaw.startsWith("not")) {
    return { id, result: { score: 1, response: "Unclear", reason } };
  }

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

  const payloadQuestions = items.map((it) => ({
    id: it.id,
    section: it.section,
    question: it.question,
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
    const norm = normalizeEntry(row);
    if (norm) map.set(norm.id, norm.result);
  }

  return map;
}

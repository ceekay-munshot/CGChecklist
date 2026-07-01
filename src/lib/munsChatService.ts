import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import {
  MUNS_CHAT_API_URL,
  MUNS_CHAT_CONTEXT_EMAIL,
  PARALLEL_LANES,
} from "@/lib/munsConfig";
import {
  scoreAnswersWithLLM,
  type ScoreItem,
  type ScoreResult,
} from "@/lib/scoring/llmScore";

// ---------------------------------------------------------------------------
// Suffix appended to the mega prompt and every question, matching cool_script.sh
// ---------------------------------------------------------------------------
const ONE_LINE_ONLY = " Answer in THREE BULLET POINTS ONLY STRICTLY.";

// ---------------------------------------------------------------------------
// Mega prompt — sent as the very first message to initialise the chat session
// ---------------------------------------------------------------------------
export const MEGA_PROMPT =
  "Make structured tables answering the below questions for the company . " +
  "If an answer is Not established or Not available in the annual report - " +
  "Quickly Websearch and find it . Keep each answer specific to the company " +
  "with exact figures, names and dates - never generic . State the finding " +
  "directly and crisply : give the fact itself with the key number(s) . Do " +
  "NOT narrate the evidence, the sources or the search process, and do NOT " +
  "say what a report 'does or does not disclose' - just answer . No hedging, " +
  "no filler . Use the exact name of the ceo/company/elements in each answer " +
  "only . DOUBLE CHECK AND VERIFY EACH ANSWER BEFORE ANSWERING." +
  ONE_LINE_ONLY;

// ---------------------------------------------------------------------------
// Section number labels used in the first question of each section
// ---------------------------------------------------------------------------
const SECTION_NUMBERS: Record<string, string> = {
  BOARD: "1",
  AUDIT: "2",
  STAKEHOLDERS: "3",
  EMPLOYEE: "4",
  INDUSTRY_PROMOTER: "5",
  STOCK_EXCHANGE: "6",
  OTHER_REGULATORY: "7",
  FINANCIALS: "8",
};

// Markdown headings the existing munsParse.ts / munsToGovernance.ts look for
const SECTION_HEADINGS: Record<string, string> = {
  BOARD: "Board of Directors",
  AUDIT: "Audit",
  STAKEHOLDERS: "Stakeholders",
  EMPLOYEE: "Employee",
  INDUSTRY_PROMOTER: "Industry and Promoter",
  STOCK_EXCHANGE: "Stock Exchange",
  OTHER_REGULATORY: "Other Regulatory",
  FINANCIALS: "Financials",
};

const ALPHA = "abcdefghijklmnopqrstuvwxyz";

// ---------------------------------------------------------------------------
// Build the ordered list of question prompts from the checklist
// ---------------------------------------------------------------------------
interface ChatQuestion {
  questionId: string;
  sectionId: string;
  sectionTitle: string;
  prompt: string;       // sent to the chat API
  particulars: string;  // clean label written into the assembled markdown
}

function buildChatQuestions(): ChatQuestion[] {
  const questions: ChatQuestion[] = [];
  for (const section of GOVERNANCE_CHECKLIST) {
    section.items.forEach((item, idx) => {
      const letter = ALPHA[idx] ?? String(idx + 1);
      let prompt: string;
      if (idx === 0) {
        const num = SECTION_NUMBERS[section.sectionId] ?? "";
        prompt = `${num}\t${section.title}\n\n\t${letter})${item.particulars}${ONE_LINE_ONLY}`;
      } else {
        prompt = `\t${letter})\t${item.particulars}${ONE_LINE_ONLY}`;
      }
      questions.push({
        questionId: item.questionId,
        sectionId: section.sectionId,
        sectionTitle: SECTION_HEADINGS[section.sectionId] ?? section.title,
        prompt,
        particulars: item.particulars,
      });
    });
  }
  return questions;
}

export const CHAT_QUESTIONS = buildChatQuestions();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface QueryContext {
  TICKER_SYMBOL: string[];
  FROM_DATE: string;
  TO_DATE: string;
  ANNOUNCEMENT_FORM_TYPE: string;
  DOCUMENT_IDS: string[];
  CATEGORIES: string[];
  WEB_SEARCH_ENABLED: boolean;
  COUNTRY: string[];
  CONTEXT_EMAIL: string;
  CONTEXT_COMPANY_NAME: string[];
  GET_ANNOUNCEMENTS_ENABLED: boolean;
  chatHistory: string[];
  mode: string;
}

interface ChatPayload {
  user_index: number;
  tasks: string[];
  chat_id?: string;
  query_context: QueryContext;
  autoAddUpcoming: boolean;
}

export interface QuestionResult {
  questionId: string;
  sectionId: string;
  sectionTitle: string;
  particulars: string;
  rawResponse: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeQueryContext(
  ticker: string,
  companyName: string,
  chatHistory: string[],
  fromDate: string,
  toDate: string,
): QueryContext {
  return {
    TICKER_SYMBOL: ticker ? [ticker] : [],
    FROM_DATE: fromDate,
    TO_DATE: toDate,
    ANNOUNCEMENT_FORM_TYPE: "all",
    DOCUMENT_IDS: [],
    CATEGORIES: [],
    WEB_SEARCH_ENABLED: true,
    // Match cool_script.sh, which always sends an empty COUNTRY.
    COUNTRY: [],
    CONTEXT_EMAIL: MUNS_CHAT_CONTEXT_EMAIL,
    CONTEXT_COMPANY_NAME: [companyName],
    GET_ANNOUNCEMENTS_ENABLED: false,
    chatHistory,
    mode: "expert",
  };
}

// The Muns Chat API wraps every answer in <ans>…</ans> nested inside a
// <task><1><tool>…</tool><ans>…</ans></1></task><sources>…</sources><eos/>
// envelope. Pull out ONLY the <ans> content and drop the tool trace, the
// <sources> JSON, the <doc_source> citation tags, and any other XML wrapper so
// the table/score parser receives clean answer prose rather than raw XML.
function stripMunsTags(text: string): string {
  const ansRegex = /<ans>([\s\S]*?)<\/ans>/gi;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = ansRegex.exec(text)) !== null) {
    blocks.push(m[1].trim());
  }

  // If we found <ans> blocks, keep only those; otherwise fall back to the raw
  // text (already-clean prose, or a JSON field the caller extracted).
  const content = blocks.length > 0 ? blocks.join("\n\n") : text;

  return content
    .replace(/<doc_?source\b[^>]*>[\s\S]*?<\/doc_?source>/gi, "")
    .replace(/<\/?doc_?source\b[^>]*>/gi, "")
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9_:-]*(?:\s[^>]*)?\s*\/?>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 10)),
    )
    .trim();
}

// Extracts the answer from a chat response. The Muns Chat API returns the full
// <task>…<ans>…</ans>…<sources>…<eos> document directly in the body (often with
// a text/event-stream content-type but WITHOUT data: framing), so we read the
// whole body and pull the <ans> block out first — the same approach as
// cool_script.sh. Genuine SSE-framed JSON and plain JSON envelopes are
// fallbacks only.
async function extractText(res: Response): Promise<string> {
  const raw = await res.text();

  // Primary path: the raw body already contains the <ans> envelope.
  if (/<ans>/i.test(raw)) {
    return stripMunsTags(raw);
  }

  // Fallback: genuine SSE framing (data: {json}) — concatenate text deltas,
  // then look for an <ans> block in the reconstructed stream.
  if (/^data:/m.test(raw)) {
    const chunks: string[] = [];
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        const t =
          (parsed.content as string | undefined) ??
          (parsed.text as string | undefined) ??
          ((parsed.delta as Record<string, unknown> | undefined)?.text as
            | string
            | undefined);
        chunks.push(typeof t === "string" ? t : data);
      } catch {
        chunks.push(data);
      }
    }
    return stripMunsTags(chunks.join(""));
  }

  // Fallback: plain JSON envelope with a known text field.
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const candidate =
      json.response ??
      json.answer ??
      json.text ??
      json.content ??
      json.message;
    if (typeof candidate === "string") return stripMunsTags(candidate);
  } catch {
    // use raw text as-is
  }
  return stripMunsTags(raw);
}

async function sendMessage(
  task: string,
  chatId: string | null,
  chatHistory: string[],
  ticker: string,
  companyName: string,
  token: string,
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
): Promise<{ text: string; chatId: string }> {
  const payload: ChatPayload = {
    // Mirror cool_script.sh: USER_INDEX env, defaulting to 1.
    user_index: Number(process.env.USER_INDEX) || 1,
    tasks: [task],
    query_context: makeQueryContext(
      ticker,
      companyName,
      chatHistory,
      fromDate,
      toDate,
    ),
    autoAddUpcoming: false,
  };
  if (chatId) payload.chat_id = chatId;

  const res = await fetch(MUNS_CHAT_API_URL, {
    method: "POST",
    headers: {
      accept: "*/*",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  const returnedId = res.headers.get("x-chat-id") ?? chatId ?? "";
  const text = await extractText(res);

  if (!res.ok) {
    // 401/403 from MUNS means the bearer token was rejected — almost always an
    // expired or invalid TEMPORARY_TOKEN. Surface an actionable message instead
    // of the raw JSON error body so the UI tells the user how to fix it.
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `MUNS authentication failed (HTTP ${res.status}): the TEMPORARY_TOKEN is missing, expired, or invalid. Refresh it via "wrangler secret put TEMPORARY_TOKEN" (production) or .dev.vars (local dev).`,
      );
    }
    throw new Error(`Chat API ${res.status}: ${text.slice(0, 200)}`);
  }

  return { text, chatId: returnedId };
}

// ---------------------------------------------------------------------------
// Response → structured row
// ---------------------------------------------------------------------------
function splitCells(line: string): string[] {
  const stripped = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return stripped.split("|").map((c) => c.trim());
}

const isSeparatorLine = (line: string) =>
  /^[\s|\-:]+$/.test(line) && line.includes("-");

// Pull the remarks / detail text out of an answer. Most answers come back as
// prose bullets (no table), in which case the whole cleaned answer IS the
// remark — returned in full and NEVER truncated, so the dashboard and the Excel
// export both show the complete finding rather than a half-sentence.
function extractRemarks(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);

  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes("|")) continue;
    if (!isSeparatorLine(lines[i + 1])) continue;

    const headers = splitCells(lines[i]).map((h) => h.toLowerCase());
    const dataLine = lines[i + 2];
    if (!dataLine?.includes("|")) continue;

    const cells = splitCells(dataLine);
    const remarksIdx = headers.findIndex(
      (h) =>
        h.includes("remark") ||
        h.includes("comment") ||
        h.includes("detail") ||
        h.includes("note"),
    );
    if (remarksIdx >= 0 && cells[remarksIdx]) return cells[remarksIdx];
  }

  return text;
}

// ---------------------------------------------------------------------------
// Scoring — derive a 0/1/2 governance score from each answer's text.
//
// The model returns prose bullets (no explicit score), so we infer the score.
// Governance polarity flips per question: an affirmative / high finding can be
// GOOD (e.g. independent board, big-4 auditor) or a RED FLAG (e.g. shareholding
// pledge, SEBI cases). QUESTION_POLARITY captures that:
//   +1 → affirmative/high finding is GOOD   (Yes/High → 2, No/Low → 0)
//   -1 → affirmative/high finding is a FLAG  (Yes/High → 0, No/Low → 2)
//    0 → descriptive; fall back to plain sentiment of the answer
// Score 1 is the middle/uncertain bucket (mixed signal, partial, or data not
// established).
// ---------------------------------------------------------------------------
export const QUESTION_POLARITY: Record<string, 1 | -1 | 0> = {
  "BOARD-1": 1, "BOARD-2": 1, "BOARD-3": 1, "BOARD-4": 1, "BOARD-5": 1,
  "AUDIT-1": 1, "AUDIT-2": 1, "AUDIT-3": -1, "AUDIT-4": 0, "AUDIT-5": 0,
  "STAKEHOLDERS-1": 1, "STAKEHOLDERS-2": 0,
  "EMPLOYEE-1": -1, "EMPLOYEE-2": 0, "EMPLOYEE-3": 1,
  "INDUSTRY_PROMOTER-1": 1, "INDUSTRY_PROMOTER-2": 0, "INDUSTRY_PROMOTER-3": -1,
  "INDUSTRY_PROMOTER-4": 1, "INDUSTRY_PROMOTER-5": 0, "INDUSTRY_PROMOTER-6": 1,
  "INDUSTRY_PROMOTER-7": 1, "INDUSTRY_PROMOTER-8": 1, "INDUSTRY_PROMOTER-9": -1,
  "INDUSTRY_PROMOTER-10": 0, "INDUSTRY_PROMOTER-11": -1, "INDUSTRY_PROMOTER-12": -1,
  "INDUSTRY_PROMOTER-13": 1, "INDUSTRY_PROMOTER-14": -1, "INDUSTRY_PROMOTER-15": -1,
  "STOCK_EXCHANGE-1": 1, "STOCK_EXCHANGE-2": -1, "STOCK_EXCHANGE-3": 1, "STOCK_EXCHANGE-4": 1,
  "OTHER_REGULATORY-1": -1,
  "FINANCIALS-1": -1, "FINANCIALS-2": -1, "FINANCIALS-3": -1, "FINANCIALS-4": 1,
  "FINANCIALS-5": 1, "FINANCIALS-6": 0, "FINANCIALS-7": 1, "FINANCIALS-8": 1,
  "FINANCIALS-9": 0, "FINANCIALS-10": -1, "FINANCIALS-11": -1, "FINANCIALS-12": -1,
  "FINANCIALS-13": 1, "FINANCIALS-14": -1, "FINANCIALS-15": -1, "FINANCIALS-16": -1,
};

// ---------------------------------------------------------------------------
// Answer type per question — drives ONLY the Response word (not the score):
//   "boolean"   → a yes/no check; Response reads "Yes" / "No" (coloured by the
//                 good/bad score, so a pledge shows "Yes" in red).
//   "sentiment" → a quality/magnitude/descriptive read; Response reads
//                 "Positive" / "Neutral" / "Negative".
// The 0/1/2 score (and hence the colour and the governance total) is unchanged
// for both types.
// ---------------------------------------------------------------------------
export type QuestionType = "boolean" | "sentiment";

export const QUESTION_TYPE: Record<string, QuestionType> = {
  "BOARD-1": "boolean", "BOARD-2": "boolean", "BOARD-3": "boolean",
  "BOARD-4": "sentiment", "BOARD-5": "sentiment",
  "AUDIT-1": "boolean", "AUDIT-2": "boolean", "AUDIT-3": "boolean",
  "AUDIT-4": "sentiment", "AUDIT-5": "sentiment",
  "STAKEHOLDERS-1": "sentiment", "STAKEHOLDERS-2": "sentiment",
  "EMPLOYEE-1": "sentiment", "EMPLOYEE-2": "sentiment", "EMPLOYEE-3": "sentiment",
  "INDUSTRY_PROMOTER-1": "sentiment", "INDUSTRY_PROMOTER-2": "sentiment",
  "INDUSTRY_PROMOTER-3": "boolean", "INDUSTRY_PROMOTER-4": "boolean",
  "INDUSTRY_PROMOTER-5": "sentiment", "INDUSTRY_PROMOTER-6": "sentiment",
  "INDUSTRY_PROMOTER-7": "sentiment", "INDUSTRY_PROMOTER-8": "sentiment",
  "INDUSTRY_PROMOTER-9": "boolean", "INDUSTRY_PROMOTER-10": "boolean",
  "INDUSTRY_PROMOTER-11": "boolean", "INDUSTRY_PROMOTER-12": "boolean",
  "INDUSTRY_PROMOTER-13": "sentiment", "INDUSTRY_PROMOTER-14": "boolean",
  "INDUSTRY_PROMOTER-15": "sentiment",
  "STOCK_EXCHANGE-1": "boolean", "STOCK_EXCHANGE-2": "sentiment",
  "STOCK_EXCHANGE-3": "sentiment", "STOCK_EXCHANGE-4": "boolean",
  "OTHER_REGULATORY-1": "boolean",
  "FINANCIALS-1": "boolean", "FINANCIALS-2": "sentiment", "FINANCIALS-3": "sentiment",
  "FINANCIALS-4": "boolean", "FINANCIALS-5": "boolean", "FINANCIALS-6": "sentiment",
  "FINANCIALS-7": "boolean", "FINANCIALS-8": "sentiment", "FINANCIALS-9": "sentiment",
  "FINANCIALS-10": "boolean", "FINANCIALS-11": "boolean", "FINANCIALS-12": "sentiment",
  "FINANCIALS-13": "boolean", "FINANCIALS-14": "boolean", "FINANCIALS-15": "boolean",
  "FINANCIALS-16": "boolean",
};

// Phrases that mean the data could not be found — always the neutral score.
const UNKNOWN_RE =
  /\b(not (established|available|determinable|ascertainable|found|disclosed in the available)|could not be (established|determined|verified)|cannot be (established|determined|verified)|unable to (verify|determine|establish)|no (?:public |reliable )?(?:data|information|disclosure) (?:available|found))\b/i;

// ── Vocabulary ─────────────────────────────────────────────────────────────
// The heuristic separates two axes the old single list conflated:
//   • VALENCE — is the finding good or bad FOR THE COMPANY, regardless of the
//     question? "reputable"/"clean" are always good; "fraud"/"red flag"/
//     "pledge" are always bad. Valence keeps its natural sign for every
//     question.
//   • MAGNITUDE — is the thing being asked about high/present or low/absent?
//     Whether that is good or bad is decided by the question polarity (a high
//     independent-director ratio is good; high leverage is bad).
// Splitting them is what stops a described red flag on an "affirmative-is-bad"
// question (pledge, SEBI case, auditor qualification) from being scored green —
// the core defect of the old `polarity * direction` scheme.

// Unambiguously GOOD-for-the-company vocabulary.
const GOOD_TOKENS = [
  "strong", "robust", "healthy", "solid", "good", "adequate", "sufficient",
  "ample", "consistent", "consistently", "stable", "transparent",
  "transparency", "disclosed", "compliant", "complies", "complied", "reputed",
  "reputable", "well-regarded", "professional", "experienced", "seasoned",
  "long-tenured", "long tenure", "clean", "favourable", "favorable",
  "improving", "improved", "well established", "big 4", "big four",
  "low leverage", "no red flag", "no material", "no pledge", "no cases",
  "no concern",
];

// Unambiguously BAD-for-the-company vocabulary (red flags & weaknesses).
const BAD_TOKENS = [
  "weak", "poor", "inadequate", "insufficient", "concern", "concerning",
  "red flag", "red flags", "qualified", "qualification", "qualifications",
  "pledge", "pledged", "litigation", "lawsuit", "investigation", "probe",
  "penalty", "penalties", "fraud", "fight", "dispute", "feud", "conflict",
  "deteriorating", "fluctuating", "volatile", "volatility", "elongated",
  "stretched", "absent", "lacking", "missing", "undisclosed", "non-compliant",
  "noncompliant", "high attrition", "high debt", "high leverage", "overdue",
  "delayed",
];

// Magnitude-UP: more/higher of whatever the question asks about.
const MAGNITUDE_UP = [
  "high", "higher", "above", "exceeds", "exceeding", "greater", "more than",
  "majority", "increasing", "rising", "elevated", "large", "significant",
];

// Magnitude-DOWN: less/lower.
const MAGNITUDE_DOWN = [
  "low", "lower", "below", "less than", "fewer", "declining", "decreasing",
  "falling", "minimal", "negligible", "small",
];

// Negation cues. A token that follows one of these close by is inverted —
// "no litigation", "not a material driver", "free of pledges" are REASSURING,
// and "not transparent" is not a plus. Historically the counter ignored this
// and marked such answers wrongly, the root of the "good finding, negative
// remark" bug. (This heuristic is only the fallback; the LLM scorer handles
// nuance properly when OPENAI_API_KEY is set.)
const NEGATORS =
  /\b(no|not|without|free of|free from|absence of|lack of|nil|never|none|rather than)\b/;

// True when the token starting at `idx` sits a few words after a negation cue
// within the same clause (bounded window, no sentence break in between).
function negatedAt(lower: string, idx: number): boolean {
  const before = lower.slice(Math.max(0, idx - 28), idx);
  const clause = before.slice(before.search(/[.;:]\s*[^.;:]*$/) + 1);
  return NEGATORS.test(clause);
}

// Net vote of a token list = plain hits minus negated hits (presence-based,
// one vote per token, matching the original 0/1-per-token behaviour).
function netTokens(lower: string, tokens: string[]): number {
  let net = 0;
  for (const t of tokens) {
    const idx = lower.indexOf(t);
    if (idx === -1) continue;
    net += negatedAt(lower, idx) ? -1 : 1;
  }
  return net;
}

// Split an answer into a company-valence and a magnitude signal.
function analyzeAnswer(text: string): { valence: number; magnitude: number } {
  const lower = text.toLowerCase();
  const head = lower.slice(0, 180);

  // A leading Yes/No answer is an affirmative/absent signal → magnitude.
  let magnitude = 0;
  if (/^[\s\-—*•]*yes\b/.test(head)) magnitude += 2;
  if (/^[\s\-—*•]*no\b/.test(head)) magnitude -= 2;

  const valence = netTokens(lower, GOOD_TOKENS) - netTokens(lower, BAD_TOKENS);
  magnitude += netTokens(lower, MAGNITUDE_UP) - netTokens(lower, MAGNITUDE_DOWN);

  return { valence, magnitude };
}

// Infer a 0/1/2 score for a question from its answer text. Failed-fetch rows
// ("Error: …") are handled by the caller and never reach here.
function scoreAnswer(questionId: string, text: string): 0 | 1 | 2 {
  if (UNKNOWN_RE.test(text)) return 1;

  const polarity = QUESTION_POLARITY[questionId] ?? 0;
  const { valence, magnitude } = analyzeAnswer(text);

  // Valence always keeps its sign (bad news is bad on any question). Magnitude
  // is interpreted by polarity: +1 → high is good (add); -1 → high is bad
  // (subtract); 0 → descriptive, magnitude alone is not a verdict (ignore).
  let signal = valence;
  if (polarity === 1) signal += magnitude;
  else if (polarity === -1) signal -= magnitude;

  return signal > 0 ? 2 : signal < 0 ? 0 : 1;
}

// Plain-language verdict for the Response column. Derived from the polarity-
// aware score so the word always agrees with the row's colour — magnitude and
// descriptive questions (where a literal Yes/No is meaningless) get a useful
// sentiment instead of a bare "N/A". Answers we couldn't establish read as
// "Unclear" rather than implying a finding either way.
// Best-effort Yes/No reading of a boolean answer. Prefers an explicit leading
// Yes/No, then the affirmative/absent magnitude signal, and finally derives it
// from the good/bad score plus the question polarity (e.g. a GOOD answer to a
// "-1" question like "shareholding pledge?" must mean "No"). Returns null when
// genuinely undeterminable.
function detectYesNo(questionId: string, text: string): "Yes" | "No" | null {
  const lower = text.toLowerCase();
  const head = lower.slice(0, 120);
  if (/^[\s\-—*•>]*yes\b/.test(head)) return "Yes";
  if (/^[\s\-—*•>]*(no|none)\b/.test(head)) return "No";

  const { magnitude } = analyzeAnswer(text);
  if (magnitude > 0) return "Yes";
  if (magnitude < 0) return "No";

  // A negation in the opening clause ("… has no …", "does not …") reads as No.
  const firstClause = lower.split(/[.;]/, 1)[0] ?? "";
  if (/\b(no|not|none|without|nil|never)\b/.test(firstClause)) return "No";

  // Fall back to score + polarity: for a boolean question the "good" answer is
  // Yes when affirmative is good (+1) and No when affirmative is bad (-1).
  const polarity = QUESTION_POLARITY[questionId] ?? 0;
  const score = scoreAnswer(questionId, text);
  if (polarity !== 0 && score !== 1) {
    const good = score === 2;
    if (polarity === 1) return good ? "Yes" : "No";
    return good ? "No" : "Yes";
  }
  return null;
}

// Plain-language verdict for the Response column, chosen by question type.
// Boolean questions read "Yes"/"No" (coloured by the good/bad score); sentiment
// questions read "Positive"/"Neutral"/"Negative" derived from that same score
// so the word always agrees with the row's colour. Answers we couldn't
// establish read as "Unclear" rather than implying a finding either way.
function responseLabel(
  questionId: string,
  text: string,
  score: 0 | 1 | 2,
): string {
  if (UNKNOWN_RE.test(text)) return "Unclear";
  const type = QUESTION_TYPE[questionId] ?? "sentiment";
  if (type === "boolean") {
    return detectYesNo(questionId, text) ?? "Unclear";
  }
  if (score === 2) return "Positive";
  if (score === 0) return "Negative";
  return "Neutral";
}

// ---------------------------------------------------------------------------
// Assemble individual responses into a markdown document the existing parser
// can read without modification.
// ---------------------------------------------------------------------------
function assembleMarkdown(
  results: QuestionResult[],
  scores?: Map<string, ScoreResult>,
): string {
  const bySection: Map<string, QuestionResult[]> = new Map();
  for (const r of results) {
    const list = bySection.get(r.sectionId) ?? [];
    list.push(r);
    bySection.set(r.sectionId, list);
  }

  const parts: string[] = [];
  for (const [, items] of bySection) {
    if (items.length === 0) continue;
    const heading = items[0].sectionTitle;
    parts.push(`\n## ${heading}\n`);
    parts.push(
      "| Particulars | Response | Score | Max Score | Remarks |",
    );
    parts.push("| --- | --- | --- | --- | --- |");

    for (const item of items) {
      const safeParticulars = item.particulars.replace(/\|/g, "/");
      // A question that failed to fetch is recorded honestly as score 0 with
      // the underlying error in remarks — never a fabricated answer/score.
      if (item.rawResponse.startsWith("Error:")) {
        const err = item.rawResponse
          .slice(6)
          .trim()
          .replace(/\|/g, "/")
          .replace(/\n/g, " ");
        parts.push(
          `| ${safeParticulars} | Not retrieved | 0 | 2 | Not retrieved — ${err} |`,
        );
        continue;
      }
      // Prefer the LLM verdict when one was produced for this row; otherwise
      // fall back to the negation-aware heuristic. Either way the Response word
      // is kept in lockstep with the score so the two never disagree, and the
      // remark is the full answer text (untruncated).
      const llm = scores?.get(item.questionId);
      const score = llm ? llm.score : scoreAnswer(item.questionId, item.rawResponse);
      const response = llm
        ? llm.response
        : responseLabel(item.questionId, item.rawResponse, score);
      const remarks = extractRemarks(item.rawResponse);
      const safeRemarks = remarks
        .replace(/\|/g, "/")
        .replace(/\s*\n\s*/g, " ")
        .trim();
      parts.push(
        `| ${safeParticulars} | ${response} | ${score} | 2 | ${safeRemarks} |`,
      );
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Parallel execution — split the checklist across N independent chat sessions
// ---------------------------------------------------------------------------
interface SectionGroup {
  sectionId: string;
  questions: ChatQuestion[];
}

export interface SessionResult {
  ok: boolean;
  results: QuestionResult[];
  error?: string;
}

// A live progress event emitted as a lane works through its questions. This is
// purely a notification side-channel for the UI — it does not change anything
// sent to the MUNS chat API.
export interface LaneProgress {
  chain: "A" | "B";
  phase: "mega" | "question";
  section: string;
  particulars: string;
  ok: boolean;
  error?: string;
  completed: number;
  total: number;
}

// Group the precomputed questions by section, preserving checklist order.
function groupQuestionsBySection(): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const q of CHAT_QUESTIONS) {
    const last = groups[groups.length - 1];
    if (!last || last.sectionId !== q.sectionId) {
      groups.push({ sectionId: q.sectionId, questions: [q] });
    } else {
      last.questions.push(q);
    }
  }
  return groups;
}

// Split sections across `laneCount` lanes via greedy bin-packing on question
// count (largest section first → whichever lane is currently lightest), so the
// lanes carry a roughly equal number of questions.  Splitting at section
// boundaries is what keeps the answers identical to the serial run: history is
// only ever shared *within* a section, so no section is split across lanes.
function splitSectionsIntoLanes(
  sections: SectionGroup[],
  laneCount: number,
): SectionGroup[][] {
  const lanes: SectionGroup[][] = Array.from({ length: laneCount }, () => []);
  const loads = new Array<number>(laneCount).fill(0);
  const ordered = [...sections].sort(
    (a, b) => b.questions.length - a.questions.length,
  );
  for (const section of ordered) {
    let target = 0;
    for (let i = 1; i < laneCount; i++) {
      if (loads[i] < loads[target]) target = i;
    }
    lanes[target].push(section);
    loads[target] += section.questions.length;
  }
  return lanes;
}

// Runs one independent chat session: seeds its own mega prompt (own chat_id),
// then works through its assigned sections sequentially, resetting section
// history at each section boundary — mirroring cool_script.sh, but scoped to
// this lane's subset of sections.  Errors are recorded per-question (and the
// run continues) so the caller can reject the whole run if any question fails.
async function runChatSession(
  sections: SectionGroup[],
  ticker: string,
  companyName: string,
  token: string,
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
  chain: "A" | "B" = "A",
  onProgress?: (e: LaneProgress) => void,
): Promise<SessionResult> {
  if (sections.length === 0) return { ok: true, results: [] };

  // Total questions this lane will answer — drives the live progress counter.
  const laneTotal = sections.reduce((n, s) => n + s.questions.length, 0);

  // ── Seed this session with the mega prompt ──────────────────────────────
  let chatId: string | null = null;
  let megaResponse = "";

  try {
    const init = await sendMessage(
      MEGA_PROMPT,
      null,
      [],
      ticker,
      companyName,
      token,
      fromDate,
      toDate,
      signal,
    );
    chatId = init.chatId || null;
    megaResponse = init.text;
  } catch (err) {
    if (signal?.aborted) return { ok: false, results: [], error: "Cancelled." };
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, results: [], error: `Initial prompt failed: ${msg}` };
  }

  const megaHistory: string[] = [
    `User: ${MEGA_PROMPT}`,
    `AI: ${megaResponse}`,
  ];

  // Chat session is ready; surface this lane's real total now so the UI can
  // switch from the simulated timer to the live counter.
  onProgress?.({
    chain,
    phase: "mega",
    section: "",
    particulars: "",
    ok: true,
    completed: 0,
    total: laneTotal,
  });

  // ── Work through this lane's sections sequentially ──────────────────────
  const results: QuestionResult[] = [];
  let completed = 0;

  for (const section of sections) {
    // Section-local history starts empty for every section (history reset).
    const sectionHistory: string[] = [];

    for (const q of section.questions) {
      if (signal?.aborted) {
        return { ok: false, results: [], error: "Cancelled." };
      }

      const history = [...megaHistory, ...sectionHistory];

      try {
        const result = await sendMessage(
          q.prompt,
          chatId,
          history,
          ticker,
          companyName,
          token,
          fromDate,
          toDate,
          signal,
        );

        results.push({
          questionId: q.questionId,
          sectionId: q.sectionId,
          sectionTitle: q.sectionTitle,
          particulars: q.particulars,
          rawResponse: result.text,
        });

        // Append only this question's exchange to section history
        sectionHistory.push(`User: ${q.prompt}`, `AI: ${result.text}`);

        onProgress?.({
          chain,
          phase: "question",
          section: q.sectionTitle,
          particulars: q.particulars,
          ok: true,
          completed: ++completed,
          total: laneTotal,
        });
      } catch (err) {
        if (signal?.aborted) {
          return { ok: false, results: [], error: "Cancelled." };
        }
        const msg = err instanceof Error ? err.message : String(err);
        // Record the failure but keep going so the rest of the checklist fills
        results.push({
          questionId: q.questionId,
          sectionId: q.sectionId,
          sectionTitle: q.sectionTitle,
          particulars: q.particulars,
          rawResponse: `Error: ${msg}`,
        });
        sectionHistory.push(`User: ${q.prompt}`, "AI: [Error]");

        onProgress?.({
          chain,
          phase: "question",
          section: q.sectionTitle,
          particulars: q.particulars,
          ok: false,
          error: msg,
          completed: ++completed,
          total: laneTotal,
        });
      }
    }
  }

  return { ok: true, results };
}

// How many lanes the checklist splits into. Exposed so the client can fan out
// exactly one /api/muns/run call per lane.
export const MUNS_LANE_COUNT = PARALLEL_LANES;

// ---------------------------------------------------------------------------
// Single-lane entry point — runs ONE lane's sections in its own chat session.
// The browser calls this once per lane (separate Worker invocations), so each
// lane gets its own Cloudflare subrequest budget. Returns that lane's partial
// results; merging + assembly happen once all lanes return (see /api/muns).
// ---------------------------------------------------------------------------
export async function runMunsChatLane(
  laneIndex: number,
  ticker: string,
  companyName: string,
  token: string,
  signal?: AbortSignal,
  onProgress?: (e: LaneProgress) => void,
): Promise<SessionResult> {
  // Calendar-accurate 2-year window, matching cool_script.sh's `date -d '2
  // years ago'` (not a flat 730-day subtraction).
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2);
  const fromDate = twoYearsAgo.toISOString().slice(0, 10);

  // Split on section boundaries so every question still sees exactly its mega
  // prompt + its own section's prior Q&A — identical context to a serial run.
  const sections = groupQuestionsBySection();
  const lanes = splitSectionsIntoLanes(sections, PARALLEL_LANES);
  const lane = lanes[laneIndex] ?? [];
  // Label lanes A/B for the live progress UI (PARALLEL_LANES is 2).
  const chain: "A" | "B" = laneIndex === 0 ? "A" : "B";

  return runChatSession(
    lane,
    ticker,
    companyName,
    token,
    fromDate,
    toDate,
    signal,
    chain,
    onProgress,
  );
}

// ---------------------------------------------------------------------------
// Merge lane results into checklist order, assemble the markdown the parser
// reads, and report how many questions errored. Pure (no network) so it can
// run in the lightweight assemble step after every lane has returned.
// ---------------------------------------------------------------------------
export interface AssembleOptions {
  /** OpenAI key — when set, answers are graded by the LLM scorer. */
  openaiApiKey?: string;
  /** Optional model override for the LLM scorer. */
  openaiModel?: string;
  signal?: AbortSignal;
}

export async function assembleMunsResults(
  results: QuestionResult[],
  opts: AssembleOptions = {},
): Promise<{
  raw: string;
  errorCount: number;
  total: number;
  scoredBy: "llm" | "heuristic";
}> {
  // Canonicalise to checklist order regardless of the order lanes returned in.
  const byId = new Map<string, QuestionResult>();
  for (const r of results) byId.set(r.questionId, r);
  const ordered: QuestionResult[] = [];
  for (const q of CHAT_QUESTIONS) {
    const r = byId.get(q.questionId);
    if (r) ordered.push(r);
  }

  const errorCount = ordered.filter((r) =>
    r.rawResponse.startsWith("Error:"),
  ).length;

  // Grade the answers with the LLM when a key is configured. Failed-fetch rows
  // ("Error: …") are excluded — they're already recorded as score 0. Any
  // failure here (no key, transport, parse) degrades gracefully to the
  // negation-aware heuristic so a run is never lost to a scoring hiccup.
  let scores: Map<string, ScoreResult> | undefined;
  let scoredBy: "llm" | "heuristic" = "heuristic";
  if (opts.openaiApiKey) {
    const items: ScoreItem[] = ordered
      .filter((r) => !r.rawResponse.startsWith("Error:"))
      .map((r) => ({
        id: r.questionId,
        section: r.sectionTitle,
        question: r.particulars,
        polarity: QUESTION_POLARITY[r.questionId] ?? 0,
        type: QUESTION_TYPE[r.questionId] ?? "sentiment",
        answer: r.rawResponse,
      }));
    try {
      scores = await scoreAnswersWithLLM(items, {
        apiKey: opts.openaiApiKey,
        model: opts.openaiModel,
        signal: opts.signal,
      });
      if (scores.size > 0) scoredBy = "llm";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (typeof console !== "undefined") {
        console.warn(
          `[assembleMunsResults] LLM scoring failed, using heuristic fallback: ${msg}`,
        );
      }
      scores = undefined;
    }
  }

  return {
    raw: assembleMarkdown(ordered, scores),
    errorCount,
    total: CHAT_QUESTIONS.length,
    scoredBy,
  };
}

// ---------------------------------------------------------------------------
// Full in-process run — runs every lane in one invocation. Kept for callers
// that aren't subject to the per-invocation subrequest cap (e.g. local `next
// dev` or a paid-plan batch job). The browser path uses runMunsChatLane +
// assembleMunsResults via separate invocations instead.
// ---------------------------------------------------------------------------
export async function runMunsChatGovernance(
  ticker: string,
  companyName: string,
  token: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; raw: string; error?: string }> {
  const sessions = await Promise.all(
    Array.from({ length: PARALLEL_LANES }, (_, lane) =>
      runMunsChatLane(lane, ticker, companyName, token, signal),
    ),
  );

  // If any session failed to seed (mega prompt) or was cancelled, surface it.
  const failed = sessions.find((s) => !s.ok);
  if (failed) {
    return { ok: false, raw: "", error: failed.error ?? "Session failed." };
  }

  const merged = sessions.flatMap((s) => s.results);
  const { raw, errorCount, total } = await assembleMunsResults(merged, {
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_SCORING_MODEL,
    signal,
  });

  // Reject only a wholesale failure (everything errored). A few transient
  // per-question failures still return the partial scorecard so the answers
  // that succeeded aren't discarded.
  if (total > 0 && errorCount === total) {
    return {
      ok: false,
      raw: "",
      error: `All ${total} questions failed. Check subrequest limits or token validity and retry.`,
    };
  }

  return { ok: true, raw };
}

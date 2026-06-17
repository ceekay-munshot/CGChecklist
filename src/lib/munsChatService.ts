import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import {
  MUNS_CHAT_API_URL,
  MUNS_CHAT_CONTEXT_EMAIL,
  PARALLEL_LANES,
} from "@/lib/munsConfig";

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
  "Quickly Websearch and find it . keep answers for each question detailed " +
  "and non generic , specifically suited for the company. keep remarks more " +
  "numerical stating exact problems instead of being concise. use exact name " +
  "of the ceo/company/elements in each answer only.  DOUBLE CHECK AND VERIFY " +
  "EACH ANSWER BEFORE ANSWERING." +
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

function parseResponseRow(text: string): {
  response: string;
  score: number;
  remarks: string;
} {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);

  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes("|")) continue;
    if (!isSeparatorLine(lines[i + 1])) continue;

    const headers = splitCells(lines[i]).map((h) => h.toLowerCase());
    const dataLineIdx = i + 2;
    if (dataLineIdx >= lines.length) continue;
    const dataLine = lines[dataLineIdx];
    if (!dataLine?.includes("|")) continue;

    const cells = splitCells(dataLine);

    const respIdx = headers.findIndex(
      (h) => h.includes("response") || h.includes("answer"),
    );
    const scoreIdx = headers.findIndex(
      (h) => h === "score" || h.includes("score"),
    );
    const remarksIdx = headers.findIndex(
      (h) =>
        h.includes("remark") ||
        h.includes("comment") ||
        h.includes("detail") ||
        h.includes("note"),
    );

    const rawScore = scoreIdx >= 0 ? parseInt(cells[scoreIdx] ?? "") : NaN;
    return {
      response: respIdx >= 0 ? (cells[respIdx] ?? "N/A") : inferResponse(text),
      score: isNaN(rawScore) ? 1 : rawScore,
      remarks:
        remarksIdx >= 0
          ? (cells[remarksIdx] ?? text.slice(0, 500))
          : text.slice(0, 500),
    };
  }

  // No table found — infer from prose
  return { response: inferResponse(text), score: 1, remarks: text.slice(0, 500) };
}

function inferResponse(text: string): string {
  const l = text.toLowerCase().slice(0, 300);
  if (/\byes\b/.test(l)) return "Yes";
  if (/\bno\b/.test(l)) return "No";
  if (/\bhigh\b/.test(l)) return "High";
  if (/\blow\b/.test(l)) return "Low";
  if (/\bgood\b/.test(l)) return "Good";
  if (/\bpoor\b|\bbad\b/.test(l)) return "Poor";
  if (/\baverage\b|\bmoderate\b/.test(l)) return "Average";
  if (/\bincreasing\b/.test(l)) return "Increasing";
  if (/\bdecreasing\b/.test(l)) return "Decreasing";
  return "N/A";
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
const QUESTION_POLARITY: Record<string, 1 | -1 | 0> = {
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

// Phrases that mean the data could not be found — always the neutral score.
const UNKNOWN_RE =
  /\b(not (established|available|determinable|ascertainable|found|disclosed in the available)|could not be (established|determined|verified)|cannot be (established|determined|verified)|unable to (verify|determine|establish)|no (?:public |reliable )?(?:data|information|disclosure) (?:available|found))\b/i;

// Tokens signalling an affirmative / favourable-magnitude finding.
const POSITIVE_TOKENS = [
  "yes", "high", "higher", "strong", "robust", "healthy", "solid", "good",
  "adequate", "sufficient", "ample", "consistent", "consistently", "stable",
  "transparent", "transparency", "disclosed", "compliant", "complies",
  "complied", "present", "exists", "majority", "above", "exceeds", "exceeding",
  "greater", "more than", "big 4", "big four", "top", "reputed", "reputable",
  "well-regarded", "professional", "experienced", "seasoned", "long-tenured",
  "long tenure", "increasing", "rising", "improving", "improved", "positive",
  "clean", "favourable", "favorable", "low leverage", "no red flag",
  "no material", "no pledge", "no cases", "no concern", "well established",
];

// Tokens signalling a negative / unfavourable finding or red flag.
const NEGATIVE_TOKENS = [
  "weak", "poor", "inadequate", "insufficient", "concern", "concerning",
  "red flag", "red flags", "qualified", "qualification", "qualifications",
  "pledge", "pledged", "litigation", "lawsuit", "investigation", "probe",
  "penalty", "penalties", "fraud", "fight", "dispute", "feud", "conflict",
  "material", "below", "less than", "fewer", "declining", "decreasing",
  "falling", "deteriorating", "fluctuating", "volatile", "volatility",
  "elevated", "elongated", "stretched", "absent", "lacking", "missing",
  "undisclosed", "non-compliant", "noncompliant", "high attrition",
  "high debt", "high leverage", "overdue", "delayed",
];

const countMatches = (text: string, tokens: string[]): number =>
  tokens.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);

// Direction of the finding: +1 affirmative/high, -1 negative/low, 0 unclear.
function detectDirection(text: string): -1 | 0 | 1 {
  const lower = text.toLowerCase();
  const head = lower.slice(0, 180);

  let score = 0;
  // A leading Yes/No dominates (matches "Yes —", "No,", etc. near the start).
  if (/^[\s\-—*•]*yes\b/.test(head)) score += 2;
  if (/^[\s\-—*•]*no\b/.test(head)) score -= 2;
  // "no <something>" / "not <something>" in the head is a negation signal.
  if (/\bno\b/.test(head)) score -= 1;
  if (/\bnot\b/.test(head)) score -= 1;

  score += countMatches(lower, POSITIVE_TOKENS);
  score -= countMatches(lower, NEGATIVE_TOKENS);
  // "low" is a magnitude-down signal; polarity decides if that is good or bad.
  if (/\blow\b|\blower\b/.test(lower)) score -= 1;

  if (score > 0) return 1;
  if (score < 0) return -1;
  return 0;
}

// Infer a 0/1/2 score for a question from its answer text. Failed-fetch rows
// ("Error: …") are handled by the caller and never reach here.
function scoreAnswer(questionId: string, text: string): 0 | 1 | 2 {
  if (UNKNOWN_RE.test(text)) return 1;

  const polarity = QUESTION_POLARITY[questionId] ?? 0;
  const direction = detectDirection(text);

  // Descriptive question: map the answer's sentiment straight to a score.
  if (polarity === 0) {
    return direction > 0 ? 2 : direction < 0 ? 0 : 1;
  }

  // Unclear direction → middle bucket.
  if (direction === 0) return 1;

  // Good when polarity and direction agree in sign.
  return polarity * direction > 0 ? 2 : 0;
}

// ---------------------------------------------------------------------------
// Assemble individual responses into a markdown document the existing parser
// can read without modification.
// ---------------------------------------------------------------------------
function assembleMarkdown(results: QuestionResult[]): string {
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
      const { response, remarks } = parseResponseRow(item.rawResponse);
      // Score is inferred from the answer text with per-question polarity, not
      // the table fallback (which can't read prose bullet answers).
      const score = scoreAnswer(item.questionId, item.rawResponse);
      const safeRemarks = remarks.replace(/\|/g, "/").replace(/\n/g, " ");
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
export function assembleMunsResults(results: QuestionResult[]): {
  raw: string;
  errorCount: number;
  total: number;
} {
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

  return {
    raw: assembleMarkdown(ordered),
    errorCount,
    total: CHAT_QUESTIONS.length,
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
  const { raw, errorCount, total } = assembleMunsResults(merged);

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

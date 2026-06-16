import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import { MUNS_CHAT_API_URL, MUNS_CHAT_CONTEXT_EMAIL } from "@/lib/munsConfig";

// Appended to the mega prompt AND every individual question — matches the
// answer-format suffix used by cool_script.sh.
const ANSWER_FORMAT = " Answer in ONE LINE ONLY.";

// ---------------------------------------------------------------------------
// Mega prompt — sent as the very first message of each chain
// ---------------------------------------------------------------------------
export const MEGA_PROMPT =
  "Make structured tables answering the below questions for the company . " +
  "If an answer is Not established or Not available in the annual report - " +
  "Quickly Websearch and find it . keep answers for each question detailed " +
  "and non generic , specifically suited for the company. keep remarks more " +
  "numerical stating exact problems instead of being concise. use exact name " +
  "of the ceo/company/elements in each answer only.  DOUBLE CHECK AND VERIFY " +
  "EACH ANSWER BEFORE ANSWERING." +
  ANSWER_FORMAT;

// ---------------------------------------------------------------------------
// Section metadata
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

// Sections assigned to each parallel chain (4 sections each)
const CHAIN_A_SECTIONS = new Set([
  "BOARD",
  "AUDIT",
  "STAKEHOLDERS",
  "EMPLOYEE",
]);
const CHAIN_B_SECTIONS = new Set([
  "INDUSTRY_PROMOTER",
  "STOCK_EXCHANGE",
  "OTHER_REGULATORY",
  "FINANCIALS",
]);

const ALPHA = "abcdefghijklmnopqrstuvwxyz";

// ---------------------------------------------------------------------------
// Build the ordered list of question prompts from the checklist
// ---------------------------------------------------------------------------
interface ChatQuestion {
  questionId: string;
  sectionId: string;
  sectionTitle: string;
  prompt: string;       // sent to the chat API (includes ANSWER_FORMAT suffix)
  particulars: string;  // clean label written into the assembled markdown
}

function buildChatQuestions(): ChatQuestion[] {
  const questions: ChatQuestion[] = [];
  for (const section of GOVERNANCE_CHECKLIST) {
    section.items.forEach((item, idx) => {
      const letter = ALPHA[idx] ?? String(idx + 1);
      let basePrompt: string;
      if (idx === 0) {
        const num = SECTION_NUMBERS[section.sectionId] ?? "";
        basePrompt = `${num}\t${section.title}\n\n\t${letter})${item.particulars}`;
      } else {
        basePrompt = `\t${letter})\t${item.particulars}`;
      }
      questions.push({
        questionId: item.questionId,
        sectionId: section.sectionId,
        sectionTitle: SECTION_HEADINGS[section.sectionId] ?? section.title,
        prompt: basePrompt + ANSWER_FORMAT,
        particulars: item.particulars,
      });
    });
  }
  return questions;
}

export const CHAT_QUESTIONS = buildChatQuestions();

// Derived sub-lists for each chain, preserving checklist order
export const CHAIN_A_QUESTIONS = CHAT_QUESTIONS.filter((q) =>
  CHAIN_A_SECTIONS.has(q.sectionId),
);
export const CHAIN_B_QUESTIONS = CHAT_QUESTIONS.filter((q) =>
  CHAIN_B_SECTIONS.has(q.sectionId),
);

// ---------------------------------------------------------------------------
// Live progress events — emitted as each question resolves so the UI can show
// real-time status instead of a simulated timer.
// ---------------------------------------------------------------------------
export interface ChatProgressEvent {
  /** Which parallel chain produced this event. */
  chain: "A" | "B";
  /** "mega" for the opening mega-prompt, "question" for a checklist item. */
  phase: "mega" | "question";
  /** Section heading the item belongs to. */
  section: string;
  /** Clean question label ("" for the mega prompt). */
  particulars: string;
  /** Whether this step succeeded. */
  ok: boolean;
  /** Error message when ok is false. */
  error?: string;
  /** Questions resolved so far across BOTH chains (excludes mega prompts). */
  completed: number;
  /** Total questions across both chains. */
  total: number;
}

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
  urls: string[];
}

interface QuestionResult {
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
  country: string,
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
    COUNTRY: country ? [country] : [],
    CONTEXT_EMAIL: MUNS_CHAT_CONTEXT_EMAIL,
    CONTEXT_COMPANY_NAME: [companyName],
    GET_ANNOUNCEMENTS_ENABLED: false,
    chatHistory,
    mode: "fast",
  };
}

// The Muns Chat API wraps every answer in <ans>…</ans> nested inside a
// <task><1><tool>…</tool><ans>…</ans></1></task><sources>…</sources><eos/>
// envelope.  Extract ONLY the <ans> content and strip everything else so the
// table parser receives clean markdown/prose rather than raw XML.
function stripMunsTags(text: string): string {
  const ansRegex = /<ans>([\s\S]*?)<\/ans>/gi;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = ansRegex.exec(text)) !== null) {
    blocks.push(m[1].trim());
  }

  const content = blocks.length > 0
    ? blocks.join("\n\n")
    : text;

  return content
    .replace(/<doc_source\b[^>]*>[\s\S]*?<\/doc_source>/gi, "")
    .replace(/<\/?doc_source\b[^>]*>/gi, "")
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
// `<task>…<ans>…</ans>…<sources>…<eos>` document directly in the body (often
// with a text/event-stream content-type but WITHOUT data: framing), so we read
// the whole body and pull the <ans> block out first — the same approach as
// cool_script.sh. SSE-framed JSON and plain JSON envelopes are fallbacks only.
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
  country: string,
  token: string,
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
): Promise<{ text: string; chatId: string }> {
  const userIndex = parseInt(process.env.MUNS_USER_INDEX ?? "124", 10) || 124;
  const payload: ChatPayload = {
    user_index: userIndex,
    tasks: [task],
    query_context: makeQueryContext(
      ticker,
      companyName,
      country,
      chatHistory,
      fromDate,
      toDate,
    ),
    autoAddUpcoming: false,
    urls: [],
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

  const scoreMatch = text.match(/\bscore[:\s]+(\d+)/i);
  const extractedScore = scoreMatch ? parseInt(scoreMatch[1], 10) : NaN;
  return { response: inferResponse(text), score: isNaN(extractedScore) ? 1 : extractedScore, remarks: text.slice(0, 500) };
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
// Assemble individual responses into markdown for the existing parser
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
    parts.push("| Particulars | Response | Score | Max Score | Remarks |");
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
      // Score is inferred from the answer text with per-question polarity,
      // not the table fallback (which can't read prose bullets).
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
// Single chain: mega prompt → sequential questions for a subset of sections
// ---------------------------------------------------------------------------
async function runChain(
  chainLabel: "A" | "B",
  questions: ChatQuestion[],
  ticker: string,
  companyName: string,
  country: string,
  token: string,
  fromDate: string,
  toDate: string,
  onEvent: (e: Omit<ChatProgressEvent, "completed" | "total">) => void,
  signal?: AbortSignal,
): Promise<{ ok: boolean; results: QuestionResult[]; error?: string }> {
  // Each chain opens its own chat session with the same mega prompt
  let chatId: string | null = null;
  let megaResponse = "";

  try {
    const init = await sendMessage(
      MEGA_PROMPT,
      null,
      [],
      ticker,
      companyName,
      country,
      token,
      fromDate,
      toDate,
      signal,
    );
    chatId = init.chatId || null;
    megaResponse = init.text;
    onEvent({ chain: chainLabel, phase: "mega", section: "", particulars: "", ok: true });
  } catch (err) {
    if (signal?.aborted) return { ok: false, results: [], error: "Cancelled." };
    const msg = err instanceof Error ? err.message : String(err);
    onEvent({ chain: chainLabel, phase: "mega", section: "", particulars: "", ok: false, error: msg });
    return { ok: false, results: [], error: `Mega prompt failed: ${msg}` };
  }

  const megaHistory: string[] = [
    `User: ${MEGA_PROMPT}`,
    `AI: ${megaResponse}`,
  ];

  const results: QuestionResult[] = [];
  let currentSection = "";
  let sectionHistory: string[] = [];

  for (const q of questions) {
    if (signal?.aborted) return { ok: false, results, error: "Cancelled." };

    if (q.sectionId !== currentSection) {
      currentSection = q.sectionId;
      sectionHistory = [];
    }

    const history = [...megaHistory, ...sectionHistory];

    try {
      const result = await sendMessage(
        q.prompt,
        chatId,
        history,
        ticker,
        companyName,
        country,
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

      sectionHistory.push(`User: ${q.prompt}`, `AI: ${result.text}`);
      onEvent({
        chain: chainLabel,
        phase: "question",
        section: q.sectionTitle,
        particulars: q.particulars,
        ok: true,
      });
    } catch (err) {
      if (signal?.aborted) return { ok: false, results, error: "Cancelled." };
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        questionId: q.questionId,
        sectionId: q.sectionId,
        sectionTitle: q.sectionTitle,
        particulars: q.particulars,
        rawResponse: `Error: ${msg}`,
      });
      sectionHistory.push(`User: ${q.prompt}`, "AI: [Error]");
      onEvent({
        chain: chainLabel,
        phase: "question",
        section: q.sectionTitle,
        particulars: q.particulars,
        ok: false,
        error: msg,
      });
    }
  }

  return { ok: true, results };
}

// ---------------------------------------------------------------------------
// Public entry point — runs ONE chain. The two chains (A: BOARD→EMPLOYEE,
// B: INDUSTRY_PROMOTER→FINANCIALS) are fired as SEPARATE requests by the
// client so each gets its own Cloudflare invocation (and its own ≈50
// subrequest budget): A uses ~17, B uses ~38, both safely under the cap.
// ---------------------------------------------------------------------------
export async function runMunsChatChain(
  chainLabel: "A" | "B",
  ticker: string,
  companyName: string,
  country: string,
  token: string,
  signal?: AbortSignal,
  onProgress?: (e: ChatProgressEvent) => void,
): Promise<{ ok: boolean; raw: string; error?: string }> {
  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const questions = chainLabel === "A" ? CHAIN_A_QUESTIONS : CHAIN_B_QUESTIONS;
  const total = questions.length;
  let completed = 0;

  // Counts are per-chain; the client aggregates the two streams into 51 total.
  const emit = (e: Omit<ChatProgressEvent, "completed" | "total">) => {
    if (e.phase === "question") completed += 1;
    onProgress?.({ ...e, completed, total });
  };

  const chain = await runChain(
    chainLabel,
    questions,
    ticker,
    companyName,
    country,
    token,
    fromDate,
    toDate,
    emit,
    signal,
  );

  if (!chain.ok) return { ok: false, raw: "", error: chain.error };

  const errorCount = chain.results.filter((r) =>
    r.rawResponse.startsWith("Error:"),
  ).length;

  // The mega prompt opened, so a few failures are at worst the residual
  // subrequest tail — don't discard the chain's good answers; mark failed rows
  // "Not retrieved". Only reject when a large share failed (real token/conn
  // problem). Threshold is per-chain.
  const failureLimit = Math.ceil(total * 0.25);
  if (errorCount > failureLimit) {
    return {
      ok: false,
      raw: "",
      error: `${errorCount} of ${total} questions failed in chain ${chainLabel}. Check the token or connectivity and retry.`,
    };
  }

  return { ok: true, raw: assembleMarkdown(chain.results) };
}

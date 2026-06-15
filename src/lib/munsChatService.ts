import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import { MUNS_CHAT_API_URL, MUNS_CHAT_CONTEXT_EMAIL } from "@/lib/munsConfig";

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
  "EACH ANSWER BEFORE ANSWERING.";

// Appended to every individual question so the AI keeps answers concise.
const ANSWER_FORMAT = " Answer in THREE BULLET POINTS ONLY.";

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
    .replace(/<[^>]+>/g, "")
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

// Handles both SSE and regular JSON/text responses.
// SSE frames are buffered across read() chunks to avoid mid-fragment parses.
async function extractText(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: string[] = [];
    const decoder = new TextDecoder();
    let lineBuffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const text =
            (parsed.content as string | undefined) ??
            (parsed.text as string | undefined) ??
            ((parsed.delta as Record<string, unknown> | undefined)
              ?.text as string | undefined);
          if (text) chunks.push(text);
        } catch {
          chunks.push(data);
        }
      }
    }
    return stripMunsTags(chunks.join(""));
  }

  const text = await res.text();
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
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
  return stripMunsTags(text);
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
  const userIndex = parseInt(process.env.MUNS_USER_INDEX ?? "1", 10) || 1;
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
      const { response, score, remarks } = parseResponseRow(item.rawResponse);
      const safeParticulars = item.particulars.replace(/\|/g, "/");
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
  questions: ChatQuestion[],
  ticker: string,
  companyName: string,
  country: string,
  token: string,
  fromDate: string,
  toDate: string,
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
  } catch (err) {
    if (signal?.aborted) return { ok: false, results: [], error: "Cancelled." };
    const msg = err instanceof Error ? err.message : String(err);
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
    }
  }

  return { ok: true, results };
}

// ---------------------------------------------------------------------------
// Public entry point — two parallel chains covering all 51 questions
// ---------------------------------------------------------------------------
export async function runMunsChatGovernance(
  ticker: string,
  companyName: string,
  country: string,
  token: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; raw: string; error?: string }> {
  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const args = [ticker, companyName, country, token, fromDate, toDate, signal] as const;

  // Chain A (BOARD → EMPLOYEE) and Chain B (INDUSTRY_PROMOTER → FINANCIALS)
  // run concurrently — each opens its own chat session with the mega prompt.
  const [chainA, chainB] = await Promise.all([
    runChain(CHAIN_A_QUESTIONS, ...args),
    runChain(CHAIN_B_QUESTIONS, ...args),
  ]);

  if (!chainA.ok) return { ok: false, raw: "", error: chainA.error };
  if (!chainB.ok) return { ok: false, raw: "", error: chainB.error };

  // Merge in original checklist order (A sections precede B sections)
  const allResults = [...chainA.results, ...chainB.results];

  const errorCount = allResults.filter((r) =>
    r.rawResponse.startsWith("Error:"),
  ).length;

  if (errorCount > 0) {
    return {
      ok: false,
      raw: "",
      error: `${errorCount} of ${CHAT_QUESTIONS.length} questions failed. Check subrequest limits or token validity and retry.`,
    };
  }

  return { ok: true, raw: assembleMarkdown(allResults) };
}

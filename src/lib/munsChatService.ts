import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import { MUNS_CHAT_API_URL, MUNS_CHAT_CONTEXT_EMAIL } from "@/lib/munsConfig";

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
  "EACH ANSWER BEFORE ANSWERING.";

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
        prompt = `${num}\t${section.title}\n\n\t${letter})${item.particulars}`;
      } else {
        prompt = `\t${letter})\t${item.particulars}`;
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

// Strip MUNS response wrapper tags (e.g. <ans>…</ans>, <docsource>…</docsource>)
// so they don't appear as extra header cells when the table parser splits on "|".
function stripMunsTags(text: string): string {
  return text
    .replace(/<ans>([\s\S]*?)<\/ans>/gi, "$1")
    .replace(/<\/?ans\b[^>]*>/gi, "")
    .replace(/<docsource\b[^>]*>[\s\S]*?<\/docsource>/gi, "")
    .replace(/<\/?docsource\b[^>]*>/gi, "")
    .trim();
}

// Handles both SSE and regular JSON/text responses from the chat API.
// SSE frames are buffered across read() chunks so partial lines are never
// parsed mid-fragment.
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
      // Keep the last (potentially incomplete) fragment in the buffer
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
  const payload: ChatPayload = {
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
// Public entry point
// ---------------------------------------------------------------------------
export async function runMunsChatGovernance(
  ticker: string,
  companyName: string,
  country: string,
  token: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; raw: string; error?: string }> {
  const toDate = new Date().toISOString().slice(0, 10);
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
  const fromDate = twoYearsAgo.toISOString().slice(0, 10);

  // ── Step 1: mega prompt ─────────────────────────────────────────────────
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
    if (signal?.aborted) {
      return { ok: false, raw: "", error: "Cancelled." };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, raw: "", error: `Initial prompt failed: ${msg}` };
  }

  const megaHistory: string[] = [
    `User: ${MEGA_PROMPT}`,
    `AI: ${megaResponse}`,
  ];

  // ── Step 2: 51 individual questions ────────────────────────────────────
  const results: QuestionResult[] = [];
  let currentSection = "";
  let sectionHistory: string[] = [];

  for (const q of CHAT_QUESTIONS) {
    if (signal?.aborted) {
      return { ok: false, raw: "", error: "Cancelled." };
    }

    // Reset section-local history on every new section
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

      // Append only this question's exchange to section history
      sectionHistory.push(`User: ${q.prompt}`, `AI: ${result.text}`);
    } catch (err) {
      if (signal?.aborted) {
        return { ok: false, raw: "", error: "Cancelled." };
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
    }
  }

  const errorCount = results.filter((r) =>
    r.rawResponse.startsWith("Error:"),
  ).length;

  // Refuse to cache a run where more than half the questions failed — this
  // typically means the Workers subrequest limit was hit and the remaining
  // sections are entirely absent.  Return an error so the UI surfaces the
  // problem rather than caching a permanently broken result.
  if (errorCount > CHAT_QUESTIONS.length / 2) {
    return {
      ok: false,
      raw: "",
      error: `Too many questions failed (${errorCount}/${CHAT_QUESTIONS.length}). Check subrequest limits or token validity.`,
    };
  }

  const raw = assembleMarkdown(results);
  return { ok: true, raw };
}

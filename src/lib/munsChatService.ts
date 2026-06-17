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

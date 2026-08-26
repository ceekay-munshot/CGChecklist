// MUNS backfill — for questions the filings don't answer (reputation, ED/SEBI
// history, peer/market data), ask the MUNS research API the client's own
// per-question prompt, then judge the answer with the same Claude grader used
// for filings. MUNS is the fallback here, not the primary engine.

import { MUNS_CHAT_API_URL, MUNS_CHAT_CONTEXT_EMAIL } from "@/lib/munsConfig";
import { buildQuestionPrompt } from "@/lib/engine/questionPrompts";
import { judgeEvidence, type EngineAnswer } from "./answer";
import { firecrawlSearch, firecrawlConfigured } from "./firecrawl";

const MUNS_LOOKBACK_YEARS = 15;

function dateWindow(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - MUNS_LOOKBACK_YEARS);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

// Pull the <ans>…</ans> content from the MUNS envelope; fall back to the raw
// body (minus obvious tool/source tags) when the tag is absent.
function extractAns(body: string): string {
  const m = body.match(/<ans>([\s\S]*?)<\/ans>/i);
  if (m) return m[1].trim();
  return body
    .replace(/<tool>[\s\S]*?<\/tool>/gi, "")
    .replace(/<sources>[\s\S]*?<\/sources>/gi, "")
    .replace(/<doc_source>[\s\S]*?<\/doc_source>/gi, "")
    .replace(/<\/?[a-z0-9_]+\/?>/gi, "")
    .trim();
}

async function munsResearch(task: string, ticker: string, company: string): Promise<string> {
  const token = process.env.MUNS_TOKEN?.trim();
  if (!token) throw new Error("MUNS_TOKEN is not set");
  const { from, to } = dateWindow();

  const res = await fetch(MUNS_CHAT_API_URL, {
    method: "POST",
    headers: {
      accept: "*/*",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_index: Number(process.env.USER_INDEX) || 1,
      tasks: [task],
      query_context: {
        TICKER_SYMBOL: ticker ? [ticker] : [],
        FROM_DATE: from,
        TO_DATE: to,
        ANNOUNCEMENT_FORM_TYPE: "all",
        DOCUMENT_IDS: [],
        CATEGORIES: [],
        WEB_SEARCH_ENABLED: true,
        COUNTRY: [],
        CONTEXT_EMAIL: MUNS_CHAT_CONTEXT_EMAIL,
        CONTEXT_COMPANY_NAME: [company],
        GET_ANNOUNCEMENTS_ENABLED: false,
        chatHistory: [],
        mode: "expert",
      },
      autoAddUpcoming: false,
    }),
    // MUNS is now only a last-resort fallback behind Firecrawl (it timed out on
    // every call from GitHub Actions), so cap it tighter to keep runs fast.
    signal: AbortSignal.timeout(90_000),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`MUNS HTTP ${res.status}: ${body.slice(0, 200)}`);
  return extractAns(body);
}

const NOT_RETRIEVED: EngineAnswer = {
  excelAnswer: "Not retrieved",
  score: 0,
  verdict: "Unclear",
  available: false,
  source: "Not retrieved",
};

function webQuery(company: string, particulars: string): string {
  const q = particulars.replace(/\?/g, "").replace(/\s+/g, " ").trim();
  return `${company} ${q} India`.slice(0, 200);
}

/**
 * Answer a filing-gap question from the web. Firecrawl search is primary (it
 * responds reliably from CI); MUNS chat is a last-resort fallback (it timed out
 * on every call from GitHub Actions). Either answer is judged by the same Claude
 * grader and anchored to the target company.
 */
export async function backfillQuestion(
  questionId: string,
  particulars: string,
  company: string,
  ticker: string,
  facts = "",
): Promise<EngineAnswer> {
  // Prepend the verified fact sheet so a web-sourced answer stays numerically
  // consistent with the filing-sourced ones (same INR-mn figures, same board).
  const withFacts = (block: string) => (facts ? `${facts}\n\n---\n\n${block}` : block);

  // 1) Firecrawl web search.
  if (firecrawlConfigured()) {
    const web = await firecrawlSearch(webQuery(company, particulars));
    if (web.trim()) {
      const ans = await judgeEvidence(
        questionId,
        particulars,
        company,
        withFacts(`WEB SEARCH RESULTS for ${company} (${ticker}):\n${web}`),
        { web: true },
      );
      if (ans.available) return ans;
    }
  }

  // 2) MUNS chat — last resort.
  if (process.env.MUNS_TOKEN?.trim()) {
    try {
      const answer = await munsResearch(buildQuestionPrompt(questionId, particulars, company), ticker, company);
      if (answer.trim() && !answer.startsWith("[Error]")) {
        const ans = await judgeEvidence(questionId, particulars, company, withFacts(`MUNS RESEARCH on ${company} (${ticker}):\n${answer}`), { web: true });
        if (ans.available) return ans;
      }
    } catch {
      // fall through to not-retrieved
    }
  }

  return NOT_RETRIEVED;
}

// Answer one checklist question from harvested filings. Retrieves the relevant
// evidence (Screener financials + the most on-topic annual-report pages), then
// asks Claude — using the client's locked-in per-question prompt — for the
// one-Excel-cell answer plus a 0 / 0.25 / 0.5 score. If the filings don't cover
// the item (reputation, SEBI history, market data), it returns available:false
// so the orchestrator can route it to MUNS backfill.

import { completeJSON } from "@/lib/engine/llm";
import { buildQuestionPrompt } from "@/lib/engine/questionPrompts";
import type { HarvestResult } from "./harvest";

export type HalfScore = 0 | 0.25 | 0.5;

export interface EngineAnswer {
  excelAnswer: string;
  score: HalfScore;
  verdict: string;
  available: boolean;
  /**
   * Human-readable citation for where the answer came from, e.g.
   * "Annual report, p.147, p.148", "Screener financials", or
   * "Web research — https://…". Mirrors cgchecklist2.0's source+page citation.
   */
  source: string;
}

const STOP = new Set([
  "the", "a", "an", "is", "are", "of", "to", "in", "on", "and", "or", "for",
  "with", "by", "as", "at", "any", "all", "does", "do", "has", "have", "been",
  "over", "last", "than", "that", "this", "its", "vs", "per", "how", "what",
]);

const keywords = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));

// Note/section heading phrases where an item's answer actually lives. A page
// containing one of these is the relevant note (contingent liabilities,
// receivables ageing, auditor remuneration, …), so it gets a big retrieval
// boost — plain keyword overlap alone was missing these notes.
const NOTE_HINTS: Record<string, string[]> = {
  "FINANCIALS-1": ["contingent liabilit", "commitments", "claims not acknowledged", "not acknowledged as debt", "notes to"],
  "FINANCIALS-3": ["trade receivables", "receivables outstanding", "ageing", "unbilled", "credit period"],
  "FINANCIALS-8": ["cash flow from operating", "cash generated from operations", "cash flow statement"],
  "FINANCIALS-9": ["provision", "expected credit loss", "allowance for", "impairment", "doubtful"],
  "FINANCIALS-15": ["contingent liabilit", "not acknowledged as debt", "net worth", "commitments", "guarantee", "claims against"],
  "OTHER_REGULATORY-1": ["contingent liabilit", "not acknowledged as debt", "commitments", "claims against", "disputed", "guarantee"],
  "AUDIT-3": ["basis for opinion", "qualified opinion", "emphasis of matter", "auditor's report", "adverse"],
  "AUDIT-4": ["audit fee", "payments to auditor", "auditors' remuneration", "auditor's remuneration", "remuneration to auditor", "tax audit"],
  "AUDIT-5": ["auditor", "appointed", "reappoint", "resignation", "rotation"],
  "FINANCIALS-7": ["related party", "related-party", "aoc-2"],
  "INDUSTRY_PROMOTER-3": ["related party", "subsidiaries", "group entities"],
  "EMPLOYEE-3": ["employee stock option", "esop", "stock incentive", "options granted", "sweat equity"],
  "EMPLOYEE-1": ["attrition", "employee turnover", "headcount", "workforce"],
  "BOARD-4": ["remuneration", "managerial remuneration", "sitting fees", "director"],
  "AUDIT-1": ["statutory auditor", "auditor", "chartered accountants"],
  "AUDIT-2": ["subsidiary", "component auditor", "other auditors"],
};

export interface RetrievedAr {
  /** Page-labeled passages, each prefixed with "[Annual report, p.NN]". */
  text: string;
  /** Page numbers actually fed to the model, in document order. */
  pages: number[];
}

// Pick the annual-report pages most relevant to a question: pages that contain
// the item's note heading first (big boost), then keyword overlap. We never feed
// a 300-page report to the model. Each kept passage is tagged with its page
// number so the model can cite it back (mirrors cgchecklist2.0's page markers).
export function relevantArPages(
  arText: string,
  terms: string[],
  noteHints: string[],
  maxPages = 10,
  maxChars = 18_000,
): RetrievedAr {
  if (!arText) return { text: "", pages: [] };

  // Split into page-tagged chunks, preserving the page number from each marker.
  const re = /=====\s*PAGE\s+(\d+)\s*=====/g;
  const matches = [...arText.matchAll(re)];
  const chunks: { page: number; text: string }[] = [];
  if (matches.length) {
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const start = (m.index ?? 0) + m[0].length;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? arText.length) : arText.length;
      const text = arText.slice(start, end).trim();
      if (text) chunks.push({ page: Number(m[1]), text });
    }
  } else {
    chunks.push({ page: 0, text: arText });
  }

  const scored = chunks.map((c) => {
    const lower = c.text.toLowerCase();
    let score = 0;
    for (const t of terms) if (lower.includes(t)) score += 1;
    for (const h of noteHints) if (lower.includes(h)) score += 10;
    return { ...c, score };
  });
  const top = scored
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages)
    .sort((a, b) => a.page - b.page);

  let budget = maxChars;
  const kept: { page: number; text: string }[] = [];
  for (const p of top) {
    if (budget <= 0) break;
    const body = p.text.slice(0, budget);
    budget -= body.length;
    kept.push({ page: p.page, text: body });
  }

  const text = kept
    .map((p) => (p.page ? `[Annual report, p.${p.page}]\n${p.text}` : p.text))
    .join("\n\n");
  return { text, pages: kept.map((p) => p.page).filter((n) => n > 0) };
}

const SYSTEM =
  "You are a buy-side forensic governance analyst. Answer ONLY from the evidence " +
  "provided. If the evidence does not contain what the question needs, set " +
  "available=false and do not guess.";

function snapScore(n: unknown): HalfScore {
  const v = Number(n);
  if (v >= 0.4) return 0.5;
  if (v >= 0.15) return 0.25;
  return 0;
}

export async function answerFromFilings(
  questionId: string,
  particulars: string,
  company: string,
  harvest: HarvestResult,
  facts = "",
): Promise<EngineAnswer> {
  const terms = keywords(`${particulars} ${questionId}`);
  const ar = relevantArPages(harvest.annualReportText, terms, NOTE_HINTS[questionId] ?? []);

  const evidence = [
    facts,
    harvest.screenerText ? `SCREENER FINANCIALS (${harvest.name ?? company}):\n${harvest.screenerText}` : "",
    ar.text ? `ANNUAL REPORT EXCERPTS (each passage is tagged with its page number):\n${ar.text}` : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  if (!evidence.trim()) {
    return { excelAnswer: "Not retrieved", score: 0, verdict: "Unclear", available: false, source: "Not retrieved" };
  }

  return judgeEvidence(questionId, particulars, company, evidence, {
    candidatePages: ar.pages,
    hasScreener: !!harvest.screenerText,
  });
}

// Build the source citation from the model's cited pages, validated against the
// pages we actually fed it (so a hallucinated page number can't leak through).
function buildSourceLabel(
  citedPages: unknown,
  opts: { candidatePages?: number[]; hasScreener?: boolean; web?: boolean; sourceNote?: string },
): string {
  if (opts.web) {
    const url = opts.sourceNote?.match(/https?:\/\/[^\s)]+/)?.[0];
    return url ? `Web research — ${url}` : "Web research";
  }
  const candidates = new Set(opts.candidatePages ?? []);
  const valid = (Array.isArray(citedPages) ? citedPages : [])
    .map((p) => Number(p))
    .filter((p) => Number.isInteger(p) && candidates.has(p));
  const uniq = [...new Set(valid)].sort((a, b) => a - b);
  if (uniq.length) return `Annual report, ${uniq.map((p) => `p.${p}`).join(", ")}`;
  if (opts.hasScreener) return "Screener financials";
  return "Annual report";
}

/**
 * Given a question and a block of evidence (from filings or from MUNS research),
 * ask Claude — with the client's per-question prompt — for the one-cell answer,
 * a 0/0.25/0.5 score, and whether the evidence actually answered it.
 */
export async function judgeEvidence(
  questionId: string,
  particulars: string,
  company: string,
  evidence: string,
  opts: { candidatePages?: number[]; hasScreener?: boolean; web?: boolean } = {},
): Promise<EngineAnswer> {
  if (!evidence.trim()) {
    return { excelAnswer: "Not retrieved", score: 0, verdict: "Unclear", available: false, source: "Not retrieved" };
  }

  const prompt =
    `${buildQuestionPrompt(questionId, particulars, company)}\n\n` +
    `EVIDENCE (use ONLY this):\n${evidence}\n\n` +
    `RULES:\n` +
    `- If a VERIFIED FACT SHEET appears at the top of the evidence, take the board size, financial figures, and promoter data from it VERBATIM so your answer stays consistent with every other question; use the ANNUAL REPORT EXCERPTS for the specifics of THIS question.\n` +
    `- Every monetary figure in the evidence is already in INR mn. Report money in INR mn to one decimal and NEVER rescale a figure (no ×10, no ÷10): if the fact sheet shows a net loss of -74.0, write -74.0, never -740.\n` +
    `- excel_answer MUST begin with exactly ONE verdict word (Yes / No / High / Low / Adequate / Unclear) followed by a period, then the explanation — never two verdict words, never a verdict that contradicts the rest of the sentence.\n` +
    `- Scoring — calibrate like a discerning buy-side analyst, NOT a lenient one. Do not reflexively default to 0.5.\n` +
    `  • 0.5 — a genuinely good, POSITIVELY-EVIDENCED finding: a clear positive backed by the disclosure you actually read (a majority-independent board, a clean audit opinion, low leverage shown with numbers, a confirmed non-executive chair, a contingent-liabilities/RPT note you checked that is genuinely clean). Award 0.5 whenever you verified the real disclosure and it is sound.\n` +
    `  • 0.25 — acceptable-but-not-ideal, borderline, mixed, or bare-minimum compliance; OR — for REPUTATION / INTEGRITY / LITIGATION / REGULATORY-HISTORY items (director or promoter reputation, ED/SEBI/other cases, political links, analyst-call transparency, second-tier team quality) — a favourable read that rests only on NOT FINDING adverse information, which silence cannot fully confirm ("no cases disclosed", "no adverse record found"). Corroborate, not a clean bill.\n` +
    `  • 0 — a clear red flag / genuinely bad finding, or an item that cannot be assessed either way (then also set available=false).\n` +
    `  Rule of thumb: a checked, genuinely-clean financial or structural disclosure earns 0.5; an "I couldn't find anything bad" on a reputation/regulatory item earns 0.25.\n\n` +
    `Return STRICT JSON only, no prose outside it, shaped exactly:\n` +
    `{"excel_answer":"<the Excel-cell version: 2-3 dense sentences, single verdict first, exact INR mn figures>",` +
    `"score":<0|0.25|0.5 per the scoring rule above>,` +
    `"verdict":"<Yes|No|High|Low|Adequate|Unclear>",` +
    `"available":<true if the evidence answered it, false if it did not>,` +
    `"cited_pages":<array of the ANNUAL REPORT page numbers (from the "[Annual report, p.NN]" tags) you actually used, e.g. [147,148]; [] if you answered from Screener financials or web results only>,` +
    `"source_note":"<the single most specific source you used: for web, the URL; for the annual report, the note/section name>"}`;

  const out = await completeJSON<{
    excel_answer?: string;
    score?: number;
    verdict?: string;
    available?: boolean;
    cited_pages?: unknown;
    source_note?: string;
  }>({ prompt, system: SYSTEM, maxTokens: 900 });

  const available = out.available !== false && !!out.excel_answer;
  const source = available
    ? buildSourceLabel(out.cited_pages, { ...opts, sourceNote: out.source_note })
    : "Not retrieved";
  return {
    excelAnswer: (out.excel_answer ?? "").trim() || "Not retrieved",
    score: available ? snapScore(out.score) : 0,
    verdict: (out.verdict ?? "Unclear").trim() || "Unclear",
    available,
    source,
  };
}

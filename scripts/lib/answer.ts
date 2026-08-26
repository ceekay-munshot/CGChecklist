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

// Pick the annual-report pages most relevant to a question: pages that contain
// the item's note heading first (big boost), then keyword overlap. We never feed
// a 300-page report to the model.
function relevantArPages(
  arText: string,
  terms: string[],
  noteHints: string[],
  maxPages = 10,
  maxChars = 18_000,
): string {
  if (!arText) return "";
  const pages = arText.split(/===== PAGE \d+ =====/).filter((p) => p.trim());
  const scored = pages.map((page, i) => {
    const lower = page.toLowerCase();
    let score = 0;
    for (const t of terms) if (lower.includes(t)) score += 1;
    for (const h of noteHints) if (lower.includes(h)) score += 10;
    return { i, page, score };
  });
  const top = scored
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages)
    .sort((a, b) => a.i - b.i);
  return top.map((p) => p.page.trim()).join("\n\n").slice(0, maxChars);
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
): Promise<EngineAnswer> {
  const terms = keywords(`${particulars} ${questionId}`);
  const arPages = relevantArPages(harvest.annualReportText, terms, NOTE_HINTS[questionId] ?? []);

  const evidence = [
    harvest.screenerText ? `SCREENER FINANCIALS (${harvest.name ?? company}):\n${harvest.screenerText}` : "",
    arPages ? `ANNUAL REPORT EXCERPTS:\n${arPages}` : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  if (!evidence.trim()) {
    return { excelAnswer: "Not retrieved", score: 0, verdict: "Unclear", available: false };
  }

  return judgeEvidence(questionId, particulars, company, evidence);
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
): Promise<EngineAnswer> {
  if (!evidence.trim()) {
    return { excelAnswer: "Not retrieved", score: 0, verdict: "Unclear", available: false };
  }

  const prompt =
    `${buildQuestionPrompt(questionId, particulars, company)}\n\n` +
    `EVIDENCE (use ONLY this):\n${evidence}\n\n` +
    `Return STRICT JSON only, no prose outside it, shaped exactly:\n` +
    `{"excel_answer":"<the Excel-cell version: 2-3 dense sentences, verdict first, exact INR mn figures>",` +
    `"score":<0|0.25|0.5 — 0.5 = good / low-risk / compliant; 0.25 = partial, borderline, or acceptable-but-not-ideal (e.g. a credible top-tier non-Big-4 auditor, an elevated-but-not-alarming metric, a mostly-good finding with one caveat); 0 = clear red flag / genuinely bad>,` +
    `"verdict":"<Yes|No|High|Low|Adequate|Unclear>",` +
    `"available":<true if the evidence answered it, false if it did not>}`;

  const out = await completeJSON<{
    excel_answer?: string;
    score?: number;
    verdict?: string;
    available?: boolean;
  }>({ prompt, system: SYSTEM, maxTokens: 900 });

  const available = out.available !== false && !!out.excel_answer;
  return {
    excelAnswer: (out.excel_answer ?? "").trim() || "Not retrieved",
    score: available ? snapScore(out.score) : 0,
    verdict: (out.verdict ?? "Unclear").trim() || "Unclear",
    available,
  };
}

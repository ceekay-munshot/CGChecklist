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

// Pick the annual-report pages most relevant to this question (keyword overlap),
// so we never feed a 300-page report to the model.
function relevantArPages(arText: string, terms: string[], maxPages = 8, maxChars = 14_000): string {
  if (!arText) return "";
  const pages = arText.split(/===== PAGE \d+ =====/).filter((p) => p.trim());
  const scored = pages.map((page, i) => {
    const lower = page.toLowerCase();
    let score = 0;
    for (const t of terms) if (lower.includes(t)) score += 1;
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
  const arPages = relevantArPages(harvest.annualReportText, terms);

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
    `"score":<0|0.25|0.5 — 0.5 good/low-risk, 0.25 partial/borderline, 0 red flag>,` +
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

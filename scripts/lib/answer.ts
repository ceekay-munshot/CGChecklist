// Answer one checklist question from harvested filings. Retrieves the relevant
// evidence (Screener financials + the most on-topic annual-report pages), then
// asks Claude — using the client's locked-in per-question prompt — for the
// one-Excel-cell answer plus a 0 / 0.25 / 0.5 score. If the filings don't cover
// the item (reputation, SEBI history, market data), it returns available:false
// so the orchestrator can route it to MUNS backfill.

import { completeJSON } from "@/lib/engine/llm";
import { buildQuestionPrompt } from "@/lib/engine/questionPrompts";
import type { HarvestResult, HarvestedDoc } from "./harvest";

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
  // Transparency on analyst calls IS the concall transcript — route it there so
  // the answer is judged on the actual management commentary and Q&A, not the AR.
  "INDUSTRY_PROMOTER-13": ["conference call", "earnings call", "analyst", "question-and-answer", "moderator", "management discussion", "q&a"],
  "BOARD-4": ["remuneration", "managerial remuneration", "sitting fees", "director"],
  "AUDIT-1": ["statutory auditor", "auditor", "chartered accountants"],
  "AUDIT-2": ["subsidiary", "component auditor", "other auditors"],
};

// Questions where an earnings-call transcript is a legitimate PRIMARY source —
// the call itself, or facts management typically discloses only on the call.
// Concalls are management commentary (promotional by nature), so every OTHER
// question stays anchored to the audited annual report + financials: we don't
// want a rosy call softening the forensic red-flag items (receivables,
// contingent liabilities, leverage, related-party). See answerFromFilings.
const CONCALL_ELIGIBLE = new Set<string>([
  "INDUSTRY_PROMOTER-13", // transparency on analyst calls — the transcript IS the evidence
  "EMPLOYEE-1", // employee attrition — usually quantified on the call, not the AR
  "STOCK_EXCHANGE-4", // analyst / research coverage — who covers and attends the call
  "INDUSTRY_PROMOTER-8", // quality of the second-level team — named and drawn out on calls
]);

export interface RetrievedEvidence {
  /** Passages, each prefixed with "[<Document>, p.NN]". */
  text: string;
  /** Annual-report page numbers fed (kept separate for the AR-note flow). */
  arPages: number[];
  /** Every page number fed, across all documents — for citation validation. */
  allPages: number[];
  /** Distinct document names fed. */
  docNames: string[];
  /** Whether a concall passage made the cut. */
  hasConcall: boolean;
}

// Split page-marked text ("===== PAGE n =====") into page chunks.
function splitPages(text: string): { page: number; text: string }[] {
  if (!text) return [];
  const re = /=====\s*PAGE\s+(\d+)\s*=====/g;
  const matches = [...text.matchAll(re)];
  if (!matches.length) return text.trim() ? [{ page: 0, text: text.trim() }] : [];
  const out: { page: number; text: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const body = text.slice(start, end).trim();
    if (body) out.push({ page: Number(m[1]), text: body });
  }
  return out;
}

// Pick the passages most relevant to a question across the WHOLE document pool
// (annual report + concall transcripts + …): passages containing the item's note
// heading first (big boost), then keyword overlap. Each kept passage is tagged
// "[<Document>, p.NN]" so the model can answer from — and cite — whichever
// document actually holds the answer, not just the annual report.
export function relevantPassages(
  docs: HarvestedDoc[],
  terms: string[],
  noteHints: string[],
  maxPages = 12,
  maxChars = 20_000,
): RetrievedEvidence {
  const chunks = docs.flatMap((d) =>
    splitPages(d.text).map((c) => ({ docName: d.name, kind: d.kind, page: c.page, text: c.text })),
  );
  if (!chunks.length) return { text: "", arPages: [], allPages: [], docNames: [], hasConcall: false };

  const scored = chunks.map((c, i) => {
    const lower = c.text.toLowerCase();
    let score = 0;
    for (const t of terms) if (lower.includes(t)) score += 1;
    for (const h of noteHints) if (lower.includes(h)) score += 10;
    // The annual report is the primary filing — a hair of preference on ties.
    if (c.kind === "annual_report") score += 0.5;
    return { ...c, order: i, score };
  });
  const ranked = scored.filter((p) => p.score > 0).sort((a, b) => b.score - a.score);
  // Reserve a couple of seats for the best on-topic concall passages. The annual
  // report is far larger, so on raw score it crowds the concall out of the top-N
  // every time and every answer defaults to the AR — even when management said it
  // plainly on the call. Only genuinely on-topic concall passages qualify (a
  // couple of keyword hits), so irrelevant transcript text is never forced in.
  const CONCALL_RESERVE = 2;
  const MIN_CONCALL_SCORE = 2;
  const reserved = ranked
    .filter((p) => p.kind === "concall" && p.score >= MIN_CONCALL_SCORE)
    .slice(0, CONCALL_RESERVE);
  const reservedSet = new Set(reserved);
  // Selection in PRIORITY order (reserved concalls first, then best-scoring),
  // so the character budget is spent on the passages that matter — a reserved
  // concall isn't starved by a large annual-report block sitting ahead of it.
  const selected = [...reserved, ...ranked.filter((p) => !reservedSet.has(p))].slice(0, maxPages);

  let budget = maxChars;
  const kept: typeof selected = [];
  for (const p of selected) {
    if (budget <= 0) break;
    const body = p.text.slice(0, budget);
    budget -= body.length;
    kept.push({ ...p, text: body });
  }
  // Now restore reading order for display: group by document, ascending page.
  kept.sort((a, b) => (a.docName === b.docName ? a.page - b.page : a.order - b.order));

  const text = kept
    .map((p) => (p.page ? `[${p.docName}, p.${p.page}]\n${p.text}` : `[${p.docName}]\n${p.text}`))
    .join("\n\n");
  return {
    text,
    arPages: kept.filter((p) => p.kind === "annual_report").map((p) => p.page).filter((n) => n > 0),
    allPages: kept.map((p) => p.page).filter((n) => n > 0),
    docNames: [...new Set(kept.map((p) => p.docName))],
    hasConcall: kept.some((p) => p.kind === "concall"),
  };
}

// Backward-compatible single-document helper (used by the fact-sheet builder).
export function relevantArPages(
  arText: string,
  terms: string[],
  noteHints: string[],
  maxPages = 10,
  maxChars = 18_000,
): RetrievedEvidence {
  return relevantPassages(
    [{ name: "Annual report", kind: "annual_report", text: arText }],
    terms,
    noteHints,
    maxPages,
    maxChars,
  );
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
  // Feed concall transcripts only to the items where the call is genuinely the
  // source; keep every forensic red-flag item on the audited filings so
  // management's optimistic call commentary can't soften the scrutiny.
  const docs = CONCALL_ELIGIBLE.has(questionId)
    ? harvest.documents
    : harvest.documents.filter((d) => d.kind !== "concall");
  const ev = relevantPassages(docs, terms, NOTE_HINTS[questionId] ?? []);

  const evidence = [
    facts,
    harvest.screenerText ? `SCREENER FINANCIALS (${harvest.name ?? company}):\n${harvest.screenerText}` : "",
    ev.text ? `SOURCE DOCUMENTS (each passage is tagged with its document and page):\n${ev.text}` : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  if (!evidence.trim()) {
    return { excelAnswer: "Not retrieved", score: 0, verdict: "Unclear", available: false, source: "Not retrieved" };
  }

  return judgeEvidence(questionId, particulars, company, evidence, {
    candidatePages: ev.allPages,
    hasScreener: !!harvest.screenerText,
  });
}

// Normalise the model's cited document name to a clean, consistent label.
function sanitizeDoc(cd?: string): string {
  const s = (cd ?? "").trim();
  if (!s) return "";
  if (/screener/i.test(s)) return "Screener financials";
  if (/annual\s*report|^ar\b/i.test(s)) return "Annual report";
  if (/con[\s-]?call|earnings\s*call|analyst\s*call|transcript/i.test(s)) {
    const p = s.match(/(Q[1-4]\s*FY\s*\d{2,4}|FY\s*\d{2,4}|[A-Z][a-z]{2,8}[\s-]*\d{4}|Q[1-4][\s-]*\d{4})/);
    return p ? `Concall ${p[1].replace(/\s+/g, " ")}` : "Concall";
  }
  if (/investor|presentation|\bppt\b/i.test(s)) return "Investor presentation";
  // Unrecognised — the model sometimes echoes the fact-sheet header or the
  // company name ("VERIFIED FACT SHEET", "CAPILLARY TECHNOLOGIES") as the cited
  // document. Don't pass that through as a source label; return empty so
  // buildSourceLabel falls back to page-based inference (Annual report / Screener).
  return "";
}

// Build the source citation from the model's cited document + pages, validated
// against the pages we actually fed it (so a hallucinated page can't leak).
function buildSourceLabel(
  citedPages: unknown,
  opts: { candidatePages?: number[]; hasScreener?: boolean; web?: boolean; sourceNote?: string; citedDoc?: string },
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

  let doc = sanitizeDoc(opts.citedDoc);
  if (doc === "Screener financials") return "Screener financials";
  if (!doc) doc = uniq.length ? "Annual report" : opts.hasScreener ? "Screener financials" : "Annual report";
  if (doc === "Screener financials") return "Screener financials";
  return uniq.length ? `${doc}, ${uniq.map((p) => `p.${p}`).join(", ")}` : doc;
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
    `- If a VERIFIED FACT SHEET appears at the top of the evidence, take the board size, financial figures, and promoter data from it VERBATIM so your answer stays consistent with every other question; use the SOURCE DOCUMENTS for the specifics of THIS question. Answer from whichever document actually holds it — the annual report OR a concall transcript — not only the annual report.\n` +
    `- Every monetary figure in the evidence is already in INR mn. Report money in INR mn to one decimal and NEVER rescale a figure (no ×10, no ÷10): if the fact sheet shows a net loss of -74.0, write -74.0, never -740.\n` +
    `- excel_answer MUST begin with exactly ONE verdict word (Yes / No / High / Low / Adequate / Unclear) followed by a period, then the explanation — never two verdict words, never a verdict that contradicts the rest of the sentence.\n` +
    `- Scoring — calibrate like a discerning buy-side analyst, NOT a lenient one. Do not reflexively default to 0.5.\n` +
    `  • 0.5 — a genuinely good finding that DIRECTLY ANSWERS THIS SPECIFIC QUESTION with the concrete figure or fact it asks for, backed by the disclosure you read: the actual % independent for board independence, the actual D/E for leverage, the actual attrition rate for attrition, the named research houses for analyst coverage, a contingent-liabilities/RPT note you checked that is genuinely clean. The specific metric the question asks for MUST appear in your answer. If it is NOT in the evidence and you are inferring soundness from adjacent or tangential disclosure — crediting attrition with no attrition rate, treating "the shares are listed on the exchange" as analyst research coverage, or "the company holds calls" without checking their substance — that is NOT a 0.5; cap it at 0.25. Do not award 0.5 for merely finding related, sound-looking disclosure.\n` +
    `  • 0.25 — acceptable-but-not-ideal, borderline, mixed, or bare-minimum compliance; the specific metric is missing so you are inferring from adjacent disclosure; OR — for REPUTATION / INTEGRITY / LITIGATION / REGULATORY-HISTORY items (director or promoter reputation, ED/SEBI/other cases, political links, analyst-call transparency, second-tier team quality) — a favourable read that rests only on NOT FINDING adverse information, which silence cannot fully confirm ("no cases disclosed", "no adverse record found"). Corroborate, not a clean bill.\n` +
    `  • 0 — a clear red flag / genuinely bad finding, or an item that cannot be assessed either way (then also set available=false).\n` +
    `  Rule of thumb: a checked, genuinely-clean financial or structural disclosure that states the specific metric earns 0.5; the same item WITHOUT that metric (inferred from adjacent disclosure), or an "I couldn't find anything bad" on a reputation/regulatory item, earns 0.25.\n\n` +
    `Return STRICT JSON only, no prose outside it, shaped exactly:\n` +
    `{"excel_answer":"<2-3 tight sentences, ~40-70 words MAX. Lead with the single verdict word, then the decisive INR-mn figure(s) and the ONE key driver. Be crisp, not exhaustive: do NOT list every director / subsidiary / item by name — summarise and cite the note or page instead>",` +
    `"score":<0|0.25|0.5 per the scoring rule above>,` +
    `"verdict":"<Yes|No|High|Low|Adequate|Unclear>",` +
    `"available":<true if the evidence answered it, false if it did not>,` +
    `"cited_doc":"<the document you actually used, copied from the passage tag: e.g. "Annual report", "Concall Aug 2025", or "Screener financials"; empty if web only>",` +
    `"cited_pages":<array of the page numbers (from the "[<Document>, p.NN]" tags) you actually used, e.g. [147,148]; [] if you answered from Screener financials or web results only>,` +
    `"source_note":"<the single most specific source you used: for web, the URL; for a document, the note/section name>"}`;

  const out = await completeJSON<{
    excel_answer?: string;
    score?: number;
    verdict?: string;
    available?: boolean;
    cited_doc?: string;
    cited_pages?: unknown;
    source_note?: string;
  }>({ prompt, system: SYSTEM, maxTokens: 900 });

  const available = out.available !== false && !!out.excel_answer;
  const source = available
    ? buildSourceLabel(out.cited_pages, { ...opts, sourceNote: out.source_note, citedDoc: out.cited_doc })
    : "Not retrieved";
  return {
    excelAnswer: (out.excel_answer ?? "").trim() || "Not retrieved",
    score: available ? snapScore(out.score) : 0,
    verdict: (out.verdict ?? "Unclear").trim() || "Unclear",
    available,
    source,
  };
}

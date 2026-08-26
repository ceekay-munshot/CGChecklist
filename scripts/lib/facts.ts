// One-time company fact sheet. Every checklist question is answered in
// isolation, so shared facts (board size, the 3-year P&L, borrowings, promoter
// holding) used to be re-derived per question — and occasionally mis-scaled
// (e.g. a net loss of 74 written as 740) or counted differently (12 vs 13
// directors). This extracts those facts ONCE, pre-normalised to INR mn, from
// Screener's clean financials plus the board/auditor pages of the annual
// report, and formats them into an authoritative preamble injected into every
// question — so no answer re-derives or rescales them. Fully generic: nothing
// company-specific, driven entirely by the harvested evidence.

import { completeJSON } from "@/lib/engine/llm";
import type { HarvestResult } from "./harvest";
import { relevantArPages } from "./answer";

const BOARD_TERMS = [
  "board", "director", "independent", "chairman", "managing", "executive",
  "promoter", "auditor", "shareholding",
];
const BOARD_HINTS = [
  "board of directors", "composition of the board", "independent director",
  "non-executive", "statutory auditor", "chartered accountants",
];

const SYSTEM =
  "You are a precise financial-data extraction engine. Extract ONLY what the " +
  "evidence states — never guess. Convert EVERY monetary figure to INR mn " +
  "(1 crore = 10 INR mn; 1 lakh = 0.1 INR mn; a figure already in millions " +
  "stays as-is). If a value is not present in the evidence, use null.";

interface FinancialYear {
  period?: string;
  revenue?: number | null;
  net_profit?: number | null;
  operating_profit?: number | null;
  borrowings?: number | null;
  net_worth?: number | null;
  operating_cash_flow?: number | null;
}

interface FactsShape {
  board?: {
    total?: number | null;
    independent?: number | null;
    executive?: number | null;
    chairman?: string | null;
    chairman_role?: string | null;
  };
  auditor?: string | null;
  auditor_big4?: boolean | null;
  market_cap_inr_mn?: number | null;
  financials?: FinancialYear[];
  promoter_holding?: { period?: string; pct?: number | null }[];
  promoter_pledge_pct?: number | null;
}

const num = (n: unknown): string =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "n/a" : Number(n).toFixed(1);

const safeDiv = (a?: number | null, b?: number | null): number | null =>
  a === null || a === undefined || b === null || b === undefined || b === 0 ? null : a / b;

// Compute the financial ratios the checklist tests, deterministically, from the
// fact-sheet figures — so the leverage / margin / cash-conversion / growth
// questions read a correct number instead of the model doing (and mis-scaling)
// the arithmetic. Mirrors cgchecklist2.0's computeNumeric, kept to what our
// extracted fields support.
function computeRatios(fin: FinancialYear[]): string[] {
  const series = (
    label: string,
    valueOf: (y: FinancialYear, i: number) => number | null,
    dp = 2,
  ): string => {
    const parts = fin
      .map((y, i) => ({ p: y.period, v: valueOf(y, i) }))
      .filter((x) => x.p && x.v !== null && !Number.isNaN(x.v as number))
      .map((x) => `${x.p} ${(x.v as number).toFixed(dp)}`);
    return parts.length ? `${label}: ${parts.join(" → ")}` : "";
  };

  const out = [
    // D/E only where net worth is positive (a negative denominator is meaningless).
    series("Debt/Equity", (y) => (y.net_worth && y.net_worth > 0 ? safeDiv(y.borrowings, y.net_worth) : null)),
    // Cash conversion — not reported by Screener; a core cash-quality signal.
    series("CFO / net profit", (y) => safeDiv(y.operating_cash_flow, y.net_profit)),
    series(
      "Revenue YoY %",
      (y, i) => {
        if (i === 0) return null;
        const prev = fin[i - 1].revenue;
        const v = prev && prev !== 0 ? safeDiv((y.revenue ?? 0) - prev, Math.abs(prev)) : null;
        return v === null ? null : v * 100;
      },
      1,
    ),
  ].filter(Boolean);

  return out.map((s) => `  ${s}`);
}

function formatFacts(company: string, f: FactsShape): string {
  const lines: string[] = [
    `=== ${company.toUpperCase()} — VERIFIED FACT SHEET ===`,
    `Use these figures VERBATIM for consistency across the checklist. All money is ALREADY in INR mn — never multiply, divide, or rescale (a net loss of -74.0 is -74.0, not -740).`,
  ];

  const b = f.board;
  if (b && (b.total != null || b.chairman)) {
    const pct =
      b.total && b.independent != null
        ? ` (${((b.independent / b.total) * 100).toFixed(1)}% independent)`
        : "";
    lines.push(
      `Board: ${b.total ?? "?"} directors — ${b.independent ?? "?"} independent, ${b.executive ?? "?"} executive${pct}. ` +
        `Chairman: ${b.chairman ?? "?"}${b.chairman_role ? ` (${b.chairman_role})` : ""}.`,
    );
  }
  if (f.auditor) {
    const big4 = f.auditor_big4 === true ? " (Big-4)" : f.auditor_big4 === false ? " (not Big-4)" : "";
    lines.push(`Statutory auditor: ${f.auditor}${big4}.`);
  }
  if (f.market_cap_inr_mn != null) lines.push(`Market cap: INR ${num(f.market_cap_inr_mn)} mn.`);

  if (Array.isArray(f.financials) && f.financials.length) {
    const fin = f.financials.filter((x) => x && x.period);
    lines.push(`Financials (INR mn):`);
    for (const y of fin) {
      lines.push(
        `  ${y.period}: revenue ${num(y.revenue)}, net profit ${num(y.net_profit)}, ` +
          `operating profit ${num(y.operating_profit)}, borrowings ${num(y.borrowings)}, ` +
          `net worth ${num(y.net_worth)}, operating cash flow ${num(y.operating_cash_flow)}`,
      );
    }
    const ratios = computeRatios(fin);
    if (ratios.length) {
      lines.push(`Computed ratios (deterministic — use these exact values, do not recompute):`);
      lines.push(...ratios);
    }
  }
  if (Array.isArray(f.promoter_holding) && f.promoter_holding.length) {
    const trend = f.promoter_holding
      .filter((p) => p && p.period)
      .map((p) => `${p.pct == null ? "?" : p.pct + "%"} (${p.period})`)
      .join(" → ");
    if (trend) {
      lines.push(
        `Promoter holding: ${trend}${f.promoter_pledge_pct != null ? `; pledged ${f.promoter_pledge_pct}%` : ""}.`,
      );
    }
  }

  return lines.length > 2 ? lines.join("\n") : "";
}

/**
 * Build the authoritative fact-sheet preamble for a company from its harvested
 * filings. Best-effort: returns "" on any failure so the run proceeds without it.
 */
export async function buildCompanyFacts(company: string, harvest: HarvestResult): Promise<string> {
  if (!harvest.screenerText && !harvest.annualReportText) return "";

  const board = relevantArPages(harvest.annualReportText, BOARD_TERMS, BOARD_HINTS, 6, 9000);
  const evidence = [
    harvest.screenerText ? `SCREENER FINANCIALS (${harvest.name ?? company}):\n${harvest.screenerText}` : "",
    board.text ? `ANNUAL REPORT (board / auditor / shareholding):\n${board.text}` : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
  if (!evidence.trim()) return "";

  const prompt =
    `Company: ${company}\n\nEVIDENCE (use ONLY this):\n${evidence}\n\n` +
    `Return STRICT JSON only, shaped exactly as below. Every monetary value in INR mn ` +
    `(crore ×10, lakh ×0.1). Give the latest 3 financial years, newest last. Use null when a value is absent.\n` +
    `{"board":{"total":<int|null>,"independent":<int|null>,"executive":<int|null>,"chairman":"<name|null>","chairman_role":"<Executive|Non-Executive|null>"},` +
    `"auditor":"<statutory auditor firm|null>","auditor_big4":<true|false|null>,` +
    `"market_cap_inr_mn":<number|null>,` +
    `"financials":[{"period":"<e.g. FY25>","revenue":<n|null>,"net_profit":<n|null>,"operating_profit":<n|null>,"borrowings":<n|null>,"net_worth":<n|null>,"operating_cash_flow":<n|null>}],` +
    `"promoter_holding":[{"period":"<e.g. Mar-25>","pct":<n|null>}],"promoter_pledge_pct":<n|null>}`;

  try {
    const f = await completeJSON<FactsShape>({ prompt, system: SYSTEM, maxTokens: 1400 });
    return formatFacts(company, f);
  } catch {
    return "";
  }
}

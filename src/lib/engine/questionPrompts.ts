// Per-question analyst prompt library — the "how to answer" brain of the
// source-first engine. Each checklist question is answered by digging into the
// company's own filings with a specific forensic methodology, NOT by a generic
// one-liner. The four bespoke prompts are the client's (Dheep's) own prompts,
// kept verbatim so the output matches the manually-produced Beas sheet; every
// other question falls back to a rigorous default built from the same house
// style (verdict-first, exact figures, grounded, one Excel cell).
//
// The engine feeds buildQuestionPrompt(...) to the document-reading model during
// evidence extraction; MUNS is used only to backfill questions the filings can't
// answer (reputation, regulator history, peer/market data).

import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";

// Shared output contract — the answer format every question must obey. Mirrors
// the client's own workflow (see the "receivables >6 months" ChatGPT session):
// the model does the full working, then collapses it into a single Excel cell,
// and marks anything it cannot source as NA rather than estimating it.
export const OUTPUT_CONTRACT =
  "Produce TWO parts. " +
  "(1) FULL WORKING: the year-by-year figures and ratios for the latest three " +
  "financial years — consolidated and standalone where the item is financial — " +
  "the trend, and, where relevant, the same computation for 2-5 named closest " +
  "listed peers, ending in a short final assessment. " +
  "(2) EXCEL-CELL VERSION: the answer as it goes into the checklist — 2-3 dense " +
  "sentences that fit one Excel cell, leading with the verdict the item asks " +
  "for (Yes/No/High/Low/Adequate/etc.), then the key figures with exact " +
  "numbers, names and dates, the peer read, and a one-line trend/risk note. " +
  "Never mix bases (standalone vs consolidated) and always state the basis. " +
  "Report every financial figure in INR mn to one decimal place (e.g. INR " +
  "905.0 mn) and each ratio/percentage to one decimal place. " +
  "Ground every figure in the company's own annual report / filings; if " +
  "a figure or a peer's data cannot be reliably extracted from the primary " +
  "source, mark it NA — never estimate, infer, or fabricate a number. Do not " +
  "narrate the search process. No hedging, no filler.";

// Bespoke, per-question methodology — VERBATIM from the client's prompts. These
// already embed their own output instruction, so they are used as-is (only the
// company name is anchored in front).
const DETAILED_PROMPTS: Record<string, string> = {
  // FINANCIALS-3 — "Receivables > 6 months as a % of revenues"
  "FINANCIALS-3":
    "Use the company's latest three annual reports / audited financial " +
    "statements to answer whether trade receivables greater than six months " +
    "are high or low, measured in two ways: receivables >6 months as a " +
    "percentage of revenue from operations and receivables >6 months as a " +
    "percentage of total trade receivables. Extract, separately for " +
    "consolidated and standalone financials, revenue from operations, total " +
    "trade receivables, and all receivables ageing buckets outstanding for " +
    "more than six months — 6–12 months, 1–2 years, 2–3 years and more than 3 " +
    "years — and calculate both ratios for each of the latest three financial " +
    "years. Do not use total income as the denominator, and do not mix " +
    "standalone receivables with consolidated revenue or vice versa. Then " +
    "classify the trend as decreasing, flat, increasing or steadily " +
    "increasing. A flat or declining trend is generally less concerning, while " +
    "a steadily increasing trend is a potential red flag; however, also " +
    "compare the company with 2–5 closest listed peers using the same " +
    "calculation for the same three-year period, because a ratio can be " +
    "declining but still be structurally high versus peers. Conclude whether " +
    "the company's aged receivables position is low concern, moderate concern " +
    "or high concern based on both the company's own three-year trend and its " +
    "latest-year level versus peers. The final answer should state the " +
    "consolidated and standalone ratios for both metrics, describe the trend, " +
    "compare the latest-year ratio with peer levels / peer median, and explain " +
    "whether receivables older than six months appear low, acceptable, " +
    "elevated or concerning.",

  // AUDIT-4 — "Remuneration paid to the auditors"
  "AUDIT-4":
    "Assess whether “Remuneration paid to auditors – High/Low?” " +
    "indicates a governance/accounting concern by reviewing the company's " +
    "latest three years of consolidated financial statements and extracting " +
    "the total auditors' remuneration from the auditor remuneration/payment " +
    "note, including audit fees, tax audit, certification, limited review, " +
    "reimbursement, and other auditor-related payments where disclosed. " +
    "Calculate the YoY growth in total auditor remuneration for each of the " +
    "latest two years and the 3-year CAGR, and compare these against the " +
    "company's corresponding YoY growth and 3-year CAGR in revenue from " +
    "operations and EBIT excluding other income to check whether auditor fees " +
    "are rising disproportionately versus business scale and operating " +
    "complexity. Also calculate auditor remuneration as a % of PAT for each of " +
    "the last three years, while being careful to flag cases where PAT is " +
    "unusually depressed or negative, because the ratio may mechanically look " +
    "high. Repeat the same calculations for the company's closest listed peers " +
    "using their consolidated financials, and benchmark the company on both " +
    "absolute auditor remuneration and relative ratios. Conclude Low if auditor " +
    "remuneration is broadly in line with peers and grows broadly in line with " +
    "revenue/EBIT; High if auditor remuneration is materially above peers, " +
    "rising much faster than revenue/EBIT without clear business justification, " +
    "or consuming an unusually high share of PAT; and Moderate/Needs Review if " +
    "the signal is mixed or distorted by one-off events such as acquisitions, " +
    "restructuring, losses, or major regulatory/audit scope changes. The final " +
    "answer should be written in 2–3 concise sentences that can be pasted " +
    "into a single Excel cell, clearly stating the High/Low/Moderate assessment " +
    "first, followed by the key supporting evidence: latest auditor " +
    "remuneration, trend versus revenue/EBIT growth, auditor remuneration as % " +
    "of PAT, and peer comparison.",

  // OTHER_REGULATORY-1 — "Contingent tax or liability - if material"
  "OTHER_REGULATORY-1":
    "Review the company's latest annual report from an investment " +
    "analyst-cum-forensic accounting perspective and answer whether " +
    "“Contingent Tax or Liability” is High/Low by first extracting " +
    "all contingent liabilities disclosed in the notes to accounts, preferably " +
    "at the consolidated level, and summarising them clearly as: “As per " +
    "the latest annual report, the company has [x] categories of contingent " +
    "liabilities amounting to INR [abc], equal to [y]% of total assets and " +
    "[z]% of shareholders' equity; these include: a) [tax/indirect tax/income " +
    "tax disputes], b) [legal/customer/vendor/regulatory claims], c) " +
    "[guarantees/other obligations], etc.” Then assess materiality not " +
    "only by size versus total assets and equity, but also versus PAT/PBT/cash " +
    "balance where relevant, and evaluate the nature, age, likelihood, and " +
    "concentration of the liabilities: are they routine tax/legal disputes, " +
    "large unresolved regulatory claims, guarantees to group entities, disputed " +
    "demands under appeal, or matters with adverse rulings? Next, review at " +
    "least the last 3–5 annual reports to identify whether contingent " +
    "liabilities are a recurring off-balance-sheet theme, whether the same " +
    "disputes keep growing, whether new categories are appearing, whether any " +
    "past contingent liabilities were crystallised into actual " +
    "provisions/expenses/cash outflows, and whether equity shareholders " +
    "previously took a hit through settlements, penalties, write-offs, or " +
    "adverse judgments. Also check auditor comments, key audit matters, " +
    "provisions, exceptional items, and notes to see whether management has " +
    "been conservative or aggressive in recognising these exposures. Finally, " +
    "conclude High/Low with a short forensic judgement: Low if contingent " +
    "liabilities are small relative to assets/equity/PAT, mostly routine, " +
    "stable/declining, well-disclosed, and with no history of crystallisation; " +
    "High if they are large, rising, recurring, poorly explained, concentrated " +
    "in serious tax/regulatory/legal matters, or if the company has a track " +
    "record of off-balance-sheet exposures later becoming real shareholder " +
    "losses.",

  // FINANCIALS-5 — "Consistent Dividend payout"
  "FINANCIALS-5":
    "Review the company's latest three financial years of annual reports and " +
    "answer “Consistent Dividend Payout — Yes/No?” from an investment " +
    "analyst + capital allocation + forensic accounting lens, not merely by " +
    "checking whether dividends were paid every year. For both standalone and " +
    "consolidated financials, extract the dividend per share, total dividend " +
    "outflow, dividend payout ratio, PAT/loss, operating cash flow/free cash " +
    "flow, debt-to-equity or net debt position, interest coverage, cash " +
    "balance, recent borrowings/equity raises, and any major capex/working-" +
    "capital stress; then judge whether dividends were consistent, irregular, " +
    "increasing, decreasing, or absent, and whether the payout was prudent or " +
    "questionable. A consistent dividend should be treated positively only if " +
    "it is supported by recurring profits, healthy cash generation, moderate " +
    "leverage, and no obvious need to conserve capital; flag it as a concern if " +
    "the company continued paying dividends despite consolidated/standalone " +
    "losses, weak or negative operating cash flows, high or rising debt, poor " +
    "interest coverage, recent debt/equity fundraising, covenant/liquidity " +
    "pressure, or large reinvestment needs. Conclude with a concise verdict " +
    "such as “Yes — consistent and supported by fundamentals,” " +
    "“Yes — consistent but capital allocation questionable,” " +
    "“No — irregular dividend history,” or “No — no meaningful " +
    "dividend payout,” and briefly explain the reasoning with the key " +
    "numbers and trend over the three-year period.",
  // INDUSTRY_PROMOTER-15 — "Leverage — High/Low?" (client's own ChatGPT brief)
  "INDUSTRY_PROMOTER-15":
    "Review the company's latest three financial years of CONSOLIDATED financial " +
    "statements and assess leverage as High, Moderate or Low by calculating three " +
    "ratios for EACH of the latest three financial years: (a) debt-to-equity = " +
    "total borrowings / total equity; (b) interest coverage = EBIT / finance " +
    "costs, where EBIT = profit before tax + finance costs; and (c) net " +
    "debt-to-EBITDA = (total borrowings minus cash and bank balances) / EBITDA, " +
    "where EBITDA = profit before tax + finance costs + depreciation. Report each " +
    "ratio to two decimals and ATTACH THE YEAR TO EVERY NUMBER — never write " +
    "'5.10x vs 4.41x and 3.04x' where the reader cannot tell which year is which; " +
    "write '5.10x in FY25 from 4.41x in FY24 and 3.04x in FY23'. Where net debt is " +
    "negative, call it net cash. Double-check every figure against the statements " +
    "and never round away a real difference (write 0.35x, not 0.3x). Judge leverage " +
    "from all three ratios AND their combined three-year trend (increasing, " +
    "decreasing or stable) rather than any single year, and where useful compare " +
    "with 2-5 named closest listed peers on the same basis. Deliver one " +
    "Excel-pasteable cell (no table), leading with the verdict, in this shape: " +
    "'Leverage appears [High/Moderate/Low]. Debt-to-equity was x.xx in FYxx from " +
    "x.xx in FYxx and x.xx in FYxx; interest coverage was x.xx in FYxx from x.xx in " +
    "FYxx and x.xx in FYxx; and net debt-to-EBITDA was x.xx in FYxx from x.xx in " +
    "FYxx and x.xx in FYxx. Overall, leverage has [increased/decreased/remained " +
    "stable] over the period, indicating [high/moderate/low] balance-sheet risk.' " +
    "If the fact sheet provides a Computed Ratios block, use those exact ratio " +
    "values rather than recomputing them.",
};

// Worked "Excel-cell version" answers from the client's own ChatGPT sessions
// (company: PG Electroplast). Used as a STYLE exemplar in the prompt — they
// calibrate density, verdict-first phrasing and how figures are cited. The
// prompt makes clear these numbers belong to a different company and must never
// be imported into the answer.
const EXAMPLE_OUTPUTS: Record<string, string> = {
  "FINANCIALS-3":
    "Low — PG Electroplast's receivables older than 6 months have increased " +
    "over FY23–FY25, but remain low in absolute terms at 0.25% of standalone " +
    "revenue and 0.29% of consolidated revenue in FY25; as a share of total " +
    "trade receivables, the ratio is also modest at ~1.4% on both bases. The " +
    "trend should be monitored, but PG is not structurally high versus peers, " +
    "especially compared with EPack Durables, so this does not appear to be a " +
    "material receivables-ageing red flag.",
  "AUDIT-4":
    "Low — PG Electroplast's FY25 auditor remuneration was INR 6.6 mn, up " +
    "37.6% YoY versus +51.6% in FY24, implying a FY23–FY25 CAGR of 44.4%; this " +
    "does not appear disproportionate because revenue from operations grew " +
    "faster at +77.3% YoY in FY25 and 50.2% CAGR, while EBIT excluding other " +
    "income grew +94.5% YoY and 72.2% CAGR. Auditor remuneration as % of PAT " +
    "also fell from 0.41% in FY23 to 0.36% in FY24 and 0.23% in FY25; in peer " +
    "checks, PG's absolute FY25 fee is below EPACK's INR 9.8 mn and its " +
    "relative fee burden is far below EPACK's 1.78% of PAT and Virtuoso's 1.20% " +
    "of PAT, while Amber's much larger FY25 consolidated revenue/PAT means PG " +
    "does not appear high on either absolute fee or relative burden.",
  "OTHER_REGULATORY-1":
    "PG Electroplast – Moderate: As per the latest FY25 consolidated annual " +
    "report, PGEL has 4 categories of contingent liabilities aggregating INR " +
    "905.0 mn, equal to ~1.8% of total assets and ~3.2% of total equity; these " +
    "comprise Central Excise dispute of INR 76.6 mn, anti-dumping duty dispute " +
    "of INR 73.9 mn, third-party claims of INR 4.6 mn, and a new INR 750.0 mn " +
    "Yes Bank guarantee for borrowings of its 50:50 JV, Goodworth Electronics. " +
    "The underlying tax/legal claims are old and largely unchanged from " +
    "FY23/FY24 at INR 155.0 mn, with favourable/partly favourable historical " +
    "appellate positions and no clear evidence of material crystallisation into " +
    "shareholder loss, but the FY25 guarantee materially increases " +
    "off-balance-sheet exposure and should be monitored. Relative to peers, " +
    "PGEL's exposure is broadly similar in absolute size to Amber Enterprises " +
    "but much higher than EPACK Durable and Virtuoso Optoelectronics in rupee " +
    "terms, so this is not a High red flag on current balance-sheet " +
    "materiality, but it is also not Low because of the new JV guarantee and " +
    "long-running tax/duty matters.",
  "FINANCIALS-5":
    "No — regular 3-year dividend consistency is not established. PG " +
    "Electroplast did not declare/pay any dividend in FY23, then recommended " +
    "₹0.20/share for FY24 and ₹0.25/share for FY25, with FY24 dividend actually " +
    "paid in FY25 amounting to INR 52.3 mn and FY25 proposed dividend implying " +
    "~INR 70.8 mn on the expanded share base. The payout is not structurally " +
    "aggressive given strong reported profits and sharp deleveraging — " +
    "consolidated PAT rose from INR 775.0 mn in FY23 to INR 1,349.0 mn in FY24 " +
    "and INR 2,878.0–2,910.0 mn in FY25, while consolidated debt/equity " +
    "improved from 1.37x to 0.35x to 0.01x and interest coverage improved from " +
    "3.04x to 4.41x to 5.10x — but from a capital-allocation lens, the dividend " +
    "should not be treated as an unqualified positive because it resumed " +
    "alongside large QIPs in FY24/FY25 and FY25 consolidated operating cash " +
    "flow turned negative due to working-capital absorption and capex/expansion " +
    "needs. Verdict: No — dividend payout is not consistently established over " +
    "the latest three years; low payout, but capital-allocation optics are " +
    "mixed rather than clearly shareholder-friendly.",
  "INDUSTRY_PROMOTER-15":
    "Leverage appears Low. Debt-to-equity improved to 0.11x in FY25 from 0.35x in " +
    "FY24 and 1.37x in FY23; interest coverage improved to 5.10x in FY25 from 4.41x " +
    "in FY24 and 3.04x in FY23; and net debt-to-EBITDA improved to net cash / " +
    "-1.31x in FY25 from 0.65x in FY24 and 2.79x in FY23. Overall, leverage has " +
    "materially decreased over the period, indicating low balance-sheet risk.",
};

// Per-section forensic lens used when a question has no bespoke prompt, so the
// default still points the model at the right part of the filings.
const SECTION_LENS: Record<string, string> = {
  BOARD:
    "board composition, independence ratio, chair/CEO separation, and director conflicts or related-party dealings",
  AUDIT: "the statutory auditor's identity, tenure, opinion, qualifications and fees",
  STAKEHOLDERS: "the shareholding pattern, free float, and institutional/PE entries and exits",
  EMPLOYEE: "attrition, remuneration versus peers, and the ESOP pool",
  INDUSTRY_PROMOTER:
    "promoter holding and trend, pledging, promoter/CEO track record and reputation, and any ED/SEBI/legal history",
  STOCK_EXCHANGE: "SEBI/LODR compliance, stock volatility, liquidity and analyst coverage",
  OTHER_REGULATORY: "contingent liabilities and tax/regulatory exposures in the notes to accounts",
  FINANCIALS:
    "the notes to accounts, cash-flow statement and balance sheet for accounting-quality and forensic red flags",
};

const sectionIdOf = (questionId: string): string =>
  questionId.replace(/-\d+$/, "");

/**
 * Build the analyst prompt for one checklist question. Returns the client's
 * bespoke methodology where one exists, otherwise a rigorous default anchored to
 * the company, the question, and the section's forensic lens. The company name
 * is always named so the model cannot drift to a similarly-named entity.
 */
export function buildQuestionPrompt(
  questionId: string,
  particulars: string,
  company: string,
): string {
  const name = company.trim() || "the company";
  const detailed = DETAILED_PROMPTS[questionId];
  const core = detailed
    ? `Company under review: ${name}. Answer only about ${name}.\n\n${detailed}`
    : `You are a buy-side forensic governance analyst evaluating ${name} for an ` +
      `investment committee. Question: "${particulars}". Dig into ${name}'s ` +
      `latest annual report, quarterly results and exchange filings — reading ` +
      `${SECTION_LENS[sectionIdOf(questionId)] ?? "the company's filings"}, ` +
      `consolidated and standalone where relevant, and comparing with close ` +
      `listed peers where relevant. Answer only about ${name}; never ` +
      `substitute data from a similarly-named entity. ${OUTPUT_CONTRACT}`;

  const example = EXAMPLE_OUTPUTS[questionId];
  if (!example) return core;
  return (
    `${core}\n\nWorked example of the expected Excel-cell answer — this is for a ` +
    `DIFFERENT company (PG Electroplast). Match its style, density and structure, ` +
    `but answer only about ${name} and NEVER import any figure from this ` +
    `example:\n"${example}"`
  );
}

/** True when a question has the client's bespoke methodology (vs the default). */
export const hasDetailedPrompt = (questionId: string): boolean =>
  questionId in DETAILED_PROMPTS;

/** All checklist question ids, for tests / batch prompt generation. */
export const ALL_QUESTION_IDS: string[] = GOVERNANCE_CHECKLIST.flatMap(
  (section) => section.items.map((item) => item.questionId),
);

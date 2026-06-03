// System prompt + output template for the Claude-powered corporate governance
// routine that replaces the legacy MUNS agent. The model must return ONLY the
// markdown checklist below (filled in), which the existing markdown-table parser
// in munsParse.ts / munsToGovernance.ts consumes unchanged.

export const GOVERNANCE_OUTPUT_TEMPLATE = `# Corporate Governance Checklist

**Company:** {{COMPANY}}  |  **Ticker:** {{TICKER}}  |  **Exchange:** {{EXCHANGE}}  |  **Country:** {{COUNTRY}}  |  **Date:** {{DATE}}

## SECTION 1: Board of Directors

| # | Particulars | Response | Score | Max | Remarks |
|---|---|---|---|---|---|
| 1 | Does the board consist of >50% independent directors? |  |  | 2 |  |
| 2 | Is chairman non-executive? |  |  | 2 |  |
| 3 | All relationship or transaction of non-exec directors disclosed in AR? |  |  | 2 |  |
| 4 | Disclosures to the remuneration paid |  |  | 2 |  |
| 5 | Reputation of the directors |  |  | 2 |  |

## SECTION 2: Audit

| # | Particulars | Response | Score | Max | Remarks |
|---|---|---|---|---|---|
| 6 | Auditors to the company - big 4? |  |  | 2 |  |
| 7 | Subsidiary accounts audited by a big-4 auditor? |  |  | 2 |  |
| 8 | Qualifications in the Auditor Report? |  |  | 2 |  |
| 9 | Remuneration paid to the auditors |  |  | 2 |  |
| 10 | Last change in auditors, reason for change |  |  | 2 |  |

## SECTION 3: Stakeholders

| # | Particulars | Response | Score | Max | Remarks |
|---|---|---|---|---|---|
| 11 | Free float in the market - high / low |  |  | 2 |  |
| 12 | Recent entry and exit by PE Funds / HNIs |  |  | 2 |  |

## SECTION 4: Employee

| # | Particulars | Response | Score | Max | Remarks |
|---|---|---|---|---|---|
| 13 | Employee attrition |  |  | 2 |  |
| 14 | Remuneration compared to industry standards |  |  | 2 |  |
| 15 | ESOP Pool |  |  | 2 |  |

## SECTION 5: Industry and Promoter

| # | Particulars | Response | Score | Max | Remarks |
|---|---|---|---|---|---|
| 16 | Promoter stake (%) (above 50 or below) |  |  | 2 |  |
| 17 | Promoter stake trend over the last 8 quarters |  |  | 2 |  |
| 18 | Does the promoter have other material businesses? |  |  | 2 |  |
| 19 | Is the business run by a professional CEO? |  |  | 2 |  |
| 20 | View on CEO |  |  | 2 |  |
| 21 | Promoter vintage and involvement in business |  |  | 2 |  |
| 22 | Vintage of the top mgmt. team in the company |  |  | 2 |  |
| 23 | Quality of second level team |  |  | 2 |  |
| 24 | Family Dynamics - is there any fight? |  |  | 2 |  |
| 25 | Dealing with the government? |  |  | 2 |  |
| 26 | Cases from ED, SEBI, other institutions |  |  | 2 |  |
| 27 | Political connect |  |  | 2 |  |
| 28 | Transparency on analyst calls |  |  | 2 |  |
| 29 | Shareholding pledge? |  |  | 2 |  |
| 30 | Leverage |  |  | 2 |  |

## SECTION 6: Stock Exchange

| # | Particulars | Response | Score | Max | Remarks |
|---|---|---|---|---|---|
| 31 | Adequate disclosures and compliance to SEBI Guidelines |  |  | 2 |  |
| 32 | Volatility in the stock |  |  | 2 |  |
| 33 | Volume and liquidity in the stock - high / low? |  |  | 2 |  |
| 34 | Covered by domestic / MNC coverage |  |  | 2 |  |

## SECTION 7: Other Regulatory

| # | Particulars | Response | Score | Max | Remarks |
|---|---|---|---|---|---|
| 35 | Contingent tax or liability - if material |  |  | 2 |  |

## SECTION 8: Financials

| # | Particulars | Response | Score | Max | Remarks |
|---|---|---|---|---|---|
| 36 | Material red flags in notes to accounts and contingent liabilities |  |  | 2 |  |
| 37 | Debt & Advances - high / low? |  |  | 2 |  |
| 38 | Receivables > 6 months as a % of revenues |  |  | 2 |  |
| 39 | Bankers? Top pvt/psu or not? |  |  | 2 |  |
| 40 | Consistent Dividend payout |  |  | 2 |  |
| 41 | Cash EPS vs Accounting EPS - low or high |  |  | 2 |  |
| 42 | Disclosure on all related party transactions |  |  | 2 |  |
| 43 | CFO / EBITDA |  |  | 2 |  |
| 44 | Provisioning |  |  | 2 |  |
| 45 | Fluctuating depreciation rates |  |  | 2 |  |
| 46 | Other notable red flags |  |  | 2 |  |
| 47 | Working capital cycle |  |  | 2 |  |
| 48 | Are auditor fees transparently disclosed? |  |  | 2 |  |
| 49 | Is asset growth significantly outpacing revenue growth? |  |  | 2 |  |
| 50 | Are contingent liabilities greater than 20x net worth? |  |  | 2 |  |
| 51 | Is provisioning coverage below industry norms or falling? |  |  | 2 |  |

## Summary

| Final Rows | Value |
|---|---|
| Total Score | {{TOTAL}} |
| Overall Governance Score | {{PERCENT}} |`;

export const GOVERNANCE_SYSTEM_PROMPT = `You are a meticulous corporate-governance analyst. You produce a structured, evidence-based governance analysis for a single specified company by completing all 51 checklist questions in the template provided.

RESEARCH METHOD (per question):
- Check the company's latest annual report / proxy statement first.
- If the information is not established there or is unavailable, use web search to find verified data from primary sources (regulatory filings, exchange disclosures, audited financials) before reputable news.
- Provide detailed, COMPANY-SPECIFIC answers — never generic boilerplate. Use the exact names of the CEO, chairman, the company, auditors, and the specific elements involved.
- Include concrete numerical data (percentages, currency figures, dates, ratios) and the specific problems identified — not vague summaries.
- Double-check and verify each answer before including it.

SCORING (each row, Max = 2):
- 2 = clearly favourable / strong governance on this dimension.
- 1 = mixed, average, partially disclosed, or could not be fully verified.
- 0 = clearly unfavourable / governance concern.
- The numeric Score must be consistent with the Response text (e.g. a "No" to "Is chairman non-executive?" is typically 0; a "Yes, Big 4" is 2).

RESPONSE COLUMN:
- Keep it short and categorical where natural (Yes / No / High / Low / Good / Average / Moderate / Above / Below / Stable / Increasing / Decreasing), matching the question.

REMARKS COLUMN:
- 1-3 sentences of specific evidence with figures and names justifying the Response and Score.

SUMMARY:
- Total Score = sum of all 51 Score values (integer, out of 102).
- Overall Governance Score = Total ÷ 102 expressed as a percentage to one decimal place (e.g. "71.6%").

OUTPUT RULES:
- Output ONLY the markdown document defined by the template. Fill in Response, Score, and Remarks for every numbered row, and compute the Summary.
- Keep the section headings, row numbers, Particulars text, and the literal "2" in the Max column exactly as given.
- Do NOT add any commentary, preamble, citations footer, or text before or after the table.`;

export const buildGovernanceUserMessage = (input: {
  companyName: string;
  ticker: string;
  exchange?: string;
  country: string;
  date: string;
}): string => {
  const exchange = input.exchange?.trim() || "(determine from listing)";
  return `Run the full 51-point corporate governance checklist for the following company and return the completed template only.

Company: ${input.companyName}
Ticker / Symbol: ${input.ticker}
Primary Exchange: ${exchange}
Country / Jurisdiction: ${input.country}
Report Date: ${input.date}

Use the exact template structure below. Replace the placeholders in the header line ({{COMPANY}}, {{TICKER}}, {{EXCHANGE}}, {{COUNTRY}}, {{DATE}}) with the values above, and {{TOTAL}} / {{PERCENT}} in the Summary with the computed totals.

${GOVERNANCE_OUTPUT_TEMPLATE}`;
};

import type { GovernanceChecklistSection } from "@/lib/types/governance";

export const GOVERNANCE_CHECKLIST: GovernanceChecklistSection[] = [
  {
    sectionId: "BOARD",
    title: "Board of directors",
    items: [
      { questionId: "BOARD-1", particulars: "Does the board consist of >50% independent directors?" },
      { questionId: "BOARD-2", particulars: "Is chairman non-executive?" },
      { questionId: "BOARD-3", particulars: "All relationship or transaction of non-exec directors disclosed in AR?" },
      { questionId: "BOARD-4", particulars: "Disclosures to the remuneration paid" },
      { questionId: "BOARD-5", particulars: "Reputation of the directors" },
    ],
  },
  {
    sectionId: "AUDIT",
    title: "Audit",
    items: [
      { questionId: "AUDIT-1", particulars: "Auditors to the company - big 4?" },
      { questionId: "AUDIT-2", particulars: "Subsidiary accounts audited by a big-4 auditor?" },
      { questionId: "AUDIT-3", particulars: "Qualifications in the Auditor Report?" },
      { questionId: "AUDIT-4", particulars: "Remuneration paid to the auditors" },
      { questionId: "AUDIT-5", particulars: "Last change in auditors, reason for change" },
    ],
  },
  {
    sectionId: "STAKEHOLDERS",
    title: "Stakeholders",
    items: [
      { questionId: "STAKEHOLDERS-1", particulars: "Free float in the market - high / low" },
      { questionId: "STAKEHOLDERS-2", particulars: "Recent entry and exit by PE Funds/ HNIs" },
    ],
  },
  {
    sectionId: "EMPLOYEE",
    title: "Employee",
    items: [
      { questionId: "EMPLOYEE-1", particulars: "Employee attrition" },
      { questionId: "EMPLOYEE-2", particulars: "Remuneration compared to industry standards" },
      { questionId: "EMPLOYEE-3", particulars: "ESOP Pool" },
    ],
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    title: "Industry and Promoter",
    items: [
      { questionId: "INDUSTRY_PROMOTER-1", particulars: "Promoter stake (%) (above 50 or below)" },
      { questionId: "INDUSTRY_PROMOTER-2", particulars: "Promoter stake trend over the last 8 quarters" },
      { questionId: "INDUSTRY_PROMOTER-3", particulars: "Does the promoter have other material businesses ?" },
      { questionId: "INDUSTRY_PROMOTER-4", particulars: "Is the business run by a professional CEO?" },
      { questionId: "INDUSTRY_PROMOTER-5", particulars: "View on CEO" },
      { questionId: "INDUSTRY_PROMOTER-6", particulars: "Promoter vintage and involvment in business" },
      { questionId: "INDUSTRY_PROMOTER-7", particulars: "Vintage of the top mgmt. team in the company" },
      { questionId: "INDUSTRY_PROMOTER-8", particulars: "Quality of second level team" },
      { questionId: "INDUSTRY_PROMOTER-9", particulars: "Family Dynamics - is there any fight?" },
      { questionId: "INDUSTRY_PROMOTER-10", particulars: "Dealing with the government?" },
      { questionId: "INDUSTRY_PROMOTER-11", particulars: "Cases from ED, SEBI, other institutions" },
      { questionId: "INDUSTRY_PROMOTER-12", particulars: "Political connect" },
      { questionId: "INDUSTRY_PROMOTER-13", particulars: "Transparency on analyst calls" },
      { questionId: "INDUSTRY_PROMOTER-14", particulars: "Shareholding pledge?" },
      { questionId: "INDUSTRY_PROMOTER-15", particulars: "Leverage" },
    ],
  },
  {
    sectionId: "STOCK_EXCHANGE",
    title: "Stock Exchange",
    items: [
      { questionId: "STOCK_EXCHANGE-1", particulars: "Adequate disclosures and compliance to SEBI Guidelines" },
      { questionId: "STOCK_EXCHANGE-2", particulars: "Volatility in the stock" },
      { questionId: "STOCK_EXCHANGE-3", particulars: "Volume and liquidity in the stock - high / low?" },
      { questionId: "STOCK_EXCHANGE-4", particulars: "Covered by domestic / mnc coverage" },
    ],
  },
  {
    sectionId: "OTHER_REGULATORY",
    title: "Other Regulatory",
    items: [
      { questionId: "OTHER_REGULATORY-1", particulars: "Contingent tax or liability - if material" },
    ],
  },
  {
    sectionId: "FINANCIALS",
    title: "Financials",
    items: [
      { questionId: "FINANCIALS-1", particulars: "Material red flags in notes to accounts and contingent liabilities" },
      { questionId: "FINANCIALS-2", particulars: "Debt & Advances - high / low?" },
      { questionId: "FINANCIALS-3", particulars: "Receivables > 6 months as a % of revenues" },
      { questionId: "FINANCIALS-4", particulars: "Bankers? Top pvt/psu or not?" },
      { questionId: "FINANCIALS-5", particulars: "Consistent Dividend payout" },
      { questionId: "FINANCIALS-6", particulars: "Cash EPS vs Accounting EPS - Low or high" },
      { questionId: "FINANCIALS-7", particulars: "Disclosure on all related party transaction" },
      { questionId: "FINANCIALS-8", particulars: "CFO / EBITDA" },
      { questionId: "FINANCIALS-9", particulars: "Provisioning" },
      { questionId: "FINANCIALS-10", particulars: "Fluctuating depreciation rates" },
      { questionId: "FINANCIALS-11", particulars: "Other noteable red flags" },
      { questionId: "FINANCIALS-12", particulars: "Working capital cycle" },
      { questionId: "FINANCIALS-13", particulars: "Are auditor fees transparently disclosed?" },
      { questionId: "FINANCIALS-14", particulars: "Is asset growth significantly outpacing revenue growth?" },
      { questionId: "FINANCIALS-15", particulars: "Are contingent liabilities greater than 20x net worth?" },
      { questionId: "FINANCIALS-16", particulars: "Is provisioning coverage below industry norms or falling?" },
    ],
  },
];

export const GOVERNANCE_TOTAL_ITEMS = GOVERNANCE_CHECKLIST.reduce(
  (sum, section) => sum + section.items.length,
  0,
);

export const GOVERNANCE_TOTAL_MAX_SCORE = GOVERNANCE_TOTAL_ITEMS * 2;

// Generates the Infosys governance workbook using the EXACT same
// buildGovernanceWorkbook() the web dashboard uses, so the .xlsx maps 1:1 to
// the dashboard's "Export to Excel" output. The GovernanceRow[] below is the
// structured form of output-routine.md (every score is identical → 93/102).
//
// Run:
//   node --experimental-strip-types --import ./scripts/alias-loader.mjs \
//     scripts/generate-governance-xlsx.ts
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGovernanceWorkbook } from "@/lib/services/exports/governanceWorkbook";
import type { GovernanceRow } from "@/lib/types/governance";

const AR = "FY25 Annual Report";
const F20F = "Form 20-F FY25";
const F6K = "Form 6-K FY25";
const NSE = "NSE/BSE filing";
const WEB = "Verified web data";

const rows: GovernanceRow[] = [
  // SECTION 1 — Board of Directors
  {
    sectionId: "BOARD",
    questionId: "BOARD-1",
    particulars: "Does the board consist of >50% independent directors?",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "~80% independent. 10-member board has 8 independent directors (D. Sundaram – Lead Independent Director, Bobby Parikh, Cherie Blair, Uri Levine, Helene Auriol Potier, etc.). Non-independent: Nandan M. Nilekani (Non-Exec Chairman) and Salil Parekh (CEO & MD). Exceeds 50% per SEBI LODR.",
    source: F20F,
    confidence: "High",
  },
  {
    sectionId: "BOARD",
    questionId: "BOARD-2",
    particulars: "Is chairman non-executive?",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "Nandan M. Nilekani is Non-Executive Chairman (co-founder, 1981; returned as Chairman Aug 24, 2017). Chairman and CEO (Salil Parekh) roles are fully separated.",
    source: AR,
    confidence: "High",
  },
  {
    sectionId: "BOARD",
    questionId: "BOARD-3",
    particulars:
      "All relationship or transaction of non-exec directors disclosed in AR?",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "All related-party transactions and director relationships disclosed in AR and Form 20-F (Note 2.20). Material RPTs put to shareholder approval via Postal Ballot under SEBI LODR. No undisclosed conflicts.",
    source: AR,
    confidence: "High",
  },
  {
    sectionId: "BOARD",
    questionId: "BOARD-4",
    particulars: "Disclosures to the remuneration paid",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "Full remuneration disclosed. CEO Salil Parekh FY25 total comp ₹80.62 cr (base ₹7.45 cr + variable ₹23.18 cr + stock options exercised ₹49.5 cr + retiral ₹0.49 cr), +22% YoY; FY26 ₹82.6 cr. NRC oversees and reports all director pay.",
    source: AR,
    confidence: "High",
  },
  {
    sectionId: "BOARD",
    questionId: "BOARD-5",
    particulars: "Reputation of the directors",
    response: "Good",
    score: 1,
    maxScore: 2,
    remarks:
      "Strong overall: Nilekani (Aadhaar architect), Parekh (grew revenue ~$10.9B→$19.7B), D. Sundaram (ex-TVS CFO), Bobby Parikh (ex-EY India MP). Caveat: Oct 2019 'Ethical Employees' whistleblower alleged revenue/visa-cost misstatement; SEBI investigated; cleared Jan 2020. Score 1 for this historical blemish.",
    source: WEB,
    confidence: "Medium",
  },

  // SECTION 2 — Audit
  {
    sectionId: "AUDIT",
    questionId: "AUDIT-1",
    particulars: "Auditors to the company - big 4?",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "Deloitte Haskins & Sells LLP is statutory auditor — a Big 4 firm. Appointed under Companies Act 2013 and SEBI LODR.",
    source: F20F,
    confidence: "High",
  },
  {
    sectionId: "AUDIT",
    questionId: "AUDIT-2",
    particulars: "Subsidiary accounts audited by a big-4 auditor?",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "Major subsidiaries (Infosys BPM, EdgeVerve Systems) audited by Deloitte Haskins & Sells LLP — same Big 4 as parent. International subs audited by Deloitte member firms. Form 20-F Exhibit 8.1 lists subsidiaries.",
    source: F20F,
    confidence: "Medium",
  },
  {
    sectionId: "AUDIT",
    questionId: "AUDIT-3",
    particulars: "Qualifications in the Auditor Report?",
    response: "No",
    score: 2,
    maxScore: 2,
    remarks:
      "Clean, unqualified opinions for FY24 and FY25 — no emphasis of matter or qualifications. No reservation on going concern or revenue recognition. Auditors unqualified consistently since 2019 issue resolved.",
    source: AR,
    confidence: "High",
  },
  {
    sectionId: "AUDIT",
    questionId: "AUDIT-4",
    particulars: "Remuneration paid to the auditors",
    response: "Low",
    score: 2,
    maxScore: 2,
    remarks:
      "FY24 (latest breakup): Audit $2.4M + Audit-related $0.7M + Tax $0.3M + Other $0.2M = $3.6M (~₹30 cr). Vs FY25 revenue ₹1,62,990 cr — fees <0.02% of revenue. No fee-for-favours concern.",
    source: F20F,
    confidence: "High",
  },
  {
    sectionId: "AUDIT",
    questionId: "AUDIT-5",
    particulars: "Last change in auditors, reason for change",
    response: "Good",
    score: 2,
    maxScore: 2,
    remarks:
      "Last change June 2017: KPMG completed tenure, Deloitte Haskins & Sells LLP appointed — routine statutory rotation under Companies Act 2013 (Sec 139). Infosys disclosed 'no disagreements'. Deloitte auditor 8+ years (FY17–FY25).",
    source: WEB,
    confidence: "High",
  },

  // SECTION 3 — Stakeholders
  {
    sectionId: "STAKEHOLDERS",
    questionId: "STAKEHOLDERS-1",
    particulars: "Free float in the market - high / low",
    response: "High",
    score: 2,
    maxScore: 2,
    remarks:
      "Free float ~85.5–85.6%. Promoters only ~14.38–14.52%. FIIs ~28.45%, MFs ~23.5%, Insurance ~16.03%, other DIIs ~3.87%, retail ~13.76%. Among the largest free floats in Indian large-cap IT.",
    source: NSE,
    confidence: "High",
  },
  {
    sectionId: "STAKEHOLDERS",
    questionId: "STAKEHOLDERS-2",
    particulars: "Recent entry and exit by PE Funds/ HNIs",
    response: "Stable",
    score: 2,
    maxScore: 2,
    remarks:
      "Widely-held large-cap; no single PE controls a stake. Mar–Jun 2024 FIIs cut ~1.37%, promoters ~0.11%; domestic MFs steady/buying. Notable NSE bulk deal Sep 16, 2025 (303,400 sh @ ₹1,505). No activist/PE entry-exit events.",
    source: WEB,
    confidence: "Medium",
  },

  // SECTION 4 — Employee
  {
    sectionId: "EMPLOYEE",
    questionId: "EMPLOYEE-1",
    particulars: "Employee attrition",
    response: "Moderate",
    score: 1,
    maxScore: 2,
    remarks:
      "Voluntary IT Services attrition 14.1% at Mar 31, 2025 (up from 12.9% Q1 FY25, 13.7% Q3 FY25). Sharply down from peak 27.7% in Q1 FY23. Stabilised via hikes, promotions, ESOP expansion. Score 1 — mild uptick, manageable.",
    source: F6K,
    confidence: "Medium",
  },
  {
    sectionId: "EMPLOYEE",
    questionId: "EMPLOYEE-2",
    particulars: "Remuneration compared to industry standards",
    response: "Average",
    score: 2,
    maxScore: 2,
    remarks:
      "Broadly in line with TCS/Wipro. CEO comp ₹80.6 cr (FY25) competitive for a ~$20B-revenue firm. Total Rewards philosophy with large equity component; variable pay performance-linked. No underpayment issues reported.",
    source: WEB,
    confidence: "Medium",
  },
  {
    sectionId: "EMPLOYEE",
    questionId: "EMPLOYEE-3",
    particulars: "ESOP Pool",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "Active '2015 Stock Incentive Compensation Plan' (RSUs + options). ESOP coverage roughly doubled (~2%→~4% of base) 2022–2024 for retention. CEO exercised ₹49.5 cr of options in FY25. Grants/vesting disclosed in AR.",
    source: AR,
    confidence: "High",
  },

  // SECTION 5 — Industry and Promoter
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-1",
    particulars: "Promoter stake (%) (above 50 or below)",
    response: "Below",
    score: 1,
    maxScore: 2,
    remarks:
      "Promoter group (Nilekani family + founders) only ~14.4% (Apr 2026) — well below 50%. Reflects founders' design for an institutionally-run, widely-held company, but low stake warrants monitoring. Score 1.",
    source: NSE,
    confidence: "High",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-2",
    particulars: "Promoter stake trend over the last 8 quarters",
    response: "Decreasing",
    score: 1,
    maxScore: 2,
    remarks:
      "Over Q1 FY24–Q4 FY25 promoter stake eased ~14.65%→14.38% (-0.27pp), mainly founder-family secondary sales/charitable transfers, not distress. No sharp drops; no pledging. Score 1 (gradual decline).",
    source: NSE,
    confidence: "Medium",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-3",
    particulars: "Does the promoter have other material businesses ?",
    response: "No",
    score: 2,
    maxScore: 2,
    remarks:
      "Nilekani's interests are philanthropic (EkStep) and angel investments plus public-service role (UIDAI/Aadhaar) — none compete with Infosys IT services. Other co-founders largely retired. No material RPT conflicts.",
    source: WEB,
    confidence: "Medium",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-4",
    particulars: "Is the business run by a professional CEO?",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "Salil Parekh, professional CEO & MD since Jan 2018 (not founding family). Ex-Capgemini; B.Tech IIT Bombay, MBA Cornell. Revenue grew ~$10.9B (FY18)→~$19.7B (FY25). Contract renewed multiple times.",
    source: F20F,
    confidence: "High",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-5",
    particulars: "View on CEO",
    response: "Good",
    score: 2,
    maxScore: 2,
    remarks:
      "Strong track record: stabilised post-2017 governance, navigated 2019 whistleblower (cleared), COVID, consistent growth. FY25 revenue ₹1,62,990 cr (+6.1%), op margin 21.1%, record FCF ₹34,549 cr (129.2% of PAT). Minor: margin conservatism / AI strategy debate.",
    source: F6K,
    confidence: "Medium",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-6",
    particulars: "Promoter vintage and involvment in business",
    response: "Good",
    score: 2,
    maxScore: 2,
    remarks:
      "Nilekani is one of 7 original co-founders (incorporated Jul 2, 1981). CEO 2002–07, then UIDAI 2009–14, returned as Non-Exec Chairman 2017. Strategic/governance involvement; deep institutional knowledge and global credibility.",
    source: WEB,
    confidence: "High",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-7",
    particulars: "Vintage of the top mgmt. team in the company",
    response: "Good",
    score: 2,
    maxScore: 2,
    remarks:
      "CEO Parekh ~7+ yrs; CFO Jayesh Sanghrajka (since Apr 1, 2024) has ~18 yrs total tenure with Infosys; CLO Inderpreet Sawhney and CHRO Shaji Mathew longstanding. Balanced external-hire stability + internal promotion.",
    source: F20F,
    confidence: "Medium",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-8",
    particulars: "Quality of second level team",
    response: "Good",
    score: 2,
    maxScore: 2,
    remarks:
      "Deep bench of EVPs/SVPs/unit heads across verticals (FS, Manufacturing, Energy, Retail, Comms). Sanghrajka's internal promotion to CFO evidences strong second tier. No leadership vacuum.",
    source: AR,
    confidence: "Medium",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-9",
    particulars: "Family Dynamics - is there any fight?",
    response: "No",
    score: 2,
    maxScore: 2,
    remarks:
      "No current family dispute. The 2017 Murthy–board/Sikka standoff was over compensation/governance, not family ownership; resolved with Sikka's exit and Nilekani's return. Stable since; Murthy invests separately (Catamaran), not on board.",
    source: WEB,
    confidence: "Medium",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-10",
    particulars: "Dealing with the government?",
    response: "Good",
    score: 2,
    maxScore: 2,
    remarks:
      "Nilekani architected Aadhaar (UIDAI Chairman 2009–14) → strong govt credibility; Infosys a major govt IT vendor. Caveat: 2021 Income Tax e-filing portal glitches drew Finance Ministry criticism, since resolved. No active disputes FY25.",
    source: WEB,
    confidence: "Medium",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-11",
    particulars: "Cases from ED, SEBI, other institutions",
    response: "Average",
    score: 1,
    maxScore: 2,
    remarks:
      "Oct 2019 SEBI probe after whistleblower alleged CEO/CFO financial misstatements; independent external investigation concluded Jan 2020 — no impropriety found; SEBI inquiry closed. No active ED/SEBI/CBI cases in FY25. Score 1 for the resolved historical matter.",
    source: WEB,
    confidence: "Medium",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-12",
    particulars: "Political connect",
    response: "Moderate",
    score: 2,
    maxScore: 2,
    remarks:
      "Nilekani contested 2014 Lok Sabha (INC, Bangalore South; lost to BJP's Ananth Kumar). Politically inactive since; cross-party engagement via Aadhaar/Digital India. No current partisan entanglement.",
    source: WEB,
    confidence: "Medium",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-13",
    particulars: "Transparency on analyst calls",
    response: "High",
    score: 2,
    maxScore: 2,
    remarks:
      "Quarterly calls with CEO Parekh and CFO Sanghrajka; granular disclosures — large-deal TCV, vertical revenue splits, headcount, margin guidance. NYSE-listed → SEC + SEBI disclosure. Among the most transparent in Indian IT.",
    source: F6K,
    confidence: "High",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-14",
    particulars: "Shareholding pledge?",
    response: "No",
    score: 2,
    maxScore: 2,
    remarks:
      "Nil promoter pledge per SEBI quarterly disclosures. Nilekani holds 100,461,168 shares (~0.94%) with zero pledge; promoter group ~14.38% with no pledge. Strong positive indicator.",
    source: NSE,
    confidence: "High",
  },
  {
    sectionId: "INDUSTRY_PROMOTER",
    questionId: "INDUSTRY_PROMOTER-15",
    particulars: "Leverage",
    response: "Low",
    score: 2,
    maxScore: 2,
    remarks:
      "Net-cash company. FY25: cash & equivalents ₹31,832 cr + investments ₹12,606 cr ≈ ₹44,438 cr (~$5.3B). FCF ₹34,549 cr (highest ever). Debt minimal (mainly Ind AS 116 leases). Deeply negative net debt.",
    source: F6K,
    confidence: "High",
  },

  // SECTION 6 — Stock Exchange
  {
    sectionId: "STOCK_EXCHANGE",
    questionId: "STOCK_EXCHANGE-1",
    particulars: "Adequate disclosures and compliance to SEBI Guidelines",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "Listed NSE (INFY)/BSE (500209) + NYSE ADR. Complies with SEBI LODR 2015, Companies Act 2013, SEC Form 20-F. Separate Audit, NRC, Risk and Stakeholder committees. Timely filings. No active SEBI enforcement in FY25.",
    source: AR,
    confidence: "High",
  },
  {
    sectionId: "STOCK_EXCHANGE",
    questionId: "STOCK_EXCHANGE-2",
    particulars: "Volatility in the stock",
    response: "Moderate",
    score: 1,
    maxScore: 2,
    remarks:
      "52-wk range ₹1,198.80 (Apr 24, 2026) – ₹1,727.85 (Feb 3, 2026). Down ~33% YTD 2026 with sector on AI-disruption fears and weak guidance. Elevated for a large-cap blue chip. Score 1 — largely sector-wide.",
    source: WEB,
    confidence: "Medium",
  },
  {
    sectionId: "STOCK_EXCHANGE",
    questionId: "STOCK_EXCHANGE-3",
    particulars: "Volume and liquidity in the stock - high / low?",
    response: "High",
    score: 2,
    maxScore: 2,
    remarks:
      "Among the most liquid NSE/BSE stocks (top 5–10 by volume) and a large Indian ADR on NYSE. Institutions ~72% of float ensure block liquidity; tens of millions of shares traded daily. No liquidity risk.",
    source: WEB,
    confidence: "High",
  },
  {
    sectionId: "STOCK_EXCHANGE",
    questionId: "STOCK_EXCHANGE-4",
    particulars: "Covered by domestic / mnc coverage",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "30+ analysts. Domestic: Motilal Oswal, HDFC Sec, ICICI Sec, Kotak, Axis, Emkay, Nuvama. Global: Morgan Stanley, Goldman, JPMorgan, UBS, Jefferies, Macquarie, Bernstein. Top holding in India ETFs/MFs.",
    source: WEB,
    confidence: "High",
  },

  // SECTION 7 — Other Regulatory
  {
    sectionId: "OTHER_REGULATORY",
    questionId: "OTHER_REGULATORY-1",
    particulars: "Contingent tax or liability - if material",
    response: "Moderate",
    score: 1,
    maxScore: 2,
    remarks:
      "Income-tax disputes disclosed as contingent liabilities. Q4 FY25 Sec 250 orders resolved AY16-17 & AY19-20 in Infosys' favour → ₹327 cr interest income, ₹183 cr provision reversal, ₹1,068 cr removed from contingent liabilities. Routine and small vs net worth >₹70,000 cr. Score 1.",
    source: F6K,
    confidence: "Medium",
  },

  // SECTION 8 — Financials
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-1",
    particulars:
      "Material red flags in notes to accounts and contingent liabilities",
    response: "No",
    score: 1,
    maxScore: 2,
    remarks:
      "Notes detailed/transparent: income-tax disputes (partly resolved FY25), employee benefits, Ind AS 116 leases. No unusual provisions, impairments or undisclosed RPTs. 2019 whistleblower disclosed and resolved. Score 1 — monitor remaining contingencies.",
    source: AR,
    confidence: "Medium",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-2",
    particulars: "Debt & Advances - high / low?",
    response: "Debt < Advances",
    score: 2,
    maxScore: 2,
    remarks:
      "Minimal financial debt (mainly Ind AS 116 leases). FY25 cash ₹31,832 cr + investments ₹12,606 cr ≈ ₹44,438 cr liquidity. No material borrowings. Advances are normal-course with no unusual levels.",
    source: F6K,
    confidence: "High",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-3",
    particulars: "Receivables > 6 months as a % of revenues",
    response: "Low",
    score: 2,
    maxScore: 2,
    remarks:
      "DSO 69 days at Mar 31, 2025 (improved from 71). Trade receivables 18.9% of LTM revenue (vs 19.6% FY24). >6-month receivables a tiny share; blue-chip global client base with strong payment records.",
    source: F20F,
    confidence: "High",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-4",
    particulars: "Bankers? Top pvt/psu or not?",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "Top-tier banks: HDFC, ICICI, SBI plus global (Citi, Deutsche, JPMorgan, HSBC) for treasury/forex/payments. Net-cash ₹44,438 cr → relationships for liquidity management not credit. No quality concerns.",
    source: AR,
    confidence: "Medium",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-5",
    particulars: "Consistent Dividend payout",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "Strong record. FY25: interim ₹21 + final ₹22 = ₹43/sh (+13.2% YoY). FY24: ₹21 + ₹20 + ₹8 special = ₹49/sh. Capital Allocation Policy returns ~85% of FCF; payout ~50–65% of PAT.",
    source: F6K,
    confidence: "High",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-6",
    particulars: "Cash EPS vs Accounting EPS - Low or high",
    response: "Cash > Accounting",
    score: 2,
    maxScore: 2,
    remarks:
      "FY25 FCF ₹34,549 cr with FCF conversion 129.2% of net profit (highest ever) → cash generation exceeds accounting profit; high earnings quality. Basic EPS ₹64.50; cash EPS materially higher.",
    source: F6K,
    confidence: "High",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-7",
    particulars: "Disclosure on all related party transaction",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "All RPTs in Note 2.20 of consolidated statements; material RPTs to shareholder approval via Postal Ballot (SEBI LODR Reg 23). Amounts with subsidiaries, associates, JVs and KMP disclosed. No RPT concerns flagged.",
    source: AR,
    confidence: "High",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-8",
    particulars: "CFO / EBITDA",
    response: "High",
    score: 2,
    maxScore: 2,
    remarks:
      "FY25 CFO ₹42,388 cr; EBITDA ≈ ₹38,000–40,000 cr (EBIT ~₹34,400 cr + D&A ₹2,323 cr) → CFO/EBITDA ≈ 1.05–1.10x, above 1.0. EBITDA fully cash-backed; FCF conversion 129.2% corroborates.",
    source: F6K,
    confidence: "Medium",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-9",
    particulars: "Provisioning",
    response: "Good",
    score: 2,
    maxScore: 2,
    remarks:
      "Prudent ECL (Ind AS 109) on receivables; low needs given blue-chip clients. Tax provisions adequate; ₹183 cr reversed in Q4 FY25 on favourable court orders, not arbitrary write-back.",
    source: AR,
    confidence: "High",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-10",
    particulars: "Fluctuating depreciation rates",
    response: "No",
    score: 2,
    maxScore: 2,
    remarks:
      "D&A ₹2,323 cr FY25. Straight-line method (Ind AS 16) applied consistently; no material change to useful lives/rates. No spike or compression indicating manipulation.",
    source: F6K,
    confidence: "High",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-11",
    particulars: "Other noteable red flags",
    response: "Low",
    score: 1,
    maxScore: 2,
    remarks:
      "2019 whistleblower (resolved/cleared Jan 2020). Forward risks: AI/GenAI disruption to per-FTE billing; 2021 IT-portal glitch criticism; ~33% YTD 2026 share decline. None are active accounting red flags. Score 1 for combined weight.",
    source: WEB,
    confidence: "Medium",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-12",
    particulars: "Working capital cycle",
    response: "Good",
    score: 2,
    maxScore: 2,
    remarks:
      "Short cycle. DSO 69 days (from 71); receivables 18.9% of LTM revenue; working capital $6,347M (Mar 2025) vs $6,071M (Mar 2024). CFO cited improved WC management as a record-FCF driver.",
    source: F20F,
    confidence: "High",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-13",
    particulars: "Are auditor fees transparently disclosed?",
    response: "Yes",
    score: 2,
    maxScore: 2,
    remarks:
      "Full breakup disclosed. FY24: Audit $2.4M, Audit-related $0.7M, Tax $0.3M, Other $0.2M = $3.6M (~₹30 cr). Indian disclosures separately state Deloitte statutory-audit vs other-service fees (Schedule III).",
    source: F20F,
    confidence: "High",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-14",
    particulars: "Is asset growth significantly outpacing revenue growth?",
    response: "No",
    score: 2,
    maxScore: 2,
    remarks:
      "FY25 revenue +6.1% YoY; total assets grow in a similar range. Asset-light IT-services model; goodwill assessed for impairment. No unusual spike in fixed assets/intangibles/advances.",
    source: F20F,
    confidence: "High",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-15",
    particulars: "Are contingent liabilities greater than 20x net worth?",
    response: "No",
    score: 2,
    maxScore: 2,
    remarks:
      "Net worth ~₹72,000–75,000 cr → 20x ≈ ₹1.44–1.50 lakh cr. Contingent liabilities (mainly disputed tax) well under ₹10,000 cr and falling (₹1,068 cr removed Q4 FY25). No threat to net worth.",
    source: F6K,
    confidence: "High",
  },
  {
    sectionId: "FINANCIALS",
    questionId: "FINANCIALS-16",
    particulars: "Is provisioning coverage below industry norms or falling?",
    response: "No",
    score: 2,
    maxScore: 2,
    remarks:
      "Provisioning consistent with IT-sector norms and Ind AS. ₹183 cr tax-provision reversal in Q4 FY25 was court-order backed, not aggressive release. No declining/below-norm provisioning; auditors raised no concern.",
    source: F6K,
    confidence: "High",
  },
];

const buffer = await buildGovernanceWorkbook({
  rows,
  company: "Infosys Limited",
  ticker: "INFY",
  exchange: "NSE / BSE / NYSE",
  country: "India",
  reportDate: new Date("2026-06-02T00:00:00Z"),
  dataSource: "Live MUNS analysis",
});

const here = fileURLToPath(new URL(".", import.meta.url));
const outPath = resolve(here, "..", "infosys-limited-governance-2026-06-02.xlsx");
writeFileSync(outPath, Buffer.from(buffer));
console.log(`Wrote ${outPath} (${rows.length} rows)`);

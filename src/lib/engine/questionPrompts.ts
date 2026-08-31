// Per-question analyst prompt library — the "how to answer" brain of the
// source-first engine. Each checklist question is answered by digging into the
// company's own filings with a specific forensic methodology, NOT by a generic
// one-liner. Twenty-six checklist questions carry the client's own bespoke
// prompt, kept VERBATIM so the output matches the manually-produced Beas sheet:
// five came from the client's (Dheep's) ChatGPT sessions, and twenty-one from
// the "What is expected" column of the client's Beas checklist sheet. Every
// other question falls back to a rigorous default built from the same house
// style (verdict-first, exact figures, grounded, one Excel cell). Each bespoke
// prompt embeds its own output format and, where the client specified one, its
// own 0/0.25/0.5 scoring rule (which the grader applies over the generic one).
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
// already embed their own output instruction (and, for the sheet prompts, their
// own scoring rule), so they are used as-is (only the company name is anchored in
// front). The first five are Dheep's ChatGPT-session prompts; the rest are from
// the client's checklist sheet.
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

  // ---- Prompts from the client's Beas checklist sheet ("What is expected" column),
  // verbatim; each embeds its own output format AND scoring rule. ----
  // BOARD-1 — "Does the board consist of >50% independent directors?"
  "BOARD-1":
    "Answer “Does the board consist of >50% independent directors — Yes/No?” from an investment analyst-cum-forensic governance lens, not by counting the label attached to each director. From the latest annual report (Corporate Governance Report under Schedule V Part C of SEBI LODR, the Board's Report, the AGM notice) plus the company website, exchange filings and MCA/DIN records, tabulate every director as at financial year-end AND as on the date of the report, capturing name, DIN, category (Promoter Executive / Executive / Non-Executive Non-Independent / Independent / Nominee), date of first appointment, cumulative tenure, shareholding, and attendance at board and committee meetings. State the arithmetic explicitly (e.g. “4 of 6 = 66.7%”) and test it against the applicable threshold: at least 50% independent where the chairperson is executive or is a non-executive promoter-related chair, at least one-third otherwise, alongside the Companies Act 2013 minimum and the woman independent director requirement; note any independent seat vacant beyond the permitted cure period. Then test independence in substance, not form: is any “independent” director a former promoter, promoter-group relative, ex-employee or ex-executive of the company or group; has any served beyond two terms or ten-plus years; does any sit on multiple group/promoter-affiliated boards; does any receive professional, consultancy, legal or advisory fees or commission from the company or its subsidiaries (cross-check the Ind AS 24 related party note and the directors' remuneration note); does any hold a material shareholding, show low attendance, or a pattern of no recorded dissent? Review the last three to five years — or the full period since listing where the company has a shorter listed history, which must be stated — for independent directors resigning mid-term with vague or personal reasons, resignations clustered around adverse events, audit disputes or forensic audits, delays in filling vacancies, institutional dissent on reappointment resolutions, and any qualification or adverse remark in the Secretarial Audit Report (Form MR-3) or the practising company secretary's corporate governance certificate on board composition. Benchmark board size and independence percentage against the closest listed peers where peers exist; where they do not, say so rather than omitting it. Conclude Yes and score 0.5 if independent directors exceed 50% of board strength and their independence is credible in substance — stable tenure, adequate attendance, no pecuniary entanglement, clean secretarial audit; score 0.25 if the headline percentage is met but independence is diluted in substance by tenure, past association, group-board overlap, fee relationships or churn; conclude No and score 0 if independent directors are at or below 50%. The final answer should be 3–4 concise sentences that can be pasted into a single Excel cell, stating Yes/No first, then the exact count and percentage as at FY-end, the chairperson's category and the resulting regulatory threshold, the single most important substance-over-form observation, and the annual report page references.",
  // BOARD-2 — "Is chairman non-executive?"
  "BOARD-2":
    "Answer “Is the chairman non-executive — Yes/No?” from an investment analyst-cum-forensic governance lens, focusing on concentration of power at the top of the board. From the latest annual report (Corporate Governance Report, Board's Report, AGM notice), the company website and exchange filings, identify the chairperson as at financial year-end AND as on the date of the report, and record the exact designation used — Chairman & Managing Director, Executive Chairman, Chairman (Non-Executive), Chairman (Non-Executive, Independent), or Chairperson (Non-Executive, Promoter) — with DIN, promoter/promoter-group status, any family or inter-se relationship with the Managing Director or CEO, tenure as chair, other listed directorships, and total remuneration drawn (sitting fees plus commission plus any other payment). Where the chair is stated to be non-executive, verify that classification in substance rather than accepting the label: check whether the chair draws commission, perquisites, salary or consultancy income disproportionate to a non-executive role; occupies an office or place of profit in the company or any subsidiary; holds an executive position in any group or promoter entity; or is named as key managerial personnel in the remuneration note, MGT-7 or the Ind AS 24 related party disclosure. Separately assess whether the roles of chairperson and Managing Director/CEO are held by the same person or by relatives, whether the chair is also independent, whether a lead independent director has been appointed where the chair is executive or promoter-affiliated, and whether the Regulation 17(1) board composition threshold has been correctly applied given the chair's status. Review the period since listing, or the last three to five years where available (state which), for changes in the chair position — transitions between executive and non-executive chair, succession within the promoter family, interim or acting chair arrangements — and any shareholder or proxy-advisory objection to a combined chair-CEO role or to chairperson remuneration. Conclude Yes and score 0.5 if the chairperson is genuinely non-executive, holds no executive office in the company or group, and the chair and chief executive roles are separated — strongest where the chair is also independent; score 0.25 if the chair is non-executive in name but promoter-affiliated, related to the MD/CEO, or drawing remuneration inconsistent with a non-executive role; conclude No and score 0 if the chair is executive or is a Chairman & Managing Director. The final answer should be 3–4 concise sentences for a single Excel cell, stating Yes/No first, then the chairperson's name and exact designation, promoter and independence status, confirmation of chair-CEO separation and the name of the MD/CEO, the remuneration or affiliation check result, and annual report page references.",
  // BOARD-3 — "All relationship or transaction of non-exec directors disclosed in AR?"
  "BOARD-3":
    "Answer “Are all relationships or transactions of non-executive directors disclosed in the AR — Yes/No?” from an investment analyst-cum-forensic accounting lens, treating this as a test of the completeness and candour of disclosure, not the presence of a standard paragraph. For every non-executive and independent director, extract the disclosures required under Schedule V Part C of SEBI LODR and the Companies Act 2013 — inter-se relationships between directors, shareholding and convertible instruments held (state the number of shares per director), sitting fees, commission and any other remuneration (state amounts per director and in total), other directorships and committee memberships, and the declaration of independence under Section 149(6) and Regulation 25(8) confirming no material pecuniary relationship with the company, its promoters or senior management. Then cross-verify these against every other part of the report rather than reading them in isolation: the Ind AS 24 related party note (including entities where a director or a relative is a director, partner, member or has significant influence), the register of contracts under Sections 184 and 189 and the Form AOC-2 disclosure, the legal, professional, consultancy, rent, brokerage and commission lines within other expenses, the subsidiary and associate director lists, the loans, advances and guarantees notes, and the half-yearly related party transaction disclosures filed with the exchanges. Specifically test for the classic gaps: professional or advisory fees paid to a firm, LLP, consultancy, bank or advisory house in which a non-executive director or a relative is a partner, director or beneficial owner — and where such an arrangement exists, state the counterparty, the amount, the relationship, whether it was approved as a related party transaction, and whether it is ongoing or has expired; a non-executive director's relative employed by the company or a subsidiary; common directorships with vendors, customers, lenders or promoter-group entities that appear in the related party note but not in the board disclosures; shareholding held through family members, trusts or investment vehicles; and directorships or interests visible in MCA/DIN records or other companies' filings but absent here. Review the period since listing, or the last three to five annual reports where available (state which), for boilerplate disclosure repeated unchanged year on year, relationships that surfaced only later, and any qualification, adverse remark or observation by the statutory auditor, the secretarial auditor (Form MR-3) or the practising company secretary on Section 177/184/188/189 compliance or related party disclosure, including any post-balance-sheet forensic audit or exchange clarification touching director transactions. Conclude Yes and score 0.5 if disclosures are specific, individually named, internally consistent with the related party note and expense lines, and supported by clean independence declarations and an unqualified secretarial audit; score 0.25 (Needs Review) where disclosure is formally compliant but too thin to verify independently, or where a director-linked pecuniary arrangement exists and is disclosed but is material or unusual; conclude No and score 0 where relationships or transactions traceable elsewhere in the report or in public records are missing, where generic “none except as stated” language conflicts with identifiable transactions, or where an auditor has flagged incomplete disclosure. The final answer should be 3–4 concise sentences for a single Excel cell, stating Yes/No/Needs Review first, then what was disclosed (sitting fees and commission totals, per-director shareholding), the result of the cross-check against the related party and expense notes including any named director-linked arrangement, any inconsistency or omission identified, and annual report page references.",
  // AUDIT-1 — "Auditors to the company - big 4?"
  "AUDIT-1":
    "Identify the company’s current statutory auditor(s) and determine whether the auditor is a **Big 4 firm (Deloitte, EY, KPMG or PwC, including the relevant Indian member/affiliate firm)**. Review the company’s historical statutory auditors, preferably for the last 10 financial years or since listing if shorter, to determine whether it has ever been audited by a Big 4 firm. Verify the information using primary sources such as annual reports, corporate governance reports, AGM/shareholder filings and stock-exchange disclosures. **Start the output with “Yes” or “No” for whether the current auditor is Big 4, followed by the auditor’s name, tenure, a brief assessment of the auditor’s reputation/standing, and the score. Score 0.5 if the current auditor is Big 4 and 0 if the current auditor is not Big 4. Keep the output concise and suitable for a single Excel cell.**",
  // AUDIT-2 — "Subsidiary accounts audited by a big-4 auditor?"
  "AUDIT-2":
    "Review the company’s latest annual report, subsidiary financial statements and other primary disclosures to identify the **statutory auditors of each individual subsidiary** and determine whether their own accounts are directly audited by a **Big 4 firm (Deloitte, EY, KPMG or PwC, including the relevant Indian member/affiliate firm)**. Do not treat the parent company’s statutory auditor or the group/consolidated auditor as a subsidiary auditor unless that firm is explicitly identified as the auditor of the individual subsidiary’s financial statements. Determine the extent of Big 4 coverage across the company’s subsidiaries and start the output with **“All”, “Partial” or “None”**, followed by the relevant subsidiary/auditor names and the score. **Score 0.5 if all subsidiaries are audited by Big 4 firms, 0.25 if only some subsidiaries are audited by Big 4 firms, and 0 if no subsidiaries are audited by Big 4 firms.** Where the company has numerous subsidiaries, use the latest disclosed subsidiary list and clearly identify the basis used to determine coverage. Verify using primary sources and present the findings concisely in a format suitable for a single Excel cell.",
  // AUDIT-3 — "Qualifications in the Auditor Report?"
  "AUDIT-3":
    "Review the statutory auditor’s reports for the **last 5 financial years, or since listing if shorter**, to identify any **qualified opinion, adverse opinion, or disclaimer of opinion** relating to the company’s financial statements. For each identified qualification or modified opinion, assess the **nature and materiality of the issue, financial impact, whether it is recurring, whether it relates to management’s accounting judgement/oversight or indicates a fundamental weakness in the reliability of the financial statements, whether management has subsequently resolved it, and whether the auditor has continued to raise the matter**. Distinguish genuine qualifications from **Emphasis of Matter, Key Audit Matters, CARO observations and other disclosures that do not modify the audit opinion**. Based on this assessment, determine whether the issue represents a **material/problematic governance or accounting red flag** or a **minor/technical or management-level issue with limited investment significance**. Start the output with **“No Red Flag”, “Minor/Technical Red Flag” or “Material Red Flag”**, followed by a concise description of the issue, relevant financial year(s), status/resolution and the score. **Score 0.5 for No Red Flag, 0.25 for a Minor/Technical Red Flag, and 0 for a Material/Problematic Red Flag.** Verify all findings using the auditor’s reports in annual reports and other primary filings, and present the findings concisely in a format suitable for a single Excel cell.",
  // AUDIT-5 — "Last change in auditors, reason for change"
  "AUDIT-5":
    "Identify the **most recent change in the company’s statutory auditor(s)**, including the outgoing auditor, incoming auditor, financial year/date of the change, tenure of the outgoing auditor, and the stated reason for the change. Determine whether the change represents a **planned/mandatory rotation or completion of tenure, normal non-reappointment, resignation, early termination, merger/restructuring of the audit firm, or another reason**. Review the outgoing auditor’s resignation letter, company disclosures, AGM notices, stock-exchange filings and relevant annual reports to identify any **disagreements with management, accounting concerns, inability to obtain information, lack of cooperation, scope limitations, conflicts of interest, or other unusual circumstances**. Assess whether the change appears **planned and routine or abrupt/unusual**, taking into account the auditor’s tenure, stated reason, timing and consistency of disclosures. Start the output with **“No Red Flag”, “Minor Red Flag” or “Material Red Flag”**, followed by the outgoing and incoming auditor, reason for change, and a concise explanation of the assessment. **Score 0.5 for a planned/routine change with no concerning circumstances, 0.25 for an unusual or insufficiently explained change with limited concerns, and 0 for an abrupt/resignation-driven change involving material unresolved concerns, disagreements, conflicts or other significant governance red flags.** Verify the findings using primary sources and present the output concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-1 — "Promoter stake (%) (above 50 or below)"
  "INDUSTRY_PROMOTER-1":
    "Identify the company’s **latest disclosed promoter and promoter-group shareholding (%)** from the most recent shareholding pattern filed with the stock exchanges. State the combined promoter/promoter-group stake and begin the output with **“Above 50%” or “Below 50%”**, followed by the exact percentage and the **score**. **Score 0.5 if the combined promoter/promoter-group shareholding is above 50%, and 0 if it is 50% or below.** Use the latest quarterly shareholding disclosure as the primary source and cross-check against the annual report or other primary filings where relevant. Present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-2 — "Promoter stake trend over the last 8 quarters"
  "INDUSTRY_PROMOTER-2":
    "Review the company’s **promoter and promoter-group shareholding for the last 8 quarterly shareholding disclosures** and assess the overall trend. Determine whether the promoter stake has remained broadly stable, increased, or decreased, and distinguish between **actual promoter selling/transfer of shares** and a reduction in ownership percentage caused by **QIPs, preferential issues, ESOPs, warrants, or other dilution where the promoter did not sell shares**. For any actual reduction due to promoter selling, quantify the change and review company disclosures, exchange filings and management commentary to determine the stated reason and whether the selling appears routine, strategic, or concerning. Start the output with **“Stable/Increasing”, “Decreased – Dilution” or “Decreased – Promoter Selling”**, followed by the change in promoter stake over the 8-quarter period and a concise explanation. **Score 0.5 if promoter stake is stable or has increased, 0.25 if the stake has decreased due primarily to dilution or limited/justifiably explained promoter selling, and 0 if there has been material promoter selling without a compelling explanation or the selling represents a significant governance concern.** Verify the shareholding data using stock-exchange filings and other primary sources, and present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-3 — "Does the promoter have other material businesses ?"
  "INDUSTRY_PROMOTER-3":
    "Identify whether the company’s **promoters/promoter group have other material business interests outside the listed company**, including other listed companies, significant private/unlisted businesses, or major operating businesses where the promoter has meaningful ownership or control. Assess the **scale and nature of these businesses relative to the listed company**, and whether there are any apparent overlaps, competing interests, related-party dependencies, or potential conflicts of interest that could affect the listed company. Start the output with **“No” or “Yes”**, followed by the relevant business interests and a concise assessment of their materiality. **Score 0.5 if promoters do not have other material businesses or if their other businesses are immaterial/non-conflicting; score 0.25 if promoters have material external businesses but there is limited or manageable conflict; and score 0 if promoters have significant competing/overlapping businesses or other interests that create a material governance or conflict-of-interest concern.** Verify using annual reports, stock-exchange disclosures, promoter disclosures, MCA/public filings and other reliable primary sources, and present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-4 — "Is the business run by a professional CEO?"
  "INDUSTRY_PROMOTER-4":
    "Identify the company’s **current CEO/MD and determine whether the day-to-day business is run by a professional manager who is not a promoter or member of the promoter/founding family**. Verify the CEO’s identity, role, promoter/family relationship, ownership interest and background using the latest annual report, corporate governance disclosures, company website and stock-exchange filings. Start the output with **“Yes” or “No”**, followed by the CEO’s name, designation and a brief description of whether they are a professional/non-promoter executive. **Score 0.5 if the business is run by a professional non-promoter CEO, and 0 if the CEO/MD is a promoter or member of the promoter/founding family.** Present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-5 — "View on CEO"
  "INDUSTRY_PROMOTER-5":
    "Assess the quality and suitability of the company’s current CEO/MD based on objective evidence from reliable public sources. Review the CEO’s **educational qualifications, professional background, previous companies and roles, tenure, industry experience, P&L/general management experience, past projects or businesses managed, and demonstrated track record of execution and value creation**, with particular emphasis on whether their prior experience is relevant to the company’s current business, scale and strategic challenges. Review investor presentations, earnings calls, interviews, credible media, analyst/institutional commentary and other reliable sources to assess the **market/street perception of the CEO**, while distinguishing fact-based evidence from opinion and avoiding unsupported claims. Consider the CEO’s tenure at the company and, where sufficient evidence exists, assess performance during their tenure relative to the business’s key operating objectives and industry context. Start the output with **“Strong”, “Average” or “Weak”**, followed by the CEO’s name and a concise evidence-based assessment covering **relevant experience, track record, qualifications and market perception**. **Score 0.5 for Strong, 0.25 for Average and 0 for Weak.** Do not base the score solely on educational pedigree, brand-name employers or share-price performance; assess the CEO primarily on relevant capability, execution track record and suitability for the specific business. Verify the findings using primary company disclosures and credible independent sources, and present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-6 — "Promoter vintage and involvment in business"
  "INDUSTRY_PROMOTER-6":
    "Assess the company’s **promoter vintage and involvement in the business** using reliable public sources. Determine when the promoter/founding family first established or became involved in the business, how many years they have been associated with it, whether the current promoters are the original founders or subsequent generations, and their current level of involvement through executive roles, board positions, strategic decision-making and/or operating responsibilities. Assess whether the promoter has demonstrated **long-term commitment, continuity and meaningful involvement in building the business**, rather than merely holding shares. Start the output with **“Strong”, “Average” or “Weak”**, followed by the promoter name/family, approximate vintage, current role/involvement and a concise assessment. **Score 0.5 for long-standing promoters with deep and demonstrable involvement in building and running the business, 0.25 for moderate vintage or involvement, and 0 for limited/short promoter history, largely passive ownership, or evidence that promoters have materially disengaged from the business.** Use primary sources such as annual reports, company history, exchange filings and credible independent sources, and present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-7 — "Vintage of the top mgmt. team in the company"
  "INDUSTRY_PROMOTER-7":
    "Assess the **vintage and stability of the company’s top management team**, focusing on the CEO/MD, CFO, COO and other key senior executives. Determine their tenure with the company, relevant prior experience, whether they have worked together for a meaningful period, and whether there is evidence of continuity, institutional knowledge and a stable leadership bench. Consider recent senior-management turnover and whether departures appear routine or indicate instability. Start the output with **“Strong”, “Average” or “Weak”**, followed by the key management names, approximate tenure and a concise assessment of management-team stability and experience. **Score 0.5 for a stable, experienced senior management team with strong institutional continuity, 0.25 for a reasonably experienced team with some turnover or limited depth, and 0 for a highly inexperienced or frequently changing senior management team indicating potential execution or governance risk.** Verify using annual reports, corporate governance disclosures, company filings and credible independent sources, and present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-8 — "Quality of second level team"
  "INDUSTRY_PROMOTER-8":
    "Assess the **quality and depth of the company’s second-level management team**, focusing on key executives immediately below the CEO/MD and promoters across functions such as operations, finance, sales, strategy, technology and other business-critical areas. Review their **qualifications, relevant industry experience, previous roles and companies, tenure with the company, functional expertise, track record of execution, and evidence of increasing responsibility**, and assess whether the company has a credible leadership bench capable of operating the business independently of the promoter/CEO. Consider management depth, succession capability and significant turnover in key second-level positions. Start the output with **“Strong”, “Average” or “Weak”**, followed by the key executives and a concise assessment of the quality and depth of the team. **Score 0.5 for a strong, experienced and demonstrably capable second-level team with good depth and succession capability, 0.25 for an adequate but mixed or relatively shallow team, and 0 for a weak, inexperienced or heavily promoter-dependent team with limited independent leadership depth.** Verify using annual reports, company disclosures, management profiles, credible media and other reliable sources, and present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-9 — "Family Dynamics - is there any fight?"
  "INDUSTRY_PROMOTER-9":
    "Assess whether there is any **material conflict or dispute among the promoter/founding family members** that could affect the company, its governance, management, ownership or capital allocation. Review credible public sources for evidence of **family disputes, litigation, shareholder conflicts, board-level disagreements, public allegations, succession disputes, ownership/control battles, resignations arising from family disagreements, or other documented friction among promoter-family members**, and assess whether any such issue is ongoing, resolved, or immaterial to the listed company. Distinguish verified facts from media speculation and do not infer conflict merely from differences in roles, ownership or business interests. Start the output with **“No Material Conflict”, “Potential/Resolved Conflict” or “Active Material Conflict”**, followed by the relevant family members and a concise description of the issue and its current status. **Score 0.5 for no evidence of a material family conflict, 0.25 for a historical/resolved or limited conflict with no meaningful current impact, and 0 for an active material family dispute that creates a governance, control, succession or business risk.** Verify using company filings, court/regulatory records, credible media and other reliable sources, and present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-10 — "Dealing with the government?"
  "INDUSTRY_PROMOTER-10":
    "Assess the company’s **relationship and dependence on government authorities and government-linked business**. Determine the extent to which the company’s revenues, orders, contracts, customers or business opportunities depend on **government contracts, tenders, PSUs, government schemes/subsidies, licences, concessions, regulatory approvals, land/allotments or other government-controlled factors**, and quantify the proportion of business materially dependent on government wherever disclosed. Separately assess the company/promoters’ regulatory track record, including **material investigations, show-cause notices, penalties, licence/approval issues, disputes with government authorities, adverse regulatory findings, or allegations of preferential treatment or undue influence**, distinguishing routine government interaction from genuine concerns. Consider the **materiality, duration and concentration of government dependence**, as well as the nature and resolution of any regulatory issues. **Do not treat government dependence itself as a governance concern where it is an inherent and legitimate feature of the company’s industry; assess whether the dependence creates material concentration, regulatory, execution, policy or governance risk relative to the nature of the business.** Start the output with **“Low”, “Moderate” or “High” Government Dependence/Concern**, followed by a concise description of government-linked business exposure, approximate revenue/order dependence where available, and any material regulatory concerns. **Score 0.5 for low government dependence and no material governance/regulatory concerns, 0.25 for moderate government dependence or minor/resolved concerns, and 0 for high government dependence and/or material ongoing governance or regulatory concerns, after considering the company’s industry context.** Verify using annual reports, investor presentations, exchange filings, government/regulatory disclosures and credible independent sources, and present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-11 — "Cases from ED, SEBI, other institutions"
  "INDUSTRY_PROMOTER-11":
    "Identify any **material cases, investigations, enforcement actions, notices, penalties or adverse proceedings involving the company, its promoters, promoter-group entities, directors or key senior management** by SEBI, ED, CBI, SFIO, RBI, Income Tax authorities, MCA, NCLT/NCLAT, Competition Commission, courts or other material regulatory/government institutions. Review primary sources including regulatory orders, court records, company disclosures and official filings, and distinguish between **allegations/investigations, show-cause notices, interim orders, final adverse orders/penalties, settlements, and cases that have been closed, dismissed, stayed or overturned**. Assess the **nature, materiality, financial impact, governance implications, status and direct relevance to the listed company**, giving greater weight to final adverse findings and serious ongoing proceedings than to unsubstantiated allegations or routine compliance matters. Start the output with **“No Material Cases”, “Minor/Resolved Cases” or “Material/Ongoing Cases”**, followed by the relevant institution, party involved, nature of the case and current status. **Score 0.5 for no material cases or only immaterial/fully resolved matters, 0.25 for minor, historical, settled or limited-impact matters, and 0 for material ongoing proceedings or adverse regulatory/court findings involving the company, promoters or key management that raise significant financial, governance, compliance or reputational concerns.** Do not treat an investigation or allegation as proof of wrongdoing; assess the evidence and current legal/regulatory status before scoring. Present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-12 — "Political connect"
  "INDUSTRY_PROMOTER-12":
    "Assess whether the company, its promoters, promoter-group entities, directors or key management have **material and verifiable political connections** with current or former politicians, political parties, government officials or individuals holding significant public office. Identify the nature of the connection (e.g., family relationship, direct political role, former senior government position, significant business relationship, board position or other documented association) and assess whether there is evidence that such connections provide **preferential access, government/business advantages, regulatory influence, or create material governance, reputational or regulatory risk**. Distinguish genuine, documented relationships from speculation, social associations or routine interactions with government officials, and do not treat political connections as inherently negative where there is no evidence of preferential treatment or material risk. Start the output with **“No Material Connect”, “Material Connect – No Clear Concern” or “Material Connect – Potential Concern”**, followed by the relevant person(s), nature of the connection and a concise assessment. **Score 0.5 for no material political connection or a documented connection with no evidence of governance/risk concerns, 0.25 for a material political connection that creates potential but unproven influence or dependency, and 0 for evidence of political influence, preferential treatment, conflicts of interest or other material governance/reputational concerns arising from the connection.** Verify using company filings, regulatory disclosures, credible media, public records and other reliable sources, and present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-13 — "Transparency on analyst calls"
  "INDUSTRY_PROMOTER-13":
    "Assess the company’s **transparency and quality of communication with analysts and investors** over the last 8 quarters. Review earnings calls, investor/analyst calls, transcripts, presentations, exchange filings and the company’s investor-relations website to determine whether management **holds calls regularly, makes call recordings/transcripts publicly available, provides adequate operating and financial disclosures, answers analyst questions directly and consistently, discusses both positive and negative developments, and provides clear explanations for material changes in performance, strategy or guidance**. Assess the consistency and completeness of information provided across quarters and identify any material instances of **evasive responses, unexplained changes in disclosures, selective disclosure, refusal to address material issues, or significant discrepancies between management commentary and reported performance**. Start the output with **“High”, “Moderate” or “Low Transparency”**, followed by a concise assessment of the company’s analyst-call practices and any material concerns. **Score 0.5 for consistently high-quality, timely and transparent communication with regular calls and adequate public disclosures, 0.25 for generally adequate but inconsistent or limited transparency, and 0 for poor transparency, repeated evasiveness/selective disclosure or material inconsistencies in management communication.** Verify using primary company disclosures and publicly available analyst-call materials, and present the findings concisely in a format suitable for a single Excel cell.",
  // INDUSTRY_PROMOTER-14 — "Shareholding pledge?"
  "INDUSTRY_PROMOTER-14":
    "Assess the company’s **promoter/promoter-group shareholding pledge** using the latest quarterly shareholding pattern and review the trend over the last 8 quarters. Determine the **percentage and value of promoter shares pledged**, whether the pledge has increased or decreased, and the stated **reason and context for the pledge**, including whether it is related to business funding, acquisitions, working capital, personal/promoter borrowings, or other purposes. Assess the materiality of the pledge relative to the promoters’ total holding, whether it is concentrated with particular promoter entities, and whether there are any indications of **financial stress, risk of invocation, margin pressure, or potential loss of promoter control**. Distinguish genuine promoter pledge from other encumbrances and do not treat a small, stable or transparently disclosed pledge as equivalent to a large or rapidly increasing pledge. Start the output with **“No Pledge”, “Low/Non-concerning Pledge” or “Material/Concerning Pledge”**, followed by the current pledged percentage, trend, stated purpose and a concise assessment. **Score 0.5 for no pledge or a low/stable pledge with a credible and non-concerning purpose, 0.25 for moderate pledge or an adequately explained but meaningful increase, and 0 for high/increasing pledge, unclear purpose, financial-stress indicators, or material risk of invocation/loss of promoter control.** Verify using stock-exchange shareholding filings, annual reports, promoter disclosures and other primary sources, and present the findings concisely in a format suitable for a single Excel cell.",
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

  return core;
}

/** True when a question has the client's bespoke methodology (vs the default). */
export const hasDetailedPrompt = (questionId: string): boolean =>
  questionId in DETAILED_PROMPTS;

/** All checklist question ids, for tests / batch prompt generation. */
export const ALL_QUESTION_IDS: string[] = GOVERNANCE_CHECKLIST.flatMap(
  (section) => section.items.map((item) => item.questionId),
);

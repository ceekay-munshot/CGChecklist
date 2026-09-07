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

// ---------------------------------------------------------------------------
// EXTENDED (in-house) prompt set — the 25 questions the client has NOT yet
// supplied a bespoke prompt for. Written in the SAME house style as the client's
// 26 (verdict-first, exact figures, an explicit 0 / 0.25 / 0.5 scoring band, one
// Excel cell), by reverse-engineering the checklist's own green/red flags and
// the gold-standard Beas reports. These are OUR drafting, NOT client-locked
// wording — intended for the client to review/approve.
//
// They are used ONLY when USE_EXTENDED_PROMPTS is switched on (see
// extendedPromptsEnabled). With the flag OFF — the default, and every path that
// doesn't set it, including the dashboard — these questions fall back to the
// generic default EXACTLY as before, so the current output is unchanged. This
// makes the set a clean A/B: run a company with the flag off (default) and on
// (extended) and compare. The client's 26 are never affected either way.
const EXTENDED_PROMPTS: Record<string, string> = {
  // BOARD-4 — "Disclosures to the remuneration paid"
  "BOARD-4":
    "Answer “Is director and KMP remuneration fully and transparently disclosed — Yes/No?” from an investment analyst-cum-forensic governance lens, testing the completeness of disclosure rather than the mere presence of a remuneration section. From the latest annual report (the Board’s Report and its Section 197(12)/Rule 5 annexure, the Corporate Governance Report, the Nomination and Remuneration Committee report and the Ind AS 24 related party note), extract for each director and key managerial person the individual break-up of salary, perquisites, commission, sitting fees, bonuses, ESOPs/RSUs granted and exercised, retiral benefits and total remuneration, together with the ratio of each director’s pay to median employee pay and the year-on-year percentage increases. Cross-check totals against the P&L managerial-remuneration line and the related party note, verify Section 197 limits (11% of net profits and the executive/non-executive sub-limits) are met or that shareholder/Central-Government approvals are disclosed, and test for opacity — commission stated only in aggregate, “as decided by the Board”, variable pay with no metrics, or KMP pay folded into one figure. Review the last three years for pay-versus-profitability trends and any proxy-advisory or shareholder objection. Start the output with “Yes”, “Partial/Needs Review” or “No”, followed by the CEO/MD total remuneration with key components, the pay-vs-profit trend and any gap. Score 0.5 where remuneration is disclosed individually and completely with figures, reconciles to the accounts and stays within limits; 0.25 where disclosure is broadly present but aggregated, partial or hard to reconcile; 0 where it is materially undisclosed, opaque, or breaches limits without approval. Verify using primary filings and present concisely for a single Excel cell.",

  // BOARD-5 — "Reputation of the directors"
  "BOARD-5":
    "Assess the reputation and track record of the company’s directors — the board as a whole and each promoter, executive and independent director individually — from an investment analyst-cum-forensic governance lens. Using annual reports, director profiles, DIN/MCA records, exchange disclosures, regulatory orders and credible public/press sources, check each director for any history of fraud, financial misstatement, default, wilful-defaulter or fugitive tags, SEBI/SFIO/ED/CBI action, disqualification under Section 164, insider-trading or governance violations, resignations citing disagreement, or association (as promoter/director) with other companies that failed, were delisted or faced serious regulatory action; and, on the positive side, for credible domain experience, prior leadership at well-regarded institutions, and a clean long-standing record. Weight final adverse findings and direct involvement far more heavily than unproven allegations or guilt-by-association, and confirm the matter attaches to a CURRENT director of this company. Start the output with “Clean/Well-regarded”, “Minor/Mixed” or “Adverse”, followed by the names and the specific basis for any concern (or confirmation of a clean, credible board). Score 0.5 for a clean, credible board with no material adverse record; 0.25 where records are largely clean but thin to verify, or a historical/minor/settled issue exists; 0 where a director carries a serious, current or unresolved adverse record (fraud, default, disqualification, major regulatory action). Do not treat an allegation as proof; assess status before scoring. Present concisely for a single Excel cell.",

  // STAKEHOLDERS-1 — "Free float in the market - high / low"
  "STAKEHOLDERS-1":
    "Determine the company’s free float from the latest shareholding pattern filed with the exchanges and judge whether it is High or Low from a liquidity, governance and price-discovery lens. Compute free float as 100% minus promoter and promoter-group holding, and separately note the split of the non-promoter float between institutions (FII/FPI, mutual funds, insurance, other DIIs) and public/retail, plus any large individual or strategic non-promoter blocks; state the exact percentages from the most recent quarter and the trend over the last 4–8 quarters. Assess whether the float is deep enough for genuine two-way liquidity and institutional participation, or so thin that it sits near the SEBI minimum-public-shareholding floor (25%) and is vulnerable to volatility or manipulation. Start the output with “High” or “Low”, followed by the free-float %, the institutional-vs-retail split and the trend. Score 0.5 for a high free float (roughly ≥35–40%) with healthy institutional presence; 0.25 for a moderate float (roughly 20–35%) or one thinning toward the minimum; 0 for a very low float (near/below 25%) with weak institutional depth. Use the latest exchange shareholding filing as the primary source and present concisely for a single Excel cell.",

  // STAKEHOLDERS-2 — "Recent entry and exit by PE Funds / HNIs"
  "STAKEHOLDERS-2":
    "Assess recent entry and exit by private-equity funds, marquee institutional investors and well-known HNIs over the last 4–8 quarters from a smart-money signalling lens. From quarterly shareholding patterns, the list of public shareholders holding >1%, bulk/block-deal disclosures and credible press, identify which reputed investors (named PE/VC funds, respected FIIs/DIIs, prominent HNIs) have entered, added, trimmed or fully exited, with approximate stake sizes and dates, and whether any anchor/pre-IPO investor is inside or exiting a lock-in. Distinguish a genuine conviction exit by a quality holder (a negative signal) from routine rebalancing, fund-life redemptions, or a promoter/strategic entry (neutral-to-positive). Start the output with “Reputed investors entering/holding”, “Mixed/Neutral” or “Quality investors exiting”, followed by the named investors, direction and size. Score 0.5 where reputed investors are entering or steadily holding; 0.25 for mixed, routine or immaterial churn, or where no notable smart-money presence exists; 0 where quality PE/HNI holders are clearly reducing or exiting in a way that signals lost conviction. Do not over-read a single small trade; corroborate before scoring. Present concisely for a single Excel cell.",

  // EMPLOYEE-1 — "Employee attrition"
  "EMPLOYEE-1":
    "Assess the company’s employee attrition over the latest three years from a talent-stability and business-quality lens. From the annual report (Board’s Report, MD&A, human-capital/ESG/BRSR sections), extract the disclosed attrition/turnover rate for each year (voluntary vs total where given), total headcount and its trend, and any commentary on attrition in critical or senior roles; where the company does not disclose a number, say so and use the closest available proxy or credible industry data rather than inventing a figure. Compare the level and trend against the company’s own history and against 2–5 closest listed peers and the sector norm, since an acceptable absolute rate differs sharply across industries (IT/BPO vs manufacturing). Start the output with “Low/In-line”, “Elevated” or “High”, followed by the latest attrition %, the three-year trend and the peer/industry comparison. Score 0.5 where attrition is at or below industry and stable/improving; 0.25 where it is somewhat above peers, rising, or not clearly disclosed; 0 where it is well above industry, sharply rising, or concentrated in senior/critical talent. Prefer the company’s own disclosures and present concisely for a single Excel cell.",

  // EMPLOYEE-2 — "Remuneration compared to industry standards"
  "EMPLOYEE-2":
    "Assess whether the company’s employee remuneration is competitive against industry standards from a talent-retention and cost lens. Using the annual report’s employee-benefit-expense note, the Section 197 median-remuneration and percentage-increase disclosures, per-employee cost (employee cost ÷ headcount) and any pay commentary, together with credible external benchmarks and 2–5 listed peers, judge whether pay is broadly competitive, below market (a flight/attrition risk), or excessive versus peers and productivity. Consider revenue/PAT per employee and the median-pay increase versus inflation and versus managerial-pay increases, and flag a wide and widening gap between KMP and median pay. Start the output with “Competitive/In-line”, “Below market” or “Excessive”, followed by per-employee cost or median pay, the peer/industry comparison and the trend. Score 0.5 where remuneration is broadly competitive and supports retention; 0.25 where it is modestly below/above peers or hard to benchmark; 0 where it is well below market (clear flight risk) or excessive relative to peers and productivity. Present concisely for a single Excel cell.",

  // EMPLOYEE-3 — "ESOP Pool"
  "EMPLOYEE-3":
    "Assess the company’s ESOP/stock-incentive pool from a talent-alignment versus dilution-and-governance lens. From the annual report (the ESOP/ESOS disclosure, the share-based-payment notes and the Board’s/NRC report), extract the total options/RSUs outstanding and granted as a percentage of expanded share capital, the exercise price versus market/fair value (i.e. depth of discount), the vesting schedule and performance conditions, the breadth of the pool (broad-based versus concentrated in promoters/KMP), and the annual dilution and share-based-payment charge. Judge whether the pool is a sensible, broad-based, fairly-priced retention tool or a governance concern — oversized, deeply discounted, promoter/KMP-concentrated, or repriced. Start the output with “Reasonable/Broad-based”, “Adequate/Needs Review” or “Concerning”, followed by the pool size as % of capital, the pricing/discount and the breadth. Score 0.5 for a reasonable, broad-based, sensibly-priced pool with modest dilution; 0.25 where it is acceptable but thin-on-detail, very small/absent, or somewhat concentrated; 0 where it is oversized, deep-discount, promoter-concentrated, or repriced in a way that transfers value from shareholders. Present concisely for a single Excel cell.",

  // STOCK_EXCHANGE-1 — "Adequate disclosures and compliance to SEBI Guidelines"
  "STOCK_EXCHANGE-1":
    "Assess the company’s disclosure quality and compliance with SEBI/LODR guidelines over the last three years from a governance and regulatory lens. Using the Corporate Governance Report and compliance certificates in the annual report, exchange records, and any SEBI/stock-exchange orders, check the LODR compliance status (Reg 17–27), the timeliness of Regulation 30 material-event disclosures, quarterly results and shareholding filings, any fines/penalties for late or non-compliant filings (Reg 30/33/34, structured digital database/insider rules), any non-compliance noted by the secretarial auditor (MR-3), trading suspensions, or SEBI show-cause/adjudication orders. Distinguish minor, cured, technical late-filing fines from substantive disclosure failures or enforcement action. Start the output with “Compliant”, “Minor lapses” or “Non-compliant”, followed by the specific fines/orders (with years and amounts) or confirmation of a clean record. Score 0.5 for timely, compliant disclosures with no material fines; 0.25 for minor, occasional or cured late-filing penalties; 0 for repeated non-compliance, material Reg 30 failures, insider/SDD lapses or SEBI enforcement action. Verify using primary filings and present concisely for a single Excel cell.",

  // STOCK_EXCHANGE-2 — "Volatility in the stock"
  "STOCK_EXCHANGE-2":
    "Assess the stock’s price volatility over the last 1–3 years from a market-quality and manipulation-risk lens, not merely as a beta number. Using exchange price/volume history, evaluate realised volatility and beta versus the benchmark and sector, the frequency of sharp unexplained single-day moves, circuit hits, and any ASM/GSM (Additional/Graded Surveillance Measure) placement, price-band changes or exchange surveillance actions. Judge whether volatility is in line with the market/sector and explained by fundamentals and float, or abnormal and operator-like (spikes without news, on thin volume). Start the output with “In-line”, “Elevated” or “Abnormal”, followed by the approximate beta/volatility read, any ASM/GSM/circuit history and the interpretation. Score 0.5 where volatility is broadly in line with the market and fundamentally explained; 0.25 where it is elevated but explainable (small-cap, low float, event-driven); 0 where moves are abnormal/operator-like or the stock sits under surveillance (ASM/GSM) for manipulation-type concerns. Present concisely for a single Excel cell.",

  // STOCK_EXCHANGE-3 — "Volume and liquidity in the stock - high / low?"
  "STOCK_EXCHANGE-3":
    "Assess trading volume and liquidity in the stock from an ease-of-entry-and-exit lens. Using exchange data, evaluate average daily traded volume and value (e.g. a 3–6 month average), the free-float turnover ratio, typical bid-ask spread and impact cost, delivery percentage, and the size of a position that could be built or exited without materially moving the price. Relate liquidity to free float and market cap, and judge whether an institutional-size position is tradeable. Start the output with “High/Adequate”, “Moderate” or “Thin/Illiquid”, followed by the average daily traded value, the impact-cost/spread read and the interpretation. Score 0.5 for adequate, consistent volume and depth supporting easy entry/exit; 0.25 for moderate or uneven liquidity that constrains larger positions; 0 for very thin, illiquid trading with wide spreads and high impact cost. Present concisely for a single Excel cell.",

  // STOCK_EXCHANGE-4 — "Covered by domestic / mnc coverage"
  "STOCK_EXCHANGE-4":
    "Assess the breadth and quality of sell-side/research coverage of the company from a transparency and market-attention lens. Identify how many and which research houses (domestic brokerages, MNC/global banks, independent research) actively cover the stock with published reports/estimates, whether coverage is by reputed independent houses versus captive/paid or none, whether the company holds regular earnings calls with analyst participation, and whether consensus estimates exist on standard platforms. Start the output with “Well-covered”, “Limited” or “No/Captive coverage”, followed by the count and names of covering houses and the nature of coverage. Score 0.5 where the company is covered by multiple reputed, independent research houses; 0.25 where coverage is limited, emerging, or a mix; 0 where there is no meaningful independent coverage or only captive/paid research. Verify using primary/credible sources and present concisely for a single Excel cell.",

  // FINANCIALS-1 — "Material red flags in notes to accounts and contingent liabilities"
  "FINANCIALS-1":
    "Review the latest annual report’s notes to accounts and contingent-liability disclosures from a forensic-accounting lens and answer whether material red flags are present. Examine, at consolidated level, the contingent-liabilities-and-commitments note (tax, legal, guarantees, and claims not acknowledged as debt) sized against net worth, PBT and cash; the related party note; unusual or large “other” balances (loans/advances/deposits, other current assets, exceptional items); revenue-recognition and receivables notes; changes in accounting policy or estimates; auditor Key Audit Matters, CARO and secretarial-audit observations; and any note referencing fraud, search/survey, ED/SEBI/IT proceedings, ICFR weaknesses, or subsequent events. Judge materiality and whether an item signals aggressive accounting or genuine risk versus routine disclosure. Start the output with “No material red flags”, “Some/Watch items” or “Material red flags”, followed by the specific note(s), sizes and page references. Score 0.5 where the notes are clean with no material red flag; 0.25 where there are watch items or moderate contingent exposures worth monitoring; 0 where a material red flag exists (large/adverse contingent liabilities, fraud, aggressive accounting, serious note-level concern). Report money in INR mn and present concisely for a single Excel cell.",

  // FINANCIALS-2 — "Debt & Advances - high / low?"
  "FINANCIALS-2":
    "Assess the company’s debt and advances from a balance-sheet-quality and diversion-risk lens over the latest three consolidated years. Extract gross and net debt, debt-to-equity and net-debt-to-EBITDA, interest coverage, and the cash position; and separately the loans, advances, deposits and other receivables the company has extended — especially to related parties, subsidiaries, promoters or unnamed third parties — sized against net worth and assessed for interest terms, purpose and recoverability. Flag high or rising leverage, and large or growing advances out (a classic route for fund diversion), particularly interest-free or related-party ones. Start the output with “Modest/Comfortable”, “Moderate” or “High/Concerning”, followed by the debt metrics, the scale of advances out and any related-party concentration. Score 0.5 for modest debt and clean, business-justified advances; 0.25 for moderate leverage or advances that warrant monitoring; 0 for high/rising debt and/or large, related-party or unexplained advances that suggest stress or diversion. Report money in INR mn and present concisely for a single Excel cell.",

  // FINANCIALS-4 — "Bankers? Top pvt/psu or not?"
  "FINANCIALS-4":
    "Identify the company’s principal bankers and lenders and assess their quality from a credibility and credit-access lens. From the annual report (the borrowings/financing notes, the corporate-information page, charges/CIN records) list the main working-capital and term lenders and the consortium lead, and classify them as top private banks, large PSU banks, MNC banks, or marginal/obscure/NBFC-only lenders. A relationship with strong, reputable banks is a soft credibility positive; reliance solely on marginal lenders, promoter-linked NBFCs, or a recent shift away from mainstream banks is a concern. Note any lender exit, facility downgrade, or SMA/NPA/wilful-defaulter tag. Start the output with “Top-tier bankers”, “Mixed” or “Weak/Marginal”, followed by the named principal lenders and any concern. Score 0.5 for top private/PSU/MNC bankers with clean standing; 0.25 for a mixed or mid-tier lender profile; 0 for reliance on marginal/obscure lenders, promoter-linked NBFCs, or evidence of lender stress. Present concisely for a single Excel cell.",

  // FINANCIALS-6 — "Cash EPS vs Accounting EPS - Low or high"
  "FINANCIALS-6":
    "Assess earnings quality by comparing cash EPS with accounting EPS over the latest three consolidated years from a forensic lens. Compute accounting EPS (PAT ÷ shares) and cash EPS ((PAT + depreciation/amortisation and major non-cash charges) ÷ shares), and — more tellingly — compare cash flow from operations against reported PAT/EBITDA to see whether accounting profits convert into cash. Cash EPS at or above accounting EPS with healthy CFO/PAT indicates clean earnings; cash EPS materially below, or CFO persistently lagging PAT, points to accruals-heavy or lower-quality earnings. State the figures per year and the trend. Start the output with “High quality (cash ≥ accounting)”, “Adequate” or “Low quality (cash < accounting)”, followed by the cash-vs-accounting EPS and the CFO/PAT read. Score 0.5 where cash EPS is close to or above accounting EPS and cash conversion is strong; 0.25 where they are broadly aligned but conversion is uneven; 0 where cash EPS is materially below accounting EPS or CFO persistently trails reported profit. Report figures in INR and present concisely for a single Excel cell.",

  // FINANCIALS-7 — "Disclosure on all related party transaction"
  "FINANCIALS-7":
    "Answer “Are all related-party transactions disclosed and conducted at arm’s length — Yes/No?” from a forensic-governance lens. From the Ind AS 24 related party note, Form AOC-2, the audit-committee/RPT-policy disclosures and the half-yearly RPT filings, tabulate the material related parties and the nature and value of transactions (sales, purchases, loans/advances/guarantees, royalty, brand/management fees, rent, remuneration), sized against revenue, net worth and profit. Test whether transactions are disclosed completely and consistently across the report, whether they are on arm’s-length terms and in the ordinary course, whether material RPTs had audit-committee and (where required) shareholder approval, and whether value is being routed to promoters/promoter-group entities (royalty, advances, purchases) in a way that leaks value from minority holders. Start the output with “Yes — disclosed & arm’s length”, “Partial/Needs Review” or “No — inadequate/concerning”, followed by the key RPTs, their scale and any promoter-routed concern. Score 0.5 where RPTs are fully disclosed, approved and arm’s length; 0.25 where disclosure is present but thin, or RPTs are material and warrant monitoring; 0 where RPTs are undisclosed/inconsistent, non-arm’s-length, or large promoter-routed value transfers exist. Report money in INR mn and present concisely for a single Excel cell.",

  // FINANCIALS-8 — "CFO / EBITDA"
  "FINANCIALS-8":
    "Assess cash conversion by computing the ratio of cash flow from operations to EBITDA for each of the latest three consolidated years from an earnings-quality lens. Take CFO from the cash-flow statement and EBITDA as operating profit plus depreciation/amortisation (state the basis), compute CFO/EBITDA per year and the three-year average, and explain deviations by reference to working-capital movements, non-operating items and one-offs. Sustained CFO/EBITDA around 0.6–0.8+ signals healthy conversion; a low or falling ratio signals working-capital leakage, aggressive revenue recognition or poor-quality earnings. Compare to 2–5 peers where useful. Start the output with “Strong”, “Adequate” or “Weak”, followed by the per-year CFO/EBITDA ratios and the trend/driver. Score 0.5 for CFO/EBITDA sustainably at/above ~0.6–0.7; 0.25 for a moderate (~0.4–0.6) or uneven ratio; 0 for CFO/EBITDA persistently below ~0.4 or sharply deteriorating. Present concisely for a single Excel cell.",

  // FINANCIALS-9 — "Provisioning"
  "FINANCIALS-9":
    "Assess the adequacy and conservatism of the company’s provisioning from a forensic-accounting lens over the latest three years. Review the expected-credit-loss/doubtful-debt provision against gross and aged receivables; inventory write-downs against slow-moving/obsolete stock; provisions for warranties, litigation, and impairment of investments/goodwill/loans; and any large provision reversals/write-backs that flatter profit. Assess whether coverage is conservative and consistent, or thin, declining, or subject to convenient write-backs; cross-check against receivables ageing, auditor KAMs and CARO. Start the output with “Conservative/Adequate”, “Watch” or “Under-provisioned”, followed by the key coverage figures and any write-back/trend concern. Score 0.5 for conservative, adequate and consistent provisioning; 0.25 where coverage is acceptable but thinning or hard to assess; 0 where provisioning appears inadequate, is falling against rising risk, or profit is propped by suspicious write-backs. Report money in INR mn and present concisely for a single Excel cell.",

  // FINANCIALS-10 — "Fluctuating depreciation rates"
  "FINANCIALS-10":
    "Examine the company’s depreciation and amortisation policy over the latest three years from a forensic-accounting lens, looking for earnings management via useful-life or method changes. From the accounting-policy and fixed-asset notes, extract the useful lives/rates by asset class (versus Schedule II), the method (SLM/WDV), depreciation as a percentage of gross block and of revenue, and any change in useful life, residual value, componentisation or method — noting the P&L impact of any such change. Fluctuating or extended useful lives, a switch that lowers the charge, or depreciation falling as gross block rises are red flags that policy is being used to boost profit. Start the output with “Stable/Consistent”, “Minor changes” or “Concerning changes”, followed by the depreciation trend and any policy change with its profit impact. Score 0.5 for a stable, consistent policy in line with Schedule II; 0.25 for minor/explained changes; 0 where useful lives were extended or the method changed in a way that materially and conveniently boosted profit. Present concisely for a single Excel cell.",

  // FINANCIALS-11 — "Other noteable red flags"
  "FINANCIALS-11":
    "Scan the full financial statements and disclosures for any OTHER notable governance or forensic red flags not captured by the other checklist items, from a skeptical analyst lens. Consider: frequent auditor/CFO/KMP churn; qualified ICFR or going-concern references; large “other income” or exceptional items propping profit; expenses capitalised or intangibles/goodwill building without cash backing; circular funding, unusual subsidiary/JV structures, or off-balance-sheet exposures; pledged promoter shares or inter-corporate deposits; frequent equity dilution or preferential allotments to related parties; restatements, delayed results, or exchange clarifications; and any qualitative note (search/survey, whistleblower, fraud) suggesting risk. Start the output with “No other red flags”, “Watch items” or “Red flags present”, followed by the specific item(s) and page references. Score 0.5 where nothing further of concern is found; 0.25 for moderate watch items worth monitoring; 0 where a genuine additional red flag is identified. Do not manufacture concerns from routine disclosure; corroborate before scoring. Present concisely for a single Excel cell.",

  // FINANCIALS-12 — "Working capital cycle"
  "FINANCIALS-12":
    "Assess the working-capital cycle over the latest three consolidated years from a cash-efficiency and stress lens. Compute inventory days, receivable days and payable days, and the resulting net working-capital (cash conversion) cycle for each year, plus working capital as a percentage of sales, and relate the trend to revenue growth. A stable or improving cycle is healthy; working capital rising faster than sales, lengthening receivables/inventory, or stretched payables masking strain are warning signs of channel-stuffing, weak collections or liquidity stress. Compare to 2–5 peers where useful. Start the output with “Stable/Improving”, “Watch” or “Deteriorating”, followed by the cycle in days, the three-year trend and the driver. Score 0.5 for a stable or improving cycle broadly in line with sales; 0.25 for a moderately lengthening or volatile cycle; 0 where working capital is rising materially faster than sales or the cycle is clearly deteriorating. Present concisely for a single Excel cell.",

  // FINANCIALS-13 — "Are auditor fees transparently disclosed?"
  "FINANCIALS-13":
    "Answer “Are auditor fees transparently disclosed with a break-up — Yes/No?” from a governance-transparency lens (distinct from whether the fee level is high or low). From the auditor-remuneration note and the related party/other-expense notes, check whether total payments to the statutory auditor and its network firms are disclosed with a break-up into statutory audit, tax audit, limited review, certification/other services and reimbursements, and whether non-audit/other-services fees are separately visible (a key independence signal). Transparent, broken-out disclosure scores well; a single aggregate figure, missing non-audit fees, or fees buried in “other expenses” is a concern. Start the output with “Yes — transparent”, “Partial” or “No — opaque”, followed by the total fee, the break-up (especially audit vs non-audit) and any gap. Score 0.5 where fees are fully disclosed with a clear break-up including non-audit services; 0.25 where disclosed only in aggregate or with a partial break-up; 0 where auditor fees are not transparently disclosed. Report money in INR mn and present concisely for a single Excel cell.",

  // FINANCIALS-14 — "Is asset growth significantly outpacing revenue growth?"
  "FINANCIALS-14":
    "Assess whether asset growth is significantly outpacing revenue growth over the latest three consolidated years from a capital-efficiency and forensic lens. Compute the growth rates (YoY and 3-year CAGR) of total assets, gross block/CWIP, and key asset lines (receivables, inventory, loans & advances, intangibles/goodwill) against revenue growth, and track asset turnover (revenue ÷ total assets) over the period. Assets ballooning faster than sales — especially via CWIP that never commissions, rising receivables/advances, or acquired goodwill — can signal over-capitalisation, poor returns, or inflated/parked assets. Start the output with “In-line”, “Watch” or “Assets outpacing revenue”, followed by the asset-vs-revenue growth rates, the asset-turnover trend and the driver. Score 0.5 where asset growth is broadly in line with revenue and asset turnover is stable/improving; 0.25 for a moderate divergence worth monitoring; 0 where assets are growing materially faster than revenue with falling turnover or suspect asset build-up. Present concisely for a single Excel cell.",

  // FINANCIALS-15 — "Are contingent liabilities greater than 20x net worth?"
  "FINANCIALS-15":
    "Answer “Are contingent liabilities greater than 20x net worth?” as a specific solvency-tail-risk test, at consolidated level, from a forensic lens. From the contingent-liabilities-and-commitments note, total the contingent liabilities (claims not acknowledged as debt, tax/legal disputes, guarantees, LCs and other commitments), state net worth (equity attributable to owners), and compute the ratio of contingent liabilities to net worth; also express the material items against PBT and cash for context, and assess the likelihood and age of the largest items rather than treating all as equally probable. The 20x threshold is an extreme-risk marker; most companies sit far below it. Start the output with “Well below 20x”, “Elevated” or “Above 20x / material”, followed by the total contingent liabilities, net worth and the multiple. Score 0.5 where contingent liabilities are well below 20x net worth and largely routine; 0.25 where they are elevated (a meaningful multiple of net worth) or dominated by uncertain items worth monitoring; 0 where they exceed 20x net worth, or are otherwise so large/adverse-probable versus net worth as to threaten solvency. Report money in INR mn and present concisely for a single Excel cell.",

  // FINANCIALS-16 — "Is provisioning coverage below industry norms or falling?"
  "FINANCIALS-16":
    "Answer “Is provisioning coverage below industry norms or falling?” from a forensic-accounting lens over the latest three years. Define the relevant coverage for the business — for lenders/NBFCs the provision/GNPA coverage ratio and stage-wise ECL; for others the doubtful-debt provision against aged/>6-month receivables and any inventory/impairment provisioning — and compute it for each year, then compare the level and trend against 2–5 closest peers and the sector norm. Falling coverage against rising gross NPAs/aged receivables, or coverage visibly below peers, flags under-provisioning that flatters current profit and stores future losses. Start the output with “Adequate/Above norms”, “Watch” or “Below norms/Falling”, followed by the coverage ratio, its trend and the peer comparison. Score 0.5 where coverage is adequate and stable/rising versus peers; 0.25 where it is acceptable but slipping or slightly below peers; 0 where coverage is clearly below industry norms or falling against rising risk. Report ratios/figures clearly and present concisely for a single Excel cell.",
};

/**
 * Whether the in-house EXTENDED prompt set is switched on. OFF by default and
 * for any path that doesn't set the env var (including the dashboard), so the
 * default output is unchanged. Turn on for an analyze run with
 * USE_EXTENDED_PROMPTS=1 (also accepts true/yes/on) to A/B the 25 against the
 * generic default.
 */
export function extendedPromptsEnabled(): boolean {
  const v = (process.env.USE_EXTENDED_PROMPTS ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** True when a question has an in-house EXTENDED prompt (the not-yet-client 25). */
export const hasExtendedPrompt = (questionId: string): boolean =>
  questionId in EXTENDED_PROMPTS;

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
  // The client's 26 bespoke prompts always win. When the in-house EXTENDED set
  // is switched on (USE_EXTENDED_PROMPTS), the remaining 25 questions use our
  // drafted methodology instead of the generic default; with the flag off they
  // fall back to the default EXACTLY as before. The 26 are never affected.
  const detailed =
    DETAILED_PROMPTS[questionId] ??
    (extendedPromptsEnabled() ? EXTENDED_PROMPTS[questionId] : undefined);
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

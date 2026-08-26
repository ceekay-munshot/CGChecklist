export type GovernanceScoreValue = 0 | 1 | 2;

export type GovernanceConfidence = "High" | "Medium" | "Low";

export type GovernanceResponse =
  | "Yes"
  | "No"
  | "Good"
  | "Average"
  | "Poor"
  | "High"
  | "Moderate"
  | "Low"
  | "Above"
  | "Below"
  | "Increasing"
  | "Decreasing"
  | "Stable"
  | "Debt < Advances"
  | "Debt > Advances"
  | "Cash > Accounting"
  | "Cash < Accounting"
  // Sentiment verdicts derived from the polarity-aware score (munsChatService).
  | "Positive"
  | "Neutral"
  | "Negative"
  | "Unclear"
  | "Not retrieved";

export type GovernanceSectionId =
  | "BOARD"
  | "AUDIT"
  | "STAKEHOLDERS"
  | "EMPLOYEE"
  | "INDUSTRY_PROMOTER"
  | "STOCK_EXCHANGE"
  | "OTHER_REGULATORY"
  | "FINANCIALS";

/**
 * Where the PRIMARY answer for an item should come from. Drives engine routing
 * (ported from cgchecklist2.0's evidence strategy): `financials` items are
 * computed deterministically from the financial statements / Screener data,
 * `annual_report` items are extracted from harvested filings/concalls with a
 * citation, `exchange` items come from shareholding/exchange disclosures, and
 * `web` items are the ones MUNS backfill / web research answers.
 */
export type GovernanceSourceHint =
  | "financials"
  | "annual_report"
  | "exchange"
  | "web";

export interface GovernanceChecklistItem {
  questionId: string;
  particulars: string;
  /** Expected answer shape, e.g. "% independent", "Yes/No", "D/E ratio". */
  outputFormat: string;
  /** Natural-language condition that earns full marks (green band). */
  greenFlag: string;
  /** Natural-language condition that is a governance concern (red band). */
  redFlag: string;
  /** Primary source class the engine should answer this item from. */
  sourceHint: GovernanceSourceHint;
}

export interface GovernanceChecklistSection {
  sectionId: GovernanceSectionId;
  title: string;
  items: GovernanceChecklistItem[];
}

export interface GovernanceRow {
  sectionId: GovernanceSectionId;
  questionId: string;
  particulars: string;
  response: GovernanceResponse;
  score: GovernanceScoreValue;
  maxScore: 2;
  remarks: string;
  source: string;
  confidence: GovernanceConfidence;
}

export type GovernanceRating = "Strong" | "Good" | "Moderate" | "Weak";

export interface GovernanceSectionSummary {
  sectionId: GovernanceSectionId;
  title: string;
  score: number;
  maxScore: number;
  scorePercent: number;
  rating: GovernanceRating;
  redFlags: number;
  lowConfidence: number;
}

export interface GovernanceTotals {
  totalScore: number;
  totalMaxScore: number;
  overallScorePercent: number;
  rating: GovernanceRating;
  redFlagRows: number;
  lowConfidenceRows: number;
  rowCount: number;
}

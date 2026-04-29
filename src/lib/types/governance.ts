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
  | "Cash < Accounting";

export type GovernanceSectionId =
  | "BOARD"
  | "AUDIT"
  | "STAKEHOLDERS"
  | "EMPLOYEE"
  | "INDUSTRY_PROMOTER"
  | "STOCK_EXCHANGE"
  | "OTHER_REGULATORY"
  | "FINANCIALS";

export interface GovernanceChecklistItem {
  questionId: string;
  particulars: string;
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

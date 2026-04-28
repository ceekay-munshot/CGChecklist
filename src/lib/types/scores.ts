export type Verdict = "good" | "warn" | "risk" | "unknown";

export interface ScoreSummary {
  value: number | null;
  verdict: Verdict;
  label: string;
  description: string;
}

export interface GovernanceCheckpoint {
  id: string;
  category:
    | "board"
    | "audit"
    | "disclosures"
    | "related-parties"
    | "capital-allocation";
  question: string;
  weight: number;
  answer: "yes" | "no" | "partial" | null;
  evidenceUrl: string | null;
  note: string | null;
}

export interface GovernanceScore {
  summary: ScoreSummary;
  checkpoints: GovernanceCheckpoint[];
}

export interface BeneishVariable {
  id:
    | "DSRI"
    | "GMI"
    | "AQI"
    | "SGI"
    | "DEPI"
    | "SGAI"
    | "LVGI"
    | "TATA";
  label: string;
  description: string;
  value: number | null;
  contribution: number | null;
}

export interface BeneishScore {
  summary: ScoreSummary;
  variables: BeneishVariable[];
}

export type AltmanVariant = "original" | "private" | "non-manufacturing" | "emerging-markets";

export interface AltmanRatio {
  id: "X1" | "X2" | "X3" | "X4" | "X5";
  label: string;
  description: string;
  value: number | null;
  weight: number;
  contribution: number | null;
}

export interface AltmanScore {
  summary: ScoreSummary;
  variant: AltmanVariant;
  ratios: AltmanRatio[];
}

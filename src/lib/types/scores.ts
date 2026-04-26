/**
 * Score types used by the three modules.
 * All numeric fields stay nullable to make missing-data states explicit.
 */

export type RiskBand = "good" | "caution" | "risk" | "unknown";

export type ScoreSummary = {
  band: RiskBand;
  /** Score value normalised for the relevant module (0–100, signed M-score, Z-score). */
  value: number | null;
  /** Short label rendered next to the value (e.g. "Safe", "Grey", "Distress"). */
  label: string;
  /** Free-form blurb explaining the score in one sentence. */
  rationale: string;
};

export type GovernanceCheckpoint = {
  id: string;
  category: string;
  question: string;
  status: "pass" | "warn" | "fail" | "na";
  weight: number;
  evidence: string | null;
};

export type GovernanceModule = {
  summary: ScoreSummary;
  checkpoints: GovernanceCheckpoint[];
};

export type BeneishComponent = {
  key: string;
  label: string;
  value: number | null;
  contribution: number | null;
  notes?: string;
};

export type BeneishModule = {
  summary: ScoreSummary;
  components: BeneishComponent[];
};

export type AltmanComponent = {
  key: string;
  label: string;
  value: number | null;
  weight: number;
  weighted: number | null;
  notes?: string;
};

export type AltmanModule = {
  summary: ScoreSummary;
  variant: "manufacturing" | "non-manufacturing" | "emerging-market";
  components: AltmanComponent[];
};

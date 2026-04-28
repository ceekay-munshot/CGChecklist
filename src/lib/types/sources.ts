export type SourceKind =
  | "screener"
  | "annual-report"
  | "exchange-filing"
  | "investor-relations"
  | "press-release"
  | "regulatory-filing"
  | "other";

export interface SourceRef {
  kind: SourceKind;
  label: string;
  url: string | null;
  retrievedAt: string | null;
  trust: "primary" | "secondary" | "tertiary";
}

export interface DataQualityFlag {
  id: string;
  severity: "info" | "warn" | "risk";
  message: string;
  affects: ("governance" | "beneish" | "altman")[];
}

export interface DataQualityReport {
  completeness: number;
  flags: DataQualityFlag[];
  sources: SourceRef[];
}

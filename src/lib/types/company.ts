export type ExchangeCode =
  | "NSE"
  | "BSE"
  | "NYSE"
  | "NASDAQ"
  | "LSE"
  | "HKEX"
  | "TSE"
  | "ASX"
  | "OTHER";

export type CountryCode =
  | "IN"
  | "US"
  | "GB"
  | "HK"
  | "JP"
  | "AU"
  | "SG"
  | "OTHER";

export interface Exchange {
  code: ExchangeCode;
  label: string;
  country: CountryCode;
}

export interface Country {
  code: CountryCode;
  label: string;
}

export interface CompanyIdentity {
  name: string;
  ticker: string;
  exchange: ExchangeCode | "";
  country: CountryCode | "";
}

export type DataStatus =
  | "idle"
  | "loading"
  | "partial"
  | "ready"
  | "error";

export type RefreshOutcome = "success" | "error";

export interface RefreshProgress {
  startedAt: number | null;
  finishedAt: number | null;
  outcome: RefreshOutcome | null;
  diff: import("@/lib/refresh/diffMuns").MunsDiff | null;
  error: string | null;
}

export type DataSource = "cache" | "live" | null;

export interface CompanyState {
  identity: CompanyIdentity;
  status: DataStatus;
  lastRefreshedAt: string | null;
  message: string | null;
  munsRaw: string;
  munsError: string | null;
  progress: RefreshProgress;
  // Final governance output (from cache or a live run) and its verification.
  governanceRows: import("@/lib/types/governance").GovernanceRow[] | null;
  verification: import("@/lib/verify/mergeResults").VerificationMap;
  dataSource: DataSource;
  storedAt: string | null;
  verifying: boolean;
  // Live pipeline log lines shown on the progress screen during a run.
  logs: string[];
}

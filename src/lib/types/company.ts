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

/** A single streamed step shown in the live activity log. */
export interface LiveProgressItem {
  chain: "A" | "B";
  label: string;
  ok: boolean;
  error?: string;
}

/** Real-time run progress streamed from the server. */
export interface LiveProgress {
  completed: number;
  total: number;
  failed: number;
  /** Most recent steps, newest first (capped). */
  log: LiveProgressItem[];
}

export interface RefreshProgress {
  startedAt: number | null;
  finishedAt: number | null;
  outcome: RefreshOutcome | null;
  diff: import("@/lib/refresh/diffMuns").MunsDiff | null;
  error: string | null;
  /** True when the most recent run was cancelled by the user. */
  cancelled: boolean;
  /** Live streaming progress, populated while a fresh run is in flight. */
  live: LiveProgress | null;
}

/** Metadata for a loaded source-first engine report (from KV). */
export interface EngineReportMeta {
  ticker: string;
  company: string;
  total: number;
  max: number;
  storedAt: string | null;
  harvestNote: string | null;
}

export interface CompanyState {
  identity: CompanyIdentity;
  status: DataStatus;
  lastRefreshedAt: string | null;
  message: string | null;
  munsRaw: string;
  munsError: string | null;
  progress: RefreshProgress;
  /**
   * Rows from the source-first engine (GitHub Actions → KV), if a report exists
   * for the selected company. Preferred over the MUNS render path when present.
   */
  engineRows: import("@/lib/types/governance").GovernanceRow[] | null;
  engineMeta: EngineReportMeta | null;
}

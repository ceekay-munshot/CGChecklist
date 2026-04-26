/**
 * Domain types describing the company being analysed.
 * Kept independent of UI/state so calculation modules can import them
 * without pulling React.
 */

export type Exchange = {
  code: string;
  label: string;
  countryCode: string;
};

export type Country = {
  code: string;
  label: string;
};

export type CompanyQuery = {
  name: string;
  ticker: string;
  exchangeCode: string;
  countryCode: string;
};

export type ResolvedCompany = {
  query: CompanyQuery;
  /** Canonical identifier resolved by the company-resolver service. */
  id: string | null;
  /** ISO timestamp of the most recent successful refresh. */
  lastRefreshedAt: string | null;
};

export type DataStatus =
  | "idle"
  | "loading"
  | "ready"
  | "partial"
  | "stale"
  | "error";

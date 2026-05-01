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

export interface CompanyState {
  identity: CompanyIdentity;
  status: DataStatus;
  lastRefreshedAt: string | null;
  message: string | null;
  munsRaw: string;
  munsError: string | null;
}

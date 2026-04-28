import type { CompanyIdentity } from "@/lib/types/company";

export interface ExchangeFilingSnapshot {
  filingType: string;
  filingDate: string;
  fields: Record<string, number | string | null>;
}

export async function fetchFromExchangeFiling(
  _company: CompanyIdentity,
): Promise<ExchangeFilingSnapshot> {
  throw new Error(
    "fetchFromExchangeFiling is not implemented yet. It will run server-side and pull NSE / BSE / SEC / equivalent filings via Firecrawl.",
  );
}

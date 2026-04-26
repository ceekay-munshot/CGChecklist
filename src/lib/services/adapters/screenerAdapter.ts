import type { ResolvedCompany } from "@/lib/types/company";

/**
 * Screener.in adapter — placeholder.
 *
 * First-pass source for Indian listed companies. Will pull:
 *  - Profit & loss, balance sheet, cash flow (10y where available)
 *  - Shareholding pattern + promoter pledging
 *  - Key ratios used by Beneish + Altman
 *  - Annual report links (used as a hop into the annualReportAdapter)
 *
 * The actual fetch happens server-side through Firecrawl. This module
 * only defines the contract the calculation layer will consume.
 */
export type ScreenerSnapshot = {
  source: "screener";
  /** Years available, oldest first. */
  years: number[];
  /** Reserved for future structured data. */
  raw: Record<string, unknown> | null;
};

export async function fetchFromScreener(
  _company: ResolvedCompany
): Promise<ScreenerSnapshot> {
  return {
    source: "screener",
    years: [],
    raw: null,
  };
}

import type { ResolvedCompany } from "@/lib/types/company";

/**
 * Exchange filing adapter — placeholder.
 *
 * Pulls disclosures filed directly with the exchange:
 *  - BSE/NSE corporate announcements + outcomes of board meetings
 *  - SEBI Reg 30 disclosures
 *  - SEC 10-K / 10-Q / 8-K equivalents for non-Indian companies
 *
 * Used to flag governance events that don't appear in the annual report
 * (resignations, auditor changes, regulatory actions).
 */
export type ExchangeFilingSnapshot = {
  source: "exchange-filing";
  filings: Array<{
    title: string;
    filedAt: string;
    url: string;
  }>;
};

export async function fetchExchangeFilings(
  _company: ResolvedCompany
): Promise<ExchangeFilingSnapshot> {
  return {
    source: "exchange-filing",
    filings: [],
  };
}

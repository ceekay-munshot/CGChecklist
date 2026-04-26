import type { ResolvedCompany } from "@/lib/types/company";

/**
 * Annual report adapter — placeholder.
 *
 * Pulls structured fields out of the annual report PDF (or HTML where
 * available). Used for governance signals that filings don't surface:
 *  - Board composition + independence
 *  - Audit committee composition
 *  - Related party transactions
 *  - Auditor tenure / qualifications
 *  - Subsidiary structure
 *
 * Implementation will run server-side via Firecrawl + a parsing step.
 */
export type AnnualReportSnapshot = {
  source: "annual-report";
  fiscalYear: number | null;
  raw: Record<string, unknown> | null;
};

export async function fetchFromAnnualReport(
  _company: ResolvedCompany
): Promise<AnnualReportSnapshot> {
  return {
    source: "annual-report",
    fiscalYear: null,
    raw: null,
  };
}

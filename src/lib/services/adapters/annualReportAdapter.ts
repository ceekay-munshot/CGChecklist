import type { CompanyIdentity } from "@/lib/types/company";

export interface AnnualReportSnapshot {
  fiscalYear: string;
  fields: Record<string, number | string | null>;
}

export async function fetchFromAnnualReport(
  _company: CompanyIdentity,
): Promise<AnnualReportSnapshot> {
  throw new Error(
    "fetchFromAnnualReport is not implemented yet. It will run server-side and parse PDFs / IR pages via Firecrawl.",
  );
}

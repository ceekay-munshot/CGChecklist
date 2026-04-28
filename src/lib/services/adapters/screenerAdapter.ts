import type { CompanyIdentity } from "@/lib/types/company";

export interface ScreenerSnapshot {
  ticker: string;
  fields: Record<string, number | string | null>;
}

export async function fetchFromScreener(
  _company: CompanyIdentity,
): Promise<ScreenerSnapshot> {
  throw new Error(
    "fetchFromScreener is not implemented yet. It will run server-side and use Firecrawl to read screener.in pages for Indian listed companies.",
  );
}

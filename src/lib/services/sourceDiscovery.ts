import type { ResolvedCompany } from "@/lib/types/company";
import type { SourcePack } from "@/lib/types/sources";

/**
 * Source discovery — placeholder.
 *
 * Future responsibilities:
 *  - Given a resolved company, find candidate sources in priority order:
 *      1. Screener.in (Indian listed companies)
 *      2. Annual reports (PDF)
 *      3. Exchange filings (BSE/NSE/SEC/LSE)
 *      4. Corporate IR pages
 *  - Discovery itself runs server-side via Firecrawl from the API routes.
 *  - Return a SourcePack with confidence scores so adapters can decide
 *    whether to use a source or fall back.
 */
export async function discoverSources(
  _company: ResolvedCompany
): Promise<SourcePack> {
  return {
    resolvedAt: new Date().toISOString(),
    sources: [],
  };
}

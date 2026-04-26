import type { CompanyQuery, ResolvedCompany } from "@/lib/types/company";

/**
 * Company resolver — placeholder.
 *
 * Future responsibilities:
 *  - Normalise the user-entered name + ticker + exchange + country.
 *  - Cross-check against canonical registries (BSE/NSE master, SEC EDGAR,
 *    LSE issuer list, etc.) and pick the highest-confidence match.
 *  - Return a stable canonical id so downstream adapters can cache.
 *
 * For now this just echoes the query back with a null id so the rest of
 * the app can be developed end-to-end without any network calls.
 */
export async function resolveCompany(
  query: CompanyQuery
): Promise<ResolvedCompany> {
  return {
    query,
    id: null,
    lastRefreshedAt: null,
  };
}

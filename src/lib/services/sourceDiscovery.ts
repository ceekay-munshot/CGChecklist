import type { CompanyIdentity } from "@/lib/types/company";
import type { SourceRef } from "@/lib/types/sources";

export async function discoverSources(
  _company: CompanyIdentity,
): Promise<SourceRef[]> {
  throw new Error(
    "discoverSources is not implemented yet. It will return Screener / annual report / exchange filing URLs from a server-side discovery layer.",
  );
}

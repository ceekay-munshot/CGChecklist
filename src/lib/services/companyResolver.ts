import type { CompanyIdentity } from "@/lib/types/company";

export interface ResolvedCompany {
  identity: CompanyIdentity;
  canonicalName: string;
  isin: string | null;
  cin: string | null;
  sector: string | null;
  industry: string | null;
}

export async function resolveCompany(
  _input: CompanyIdentity,
): Promise<ResolvedCompany | null> {
  throw new Error(
    "resolveCompany is not implemented yet. It will be wired to a server-side resolver in a future step.",
  );
}

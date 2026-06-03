import { NextResponse } from "next/server";
import { getCompanyCache } from "@/lib/verify/store";
import type { CompanyCacheResponse } from "@/lib/verify/types";

export const dynamic = "force-dynamic";

// Cache-first lookup for a company's final (MUNS + verified) governance output.
// Returns the stored copy if a run landed within the last 15 days, else
// { fromCache: false } so the dashboard knows to run the full pipeline.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ticker = params.get("ticker")?.trim();

  if (!ticker) {
    return NextResponse.json(
      { fromCache: false, error: "ticker query parameter is required." },
      { status: 400 },
    );
  }

  const cached = await getCompanyCache(ticker);
  if (!cached) {
    const miss: CompanyCacheResponse = { fromCache: false };
    return NextResponse.json(miss);
  }

  const hit: CompanyCacheResponse = {
    fromCache: true,
    storedAt: cached.storedAt,
    company: cached.company,
    rows: cached.rows,
    results: cached.results,
  };
  return NextResponse.json(hit);
}

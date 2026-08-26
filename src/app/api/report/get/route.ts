import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getMunsKv, getReport, reportCacheKey } from "@/lib/munsCache";
import { resolveCountry } from "@/lib/munsConfig";

// Reads live KV, so never statically optimize.
export const dynamic = "force-dynamic";

/**
 * Return the source-first engine report (GovernanceRow[]) for a ticker, if the
 * GitHub Actions engine has ingested one into KV under `report:<COUNTRY>:<TICKER>`.
 * A miss returns `{ ok: true, found: false }` so the client can fall back to the
 * legacy MUNS render path.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker")?.trim();
  if (!ticker) {
    return NextResponse.json(
      { ok: false, error: "ticker is required." },
      { status: 400 },
    );
  }
  const country = resolveCountry(url.searchParams.get("country"));

  let kv = null;
  try {
    const bindings = getCloudflareContext().env as Record<string, unknown>;
    kv = getMunsKv((bindings.MUNS_RUNS as never) ?? null);
  } catch {
    kv = getMunsKv(null);
  }

  const report = await getReport(reportCacheKey({ ticker, country }), kv);
  if (!report) {
    return NextResponse.json({ ok: true, found: false });
  }

  return NextResponse.json({
    ok: true,
    found: true,
    ticker: report.ticker,
    company: report.company,
    country,
    total: report.total,
    max: report.max,
    rows: report.rows,
    harvestNote: report.harvestNote ?? null,
    storedAt: new Date(report.storedAt).toISOString(),
  });
}

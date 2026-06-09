import { NextResponse } from "next/server";
import { MUNS_API_BASE, GOVERNANCE_AGENT_UUID } from "@/lib/munsConfig";
import { getCachedRun, putCachedRun, runCacheKey } from "@/lib/munsCache";

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  IN: "INDIA",
  US: "UNITED STATES",
  GB: "UNITED KINGDOM",
  HK: "HONG KONG",
  JP: "JAPAN",
  AU: "AUSTRALIA",
  SG: "SINGAPORE",
};

const resolveCountry = (country?: string): string => {
  if (!country) return "INDIA";
  return COUNTRY_CODE_TO_NAME[country] || country.toUpperCase();
};

interface RunRequest {
  ticker?: string;
  companyName?: string;
  country?: string;
  /** When true, bypass the cached run and force a fresh model run. */
  force?: boolean;
}

export async function POST(request: Request) {
  let body: RunRequest;
  try {
    body = (await request.json()) as RunRequest;
  } catch {
    return NextResponse.json(
      { ok: false, raw: "", error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const ticker = body.ticker?.trim();
  const companyName = body.companyName?.trim();
  if (!ticker || !companyName) {
    return NextResponse.json(
      {
        ok: false,
        raw: "",
        error: "Ticker and company name are required to run analysis.",
      },
      { status: 400 },
    );
  }

  const country = resolveCountry(body.country);
  const cacheKey = runCacheKey({ ticker, country });

  // Serve a stored run if we produced one for this ticker within the last
  // month — no need to re-run the model. A forced run skips this and
  // regenerates the analysis as of today.
  if (!body.force) {
    const cached = await getCachedRun(cacheKey);
    if (cached) {
      return NextResponse.json({
        ok: true,
        raw: cached.raw,
        cached: true,
        cachedAt: new Date(cached.storedAt).toISOString(),
      });
    }
  }

  const token = process.env.MUNS_BEARER_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, raw: "", error: "MUNS_BEARER_TOKEN not configured." },
      { status: 500 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    agent_library_id: GOVERNANCE_AGENT_UUID,
    user_index: 124,
    metadata: {
      stock_ticker: ticker.toUpperCase(),
      stock_company_name: companyName,
      context_company_name: companyName,
      stock_country: country,
      to_date: today,
      timezone: "UTC",
    },
  };

  try {
    const upstream = await fetch(`${MUNS_API_BASE}/agents/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await upstream.text();

    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          raw,
          error: `MUNS request failed with status ${upstream.status}.`,
        },
        { status: 502 },
      );
    }

    // Persist the fresh run so subsequent requests within a month are served
    // from KV instead of re-running the model.
    await putCachedRun(cacheKey, raw);

    return NextResponse.json({ ok: true, raw, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, raw: "", error: `Failed to fetch: ${message}` },
      { status: 502 },
    );
  }
}

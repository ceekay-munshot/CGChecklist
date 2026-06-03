import { NextResponse } from "next/server";
import { MUNS_API_BASE, GOVERNANCE_AGENT_UUID } from "@/lib/munsConfig";

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
}

export async function POST(request: Request) {
  const token = process.env.TEMPORARY_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, raw: "", error: "TEMPORARY_TOKEN not configured." },
      { status: 500 },
    );
  }

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

  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    agent_library_id: GOVERNANCE_AGENT_UUID,
    metadata: {
      stock_ticker: ticker.toUpperCase(),
      stock_company_name: companyName,
      context_company_name: companyName,
      stock_country: resolveCountry(body.country),
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
          error: `Analysis request failed with status ${upstream.status}.`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, raw });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, raw: "", error: `Failed to fetch: ${message}` },
      { status: 502 },
    );
  }
}

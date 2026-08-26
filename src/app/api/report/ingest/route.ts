import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getMunsKv, putReport, reportCacheKey } from "@/lib/munsCache";
import { resolveCountry } from "@/lib/munsConfig";
import type { GovernanceRow } from "@/lib/types/governance";

// Writes live KV; never statically optimize.
export const dynamic = "force-dynamic";

interface IngestBody {
  ticker?: string;
  company?: string;
  country?: string;
  total?: number;
  max?: number;
  rows?: GovernanceRow[];
  harvestNote?: string;
}

/** Read a string binding/env, Cloudflare first then process.env. */
function readEnv(name: string): string | undefined {
  try {
    const bindings = getCloudflareContext().env as Record<string, unknown>;
    const v = bindings[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    // no Cloudflare context (plain `next dev`)
  }
  const p = process.env[name];
  return p && p.trim() ? p.trim() : undefined;
}

/**
 * Ingest a source-first engine report (the analyze.yml results.json) into KV so
 * the dashboard can render it. The GitHub Actions run POSTs its results here
 * with a shared bearer token — the Worker writes KV through its own binding, so
 * this needs no Cloudflare API token (which the repo's Actions don't hold).
 *
 * Auth: Authorization: Bearer <REPORT_INGEST_TOKEN> (a worker secret you set).
 */
export async function POST(request: Request) {
  const configured = readEnv("REPORT_INGEST_TOKEN");
  if (!configured) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Report ingest isn't configured yet. Set the REPORT_INGEST_TOKEN worker secret (any strong password) to enable publishing.",
      },
      { status: 501 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const presented = auth.replace(/^Bearer\s+/i, "").trim();
  // Constant-ish comparison: reject unless it matches exactly.
  if (!presented || presented !== configured) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const ticker = body.ticker?.trim().toUpperCase();
  if (!ticker || !Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "ticker and a non-empty rows[] are required." },
      { status: 400 },
    );
  }
  const country = resolveCountry(body.country);

  let kv = null;
  try {
    const bindings = getCloudflareContext().env as Record<string, unknown>;
    kv = getMunsKv((bindings.MUNS_RUNS as never) ?? null);
  } catch {
    kv = getMunsKv(null);
  }

  const stored = await putReport(
    reportCacheKey({ ticker, country }),
    {
      ticker,
      company: body.company?.trim() || ticker,
      total: typeof body.total === "number" ? body.total : 0,
      max: typeof body.max === "number" ? body.max : 0,
      rows: body.rows,
      harvestNote: body.harvestNote,
    },
    kv,
  );

  if (!stored) {
    return NextResponse.json(
      { ok: false, error: "KV is not available — the report could not be stored." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, stored: true, ticker, country, rows: body.rows.length });
}

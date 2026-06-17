import { NextResponse } from "next/server";
import { putCachedRun, runCacheKey } from "@/lib/munsCache";
import { assembleMunsResults, type QuestionResult } from "@/lib/munsChatService";

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

interface AssembleRequest {
  ticker?: string;
  country?: string;
  results?: QuestionResult[];
}

// Receives the merged lane results from the browser, assembles them into the
// markdown the parser reads, enforces the all-questions-must-succeed rule, and
// (only on success) writes the full run to the KV cache. Caching lives here
// because the KV binding is server-side and no single lane invocation holds the
// complete result set. This step makes no chat subrequests.
export async function POST(request: Request) {
  let body: AssembleRequest;
  try {
    body = (await request.json()) as AssembleRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const ticker = body.ticker?.trim();
  if (!ticker) {
    return NextResponse.json(
      { ok: false, error: "Ticker is required to assemble a run." },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.results)) {
    return NextResponse.json(
      { ok: false, error: "results must be an array." },
      { status: 400 },
    );
  }

  const country = resolveCountry(body.country);
  const { raw, errorCount, total } = assembleMunsResults(body.results);

  // Any failed question produces an Error: row that the parser scores as 1/2
  // and would be cached for 30 days. Reject the run entirely so the UI surfaces
  // the real failure rather than persisting incorrect data.
  if (errorCount > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `${errorCount} of ${total} questions failed. Check subrequest limits or token validity and retry.`,
      },
      { status: 502 },
    );
  }

  await putCachedRun(runCacheKey({ ticker, country }), raw);

  return NextResponse.json({ ok: true, raw, cached: false });
}

import { NextResponse } from "next/server";
import { getRecord } from "@/lib/verify/store";
import type { VerificationResultResponse } from "@/lib/verify/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId")?.trim();
  if (!runId) {
    return NextResponse.json(
      { ok: false, error: "runId query parameter is required." },
      { status: 400 },
    );
  }

  const record = await getRecord(runId);
  if (!record) {
    return NextResponse.json(
      { ok: false, error: "Unknown runId." },
      { status: 404 },
    );
  }

  // Strip the callback secret before returning to the browser.
  const payload: VerificationResultResponse = {
    runId: record.runId,
    status: record.status,
    sessionUrl: record.sessionUrl,
    results: record.results,
    completedAt: record.completedAt,
    error: record.error,
  };

  // 202 while the routine is still working so callers can keep polling.
  const status = record.status === "pending" ? 202 : 200;
  return NextResponse.json(payload, { status });
}

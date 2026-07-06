import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  getCachedRun,
  getMunsKv,
  runCacheKey,
  type KVNamespaceLike,
} from "@/lib/munsCache";
import { getJob, jobKey } from "@/lib/munsJob";
import { resolveCountry } from "@/lib/munsConfig";

// Reads live run state, so it must never be cached or statically optimized.
export const dynamic = "force-dynamic";

/**
 * Report the state of a durable run for a ticker/country. The client polls this
 * after /api/muns/start:
 *   - "running" → still going; carries the latest progress snapshot.
 *   - "done"    → carries the assembled markdown (from the job record, or the
 *                 run cache if the ephemeral job record has already expired).
 *   - "error"   → carries the failure reason.
 *   - "unknown" → no job and no cached run; the client should (re)start.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker")?.trim();
  const country = resolveCountry(url.searchParams.get("country"));

  if (!ticker) {
    return NextResponse.json(
      { ok: false, status: "unknown", error: "ticker is required." },
      { status: 400 },
    );
  }

  let kv: KVNamespaceLike | null = null;
  try {
    const { env } = getCloudflareContext();
    kv = getMunsKv((env as Record<string, unknown>).MUNS_RUNS as never);
  } catch {
    kv = getMunsKv(null);
  }

  const job = await getJob(jobKey({ ticker, country }), kv);
  if (job) {
    if (job.status === "done") {
      return NextResponse.json({
        ok: true,
        status: "done",
        raw: job.raw,
        errorCount: job.errorCount,
        total: job.total,
        cached: job.cached,
        cachedAt: job.cachedAt,
        progress: job.progress,
      });
    }
    if (job.status === "error") {
      return NextResponse.json({
        ok: true,
        status: "error",
        error: job.error,
        progress: job.progress,
      });
    }
    return NextResponse.json({
      ok: true,
      status: "running",
      progress: job.progress,
    });
  }

  // No job record (expired, or created in another isolate that hasn't yet
  // propagated) — a completed run may still be cached, which is just as good.
  const cached = await getCachedRun(runCacheKey({ ticker, country }), kv);
  if (cached) {
    return NextResponse.json({
      ok: true,
      status: "done",
      raw: cached.raw,
      cached: true,
      cachedAt: new Date(cached.storedAt).toISOString(),
    });
  }

  return NextResponse.json({ ok: true, status: "unknown" });
}

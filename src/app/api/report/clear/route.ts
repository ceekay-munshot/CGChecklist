import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { deleteByPrefix, getMunsKv } from "@/lib/munsCache";

// Mutates live KV; never statically optimize.
export const dynamic = "force-dynamic";

/**
 * Clear the legacy MUNS runs from KV so the dashboard shows only the new
 * source-first engine reports. Only ever deletes the `run:` and `job:` key
 * families — engine reports live under `report:` and are left untouched, so
 * this is safe to call and can never wipe an engine run.
 */
export async function POST() {
  let kv = null;
  try {
    const bindings = getCloudflareContext().env as Record<string, unknown>;
    kv = getMunsKv((bindings.MUNS_RUNS as never) ?? null);
  } catch {
    kv = getMunsKv(null);
  }

  if (!kv) {
    return NextResponse.json(
      { ok: false, error: "KV is not available in this environment." },
      { status: 500 },
    );
  }

  const runs = await deleteByPrefix("run:", kv);
  const jobs = await deleteByPrefix("job:", kv);

  return NextResponse.json({
    ok: true,
    cleared: { runs, jobs },
    kept: "report:*",
  });
}

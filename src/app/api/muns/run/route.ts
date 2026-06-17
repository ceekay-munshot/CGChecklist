import { NextResponse } from "next/server";
import { getCachedRun, runCacheKey } from "@/lib/munsCache";
import { MUNS_LANE_COUNT, runMunsChatLane } from "@/lib/munsChatService";

// This route streams live per-question progress as Server-Sent Events, so it
// must never be statically optimized or buffered.
export const dynamic = "force-dynamic";

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
  /** Which lane of the checklist this invocation should run (0-based). */
  lane?: number;
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

  const lane = body.lane ?? 0;
  if (!Number.isInteger(lane) || lane < 0 || lane >= MUNS_LANE_COUNT) {
    return NextResponse.json(
      { ok: false, error: `lane must be an integer in [0, ${MUNS_LANE_COUNT}).` },
      { status: 400 },
    );
  }

  const country = resolveCountry(body.country);
  const cacheKey = runCacheKey({ ticker, country });

  // Serve a stored run if we produced one for this ticker within the last
  // month — no need to re-run the model. The cache holds a full assembled run,
  // so a hit short-circuits the whole fan-out: we flag `full` and the client
  // uses this raw directly instead of merging lanes. A forced run skips this
  // and regenerates the analysis as of today.
  if (!body.force) {
    const cached = await getCachedRun(cacheKey);
    if (cached) {
      return NextResponse.json({
        ok: true,
        full: true,
        raw: cached.raw,
        cached: true,
        cachedAt: new Date(cached.storedAt).toISOString(),
      });
    }
  }

  const token = process.env.TEMPORARY_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "TEMPORARY_TOKEN not configured." },
      { status: 500 },
    );
  }

  // Stream live progress back to the browser as Server-Sent Events so the user
  // watches each checklist question resolve in real time. The terminal "done"
  // event carries this lane's partial results — the client still merges all
  // lanes and posts them to /api/muns/assemble for ordering, scoring, caching.
  const encoder = new TextEncoder();
  const chain: "A" | "B" = lane === 0 ? "A" : "B";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Flush an immediate frame so the browser shows activity within a second
      // (before the first mega prompt returns) and to confirm nothing buffers.
      send("progress", {
        chain,
        phase: "mega",
        section: "",
        particulars: "Connecting to MUNS…",
        ok: true,
        completed: 0,
        total: 0,
      });

      try {
        const result = await runMunsChatLane(
          lane,
          ticker,
          companyName,
          token,
          request.signal,
          (e) => send("progress", e),
        );

        if (!result.ok) {
          send("done", {
            ok: false,
            error: result.error ?? "Chat analysis failed.",
          });
        } else {
          send("done", { ok: true, full: false, results: result.results });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        send("done", { ok: false, error: `Failed to fetch: ${message}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

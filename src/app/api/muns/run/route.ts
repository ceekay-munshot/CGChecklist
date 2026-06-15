import { NextResponse } from "next/server";
import { getCachedRun, putCachedRun, runCacheKey } from "@/lib/munsCache";
import { runMunsChatGovernance } from "@/lib/munsChatService";

// Never cache or buffer this route — it streams live progress as SSE.
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

  // Stream live progress back to the browser as Server-Sent Events so the user
  // can watch each checklist question resolve in real time. The final "done"
  // event carries the assembled markdown (or the error).
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Flush an immediate frame so the browser shows live activity within a
      // second (rather than waiting for the first mega prompt to return) and we
      // confirm the stream isn't being buffered.
      send("progress", {
        chain: "A",
        phase: "mega",
        section: "",
        particulars: "Connecting to MUNS…",
        ok: true,
        completed: 0,
        total: 51,
      });

      try {
        const result = await runMunsChatGovernance(
          ticker,
          companyName,
          country,
          token,
          request.signal,
          (e) => send("progress", e),
        );

        if (!result.ok) {
          send("done", {
            ok: false,
            raw: "",
            error: result.error ?? "Chat analysis failed.",
          });
        } else {
          await putCachedRun(cacheKey, result.raw);
          send("done", { ok: true, raw: result.raw, cached: false });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        send("done", { ok: false, raw: "", error: `Failed to fetch: ${message}` });
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

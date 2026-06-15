import { parseMunsResponse } from "./munsParse";

export interface MunsGovernanceResponse {
  ok: boolean;
  raw: string;
  parsed: ReturnType<typeof parseMunsResponse> | null;
  error?: string;
  /** True when the result came from the KV cache rather than a fresh run. */
  cached?: boolean;
  /** ISO timestamp of when a cached result was originally stored. */
  cachedAt?: string;
  /** True when the request was aborted by the caller. */
  cancelled?: boolean;
}

/** A single live progress update streamed from the server during a run. */
export interface GovernanceProgress {
  chain: "A" | "B";
  phase: "mega" | "question";
  section: string;
  particulars: string;
  ok: boolean;
  error?: string;
  completed: number;
  total: number;
}

export interface FetchGovernanceOptions {
  /** Abort signal used to cancel an in-flight run. */
  signal?: AbortSignal;
  /** When true, bypass the cached run and force a fresh model run. */
  force?: boolean;
  /** Called for each live progress event streamed from the server. */
  onProgress?: (event: GovernanceProgress) => void;
}

export interface MunsAgentInput {
  ticker: string;
  companyName: string;
  country?: string;
}

interface RunRouteResponse {
  ok: boolean;
  raw: string;
  error?: string;
  cached?: boolean;
  cachedAt?: string;
}

/**
 * Reads the SSE body of a fresh run, forwarding "progress" events to the
 * caller and resolving with the terminal "done" payload.
 */
async function consumeRunStream(
  response: Response,
  onProgress?: (event: GovernanceProgress) => void,
): Promise<RunRouteResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { ok: false, raw: "", error: "Empty response stream." };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let done: RunRouteResponse | null = null;

  const handleFrame = (frame: string) => {
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    let payload: unknown;
    try {
      payload = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }
    if (eventName === "progress") {
      onProgress?.(payload as GovernanceProgress);
    } else if (eventName === "done") {
      done = payload as RunRouteResponse;
    }
  };

  while (true) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (frame.trim()) handleFrame(frame);
    }
  }
  if (buffer.trim()) handleFrame(buffer);

  return done ?? { ok: false, raw: "", error: "Run ended without a result." };
}

export const fetchGovernanceAnalysis = async (
  input: MunsAgentInput,
  options: FetchGovernanceOptions = {},
): Promise<MunsGovernanceResponse> => {
  if (!input.ticker?.trim() || !input.companyName?.trim()) {
    return {
      ok: false,
      raw: "",
      parsed: null,
      error: "Ticker and company name are required to run analysis.",
    };
  }

  try {
    const response = await fetch("/api/muns/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: input.ticker.trim(),
        companyName: input.companyName.trim(),
        country: input.country,
        force: options.force,
      }),
      signal: options.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";

    // Fresh runs stream Server-Sent Events: progress events as questions
    // resolve, then a terminal "done" event with the assembled markdown.
    const data = contentType.includes("text/event-stream")
      ? await consumeRunStream(response, options.onProgress)
      : ((await response.json()) as RunRouteResponse);

    if (!data.ok) {
      return {
        ok: false,
        raw: data.raw ?? "",
        parsed: null,
        error:
          data.error || `MUNS request failed with status ${response.status}.`,
      };
    }

    return {
      ok: true,
      raw: data.raw,
      parsed: parseMunsResponse(data.raw),
      cached: data.cached,
      cachedAt: data.cachedAt,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        raw: "",
        parsed: null,
        cancelled: true,
        error: "Run cancelled.",
      };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      ok: false,
      raw: "",
      parsed: null,
      error: `Failed to fetch: ${message}`,
    };
  }
};

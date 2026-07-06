import type { LaneProgress, QuestionResult } from "@/lib/munsChatService";

/**
 * Terminal payload of a lane's Server-Sent-Events stream (its `done` event).
 * A fresh lane streams SSE; a cached full run comes back as plain JSON with the
 * same shape, so callers can treat both uniformly.
 */
export interface LaneRouteResponse {
  ok: boolean;
  /** True when a cached full run was served — `raw` is the complete document. */
  full?: boolean;
  raw?: string;
  results?: QuestionResult[];
  error?: string;
  cached?: boolean;
  cachedAt?: string;
}

/**
 * Reads the SSE body of a fresh lane run, forwarding "progress" events to the
 * caller and resolving with the terminal "done" payload (the lane's results).
 *
 * Uses only web-standard streams (Response body reader + TextDecoder), so it
 * runs unchanged in a browser fetch or a server-side service-binding fetch.
 */
export async function consumeRunStream(
  response: Response,
  onProgress: (event: LaneProgress) => void,
): Promise<LaneRouteResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { ok: false, error: "Empty response stream." };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let done: LaneRouteResponse | null = null;

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
      onProgress(payload as LaneProgress);
    } else if (eventName === "done") {
      done = payload as LaneRouteResponse;
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

  return done ?? { ok: false, error: "Run ended without a result." };
}

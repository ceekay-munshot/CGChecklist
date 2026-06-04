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

export const fetchGovernanceAnalysis = async (
  input: MunsAgentInput,
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
      }),
    });

    const data = (await response.json()) as RunRouteResponse;

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
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      ok: false,
      raw: "",
      parsed: null,
      error: `Failed to fetch: ${message}`,
    };
  }
};

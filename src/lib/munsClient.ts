import { parseMunsResponse } from "./munsParse";

export interface MunsGovernanceResponse {
  ok: boolean;
  raw: string;
  parsed: ReturnType<typeof parseMunsResponse> | null;
  error?: string;
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
}

export const fetchGovernanceAnalysis = async (
  input: MunsAgentInput,
  signal?: AbortSignal,
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
      signal,
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

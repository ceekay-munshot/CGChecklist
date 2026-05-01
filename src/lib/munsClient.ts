import {
  MUNS_API_BASE,
  MUNS_BEARER_TOKEN,
  GOVERNANCE_AGENT_UUID,
  GOVERNANCE_AGENT_METADATA,
} from "./munsConfig";
import { parseMunsResponse } from "./munsParse";

export interface MunsGovernanceResponse {
  ok: boolean;
  raw: string;
  parsed: ReturnType<typeof parseMunsResponse> | null;
  error?: string;
}

export const fetchGovernanceAnalysis = async (): Promise<MunsGovernanceResponse> => {
  if (!MUNS_BEARER_TOKEN) {
    return {
      ok: false,
      raw: "",
      parsed: null,
      error: "MUNS bearer token not configured.",
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    agent_library_id: GOVERNANCE_AGENT_UUID,
    metadata: {
      ...GOVERNANCE_AGENT_METADATA,
      to_date: today,
    },
  };

  try {
    const response = await fetch(`${MUNS_API_BASE}/agents/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MUNS_BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        raw,
        parsed: null,
        error: `MUNS request failed with status ${response.status}.`,
      };
    }

    const parsed = parseMunsResponse(raw);

    return {
      ok: true,
      raw,
      parsed,
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

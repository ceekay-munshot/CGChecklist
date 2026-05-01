import {
  MUNS_API_BASE,
  MUNS_BEARER_TOKEN,
  GOVERNANCE_AGENT_UUID,
} from "./munsConfig";
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

export const fetchGovernanceAnalysis = async (
  input: MunsAgentInput,
): Promise<MunsGovernanceResponse> => {
  if (!MUNS_BEARER_TOKEN) {
    return {
      ok: false,
      raw: "",
      parsed: null,
      error: "MUNS bearer token not configured.",
    };
  }

  if (!input.ticker?.trim() || !input.companyName?.trim()) {
    return {
      ok: false,
      raw: "",
      parsed: null,
      error: "Ticker and company name are required to run analysis.",
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    agent_library_id: GOVERNANCE_AGENT_UUID,
    metadata: {
      stock_ticker: input.ticker.trim().toUpperCase(),
      stock_company_name: input.companyName.trim(),
      context_company_name: input.companyName.trim(),
      stock_country: resolveCountry(input.country),
      to_date: today,
      timezone: "UTC",
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

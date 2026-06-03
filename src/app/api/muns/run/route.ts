import { NextResponse } from "next/server";
import {
  ANTHROPIC_API_BASE,
  ANTHROPIC_VERSION,
  GOVERNANCE_MODEL,
  GOVERNANCE_MAX_TOKENS,
  GOVERNANCE_WEB_SEARCH_MAX_USES,
} from "@/lib/munsConfig";
import {
  GOVERNANCE_SYSTEM_PROMPT,
  buildGovernanceUserMessage,
} from "@/lib/governancePrompt";

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
  exchange?: string;
}

// Anthropic Messages API content block (subset we read).
interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessageResponse {
  content?: AnthropicContentBlock[];
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, raw: "", error: "ANTHROPIC_API_KEY not configured." },
      { status: 500 },
    );
  }

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

  const today = new Date().toISOString().slice(0, 10);
  const userMessage = buildGovernanceUserMessage({
    companyName,
    ticker: ticker.toUpperCase(),
    exchange: body.exchange,
    country: resolveCountry(body.country),
    date: today,
  });

  const payload = {
    model: GOVERNANCE_MODEL,
    max_tokens: GOVERNANCE_MAX_TOKENS,
    system: GOVERNANCE_SYSTEM_PROMPT,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: GOVERNANCE_WEB_SEARCH_MAX_USES,
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  };

  try {
    const upstream = await fetch(`${ANTHROPIC_API_BASE}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawResponse = await upstream.text();

    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          raw: rawResponse,
          error: `Claude request failed with status ${upstream.status}.`,
        },
        { status: 502 },
      );
    }

    let data: AnthropicMessageResponse;
    try {
      data = JSON.parse(rawResponse) as AnthropicMessageResponse;
    } catch {
      return NextResponse.json(
        { ok: false, raw: rawResponse, error: "Malformed Claude response." },
        { status: 502 },
      );
    }

    // Concatenate the model's text blocks (web_search tool blocks are skipped)
    // and wrap in <ans> so the existing markdown-table parser consumes it.
    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n")
      .trim();

    if (!text) {
      return NextResponse.json(
        {
          ok: false,
          raw: rawResponse,
          error: "Claude returned no checklist content.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, raw: `<ans>${text}</ans>` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, raw: "", error: `Failed to fetch: ${message}` },
      { status: 502 },
    );
  }
}

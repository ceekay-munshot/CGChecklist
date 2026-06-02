import { NextResponse } from "next/server";
import {
  MUNS_API_BASE,
  GOVERNANCE_SECTIONS,
  GOVERNANCE_PARALLEL_BATCH_SIZE,
  type GovernanceSection,
} from "@/lib/munsConfig";

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
}

interface SectionResult {
  section: GovernanceSection;
  raw: string;
}

const buildPayload = (
  section: GovernanceSection,
  ticker: string,
  companyName: string,
  country: string,
  today: string,
) => ({
  agent_library_id: section.agentLibraryId,
  metadata: {
    stock_ticker: ticker.toUpperCase(),
    stock_company_name: companyName,
    context_company_name: companyName,
    stock_country: country,
    to_date: today,
    timezone: "UTC",
  },
});

const runSection = async (
  token: string,
  section: GovernanceSection,
  ticker: string,
  companyName: string,
  country: string,
  today: string,
): Promise<SectionResult> => {
  const upstream = await fetch(`${MUNS_API_BASE}/agents/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPayload(section, ticker, companyName, country, today)),
  });

  const raw = await upstream.text();
  if (!upstream.ok) {
    throw new Error(
      `Section "${section.title}" failed with status ${upstream.status}.`,
    );
  }
  return { section, raw };
};

const extractAnsInner = (raw: string): string => {
  const match = raw.match(/<ans>([\s\S]*?)<\/ans>/);
  return match ? match[1] : raw;
};

const SUMMARY_ROW_RE = /^(total\s+score|overall\s+governance\s+score)$/i;

const dropSummaryRows = (html: string): string =>
  html.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, (tr) => {
    const firstCell = tr.match(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/i);
    if (!firstCell) return tr;
    const text = firstCell[1].replace(/<[^>]+>/g, "").trim();
    return SUMMARY_ROW_RE.test(text) ? "" : tr;
  });

const firstTable = (html: string): string => {
  const match = html.match(/<table[\s\S]*?<\/table>/i);
  return match ? match[0] : "";
};

const combine = (companyName: string, results: SectionResult[]): string => {
  const byIndex = new Map(results.map((r) => [r.section.index, r]));
  const parts: string[] = [
    `<div style="text-align:center; margin-top:120px; margin-bottom:220px;">`,
    `  <div style="font-size:30px; font-weight:700; color:#12395b;">${companyName}</div>`,
    `  <div style="font-size:18px; margin-top:10px; color:#4b5b6b;">Corporate Governance Checklist</div>`,
    `</div>`,
    ``,
    `<div style="text-align:center; font-size:11px; color:#666; margin-top:120px;">Highly Confidential</div>`,
    ``,
  ];
  for (const section of GOVERNANCE_SECTIONS) {
    const result = byIndex.get(section.index);
    const inner = result ? extractAnsInner(result.raw) : "";
    const cleaned = dropSummaryRows(inner);
    const table = firstTable(cleaned);
    parts.push(
      `## <span style="color:#12395b;">SECTION ${section.index}: ${section.title}</span>`,
      ``,
      table || `<p>No data returned for ${section.title}.</p>`,
      ``,
      `<div style="text-align:center; font-size:11px; color:#666; margin:18px 0;">Highly Confidential</div>`,
      ``,
    );
  }
  return `<ans>${parts.join("\n")}</ans>`;
};

export async function POST(request: Request) {
  const token = process.env.TEMPORARY_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, raw: "", error: "TEMPORARY_TOKEN not configured." },
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

  const country = resolveCountry(body.country);
  const today = new Date().toISOString().slice(0, 10);

  try {
    const results: SectionResult[] = [];
    for (
      let start = 0;
      start < GOVERNANCE_SECTIONS.length;
      start += GOVERNANCE_PARALLEL_BATCH_SIZE
    ) {
      const batch = GOVERNANCE_SECTIONS.slice(
        start,
        start + GOVERNANCE_PARALLEL_BATCH_SIZE,
      );
      const batchResults = await Promise.all(
        batch.map((section) =>
          runSection(token, section, ticker, companyName, country, today),
        ),
      );
      results.push(...batchResults);
    }

    return NextResponse.json({ ok: true, raw: combine(companyName, results) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, raw: "", error: `Failed to fetch: ${message}` },
      { status: 502 },
    );
  }
}

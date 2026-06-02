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
  status: number;
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
  return { section, raw, status: upstream.status };
};

const SUMMARY_ROW_RE = /^(total\s+score|overall\s+governance\s+score)$/i;

const dropSummaryRows = (html: string): string =>
  html.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, (tr) => {
    const firstCell = tr.match(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/i);
    if (!firstCell) return tr;
    const text = firstCell[1].replace(/<[^>]+>/g, "").trim();
    return SUMMARY_ROW_RE.test(text) ? "" : tr;
  });

// Walk a JSON value and collect any string leaves that look like they might
// contain an HTML body (have angle-bracket markup). Returns the longest one
// — agent responses sometimes nest the content several keys deep.
const collectHtmlCandidates = (value: unknown, out: string[]): void => {
  if (typeof value === "string") {
    if (/<\/?[a-zA-Z][^>]*>/.test(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectHtmlCandidates(item, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectHtmlCandidates(v, out);
  }
};

// Best-effort body extraction. The MUNS agent endpoint may return either
// raw text containing <ans>…</ans> or a JSON envelope whose payload string
// contains the markup. Try JSON first, fall back to the raw string.
const extractHtmlBody = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const candidates: string[] = [];
      collectHtmlCandidates(parsed, candidates);
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.length - a.length);
        return candidates[0];
      }
    } catch {
      /* fall through to raw */
    }
  }
  return raw;
};

const extractAnsInner = (body: string): string => {
  const match = body.match(/<ans>([\s\S]*?)<\/ans>/i);
  return match ? match[1] : body;
};

const firstTable = (html: string): string => {
  const match = html.match(/<table[\s\S]*?<\/table>/i);
  return match ? match[0] : "";
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const extractSectionTable = (
  raw: string,
): { table: string; debug: string | null } => {
  const body = extractHtmlBody(raw);
  const inner = extractAnsInner(body);
  const cleaned = dropSummaryRows(inner);
  const table = firstTable(cleaned);
  if (table) return { table, debug: null };
  // Couldn't find a table — preserve a snippet of the raw body for the
  // dashboard's parse-error panel. Strip script/style for safety.
  const snippet = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .trim()
    .slice(0, 1200);
  return { table: "", debug: snippet };
};

const combine = (companyName: string, results: SectionResult[]): string => {
  const byIndex = new Map(results.map((r) => [r.section.index, r]));
  const parts: string[] = [
    `<div style="text-align:center; margin-top:120px; margin-bottom:220px;">`,
    `  <div style="font-size:30px; font-weight:700; color:#12395b;">${escapeHtml(companyName)}</div>`,
    `  <div style="font-size:18px; margin-top:10px; color:#4b5b6b;">Corporate Governance Checklist</div>`,
    `</div>`,
    ``,
    `<div style="text-align:center; font-size:11px; color:#666; margin-top:120px;">Highly Confidential</div>`,
    ``,
  ];
  for (const section of GOVERNANCE_SECTIONS) {
    const result = byIndex.get(section.index);
    parts.push(
      `## <span style="color:#12395b;">SECTION ${section.index}: ${section.title}</span>`,
      ``,
    );
    if (!result) {
      parts.push(
        `<p><strong>No response captured for agent ${section.agentLibraryId}.</strong></p>`,
      );
    } else {
      const { table, debug } = extractSectionTable(result.raw);
      if (table) {
        parts.push(table);
      } else {
        parts.push(
          `<p><strong>No table parsed from agent ${section.agentLibraryId}</strong> (status ${result.status}).</p>`,
          `<pre style="white-space:pre-wrap; font-family:ui-monospace,monospace; font-size:12px; background:#f7f9fc; padding:8px; border:1px solid #dde4ee; border-radius:6px;">${escapeHtml(
            debug ?? "(empty response body)",
          )}</pre>`,
        );
      }
    }
    parts.push(
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

    // Surface non-2xx upstream calls as an explicit error so the dashboard
    // shows the "API error" panel rather than silently degrading to an
    // empty parse-error state.
    const upstreamFailures = results.filter((r) => r.status < 200 || r.status >= 300);
    if (upstreamFailures.length > 0) {
      const summary = upstreamFailures
        .map((r) => `#${r.section.index} ${r.section.title}: HTTP ${r.status} — ${r.raw.slice(0, 200) || "(empty body)"}`)
        .join("\n");
      return NextResponse.json(
        {
          ok: false,
          raw: combine(companyName, results),
          error: `${upstreamFailures.length}/${results.length} agent call(s) failed upstream:\n${summary}`,
        },
        { status: 502 },
      );
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

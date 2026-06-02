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

// ---------- Body extraction ----------

// Walk a parsed JSON value and collect every string leaf that contains
// markup or markdown table syntax — agent envelopes nest the content a few
// keys deep. The longest candidate is used as the working body.
const collectContentCandidates = (value: unknown, out: string[]): void => {
  if (typeof value === "string") {
    if (/<\/?[a-zA-Z]|\|.+\|/.test(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectContentCandidates(item, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectContentCandidates(v, out);
  }
};

const extractBody = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const candidates: string[] = [];
      collectContentCandidates(parsed, candidates);
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.length - a.length);
        return candidates[0];
      }
    } catch {
      /* fall through */
    }
  }
  return raw;
};

// Strip streaming tool-call / citation / graph wrappers so they don't pollute
// table extraction. Patterns mirror MunsRenderer's NOISE_PATTERNS + tag list.
// Strip streaming tool-call wrappers but keep <task>/<ans> markers — the
// <ans> block is nested inside <task>, so removing <task>…</task> would
// throw the answer out with the noise.
const stripStreamNoise = (raw: string): string =>
  raw
    .replace(/<tool\b[\s\S]*?<\/tool>/gi, "")
    .replace(/<docsource\b[\s\S]*?<\/docsource>/gi, "")
    .replace(/<\/?docsource\b[^>]*>/gi, "")
    .replace(/<graph\b[\s\S]*?<\/graph>/gi, "");

const unwrapAns = (body: string): string => {
  const match = body.match(/<ans>([\s\S]*?)<\/ans>/i);
  return match ? match[1] : body;
};

// ---------- Table extraction ----------

interface CandidateTable {
  html: string;
  headers: string[];
  bodyRowCount: number;
  score: number;
}

const stripTagsForText = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const SUMMARY_ROW_RE = /^(total\s*score|overall(\s+governance)?\s+score|subtotal|section\s+total)$/i;

const scoreCandidate = (headers: string[], rowCount: number): number => {
  const lower = headers.map((h) => h.toLowerCase());
  const has = (kw: string) => lower.some((h) => h.includes(kw));
  let score = 0;
  // Particulars / question column is the strongest indicator we have the
  // right table.
  if (has("particular")) score += 100;
  else if (has("question") || has("criterion") || has("criteria")) score += 80;
  if (has("response") || has("answer") || has("verdict")) score += 40;
  if (has("score")) score += 25;
  if (has("max")) score += 10;
  if (has("remark") || has("comment") || has("rationale") || has("source")) score += 10;
  // Reward tables with a reasonable number of detail rows, penalise tiny
  // summary tables (which usually have 1-3 rows).
  score += Math.min(rowCount, 25);
  return score;
};

// ---- HTML tables ----

const parseHtmlTableHeaders = (tableHtml: string): { headers: string[]; rowCount: number } => {
  const rows = tableHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  if (rows.length === 0) return { headers: [], rowCount: 0 };
  // Prefer headers from a <thead>; otherwise first <tr> with <th>; otherwise first <tr>.
  const theadMatch = tableHtml.match(/<thead\b[^>]*>[\s\S]*?<\/thead>/i);
  let headerRowHtml = "";
  if (theadMatch) {
    const tr = theadMatch[0].match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i);
    headerRowHtml = tr?.[1] ?? "";
  }
  if (!headerRowHtml) {
    const thRow = rows.find((r) => /<th\b/i.test(r));
    if (thRow) {
      headerRowHtml = thRow.replace(/^<tr\b[^>]*>/i, "").replace(/<\/tr>$/i, "");
    }
  }
  if (!headerRowHtml && rows[0]) {
    headerRowHtml = rows[0].replace(/^<tr\b[^>]*>/i, "").replace(/<\/tr>$/i, "");
  }
  const cells = headerRowHtml.match(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
  const headers = cells.map((c) => stripTagsForText(c));
  // Body rows = total tr - 1 for header (approximately).
  const rowCount = Math.max(0, rows.length - 1);
  return { headers, rowCount };
};

const findHtmlCandidates = (html: string): CandidateTable[] => {
  const out: CandidateTable[] = [];
  const matches = html.match(/<table\b[\s\S]*?<\/table>/gi) || [];
  for (const t of matches) {
    const { headers, rowCount } = parseHtmlTableHeaders(t);
    if (headers.length === 0) continue;
    out.push({
      html: t,
      headers,
      bodyRowCount: rowCount,
      score: scoreCandidate(headers, rowCount),
    });
  }
  return out;
};

// ---- Markdown tables ----

const splitMarkdownRow = (row: string): string[] =>
  row
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.replace(/\*\*/g, "").trim());

const isMarkdownSeparator = (line: string): boolean =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const markdownTableToHtml = (
  headerLine: string,
  bodyLines: string[],
): { html: string; headers: string[]; rowCount: number } => {
  const headers = splitMarkdownRow(headerLine);
  const cellsByRow = bodyLines.map(splitMarkdownRow);
  const headHtml = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const bodyHtml = `<tbody>${cellsByRow
    .map((row) => {
      const padded = row.length < headers.length ? [...row, ...Array(headers.length - row.length).fill("")] : row;
      return `<tr>${padded
        .slice(0, headers.length)
        .map((c) => `<td>${escapeHtml(c)}</td>`)
        .join("")}</tr>`;
    })
    .join("")}</tbody>`;
  return {
    html: `<table>${headHtml}${bodyHtml}</table>`,
    headers,
    rowCount: cellsByRow.length,
  };
};

const findMarkdownCandidates = (text: string): CandidateTable[] => {
  const out: CandidateTable[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.includes("|") && i + 1 < lines.length && isMarkdownSeparator(lines[i + 1])) {
      const headerLine = line;
      const bodyLines: string[] = [];
      let j = i + 2;
      while (j < lines.length) {
        const bl = lines[j];
        if (!bl.includes("|") || isMarkdownSeparator(bl)) break;
        if (bl.trim() === "") break;
        bodyLines.push(bl);
        j++;
      }
      if (bodyLines.length > 0) {
        const { html, headers, rowCount } = markdownTableToHtml(headerLine, bodyLines);
        out.push({
          html,
          headers,
          bodyRowCount: rowCount,
          score: scoreCandidate(headers, rowCount),
        });
      }
      i = j;
      continue;
    }
    i++;
  }
  return out;
};

const pickBestTable = (body: string): CandidateTable | null => {
  const candidates = [...findHtmlCandidates(body), ...findMarkdownCandidates(body)];
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
};

const dropSummaryRows = (html: string): string =>
  html.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, (tr) => {
    const firstCell = tr.match(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/i);
    if (!firstCell) return tr;
    const text = stripTagsForText(firstCell[1]);
    return SUMMARY_ROW_RE.test(text) ? "" : tr;
  });

// ---------- Combine ----------

const extractSectionTable = (
  raw: string,
): { table: string; debug: string | null; headers: string[]; rowCount: number } => {
  const body = stripStreamNoise(extractBody(raw));
  const search = unwrapAns(body);
  const best = pickBestTable(search) ?? pickBestTable(body); // try with and without unwrapping
  if (!best) {
    const snippet = body.replace(/<style[\s\S]*?<\/style>/gi, "").trim().slice(0, 1500);
    return { table: "", debug: snippet, headers: [], rowCount: 0 };
  }
  const cleaned = dropSummaryRows(best.html);
  return { table: cleaned, debug: null, headers: best.headers, rowCount: best.bodyRowCount };
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
      parts.push(`<p><strong>No response captured for agent ${section.agentLibraryId}.</strong></p>`);
    } else {
      const { table, debug, headers, rowCount } = extractSectionTable(result.raw);
      if (table) {
        parts.push(
          `<!-- agent=${section.agentLibraryId} status=${result.status} headers=[${headers.join(" | ")}] rows=${rowCount} -->`,
          table,
        );
      } else {
        parts.push(
          `<p><strong>No checklist table parsed from agent ${section.agentLibraryId}</strong> (HTTP ${result.status}, ${result.raw.length} chars).</p>`,
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

// ---------- Handler ----------

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

// Recent-events evidence layer. The filings the engine reads (annual report,
// concalls) are a point-in-time snapshot; the things that most often decide a
// governance call — a fraud, a lawsuit, a SEBI action, a KMP resignation, a
// promoter block/bulk deal — usually happen AFTER the annual report and never
// appear in it. This module pulls the last ~18 months of material corporate
// announcements (BSE/NSE), news, and insider/bulk-block deals from the MUNS
// APIs and hands them back as one evidence block, fed to the red-flag /
// reputation / post-AR questions so those events actually surface.
//
// IMPORTANT: this is a LEAD source, not ground truth. Announcements can be
// routine, news can be stale/wrong/unrelated. The judge is told to treat these
// as items to verify (material AND corroborated) — never to flip a score on a
// single unconfirmed headline. Best-effort: every call is time-boxed and any
// failure degrades to "no events" rather than breaking the run.

// Both MUNS services take the same Bearer session token the chat API uses.
const NESTJS_BASE = process.env.MUNS_NESTJS_BASE?.trim() || "https://devde.muns.io";
const FASTAPI_BASE = process.env.MUNS_FASTAPI_BASE?.trim() || "https://fastapi.muns.io";
const LOOKBACK_MONTHS = 18;
const TIMEOUT_MS = 30_000;
const MAX_ANNOUNCE = 7000;
const MAX_NEWS = 4000;
const MAX_INSIDER = 3000;

type Json = unknown;

const token = (): string => process.env.MUNS_TOKEN?.trim() || "";

function windows() {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - LOOKBACK_MONTHS);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return {
    fromYmd: ymd(from),
    toYmd: ymd(to),
    fromCompact: ymd(from).replace(/-/g, ""),
    toCompact: ymd(to).replace(/-/g, ""),
  };
}

async function callJson(url: string, init: RequestInit): Promise<Json> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 150)}`);
  try {
    return JSON.parse(body) as Json;
  } catch {
    return body; // some endpoints (insider trades) return a markdown string
  }
}

const asObj = (v: Json): Record<string, Json> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json>) : null;

// The announcements endpoint groups results by source ({BSE:[...], NSE:[...]});
// news endpoints vary ({results|articles|news|data:[...]}). Flatten arrays found
// at the top level or one level down into a single list of records.
function flattenItems(data: Json): Record<string, Json>[] {
  const keep = (arr: Json[]) => arr.map(asObj).filter((x): x is Record<string, Json> => !!x);
  if (Array.isArray(data)) return keep(data);
  const obj = asObj(data);
  if (!obj) return [];
  const out: Record<string, Json>[] = [];
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) out.push(...keep(v));
    else {
      const inner = asObj(v);
      if (inner) for (const vv of Object.values(inner)) if (Array.isArray(vv)) out.push(...keep(vv));
    }
  }
  return out;
}

// First non-empty scalar field whose key matches — schema-agnostic, since the
// exact field names differ across BSE / NSE / news sources.
function field(item: Record<string, Json>, re: RegExp): string {
  for (const [k, v] of Object.entries(item)) {
    if (re.test(k) && v != null && typeof v !== "object") {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return "";
}

function renderItems(
  data: Json,
  dateRe: RegExp,
  titleRe: RegExp,
  extraRe: RegExp,
  cap: number,
  max: number,
): string {
  if (typeof data === "string") return data.slice(0, cap);
  const items = flattenItems(data);
  const lines = items
    .slice(0, max)
    .map((it) => [field(it, dateRe), field(it, titleRe), field(it, extraRe)].filter(Boolean).join(" — ").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 8);
  // If nothing parsed but the payload has real content, hand the raw JSON to
  // the judge rather than silently dropping it (but not an empty [] / {}).
  if (!lines.length && data && typeof data === "object") {
    const raw = JSON.stringify(data);
    return raw === "[]" || raw === "{}" ? "" : raw.slice(0, cap);
  }
  return lines.join("\n").slice(0, cap);
}

async function announcements(ticker: string): Promise<string> {
  const { fromCompact, toCompact } = windows();
  const url = `${NESTJS_BASE}/filings/corp/announcements/${encodeURIComponent(ticker)}?fromDate=${fromCompact}&toDate=${toCompact}`;
  const data = await callJson(url, { method: "GET", headers: { accept: "application/json", Authorization: `Bearer ${token()}` } });
  return renderItems(
    data,
    /date|dt|time|created|submit|dissem/i,
    /head|subject|title|newssub|caption|particular|desc/i,
    /categ|type|form|detail|summary|attach/i,
    MAX_ANNOUNCE,
    120,
  );
}

async function news(company: string): Promise<string> {
  const { fromYmd, toYmd } = windows();
  const data = await callJson(`${FASTAPI_BASE}/tools/news-search`, {
    method: "POST",
    headers: { accept: "application/json", Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    // Bias the query toward governance/forensic events — a clean company simply
    // returns little, which is the correct (no-false-flag) outcome.
    body: JSON.stringify({
      query: `${company} fraud OR lawsuit OR SEBI OR resignation OR investigation OR "block deal" OR penalty OR default`,
      country: "IN",
      from_date: fromYmd,
      to_date: toYmd,
    }),
  });
  return renderItems(data, /date|published|time/i, /title|head|name/i, /snippet|desc|summary|content|text|body/i, MAX_NEWS, 30);
}

async function insider(ticker: string): Promise<string> {
  const data = await callJson(`${NESTJS_BASE}/filings/data/insider_trades`, {
    method: "POST",
    headers: { accept: "application/json", Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, country: "india" }),
  });
  return (typeof data === "string" ? data : JSON.stringify(data)).slice(0, MAX_INSIDER);
}

export interface RecentEvents {
  /** Combined, headed evidence block (empty if nothing could be fetched). */
  text: string;
  /** Which sources actually returned something, for the run log. */
  sources: string[];
}

/**
 * Pull recent corporate announcements + news + insider/bulk deals for one
 * company. Best-effort and never throws — a failed or empty source is simply
 * omitted, and with no MUNS_TOKEN the whole layer is a no-op.
 */
export async function harvestRecentEvents(ticker: string, company: string): Promise<RecentEvents> {
  if (!token()) return { text: "", sources: [] };
  const [ann, nw, ins] = await Promise.allSettled([announcements(ticker), news(company), insider(ticker)]);
  const sections: string[] = [];
  const sources: string[] = [];
  const add = (r: PromiseSettledResult<string>, heading: string, label: string) => {
    if (r.status === "fulfilled" && r.value.trim()) {
      sections.push(`## ${heading}\n${r.value.trim()}`);
      sources.push(label);
    }
  };
  add(ann, `CORPORATE ANNOUNCEMENTS (BSE/NSE, last ${LOOKBACK_MONTHS} months)`, "Corporate announcements");
  add(nw, "RECENT NEWS", "News");
  add(ins, "INSIDER / BULK & BLOCK DEALS", "Insider/bulk deals");
  return { text: sections.join("\n\n"), sources };
}

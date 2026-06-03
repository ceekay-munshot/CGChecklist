import { NextResponse } from "next/server";
import { getRecord, putCompanyCache, putRecord } from "@/lib/verify/store";
import type {
  VerificationCitation,
  VerificationConfidence,
  VerificationResultItem,
  VerificationVerdict,
} from "@/lib/verify/types";
import type { GovernanceScoreValue } from "@/lib/types/governance";

export const dynamic = "force-dynamic";

const VERDICTS: VerificationVerdict[] = [
  "supported",
  "partially_supported",
  "contradicted",
  "unverifiable",
];

const normalizeVerdict = (value: unknown): VerificationVerdict => {
  const v = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  return (VERDICTS as string[]).includes(v)
    ? (v as VerificationVerdict)
    : "unverifiable";
};

const normalizeConfidence = (value: unknown): VerificationConfidence => {
  const v = String(value ?? "").toLowerCase();
  if (v.startsWith("high")) return "High";
  if (v.startsWith("med")) return "Medium";
  return "Low";
};

const normalizeScore = (value: unknown): GovernanceScoreValue | undefined => {
  const n = Number(value);
  if (n >= 2) return 2;
  if (n <= 0 && (n === 0 || value === 0 || value === "0")) return 0;
  if (n === 1) return 1;
  return undefined;
};

const normalizeCitations = (value: unknown): VerificationCitation[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((c) => {
      const obj = (c ?? {}) as Record<string, unknown>;
      const url = String(obj.url ?? "").trim();
      const title = String(obj.title ?? obj.url ?? "").trim();
      return { title, url };
    })
    .filter((c) => c.url.length > 0)
    .slice(0, 8);
};

const normalizeResults = (value: unknown): VerificationResultItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const obj = (item ?? {}) as Record<string, unknown>;
      const questionId = String(obj.questionId ?? "").trim();
      if (!questionId) return null;
      const suggestedScore = normalizeScore(obj.suggestedScore);
      const rawRemark =
        (typeof obj.remark === "string" && obj.remark.trim()) ||
        (typeof obj.correctedRemark === "string" && obj.correctedRemark.trim());
      const remark = rawRemark ? String(rawRemark) : undefined;
      const notes =
        typeof obj.notes === "string" && obj.notes.trim()
          ? obj.notes.trim()
          : undefined;
      const result: VerificationResultItem = {
        questionId,
        verdict: normalizeVerdict(obj.verdict),
        confidence: normalizeConfidence(obj.confidence),
        citations: normalizeCitations(obj.citations),
      };
      if (remark) result.remark = remark;
      if (suggestedScore !== undefined) result.suggestedScore = suggestedScore;
      if (notes) result.notes = notes;
      return result;
    })
    .filter((r): r is VerificationResultItem => r !== null);
};

const bearerFrom = (request: Request): string => {
  const header = request.headers.get("authorization") || "";
  return header.replace(/^Bearer\s+/i, "").trim();
};

export async function POST(request: Request) {
  let body: { runId?: string; results?: unknown; callbackSecret?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const runId = String(body.runId ?? "").trim();
  if (!runId) {
    return NextResponse.json(
      { ok: false, error: "runId is required." },
      { status: 400 },
    );
  }

  const record = await getRecord(runId);
  if (!record) {
    return NextResponse.json(
      { ok: false, error: "Unknown runId." },
      { status: 404 },
    );
  }

  // Accept the secret from the Authorization header or the body, for routines
  // that find one easier to set than the other.
  const presented = bearerFrom(request) || String(body.callbackSecret ?? "");
  if (presented !== record.callbackSecret) {
    return NextResponse.json(
      { ok: false, error: "Invalid callback secret." },
      { status: 401 },
    );
  }

  const results = normalizeResults(body.results);
  const completedAt = new Date().toISOString();

  await putRecord({
    ...record,
    status: "done",
    results,
    completedAt,
  });

  // Persist the final merged output (rows + verification) for this company so
  // the next run of the same ticker within 15 days is served from cache.
  if (record.rows && record.company.ticker) {
    await putCompanyCache({
      ticker: record.company.ticker,
      company: record.company,
      storedAt: completedAt,
      rows: record.rows,
      results,
    });
  }

  return NextResponse.json({ ok: true, received: results.length });
}

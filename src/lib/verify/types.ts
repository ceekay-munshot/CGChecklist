import type {
  GovernanceConfidence,
  GovernanceRow,
  GovernanceScoreValue,
  GovernanceSectionId,
} from "@/lib/types/governance";

// One remark handed to the routine for web-search cross-verification.
export interface VerificationRowInput {
  questionId: string;
  sectionId: GovernanceSectionId;
  particulars: string;
  response: string;
  remarks: string;
  score: GovernanceScoreValue;
}

export interface VerificationCompany {
  name: string;
  ticker: string;
  country?: string;
}

// The full payload the dashboard packs into the routine fire `text` field.
// The routine reads this, web-searches each remark, and POSTs back a
// VerificationCallbackBody to `callbackUrl` with `callbackSecret`.
export interface VerificationRunInput {
  runId: string;
  callbackUrl: string;
  callbackSecret: string;
  company: VerificationCompany;
  rows: VerificationRowInput[];
}

export type VerificationConfidence = GovernanceConfidence;

export type VerificationVerdict =
  | "supported"
  | "partially_supported"
  | "contradicted"
  | "unverifiable";

export interface VerificationCitation {
  title: string;
  url: string;
}

// One verified remark returned by the routine.
export interface VerificationResultItem {
  questionId: string;
  verdict: VerificationVerdict;
  confidence: VerificationConfidence;
  correctedRemark?: string;
  suggestedScore?: GovernanceScoreValue;
  citations: VerificationCitation[];
  notes?: string;
}

// Body the routine POSTs to /api/verify/callback.
export interface VerificationCallbackBody {
  runId: string;
  results: VerificationResultItem[];
}

export type VerificationStatus = "pending" | "done" | "error";

// Record persisted in KV across the three request boundaries.
export interface VerificationRecord {
  runId: string;
  status: VerificationStatus;
  callbackSecret: string;
  company: VerificationCompany;
  createdAt: string;
  // Full governance rows kept so the callback can assemble the final merged
  // output and write it to the per-company cache once verification lands.
  rows?: GovernanceRow[];
  sessionUrl?: string;
  results?: VerificationResultItem[];
  completedAt?: string;
  error?: string;
}

// Final merged output for a company, cached in KV for 15 days and served to
// anyone who runs the same ticker within that window.
export interface CompanyCacheRecord {
  ticker: string;
  company: VerificationCompany;
  storedAt: string;
  rows: GovernanceRow[];
  results: VerificationResultItem[];
}

export interface CompanyCacheResponse {
  fromCache: boolean;
  storedAt?: string;
  company?: VerificationCompany;
  rows?: GovernanceRow[];
  results?: VerificationResultItem[];
}

// Shape returned by GET /api/verify/result (secret stripped).
export interface VerificationResultResponse {
  runId: string;
  status: VerificationStatus;
  sessionUrl?: string;
  results?: VerificationResultItem[];
  completedAt?: string;
  error?: string;
}

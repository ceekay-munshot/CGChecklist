import type { GovernanceRow } from "@/lib/types/governance";
import type { VerificationResultItem } from "./types";

export type VerificationMap = Record<string, VerificationResultItem>;

// Index routine results by questionId so the table can look up a verdict per row.
export const indexResults = (
  results: VerificationResultItem[],
): VerificationMap => {
  const map: VerificationMap = {};
  for (const result of results) {
    map[result.questionId] = result;
  }
  return map;
};

// Where the routine verified a row, its remark / score / confidence / sources
// replace the agent's original values. Untouched rows pass through unchanged.
export const applyVerification = (
  rows: GovernanceRow[],
  map: VerificationMap,
): GovernanceRow[] =>
  rows.map((row) => {
    const result = map[row.questionId];
    if (!result) return row;
    const source =
      result.citations.length > 0
        ? result.citations.map((c) => c.title || c.url).join("; ")
        : row.source;
    return {
      ...row,
      remarks: result.remark || row.remarks,
      score: result.suggestedScore ?? row.score,
      confidence: result.confidence || row.confidence,
      source,
    };
  });

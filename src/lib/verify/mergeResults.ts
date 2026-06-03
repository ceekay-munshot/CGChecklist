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

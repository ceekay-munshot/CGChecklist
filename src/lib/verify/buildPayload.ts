import type { GovernanceRow } from "@/lib/types/governance";
import type { VerificationRowInput } from "./types";

// Strip a governance row down to just what the routine needs to web-verify it.
export const rowsToVerificationInput = (
  rows: GovernanceRow[],
): VerificationRowInput[] =>
  rows.map((row) => ({
    questionId: row.questionId,
    sectionId: row.sectionId,
    particulars: row.particulars,
    response: row.response,
    remarks: row.remarks,
    score: row.score,
  }));

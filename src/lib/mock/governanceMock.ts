import type { GovernanceScore } from "@/lib/types/scores";

export const EMPTY_GOVERNANCE: GovernanceScore = {
  summary: {
    value: null,
    verdict: "unknown",
    label: "Awaiting data",
    description:
      "Refresh data to compute the corporate governance score across board, audit, disclosures, related parties, and capital allocation.",
  },
  checkpoints: [],
};

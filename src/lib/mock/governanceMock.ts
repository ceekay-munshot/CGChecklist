import type { GovernanceModule } from "@/lib/types/scores";

/**
 * Empty governance module — used as the initial state before any
 * data is fetched. Real values will land here from the calculation layer.
 */
export const EMPTY_GOVERNANCE: GovernanceModule = {
  summary: {
    band: "unknown",
    value: null,
    label: "Awaiting data",
    rationale:
      "Enter a company and click Refresh Data. The governance score will be computed from filings, IR pages, and exchange disclosures.",
  },
  checkpoints: [],
};

import type { AltmanModule } from "@/lib/types/scores";

/**
 * Empty Altman module — variant defaults to the manufacturing model
 * (Z-score). The calculation layer will switch variants based on
 * resolved company classification.
 */
export const EMPTY_ALTMAN: AltmanModule = {
  summary: {
    band: "unknown",
    value: null,
    label: "Awaiting data",
    rationale:
      "Altman Z-Score combines five working-capital and earnings ratios. Refresh data to compute X1–X5 and the weighted Z value.",
  },
  variant: "manufacturing",
  components: [],
};

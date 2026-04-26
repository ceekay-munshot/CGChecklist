import type { BeneishModule } from "@/lib/types/scores";

/**
 * Empty Beneish module — populated once the calculation layer
 * has access to the eight underlying ratios.
 */
export const EMPTY_BENEISH: BeneishModule = {
  summary: {
    band: "unknown",
    value: null,
    label: "Awaiting data",
    rationale:
      "Beneish M-Score uses eight financial-statement ratios. Refresh data to compute DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, and TATA.",
  },
  components: [],
};

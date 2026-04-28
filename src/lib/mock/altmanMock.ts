import type { AltmanScore } from "@/lib/types/scores";

export const EMPTY_ALTMAN: AltmanScore = {
  summary: {
    value: null,
    verdict: "unknown",
    label: "Awaiting data",
    description:
      "Refresh data to compute the Altman Z-Score using the variant most appropriate for this company.",
  },
  variant: "original",
  ratios: [
    { id: "X1", label: "Working capital / total assets", description: "Liquidity", value: null, weight: 1.2, contribution: null },
    { id: "X2", label: "Retained earnings / total assets", description: "Cumulative profitability", value: null, weight: 1.4, contribution: null },
    { id: "X3", label: "EBIT / total assets", description: "Operating efficiency", value: null, weight: 3.3, contribution: null },
    { id: "X4", label: "Market cap / total liabilities", description: "Solvency cushion", value: null, weight: 0.6, contribution: null },
    { id: "X5", label: "Sales / total assets", description: "Asset turnover", value: null, weight: 1.0, contribution: null },
  ],
};

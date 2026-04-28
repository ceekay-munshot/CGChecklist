import type { BeneishScore } from "@/lib/types/scores";

export const EMPTY_BENEISH: BeneishScore = {
  summary: {
    value: null,
    verdict: "unknown",
    label: "Awaiting data",
    description:
      "Refresh data to compute the eight-variable Beneish M-Score earnings-manipulation indicator.",
  },
  variables: [
    { id: "DSRI", label: "Days Sales in Receivables Index", description: "Receivables vs sales growth", value: null, contribution: null },
    { id: "GMI", label: "Gross Margin Index", description: "Decline in gross margin", value: null, contribution: null },
    { id: "AQI", label: "Asset Quality Index", description: "Non-current non-PPE assets share", value: null, contribution: null },
    { id: "SGI", label: "Sales Growth Index", description: "Year-over-year sales growth", value: null, contribution: null },
    { id: "DEPI", label: "Depreciation Index", description: "Slowing depreciation rate", value: null, contribution: null },
    { id: "SGAI", label: "SG&A Index", description: "SG&A vs sales", value: null, contribution: null },
    { id: "LVGI", label: "Leverage Index", description: "Change in total leverage", value: null, contribution: null },
    { id: "TATA", label: "Total Accruals to Total Assets", description: "Accruals share of assets", value: null, contribution: null },
  ],
};

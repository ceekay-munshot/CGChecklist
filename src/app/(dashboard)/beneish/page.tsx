import { Badge } from "@/components/ui/Badge";
import { PlaceholderModule } from "@/components/ui/PlaceholderModule";

export default function BeneishPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
            Beneish M-Score
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Eight-variable model estimating the likelihood that earnings have
            been manipulated. Threshold: M &gt; -1.78 indicates elevated risk.
          </p>
        </div>
        <Badge tone="info">Module 2 of 3</Badge>
      </div>

      <PlaceholderModule
        title="Eight-variable breakdown"
        subtitle="Each ratio will be computed YoY and contribute to the weighted M-Score."
        scoreLabel="M-Score"
        buildingBlocks={[
          "DSRI — Days Sales in Receivables Index",
          "GMI — Gross Margin Index",
          "AQI — Asset Quality Index",
          "SGI — Sales Growth Index",
          "DEPI — Depreciation Index",
          "SGAI — SG&A Index",
          "LVGI — Leverage Index",
          "TATA — Total Accruals to Total Assets",
        ]}
        pending={[
          "Pull two consecutive annual financials via screenerAdapter",
          "Fall back to annualReportAdapter for missing line items",
          "Implement formula in services/calculations/beneishCalc",
          "Visualise per-ratio contribution and threshold band",
        ]}
      />
    </div>
  );
}

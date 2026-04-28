import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlaceholderModule } from "@/components/ui/PlaceholderModule";

export default function AltmanPage() {
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader
          title="Altman Z-Score"
          description="Bankruptcy probability model. Variant is selected from manufacturing / non-manufacturing / private / emerging-markets."
          action={<Badge tone="unknown">Awaiting data</Badge>}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Z-Score" value="—" />
          <Stat label="Variant" value="—" />
          <Stat label="Distress band" value="—" />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <PlaceholderModule
          title="Ratio breakdown"
          description="X1–X5 ratios, weights, and per-ratio contribution to the score."
          bullets={[
            "Working capital / total assets, retained earnings / total assets, EBIT / total assets, market cap / total liabilities, sales / total assets",
            "Contribution column shows weight × value",
            "Inline link to source filing for each ratio",
          ]}
        />
        <PlaceholderModule
          title="Variant selector"
          description="Switch between Z, Z', Z'', and emerging-markets variants and compare."
          bullets={[
            "Variant explainer with thresholds",
            "Side-by-side comparison of two variants",
            "Highlights when classification changes between variants",
          ]}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-semibold tracking-tight text-[var(--color-fg)]"
        data-numeric
      >
        {value}
      </p>
    </div>
  );
}

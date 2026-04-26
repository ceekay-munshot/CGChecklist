import { Badge } from "@/components/ui/Badge";
import { PlaceholderModule } from "@/components/ui/PlaceholderModule";

export default function AltmanPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
            Altman Z-Score
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Bankruptcy probability model. Bands: Z &gt; 2.99 safe, 1.81–2.99
            grey zone, &lt; 1.81 distress.
          </p>
        </div>
        <Badge tone="info">Module 3 of 3</Badge>
      </div>

      <PlaceholderModule
        title="Five-component breakdown"
        subtitle="X1–X5 inputs will be combined with the model variant appropriate for the company."
        scoreLabel="Z-Score"
        buildingBlocks={[
          "X1 — Working capital / Total assets",
          "X2 — Retained earnings / Total assets",
          "X3 — EBIT / Total assets",
          "X4 — Market value of equity / Total liabilities",
          "X5 — Sales / Total assets",
          "Variant selection: Z, Z′ (private), Z″ (emerging markets)",
        ]}
        pending={[
          "Decide variant from resolved company classification",
          "Pull balance-sheet + market-cap data via adapters",
          "Implement weighted formula in services/calculations/altmanCalc",
          "Render Z value with risk band and component contributions",
        ]}
      />
    </div>
  );
}

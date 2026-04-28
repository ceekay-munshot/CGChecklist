import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlaceholderModule } from "@/components/ui/PlaceholderModule";

export default function BeneishPage() {
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader
          title="Beneish M-Score"
          description="Eight-variable model that flags potential earnings manipulation. Threshold: > -1.78 suggests manipulation."
          action={<Badge tone="unknown">Awaiting data</Badge>}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="M-Score" value="—" />
          <Stat label="Variables computed" value="0 / 8" />
          <Stat label="Threshold" value="-1.78" />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <PlaceholderModule
          title="Variable table"
          description="DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, TATA — per-variable values and contribution."
          bullets={[
            "Two-period inputs with current vs prior columns",
            "Contribution sparkline per variable",
            "Tooltip explains each ratio in plain English",
          ]}
        />
        <PlaceholderModule
          title="Sensitivity panel"
          description="Stress-test the score by adjusting any single variable."
          bullets={[
            "Slider per variable around the computed value",
            "Live recompute of M-Score and verdict band",
            "Reset to source values in one click",
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

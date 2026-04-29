import { Badge } from "@/components/ui/Badge";
import type { GovernanceRating, GovernanceTotals } from "@/lib/types/governance";

const RATING_TONE: Record<GovernanceRating, "good" | "warn" | "risk" | "info"> = {
  Strong: "good",
  Good: "info",
  Moderate: "warn",
  Weak: "risk",
};

export function GovernanceKpiCards({ totals }: { totals: GovernanceTotals }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Kpi
        label="Overall Governance Score"
        value={`${totals.overallScorePercent.toFixed(1)}%`}
      />
      <Kpi
        label="Total Score"
        value={`${totals.totalScore} / ${totals.totalMaxScore}`}
      />
      <KpiBadge label="Governance Rating" tone={RATING_TONE[totals.rating]}>
        {totals.rating}
      </KpiBadge>
      <Kpi label="Red Flag Rows" value={String(totals.redFlagRows)} />
      <Kpi label="Low Confidence Rows" value={String(totals.lowConfidenceRows)} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
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

function KpiBadge({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "good" | "warn" | "risk" | "info";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
        {label}
      </p>
      <div className="mt-2">
        <Badge tone={tone} className="text-sm">
          {children}
        </Badge>
      </div>
    </div>
  );
}

import { Badge } from "@/components/ui/Badge";
import type { GovernanceRating, GovernanceTotals } from "@/lib/types/governance";

const RATING_TONE: Record<GovernanceRating, "good" | "warn" | "risk" | "info"> = {
  Strong: "good",
  Good: "info",
  Moderate: "warn",
  Weak: "risk",
};

export function GovernanceFinalSummary({
  totals,
}: {
  totals: GovernanceTotals;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-navy-50)] p-5 sm:p-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Item label="Total Score" value={String(totals.totalScore)} />
        <Item label="Total Max Score" value={String(totals.totalMaxScore)} />
        <Item
          label="Overall Governance Score"
          value={`${totals.overallScorePercent.toFixed(1)}%`}
        />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
            Governance Rating
          </p>
          <div className="mt-2">
            <Badge tone={RATING_TONE[totals.rating]} className="text-sm">
              {totals.rating}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
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

import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlaceholderModule } from "@/components/ui/PlaceholderModule";

export default function GovernancePage() {
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader
          title="Corporate Governance Score"
          description="Weighted checklist across board composition, audit, disclosures, related-party transactions, and capital allocation."
          action={<Badge tone="unknown">Awaiting data</Badge>}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Composite score" value="—" />
          <Stat label="Checkpoints filled" value="0 / —" />
          <Stat label="Lowest category" value="—" />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <PlaceholderModule
          title="Checkpoint table"
          description="Per-question rows, weights, evidence links, and reviewer notes."
          bullets={[
            "Rows grouped by category with collapsible sections",
            "Each row exposes evidence URL and last-verified timestamp",
            "Reviewer can override answer and attach a note",
          ]}
        />
        <PlaceholderModule
          title="Category breakdown"
          description="Score contribution by board / audit / disclosures / related-parties / capital allocation."
          bullets={[
            "Stacked horizontal bars per category",
            "Tooltip shows weight and answered ratio",
            "Click a category to filter the checkpoint table",
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

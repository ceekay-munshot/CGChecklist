import { Badge } from "@/components/ui/Badge";
import { PlaceholderModule } from "@/components/ui/PlaceholderModule";

export default function GovernancePage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
            Corporate Governance Score
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Weighted checklist across board independence, audit quality,
            disclosures, related parties, and capital allocation.
          </p>
        </div>
        <Badge tone="info">Module 1 of 3</Badge>
      </div>

      <PlaceholderModule
        title="Checklist categories"
        subtitle="Each category will roll up into a 0–100 governance score with a risk band."
        scoreLabel="of 100"
        buildingBlocks={[
          "Board composition and independence",
          "Audit committee, statutory auditor tenure and qualifications",
          "Promoter holding, pledging, and changes over time",
          "Related-party transactions and subsidiary structure",
          "Disclosure quality and timeliness on the exchange",
          "Regulatory actions, litigation, and going-concern flags",
        ]}
        pending={[
          "Wire annual-report adapter for board / audit committee data",
          "Wire exchange-filing adapter for disclosures and red flags",
          "Implement scoring rubric in services/calculations/governanceCalc",
          "Render the actual checklist with pass / warn / fail per item",
        ]}
      />
    </div>
  );
}

import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { GovernanceExportButton } from "@/components/governance/GovernanceExportButton";
import { GovernanceFinalSummary } from "@/components/governance/GovernanceFinalSummary";
import { GovernanceKpiCards } from "@/components/governance/GovernanceKpiCards";
import { GovernanceSectionSummaryTable } from "@/components/governance/GovernanceSectionSummaryTable";
import { GovernanceSectionTable } from "@/components/governance/GovernanceSectionTable";
import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import { MOCK_GOVERNANCE_ROWS } from "@/lib/mock/governanceMock";
import {
  calculateGovernanceScore,
  getGovernanceSectionSummaries,
} from "@/lib/services/calculations/governanceCalc";

export default function GovernancePage() {
  const rows = MOCK_GOVERNANCE_ROWS;
  const totals = calculateGovernanceScore(rows);
  const summaries = getGovernanceSectionSummaries(rows);

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader
          title="Corporate Governance Score"
          description="Weighted checklist across board, audit, stakeholders, employee, promoter, exchange compliance, regulatory exposure, and financial-statement quality."
          action={
            <div className="flex items-center gap-3">
              <Badge tone="info">Mock data</Badge>
              <GovernanceExportButton rows={rows} />
            </div>
          }
        />
        <GovernanceKpiCards totals={totals} />
      </Card>

      <Card>
        <CardHeader
          title="Section score summary"
          description="Subtotals and ratings per section. Red Flags counts items scored 0; Low Confidence counts items rated Low confidence."
        />
        <GovernanceSectionSummaryTable summaries={summaries} />
      </Card>

      <div className="grid gap-5">
        {GOVERNANCE_CHECKLIST.map((section) => {
          const sectionRows = rows.filter(
            (r) => r.sectionId === section.sectionId,
          );
          if (sectionRows.length === 0) return null;
          return (
            <GovernanceSectionTable
              key={section.sectionId}
              title={section.title}
              rows={sectionRows}
            />
          );
        })}
      </div>

      <GovernanceFinalSummary totals={totals} />
    </div>
  );
}

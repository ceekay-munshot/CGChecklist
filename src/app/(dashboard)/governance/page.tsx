"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { GovernanceExportButton } from "@/components/governance/GovernanceExportButton";
import { GovernanceFinalSummary } from "@/components/governance/GovernanceFinalSummary";
import { GovernanceKpiCards } from "@/components/governance/GovernanceKpiCards";
import { GovernanceSectionSummaryTable } from "@/components/governance/GovernanceSectionSummaryTable";
import { GovernanceSectionTable } from "@/components/governance/GovernanceSectionTable";
import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import { munsHtmlToGovernanceRows } from "@/lib/munsToGovernance";
import {
  calculateGovernanceScore,
  getGovernanceSectionSummaries,
} from "@/lib/services/calculations/governanceCalc";
import { useCompany } from "@/lib/state/CompanyContext";

export default function GovernancePage() {
  const { state } = useCompany();
  const { munsRaw, munsError } = state;

  const rows = useMemo(() => {
    if (!munsRaw) return [];
    return munsHtmlToGovernanceRows(munsRaw);
  }, [munsRaw]);

  const hasData = rows.length > 0;

  const totals = calculateGovernanceScore(rows);
  const summaries = getGovernanceSectionSummaries(rows);

  if (!hasData) {
    return <GovernanceEmptyState error={munsError} />;
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader
          title="Corporate Governance Score"
          description="Weighted checklist across board, audit, stakeholders, employee, promoter, exchange compliance, regulatory exposure, and financial-statement quality."
          action={
            <div className="flex items-center gap-3">
              <Badge tone="good">Live MUNS data</Badge>
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
              sectionId={section.sectionId}
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

function GovernanceEmptyState({ error }: { error: string | null }) {
  return (
    <Card>
      <CardHeader
        title="Corporate Governance Score"
        description="Weighted checklist across board, audit, stakeholders, employee, promoter, exchange compliance, regulatory exposure, and financial-statement quality."
        action={<Badge tone="unknown">Awaiting data</Badge>}
      />
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <p className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
          {error ? "Couldn't load governance analysis" : "No analysis yet"}
        </p>
        <p className="max-w-md text-sm text-[var(--color-fg-muted)]">
          {error
            ? error
            : "Run an analysis from the header to populate the governance scorecard with live MUNS data."}
        </p>
      </div>
    </Card>
  );
}

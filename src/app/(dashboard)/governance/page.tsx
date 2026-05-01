"use client";

import { useState, useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { GovernanceExportButton } from "@/components/governance/GovernanceExportButton";
import { GovernanceFinalSummary } from "@/components/governance/GovernanceFinalSummary";
import { GovernanceKpiCards } from "@/components/governance/GovernanceKpiCards";
import { GovernanceSectionSummaryTable } from "@/components/governance/GovernanceSectionSummaryTable";
import { GovernanceSectionTable } from "@/components/governance/GovernanceSectionTable";
import { MunsButton } from "@/components/governance/MunsButton";
import { MunsPanel } from "@/components/governance/MunsPanel";
import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import { MOCK_GOVERNANCE_ROWS } from "@/lib/mock/governanceMock";
import { munsHtmlToGovernanceRows } from "@/lib/munsToGovernance";
import {
  calculateGovernanceScore,
  getGovernanceSectionSummaries,
} from "@/lib/services/calculations/governanceCalc";

export default function GovernancePage() {
  const [munsRaw, setMunsRaw] = useState("");
  const [munsError, setMunsError] = useState<string>();
  const [munsOpen, setMunsOpen] = useState(false);

  const handleMunsResult = (result: { raw: string; error?: string }) => {
    setMunsRaw(result.raw);
    setMunsError(result.error);
    setMunsOpen(true);
  };

  const rows = useMemo(() => {
    if (munsRaw && !munsError) {
      return munsHtmlToGovernanceRows(munsRaw);
    }
    return MOCK_GOVERNANCE_ROWS;
  }, [munsRaw, munsError]);
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
              <MunsButton onResult={handleMunsResult} />
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

      <MunsPanel raw={munsRaw} error={munsError} open={munsOpen} />
    </div>
  );
}

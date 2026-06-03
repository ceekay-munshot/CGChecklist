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
import { MOCK_GOVERNANCE_ROWS } from "@/lib/mock/governanceMock";
import {
  calculateGovernanceScore,
  getGovernanceSectionSummaries,
} from "@/lib/services/calculations/governanceCalc";
import { useCompany } from "@/lib/state/CompanyContext";
import { applyVerification } from "@/lib/verify/mergeResults";

const describeAge = (iso: string): string => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
};

export default function GovernancePage() {
  const { state } = useCompany();
  const { governanceRows, verification, dataSource, storedAt, verifying } =
    state;

  const hasVerification = Object.keys(verification).length > 0;

  const rows = useMemo(() => {
    const base =
      governanceRows && governanceRows.length > 0
        ? governanceRows
        : MOCK_GOVERNANCE_ROWS;
    // Routine remarks/sources/scores replace the agent values where verified.
    return hasVerification ? applyVerification(base, verification) : base;
  }, [governanceRows, hasVerification, verification]);

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
              <Badge
                tone={
                  verifying
                    ? "warn"
                    : dataSource === "cache"
                      ? "info"
                      : dataSource === "live"
                        ? "good"
                        : "info"
                }
              >
                {verifying
                  ? "Verifying…"
                  : dataSource === "cache"
                    ? `Saved${
                        storedAt ? ` · ${describeAge(storedAt)}` : ""
                      }`
                    : dataSource === "live"
                      ? hasVerification
                        ? "Verified"
                        : "Live data"
                      : "Mock data"}
              </Badge>
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
              verification={hasVerification ? verification : undefined}
            />
          );
        })}
      </div>

      <GovernanceFinalSummary totals={totals} />
    </div>
  );
}

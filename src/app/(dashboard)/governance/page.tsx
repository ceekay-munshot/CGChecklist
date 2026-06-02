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
  const { munsRaw, munsError, status } = state;

  const rows = useMemo(() => {
    if (!munsRaw || munsError) return [];
    return munsHtmlToGovernanceRows(munsRaw);
  }, [munsRaw, munsError]);

  const isLoading = status === "loading";
  const hasData = rows.length > 0;
  const parsingFailed = Boolean(munsRaw) && !munsError && !hasData;

  const totals = calculateGovernanceScore(rows);
  const summaries = getGovernanceSectionSummaries(rows);

  let statusBadge: { tone: "good" | "info" | "risk" | "warn"; label: string };
  if (munsError) statusBadge = { tone: "risk", label: "API error" };
  else if (parsingFailed) statusBadge = { tone: "warn", label: "Parse error" };
  else if (hasData) statusBadge = { tone: "good", label: "Live MUNS data" };
  else if (isLoading) statusBadge = { tone: "info", label: "Loading…" };
  else statusBadge = { tone: "info", label: "Awaiting analysis" };

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader
          title="Corporate Governance Score"
          description="Weighted checklist across board, audit, stakeholders, employee, promoter, exchange compliance, regulatory exposure, and financial-statement quality."
          action={
            <div className="flex items-center gap-3">
              <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
              {hasData && <GovernanceExportButton rows={rows} />}
            </div>
          }
        />

        {munsError && (
          <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-risk-100)] bg-[var(--color-risk-50)] p-4 text-[13px] leading-relaxed text-[var(--color-risk-700)]">
            <div className="mb-1 font-semibold">MUNS API request failed</div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px]">
              {munsError}
            </pre>
          </div>
        )}

        {parsingFailed && (
          <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-warn-100)] bg-[var(--color-warn-50)] p-4 text-[13px] leading-relaxed text-[var(--color-warn-700)]">
            <div className="mb-1 font-semibold">
              Response returned but no governance rows parsed
            </div>
            <div className="mb-2">
              MUNS responded successfully but the parser produced 0 rows. First
              1,000 characters of the raw response:
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-white/60 p-2 font-mono text-[12px]">
              {munsRaw.slice(0, 1000)}
              {munsRaw.length > 1000 ? `\n… (${munsRaw.length} chars total)` : ""}
            </pre>
          </div>
        )}

        {!munsError && !parsingFailed && !hasData && !isLoading && (
          <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-mist-50)] p-4 text-[13px] text-[var(--color-fg-muted)]">
            Enter a company and ticker, then trigger a refresh to load the
            governance analysis.
          </div>
        )}

        {hasData && <GovernanceKpiCards totals={totals} />}
      </Card>

      {hasData && (
        <Card>
          <CardHeader
            title="Section score summary"
            description="Subtotals and ratings per section. Red Flags counts items scored 0; Low Confidence counts items rated Low confidence."
          />
          <GovernanceSectionSummaryTable summaries={summaries} />
        </Card>
      )}

      {hasData && (
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
      )}

      {hasData && <GovernanceFinalSummary totals={totals} />}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { parseMunsResponse, type ParsedTable } from "@/lib/munsParse";

export interface MunsPanelProps {
  raw: string;
  error?: string;
  open: boolean;
}

const POSITIVE_RESPONSES = [
  "yes",
  "good",
  "high",
  "above",
  "stable",
  "no",
  "debt < advances",
  "cash > accounting",
];

const NEGATIVE_RESPONSES = [
  "poor",
  "below",
  "low",
  "weak",
  "fail",
];

const NEUTRAL_RESPONSES = ["average", "moderate", "medium"];

const responseTone = (value: string): "good" | "warn" | "risk" | "info" => {
  const v = value.trim().toLowerCase();
  if (POSITIVE_RESPONSES.includes(v)) return "good";
  if (NEGATIVE_RESPONSES.includes(v)) return "risk";
  if (NEUTRAL_RESPONSES.includes(v)) return "warn";
  return "info";
};

const isResponseColumn = (header: string) =>
  header.toLowerCase() === "response";

const isScoreColumn = (header: string) => {
  const h = header.toLowerCase();
  return h === "score" || h === "max score" || h === "max";
};

const RenderedTable = ({ table }: { table: ParsedTable }) => {
  const responseHeader = table.headers.find(isResponseColumn);

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[0_1px_2px_rgba(10,20,34,0.04)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-navy-50)] px-4 py-3 sm:px-5">
        <h4 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--color-navy-700)]">
          {table.title}
        </h4>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
              {table.headers.map((header) => (
                <th
                  key={header}
                  className={`px-3 py-2.5 ${
                    isScoreColumn(header) ? "text-right" : ""
                  }`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-[var(--color-border)] align-top last:border-b-0"
              >
                {table.headers.map((header) => {
                  const value = row[header] || "";
                  if (responseHeader && header === responseHeader && value) {
                    return (
                      <td key={header} className="px-3 py-3">
                        <Badge tone={responseTone(value)}>{value}</Badge>
                      </td>
                    );
                  }
                  if (isScoreColumn(header)) {
                    return (
                      <td
                        key={header}
                        className="px-3 py-3 text-right font-semibold text-[var(--color-fg)]"
                        data-numeric
                      >
                        {value}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={header}
                      className="px-3 py-3 text-[var(--color-fg-muted)]"
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export function MunsPanel({ raw, error, open }: MunsPanelProps) {
  const parsed = useMemo(() => (raw ? parseMunsResponse(raw) : null), [raw]);

  if (!open) return null;

  return (
    <Card>
      <CardHeader
        title="MUNS Governance Analysis"
        description="Live MUNS agent output rendered as governance tables."
      />
      {error ? (
        <p className="text-sm text-[var(--color-risk-700)]">{error}</p>
      ) : parsed && parsed.tables.length > 0 ? (
        <div className="space-y-4">
          {parsed.tables.map((table, idx) => (
            <RenderedTable key={`${table.title}-${idx}`} table={table} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-fg-muted)]">
          No data available
        </p>
      )}
    </Card>
  );
}

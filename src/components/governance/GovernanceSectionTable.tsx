import { Badge } from "@/components/ui/Badge";
import type {
  GovernanceConfidence,
  GovernanceRow,
  GovernanceScoreValue,
} from "@/lib/types/governance";

const SCORE_TONE: Record<GovernanceScoreValue, "good" | "warn" | "risk"> = {
  2: "good",
  1: "warn",
  0: "risk",
};

const CONFIDENCE_TONE: Record<GovernanceConfidence, "good" | "warn" | "risk"> = {
  High: "good",
  Medium: "warn",
  Low: "risk",
};

export function GovernanceSectionTable({
  title,
  rows,
}: {
  title: string;
  rows: GovernanceRow[];
}) {
  const subtotal = rows.reduce((acc, r) => acc + r.score, 0);
  const subtotalMax = rows.reduce((acc, r) => acc + r.maxScore, 0);

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[0_1px_2px_rgba(10,20,34,0.04)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-navy-50)] px-4 py-3 sm:px-5">
        <h4 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--color-navy-700)]">
          {title}
        </h4>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
              <th className="w-[28%] px-3 py-2.5">Particulars</th>
              <th className="px-3 py-2.5">Response</th>
              <th className="px-3 py-2.5 text-right">Score</th>
              <th className="px-3 py-2.5 text-right">Max</th>
              <th className="px-3 py-2.5">Remarks</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.questionId}
                className="border-b border-[var(--color-border)] align-top last:border-b-0"
              >
                <td className="px-3 py-3 font-medium text-[var(--color-fg)]">
                  {row.particulars}
                </td>
                <td className="px-3 py-3">
                  <Badge tone={SCORE_TONE[row.score]}>{row.response}</Badge>
                </td>
                <td
                  className={`px-3 py-3 text-right font-semibold ${scoreTextClass(
                    row.score,
                  )}`}
                  data-numeric
                >
                  {row.score}
                </td>
                <td
                  className="px-3 py-3 text-right text-[var(--color-fg-muted)]"
                  data-numeric
                >
                  {row.maxScore}
                </td>
                <td className="px-3 py-3 text-[var(--color-fg-muted)]">
                  {row.remarks}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-[var(--color-fg-muted)]">
                  {row.source}
                </td>
                <td className="px-3 py-3">
                  <Badge tone={CONFIDENCE_TONE[row.confidence]}>
                    {row.confidence}
                  </Badge>
                </td>
              </tr>
            ))}
            <tr className="bg-[var(--color-mist-50)]">
              <td
                colSpan={2}
                className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]"
              >
                Subtotal
              </td>
              <td
                className="px-3 py-2.5 text-right font-semibold text-[var(--color-fg)]"
                data-numeric
              >
                {subtotal}
              </td>
              <td
                className="px-3 py-2.5 text-right font-semibold text-[var(--color-fg)]"
                data-numeric
              >
                {subtotalMax}
              </td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function scoreTextClass(score: GovernanceScoreValue): string {
  if (score === 2) return "text-[var(--color-good-700)]";
  if (score === 1) return "text-[var(--color-warn-700)]";
  return "text-[var(--color-risk-700)]";
}

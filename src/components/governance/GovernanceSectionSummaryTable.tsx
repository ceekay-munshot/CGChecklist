import { Badge } from "@/components/ui/Badge";
import type {
  GovernanceRating,
  GovernanceSectionSummary,
} from "@/lib/types/governance";

const RATING_TONE: Record<GovernanceRating, "good" | "warn" | "risk" | "info"> = {
  Strong: "good",
  Good: "info",
  Moderate: "warn",
  Weak: "risk",
};

export function GovernanceSectionSummaryTable({
  summaries,
}: {
  summaries: GovernanceSectionSummary[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
            <th className="px-3 py-2.5">Section</th>
            <th className="px-3 py-2.5 text-right">Score</th>
            <th className="px-3 py-2.5 text-right">Max Score</th>
            <th className="px-3 py-2.5 text-right">Score %</th>
            <th className="px-3 py-2.5">Rating</th>
            <th className="px-3 py-2.5 text-right">Red Flags</th>
            <th className="px-3 py-2.5 text-right">Low Confidence</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <tr
              key={s.sectionId}
              className="border-b border-[var(--color-border)] last:border-b-0"
            >
              <td className="px-3 py-2.5 font-medium text-[var(--color-fg)]">
                {s.title}
              </td>
              <td
                className="px-3 py-2.5 text-right text-[var(--color-fg)]"
                data-numeric
              >
                {s.score}
              </td>
              <td
                className="px-3 py-2.5 text-right text-[var(--color-fg-muted)]"
                data-numeric
              >
                {s.maxScore}
              </td>
              <td
                className="px-3 py-2.5 text-right text-[var(--color-fg)]"
                data-numeric
              >
                {s.scorePercent.toFixed(1)}%
              </td>
              <td className="px-3 py-2.5">
                <Badge tone={RATING_TONE[s.rating]}>{s.rating}</Badge>
              </td>
              <td
                className={`px-3 py-2.5 text-right ${
                  s.redFlags > 0
                    ? "text-[var(--color-risk-700)] font-semibold"
                    : "text-[var(--color-fg-muted)]"
                }`}
                data-numeric
              >
                {s.redFlags}
              </td>
              <td
                className={`px-3 py-2.5 text-right ${
                  s.lowConfidence > 0
                    ? "text-[var(--color-risk-700)] font-semibold"
                    : "text-[var(--color-fg-muted)]"
                }`}
                data-numeric
              >
                {s.lowConfidence}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

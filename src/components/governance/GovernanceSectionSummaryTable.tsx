"use client";

import { Badge } from "@/components/ui/Badge";
import { sectionAnchorId } from "@/components/governance/GovernanceSectionTable";
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

const scrollToSection = (sectionId: string) => {
  const el = document.getElementById(sectionAnchorId(sectionId));
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
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
              role="button"
              tabIndex={0}
              aria-label={`Jump to ${s.title} section`}
              title={`Jump to ${s.title} section`}
              onClick={() => scrollToSection(s.sectionId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  scrollToSection(s.sectionId);
                }
              }}
              className="group cursor-pointer border-b border-[var(--color-border)] transition-colors last:border-b-0 hover:bg-[var(--color-navy-50)] focus-visible:bg-[var(--color-navy-50)] focus-visible:outline-none"
            >
              <td className="px-3 py-2.5 font-medium text-[var(--color-fg)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="group-hover:text-[var(--color-brand)] group-focus-visible:text-[var(--color-brand)]">
                    {s.title}
                  </span>
                  <JumpArrow />
                </span>
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

function JumpArrow() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      fill="none"
    >
      <path
        d="M8 3v10M8 13l-3.5-3.5M8 13l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

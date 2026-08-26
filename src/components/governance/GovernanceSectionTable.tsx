import { Badge } from "@/components/ui/Badge";
import { formatSource, splitRemarkBullets } from "@/lib/remarks";
import type { GovernanceRow, GovernanceScoreValue } from "@/lib/types/governance";

const SCORE_TONE: Record<GovernanceScoreValue, "good" | "warn" | "risk"> = {
  0.5: "good",
  0.25: "warn",
  0: "risk",
};

// Soft score chip, same token family as Badge.
const SCORE_CHIP: Record<GovernanceScoreValue, string> = {
  0.5: "bg-good-50 text-good-700 ring-good-100",
  0.25: "bg-warn-50 text-warn-700 ring-warn-100",
  0: "bg-risk-50 text-risk-700 ring-risk-100",
};

export const sectionAnchorId = (sectionId: string) => `section-${sectionId}`;

export function GovernanceSectionTable({
  sectionId,
  title,
  rows,
}: {
  sectionId: string;
  title: string;
  rows: GovernanceRow[];
}) {
  const subtotal = rows.reduce((acc, r) => acc + r.score, 0);
  const subtotalMax = rows.reduce((acc, r) => acc + r.maxScore, 0);
  const good = rows.filter((r) => r.score === 0.5).length;
  const partial = rows.filter((r) => r.score === 0.25).length;
  const red = rows.filter((r) => r.score === 0).length;

  return (
    <section
      id={sectionAnchorId(sectionId)}
      className="scroll-mt-6 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[0_1px_2px_rgba(10,20,34,0.04)]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-navy-50)] px-4 py-3 sm:px-5">
        <h4 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--color-navy-700)]">
          {title}
        </h4>
        <div className="flex shrink-0 items-center gap-2 text-[11px] font-semibold" data-numeric>
          {good > 0 && <span className="text-[var(--color-good-700)]">{good} good</span>}
          {partial > 0 && <span className="text-[var(--color-warn-700)]">{partial} partial</span>}
          {red > 0 && <span className="text-[var(--color-risk-700)]">{red} red</span>}
        </div>
      </header>

      <ul className="divide-y divide-[var(--color-border)]">
        {rows.map((row) => (
          <li
            key={row.questionId}
            className="flex flex-col gap-3 px-4 py-4 transition hover:bg-[var(--color-navy-50)]/40 sm:flex-row sm:gap-5 sm:px-5"
          >
            {/* Left rail: numeric score (kept) + verdict */}
            <div className="flex shrink-0 flex-row items-center gap-2.5 sm:w-[116px] sm:flex-col sm:items-start sm:gap-2 sm:pt-0.5">
              <span
                className={`inline-flex items-baseline gap-1 rounded-[var(--radius-control)] px-2.5 py-1 text-sm font-semibold ring-1 ring-inset ${SCORE_CHIP[row.score]}`}
                data-numeric
              >
                {row.score}
                <span className="text-[11px] font-medium opacity-70">/ {row.maxScore}</span>
              </span>
              <Badge tone={SCORE_TONE[row.score]}>{row.response}</Badge>
            </div>

            {/* Center: particulars + readable remark */}
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug text-[var(--color-fg)]">{row.particulars}</p>
              <RemarkBody remarks={row.remarks} />
            </div>

            {/* Right: clean source citation */}
            <div className="flex shrink-0 flex-col items-start gap-1 sm:w-[190px] sm:items-end sm:pt-1">
              <SourceRef source={row.source} />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-mist-50)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)] sm:px-5">
        <span>Subtotal</span>
        <span className="text-[var(--color-fg)]" data-numeric>
          {subtotal} / {subtotalMax}
        </span>
      </div>
    </section>
  );
}

// Render the answer with proper leading and a bounded measure (~65ch) so long
// remarks read as prose instead of over-wrapping in a narrow cell. Multi-bullet
// remarks (MUNS fallback) still render as a list.
function RemarkBody({ remarks }: { remarks: string }) {
  const bullets = splitRemarkBullets(remarks);
  if (bullets.length === 0) return null;
  if (bullets.length === 1) {
    return (
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-[var(--color-fg-muted)]">
        {bullets[0]}
      </p>
    );
  }
  return (
    <ul className="mt-1.5 max-w-prose list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-[var(--color-fg-muted)] marker:text-[var(--color-fg-subtle)]">
      {bullets.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
}

// Clean citation: document name emphasized, page refs compacted to "p.NN" /
// "pp.NN, NN". Full original string kept in the tooltip.
function SourceRef({ source }: { source: string }) {
  const { doc, pages } = formatSource(source);
  if (!doc && pages.length === 0) return null;
  return (
    <span
      title={source}
      className="max-w-full truncate text-left text-[11px] leading-relaxed text-[var(--color-fg-subtle)] sm:text-right"
    >
      {doc && <span className="font-medium text-[var(--color-fg-muted)]">{doc}</span>}
      {pages.length > 0 && (
        <span>
          {doc ? " · " : ""}
          {pages.length > 1 ? "pp." : "p."}
          {pages.join(", ")}
        </span>
      )}
    </span>
  );
}

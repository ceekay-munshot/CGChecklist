import { Badge } from "@/components/ui/Badge";
import { formatSource, splitRemarkBullets } from "@/lib/remarks";
import type { GovernanceRow, GovernanceScoreValue } from "@/lib/types/governance";

const SCORE_TONE: Record<GovernanceScoreValue, "good" | "warn" | "risk"> = {
  0.5: "good",
  0.25: "warn",
  0: "risk",
};

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
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-navy-50)] px-4 py-3 sm:px-6">
        <h4 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--color-navy-700)]">
          {title}
        </h4>
        <div className="flex shrink-0 items-center gap-3 text-[11px] font-semibold" data-numeric>
          {good > 0 && <span className="text-[var(--color-good-700)]">{good} good</span>}
          {partial > 0 && <span className="text-[var(--color-warn-700)]">{partial} partial</span>}
          {red > 0 && <span className="text-[var(--color-risk-700)]">{red} red</span>}
        </div>
      </header>

      {/* Column captions (desktop) */}
      <div className="hidden border-b border-[var(--color-border)] px-6 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-subtle)] sm:grid sm:grid-cols-[150px_minmax(0,1fr)_220px] sm:gap-x-6">
        <span>Score &amp; verdict</span>
        <span>Question &amp; analysis</span>
        <span className="text-right">Source</span>
      </div>

      <ul className="divide-y divide-[var(--color-border)]">
        {rows.map((row) => (
          <li
            key={row.questionId}
            className="grid grid-cols-1 gap-x-6 gap-y-2.5 px-4 py-4 transition hover:bg-[var(--color-navy-50)]/40 sm:grid-cols-[150px_minmax(0,1fr)_220px] sm:items-start sm:px-6"
          >
            {/* Col 1 — score + verdict side by side */}
            <div className="flex flex-row flex-wrap items-center gap-2 sm:pt-0.5">
              <span
                className={`inline-flex items-baseline gap-1 rounded-[var(--radius-control)] px-2.5 py-1 text-sm font-semibold ring-1 ring-inset ${SCORE_CHIP[row.score]}`}
                data-numeric
              >
                {row.score}
                <span className="text-[11px] font-medium opacity-70">/ {row.maxScore}</span>
              </span>
              <Badge tone={SCORE_TONE[row.score]}>{row.response}</Badge>
            </div>

            {/* Col 2 — question + full-width analysis */}
            <div className="min-w-0">
              <p className="font-medium leading-snug text-[var(--color-fg)]">{row.particulars}</p>
              <RemarkBody remarks={row.remarks} />
            </div>

            {/* Col 3 — clickable source */}
            <div className="min-w-0 sm:pt-0.5 sm:text-right">
              <SourceRef source={row.source} url={row.sourceUrl} />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-mist-50)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)] sm:px-6">
        <span>Subtotal</span>
        <span className="text-[var(--color-fg)]" data-numeric>
          {subtotal} / {subtotalMax}
        </span>
      </div>
    </section>
  );
}

// Full-width answer with proper leading — fills the analysis column instead of
// wrapping narrow. Multi-bullet remarks (MUNS fallback) render as a list.
function RemarkBody({ remarks }: { remarks: string }) {
  const bullets = splitRemarkBullets(remarks);
  if (bullets.length === 0) return null;
  if (bullets.length === 1) {
    return (
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-fg-muted)]">{bullets[0]}</p>
    );
  }
  return (
    <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-[var(--color-fg-muted)] marker:text-[var(--color-fg-subtle)]">
      {bullets.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
}

// Clean citation. Clickable (opens the source) when the engine supplied a URL;
// otherwise plain text with the full string on hover.
function SourceRef({ source, url: rowUrl }: { source: string; url?: string }) {
  const { doc, pages, url: parsedUrl } = formatSource(source);
  const url = rowUrl || parsedUrl;
  if (!doc && pages.length === 0 && !url) return null;

  const label = (
    <>
      {doc && <span className="font-medium">{doc}</span>}
      {pages.length > 0 && (
        <span>
          {doc ? " · " : ""}
          {pages.length > 1 ? "pp." : "p."}
          {pages.join(", ")}
        </span>
      )}
    </>
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={source}
        className="focus-ring inline-flex items-center gap-1 rounded text-[11px] leading-relaxed text-[var(--color-teal-700)] transition hover:underline"
      >
        {label}
        <ArrowUpRight />
      </a>
    );
  }
  return (
    <span
      title={source}
      className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]"
    >
      {label}
    </span>
  );
}

function ArrowUpRight() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3 w-3 shrink-0" fill="none">
      <path
        d="M5 11l6-6M6 5h5v5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

import { Badge } from "@/components/ui/Badge";
import type {
  GovernanceConfidence,
  GovernanceRow,
  GovernanceScoreValue,
} from "@/lib/types/governance";
import type { VerificationVerdict } from "@/lib/verify/types";
import type { VerificationMap } from "@/lib/verify/mergeResults";

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

const VERDICT_TONE: Record<
  VerificationVerdict,
  "good" | "warn" | "risk" | "unknown"
> = {
  supported: "good",
  partially_supported: "warn",
  contradicted: "risk",
  unverifiable: "unknown",
};

const VERDICT_LABEL: Record<VerificationVerdict, string> = {
  supported: "Supported",
  partially_supported: "Partial",
  contradicted: "Contradicted",
  unverifiable: "Unverifiable",
};

export function GovernanceSectionTable({
  title,
  rows,
  verification,
}: {
  title: string;
  rows: GovernanceRow[];
  verification?: VerificationMap;
}) {
  const showVerification = Boolean(verification);
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
        <table
          className={`w-full ${
            showVerification ? "min-w-[1320px]" : "min-w-[1080px]"
          } border-collapse text-sm`}
        >
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
              <th className="w-[28%] px-3 py-2.5">Particulars</th>
              <th className="px-3 py-2.5">Response</th>
              <th className="px-3 py-2.5 text-right">Score</th>
              <th className="px-3 py-2.5 text-right">Max</th>
              <th className="px-3 py-2.5">Remarks</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Confidence</th>
              {showVerification ? (
                <th className="px-3 py-2.5">Web-verified</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.questionId}
                className="border-b border-[var(--color-border)] align-top last:border-b-0"
              >
                <td className="px-3 py-3 font-medium text-[var(--color-fg)] [overflow-wrap:anywhere]">
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
                <td className="px-3 py-3 text-[var(--color-fg-muted)] [overflow-wrap:anywhere]">
                  {row.remarks}
                </td>
                <td className="px-3 py-3 text-[var(--color-fg-muted)]">
                  <SourceCell
                    source={row.source}
                    citations={verification?.[row.questionId]?.citations}
                  />
                </td>
                <td className="px-3 py-3">
                  <Badge tone={CONFIDENCE_TONE[row.confidence]}>
                    {row.confidence}
                  </Badge>
                </td>
                {showVerification ? (
                  <td className="px-3 py-3">
                    <VerificationCell result={verification?.[row.questionId]} />
                  </td>
                ) : null}
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
              <td colSpan={showVerification ? 4 : 3} />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VerificationCell({
  result,
}: {
  result?: VerificationMap[string];
}) {
  if (!result) {
    return <span className="text-xs text-[var(--color-fg-subtle)]">—</span>;
  }
  return (
    <div className="flex max-w-[14rem] flex-col gap-1">
      <Badge tone={VERDICT_TONE[result.verdict]}>
        {VERDICT_LABEL[result.verdict]}
      </Badge>
      {result.notes ? (
        <p className="text-xs text-[var(--color-fg-muted)] [overflow-wrap:anywhere]">
          {result.notes}
        </p>
      ) : null}
    </div>
  );
}

function SourceCell({
  source,
  citations,
}: {
  source: string;
  citations?: VerificationMap[string]["citations"];
}) {
  if (citations && citations.length > 0) {
    return (
      <div className="flex max-w-[12rem] flex-col gap-0.5">
        {citations.slice(0, 3).map((citation, idx) => (
          <a
            key={`${citation.url}-${idx}`}
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--color-teal-700)] underline [overflow-wrap:anywhere]"
            title={citation.title || citation.url}
          >
            {citation.title || `Source ${idx + 1}`}
          </a>
        ))}
      </div>
    );
  }
  return <span className="whitespace-nowrap">{source}</span>;
}

function scoreTextClass(score: GovernanceScoreValue): string {
  if (score === 2) return "text-[var(--color-good-700)]";
  if (score === 1) return "text-[var(--color-warn-700)]";
  return "text-[var(--color-risk-700)]";
}

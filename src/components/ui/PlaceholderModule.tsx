import type { ReactNode } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

type PlaceholderModuleProps = {
  title: string;
  subtitle: string;
  scoreLabel: string;
  /** Bullet points describing what this module will compute. */
  buildingBlocks: string[];
  /** What's hooked up vs what's still pending. */
  pending: string[];
  trailing?: ReactNode;
};

export function PlaceholderModule({
  title,
  subtitle,
  scoreLabel,
  buildingBlocks,
  pending,
  trailing,
}: PlaceholderModuleProps) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader title="Headline score" subtitle="Awaiting data" />
        <CardBody>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl font-semibold tabular text-[var(--color-text-primary)]">
              —
            </span>
            <span className="text-sm text-[var(--color-text-muted)]">
              {scoreLabel}
            </span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Enter a company in the header and click{" "}
            <span className="font-medium text-[var(--color-text-primary)]">
              Refresh Data
            </span>
            . The score will populate from the calculation pipeline once the
            data adapters are wired up.
          </p>
          <div className="mt-5">
            <Badge tone="muted">Module pending</Badge>
          </div>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title={title} subtitle={subtitle} trailing={trailing} />
        <CardBody className="space-y-6">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              What this tab will show
            </h4>
            <ul className="mt-3 space-y-2">
              {buildingBlocks.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm text-[var(--color-text-secondary)]"
                >
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-teal-500)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Pending in this build
            </h4>
            <ul className="mt-3 space-y-2">
              {pending.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm text-[var(--color-text-secondary)]"
                >
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-blue-muted-300)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </CardBody>
      </Card>
    </div>
  );
}

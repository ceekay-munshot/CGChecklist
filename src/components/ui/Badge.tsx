import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "info"
  | "good"
  | "warn"
  | "risk"
  | "muted";

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral:
    "bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)]",
  info: "bg-[var(--color-info-50)] text-[var(--color-info-500)] border-[var(--color-info-50)]",
  good: "bg-[var(--color-good-50)] text-[var(--color-good-600)] border-[var(--color-good-50)]",
  warn: "bg-[var(--color-warn-50)] text-[var(--color-warn-600)] border-[var(--color-warn-50)]",
  risk: "bg-[var(--color-risk-50)] text-[var(--color-risk-600)] border-[var(--color-risk-50)]",
  muted:
    "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border)]",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide " +
        TONE_STYLES[tone] +
        " " +
        className
      }
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: BadgeTone }) {
  const colour =
    tone === "good"
      ? "bg-[var(--color-good-500)]"
      : tone === "warn"
        ? "bg-[var(--color-warn-500)]"
        : tone === "risk"
          ? "bg-[var(--color-risk-500)]"
          : tone === "info"
            ? "bg-[var(--color-info-500)]"
            : "bg-[var(--color-blue-muted-300)]";
  return (
    <span className={"inline-block h-1.5 w-1.5 rounded-full " + colour} />
  );
}

import type { Verdict } from "@/lib/types/scores";

type Tone = Verdict | "neutral" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  good: "bg-good-50 text-good-700 ring-good-100",
  warn: "bg-warn-50 text-warn-700 ring-warn-100",
  risk: "bg-risk-50 text-risk-700 ring-risk-100",
  unknown: "bg-mist-100 text-mist-700 ring-mist-200",
  neutral: "bg-mist-100 text-mist-700 ring-mist-200",
  info: "bg-teal-50 text-teal-700 ring-teal-100",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const dotColor: Record<Tone, string> = {
    good: "bg-good-500",
    warn: "bg-warn-500",
    risk: "bg-risk-500",
    unknown: "bg-mist-400",
    neutral: "bg-mist-400",
    info: "bg-teal-500",
  };
  return (
    <span
      aria-hidden
      className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor[tone]}`}
    />
  );
}

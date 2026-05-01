"use client";

import { useToast, type ToastTone } from "@/lib/state/ToastContext";

const TONE_STYLES: Record<
  ToastTone,
  { container: string; accent: string; iconBg: string; icon: React.ReactNode }
> = {
  info: {
    container: "border-[var(--color-border)] bg-white",
    accent: "bg-teal-500",
    iconBg: "bg-teal-50 text-teal-700",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.75 11.5a.75.75 0 11-1.5 0v-4a.75.75 0 011.5 0v4zM10 6.5a1 1 0 110 2 1 1 0 010-2z" />
      </svg>
    ),
  },
  success: {
    container: "border-good-100 bg-white",
    accent: "bg-good-500",
    iconBg: "bg-good-50 text-good-700",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z" />
      </svg>
    ),
  },
  warning: {
    container: "border-warn-100 bg-white",
    accent: "bg-warn-500",
    iconBg: "bg-warn-50 text-warn-700",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M10 2.2a1 1 0 01.86.5l7.4 12.7a1 1 0 01-.86 1.5H2.6a1 1 0 01-.86-1.5l7.4-12.7A1 1 0 0110 2.2zm.75 11.3a.75.75 0 10-1.5 0 .75.75 0 001.5 0zm-.75-6.5a.75.75 0 00-.75.75V12a.75.75 0 001.5 0V7.75A.75.75 0 0010 7z" />
      </svg>
    ),
  },
  error: {
    container: "border-risk-100 bg-white",
    accent: "bg-risk-500",
    iconBg: "bg-risk-50 text-risk-700",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm3.5 10.1a1 1 0 11-1.4 1.4L10 11.4l-2.1 2.1a1 1 0 11-1.4-1.4L8.6 10 6.5 7.9a1 1 0 011.4-1.4L10 8.6l2.1-2.1a1 1 0 011.4 1.4L11.4 10l2.1 2.1z" />
      </svg>
    ),
  },
};

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
    >
      {toasts.map((t) => {
        const style = TONE_STYLES[t.tone];
        return (
          <div
            key={t.id}
            role={t.tone === "error" || t.tone === "warning" ? "alert" : "status"}
            className={`pointer-events-auto relative overflow-hidden rounded-[var(--radius-card)] border ${style.container} shadow-[0_8px_24px_rgba(10,20,34,0.08)]`}
          >
            <div className={`absolute inset-y-0 left-0 w-1 ${style.accent}`} />
            <div className="flex items-start gap-3 px-4 py-3 pl-5">
              <span
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style.iconBg}`}
                aria-hidden
              >
                {style.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--color-fg)]">
                  {t.title}
                </p>
                {t.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-fg-muted)]">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="focus-ring -mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-fg-subtle)] transition hover:bg-[var(--color-navy-50)] hover:text-[var(--color-fg)]"
              >
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M5.3 5.3a1 1 0 011.4 0L10 8.6l3.3-3.3a1 1 0 111.4 1.4L11.4 10l3.3 3.3a1 1 0 11-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 11-1.4-1.4L8.6 10 5.3 6.7a1 1 0 010-1.4z" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

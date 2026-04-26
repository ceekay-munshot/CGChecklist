"use client";

import { Badge, Dot, type BadgeTone } from "@/components/ui/Badge";
import type { DataStatus } from "@/lib/types/company";

const STATUS_MAP: Record<
  DataStatus,
  { label: string; tone: BadgeTone; description: string }
> = {
  idle: {
    label: "No data",
    tone: "muted",
    description: "Awaiting first refresh",
  },
  loading: {
    label: "Refreshing",
    tone: "info",
    description: "Pulling sources",
  },
  ready: {
    label: "Ready",
    tone: "good",
    description: "Sources resolved",
  },
  partial: {
    label: "Partial",
    tone: "warn",
    description: "Some sources missing",
  },
  stale: {
    label: "Stale",
    tone: "warn",
    description: "Refresh recommended",
  },
  error: {
    label: "Error",
    tone: "risk",
    description: "Last refresh failed",
  },
};

export function StatusBadge({ status }: { status: DataStatus }) {
  const meta = STATUS_MAP[status];
  return (
    <div className="inline-flex items-center gap-2">
      <Badge tone={meta.tone}>
        <Dot tone={meta.tone} />
        {meta.label}
      </Badge>
      <span className="text-xs text-[var(--color-text-muted)]">
        {meta.description}
      </span>
    </div>
  );
}

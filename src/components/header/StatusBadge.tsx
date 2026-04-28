"use client";

import { Badge, Dot } from "@/components/ui/Badge";
import { useCompany } from "@/lib/state/CompanyContext";

const STATUS_LABEL = {
  idle: "No data",
  loading: "Refreshing…",
  partial: "Partial",
  ready: "Ready",
  error: "Error",
} as const;

const STATUS_TONE = {
  idle: "neutral",
  loading: "info",
  partial: "warn",
  ready: "good",
  error: "risk",
} as const;

export function StatusBadge() {
  const { state } = useCompany();
  const tone = STATUS_TONE[state.status];
  return (
    <Badge tone={tone}>
      <Dot tone={tone} />
      {STATUS_LABEL[state.status]}
    </Badge>
  );
}

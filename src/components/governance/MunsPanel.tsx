"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { cleanStreamToMarkdown, MarkdownProse } from "@/../../MunsRenderer";

export interface MunsPanelProps {
  html: string;
  raw: string;
  error?: string;
  open: boolean;
}

export function MunsPanel({ html, raw, error, open }: MunsPanelProps) {
  if (!open) return null;

  const cleaned = useMemo(() => {
    if (!raw) return "";
    return cleanStreamToMarkdown(raw);
  }, [raw]);

  return (
    <Card>
      <CardHeader title="MUNS Governance Analysis" />
      <div className="p-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : cleaned ? (
          <MarkdownProse content={cleaned} />
        ) : (
          <p className="text-sm text-muted-foreground">No data available</p>
        )}
      </div>
    </Card>
  );
}

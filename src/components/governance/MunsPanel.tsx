"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { MunsAgentOutput } from "../../../MunsRenderer";

export interface MunsPanelProps {
  html: string;
  raw: string;
  error?: string;
  open: boolean;
}

export function MunsPanel({ html, raw, error, open }: MunsPanelProps) {
  if (!open) return null;

  return (
    <Card>
      <CardHeader title="MUNS Governance Analysis" />
      <div className="p-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : html ? (
          <MunsAgentOutput markdown={html} raw={raw} />
        ) : (
          <p className="text-sm text-muted-foreground">No data available</p>
        )}
      </div>
    </Card>
  );
}

"use client";

import { Card, CardHeader } from "@/components/ui/Card";

export interface MunsPanelProps {
  html: string;
  error?: string;
  open: boolean;
}

export function MunsPanel({ html, error, open }: MunsPanelProps) {
  if (!open) return null;

  return (
    <Card>
      <CardHeader title="MUNS Governance Analysis" />
      <div className="p-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <div className="prose max-w-none overflow-auto">
            <div
              dangerouslySetInnerHTML={{ __html: html }}
              className="text-sm leading-relaxed"
            />
          </div>
        )}
      </div>
    </Card>
  );
}

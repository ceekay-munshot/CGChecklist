"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { parseMunsResponse } from "@/lib/munsParse";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface MunsPanelProps {
  html: string;
  raw: string;
  error?: string;
  open: boolean;
}

export function MunsPanel({ html, raw, error, open }: MunsPanelProps) {
  if (!open) return null;

  const parsed = useMemo(() => {
    if (!html) return null;
    return parseMunsResponse(html);
  }, [html]);

  return (
    <Card>
      <CardHeader title="MUNS Governance Analysis" />
      <div className="space-y-8 p-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : parsed?.tables && parsed.tables.length > 0 ? (
          parsed.tables.map((table, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                {table.title}
              </h3>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      {table.headers.map((header) => (
                        <TableHead
                          key={header}
                          className="font-semibold text-xs whitespace-nowrap"
                        >
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {table.rows.map((row, rowIdx) => (
                      <TableRow key={rowIdx}>
                        {table.headers.map((header) => (
                          <TableCell
                            key={`${rowIdx}-${header}`}
                            className="text-xs py-2"
                          >
                            {row[header] || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No data available</p>
        )}
      </div>
    </Card>
  );
}

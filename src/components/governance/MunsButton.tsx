"use client";

import { useState } from "react";
import { fetchGovernanceAnalysis } from "@/lib/munsClient";

export interface MunsButtonProps {
  onResult: (result: { raw: string; error?: string }) => void;
}

export function MunsButton({ onResult }: MunsButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    try {
      const result = await fetchGovernanceAnalysis();
      if (result.ok) {
        onResult({ raw: result.raw });
      } else {
        onResult({ raw: result.raw || "", error: result.error || "Unknown error" });
      }
    } catch (error) {
      onResult({
        raw: "",
        error: error instanceof Error ? error.message : "Failed to fetch",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleFetch}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-surface-alt)] disabled:opacity-60"
    >
      {loading ? "Loading..." : "MUNS Analysis"}
    </button>
  );
}

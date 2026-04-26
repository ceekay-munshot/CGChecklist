"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { EMPTY_COMPANY_QUERY } from "@/lib/mock/sampleCompany";
import type { CompanyQuery, DataStatus } from "@/lib/types/company";

type CompanyContextValue = {
  query: CompanyQuery;
  setQuery: (next: CompanyQuery) => void;
  patchQuery: (patch: Partial<CompanyQuery>) => void;

  status: DataStatus;
  lastRefreshedAt: string | null;
  isRefreshing: boolean;

  refresh: () => Promise<void>;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState<CompanyQuery>(EMPTY_COMPANY_QUERY);
  const [status, setStatus] = useState<DataStatus>("idle");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const patchQuery = useCallback((patch: Partial<CompanyQuery>) => {
    setQuery((prev) => ({ ...prev, ...patch }));
  }, []);

  const refresh = useCallback(async () => {
    /*
      Placeholder refresh flow.
      Real implementation will call:
        resolveCompany -> discoverSources -> adapters -> calculations -> dataQuality
      For now we just simulate a short loading delay so the UI plumbing is real.
    */
    setIsRefreshing(true);
    setStatus("loading");
    await new Promise((resolve) => setTimeout(resolve, 900));
    setLastRefreshedAt(new Date().toISOString());
    setStatus("ready");
    setIsRefreshing(false);
  }, []);

  const value = useMemo<CompanyContextValue>(
    () => ({
      query,
      setQuery,
      patchQuery,
      status,
      lastRefreshedAt,
      isRefreshing,
      refresh,
    }),
    [query, patchQuery, status, lastRefreshedAt, isRefreshing, refresh]
  );

  return (
    <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
  );
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error("useCompany must be used inside <CompanyProvider>");
  }
  return ctx;
}

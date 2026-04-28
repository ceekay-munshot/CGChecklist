"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type {
  CompanyIdentity,
  CompanyState,
  DataStatus,
} from "@/lib/types/company";
import { EMPTY_COMPANY } from "@/lib/mock/sampleCompany";

interface CompanyContextValue {
  state: CompanyState;
  setIdentity: (
    patch: Partial<CompanyIdentity>,
  ) => void;
  refresh: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

const INITIAL_STATE: CompanyState = {
  identity: EMPTY_COMPANY,
  status: "idle",
  lastRefreshedAt: null,
  message: null,
};

export function CompanyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<CompanyState>(INITIAL_STATE);

  const setIdentity = useCallback((patch: Partial<CompanyIdentity>) => {
    setState((prev) => ({
      ...prev,
      identity: { ...prev.identity, ...patch },
    }));
  }, []);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "loading", message: null }));
    await new Promise((resolve) => setTimeout(resolve, 900));
    setState((prev) => {
      const status: DataStatus = isComplete(prev.identity) ? "partial" : "idle";
      return {
        ...prev,
        status,
        lastRefreshedAt: new Date().toISOString(),
        message: isComplete(prev.identity)
          ? "Mock refresh complete. Real data adapters are not wired yet."
          : "Enter company name, ticker, exchange, and country to refresh.",
      };
    });
  }, []);

  const value = useMemo<CompanyContextValue>(
    () => ({ state, setIdentity, refresh }),
    [state, setIdentity, refresh],
  );

  return (
    <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error("useCompany must be used inside <CompanyProvider>");
  }
  return ctx;
}

function isComplete(identity: CompanyIdentity) {
  return Boolean(
    identity.name.trim() &&
      identity.ticker.trim() &&
      identity.exchange &&
      identity.country,
  );
}

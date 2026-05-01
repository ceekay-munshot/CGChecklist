"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CompanyIdentity,
  CompanyState,
  DataStatus,
} from "@/lib/types/company";
import { EMPTY_COMPANY } from "@/lib/mock/sampleCompany";
import { fetchGovernanceAnalysis } from "@/lib/munsClient";

interface CompanyContextValue {
  state: CompanyState;
  setIdentity: (patch: Partial<CompanyIdentity>) => void;
  refresh: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

const INITIAL_STATE: CompanyState = {
  identity: EMPTY_COMPANY,
  status: "idle",
  lastRefreshedAt: null,
  message: null,
  munsRaw: "",
  munsError: null,
};

export function CompanyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<CompanyState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const setIdentity = useCallback((patch: Partial<CompanyIdentity>) => {
    setState((prev) => ({
      ...prev,
      identity: { ...prev.identity, ...patch },
    }));
  }, []);

  const refresh = useCallback(async () => {
    const identity = stateRef.current.identity;

    if (!isComplete(identity)) {
      setState((prev) => ({
        ...prev,
        status: "error",
        message: "Enter company name, ticker, exchange, and country first.",
        munsError: "Missing company details.",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      status: "loading",
      message: null,
      munsError: null,
    }));

    const result = await fetchGovernanceAnalysis({
      ticker: identity.ticker,
      companyName: identity.name,
      country: identity.country || undefined,
    });

    setState((prev) => {
      const status: DataStatus = result.ok ? "ready" : "error";
      return {
        ...prev,
        status,
        lastRefreshedAt: new Date().toISOString(),
        message: result.ok
          ? "Live MUNS analysis loaded."
          : result.error || "Failed to fetch MUNS analysis.",
        munsRaw: result.ok ? result.raw : "",
        munsError: result.ok ? null : result.error || "Failed to fetch.",
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

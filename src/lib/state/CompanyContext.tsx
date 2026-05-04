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
  RefreshOutcome,
} from "@/lib/types/company";
import { EMPTY_COMPANY } from "@/lib/mock/sampleCompany";
import { fetchGovernanceAnalysis } from "@/lib/munsClient";
import { diffMuns } from "@/lib/refresh/diffMuns";

interface CompanyContextValue {
  state: CompanyState;
  setIdentity: (patch: Partial<CompanyIdentity>) => void;
  refresh: () => Promise<void>;
  dismissProgress: () => void;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

const INITIAL_STATE: CompanyState = {
  identity: EMPTY_COMPANY,
  status: "idle",
  lastRefreshedAt: null,
  message: null,
  munsRaw: "",
  munsError: null,
  progress: {
    startedAt: null,
    finishedAt: null,
    outcome: null,
    diff: null,
    error: null,
  },
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
        message: "Enter company name and ticker first.",
        munsError: "Missing company details.",
      }));
      return;
    }

    const previousRaw = stateRef.current.munsRaw;

    setState((prev) => ({
      ...prev,
      status: "loading",
      message: null,
      munsError: null,
      progress: {
        startedAt: Date.now(),
        finishedAt: null,
        outcome: null,
        diff: null,
        error: null,
      },
    }));

    const result = await fetchGovernanceAnalysis({
      ticker: identity.ticker,
      companyName: identity.name,
      country: identity.country || undefined,
    });

    setState((prev) => {
      const status: DataStatus = result.ok ? "ready" : "error";
      const outcome: RefreshOutcome = result.ok ? "success" : "error";
      const newRaw = result.ok ? result.raw : prev.munsRaw;
      const diff = result.ok ? diffMuns(previousRaw, result.raw) : null;
      return {
        ...prev,
        status,
        lastRefreshedAt: new Date().toISOString(),
        message: result.ok
          ? "Live MUNS analysis loaded."
          : result.error || "Failed to fetch MUNS analysis.",
        munsRaw: newRaw,
        munsError: result.ok ? null : result.error || "Failed to fetch.",
        progress: {
          startedAt: prev.progress.startedAt,
          finishedAt: Date.now(),
          outcome,
          diff,
          error: result.ok ? null : result.error || "Failed to fetch.",
        },
      };
    });
  }, []);

  const dismissProgress = useCallback(() => {
    setState((prev) => ({
      ...prev,
      progress: {
        startedAt: prev.progress.startedAt,
        finishedAt: prev.progress.finishedAt,
        outcome: null,
        diff: null,
        error: null,
      },
    }));
  }, []);

  const value = useMemo<CompanyContextValue>(
    () => ({ state, setIdentity, refresh, dismissProgress }),
    [state, setIdentity, refresh, dismissProgress],
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
  return Boolean(identity.name.trim() && identity.ticker.trim());
}

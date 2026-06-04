"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { recordRefreshHistory } from "@/lib/refresh/history";

interface CompanyContextValue {
  state: CompanyState;
  dashboardUnlocked: boolean;
  setIdentity: (patch: Partial<CompanyIdentity>) => void;
  refresh: () => Promise<void>;
  cancel: () => void;
  dismissProgress: () => void;
  unlockDashboard: () => void;
  lockDashboard: () => void;
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
    cancelled: false,
  },
};

export function CompanyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<CompanyState>(INITIAL_STATE);
  const [dashboardUnlocked, setDashboardUnlocked] = useState(false);
  const stateRef = useRef(state);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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

    // Abort any run still in flight before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

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
        cancelled: false,
      },
    }));

    const result = await fetchGovernanceAnalysis(
      {
        ticker: identity.ticker,
        companyName: identity.name,
        country: identity.country || undefined,
      },
      { signal: controller.signal },
    );

    // Ignore the outcome of a run that has been superseded by a newer one.
    if (abortRef.current !== controller) return;
    abortRef.current = null;

    if (result.cancelled) {
      // Roll back to where we were: keep prior data if we had any, otherwise
      // return to the empty/idle state so the start form reappears.
      const hadData = Boolean(previousRaw.trim());
      setState((prev) => ({
        ...prev,
        status: hadData ? "ready" : "idle",
        message: "Run cancelled.",
        progress: {
          startedAt: null,
          finishedAt: Date.now(),
          outcome: null,
          diff: null,
          error: null,
          cancelled: true,
        },
      }));
      return;
    }

    const refreshedAtIso = new Date().toISOString();
    const outcome: RefreshOutcome = result.ok ? "success" : "error";

    setState((prev) => {
      const status: DataStatus = result.ok ? "ready" : "error";
      const newRaw = result.ok ? result.raw : prev.munsRaw;
      const diff = result.ok ? diffMuns(previousRaw, result.raw) : null;
      return {
        ...prev,
        status,
        lastRefreshedAt: refreshedAtIso,
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
          cancelled: false,
        },
      };
    });

    recordRefreshHistory(identity, outcome, refreshedAtIso);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const unlockDashboard = useCallback(() => setDashboardUnlocked(true), []);
  const lockDashboard = useCallback(() => setDashboardUnlocked(false), []);

  const dismissProgress = useCallback(() => {
    setState((prev) => ({
      ...prev,
      progress: {
        startedAt: prev.progress.startedAt,
        finishedAt: prev.progress.finishedAt,
        outcome: null,
        diff: null,
        error: null,
        cancelled: false,
      },
    }));
  }, []);

  const value = useMemo<CompanyContextValue>(
    () => ({
      state,
      dashboardUnlocked,
      setIdentity,
      refresh,
      cancel,
      dismissProgress,
      unlockDashboard,
      lockDashboard,
    }),
    [
      state,
      dashboardUnlocked,
      setIdentity,
      refresh,
      cancel,
      dismissProgress,
      unlockDashboard,
      lockDashboard,
    ],
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

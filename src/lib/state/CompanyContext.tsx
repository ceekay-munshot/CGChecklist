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
  RefreshOutcome,
} from "@/lib/types/company";
import { EMPTY_COMPANY } from "@/lib/mock/sampleCompany";
import { fetchGovernanceAnalysis } from "@/lib/munsClient";
import { munsHtmlToGovernanceRows } from "@/lib/munsToGovernance";
import {
  fetchCachedGovernance,
  pollVerification,
  startVerification,
} from "@/lib/verify/verifyClient";
import { indexResults } from "@/lib/verify/mergeResults";
import { diffMuns } from "@/lib/refresh/diffMuns";
import { recordRefreshHistory } from "@/lib/refresh/history";

interface CompanyContextValue {
  state: CompanyState;
  dashboardUnlocked: boolean;
  setIdentity: (patch: Partial<CompanyIdentity>) => void;
  refresh: () => Promise<void>;
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
  },
  governanceRows: null,
  verification: {},
  dataSource: null,
  storedAt: null,
  verifying: false,
};

const describeAge = (iso: string): string => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

export function CompanyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<CompanyState>(INITIAL_STATE);
  const [dashboardUnlocked, setDashboardUnlocked] = useState(false);
  const stateRef = useRef(state);

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

    const company = {
      name: identity.name,
      ticker: identity.ticker,
      country: identity.country || undefined,
    };
    const previousRaw = stateRef.current.munsRaw;

    setState((prev) => ({
      ...prev,
      status: "loading",
      message: "Checking saved analysis…",
      munsError: null,
      verifying: false,
      verification: {},
      progress: {
        startedAt: Date.now(),
        finishedAt: null,
        outcome: null,
        diff: null,
        error: null,
      },
    }));

    // 1. Cache-first: serve a stored run if one landed within the last 15 days.
    const cached = await fetchCachedGovernance(
      identity.ticker,
      identity.country || undefined,
    );
    if (cached.fromCache && cached.rows) {
      const refreshedAtIso = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        status: "ready",
        lastRefreshedAt: refreshedAtIso,
        message: `Loaded saved analysis (verified ${describeAge(
          cached.storedAt || refreshedAtIso,
        )}).`,
        governanceRows: cached.rows ?? null,
        verification: indexResults(cached.results ?? []),
        dataSource: "cache",
        storedAt: cached.storedAt ?? null,
        verifying: false,
        progress: {
          startedAt: prev.progress.startedAt,
          finishedAt: Date.now(),
          outcome: "success",
          diff: null,
          error: null,
        },
      }));
      recordRefreshHistory(identity, "success", refreshedAtIso);
      return;
    }

    // 2. Cache miss / stale → run the live MUNS agent.
    setState((prev) => ({ ...prev, message: "Running MUNS analysis…" }));
    const result = await fetchGovernanceAnalysis({
      ticker: identity.ticker,
      companyName: identity.name,
      country: identity.country || undefined,
    });

    if (!result.ok) {
      const refreshedAtIso = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        status: "error",
        lastRefreshedAt: refreshedAtIso,
        message: result.error || "Failed to fetch MUNS analysis.",
        munsError: result.error || "Failed to fetch.",
        verifying: false,
        progress: {
          startedAt: prev.progress.startedAt,
          finishedAt: Date.now(),
          outcome: "error",
          diff: null,
          error: result.error || "Failed to fetch.",
        },
      }));
      recordRefreshHistory(identity, "error", refreshedAtIso);
      return;
    }

    const rows = munsHtmlToGovernanceRows(result.raw);
    const diff = diffMuns(previousRaw, result.raw);

    // Show the MUNS rows immediately; verification fills in next.
    setState((prev) => ({
      ...prev,
      status: "partial",
      munsRaw: result.raw,
      munsError: null,
      governanceRows: rows,
      dataSource: "live",
      storedAt: null,
      verifying: true,
      message: "Verifying remarks via web search… this can take a few minutes.",
      progress: { ...prev.progress, diff },
    }));

    // 3. Fire the verification routine and wait for its callback.
    const refreshedAtIso = new Date().toISOString();
    // The run itself succeeded once MUNS returned; verification is best-effort.
    const outcome: RefreshOutcome = "success";
    let message = "Analysis verified and saved.";
    let verification = {};

    const started = await startVerification(company, rows);
    if (!started.ok || !started.runId) {
      message = `Loaded MUNS analysis. Verification couldn't start: ${
        started.error || "unknown error"
      }`;
    } else {
      const verified = await pollVerification(started.runId);
      if (verified.ok) {
        verification = indexResults(verified.results ?? []);
      } else {
        message = `Loaded MUNS analysis. Verification failed: ${
          verified.error || "unknown error"
        }`;
      }
    }

    setState((prev) => ({
      ...prev,
      status: "ready",
      lastRefreshedAt: refreshedAtIso,
      message,
      verification,
      verifying: false,
      progress: {
        startedAt: prev.progress.startedAt,
        finishedAt: Date.now(),
        outcome,
        diff,
        error: null,
      },
    }));

    recordRefreshHistory(identity, outcome, refreshedAtIso);
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
      },
    }));
  }, []);

  const value = useMemo<CompanyContextValue>(
    () => ({
      state,
      dashboardUnlocked,
      setIdentity,
      refresh,
      dismissProgress,
      unlockDashboard,
      lockDashboard,
    }),
    [
      state,
      dashboardUnlocked,
      setIdentity,
      refresh,
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

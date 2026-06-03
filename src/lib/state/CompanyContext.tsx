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
import type { CompanyIdentity, CompanyState } from "@/lib/types/company";
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
  logs: [],
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
    const startedAt = Date.now();

    const log = (line: string) => {
      const secs = Math.floor((Date.now() - startedAt) / 1000);
      setState((prev) => ({ ...prev, logs: [...prev.logs, `[+${secs}s] ${line}`] }));
    };

    setState((prev) => ({
      ...prev,
      status: "loading",
      message: "Checking saved analysis…",
      munsError: null,
      verifying: false,
      verification: {},
      logs: [],
      progress: {
        startedAt,
        finishedAt: null,
        outcome: null,
        diff: null,
        error: null,
      },
    }));
    log("Checking saved analysis (15-day cache)…");

    // 1. Cache-first: serve a stored run if one landed within the last 15 days.
    const cached = await fetchCachedGovernance(
      identity.ticker,
      identity.country || undefined,
    );
    if (cached.fromCache && cached.rows) {
      const refreshedAtIso = new Date().toISOString();
      const age = describeAge(cached.storedAt || refreshedAtIso);
      log(`Cache hit — serving saved analysis (verified ${age}).`);
      setState((prev) => ({
        ...prev,
        status: "ready",
        lastRefreshedAt: refreshedAtIso,
        message: `Loaded saved analysis (verified ${age}).`,
        governanceRows: cached.rows ?? null,
        verification: indexResults(cached.results ?? []),
        dataSource: "cache",
        storedAt: cached.storedAt ?? null,
        verifying: false,
        progress: {
          startedAt,
          finishedAt: Date.now(),
          outcome: "success",
          diff: null,
          error: null,
        },
      }));
      recordRefreshHistory(identity, "success", refreshedAtIso);
      return;
    }
    log("No saved run within 15 days — running MUNS agent…");

    // 2. Cache miss / stale → run the live MUNS agent.
    setState((prev) => ({ ...prev, message: "Running MUNS analysis (7–9 min)…" }));
    const result = await fetchGovernanceAnalysis({
      ticker: identity.ticker,
      companyName: identity.name,
      country: identity.country || undefined,
    });

    if (!result.ok) {
      const refreshedAtIso = new Date().toISOString();
      log(`MUNS failed: ${result.error || "unknown error"}`);
      setState((prev) => ({
        ...prev,
        status: "error",
        lastRefreshedAt: refreshedAtIso,
        message: result.error || "Failed to fetch MUNS analysis.",
        munsError: result.error || "Failed to fetch.",
        verifying: false,
        progress: {
          startedAt,
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
    log(`MUNS analysis loaded — ${rows.length} checklist rows.`);

    // Keep the run on the progress screen; stash rows and start verifying.
    setState((prev) => ({
      ...prev,
      munsRaw: result.raw,
      munsError: null,
      governanceRows: rows,
      verification: {},
      dataSource: "live",
      storedAt: null,
      verifying: true,
      message: "Verifying remarks via web search…",
    }));

    // 3. Fire the verification routine and wait for its callback — still on the
    // progress screen, so the dashboard only opens once the run is fully done.
    log("Firing verification routine…");
    let message = "Analysis verified and saved.";
    let verification = {};

    const started = await startVerification(company, rows);
    if (!started.ok || !started.runId) {
      log(`Verification couldn't start: ${started.error || "unknown error"}`);
      message = `Loaded MUNS analysis. Verification couldn't start: ${
        started.error || "unknown error"
      }`;
    } else {
      if (started.callbackUrl) log(`Callback URL: ${started.callbackUrl}`);
      if (started.sessionUrl) log(`Routine session: ${started.sessionUrl}`);
      log("Verifying remarks via web search… (polling for callback)");
      let lastTick = Date.now();
      const verified = await pollVerification(started.runId, {
        onTick: () => {
          if (Date.now() - lastTick >= 30_000) {
            lastTick = Date.now();
            const secs = Math.floor((Date.now() - startedAt) / 1000);
            log(`Still verifying… (${secs}s elapsed)`);
          }
        },
      });
      if (verified.ok) {
        verification = indexResults(verified.results ?? []);
        log(`Verification complete — ${verified.results?.length ?? 0} remark(s) verified.`);
      } else {
        log(`Verification failed: ${verified.error || "unknown error"}`);
        message = `Loaded MUNS analysis. Verification failed: ${
          verified.error || "unknown error"
        }`;
      }
    }

    // 4. Finalize → status "ready" opens the dashboard.
    const refreshedAtIso = new Date().toISOString();
    log("Opening dashboard…");
    setState((prev) =>
      // Guard against a newer run having replaced this one while we waited.
      prev.governanceRows === rows
        ? {
            ...prev,
            status: "ready",
            lastRefreshedAt: refreshedAtIso,
            message,
            verification,
            verifying: false,
            progress: {
              startedAt,
              finishedAt: Date.now(),
              outcome: "success",
              diff,
              error: null,
            },
          }
        : prev,
    );
    recordRefreshHistory(identity, "success", refreshedAtIso);
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

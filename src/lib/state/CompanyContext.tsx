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
import {
  dispatchEngineRun,
  fetchEngineReport,
  pollEngineReport,
  type EngineReport,
} from "@/lib/reportClient";
import { diffMuns } from "@/lib/refresh/diffMuns";
import { recordRefreshHistory } from "@/lib/refresh/history";

interface CompanyContextValue {
  state: CompanyState;
  dashboardUnlocked: boolean;
  setIdentity: (patch: Partial<CompanyIdentity>) => void;
  refresh: (options?: { force?: boolean }) => Promise<void>;
  /** Trigger the source-first engine (GitHub Actions → KV) and load its report. */
  runEngineAnalysis: (options?: { force?: boolean }) => Promise<void>;
  /** Load an existing engine report for the current company without re-running. */
  loadEngineReport: () => Promise<boolean>;
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
    live: null,
  },
  engineRows: null,
  engineMeta: null,
};

// Turn a loaded engine report into the state patch that surfaces it. Shared by
// the "just view it" and "run then view" paths so both render identically.
function engineReportPatch(report: EngineReport) {
  return {
    engineRows: report.rows,
    engineMeta: {
      ticker: report.ticker,
      company: report.company,
      total: report.total,
      max: report.max,
      storedAt: report.storedAt,
      harvestNote: report.harvestNote,
    },
  };
}

const LIVE_LOG_CAP = 8;

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

  const refresh = useCallback(async (options?: { force?: boolean }) => {
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
        live: { completed: 0, total: 0, failed: 0, log: [] },
      },
    }));

    const result = await fetchGovernanceAnalysis(
      {
        ticker: identity.ticker,
        companyName: identity.name,
        country: identity.country || undefined,
      },
      {
        signal: controller.signal,
        force: options?.force,
        onProgress: (e) => {
          // Ignore late events from a superseded run.
          if (abortRef.current !== controller) return;
          setState((prev) => {
            const prevLive = prev.progress.live ?? {
              completed: 0,
              total: 0,
              failed: 0,
              log: [],
            };
            const label =
              e.phase === "mega"
                ? e.particulars || `Chain ${e.chain}: chat session ready`
                : `${e.section} — ${e.particulars}`;
            const item = {
              chain: e.chain,
              label,
              ok: e.ok,
              error: e.error,
            };
            return {
              ...prev,
              progress: {
                ...prev.progress,
                live: {
                  completed: e.completed,
                  total: e.total,
                  failed: prevLive.failed + (e.ok ? 0 : 1),
                  log: [item, ...prevLive.log].slice(0, LIVE_LOG_CAP),
                },
              },
            };
          });
        },
      },
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
          live: null,
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
      // Reflect when the analysis was actually produced: for a cached run that
      // is the KV store time; for a fresh run it is now.
      const dataAsOf = result.cached
        ? result.cachedAt ?? refreshedAtIso
        : refreshedAtIso;
      return {
        ...prev,
        status,
        lastRefreshedAt: result.ok ? dataAsOf : prev.lastRefreshedAt,
        message: result.ok
          ? result.errorCount && result.errorCount > 0
            ? `Live MUNS analysis loaded — ${result.errorCount} of ${result.total} questions failed. Run again to retry them.`
            : "Live MUNS analysis loaded."
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
          live: prev.progress.live,
        },
      };
    });

    recordRefreshHistory(identity, outcome, refreshedAtIso);
  }, []);

  // Load an existing engine report (no run). Used when a company is selected so
  // a previously-produced report shows up instantly.
  const loadEngineReport = useCallback(async () => {
    const identity = stateRef.current.identity;
    if (!identity.ticker.trim()) return false;
    const report = await fetchEngineReport(
      identity.ticker,
      identity.country || undefined,
    );
    if (!report) return false;
    setState((prev) => ({ ...prev, ...engineReportPatch(report) }));
    return true;
  }, []);

  // Run the source-first engine: dispatch the GitHub Actions workflow, then poll
  // KV until the report lands. Drives the same loading/success/error UI as the
  // MUNS refresh, so the SelectionPanel flow is unchanged for the user.
  const runEngineAnalysis = useCallback(
    async (options?: { force?: boolean }) => {
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
      const country = identity.country || undefined;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const superseded = () => abortRef.current !== controller;

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
          live: null,
        },
      }));

      const rollbackCancel = () => {
        if (abortRef.current === controller) abortRef.current = null;
        const hadData = Boolean(stateRef.current.engineRows || stateRef.current.munsRaw.trim());
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
            live: null,
          },
        }));
      };

      const finishError = (msg: string) => {
        if (abortRef.current === controller) abortRef.current = null;
        setState((prev) => ({
          ...prev,
          status: "error",
          message: msg,
          munsError: msg,
          progress: { ...prev.progress, finishedAt: Date.now(), outcome: "error", error: msg },
        }));
      };

      const finishSuccess = (report: EngineReport) => {
        if (abortRef.current === controller) abortRef.current = null;
        const iso = report.storedAt ?? new Date().toISOString();
        setState((prev) => ({
          ...prev,
          status: "ready",
          lastRefreshedAt: iso,
          message: "Source-first engine report loaded.",
          munsError: null,
          ...engineReportPatch(report),
          progress: { ...prev.progress, finishedAt: Date.now(), outcome: "success", error: null },
        }));
        recordRefreshHistory(identity, "success", new Date().toISOString());
      };

      // Fast path: an existing report satisfies a non-forced request instantly.
      let watermark: string | null = null;
      const existing = await fetchEngineReport(identity.ticker, country, controller.signal);
      if (superseded()) return;
      if (controller.signal.aborted) return rollbackCancel();
      if (existing && !options?.force) return finishSuccess(existing);
      watermark = existing?.storedAt ?? null;

      // Dispatch the workflow, then wait for a report newer than the watermark.
      const dispatch = await dispatchEngineRun(identity.ticker, identity.name, controller.signal);
      if (superseded()) return;
      if (controller.signal.aborted) return rollbackCancel();
      if (!dispatch.ok) {
        return finishError(dispatch.error || "Couldn't start the analysis run.");
      }

      const report = await pollEngineReport(identity.ticker, country, {
        signal: controller.signal,
        after: watermark,
      });
      if (superseded()) return;
      if (controller.signal.aborted) return rollbackCancel();
      if (report) return finishSuccess(report);
      finishError(
        "Run dispatched, but it hasn't finished yet — the engine can take several minutes. Use “Run analysis” again shortly to load the finished report.",
      );
    },
    [],
  );

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
        live: null,
      },
    }));
  }, []);

  const value = useMemo<CompanyContextValue>(
    () => ({
      state,
      dashboardUnlocked,
      setIdentity,
      refresh,
      runEngineAnalysis,
      loadEngineReport,
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
      runEngineAnalysis,
      loadEngineReport,
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

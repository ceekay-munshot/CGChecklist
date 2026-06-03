import type { GovernanceRow } from "@/lib/types/governance";
import { rowsToVerificationInput } from "./buildPayload";
import type {
  VerificationCompany,
  VerificationResultItem,
  VerificationResultResponse,
} from "./types";

export interface StartVerificationResult {
  ok: boolean;
  runId?: string;
  sessionUrl?: string;
  error?: string;
}

// Kick off a routine run. Returns a runId the caller then polls.
export const startVerification = async (
  company: VerificationCompany,
  rows: GovernanceRow[],
): Promise<StartVerificationResult> => {
  try {
    const response = await fetch("/api/verify/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company,
        rows: rowsToVerificationInput(rows),
      }),
    });
    const data = (await response.json()) as StartVerificationResult;
    if (!data.ok) {
      return { ok: false, error: data.error || "Failed to start verification." };
    }
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: `Failed to start verification: ${message}` };
  }
};

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onTick?: (status: VerificationResultResponse["status"]) => void;
}

export interface PollVerificationResult {
  ok: boolean;
  results?: VerificationResultItem[];
  error?: string;
}

const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

// Poll /api/verify/result until the routine callback lands, errors, or we time
// out. Routine runs take minutes, so the default timeout is generous.
export const pollVerification = async (
  runId: string,
  options: PollOptions = {},
): Promise<PollVerificationResult> => {
  const intervalMs = options.intervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      return { ok: false, error: "Verification cancelled." };
    }
    try {
      const response = await fetch(
        `/api/verify/result?runId=${encodeURIComponent(runId)}`,
        { signal: options.signal },
      );
      const data = (await response.json()) as VerificationResultResponse;
      options.onTick?.(data.status);

      if (data.status === "done") {
        return { ok: true, results: data.results ?? [] };
      }
      if (data.status === "error") {
        return { ok: false, error: data.error || "Verification failed." };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { ok: false, error: "Verification cancelled." };
      }
      // Transient network/poll error — keep trying until the deadline.
    }

    try {
      await delay(intervalMs, options.signal);
    } catch {
      return { ok: false, error: "Verification cancelled." };
    }
  }

  return { ok: false, error: "Verification timed out." };
};

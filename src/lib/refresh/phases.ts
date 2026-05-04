export interface RefreshPhase {
  id: string;
  label: string;
  startMs: number;
}

export const REFRESH_PHASES: RefreshPhase[] = [
  { id: "connecting", label: "Connecting to MUNS agent", startMs: 0 },
  { id: "sending", label: "Sending request payload", startMs: 15_000 },
  { id: "fetching", label: "Agent retrieving company filings", startMs: 45_000 },
  {
    id: "governance",
    label: "Analyzing governance disclosures",
    startMs: 150_000,
  },
  {
    id: "audit",
    label: "Reviewing audit & compliance signals",
    startMs: 270_000,
  },
  { id: "finalizing", label: "Finalizing findings", startMs: 390_000 },
  {
    id: "overflow",
    label: "Still working — this is taking a bit longer than usual",
    startMs: 510_000,
  },
];

export function currentPhaseIndex(elapsedMs: number): number {
  let idx = 0;
  for (let i = 0; i < REFRESH_PHASES.length; i++) {
    if (elapsedMs >= REFRESH_PHASES[i].startMs) idx = i;
  }
  return idx;
}

export function progressPercent(
  elapsedMs: number,
  finished: boolean,
): number {
  if (finished) return 100;
  const m = elapsedMs / 60_000;
  if (m <= 0.25) return 5 + (m / 0.25) * 5;
  if (m <= 8) return 10 + ((m - 0.25) / 7.75) * 70;
  if (m <= 12) return 80 + ((m - 8) / 4) * 10;
  return 90;
}

export function formatElapsed(elapsedMs: number): string {
  const totalSec = Math.floor(elapsedMs / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const ss = (totalSec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

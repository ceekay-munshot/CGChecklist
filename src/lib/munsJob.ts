import { getMunsKv, type KVNamespaceLike } from "@/lib/munsCache";

// ---------------------------------------------------------------------------
// Job store
//
// A "job" is the server-side coordination record for one in-flight governance
// run. It exists so a run can outlive the browser that started it: the client
// starts the run, then polls this record for progress and the final result.
//
// The DURABLE result of a successful run is the run cache (munsCache) — a job
// record is deliberately short-lived, only long enough to cover a run plus a
// returning client. If a job record is lost, a completed run is still served
// from the run cache; an incomplete one is simply restarted.
// ---------------------------------------------------------------------------

export type JobStatus = "running" | "done" | "error";

/** The most recent progress snapshot, shaped for the client's progress UI. */
export interface JobProgress {
  chain: "A" | "B";
  phase: "mega" | "question";
  section: string;
  particulars: string;
  ok: boolean;
  error?: string;
  completed: number;
  total: number;
  failed: number;
}

export interface JobRecord {
  status: JobStatus;
  ticker: string;
  country: string;
  startedAt: number; // epoch ms
  updatedAt: number; // epoch ms — doubles as the coordinator heartbeat
  progress: JobProgress;
  /** Final assembled markdown (status === "done"). */
  raw?: string;
  /** Per-question failure count in a partial-but-usable run. */
  errorCount?: number;
  total?: number;
  /** Failure reason (status === "error"). */
  error?: string;
  /** True when the result was served from a stored run, not freshly computed. */
  cached?: boolean;
  cachedAt?: string;
}

// Jobs are ephemeral coordination records; keep them only long enough to
// out-live a run and a client that steps away and comes back.
const JOB_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * A "running" job whose heartbeat is older than this is treated as dead — its
 * coordinator invocation was almost certainly evicted mid-run — so the next
 * start is allowed to relaunch it rather than wait forever on a corpse.
 */
export const JOB_STALE_MS = 90 * 1000;

/** Build the KV key identifying the job for a ticker in a given country. */
export const jobKey = (input: { ticker: string; country: string }): string =>
  `job:${input.country.toUpperCase()}:${input.ticker.toUpperCase()}`;

// In-process fallback for environments without a KV binding (plain `next dev`):
// the detached coordinator and the status poll share a single Node process, so
// a module-level map suffices there. Never relied upon in production, where
// separate invocations don't share memory and a KV binding is always present.
const memoryStore = new Map<string, JobRecord>();

/** Read a job record. Missing/parse failure resolves to `null`. */
export const getJob = async (
  key: string,
  kv?: KVNamespaceLike | null,
): Promise<JobRecord | null> => {
  const ns = getMunsKv(kv);
  if (!ns) return memoryStore.get(key) ?? null;
  try {
    const stored = await ns.get(key);
    if (!stored) return null;
    return JSON.parse(stored) as JobRecord;
  } catch {
    return null;
  }
};

/**
 * Write a job record. Best-effort: a dropped write only costs progress
 * fidelity, never the run itself — the coordinator keeps going and still writes
 * the durable run cache on success.
 */
export const putJob = async (
  key: string,
  record: JobRecord,
  kv?: KVNamespaceLike | null,
): Promise<void> => {
  const ns = getMunsKv(kv);
  if (!ns) {
    memoryStore.set(key, record);
    return;
  }
  try {
    await ns.put(key, JSON.stringify(record), {
      expirationTtl: JOB_TTL_SECONDS,
    });
  } catch {
    // Intentionally swallowed — see the note above.
  }
};

/** True when a running job's heartbeat is stale enough to relaunch. */
export const isStale = (record: JobRecord, now: number): boolean =>
  record.status === "running" && now - record.updatedAt > JOB_STALE_MS;

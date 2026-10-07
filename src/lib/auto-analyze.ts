import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

// Client-side "analyze it now" queue for call recordings.
//
// The server cron (audio-analytics.analyze-pending, every few minutes) is
// the backstop for every recording, but it means a freshly uploaded voice
// note can sit unanalyzed for minutes -- or forever, if the cron isn't
// scheduled on a given deployment. This queue starts the analysis the
// moment a recording is uploaded (and for the user's own still-pending
// uploads whenever Audio tahlil is open), one call at a time, and keeps
// retrying with growing pauses while the AI provider is overloaded (its
// 503/429 "juda band" answer) instead of giving up on the first try.
//
// Module-level on purpose: one queue per browser tab, shared by every
// component, so the same call is never sent twice from this tab.

export type AutoAnalyzeState =
  | { status: "queued" }
  | { status: "running" }
  | { status: "waiting"; retryAt: number; attempt: number }
  | { status: "failed"; error: string }
  | { status: "done" };

const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 240_000, 480_000];

const states = new Map<string, AutoAnalyzeState>();
const queue: string[] = [];
const listeners = new Set<() => void>();
let running = false;
let queryClient: QueryClient | null = null;
let snapshot: ReadonlyMap<string, AutoAnalyzeState> = new Map();

function emit() {
  snapshot = new Map(states);
  for (const l of listeners) l();
}

function setState(callId: string, state: AutoAnalyzeState) {
  states.set(callId, state);
  emit();
}

function isOverload(message: string): boolean {
  return /juda band|overload|unavailable|503|429|rate limit|timed out|timeout|aborted/i.test(
    message,
  );
}

async function analyzeOnce(callId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await apiFetch("/audio-analytics/analyze", {
      method: "POST",
      body: JSON.stringify({ callId }),
    });
    const text = await res.text();
    let json: { error?: string } = {};
    try {
      json = JSON.parse(text) as { error?: string };
    } catch {
      // non-JSON (gateway timeout page etc.) -- treat as a transient failure
      if (!res.ok) return { ok: false, error: `HTTP ${res.status} timeout` };
    }
    if (!res.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const callId = queue.shift()!;
      const prev = states.get(callId);
      const attempt = prev?.status === "waiting" ? prev.attempt : 0;
      setState(callId, { status: "running" });
      const result = await analyzeOnce(callId);
      if (result.ok) {
        setState(callId, { status: "done" });
        void queryClient?.invalidateQueries({ queryKey: ["amocrm_calls"] });
        void queryClient?.invalidateQueries({ queryKey: ["leads"] });
        continue;
      }
      if (isOverload(result.error) && attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt]!;
        setState(callId, { status: "waiting", retryAt: Date.now() + delay, attempt: attempt + 1 });
        setTimeout(() => {
          if (states.get(callId)?.status !== "waiting") return;
          queue.push(callId);
          void pump();
        }, delay);
        continue;
      }
      setState(callId, { status: "failed", error: result.error });
      toast.error(result.error);
    }
  } finally {
    running = false;
  }
}

/** Start (or restart) background analysis of one recording. */
export function enqueueCallAnalysis(callId: string) {
  const s = states.get(callId);
  if (s && (s.status === "queued" || s.status === "running" || s.status === "waiting")) return;
  if (s?.status === "done") return;
  setState(callId, { status: "queued" });
  queue.push(callId);
  void pump();
}

export function useAutoAnalyzeStates(): ReadonlyMap<string, AutoAnalyzeState> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}

/** Lets the queue refresh call lists after each analysis; mount once. */
export function useRegisterAutoAnalyzeClient() {
  const qc = useQueryClient();
  useEffect(() => {
    queryClient = qc;
  }, [qc]);
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Pause, Phone, PhoneForwarded, Play, SkipForward, Square } from "lucide-react";
import { DeskBlock } from "@/components/dashboard/desk/DeskParts";
import { usePhone } from "@/components/phone/PhoneProvider";
import {
  useCallSettings,
  useDialList,
  useFunnelNames,
  usePbxCall,
  usePipelineStagesRaw,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { nextToDial, type DialResult } from "@/lib/phone-center";
import { cn } from "@/lib/utils";

// Avto-qo'ng'iroq: the leads of the chosen stages are called one after
// another through the PBX -- the next call starts a few seconds after the
// last one ended. The salesperson can pause, skip or stop at any time, and
// sees each lead's result.

type RunState = "idle" | "running" | "paused";

const RESULT_TONE: Record<DialResult, string> = {
  answered: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  noAnswer: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  failed: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  skipped: "bg-muted text-muted-foreground",
};

export function AutoDialer({ connected }: { connected: boolean }) {
  const { t } = useI18n();
  const { call, live, enabled } = usePhone();
  const { names: funnels } = useFunnelNames();
  const { data: stages = [] } = usePipelineStagesRaw();
  const [funnel, setFunnel] = useState<string>("");
  const [picked, setPicked] = useState<string[]>([]);
  // Starts from Admin → Qo'ng'iroq sozlamalari; the person may change it here.
  const { value: callRules } = useCallSettings();
  const [gap, setGap] = useState(callRules.autoGap);
  useEffect(() => setGap(callRules.autoGap), [callRules.autoGap]);
  const funnelStages = useMemo(
    () =>
      stages
        .filter((s) => (s.pipeline_name ?? "") === funnel && !s.is_won && !s.is_lost)
        .sort((a, b) => a.position - b.position),
    [stages, funnel],
  );
  const { data: queue = [], isFetching } = useDialList(funnel || null, picked);
  const [results, setResults] = useState<Record<string, DialResult>>({});
  const [run, setRun] = useState<RunState>("idle");
  const [current, setCurrent] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const { data: liveRow } = usePbxCall(live?.id ?? null);

  // The current call's result, once the PBX says it ended.
  const status = liveRow?.status;
  const ended = status === "completed" || status === "failed" || status === "no_answer";
  useEffect(() => {
    if (!current || !live || live.leadId !== current || !ended) return;
    const r: DialResult =
      status === "completed" && (liveRow?.duration_seconds ?? 0) > 0
        ? "answered"
        : status === "failed"
          ? "failed"
          : "noAnswer";
    setResults((m) => (m[current] ? m : { ...m, [current]: r }));
    setCurrent(null);
    setWaitUntil(Date.now() + gap * 1000);
  }, [current, live, ended, status, liveRow?.duration_seconds, gap]);

  // A call that never got an id (the PBX refused it) ends the turn too.
  useEffect(() => {
    if (current && !live) {
      setResults((m) => (m[current] ? m : { ...m, [current]: "failed" }));
      setCurrent(null);
      setWaitUntil(Date.now() + gap * 1000);
    }
  }, [current, live, gap]);

  useEffect(() => {
    if (run !== "running" || !waitUntil) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [run, waitUntil]);

  // The next call: when running, nothing is ringing and the pause is over.
  const nextIdx = nextToDial(queue, results);
  const finished = queue.length > 0 && nextIdx === -1;
  const placing = useRef(false);
  useEffect(() => {
    if (run !== "running" || current || live || placing.current) return;
    if (waitUntil && now < waitUntil) return;
    if (nextIdx === -1) {
      setRun("idle");
      return;
    }
    const item = queue[nextIdx]!;
    placing.current = true;
    setWaitUntil(null);
    setCurrent(item.leadId);
    call(item.phone, { leadId: item.leadId, name: item.name });
    window.setTimeout(() => (placing.current = false), 500);
  }, [run, current, live, waitUntil, now, nextIdx, queue, call]);

  function skip() {
    const id = current ?? (nextIdx >= 0 ? queue[nextIdx]!.leadId : null);
    if (!id) return;
    setResults((m) => ({ ...m, [id]: m[id] ?? "skipped" }));
    if (id === current) setCurrent(null);
    setWaitUntil(null);
  }

  function stop() {
    setRun("idle");
    setWaitUntil(null);
  }

  const done = Object.keys(results).filter((id) => queue.some((q) => q.leadId === id)).length;
  const answered = queue.filter((q) => results[q.leadId] === "answered").length;
  const left = waitUntil ? Math.max(0, Math.ceil((waitUntil - now) / 1000)) : 0;
  const select =
    "h-9 rounded-[6px] border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary disabled:opacity-60";

  return (
    <div className="space-y-4">
      <DeskBlock tipKey="ptel.b.auto" title={t("ptel.s.auto")} icon={PhoneForwarded} tone="rose">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <label className="block text-[12.5px] font-semibold text-muted-foreground">
            {t("ptel.auto.funnel")}
            <select
              value={funnel}
              disabled={run !== "idle"}
              onChange={(e) => {
                setFunnel(e.target.value);
                setPicked([]);
                setResults({});
              }}
              className={cn(select, "mt-1 w-full")}
            >
              <option value="">{t("ptel.auto.pickFunnel")}</option>
              {funnels.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="text-[12.5px] font-semibold text-muted-foreground">
              {t("ptel.auto.stages")}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {funnelStages.length === 0 && (
                <span className="py-1.5 text-[12.5px] text-muted-foreground">
                  {t("ptel.auto.pickFunnelFirst")}
                </span>
              )}
              {funnelStages.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    disabled={run !== "idle"}
                    onClick={() => {
                      setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]));
                      setResults({});
                    }}
                    className={cn(
                      "h-8 rounded-[6px] border px-2.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60",
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block text-[12.5px] font-semibold text-muted-foreground">
            {t("ptel.auto.gap")}
            <select
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
              className={cn(select, "mt-1 w-full")}
            >
              {[5, 10, 15, 30, 60].map((s) => (
                <option key={s} value={s}>
                  {t("ptel.auto.sec", { n: s })}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {run === "running" ? (
            <button
              type="button"
              onClick={() => setRun("paused")}
              className="ctl-soft inline-flex h-10 items-center gap-2 rounded-[6px] px-4 text-[13px] font-semibold"
            >
              <Pause className="h-4 w-4" /> {t("ptel.auto.pause")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (finished) setResults({});
                setRun("running");
              }}
              disabled={!enabled || !connected || queue.length === 0 || !!(live && !current)}
              className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-emerald-600 px-4 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />{" "}
              {run === "paused"
                ? t("ptel.auto.resume")
                : finished
                  ? t("ptel.auto.again")
                  : t("ptel.auto.start")}
            </button>
          )}
          <button
            type="button"
            onClick={skip}
            disabled={run === "idle" || nextIdx === -1}
            className="ctl-soft inline-flex h-10 items-center gap-2 rounded-[6px] px-4 text-[13px] font-semibold disabled:opacity-50"
          >
            <SkipForward className="h-4 w-4" /> {t("ptel.auto.skip")}
          </button>
          <button
            type="button"
            onClick={stop}
            disabled={run === "idle"}
            className="ctl-soft inline-flex h-10 items-center gap-2 rounded-[6px] px-4 text-[13px] font-semibold text-rose-600 disabled:opacity-50 dark:text-rose-300"
          >
            <Square className="h-4 w-4" /> {t("ptel.auto.stop")}
          </button>
          <span className="ml-auto text-[13px] tabular-nums text-muted-foreground">
            {run === "running" && waitUntil && !current
              ? t("ptel.auto.next", { n: left }) + " · "
              : ""}
            {t("ptel.auto.progress", { done, total: queue.length, ok: answered })}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width]"
            style={{ width: `${queue.length ? Math.round((done / queue.length) * 100) : 0}%` }}
          />
        </div>
        {!connected && (
          <p className="mt-3 text-[12.5px] text-amber-700 dark:text-amber-300">
            {t("ptel.auto.needPbx")}
          </p>
        )}
      </DeskBlock>

      <section className="surface-card overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 text-[14px] font-semibold">
          {t("ptel.auto.queue")}
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </header>
        {queue.length === 0 ? (
          <p className="px-4 py-12 text-center text-[13px] text-muted-foreground">
            {t("ptel.auto.empty")}
          </p>
        ) : (
          <ol className="max-h-[480px] divide-y divide-border overflow-y-auto">
            {queue.map((q, k) => {
              const r = results[q.leadId];
              const now_ = current === q.leadId;
              return (
                <li
                  key={q.leadId}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 text-[13px]",
                    now_ && "bg-emerald-500/[0.07]",
                  )}
                >
                  <span className="w-6 text-right tabular-nums text-muted-foreground">{k + 1}</span>
                  <span className="min-w-0 flex-1">
                    <Link
                      to="/crm/leads/$leadId"
                      params={{ leadId: q.leadId }}
                      className="block truncate font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {q.name || t("phone.unknown")}
                    </Link>
                    <span className="block tabular-nums text-[12px] text-muted-foreground">
                      {q.phone}
                    </span>
                  </span>
                  {now_ ? (
                    <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-emerald-500/12 px-2 py-0.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">
                      <Phone className="h-3.5 w-3.5 animate-pulse" /> {t("ptel.auto.calling")}
                    </span>
                  ) : r ? (
                    <span
                      className={cn(
                        "rounded-[4px] px-2 py-0.5 text-[12px] font-semibold",
                        RESULT_TONE[r],
                      )}
                    >
                      {t(`ptel.auto.r.${r}`)}
                    </span>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">
                      {t("ptel.auto.waiting")}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

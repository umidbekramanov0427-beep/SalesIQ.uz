import { useMemo, useState } from "react";
import { BookmarkPlus, Check, Loader2, Plus, Sparkles, Trash2, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { eventName } from "@/components/marketing/ViewersChart";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  CONSOLE_KINDS,
  EVENT_COLOR,
  NUMBERED_KINDS,
  nextSeq,
  parsePlan,
  planVsActual,
  smsEffect,
  stageLosses,
  totalAt,
  type EventKind,
  type PlanItem,
  type TimelinePoint,
  type WebinarEvent,
} from "@/lib/webinar-timeline";
import { useWebinarMutations, useWebinarTemplates, type WebinarRow } from "@/hooks/use-crm-data";

// A webinar's live parts: the console pressed during the stream, the list
// of events (time editable, viewers at that moment), how many were lost
// between one event and the next, and the scenario against what happened.

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const num = (n: number) => n.toLocaleString("ru-RU").replace(/\u00a0/g, " ");
const pctText = (p: number) => `${p > 0 ? "+" : ""}${Math.round(p * 100)}%`;

/* ---- Efir pulti ------------------------------------------------------- */

export function LiveConsole({ w, events }: { w: WebinarRow; events: WebinarEvent[] }) {
  const { t } = useI18n();
  const m = useWebinarMutations();
  const [label, setLabel] = useState("");
  const [smsCount, setSmsCount] = useState("");
  const [busy, setBusy] = useState<EventKind | null>(null);

  async function press(kind: EventKind) {
    const seq = NUMBERED_KINDS.has(kind) ? nextSeq(events, kind) : null;
    const count = kind === "sms_sent" && smsCount ? Number(smsCount) : null;
    setBusy(kind);
    try {
      await m.addMark.mutateAsync({
        webinarId: w.id,
        kind,
        seq,
        label: kind === "custom" ? label.trim() || null : null,
        meta: count ? { count } : null,
      });
      toast.success(t("mkt.wb.marked", { name: eventName(t, { kind, seq, label: null }) }));
      if (kind === "custom") setLabel("");
      if (kind === "sms_sent") setSmsCount("");
    } catch (e) {
      toast.error(describeError(e, t("mkt.wb.saveFailed")));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CONSOLE_KINDS.map((k) => {
          const seq = NUMBERED_KINDS.has(k) ? nextSeq(events, k) : null;
          return (
            <button
              key={k}
              type="button"
              disabled={!!busy}
              onClick={() => void press(k)}
              className="ctl-soft relative flex h-[64px] flex-col items-start justify-center gap-1 rounded-xl px-3 text-left disabled:opacity-60"
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: EVENT_COLOR[k] }}
                />
                {t(`mkt.ev.${k}`)}
                {seq != null && <span className="tabular-nums text-muted-foreground">{seq}</span>}
              </span>
              <span className="text-[11px] text-muted-foreground">{t(`mkt.ev.hint.${k}`)}</span>
              {busy === k && (
                <Loader2 className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={smsCount}
          onChange={(e) => setSmsCount(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder={t("mkt.wb.smsCountPh")}
          className="h-9 rounded-lg border border-border bg-input px-3 text-[13px] tabular-nums outline-none focus:border-primary"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          placeholder={t("mkt.wb.customPh")}
          className="h-9 rounded-lg border border-border bg-input px-3 text-[13px] outline-none focus:border-primary"
        />
      </div>
    </div>
  );
}

/* ---- Voqealar ----------------------------------------------------------- */

export function EventsList({
  events,
  points,
  peak,
}: {
  events: WebinarEvent[];
  points: TimelinePoint[];
  peak: number | null;
}) {
  const { t } = useI18n();
  const m = useWebinarMutations();
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  if (!sorted.length)
    return <p className="py-8 text-center text-sm text-muted-foreground">{t("mkt.wb.noMarks")}</p>;

  function retime(e: WebinarEvent, value: string) {
    const [hh, mm] = value.split(":").map(Number);
    if (hh == null || mm == null || Number.isNaN(hh) || Number.isNaN(mm)) return;
    const d = new Date(e.at);
    d.setHours(hh, mm, 0, 0);
    if (d.toISOString() === e.at) return;
    m.updateMark.mutate(
      { id: e.id, patch: { at: d.toISOString() } },
      { onError: (err) => toast.error(describeError(err, t("mkt.wb.saveFailed"))) },
    );
  }

  return (
    <ul className="divide-y divide-border">
      {sorted.map((e) => {
        const v = totalAt(points, e.at);
        const guess = e.aiGuess && e.confirmed === false;
        return (
          <li key={e.id} className={cn("flex items-center gap-2.5 py-2", guess && "opacity-70")}>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: EVENT_COLOR[e.kind] }}
            />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">
              {eventName(t, e)}
              {e.meta?.count != null && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  · {t("mkt.wb.smsTo", { n: num(e.meta.count) })}
                </span>
              )}
            </span>
            {e.auto && (
              <span className="rounded-md bg-sky-500/12 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-700 dark:text-sky-300">
                {t("mkt.wb.autoBadge")}
              </span>
            )}
            {e.aiGuess && (
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/12 px-1.5 py-0.5 text-[10.5px] font-semibold text-violet-700 dark:text-violet-300">
                <Sparkles className="h-3 w-3" />
                {guess ? t("mkt.wb.aiGuess") : "AI"}
              </span>
            )}
            <input
              type="time"
              defaultValue={hm(e.at)}
              onBlur={(ev) => retime(e, ev.target.value)}
              className="h-7 w-[84px] rounded-md border border-transparent bg-transparent px-1 font-mono text-[12.5px] text-muted-foreground hover:border-border focus:border-primary focus:outline-none"
              aria-label={t("mkt.wb.time")}
            />
            <span className="w-[86px] text-right">
              <b className="font-mono text-[14px] tabular-nums text-foreground">
                {v != null ? num(v) : "—"}
              </b>
              {v != null && peak ? (
                <span className="ml-1 text-[11px] text-muted-foreground">
                  {Math.round((v / peak) * 100)}%
                </span>
              ) : null}
            </span>
            {guess && (
              <button
                type="button"
                onClick={() => m.updateMark.mutate({ id: e.id, patch: { confirmed: true } })}
                className="grid h-7 w-7 place-items-center rounded-md text-emerald-600 hover:bg-emerald-500/10"
                aria-label={t("mkt.wb.confirm")}
                title={t("mkt.wb.confirm")}
              >
                <Check className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => m.removeMark.mutate(e.id)}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={t("common.delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---- Bosqichlar bo'yicha yo'qotish ------------------------------------- */

export function StageLossTable({
  points,
  events,
}: {
  points: TimelinePoint[];
  events: WebinarEvent[];
}) {
  const { t } = useI18n();
  const { stages, worst } = useMemo(() => stageLosses(points, events), [points, events]);
  const sms = useMemo(() => smsEffect(points, events), [points, events]);
  if (!stages.length || points.length < 2)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t("mkt.wb.lossEmpty")}</p>
    );
  return (
    <div className="space-y-4">
      {worst && worst.change != null && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/8 px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-300">
            <TrendingDown className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
              {t("mkt.wb.worstStage")}
            </p>
            <p className="text-[14px] font-semibold text-foreground">
              {eventName(t, worst.from)} →{" "}
              {worst.to ? eventName(t, worst.to) : t("mkt.wb.streamEnd")}
              <span className="ml-2 text-muted-foreground">
                {hm(worst.from.at)}–{worst.to ? hm(worst.to.at) : ""}
              </span>
            </p>
          </div>
          <p className="text-right">
            <b className="font-mono text-[20px] tabular-nums text-rose-600 dark:text-rose-300">
              {num(worst.change)}
            </b>
            {worst.pct != null && (
              <span className="ml-1.5 text-[12.5px] text-muted-foreground">
                {pctText(worst.pct)}
              </span>
            )}
          </p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">{t("mkt.wb.stage")}</th>
              <th className="py-2 pr-3 font-semibold">{t("mkt.wb.time")}</th>
              <th className="py-2 pr-3 text-right font-semibold">{t("mkt.wb.atStart")}</th>
              <th className="py-2 pr-3 text-right font-semibold">{t("mkt.wb.atEnd")}</th>
              <th className="py-2 pr-3 text-right font-semibold">{t("mkt.wb.low")}</th>
              <th className="py-2 text-right font-semibold">{t("mkt.wb.change")}</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => {
              const bad = s === worst;
              return (
                <tr
                  key={s.from.id}
                  className={cn("border-b border-border/60", bad && "bg-rose-500/5")}
                >
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2 font-semibold text-foreground">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: EVENT_COLOR[s.from.kind] }}
                      />
                      {eventName(t, s.from)}
                      <span className="font-normal text-muted-foreground">
                        → {s.to ? eventName(t, s.to) : t("mkt.wb.streamEnd")}
                      </span>
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono tabular-nums text-muted-foreground">
                    {hm(s.from.at)} · {t("mkt.wb.minutes", { n: s.minutes })}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {s.start != null ? num(s.start) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {s.end != null ? num(s.end) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                    {s.low != null ? num(s.low) : "—"}
                  </td>
                  <td
                    className={cn(
                      "py-2 text-right font-semibold tabular-nums",
                      s.change == null
                        ? "text-muted-foreground"
                        : s.change < 0
                          ? "text-rose-600 dark:text-rose-300"
                          : "text-emerald-600 dark:text-emerald-300",
                    )}
                  >
                    {s.change != null ? `${s.change > 0 ? "+" : ""}${num(s.change)}` : "—"}
                    {s.pct != null && (
                      <span className="ml-1 text-[11.5px] font-normal text-muted-foreground">
                        {pctText(s.pct)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sms.map((x) => (
            <span
              key={x.event.id}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-[12.5px]"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: EVENT_COLOR.sms_sent }} />
              <b className="text-foreground">{eventName(t, x.event)}</b>
              <span className="text-muted-foreground">{hm(x.event.at)}</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  x.delta == null
                    ? "text-muted-foreground"
                    : x.delta >= 0
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-rose-600 dark:text-rose-300",
                )}
              >
                {x.delta == null
                  ? t("mkt.wb.smsWait")
                  : t("mkt.wb.smsDelta", { n: `${x.delta >= 0 ? "+" : ""}${num(x.delta)}` })}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Ssenariy ----------------------------------------------------------- */

export function ScenarioCard({
  w,
  events,
  startIso,
}: {
  w: WebinarRow;
  events: WebinarEvent[];
  startIso: string | null;
}) {
  const { t } = useI18n();
  const m = useWebinarMutations();
  const tpl = useWebinarTemplates();
  const saved = useMemo(() => parsePlan(w.plan), [w.plan]);
  const [draft, setDraft] = useState<PlanItem[] | null>(null);
  const plan = draft ?? saved;
  const rows = planVsActual(plan, events, startIso);
  const dirty = draft != null;
  const missing = tpl.list.data?.missing;

  const setRow = (i: number, patch: Partial<PlanItem>) =>
    setDraft(plan.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const add = () => {
    const last = plan[plan.length - 1];
    setDraft([
      ...plan,
      { kind: "timer", seq: nextSeqPlan(plan, "timer"), minute: (last?.minute ?? 0) + 10 },
    ]);
  };

  function save() {
    const clean = parsePlan(plan);
    m.save.mutate(
      { id: w.id, patch: { plan: clean as never } },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success(t("mkt.wb.planSaved"));
        },
        onError: (e) => toast.error(describeError(e, t("mkt.wb.dbUpdate"))),
      },
    );
  }

  function saveTemplate() {
    const name = window.prompt(t("mkt.wb.tplName"), w.title.slice(0, 60));
    if (!name?.trim()) return;
    tpl.save.mutate(
      { name: name.trim().slice(0, 120), plan: parsePlan(plan) },
      {
        onSuccess: () => toast.success(t("mkt.wb.tplSaved")),
        onError: (e) => toast.error(describeError(e, t("mkt.wb.dbUpdate"))),
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value=""
          disabled={missing || !tpl.list.data?.rows.length}
          onChange={(e) => {
            const row = tpl.list.data?.rows.find((r) => r.id === e.target.value);
            if (row) setDraft(parsePlan(row.plan));
          }}
          className="h-9 rounded-lg border border-border bg-card px-2.5 text-[13px]"
        >
          <option value="">
            {tpl.list.data?.rows.length ? t("mkt.wb.fromTemplate") : t("mkt.wb.noTemplates")}
          </option>
          {(tpl.list.data?.rows ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={saveTemplate}
          disabled={!plan.length || missing}
        >
          <BookmarkPlus className="h-4 w-4" /> {t("mkt.wb.saveTemplate")}
        </Button>
        <div className="ml-auto flex gap-2">
          {dirty && (
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              {t("common.cancel")}
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty || m.save.isPending}>
            {m.save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      </div>
      {plan.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          {t("mkt.wb.planEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 font-semibold">{t("mkt.wb.event")}</th>
                <th className="py-2 pr-2 font-semibold">№</th>
                <th className="py-2 pr-2 text-right font-semibold">{t("mkt.wb.planMin")}</th>
                <th className="py-2 pr-2 text-right font-semibold">{t("mkt.wb.factMin")}</th>
                <th className="py-2 pr-2 font-semibold">{t("mkt.wb.diff")}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="py-1.5 pr-2">
                    <select
                      value={r.kind}
                      onChange={(e) => {
                        const kind = e.target.value as EventKind;
                        setRow(i, { kind, seq: NUMBERED_KINDS.has(kind) ? (r.seq ?? 1) : null });
                      }}
                      className="h-8 rounded-md border border-border bg-card px-2 text-[13px]"
                    >
                      {CONSOLE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`mkt.ev.${k}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    {NUMBERED_KINDS.has(r.kind) ? (
                      <input
                        inputMode="numeric"
                        value={r.seq ?? ""}
                        onChange={(e) =>
                          setRow(i, { seq: Number(e.target.value.replace(/\D/g, "")) || 1 })
                        }
                        className="h-8 w-12 rounded-md border border-border bg-input px-2 text-center tabular-nums"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right">
                    <input
                      inputMode="numeric"
                      value={r.minute}
                      onChange={(e) =>
                        setRow(i, { minute: Number(e.target.value.replace(/\D/g, "")) || 0 })
                      }
                      className="h-8 w-16 rounded-md border border-border bg-input px-2 text-right tabular-nums"
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                    {r.actualMinute ?? "—"}
                  </td>
                  <td className="py-1.5 pr-2">
                    <DiffChip diff={r.diff} happened={!!r.actual} />
                  </td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() => setDraft(plan.filter((_, j) => j !== i))}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4" /> {t("mkt.wb.addPlanRow")}
      </Button>
    </div>
  );
}

function nextSeqPlan(plan: PlanItem[], kind: EventKind) {
  return plan.filter((p) => p.kind === kind).reduce((m, p) => Math.max(m, p.seq ?? 0), 0) + 1;
}

function DiffChip({ diff, happened }: { diff: number | null; happened: boolean }) {
  const { t } = useI18n();
  if (!happened)
    return (
      <span className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">
        {t("mkt.wb.notYet")}
      </span>
    );
  if (diff == null) return <span className="text-muted-foreground">—</span>;
  const onTime = Math.abs(diff) <= 2;
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
        onTime
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-500/12 text-amber-800 dark:text-amber-200",
      )}
    >
      {onTime
        ? t("mkt.wb.onTime")
        : diff > 0
          ? t("mkt.wb.late", { n: diff })
          : t("mkt.wb.early", { n: -diff })}
    </span>
  );
}

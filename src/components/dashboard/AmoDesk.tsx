import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import {
  useDeskActivityYesterday,
  useDeskIncomingCalls,
  useDeskLossReasons,
  useDeskSources,
  useDeskStageFlow,
  useLeadCube,
  usePipelineStagesRaw,
  useProfilesRaw,
  useVisibleCube,
  type DeskPerson,
  type DeskRange,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { datePresetRange } from "@/lib/date-presets";
import { useI18n } from "@/lib/i18n";
import { formatSom } from "@/lib/lead-payments/paid-stage";
import { cn } from "@/lib/utils";

// Bosh sahifa laid out like amoCRM's desktop ("Ish stoli"): the company's
// name over a backdrop, the period and Hammasi/Meniki pills, the funnel
// strip (each stage: what is in it now and how many came in this period)
// and the widget tiles. The page's other blocks sit below on the same
// translucent cards (.amo-desk in styles.css).

export const DESK_WIDGETS = [
  "funnelSales",
  "calls",
  "allSales",
  "loss",
  "sources",
  "activity",
] as const;
export type DeskWidget = (typeof DESK_WIDGETS)[number];
export const DESK_BACKDROPS = ["night", "dawn", "ocean", "forest", "city"] as const;
export type DeskBackdrop = (typeof DESK_BACKDROPS)[number];
export type DeskPrefs = { hidden: DeskWidget[]; backdrop: DeskBackdrop };

const PREFS_KEY = (uid: string) => `desk.prefs.v1.${uid}`;

export function useDeskPrefs(): [DeskPrefs, (p: DeskPrefs) => void] {
  const { user } = useAuth();
  const key = PREFS_KEY(user?.id ?? "anon");
  const [prefs, setPrefs] = useState<DeskPrefs>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<DeskPrefs> | null;
      return { hidden: v?.hidden ?? [], backdrop: v?.backdrop ?? "night" };
    } catch {
      return { hidden: [], backdrop: "night" };
    }
  });
  return [
    prefs,
    (p) => {
      setPrefs(p);
      try {
        localStorage.setItem(key, JSON.stringify(p));
      } catch {
        /* private mode: kept for this visit only */
      }
    },
  ];
}

/** The page frame: backdrop behind everything, translucent cards on it. */
export function DeskFrame({ backdrop, children }: { backdrop: DeskBackdrop; children: ReactNode }) {
  return (
    <div
      className={cn(
        // "dark": the desk is one dark look over its backdrop in both themes.
        "dark amo-desk relative -mx-4 -mt-4 min-h-[calc(100%+2rem)] px-4 pb-12 md:-mx-6 md:px-8 phone:-mx-3 phone:-mt-3 phone:px-3",
        `desk-bg-${backdrop}`,
      )}
    >
      {children}
    </div>
  );
}

const PERIODS = ["today", "yesterday", "7d", "month"] as const;

export function DeskHero({
  orgName,
  dateFilter,
  onDateFilter,
  mine,
  onMine,
  showMine,
  right,
}: {
  orgName: string;
  dateFilter: DateFilterValue;
  onDateFilter: (v: DateFilterValue) => void;
  mine: boolean;
  onMine: (v: boolean) => void;
  showMine: boolean;
  right: ReactNode;
}) {
  const { t } = useI18n();
  const active = dateFilter.preset ?? (dateFilter.from || dateFilter.to ? "custom" : "month");
  return (
    <div className="relative pt-6">
      <div className="flex justify-end gap-2">{right}</div>
      <h1 className="mt-2 text-center font-display text-[44px] font-bold leading-tight text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.45)] phone:text-[30px]">
        {orgName}
      </h1>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <div className="desk-pill phone-tabs">
          {PERIODS.map((k) => (
            <button
              key={k}
              type="button"
              data-active={active === k || (k === "month" && active === "all")}
              onClick={() => {
                const r = datePresetRange(k);
                onDateFilter({
                  from: r?.from ?? null,
                  to: r?.to ?? null,
                  label: t(`desk.p.${k}`),
                  preset: k,
                });
              }}
            >
              {t(`desk.p.${k}`)}
            </button>
          ))}
          <span data-active={active === "custom"} className="desk-pill-range">
            <DateRangeFilter
              value={active === "custom" ? dateFilter : { ...dateFilter, label: t("desk.p.range") }}
              onChange={onDateFilter}
              variant="pill"
            />
          </span>
        </div>
        {showMine && (
          <div className="desk-pill">
            <button type="button" data-active={!mine} onClick={() => onMine(false)}>
              {t("desk.all")}
            </button>
            <button type="button" data-active={mine} onClick={() => onMine(true)}>
              {t("desk.mine")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The tabs of the page as one more pill row. */
export function DeskTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="mt-3 flex justify-center">
      <div className="desk-pill desk-pill-sm phone-tabs">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            data-active={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const sumLabel = (n: number) => `${formatSom(n)} so'm`;

/* -------------------------------------------------------------- strip */

export function DeskFunnelStrip({
  funnels,
  funnel,
  onFunnel,
  range,
  ownerIds,
}: {
  funnels: string[];
  funnel: string;
  onFunnel: (f: string) => void;
  range: DeskRange;
  ownerIds: Set<string> | null;
}) {
  const { t } = useI18n();
  const { data: allStages = [] } = usePipelineStagesRaw();
  const stages = useMemo(
    () =>
      allStages
        .filter((s) => (s.pipeline_name || "Direct Sales") === funnel && !s.hidden)
        .sort((a, b) => a.position - b.position),
    [allStages, funnel],
  );
  const wonIds = useMemo(
    () => new Set(allStages.filter((s) => s.is_won).map((s) => s.id)),
    [allStages],
  );
  const lostIds = useMemo(
    () => new Set(allStages.filter((s) => s.is_lost).map((s) => s.id)),
    [allStages],
  );
  const scope = <R extends { owner_id: string | null }>(rows: R[]) =>
    rows.filter((r) => !ownerIds || (!!r.owner_id && ownerIds.has(r.owner_id)));
  const now = useVisibleCube(useLeadCube({ funnel }).data);
  const fresh = useVisibleCube(useLeadCube({ funnel, from: range.from, to: range.to }).data);
  const flow = useDeskStageFlow(range, ownerIds, wonIds).data;

  const totals = new Map<string, { n: number; sum: number }>();
  for (const r of scope(now)) {
    if (!r.stage_id) continue;
    const cur = totals.get(r.stage_id) ?? { n: 0, sum: 0 };
    cur.n += r.n;
    cur.sum += r.revenue;
    totals.set(r.stage_id, cur);
  }
  const freshRows = scope(fresh);
  const newCount = freshRows.reduce((a, r) => a + r.n, 0);
  const lostCount = freshRows
    .filter((r) => r.stage_id && lostIds.has(r.stage_id))
    .reduce((a, r) => a + r.n, 0);
  const maxEntered = Math.max(1, ...stages.map((s) => flow?.entered.get(s.id) ?? 0));

  return (
    <section className="mt-8 grid grid-cols-[200px_150px_minmax(0,1fr)] overflow-hidden rounded-[6px] border border-border bg-card backdrop-blur-md phone:grid-cols-1">
      <ul className="max-h-[188px] overflow-y-auto border-r border-border py-3 pl-4 pr-2 phone:max-h-none phone:border-b phone:border-r-0">
        {funnels.map((f) => (
          <li key={f}>
            <button
              type="button"
              onClick={() => onFunnel(f)}
              className={cn(
                "block w-full truncate border-r-[3px] py-1.5 pr-3 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] transition-colors",
                f === funnel
                  ? "border-white text-white"
                  : "border-transparent text-white/55 hover:text-white/85",
              )}
            >
              {f}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-center justify-center gap-1 px-3 py-4 text-center">
        <span className="text-[44px] font-semibold leading-none text-white">+{newCount}</span>
        <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-white/85">
          {t("desk.new")}
        </span>
        <span className="mt-3 text-[12px] text-white/55">
          {t("desk.lost")}: {lostCount}
        </span>
      </div>
      <div className="flex gap-5 overflow-x-auto px-4 py-4 [scrollbar-width:thin]">
        {stages.map((s) => {
          const tot = totals.get(s.id) ?? { n: 0, sum: 0 };
          const entered = flow?.entered.get(s.id) ?? 0;
          const color = s.color?.startsWith("#")
            ? s.color
            : s.is_won
              ? "#22c55e"
              : s.is_lost
                ? "#94a3b8"
                : "#7aa2f7";
          return (
            <Link
              key={s.id}
              to="/funnels"
              search={{ funnel }}
              className="group w-[168px] shrink-0 text-center"
            >
              <p className="truncate text-[12px] font-bold uppercase tracking-[0.05em] text-white">
                {s.name}
              </p>
              <p className="mt-0.5 truncate text-[11.5px] text-white/60">
                {t("desk.leadsSum", { n: tot.n, sum: formatSom(tot.sum) })}
              </p>
              <span
                className="mt-1.5 block h-[3px] rounded-full"
                style={{ backgroundColor: color }}
              />
              <div className="mt-2 flex h-[76px] flex-col items-center justify-center rounded-[8px] border border-white/25 transition-colors group-hover:border-white/60 group-hover:bg-white/5">
                <span className="text-[30px] font-semibold leading-none text-white">
                  {entered > 0 ? `+${entered}` : 0}
                </span>
                <span className="mt-1 text-[11px] text-white/60">{t("desk.entered")}</span>
              </div>
              <span className="mx-auto mt-2 block h-[3px] rounded-full bg-white/15">
                <span
                  className="block h-full rounded-full bg-white/80 transition-[width] duration-500"
                  style={{ width: `${(entered / maxEntered) * 100}%` }}
                />
              </span>
            </Link>
          );
        })}
        {stages.length === 0 && (
          <p className="self-center text-[13px] text-white/60">{t("desk.noStages")}</p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ widgets */

function WidgetCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-h-[340px] flex-col rounded-[6px] border border-border bg-card p-5 backdrop-blur-md transition-transform duration-200 hover:-translate-y-0.5">
      <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-white/90">{title}</h3>
      {children}
    </section>
  );
}

function Headline({ value, sum, yesterday }: { value: number; sum?: number; yesterday?: number }) {
  const { t } = useI18n();
  return (
    <div className="mt-2 flex items-start justify-between gap-3">
      <div>
        <p className="text-[40px] font-semibold leading-none text-[#8fa2ff]">{value}</p>
        {sum !== undefined && (
          <p className="mt-1.5 text-[13px] font-bold text-white">{sumLabel(sum)}</p>
        )}
      </div>
      {yesterday !== undefined && (
        <div className="text-right">
          <p className="text-[20px] font-semibold text-emerald-400">{yesterday}</p>
          <p className="text-[12px] text-white/60">{t("desk.yesterday")}</p>
        </div>
      )}
    </div>
  );
}

function Bars({
  rows,
  empty,
}: {
  rows: { key: string; label: string; n: number; sum?: number; side?: number }[];
  empty: string;
}) {
  const shown = rows.slice(0, 5);
  const rest = rows.slice(5);
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0) return <p className="mt-4 text-[13px] text-white/50">{empty}</p>;
  return (
    <ul className="mt-4 space-y-3 border-t border-white/15 pt-4">
      {[
        ...shown,
        ...(rest.length
          ? [
              {
                key: "__rest",
                label: "…",
                n: rest.reduce((a, r) => a + r.n, 0),
                sum: rest.reduce((a, r) => a + (r.sum ?? 0), 0),
              },
            ]
          : []),
      ].map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline gap-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate text-white/90">{r.label}</span>
            <b className="shrink-0 text-white">{r.n}</b>
            {r.sum !== undefined && r.sum > 0 && (
              <span className="shrink-0 text-[12px] text-white/50">({formatSom(r.sum)})</span>
            )}
            {r.side !== undefined && (
              <span className="w-6 shrink-0 text-right text-emerald-400">{r.side}</span>
            )}
          </div>
          <span className="mt-1 block h-[3px] rounded-full bg-white/10">
            <span
              className="block h-full rounded-full bg-[#f5c542] transition-[width] duration-500"
              style={{ width: `${(r.n / max) * 100}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DeskWidgets({
  funnel,
  range,
  ownerIds,
  hidden,
}: {
  funnel: string;
  range: DeskRange;
  ownerIds: Set<string> | null;
  hidden: DeskWidget[];
}) {
  const { t } = useI18n();
  const { data: profiles = [] } = useProfilesRaw();
  const { data: allStages = [] } = usePipelineStagesRaw();
  const wonIds = useMemo(
    () => new Set(allStages.filter((s) => s.is_won).map((s) => s.id)),
    [allStages],
  );
  const name = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name || (id ? "—" : t("desk.noOwner"));
  const flow = useDeskStageFlow(range, ownerIds, wonIds).data;
  const calls = useDeskIncomingCalls(range, ownerIds).data;
  const loss = useDeskLossReasons(range, funnel, ownerIds).data ?? [];
  const sources = useDeskSources(range, funnel, ownerIds).data ?? [];
  const activity = useDeskActivityYesterday(ownerIds).data ?? [];

  const people = (list: DeskPerson[], side?: DeskPerson[]) =>
    list.map((p) => ({
      key: p.ownerId ?? "none",
      label: name(p.ownerId),
      n: p.n,
      sum: p.sum,
      ...(side ? { side: side.find((x) => x.ownerId === p.ownerId)?.n ?? 0 } : {}),
    }));
  const total = (list: DeskPerson[]) => ({
    n: list.reduce((a, p) => a + p.n, 0),
    sum: list.reduce((a, p) => a + p.sum, 0),
  });
  const funnelWon = flow?.won(flow.inRange, funnel) ?? [];
  const funnelWonY = flow?.won(flow.yesterday, funnel) ?? [];
  const allWon = flow?.won(flow.inRange, null) ?? [];
  const allWonY = flow?.won(flow.yesterday, null) ?? [];
  const show = (w: DeskWidget) => !hidden.includes(w);

  return (
    <div className="mt-4 grid grid-cols-3 gap-4 phone:grid-cols-1">
      {show("funnelSales") && (
        <WidgetCard title={t("desk.w.funnelSales", { funnel })}>
          <Headline
            value={total(funnelWon).n}
            sum={total(funnelWon).sum}
            yesterday={total(funnelWonY).n}
          />
          <Bars rows={people(funnelWon, funnelWonY)} empty={t("desk.empty")} />
        </WidgetCard>
      )}
      {show("calls") && (
        <WidgetCard title={t("desk.w.calls")}>
          <Headline value={total(calls?.people ?? []).n} />
          <p className="mt-1 text-[12px] text-white/60">
            {t("desk.missed", { n: calls?.missed ?? 0 })}
          </p>
          <Bars
            rows={people(calls?.people ?? []).map((r) => ({ ...r, sum: 0 }))}
            empty={t("desk.empty")}
          />
        </WidgetCard>
      )}
      {show("allSales") && (
        <WidgetCard title={t("desk.w.allSales")}>
          <Headline value={total(allWon).n} sum={total(allWon).sum} yesterday={total(allWonY).n} />
          <Bars rows={people(allWon, allWonY)} empty={t("desk.empty")} />
        </WidgetCard>
      )}
      {show("loss") && (
        <WidgetCard title={t("desk.w.loss")}>
          <Headline value={loss.reduce((a, r) => a + r.n, 0)} />
          <Bars
            rows={loss.map((r) => ({ key: r.label, label: r.label, n: r.n }))}
            empty={t("desk.empty")}
          />
        </WidgetCard>
      )}
      {show("sources") && (
        <WidgetCard title={t("desk.w.sources")}>
          <Headline
            value={sources.reduce((a, r) => a + r.n, 0)}
            sum={sources.reduce((a, r) => a + r.sum, 0)}
          />
          <Bars
            rows={sources.map((r) => ({
              key: r.label,
              label: r.label === "—" ? t("desk.noSource") : r.label,
              n: r.n,
              sum: r.sum,
            }))}
            empty={t("desk.empty")}
          />
        </WidgetCard>
      )}
      {show("activity") && (
        <WidgetCard title={t("desk.w.activity")}>
          <Headline value={activity.reduce((a, r) => a + r.n, 0)} />
          <Bars rows={people(activity).map((r) => ({ ...r, sum: 0 }))} empty={t("desk.empty")} />
        </WidgetCard>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ settings */

export function DeskSettingsButton({
  prefs,
  onPrefs,
}: {
  prefs: DeskPrefs;
  onPrefs: (p: DeskPrefs) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-white/40 bg-white/10 px-4 text-[13.5px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
      >
        <Settings2 className="h-4 w-4" /> {t("desk.settings")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="amo-skin max-w-md rounded-[6px]">
          <DialogTitle>{t("desk.settings")}</DialogTitle>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {t("desk.widgets")}
          </p>
          <ul className="space-y-1">
            {DESK_WIDGETS.map((w) => {
              const on = !prefs.hidden.includes(w);
              return (
                <li key={w}>
                  <button
                    type="button"
                    onClick={() =>
                      onPrefs({
                        ...prefs,
                        hidden: on ? [...prefs.hidden, w] : prefs.hidden.filter((x) => x !== w),
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-[4px] px-2 py-2 text-left text-[13.5px] text-foreground hover:bg-accent"
                  >
                    <span
                      className={cn(
                        "grid h-5 w-5 place-items-center rounded-[4px] border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                    {t(`desk.w.${w}`, { funnel: t("desk.funnelWord") })}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {t("desk.backdrop")}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {DESK_BACKDROPS.map((b) => (
              <button
                key={b}
                type="button"
                title={t(`desk.bg.${b}`)}
                onClick={() => onPrefs({ ...prefs, backdrop: b })}
                className={cn(
                  `desk-bg-${b} h-14 rounded-[6px] ring-offset-2 ring-offset-popover transition-transform hover:scale-105`,
                  prefs.backdrop === b && "ring-2 ring-primary",
                )}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

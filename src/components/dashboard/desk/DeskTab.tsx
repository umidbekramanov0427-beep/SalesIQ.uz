import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarRange,
  Download,
  History,
  LayoutGrid,
  Loader2,
  Pencil,
  Percent,
  Plus,
  Receipt,
  Repeat2,
  Send,
  ShoppingCart,
  Target,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  useDesk,
  useDeskHistory,
  useMyOrganization,
  useOrgGeneralSettings,
  useProfilesRaw,
  useSalesPlans,
  useSaveSalesPlan,
  useSendDeskToTelegram,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { change, deskPeriod, type DeskData, type DeskPreset } from "@/lib/desk";
import { useI18n } from "@/lib/i18n";
import { monthKey, planProgress, shiftMonth } from "@/lib/sales-plan";
import { cn, describeError } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx-write";
import {
  ChannelsBlock,
  DynamicsBlock,
  FunnelBlock,
  ManagersBlock,
  SourcesBlock,
} from "./DeskBlocks";
import { DeskKpi } from "./DeskParts";

// Bosh sahifa → «Ish stoli»: the company's main figures for a period next
// to the period before (5CRM's dashboard, in the platform's look). Every
// card has its "!" and ⚙; «Vidjet qo'shish» picks which blocks this person
// sees; «Telegram» sends the figures to their chat; «Tarix» shows the last
// 12 months; «Eksport» writes an Excel file.

const PRESETS: DeskPreset[] = ["today", "week", "month", "year", "range"];
const WIDGETS = [
  "today",
  "revenue",
  "count",
  "avgCheck",
  "newClients",
  "repeat",
  "conversion",
  "plan",
  "channels",
  "sources",
  "dynamics",
  "funnel",
  "managers",
] as const;
type Widget = (typeof WIDGETS)[number];
const STORE = "desk.hidden.v1";
const PRESET_STORE = "desk.preset.v1";

function readHidden(): Widget[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => (WIDGETS as readonly string[]).includes(x)) : [];
  } catch {
    return [];
  }
}

const fmtDay = (ymd: string) => ymd.split("-").reverse().join(".");

export function DeskTab({ tabs }: { tabs: ReactNode }) {
  const { t } = useI18n();
  const { user: me } = useAuth();
  const { format } = useCurrency();
  const { data: org } = useMyOrganization();
  // Sozlamalar → Umumiy: the company's own logo, as in the sidebar.
  const { data: orgGeneral } = useOrgGeneralSettings();
  const companyLogo = orgGeneral?.company_logo_url ?? null;
  const canPlan = me?.role === "super_admin" || me?.role === "rop" || me?.role === "platform_owner";

  const [preset, setPresetState] = useState<DeskPreset>("month");
  const [custom, setCustom] = useState<{ from: string; to: string } | undefined>();
  const [funnel, setFunnel] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Widget[]>([]);
  const [planOpen, setPlanOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    setHidden(readHidden());
    try {
      const p = localStorage.getItem(PRESET_STORE) as DeskPreset | null;
      if (p && p !== "range" && PRESETS.includes(p)) setPresetState(p);
    } catch {
      /* private window */
    }
  }, []);
  function setPreset(p: DeskPreset) {
    setPresetState(p);
    if (p !== "range") {
      try {
        localStorage.setItem(PRESET_STORE, p);
      } catch {
        /* private window */
      }
    }
  }
  function toggleWidget(w: Widget, on: boolean) {
    const next = on ? hidden.filter((x) => x !== w) : [...hidden, w];
    setHidden(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* private window */
    }
  }
  const shown = (w: Widget) => !hidden.includes(w);

  const period = useMemo(() => deskPeriod(preset, new Date(), custom), [preset, custom]);
  const query = { ...period, funnel };
  const { data: d, isLoading, error, isFetching } = useDesk(query);
  const send = useSendDeskToTelegram();

  const periodText = `${fmtDay(period.from)} – ${fmtDay(period.to)}`;
  const prevText = `${fmtDay(period.prevFrom)} – ${fmtDay(period.prevTo)}`;
  const revenueLabel = t(`desk.revenue.${preset}`);
  const prevWord = preset === "month" ? t("desk.prevMonthDays") : t("desk.prevPeriodShort");

  function sendTelegram() {
    send.mutate(
      { ...query, period: periodText },
      {
        onSuccess: () => toast.success(t("desk.tgSent")),
        onError: (e) =>
          toast.error(
            e.message === "NO_TELEGRAM" ? t("desk.tgNoChat") : describeError(e, t("desk.failed")),
          ),
      },
    );
  }

  function exportXlsx(data: DeskData) {
    const row = (label: string, p: { cur: number; prev: number }) => [
      label,
      p.cur,
      p.prev,
      change(p),
    ];
    downloadXlsx(`ish-stoli-${period.from}-${period.to}.xlsx`, [
      {
        name: t("desk.xl.figures"),
        rows: [
          [t("desk.xl.figure"), periodText, prevText, "%"],
          row(revenueLabel, data.revenue),
          row(t("desk.count"), data.count),
          row(t("desk.avgCheck"), data.avgCheck),
          row(t("desk.newClients"), data.newClients),
          row(t("desk.repeat"), data.repeat),
          row(t("desk.leads"), data.leads),
          row(t("desk.conversion"), data.conversion),
          [
            t("desk.plan"),
            data.plan.team,
            data.plan.fact,
            data.plan.team ? Math.round((data.plan.fact / data.plan.team) * 100) : null,
          ],
        ],
      },
      {
        name: t("desk.managers"),
        rows: [
          [
            t("desk.col.manager"),
            t("desk.col.leads"),
            t("desk.col.worked"),
            t("desk.col.sales"),
            t("desk.col.revenue"),
            t("desk.col.plan"),
            t("desk.col.conv"),
            t("desk.col.avg"),
            t("desk.col.talks"),
            t("desk.col.longest"),
          ],
          ...data.managers.map((m) => [
            m.name,
            m.leads.cur,
            m.worked,
            m.sales.cur,
            m.revenue.cur,
            m.plan,
            m.conversion,
            m.avgCheck,
            m.talks,
            m.longest,
          ]),
        ],
      },
      {
        name: t("desk.channels"),
        rows: [
          [t("desk.xl.channel"), t("desk.col.sales"), t("desk.col.revenue")],
          ...data.channels.map((c) => [c.name, c.count, c.revenue]),
        ],
      },
      {
        name: t("desk.sources"),
        rows: [
          [t("desk.xl.source"), t("desk.col.leads")],
          ...data.sources.map((s) => [s.name, s.leads]),
        ],
      },
    ]);
  }

  const initial = (org?.name ?? "S").trim().slice(0, 1).toUpperCase();
  const btn =
    "ctl-soft inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-foreground disabled:opacity-50";

  return (
    <div className="space-y-4">
      {/* One row: the company (small, top left) and, on the right, the
          desk's own controls -- they belong to this tab only; the page's
          tabs come under this row. */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {companyLogo ? (
            <img
              src={companyLogo}
              alt=""
              className="h-10 w-10 shrink-0 rounded-[10px] border border-border bg-card object-contain p-1"
            />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-border bg-card text-[16px] font-bold text-primary">
              {initial}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-[18px] font-bold leading-tight tracking-tight text-foreground">
              {org?.name ?? "—"}
            </h1>
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              {t("desk.mainFigures")} · <span className="tabular-nums">{periodText}</span>
              {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <div
            role="tablist"
            className="ctl-track inline-flex items-center gap-0.5 rounded-xl p-0.5"
          >
            {PRESETS.map((p) =>
              p === "range" ? (
                <RangePicker
                  key={p}
                  active={preset === "range"}
                  value={custom ?? { from: period.from, to: period.to }}
                  onApply={(v) => {
                    setCustom(v);
                    setPreset("range");
                  }}
                />
              ) : (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={preset === p}
                  data-state={preset === p ? "active" : "inactive"}
                  onClick={() => setPreset(p)}
                  className="ctl-tab h-8 rounded-lg px-3 text-[13px] font-semibold"
                >
                  {t(`desk.preset.${p}`)}
                </button>
              ),
            )}
          </div>
          <select
            value={funnel ?? ""}
            onChange={(e) => setFunnel(e.target.value || null)}
            aria-label={t("desk.funnelLabel")}
            className="ctl-soft h-9 max-w-[200px] rounded-xl px-3 text-[13px] font-semibold outline-none"
          >
            <option value="">{t("desk.allFunnels")}</option>
            {(d?.funnels ?? []).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className={btn}>
                <Plus className="h-4 w-4" />
                {t("desk.addWidget")}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              <p className="px-2 pb-1.5 pt-1 text-[12px] font-semibold text-muted-foreground">
                {t("desk.widgetsHint")}
              </p>
              {WIDGETS.map((w) => (
                <label
                  key={w}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent/60"
                >
                  {w === "revenue" ? revenueLabel : t(`desk.${w}`)}
                  <Switch checked={shown(w)} onCheckedChange={(v) => toggleWidget(w, v)} />
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <button
            type="button"
            className={btn}
            onClick={sendTelegram}
            disabled={!d || send.isPending}
            title={t("desk.tgHint")}
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Telegram
          </button>
          <button type="button" className={btn} onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4" />
            {t("desk.history")}
          </button>
          <button type="button" className={btn} onClick={() => d && exportXlsx(d)} disabled={!d}>
            <Download className="h-4 w-4" />
            {t("desk.export")}
          </button>
        </div>
      </header>

      {tabs}

      {error && !d ? (
        <p className="surface-card px-4 py-10 text-center text-[13px] text-muted-foreground">
          {describeError(error, t("desk.failed"))}
        </p>
      ) : isLoading || !d ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 phone:gap-2">
            {shown("today") && (
              <DeskKpi
                tipKey="desk.today"
                label={t("desk.today")}
                icon={Wallet}
                tone="emerald"
                rawValue={d.today.revenue}
                value={format(d.today.revenue)}
                change={change({ cur: d.today.revenue, prev: d.today.yRevenue })}
                prevText={t("desk.yesterdayUntil", {
                  time: d.today.until,
                  v: format(d.today.yRevenue),
                })}
              />
            )}
            {shown("revenue") && (
              <DeskKpi
                tipKey="desk.revenue"
                label={revenueLabel}
                icon={TrendingUp}
                tone="primary"
                rawValue={d.revenue.cur}
                value={format(d.revenue.cur)}
                change={change(d.revenue)}
                prevText={`(${prevWord}: ${format(d.revenue.prev)})`}
              />
            )}
            {shown("count") && (
              <DeskKpi
                tipKey="desk.count"
                label={t("desk.count")}
                icon={ShoppingCart}
                tone="sky"
                rawValue={d.count.cur}
                value={t("desk.pcs", { n: d.count.cur })}
                change={change(d.count)}
                prevText={`(${t("desk.prevPeriodShort")}: ${t("desk.pcs", { n: d.count.prev })})`}
              />
            )}
            {shown("avgCheck") && (
              <DeskKpi
                tipKey="desk.avgCheck"
                label={t("desk.avgCheck")}
                icon={Receipt}
                tone="amber"
                rawValue={d.avgCheck.cur}
                value={format(d.avgCheck.cur)}
                change={change(d.avgCheck)}
                prevText={`(${t("desk.prevPeriodShort")}: ${format(d.avgCheck.prev)})`}
              />
            )}
            {shown("newClients") && (
              <DeskKpi
                tipKey="desk.newClients"
                label={t("desk.newClients")}
                icon={UserPlus}
                tone="sky"
                rawValue={d.newClients.cur}
                value={t("desk.pcs", { n: d.newClients.cur })}
                change={change(d.newClients)}
                prevText={`(${t("desk.prevPeriodShort")}: ${t("desk.pcs", { n: d.newClients.prev })})`}
              />
            )}
            {shown("repeat") && (
              <DeskKpi
                tipKey="desk.repeat"
                label={t("desk.repeat")}
                icon={Repeat2}
                tone="violet"
                rawValue={d.repeat.cur}
                value={t("desk.pcs", { n: d.repeat.cur })}
                change={change(d.repeat)}
                prevText={`(${t("desk.prevPeriodShort")}: ${t("desk.pcs", { n: d.repeat.prev })})`}
              />
            )}
            {shown("conversion") && (
              <DeskKpi
                tipKey="desk.conversion"
                label={t("desk.conversion")}
                icon={Percent}
                tone="rose"
                rawValue={d.conversion.cur}
                value={`${d.conversion.cur}%`}
                change={change(d.conversion)}
                prevText={`(${t("desk.prevPeriodShort")}: ${d.conversion.prev}% · ${t("desk.leadsN", { n: d.leads.cur })})`}
              />
            )}
            {shown("plan") && <PlanCard d={d} canEdit={canPlan} onEdit={() => setPlanOpen(true)} />}
          </div>

          {shown("channels") && <ChannelsBlock d={d} />}
          {shown("sources") && <SourcesBlock d={d} />}
          {shown("dynamics") && <DynamicsBlock d={d} curLabel={periodText} prevLabel={prevText} />}
          {shown("funnel") && <FunnelBlock d={d} onPick={setFunnel} />}
          {shown("managers") && <ManagersBlock d={d} />}
        </>
      )}

      {canPlan && (
        <PlanDialog
          open={planOpen}
          onOpenChange={setPlanOpen}
          month={d?.plan.month ?? monthKey(new Date())}
        />
      )}
      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        to={period.to}
        funnel={funnel}
      />
    </div>
  );
}

function RangePicker({
  active,
  value,
  onApply,
}: {
  active: boolean;
  value: { from: string; to: string };
  onApply: (v: { from: string; to: string }) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  useEffect(() => {
    if (open) {
      setFrom(value.from);
      setTo(value.to);
    }
  }, [open, value.from, value.to]);
  const ok = from && to && from <= to;
  const input =
    "h-9 w-full rounded-[6px] border border-border bg-background px-2.5 text-[13px] tabular-nums outline-none focus:border-primary phone:text-base";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="tab"
          aria-selected={active}
          data-state={active ? "active" : "inactive"}
          className="ctl-tab inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold"
        >
          <CalendarRange className="h-3.5 w-3.5" />
          {t("desk.preset.range")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 space-y-2.5 p-3">
        <label className="block text-[12px] font-semibold text-muted-foreground">
          {t("desk.from")}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
        <label className="block text-[12px] font-semibold text-muted-foreground">
          {t("desk.to")}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={cn(input, "mt-1")}
          />
        </label>
        <button
          type="button"
          disabled={!ok}
          onClick={() => {
            onApply({ from, to });
            setOpen(false);
          }}
          className="ctl-lit h-9 w-full rounded-[6px] text-[13px] font-semibold disabled:opacity-50"
        >
          {t("desk.apply")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function PlanCard({ d, canEdit, onEdit }: { d: DeskData; canEdit: boolean; onEdit: () => void }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const p = planProgress(d.plan.team, d.plan.fact, d.plan.month);
  const pen = canEdit ? (
    <button
      type="button"
      onClick={onEdit}
      aria-label={t("desk.planEdit")}
      title={t("desk.planEdit")}
      className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  ) : null;
  if (!(d.plan.team > 0)) {
    return (
      <DeskKpi
        tipKey="desk.plan"
        label={t("desk.plan")}
        icon={Target}
        tone="amber"
        titleExtra={pen}
        value={t("desk.noPlan")}
        prevText={canEdit ? t("desk.noPlanHint") : undefined}
      />
    );
  }
  return (
    <DeskKpi
      tipKey="desk.plan"
      label={t("desk.plan")}
      icon={Target}
      tone="amber"
      titleExtra={pen}
      rawValue={p.pct ?? 0}
      value={`${p.pct ?? 0}%`}
      prevText={t("desk.planLine", {
        plan: `${format(d.plan.fact)} / ${format(d.plan.team)}`,
        forecast: format(p.forecast),
        day: format(p.perDayNeeded),
      })}
    />
  );
}

/** «Oylik sotuv plani»: the month, the team's plan and each manager's. */
function PlanDialog({
  open,
  onOpenChange,
  month: initialMonth,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  month: string;
}) {
  const { t } = useI18n();
  const [month, setMonth] = useState(initialMonth);
  const { data: plans } = useSalesPlans(month);
  const { data: profiles = [] } = useProfilesRaw();
  const save = useSaveSalesPlan();
  const [team, setTeam] = useState("");
  const [people, setPeople] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const staff = profiles.filter((p) => p.role === "sotuv_menejeri" || p.role === "rop");
  useEffect(() => {
    if (open) setMonth(initialMonth);
  }, [open, initialMonth]);
  useEffect(() => {
    if (!open) return;
    const teamRow = (plans ?? []).find((p) => !p.profile_id);
    setTeam(teamRow ? String(Number(teamRow.target_amount)) : "");
    const m: Record<string, string> = {};
    for (const p of plans ?? [])
      if (p.profile_id) m[p.profile_id] = String(Number(p.target_amount));
    setPeople(m);
  }, [open, plans]);
  const months = Array.from({ length: 6 }, (_, k) => shiftMonth(monthKey(new Date()), k - 3));
  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;
  const sumPeople = Object.values(people).reduce((a, v) => a + num(v), 0);

  async function submit() {
    setBusy(true);
    try {
      const rows = (plans ?? []).map((p) => p);
      const deals = (id: string | null) =>
        Number(rows.find((r) => (r.profile_id ?? null) === id)?.target_deals ?? 0);
      await save.mutateAsync({
        month,
        profileId: null,
        targetAmount: num(team),
        targetDeals: deals(null),
      });
      for (const p of staff) {
        const before = Number(rows.find((r) => r.profile_id === p.id)?.target_amount ?? 0);
        const v = num(people[p.id] ?? "");
        if (v !== before)
          await save.mutateAsync({
            month,
            profileId: p.id,
            targetAmount: v,
            targetDeals: deals(p.id),
          });
      }
      toast.success(t("desk.planSaved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(
        (e as Error).message === "MIGRATION_PENDING"
          ? t("desk.planPending")
          : describeError(e, t("desk.failed")),
      );
    } finally {
      setBusy(false);
    }
  }

  const input =
    "h-10 w-full rounded-[6px] border border-border bg-background px-3 text-[14px] tabular-nums outline-none focus:border-primary phone:text-base";
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogTitle>{t("desk.planTitle")}</DialogTitle>
        <label className="block text-[13px] font-semibold text-foreground">
          {t("desk.planMonth")}
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={cn(input, "mt-1.5")}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m.slice(0, 7)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[13px] font-semibold text-foreground">
          {t("desk.planTeam")}
          <input
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            inputMode="numeric"
            placeholder={sumPeople ? String(sumPeople) : t("desk.planExample")}
            className={cn(input, "mt-1.5")}
          />
        </label>
        <div>
          <p className="text-[13px] font-semibold text-foreground">{t("desk.planPeople")}</p>
          <ul className="mt-1.5 max-h-64 space-y-1.5 overflow-y-auto">
            {staff.length === 0 && (
              <li className="text-[12.5px] text-muted-foreground">{t("desk.noManagers")}</li>
            )}
            {staff.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {p.full_name || p.email}
                </span>
                <input
                  value={people[p.id] ?? ""}
                  onChange={(e) => setPeople((m) => ({ ...m, [p.id]: e.target.value }))}
                  inputMode="numeric"
                  placeholder="0"
                  className="h-9 w-40 rounded-[6px] border border-border bg-background px-2.5 text-right text-[13px] tabular-nums outline-none focus:border-primary phone:text-base"
                />
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="ctl-lit inline-flex h-10 items-center gap-2 rounded-[6px] px-4 text-[13px] font-semibold disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="ctl-soft inline-flex h-10 items-center rounded-[6px] px-4 text-[13px] font-semibold"
          >
            {t("common.cancel")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** «Tarix»: the last 12 months' sales, leads and plan. */
function HistoryDialog({
  open,
  onOpenChange,
  to,
  funnel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  to: string;
  funnel: string | null;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { data, isLoading } = useDeskHistory(to, funnel, open);
  const max = Math.max(1, ...(data ?? []).map((m) => m.revenue));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-primary" />
          {t("desk.historyTitle")}
        </DialogTitle>
        {isLoading || !data ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">{t("desk.xl.month")}</th>
                  <th className="px-3 py-2 font-semibold">{t("desk.col.revenue")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("desk.col.sales")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("desk.col.avg")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("desk.col.leads")}</th>
                  <th className="py-2 pl-3 text-right font-semibold">{t("desk.col.plan")}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.month} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-semibold tabular-nums">{m.month.slice(0, 7)}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.round((m.revenue / max) * 100)}%` }}
                          />
                        </span>
                        <span className="tabular-nums">{format(m.revenue)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.count ? format(Math.round(m.revenue / m.count)) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.leads}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">
                      {m.plan
                        ? `${format(m.plan)} · ${Math.round((m.revenue / m.plan) * 100)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

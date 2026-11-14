import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  Loader2,
  PartyPopper,
  Play,
  Rocket,
  Sparkles,
  Trophy,
  User,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard, SettingRow, SettingRows } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { celebrate, type CelebrateDetail } from "@/components/team/TeamMoments";
import {
  useOrgWorkSchedule,
  usePipelines,
  usePlanMilestones,
  useSalesPlanFacts,
  useSalesPlanFactsByFunnel,
  useSalesPlans,
  useSaveSalesPlan,
} from "@/hooks/use-crm-data";
import {
  CELEBRATION_STYLES,
  PLAN_PARTS,
  fillTemplate,
  partsReached,
  planParts,
  shortMoney,
  workDaysInMonth,
  type CelebrationStyle,
} from "@/lib/control-settings";
import { useI18n } from "@/lib/i18n";
import { dayText, monthKey, monthTitle, shiftMonth } from "@/lib/sales-plan";
import { cn, describeError } from "@/lib/utils";
import { Choice, NumberField, SaveBar, useControlDraft } from "./SettingsKit";

// Nazorat → Reja va fakt → Sozlash: the month's plan for the company or a
// funnel (amount, deals, working days, how many parts it is cut into), the
// checkpoints with what each needs, and the team's celebrations: each part
// reached, the whole plan, a personal plan, the day's first sale.

const VARS = ["{pct}", "{fact}", "{target}", "{left}", "{part}", "{parts}", "{name}", "{funnel}"];

export function PlanSettings() {
  return (
    <div className="space-y-5">
      <PlanBuilder />
      <CelebrationsCard />
    </div>
  );
}

function PlanBuilder() {
  const { t, lang } = useI18n();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [scope, setScope] = useState<string>(""); // "" = the company, else a pipeline id
  const plans = useSalesPlans(month);
  const facts = useSalesPlanFacts(month);
  const funnelFacts = useSalesPlanFactsByFunnel(month);
  const { data: pipelines } = usePipelines();
  const { data: schedule } = useOrgWorkSchedule();
  const save = useSaveSalesPlan();
  const funnels = (pipelines ?? []).filter((p) => !p.archived_at);

  const plan =
    (plans.data ?? []).find((p) => !p.profile_id && (p.pipeline_id ?? "") === scope) ?? null;
  const autoDays = workDaysInMonth(month, schedule?.work_days ?? [1, 2, 3, 4, 5]);

  const [amount, setAmount] = useState<number | null>(null);
  const [deals, setDeals] = useState<number | null>(null);
  const [parts, setParts] = useState<number>(4);
  const [days, setDays] = useState<number | null>(null);
  const planKey = `${month}|${scope}|${plan?.id ?? ""}|${plan?.target_amount ?? ""}|${plan?.target_deals ?? ""}|${plan?.parts ?? ""}|${plan?.work_days ?? ""}`;
  useEffect(() => {
    setAmount(plan ? Number(plan.target_amount) || null : null);
    setDeals(plan ? Number(plan.target_deals) || null : null);
    setParts(plan?.parts ?? 4);
    setDays(plan?.work_days ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the saved plan changes
  }, [planKey]);

  const fact = scope
    ? (funnelFacts.data ?? [])
        .filter((f) => f.pipelineId === scope)
        .reduce((a, f) => ({ deals: a.deals + f.deals, revenue: a.revenue + f.revenue }), {
          deals: 0,
          revenue: 0,
        })
    : (facts.data ?? []).reduce(
        (a, f) => ({ deals: a.deals + f.deals, revenue: a.revenue + f.revenue }),
        { deals: 0, revenue: 0 },
      );
  const byAmount = (amount ?? 0) > 0;
  const target = byAmount ? (amount ?? 0) : (deals ?? 0);
  const done = byAmount ? fact.revenue : fact.deals;
  const workDays = days ?? autoDays;
  const perDay = target > 0 && workDays > 0 ? target / workDays : 0;
  const checkpoints = planParts(target, parts);
  const reached = partsReached(done, target, parts);
  const milestones = usePlanMilestones(plan ? [plan.id] : []);
  const reachedAt = (part: number) =>
    (milestones.data ?? []).find((m) => m.part === part && m.parts === parts)?.reached_at ?? null;
  const money = (v: number) =>
    byAmount ? shortMoney(v) : `${Math.round(v)} ${t("ctl.plan.dealsUnit")}`;
  const dirty =
    (amount ?? 0) !== Number(plan?.target_amount ?? 0) ||
    (deals ?? 0) !== Number(plan?.target_deals ?? 0) ||
    parts !== (plan?.parts ?? 4) ||
    (days ?? null) !== (plan?.work_days ?? null);

  async function submit() {
    try {
      await save.mutateAsync({
        month,
        profileId: null,
        pipelineId: scope || null,
        targetAmount: amount ?? 0,
        targetDeals: deals ?? 0,
        parts,
        workDays: days,
      });
      toast.success(t("plan.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "MIGRATION_PENDING"
          ? t("ctl.plan.migrationPending")
          : describeError(err, t("plan.saveFailed")),
      );
    }
  }

  const monthLabel = monthTitle(month, lang);
  const planned = (plans.data ?? []).filter((p) => !p.profile_id);

  return (
    <SectionCard
      icon={Flag}
      tone="primary"
      title={t("ctl.plan.title")}
      description={t("ctl.plan.desc")}
      actions={
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label={t("plan.prev")}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[130px] text-center text-sm font-semibold capitalize">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label={t("plan.next")}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
    >
      {/* Whose plan: the company's or one funnel's */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {[{ id: "", name: t("ctl.plan.company") }, ...funnels].map((f) => {
          const has = planned.some((p) => (p.pipeline_id ?? "") === f.id);
          return (
            <button
              key={f.id || "company"}
              type="button"
              aria-pressed={scope === f.id}
              onClick={() => setScope(f.id)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold",
                scope === f.id ? "ctl-lit" : "ctl-soft",
              )}
            >
              {f.name}
              {has && <CheckCircle2 className="h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <SettingRows>
          <SettingRow
            title={t("ctl.plan.amount")}
            description={amount ? shortMoney(amount) : t("ctl.plan.amountDesc")}
          >
            <NumberField
              value={amount}
              placeholder="1 000 000 000"
              onChange={setAmount}
              className="w-[170px]"
            />
          </SettingRow>
          <SettingRow title={t("ctl.plan.deals")} description={t("ctl.plan.dealsDesc")}>
            <NumberField value={deals} placeholder="—" onChange={setDeals} />
          </SettingRow>
          <SettingRow title={t("ctl.plan.parts")} description={t("ctl.plan.partsDesc")}>
            <Choice
              value={parts}
              onChange={setParts}
              options={PLAN_PARTS.map((n) => ({
                value: n,
                label:
                  n === 4 ? t("ctl.plan.quarters") : n === 2 ? t("ctl.plan.halves") : String(n),
              }))}
            />
          </SettingRow>
          <SettingRow
            title={t("ctl.plan.workDays")}
            description={t("ctl.plan.workDaysDesc", { n: autoDays })}
          >
            <NumberField
              value={days}
              placeholder={String(autoDays)}
              min={1}
              max={31}
              onChange={setDays}
              suffix={t("ctl.plan.daysUnit")}
            />
          </SettingRow>
        </SettingRows>

        {/* What the plan means: per day, and the checkpoints */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          {target > 0 ? (
            <>
              <p className="text-[13px] text-muted-foreground">{t("ctl.plan.perDayTitle")}</p>
              <p className="mt-1 font-display text-[26px] font-bold tabular-nums text-foreground">
                {money(perDay)}{" "}
                <span className="text-[15px] font-semibold text-muted-foreground">
                  × {workDays} {t("ctl.plan.daysUnit")} = {money(target)}
                </span>
              </p>
              <div className="mt-5">
                <div className="relative h-3 rounded-full bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-[width] duration-700"
                    style={{ width: `${Math.min(100, target ? (done / target) * 100 : 0)}%` }}
                  />
                  {checkpoints.map((c) => (
                    <span
                      key={c.part}
                      className={cn(
                        "absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
                        c.part <= reached
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-border bg-card",
                      )}
                      style={{ left: `${c.pct}%` }}
                    />
                  ))}
                </div>
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {checkpoints.map((c) => {
                    const ok = c.part <= reached;
                    const at = reachedAt(c.part);
                    return (
                      <li
                        key={c.part}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-3 py-2",
                          ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-border bg-card",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold tabular-nums",
                            ok ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {ok ? <Trophy className="h-4 w-4" /> : c.part}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold tabular-nums text-foreground">
                            {String(c.pct).replace(".", ",")}% · {money(c.amount)}
                          </span>
                          <span className="block text-[11.5px] text-muted-foreground">
                            {ok
                              ? at
                                ? t("ctl.plan.reachedAt", {
                                    d: dayText(at),
                                  })
                                : t("ctl.plan.reached")
                              : t("ctl.plan.byDay", {
                                  n: Math.max(1, Math.ceil((workDays * c.part) / parts)),
                                })}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("ctl.plan.empty")}</p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => void submit()}
          className="ctl-lit inline-flex h-10 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("ctl.plan.save")}
        </button>
      </div>
    </SectionCard>
  );
}

const STYLE_ICON: Record<CelebrationStyle, typeof PartyPopper> = {
  confetti: PartyPopper,
  fireworks: Sparkles,
  rocket: Rocket,
  trophy: Trophy,
  balloons: PartyPopper,
};

function StylePicker({
  value,
  onChange,
}: {
  value: CelebrationStyle;
  onChange: (s: CelebrationStyle) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-1.5">
      {CELEBRATION_STYLES.map((s) => {
        const Icon = STYLE_ICON[s];
        return (
          <button
            key={s}
            type="button"
            aria-pressed={value === s}
            onClick={() => onChange(s)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold",
              value === s ? "ctl-lit" : "ctl-soft",
            )}
          >
            <Icon className="h-4 w-4" />
            {t(`cel.style.${s}`)}
          </button>
        );
      })}
    </div>
  );
}

function TemplateField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const { t } = useI18n();
  const [id] = useState(() => `tpl-${Math.random().toString(36).slice(2)}`);
  return (
    <div>
      <label htmlFor={id} className="text-[12.5px] font-semibold text-muted-foreground">
        {label}
      </label>
      <textarea
        id={id}
        rows={2}
        maxLength={300}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full resize-none rounded-xl border border-border bg-input px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-primary"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11.5px] text-muted-foreground">{t("ctl.cel.vars")}</span>
        {VARS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(`${value}${value.endsWith(" ") || !value ? "" : " "}${v}`)}
            className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-[var(--primary-ink)] hover:bg-primary/20"
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

const SAMPLE = {
  pct: 25,
  part: 1,
  parts: 4,
  fact: "250 mln",
  target: "1 mlrd",
  left: "750 mln",
  name: "Aziza",
  funnel: "Kurslar",
};

function CelebrationsCard() {
  const { t } = useI18n();
  const { draft, setDraft, dirty, save, reset, saving } = useControlDraft();
  const c = draft.celebrations;
  const setC = (patch: Partial<typeof c>) =>
    setDraft((d) => ({ ...d, celebrations: { ...d.celebrations, ...patch } }));
  const preview = (detail: CelebrateDetail) => celebrate({ ...detail, seconds: c.seconds });

  return (
    <>
      <SectionCard
        icon={PartyPopper}
        tone="amber"
        title={t("ctl.cel.title")}
        description={t("ctl.cel.desc")}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Team / funnel plan */}
          <CelBlock
            icon={Flag}
            title={t("ctl.cel.team")}
            desc={t("ctl.cel.teamDesc")}
            on={c.team.on}
            onToggle={(v) => setC({ team: { ...c.team, on: v } })}
            onPreview={() =>
              preview({
                kind: "part",
                style: c.team.style,
                seller: fillTemplate(c.team.text, SAMPLE),
                lead: "Kurslar · 1/4 · 250 mln / 1 mlrd",
                pct: 25,
              })
            }
          >
            <TemplateField
              label={t("ctl.cel.partText")}
              value={c.team.text}
              onChange={(v) => setC({ team: { ...c.team, text: v } })}
            />
            <TemplateField
              label={t("ctl.cel.doneText")}
              value={c.team.doneText}
              onChange={(v) => setC({ team: { ...c.team, doneText: v } })}
            />
            <StylePicker
              value={c.team.style}
              onChange={(s) => setC({ team: { ...c.team, style: s } })}
            />
            <button
              type="button"
              onClick={() =>
                preview({
                  kind: "done",
                  style: c.team.style,
                  seller: fillTemplate(c.team.doneText, { ...SAMPLE, pct: 100, fact: "1 mlrd" }),
                  lead: "4/4 · 1 mlrd / 1 mlrd",
                  pct: 100,
                })
              }
              className="ctl-soft inline-flex h-9 items-center gap-1.5 self-start rounded-xl px-3 text-[12.5px] font-semibold"
            >
              <Trophy className="h-4 w-4" /> {t("ctl.cel.previewDone")}
            </button>
          </CelBlock>

          {/* Personal plan */}
          <CelBlock
            icon={User}
            title={t("ctl.cel.personal")}
            desc={t("ctl.cel.personalDesc")}
            on={c.personal.on}
            onToggle={(v) => setC({ personal: { ...c.personal, on: v } })}
            onPreview={() =>
              preview({
                kind: "personal",
                style: c.personal.style,
                seller: fillTemplate(c.personal.text, { ...SAMPLE, pct: 100 }),
                lead: "1/1 · 50 mln / 50 mln",
                pct: 100,
              })
            }
          >
            <TemplateField
              label={t("ctl.cel.text")}
              value={c.personal.text}
              onChange={(v) => setC({ personal: { ...c.personal, text: v } })}
            />
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[12.5px] font-semibold text-muted-foreground">
                {t("ctl.cel.audience")}
              </span>
              <Choice
                value={c.personal.audience}
                onChange={(v) => setC({ personal: { ...c.personal, audience: v } })}
                options={[
                  { value: "all", label: t("ctl.cel.audienceAll") },
                  { value: "self", label: t("ctl.cel.audienceSelf") },
                ]}
              />
            </div>
            <StylePicker
              value={c.personal.style}
              onChange={(s) => setC({ personal: { ...c.personal, style: s } })}
            />
          </CelBlock>

          {/* First sale of the day */}
          <CelBlock
            icon={Rocket}
            title={t("ctl.cel.first")}
            desc={t("ctl.cel.firstDesc")}
            on={c.firstSale.on}
            onToggle={(v) => setC({ firstSale: { ...c.firstSale, on: v } })}
            onPreview={() =>
              preview({
                kind: "first",
                style: c.firstSale.style,
                seller: fillTemplate(c.firstSale.text, SAMPLE),
                lead: "Nodira Saidova",
              })
            }
          >
            <TemplateField
              label={t("ctl.cel.text")}
              value={c.firstSale.text}
              onChange={(v) => setC({ firstSale: { ...c.firstSale, text: v } })}
            />
            <StylePicker
              value={c.firstSale.style}
              onChange={(s) => setC({ firstSale: { ...c.firstSale, style: s } })}
            />
          </CelBlock>

          {/* How it looks and sounds */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-foreground">
              <Volume2 className="h-4 w-4 text-primary" /> {t("ctl.cel.common")}
            </p>
            <SettingRows>
              <SettingRow title={t("ctl.cel.sound")} description={t("ctl.cel.soundDesc")}>
                <Switch
                  checked={c.sound}
                  onCheckedChange={(v) => setC({ sound: v })}
                  aria-label={t("ctl.cel.sound")}
                />
              </SettingRow>
              <SettingRow title={t("ctl.cel.seconds")} description={t("ctl.cel.secondsDesc")}>
                <Choice
                  value={c.seconds}
                  onChange={(v) => setC({ seconds: v })}
                  options={[4, 6, 8, 10].map((n) => ({ value: n, label: `${n} s` }))}
                />
              </SettingRow>
              <SettingRow title={t("ctl.cel.sale")} description={t("ctl.cel.saleDesc")}>
                <StylePicker value={c.sale.style} onChange={(s) => setC({ sale: { style: s } })} />
              </SettingRow>
            </SettingRows>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface px-3 py-2.5 text-[12.5px] leading-snug text-muted-foreground">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
              {t("ctl.cel.how")}
            </p>
          </div>
        </div>
      </SectionCard>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={reset} />
    </>
  );
}

function CelBlock({
  icon: Icon,
  title,
  desc,
  on,
  onToggle,
  onPreview,
  children,
}: {
  icon: typeof Flag;
  title: string;
  desc: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  onPreview: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4 transition-colors",
        on ? "border-amber-500/30 bg-amber-500/[0.04]" : "border-border bg-card opacity-80",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-foreground">{title}</p>
          <p className="text-[12.5px] leading-snug text-muted-foreground">{desc}</p>
        </div>
        <Switch checked={on} onCheckedChange={onToggle} aria-label={title} />
      </div>
      {children}
      <button
        type="button"
        onClick={onPreview}
        className="ctl-lit inline-flex h-9 items-center gap-1.5 self-start rounded-xl px-3.5 text-[12.5px] font-semibold"
      >
        <Play className="h-4 w-4" /> {t("ctl.cel.preview")}
      </button>
    </div>
  );
}

/** For the plan view: a funnel plan's done %, from facts. */
export function useFunnelPlanRows(month: string) {
  const plans = useSalesPlans(month);
  const facts = useSalesPlanFactsByFunnel(month);
  const { data: pipelines } = usePipelines();
  return useMemo(() => {
    return (plans.data ?? [])
      .filter((p) => !p.profile_id && p.pipeline_id)
      .map((p) => {
        const f = (facts.data ?? [])
          .filter((x) => x.pipelineId === p.pipeline_id)
          .reduce((a, x) => ({ deals: a.deals + x.deals, revenue: a.revenue + x.revenue }), {
            deals: 0,
            revenue: 0,
          });
        const byAmount = Number(p.target_amount) > 0;
        const target = byAmount ? Number(p.target_amount) : Number(p.target_deals);
        const done = byAmount ? f.revenue : f.deals;
        return {
          plan: p,
          name: (pipelines ?? []).find((x) => x.id === p.pipeline_id)?.name ?? "—",
          byAmount,
          target,
          done,
          pct: target > 0 ? Math.round((done / target) * 1000) / 10 : 0,
          reached: partsReached(done, target, p.parts ?? 4),
        };
      });
  }, [plans.data, facts.data, pipelines]);
}

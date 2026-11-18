import { useState } from "react";
import {
  Banknote,
  BrainCircuit,
  CircleAlert,
  Filter,
  Loader2,
  Megaphone,
  PhoneCall,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  Users,
  Video,
} from "lucide-react";
import { SectionCard, StatCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { marketingAiPost, type AiScope } from "@/hooks/use-crm-data";
import type { AiAnalysis, AiOverview } from "@/lib/marketing-ai/types";
import type { Finding } from "@/lib/marketing-ai/diagnose";
import type { Metrics } from "@/lib/marketing-ai/metrics";
import {
  KindTag,
  PRIORITY_STRIPE,
  PriorityChip,
  deltaPct,
  num,
  pct,
  tashkentDay,
  useMoney,
} from "@/components/marketing/ai/shared";

// AI tahlilchi -> Umumiy: what the figures say by themselves (the period
// and what data it used, the key figures against the previous period, the
// funnel's losses, why leads were not qualified, the alerts the numbers
// raise), and the AI's findings on top -- each with its evidence, the
// analysis, assumptions and numbered recommendations kept apart.

export function AiOverviewTab({
  data,
  scope,
  onTrack,
}: {
  data: AiOverview;
  scope: AiScope;
  onTrack: (f: Finding) => void;
}) {
  const { t } = useI18n();
  const money = useMoney();
  const m = data.current;
  const p = data.previous;
  const f = m.funnel;

  const kpis = [
    { k: "ai.k.leads", v: num(f.leads), d: deltaPct(f.leads, p.funnel.leads), icon: Users },
    {
      k: "ai.k.qualified",
      v: num(f.qualified),
      hint: pct(m.rates.qual),
      d: deltaPct(f.qualified, p.funnel.qualified),
      icon: Target,
    },
    {
      k: "ai.k.prepaid",
      v: num(f.advance),
      hint: pct(m.rates.leadToAdvance, 1),
      d: deltaPct(f.advance, p.funnel.advance),
      icon: Banknote,
    },
    {
      k: "ai.k.full",
      v: num(f.full),
      hint: pct(m.rates.advanceToFull),
      d: deltaPct(f.full, p.funnel.full),
      icon: Banknote,
    },
    {
      k: "ai.k.revenue",
      v: money(f.revenue),
      d: deltaPct(f.revenue, p.funnel.revenue),
      icon: Banknote,
    },
    {
      k: "ai.k.spend",
      v: money(m.efficiency.spend),
      d: deltaPct(m.efficiency.spend, p.efficiency.spend),
      icon: Megaphone,
    },
    {
      k: "ai.k.cpl",
      v: money(m.efficiency.cpl),
      d: deltaPct(m.efficiency.cpl, p.efficiency.cpl),
      icon: Filter,
      bad: true,
    },
    {
      k: "ai.k.cpql",
      v: money(m.efficiency.cpql),
      d: deltaPct(m.efficiency.cpql, p.efficiency.cpql),
      icon: Filter,
      bad: true,
    },
    {
      k: "ai.k.cac",
      v: money(m.efficiency.cac),
      d: deltaPct(m.efficiency.cac, p.efficiency.cac),
      icon: Filter,
      bad: true,
    },
    {
      k: "ai.k.roas",
      v: m.efficiency.roas != null ? `${m.efficiency.roas}×` : "—",
      hint: m.efficiency.roi != null ? `ROI ${m.efficiency.roi}%` : undefined,
      d: deltaPct(m.efficiency.roas, p.efficiency.roas),
      icon: TrendingDown,
    },
  ];

  return (
    <div className="space-y-5">
      <Basis m={m} prev={p} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((c) => (
          <StatCard
            key={c.k}
            label={t(c.k)}
            value={c.v}
            icon={c.icon}
            iconTone="violet"
            info={t(`${c.k}.tip`)}
            {...(c.hint ? { hint: c.hint } : {})}
            {...(c.d !== undefined ? { delta: c.d, deltaLowerIsBetter: !!c.bad } : {})}
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <SectionCard
          icon={Filter}
          tone="violet"
          title={t("ai.funnel")}
          description={t("ai.funnelDesc")}
        >
          <FunnelBars m={m} />
        </SectionCard>
        <SectionCard
          icon={CircleAlert}
          tone="rose"
          title={t("ai.reasons")}
          description={t("ai.reasonsDesc")}
        >
          <Reasons m={m} />
        </SectionCard>
      </div>

      <SectionCard
        icon={CircleAlert}
        tone="amber"
        title={t("ai.alerts")}
        description={t("ai.alertsDesc")}
      >
        {data.alerts.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">{t("ai.noAlerts")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.alerts.map((a) => (
              <li key={a.key} className="flex items-center gap-3 py-2.5">
                <PriorityChip p={a.priority} label={t(`ai.p.${a.priority}`)} />
                <span className="text-[13.5px] text-foreground">{t(a.title, a.vars)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <AnalysisCard data={data} scope={scope} onTrack={onTrack} />

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          icon={Video}
          tone="violet"
          title={t("ai.audience")}
          description={t("ai.audienceDesc")}
        >
          <Audience m={m} />
        </SectionCard>
        <SectionCard
          icon={Megaphone}
          tone="emerald"
          title={t("ai.bestWorst")}
          description={t("ai.bestWorstDesc")}
        >
          <BestWorst m={m} />
        </SectionCard>
      </div>
    </div>
  );
}

function Basis({ m, prev }: { m: Metrics; prev: Metrics }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[12.5px]">
      <span className="font-semibold text-foreground">
        {t("ai.basis", {
          from: tashkentDay(m.period.from),
          to: tashkentDay(new Date(Date.parse(m.period.to) - 1000).toISOString()),
        })}
      </span>
      <span className="text-muted-foreground">
        ·{" "}
        {t("ai.basisCounts", {
          leads: m.basis.leads,
          webinars: m.basis.webinars,
          spend: m.basis.spendRows,
        })}
      </span>
      <span className="text-muted-foreground">
        · {t("ai.basisPrev", { from: tashkentDay(prev.period.from) })}
      </span>
      {m.missing.length > 0 && (
        <span className="ml-auto flex flex-wrap gap-1.5">
          {m.missing.map((k) => (
            <span
              key={k}
              className="rounded-md bg-amber-500/14 px-2 py-0.5 text-[11.5px] font-semibold text-amber-800 dark:text-amber-200"
              title={t(`ai.missing.${k}.tip`)}
            >
              {t(`ai.missing.${k}`)}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function FunnelBars({ m }: { m: Metrics }) {
  const { t } = useI18n();
  const f = m.funnel;
  const steps = [
    { k: "ai.f.leads", v: f.leads, icon: Users },
    { k: "ai.f.pickedUp", v: f.pickedUp, icon: PhoneCall },
    { k: "ai.f.watched", v: f.watched, icon: Video },
    { k: "ai.f.qualified", v: f.qualified, icon: Target },
    { k: "ai.f.prepaid", v: f.advance, icon: Banknote },
    { k: "ai.f.full", v: f.full, icon: Banknote },
  ];
  const top = Math.max(1, f.leads);
  let worst = -1;
  let worstDrop = 0;
  steps.forEach((s, i) => {
    if (i === 0) return;
    const prev = steps[i - 1]!.v;
    const drop = prev ? (prev - s.v) / prev : 0;
    if (drop > worstDrop) {
      worstDrop = drop;
      worst = i;
    }
  });
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1]!.v : null;
        const conv = prev ? s.v / prev : null;
        const Icon = s.icon;
        return (
          <li key={s.k} className="grid grid-cols-[150px_1fr_110px] items-center gap-3 text-[13px]">
            <span className="flex items-center gap-2 font-semibold text-foreground">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {t(s.k)}
            </span>
            <span className="relative h-7 overflow-hidden rounded-md bg-muted/60">
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-md",
                  i === worst ? "bg-rose-500/70" : "bg-violet-500/70",
                )}
                style={{ width: `${Math.max(2, (s.v / top) * 100)}%` }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center font-semibold tabular-nums text-foreground">
                {num(s.v)}
              </span>
            </span>
            <span
              className={cn(
                "text-right tabular-nums",
                i === worst
                  ? "font-semibold text-rose-600 dark:text-rose-300"
                  : "text-muted-foreground",
              )}
            >
              {conv != null ? `${pct(conv)} ${t("ai.f.passed")}` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Reasons({ m }: { m: Metrics }) {
  const { t } = useI18n();
  const r = m.funnel.reasons;
  const rows = (Object.keys(r) as (keyof typeof r)[])
    .map((k) => ({ k, v: r[k] }))
    .sort((a, b) => b.v - a.v);
  const total = m.funnel.notQualified;
  if (!total)
    return (
      <p className="py-6 text-center text-[13px] text-muted-foreground">{t("ai.noReasons")}</p>
    );
  return (
    <ul className="space-y-2">
      {rows.map((x) => (
        <li key={x.k} className="grid grid-cols-[1fr_auto] gap-1 text-[13px]">
          <span className="text-foreground">{t(`qual.reason.${x.k}`)}</span>
          <span className="tabular-nums text-muted-foreground">
            {num(x.v)} · {pct(x.v / total)}
          </span>
          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-rose-500/70"
              style={{ width: `${(x.v / total) * 100}%` }}
            />
          </span>
        </li>
      ))}
      <li className="pt-1 text-[12px] text-muted-foreground">
        {t("ai.reasonsTotal", { n: num(total), pending: num(m.funnel.pending) })}
      </li>
    </ul>
  );
}

function Audience({ m }: { m: Metrics }) {
  const { t } = useI18n();
  const a = m.audience;
  const rows: [string, string][] = [
    [
      t("ai.a.subscribers"),
      a.subscribers != null
        ? `${num(a.subscribers)}${a.subscribersDelta != null ? ` (${a.subscribersDelta >= 0 ? "+" : ""}${num(a.subscribersDelta)})` : ""}`
        : "—",
    ],
    [t("ai.a.webinars"), num(a.webinars)],
    [t("ai.a.registrations"), num(a.registrations)],
    [t("ai.a.peakAvg"), num(a.peakAvg)],
    [t("ai.a.attendance"), pct(a.attendance)],
    [t("ai.a.drop"), pct(a.dropAvg)],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k} className="bg-card px-3 py-2.5">
            <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 text-[16px] font-bold tabular-nums text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      {a.worst && (
        <p className="rounded-lg bg-rose-500/8 px-3 py-2 text-[12.5px] text-foreground">
          <b>{t("ai.a.worst")}:</b> {a.worst.webinar} — {a.worst.label}:{" "}
          <b className="text-rose-600 dark:text-rose-300">{num(a.worst.change)}</b>
          {a.worst.pct != null ? ` (${pct(a.worst.pct)})` : ""}
        </p>
      )}
    </div>
  );
}

function BestWorst({ m }: { m: Metrics }) {
  const { t } = useI18n();
  const money = useMoney();
  const ranked = m.campaigns.filter((c) => c.leads >= 5);
  if (!ranked.length)
    return (
      <p className="py-6 text-center text-[13px] text-muted-foreground">{t("ai.noCampaigns")}</p>
    );
  const byQual = [...ranked].sort((a, b) => (b.qualRate ?? 0) - (a.qualRate ?? 0));
  const best = byQual.slice(0, 3);
  const worst = byQual
    .slice(-3)
    .reverse()
    .filter((c) => !best.includes(c));
  const row = (c: (typeof ranked)[number], good: boolean) => (
    <li key={c.name} className="flex items-center gap-3 py-2 text-[13px]">
      <span
        className={cn("h-2 w-2 shrink-0 rounded-full", good ? "bg-emerald-500" : "bg-rose-500")}
      />
      <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{c.name}</span>
      <span className="tabular-nums text-muted-foreground">{t("ai.bw.leads", { n: c.leads })}</span>
      <span className="w-[70px] text-right font-semibold tabular-nums">{pct(c.qualRate)}</span>
      <span className="hidden w-[120px] text-right tabular-nums text-muted-foreground sm:block">
        {money(c.cpql)}
      </span>
    </li>
  );
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11.5px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          {t("ai.best")}
        </p>
        <ul className="divide-y divide-border">{best.map((c) => row(c, true))}</ul>
      </div>
      {worst.length > 0 && (
        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
            {t("ai.worst")}
          </p>
          <ul className="divide-y divide-border">{worst.map((c) => row(c, false))}</ul>
        </div>
      )}
      <p className="text-[11.5px] text-muted-foreground">{t("ai.bwNote")}</p>
    </div>
  );
}

function AnalysisCard({
  data,
  scope,
  onTrack,
}: {
  data: AiOverview;
  scope: AiScope;
  onTrack: (f: Finding) => void;
}) {
  const { t } = useI18n();
  const [res, setRes] = useState<AiAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const last = data.lastAnalysis;
  const findings = res?.findings ?? last?.result.findings ?? [];
  const meta = res
    ? {
        at: res.at,
        provider: res.provider,
        model: res.model,
        cached: res.cached,
        rejected: res.rejected,
      }
    : last
      ? {
          at: last.created_at,
          provider: last.provider,
          model: last.model,
          cached: true,
          rejected: last.result.rejected ?? 0,
        }
      : null;

  async function run(force: boolean) {
    setBusy(true);
    setErr(null);
    try {
      setRes(await marketingAiPost<AiAnalysis>({ action: "analyze", scope, force }));
    } catch (e) {
      setErr(describeError(e, t("ai.failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      icon={BrainCircuit}
      tone="violet"
      title={t("ai.analysis")}
      description={t("ai.analysisDesc")}
      actions={
        <div className="flex gap-2">
          <Button onClick={() => void run(false)} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t("ai.analyze")}
          </Button>
          {meta && (
            <Button
              variant="outline"
              onClick={() => void run(true)}
              disabled={busy}
              title={t("ai.reanalyze")}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      }
    >
      {err && (
        <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">
          {err}
        </p>
      )}
      {meta && (
        <p className="mb-3 text-[12px] text-muted-foreground">
          {t("ai.meta", {
            at: new Date(meta.at).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }),
            model: meta.model ?? meta.provider ?? "AI",
          })}
          {meta.cached ? ` · ${t("ai.cached")}` : ""}
          {meta.rejected ? ` · ${t("ai.rejected", { n: meta.rejected })}` : ""}
        </p>
      )}
      {findings.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {busy ? t("ai.thinking") : t("ai.noFindings")}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {findings.map((x, i) => (
            <FindingCard key={i} f={x} onTrack={() => onTrack(x)} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function FindingCard({ f, onTrack }: { f: Finding; onTrack: () => void }) {
  const { t } = useI18n();
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-card p-4 pl-5">
      <span className={cn("absolute inset-y-0 left-0 w-1", PRIORITY_STRIPE[f.priority])} />
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[14.5px] font-bold leading-snug text-foreground">{f.problem}</h4>
        <PriorityChip p={f.priority} label={t(`ai.p.${f.priority}`)} />
      </div>
      <ul className="mt-2.5 space-y-1 text-[13px] text-foreground">
        {f.evidence.map((e, i) => (
          <li key={i}>
            <KindTag kind="fact" label={t("ai.fact")} />
            {e}
          </li>
        ))}
      </ul>
      {f.analysis && (
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">{f.analysis}</p>
      )}
      {f.assumptions.length > 0 && (
        <ul className="mt-2 space-y-1 text-[12.5px] text-muted-foreground">
          {f.assumptions.map((a, i) => (
            <li key={i}>
              <KindTag kind="guess" label={t("ai.guess")} />
              {a}
            </li>
          ))}
        </ul>
      )}
      <ol className="mt-2.5 space-y-1 text-[13px] text-foreground">
        {f.recommendations.map((r, i) => (
          <li key={i} className="flex gap-1.5">
            <KindTag kind="advice" label={`${t("ai.advice")} ${i + 1}`} />
            <span>{r}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="outline" onClick={onTrack}>
          {t("ai.track")}
        </Button>
      </div>
    </article>
  );
}

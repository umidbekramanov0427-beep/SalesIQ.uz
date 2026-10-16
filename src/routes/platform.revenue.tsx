import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgePercent,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Loader2,
  PauseCircle,
  Phone,
  Receipt,
  ShieldAlert,
  Sprout,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import { RequisitesCard } from "@/components/platform/RequisitesCard";
import { PageHeader, Pill, SectionCard, StatCard } from "@/components/layout/Primitives";
import { usePlatformRevenue } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { PLAN_LABELS } from "@/lib/plan-gating";
import type { OrgLine, RevenueReport } from "@/lib/revenue";
import { cn, describeError, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/platform/revenue")({
  head: () => ({ meta: [{ title: "Daromad — SalesIQ" }] }),
  component: PlatformRevenuePage,
});

const UZ_MONTHS = [
  "yan",
  "fev",
  "mar",
  "apr",
  "may",
  "iyn",
  "iyl",
  "avg",
  "sen",
  "okt",
  "noy",
  "dek",
];

/** 12 450 000 so'm. */
function som(n: number): string {
  return `${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
}

/** 12,4 mln — for chart labels. */
function short(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(".", ",")} mlrd`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} mln`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} ming`;
  return String(Math.round(n));
}

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${UZ_MONTHS[Number(m) - 1]} ${y!.slice(2)}`;
}

const PLAN_BAR: Record<string, string> = {
  start_iq: "bg-sky-500",
  analyst_iq: "bg-violet-500",
  master_iq: "bg-amber-500",
};

// The platform's money in one place: what companies pay each month (MRR),
// who left, how much a customer is worth, trial conversion, what was
// actually collected, and whom to call before their subscription ends.
function PlatformRevenuePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const q = usePlatformRevenue();

  if (user && user.role !== "platform_owner") {
    return (
      <SectionCard
        icon={ShieldAlert}
        tone="rose"
        title={t("admin.restrictedTitle")}
        description={t("admin.restrictedDesc")}
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <PageHeader icon={Wallet} tone="emerald" title={t("rev.title")} description={t("rev.desc")} />
      {q.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : q.error ? (
        <SectionCard icon={AlertTriangle} tone="rose" title={t("rev.loadFailed")}>
          <p className="text-sm text-muted-foreground">{describeError(q.error, "")}</p>
        </SectionCard>
      ) : q.data ? (
        <RevenueBody r={q.data} />
      ) : null}
    </>
  );
}

function RevenueBody({ r }: { r: RevenueReport }) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 phone:gap-2">
        <StatCard
          icon={CircleDollarSign}
          iconTone="emerald"
          label={t("rev.mrr")}
          value={som(r.mrr)}
          hint={t("rev.arr", { v: som(r.arr) })}
          info={t("rev.mrrInfo")}
        />
        <StatCard
          icon={Building2}
          iconTone="sky"
          label={t("rev.paying")}
          value={String(r.paying)}
          hint={t("rev.arpa", { v: som(r.arpa) })}
          info={t("rev.payingInfo")}
        />
        <StatCard
          icon={TrendingDown}
          iconTone="rose"
          label={t("rev.churn")}
          value={pct(r.churn.rate)}
          hint={t("rev.churnHint", { n: r.churn.count, v: som(r.churn.mrr) })}
          info={t("rev.churnInfo")}
          tone={r.churn.rate && r.churn.rate > 0.1 ? "danger" : "default"}
        />
        <StatCard
          icon={BadgePercent}
          iconTone="violet"
          label={t("rev.ltv")}
          value={r.ltv == null ? "—" : som(r.ltv)}
          hint={
            r.lifetimeMonths == null
              ? t("rev.ltvNoChurn")
              : t("rev.lifetime", { n: r.lifetimeMonths.toFixed(1).replace(".", ",") })
          }
          info={t("rev.ltvInfo")}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 phone:gap-2">
        <StatCard
          icon={Sprout}
          iconTone="emerald"
          label={t("rev.conversion")}
          value={pct(r.conversion.rate)}
          hint={t("rev.conversionHint", { c: r.conversion.converted, s: r.conversion.started })}
          info={t("rev.conversionInfo")}
        />
        <StatCard
          icon={Users}
          iconTone="amber"
          label={t("rev.trials")}
          value={String(r.trials)}
          hint={t("rev.trialsHint")}
        />
        <StatCard
          icon={Receipt}
          iconTone="primary"
          label={t("rev.collected30")}
          value={som(r.collectedLast30)}
          hint={t("rev.collectedMonth", { v: som(r.collectedThisMonth) })}
          info={t("rev.collectedInfo")}
        />
        <StatCard
          icon={PauseCircle}
          iconTone="slate"
          label={t("rev.frozen")}
          value={String(r.frozen)}
          hint={t("rev.openEnded", { n: r.openEnded })}
          info={t("rev.frozenInfo")}
        />
      </div>

      <SectionCard
        icon={Receipt}
        tone="emerald"
        title={t("rev.chartTitle")}
        description={t("rev.chartDesc")}
      >
        <MonthsChart months={r.months} />
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard icon={CircleDollarSign} tone="violet" title={t("rev.byPlan")}>
          <div className="space-y-4">
            {r.byPlan.map((p) => {
              const share = r.mrr > 0 ? p.mrr / r.mrr : 0;
              return (
                <div key={p.plan}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold text-foreground">
                      {PLAN_LABELS[p.plan]}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {t("rev.companies", { n: p.count })}
                      </span>
                    </span>
                    <span className="tabular-nums font-semibold text-foreground">{som(p.mrr)}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", PLAN_BAR[p.plan])}
                      style={{ width: `${Math.max(share > 0 ? 2 : 0, share * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard
          icon={CalendarClock}
          tone="amber"
          title={t("rev.renewals")}
          description={t("rev.renewalsDesc")}
        >
          <OrgList rows={r.renewals} empty={t("rev.renewalsEmpty")} kind="renewal" />
        </SectionCard>
      </div>

      <SectionCard
        icon={TrendingDown}
        tone="rose"
        title={t("rev.churnedTitle")}
        description={t("rev.churnedDesc")}
      >
        <OrgList rows={r.churned} empty={t("rev.churnedEmpty")} kind="churned" />
      </SectionCard>

      <RequisitesCard />

      <SectionCard icon={Receipt} tone="sky" title={t("rev.payments")}>
        {r.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("rev.paymentsEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("rev.col.company")}</th>
                  <th className="py-2 pr-3 font-medium">{t("rev.col.date")}</th>
                  <th className="py-2 pr-3 font-medium">{t("rev.col.provider")}</th>
                  <th className="py-2 pr-3 font-medium">{t("rev.col.status")}</th>
                  <th className="py-2 text-right font-medium">{t("rev.col.amount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {r.recent.map((p, i) => (
                  <tr key={`${p.organization_id}-${p.created_at}-${i}`}>
                    <td className="py-2.5 pr-3 font-medium text-foreground">
                      {p.status === "paid" && p.id ? (
                        <Link
                          to="/billing/doc"
                          search={{ payment: p.id, type: "invoice" }}
                          className="hover:text-primary hover:underline"
                          title={t("rev.openDocs")}
                        >
                          {p.orgName}
                        </Link>
                      ) : (
                        p.orgName
                      )}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">
                      {formatDate(p.paid_at ?? p.created_at)}
                    </td>
                    <td className="py-2.5 pr-3 capitalize text-muted-foreground">{p.provider}</td>
                    <td className="py-2.5 pr-3">
                      <Pill
                        tone={
                          p.status === "paid"
                            ? "success"
                            : p.status === "cancelled"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {t(`rev.status.${p.status}`)}
                      </Pill>
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums text-foreground">
                      {som(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function MonthsChart({ months }: { months: RevenueReport["months"] }) {
  const { t } = useI18n();
  const max = Math.max(1, ...months.map((m) => m.collected));
  const empty = months.every((m) => m.collected === 0);
  return (
    <div>
      {empty && <p className="mb-3 text-sm text-muted-foreground">{t("rev.chartEmpty")}</p>}
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 border-y border-dashed border-border/60">
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/40" />
        </div>
        <span className="absolute -top-0.5 right-0 text-[11px] text-muted-foreground tabular-nums">
          {short(max)}
        </span>
        <div className="relative flex h-48 items-end gap-1.5 sm:gap-2.5">
          {months.map((m, i) => {
            const h = (m.collected / max) * 100;
            const last = i === months.length - 1;
            return (
              <div
                key={m.month}
                className="group relative flex h-full flex-1 items-end justify-center"
              >
                <div
                  className={cn(
                    "w-full max-w-[44px] rounded-t-[4px] transition-colors",
                    last ? "bg-emerald-500" : "bg-emerald-500/55 group-hover:bg-emerald-500/80",
                  )}
                  style={{ height: `${m.collected > 0 ? Math.max(2, h) : 0}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg group-hover:block">
                  <p className="font-semibold text-foreground">{monthLabel(m.month)}</p>
                  <p className="tabular-nums text-foreground">{som(m.collected)}</p>
                  <p className="text-muted-foreground">
                    {t("rev.tipPayments", { n: m.payments, k: m.newPaying })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-2.5">
        {months.map((m) => (
          <div key={m.month} className="flex-1 text-center">
            <p className="text-[11px] text-muted-foreground">{monthLabel(m.month)}</p>
            {m.newPaying > 0 && (
              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                +{m.newPaying}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrgList({
  rows,
  empty,
  kind,
}: {
  rows: OrgLine[];
  empty: string;
  kind: "renewal" | "churned";
}) {
  const { t } = useI18n();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
      {rows.map((o) => (
        <Link
          key={o.id}
          to="/platform/organizations/$orgId"
          params={{ orgId: o.id }}
          className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{o.name}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
              <span>{PLAN_LABELS[o.plan]}</span>
              <span>· {som(o.mrr)}</span>
              {o.phone && (
                <span className="inline-flex items-center gap-1">
                  · <Phone className="h-3 w-3" /> {o.phone}
                </span>
              )}
            </p>
          </div>
          <Pill tone={kind === "churned" ? "danger" : (o.days ?? 0) <= 2 ? "warning" : "info"}>
            {kind === "churned"
              ? t("rev.endedAgo", { n: Math.abs(o.days ?? 0) })
              : (o.days ?? 0) <= 0
                ? t("rev.endsToday")
                : t("rev.endsIn", { n: o.days ?? 0 })}
          </Pill>
        </Link>
      ))}
    </div>
  );
}

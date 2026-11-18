// The facts about a company the owner sees on its lead card (Arizalar) and
// on its company card (Kompaniyalar -> Faoliyat): /platform/applications-api
// and /platform/org-facts both send them (loadLeadFacts).
import type { ReactNode } from "react";
import { Building2, CreditCard, Users, type LucideIcon } from "lucide-react";
import { HEALTH_DOT, money, PHASE_CHIP } from "@/components/owner/leads/shared";
import type { Health, HealthReason } from "@/lib/company-leads";
import { normalizePlan, PLAN_LABELS } from "@/lib/plan-gating";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type CompanyFacts = {
  org: {
    id: string;
    name: string;
    plan: string | null;
    subdomain: string | null;
    createdAt: string;
    trialEndsAt: string | null;
    isTrial: boolean;
    active: boolean;
    frozen: boolean;
  };
  people: { total: number; active7d: number; seatLimit: number | null; lastSeenAt: string | null };
  people_list: {
    id: string;
    name: string;
    role: string;
    email: string | null;
    lastSeenAt: string | null;
  }[];
  payments: {
    id: string;
    amount: number;
    status: string;
    provider: string;
    plan: string | null;
    createdAt: string;
    paidAt: string | null;
  }[];
  daysLeft: number | null;
  errors: {
    id: string;
    message: string;
    route: string | null;
    resolved: boolean;
    createdAt: string;
  }[];
  support: {
    id: string;
    direction: string;
    text: string;
    author: string | null;
    createdAt: string;
  }[];
  health: { level: Health; reasons: HealthReason[] };
};
export const factTime = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function HealthBadge({ health }: { health: CompanyFacts["health"] }) {
  const { t } = useI18n();
  return (
    <span
      title={health.reasons.map((r) => t(`lead.why.${r}`)).join("\n")}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[12.5px] font-semibold",
        health.level === "good" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        health.level === "watch" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        health.level === "risk" &&
          "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", HEALTH_DOT[health.level])} />
      {t(`lead.health.${health.level}`)}
      {health.reasons[0] && (
        <span className="font-normal opacity-80">· {t(`lead.why.${health.reasons[0]}`)}</span>
      )}
    </span>
  );
}

export function OwnerCard({
  title,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card", className)}>
      <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="flex-1 text-[13.5px] font-semibold text-foreground">{title}</h2>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function OwnerRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-foreground">{children}</span>
    </div>
  );
}

/** The company's life on the platform: phase, plan, people active, payments. */
export function CompanyFactsCard({ facts: f, title }: { facts: CompanyFacts; title?: string }) {
  const { t } = useI18n();
  const phase = f.org.frozen
    ? "frozen"
    : !f.org.active || (f.daysLeft != null && f.daysLeft < 0)
      ? "expired"
      : f.org.isTrial
        ? "trial"
        : "paid";
  const lastPaid = f.payments.find((p) => p.status === "paid");
  return (
    <OwnerCard
      title={title ?? t("lead.company")}
      icon={Building2}
      actions={
        phase && (
          <span
            className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", PHASE_CHIP[phase])}
          >
            {t(`lead.phase.${phase}`)}
          </span>
        )
      }
    >
      <OwnerRow label={t("lead.col.plan")}>{PLAN_LABELS[normalizePlan(f.org.plan)]}</OwnerRow>
      <OwnerRow label={f.org.isTrial ? t("lead.trialEnds") : t("lead.paidUntil")}>
        {f.org.trialEndsAt
          ? `${f.org.trialEndsAt.slice(0, 10)}${f.daysLeft != null ? ` (${t("lead.daysLeft", { n: f.daysLeft })})` : ""}`
          : "—"}
      </OwnerRow>
      {f.org.subdomain && (
        <OwnerRow label={t("lead.subdomain")}>{f.org.subdomain}.salesiq.uz</OwnerRow>
      )}
      <OwnerRow label={t("lead.lastSeen")}>
        {f.people.lastSeenAt ? factTime(f.people.lastSeenAt) : t("lead.never")}
      </OwnerRow>
      <div className="mt-3 rounded-xl bg-muted/40 p-3">
        <div className="flex items-baseline justify-between">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
            <Users className="h-4 w-4" /> {t("lead.activePeople")}
          </span>
          <span className="text-[15px] font-bold tabular-nums text-foreground">
            {f.people.active7d}
            <span className="text-[12px] font-medium text-subtle">
              {" "}
              / {f.people.total}
              {f.people.seatLimit != null ? ` · ${t("lead.limit", { n: f.people.seatLimit })}` : ""}
            </span>
          </span>
        </div>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
            style={{
              width: `${f.people.total ? (f.people.active7d / f.people.total) * 100 : 0}%`,
            }}
          />
        </span>
        <ul className="mt-2.5 space-y-1">
          {f.people_list.slice(0, 6).map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-[12px]">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  p.lastSeenAt && Date.now() - new Date(p.lastSeenAt).getTime() < 7 * 86_400_000
                    ? "bg-emerald-500"
                    : "bg-muted-foreground/30",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
              <span className="text-subtle">{t(`lead.role.${p.role}`)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
          <CreditCard className="h-4 w-4" /> {t("lead.payments")}
          {lastPaid && (
            <span className="ml-auto text-[11.5px] font-normal text-subtle">
              {t("lead.lastPayment", {
                date: (lastPaid.paidAt ?? lastPaid.createdAt).slice(0, 10),
              })}
            </span>
          )}
        </p>
        {f.payments.length ? (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
            {f.payments.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-[12px]">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    p.status === "paid"
                      ? "bg-emerald-500"
                      : p.status === "pending"
                        ? "bg-amber-500"
                        : "bg-muted-foreground/40",
                  )}
                />
                <span className="flex-1 tabular-nums text-foreground">{money(p.amount)}</span>
                <span className="text-subtle">{(p.paidAt ?? p.createdAt).slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-subtle">{t("lead.noPayments")}</p>
        )}
      </div>
    </OwnerCard>
  );
}

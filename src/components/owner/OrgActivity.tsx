// Kompaniyalar -> one company -> Faoliyat: how the company really lives on
// the platform (people active, payments, health), its lead in Arizalar, the
// last errors and the support conversation -- the same facts as the lead
// card (/platform/org-facts, loadOrgActivity).
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bug, Headset, Inbox, ListChecks, AlertTriangle, ChevronRight } from "lucide-react";
import {
  CompanyFactsCard,
  HealthBadge,
  OwnerCard,
  factTime,
  type CompanyFacts,
} from "@/components/owner/leads/CompanyFacts";
import { StageChip } from "@/components/owner/leads/shared";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type OrgActivityData = {
  facts: CompanyFacts | null;
  lead: { id: string; status: string; openTasks: number; openIssues: number } | null;
};

export function OrgActivity({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner-org-facts", orgId],
    queryFn: async (): Promise<OrgActivityData> => {
      const res = await apiFetch(`/platform/org-facts?org=${encodeURIComponent(orgId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  if (isLoading)
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
    );
  if (error || !data?.facts)
    return (
      <p className="rounded-2xl border border-border bg-card p-4 text-[13px] text-muted-foreground">
        {error instanceof Error ? error.message : t("orgcard.noFacts")}
      </p>
    );
  const f = data.facts;
  const lead = data.lead;
  const openErrors = f.errors.filter((e) => !e.resolved);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <HealthBadge health={f.health} />
        {f.health.reasons.slice(1).map((r) => (
          <span
            key={r}
            className="rounded-lg bg-muted px-2 py-1 text-[11.5px] font-medium text-muted-foreground"
          >
            {t(`lead.why.${r}`)}
          </span>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CompanyFactsCard facts={f} title={t("orgcard.activity")} />
        <div className="space-y-4">
          <OwnerCard title={t("orgcard.lead")} icon={Inbox}>
            {lead ? (
              <Link
                to="/platform/applications/$appId"
                params={{ appId: lead.id }}
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:border-primary/40"
              >
                <StageChip stage={lead.status} />
                <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                  <ListChecks className="h-3.5 w-3.5" />
                  {t("orgcard.openTasks", { n: lead.openTasks })}
                </span>
                {lead.openIssues > 0 && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t("orgcard.openIssues", { n: lead.openIssues })}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary">
                  {t("orgcard.openLead")} <ChevronRight className="h-4 w-4" />
                </span>
              </Link>
            ) : (
              <p className="text-[12.5px] text-subtle">{t("orgcard.noLead")}</p>
            )}
          </OwnerCard>

          <OwnerCard
            title={t("orgcard.errors")}
            icon={Bug}
            actions={
              openErrors.length > 0 && (
                <span className="rounded-md bg-rose-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  {openErrors.length}
                </span>
              )
            }
          >
            {f.errors.length ? (
              <ul className="space-y-1.5">
                {f.errors.slice(0, 6).map((e) => (
                  <li key={e.id} className="flex items-start gap-2 text-[12px]">
                    <span
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        e.resolved ? "bg-muted-foreground/30" : "bg-rose-500",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-foreground">{e.message}</span>
                      {e.route && (
                        <span className="font-mono text-[10.5px] text-subtle">{e.route}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-subtle">{factTime(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-subtle">{t("orgcard.noErrors")}</p>
            )}
          </OwnerCard>

          <OwnerCard
            title={t("orgcard.support")}
            icon={Headset}
            actions={
              <Link
                to="/platform/support"
                search={{ org: orgId }}
                className="text-[12px] font-semibold text-primary hover:underline"
              >
                {t("orgcard.openInbox")}
              </Link>
            }
          >
            {f.support.length ? (
              <ul className="space-y-2">
                {f.support.slice(0, 5).map((m) => (
                  <li key={m.id} className="text-[12px]">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-semibold",
                          m.direction === "out" ? "text-primary" : "text-foreground",
                        )}
                      >
                        {m.author ?? "—"}
                      </span>
                      <span className="ml-auto text-subtle">{factTime(m.createdAt)}</span>
                    </span>
                    <span className="line-clamp-2 text-muted-foreground">{m.text || "📎"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-subtle">{t("orgcard.noSupport")}</p>
            )}
          </OwnerCard>
        </div>
      </div>
    </div>
  );
}

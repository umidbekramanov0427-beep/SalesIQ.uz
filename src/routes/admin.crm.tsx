import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { HubGroup, HubTile } from "@/components/layout/SectionNav";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useCrmPageGroups, useCrmSetupCounts, type Item } from "@/components/admin/crm-pages";
import { CrmGate } from "@/components/CrmGate";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// One place for everything that makes SalesIQ work as a CRM -- funnels,
// lead sources, communication channels, automation, documents. Shown only
// when the platform owner has switched the company's CRM module on. The
// CRM section's main window: a tile per setting with what is set up.

export const Route = createFileRoute("/admin/crm")({
  head: () => ({ meta: [{ title: "CRM — SalesIQ" }] }),
  component: () => (
    <CrmGate>
      <AdminCrmPage />
    </CrmGate>
  ),
});

function AdminCrmPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const { data: counts } = useCrmSetupCounts();
  const groups = useCrmPageGroups();

  if (user && !isAdmin) {
    return (
      <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  const countOf = (it: Item) => (it.count && counts ? counts[it.count] : undefined);
  const tracked = groups.flatMap((g) => g.items).filter((it) => countOf(it) !== undefined);
  const done = tracked.filter((it) => (countOf(it) ?? 0) > 0);
  const next = tracked.find((it) => countOf(it) === 0);
  const pct = tracked.length ? Math.round((done.length / tracked.length) * 100) : 0;

  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("crm.title")} description={t("crm.desc")} />

      {/* Setup status: how far along the company is, and the one thing to
          do next -- so the page answers "what's left?" before the tiles. */}
      <section className="mb-8 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{t("crm.setupTitle")}</p>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {counts ? `${done.length} / ${tracked.length}` : "…"}
            </p>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {!counts
              ? t("common.loading")
              : next
                ? t("crm.setupNextHint", { name: next.label })
                : t("crm.setupDone")}
          </p>
        </div>
        {next && (
          <Link
            to={next.to}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("crm.setupNextAction", { name: next.label })}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </section>

      <div className="space-y-8">
        {groups.map((g) => (
          <HubGroup key={g.title} title={g.title} description={g.desc}>
            {g.items.map((it) => {
              const n = countOf(it);
              return (
                <HubTile
                  key={it.to}
                  to={it.to}
                  icon={it.icon}
                  title={it.label}
                  status={
                    n === undefined
                      ? it.desc
                      : n > 0
                        ? t("crm.countSet", { count: n })
                        : t("crm.notSet")
                  }
                  tone={n === undefined ? undefined : n > 0 ? "ok" : "warn"}
                />
              );
            })}
          </HubGroup>
        ))}
      </div>
    </>
  );
}

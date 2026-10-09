import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileSignature,
  FileText,
  ListChecks,
  MessageSquareReply,
  Phone,
  Plug,
  ShieldAlert,
  Users,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon,
  AlarmClock,
  Copy,
  ShieldCheck,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { CrmGate } from "@/components/CrmGate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// One place for everything that makes SalesIQ work as a CRM -- funnels,
// lead sources, communication channels, automation, documents. Shown only
// when the platform owner has switched the company's CRM module on.

export const Route = createFileRoute("/admin/crm")({
  head: () => ({ meta: [{ title: "CRM — SalesIQ" }] }),
  component: () => (
    <CrmGate>
      <AdminCrmPage />
    </CrmGate>
  ),
});

const COUNTED_TABLES = [
  "pipelines",
  "lead_custom_field_defs",
  "lead_sources",
  "web_forms",
  "org_telephony_credentials",
  "auto_responders",
  "automation_rules",
  "salesbots",
  "contract_templates",
] as const;
type CountedTable = (typeof COUNTED_TABLES)[number];

// How many of each thing the company has set up -- head-only counts, no
// rows travel. A table the caller can't read comes back as undefined and
// its item simply shows no status.
function useCrmSetupCounts() {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery({
    queryKey: ["crm_setup_counts", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const entries = await Promise.all(
        COUNTED_TABLES.map(async (table) => {
          const { count, error } = await supabase
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId!);
          return [table, error ? undefined : (count ?? 0)] as const;
        }),
      );
      return Object.fromEntries(entries) as Partial<Record<CountedTable, number | undefined>>;
    },
  });
}

type Item = { to: string; icon: LucideIcon; label: string; desc: string; count?: CountedTable };
type Group = { title: string; desc: string; icon: LucideIcon; items: Item[] };

function AdminCrmPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const { data: counts } = useCrmSetupCounts();

  if (user && !isAdmin) {
    return (
      <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  const groups: Group[] = [
    {
      title: t("crm.group.control"),
      desc: t("crm.group.controlDesc"),
      icon: ShieldCheck,
      items: [
        {
          to: "/admin/task-control",
          icon: AlarmClock,
          label: t("taskControl.title"),
          desc: t("crm.item.taskControl"),
        },
        {
          to: "/admin/duplicates",
          icon: Copy,
          label: t("crm.item.dupControlTitle"),
          desc: t("crm.item.dupControl"),
        },
      ],
    },
    {
      title: t("crm.group.funnel"),
      desc: t("crm.group.funnelDesc"),
      icon: Workflow,
      items: [
        {
          to: "/admin/pipelines",
          icon: Workflow,
          label: t("admin.pipelinesSettings"),
          desc: t("crm.item.pipelines"),
          count: "pipelines",
        },
        {
          to: "/admin/lead-fields",
          icon: ListChecks,
          label: t("admin.leadFieldsSettings"),
          desc: t("crm.item.leadFields"),
          count: "lead_custom_field_defs",
        },
      ],
    },
    {
      title: t("crm.group.channels"),
      desc: t("crm.group.channelsDesc"),
      icon: Phone,
      items: [
        {
          to: "/admin/telephony",
          icon: Phone,
          label: t("admin.telephonySettings"),
          desc: t("crm.item.telephony"),
          count: "org_telephony_credentials",
        },
        {
          to: "/integrations",
          icon: Plug,
          label: t("crm.item.messengersTitle"),
          desc: t("crm.item.messengers"),
        },
        {
          to: "/admin/auto-responders",
          icon: MessageSquareReply,
          label: t("admin.autoResponders"),
          desc: t("crm.item.autoResponders"),
          count: "auto_responders",
        },
      ],
    },
    {
      title: t("crm.group.sources"),
      desc: t("crm.group.sourcesDesc"),
      icon: Webhook,
      items: [
        {
          to: "/admin/lead-sources",
          icon: Webhook,
          label: t("admin.leadSourcesSettings"),
          desc: t("crm.item.leadSources"),
          count: "lead_sources",
        },
        {
          to: "/admin/web-forms",
          icon: FileText,
          label: t("admin.webFormsSettings"),
          desc: t("crm.item.webForms"),
          count: "web_forms",
        },
      ],
    },
    {
      title: t("crm.group.automation"),
      desc: t("crm.group.automationDesc"),
      icon: Zap,
      items: [
        {
          to: "/admin/automations",
          icon: Zap,
          label: t("admin.automationsSettings"),
          desc: t("crm.item.automations"),
          count: "automation_rules",
        },
        {
          to: "/admin/salesbots",
          icon: Bot,
          label: t("dp.salesbots"),
          desc: t("crm.item.salesbots"),
          count: "salesbots",
        },
      ],
    },
    {
      title: t("crm.group.documents"),
      desc: t("crm.group.documentsDesc"),
      icon: FileSignature,
      items: [
        {
          to: "/admin/contract-templates",
          icon: FileSignature,
          label: t("admin.contractTemplatesSettings"),
          desc: t("crm.item.contracts"),
          count: "contract_templates",
        },
      ],
    },
  ];

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
          do next -- so the page answers "what's left?" before listing
          every setting. */}
      <section className="surface-card mb-4 flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{t("crm.setupTitle")}</p>
            <p className="text-sm font-bold tabular-nums text-foreground">
              {counts ? `${done.length} / ${tracked.length}` : "…"}
            </p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
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
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("crm.setupNextAction", { name: next.label })}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title} className="surface-card overflow-hidden">
            <header className="flex items-center gap-3 border-b border-border bg-surface/60 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                <g.icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold text-foreground">{g.title}</h2>
                <p className="truncate text-xs text-muted-foreground">{g.desc}</p>
              </div>
            </header>
            <ul className="divide-y divide-border">
              {g.items.map((it) => {
                const n = countOf(it);
                return (
                  <li key={it.to}>
                    <Link
                      to={it.to}
                      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/[0.04]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-background text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
                        <it.icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">
                          {it.label}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {it.desc}
                        </span>
                      </span>
                      {n !== undefined && (
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                            n > 0 ? "bg-success/12 text-success" : "bg-warning/12 text-warning",
                          )}
                        >
                          {n > 0 && <CheckCircle2 className="h-3.5 w-3.5" />}
                          {n > 0 ? t("crm.countSet", { count: n }) : t("crm.notSet")}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

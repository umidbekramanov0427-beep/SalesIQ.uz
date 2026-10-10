import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  ChevronRight,
  FileSignature,
  FileText,
  ListChecks,
  MessageSquareReply,
  Phone,
  Plug,
  ShieldAlert,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon,
  AlarmClock,
  Copy,
  ShieldCheck,
  Blocks,
} from "lucide-react";
import {
  IconTile,
  PageHeader,
  SectionCard,
  StatusChip,
  type CardTone,
} from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { CrmGate } from "@/components/CrmGate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

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

  const GROUP_TONES: CardTone[] = ["emerald", "violet", "sky", "amber", "rose", "slate"];

  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("crm.title")} description={t("crm.desc")} icon={Blocks} tone="primary" />

      {/* Setup status: how far along the company is, and the one thing to
          do next -- so the page answers "what's left?" before listing
          every setting. */}
      <section className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.05)] sm:p-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[40px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
              {counts ? `${pct}%` : "…"}
            </span>
            <span className="text-sm text-muted-foreground">
              {counts ? `${done.length} / ${tracked.length}` : ""}
            </span>
          </div>
          <div className="min-w-[220px] flex-1">
            <p className="text-[15px] font-semibold text-foreground">{t("crm.setupTitle")}</p>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
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
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("crm.setupNextAction", { name: next.label })}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {groups.map((g, gi) => {
          const tone = GROUP_TONES[gi % GROUP_TONES.length]!;
          return (
            <section
              key={g.title}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.05)]"
            >
              <header className="flex items-start gap-4 px-5 pb-4 pt-5 sm:px-6">
                <IconTile icon={g.icon} tone={tone} />
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
                    {g.title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{g.desc}</p>
                </div>
              </header>
              <ul className="space-y-1 px-3 pb-3">
                {g.items.map((it) => {
                  const n = countOf(it);
                  return (
                    <li key={it.to}>
                      <Link
                        to={it.to}
                        className="group flex items-center gap-3.5 rounded-xl px-3 py-3 transition-colors hover:bg-accent/50"
                      >
                        <IconTile icon={it.icon} tone={tone} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-foreground">
                            {it.label}
                          </span>
                          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                            {it.desc}
                          </span>
                        </span>
                        {n !== undefined && (
                          <StatusChip state={n > 0 ? "ok" : "warn"}>
                            {n > 0 ? t("crm.countSet", { count: n }) : t("crm.notSet")}
                          </StatusChip>
                        )}
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

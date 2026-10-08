import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bot,
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
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { CrmGate } from "@/components/CrmGate";
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

type Item = { to: string; icon: LucideIcon; label: string; desc: string };
type Group = { title: string; desc: string; items: Item[] };

function AdminCrmPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
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
      title: t("crm.group.funnel"),
      desc: t("crm.group.funnelDesc"),
      items: [
        {
          to: "/admin/pipelines",
          icon: Workflow,
          label: t("admin.pipelinesSettings"),
          desc: t("crm.item.pipelines"),
        },
        {
          to: "/admin/lead-fields",
          icon: ListChecks,
          label: t("admin.leadFieldsSettings"),
          desc: t("crm.item.leadFields"),
        },
        {
          to: "/admin/duplicates",
          icon: Users,
          label: t("admin.duplicatesSettings"),
          desc: t("crm.item.duplicates"),
        },
      ],
    },
    {
      title: t("crm.group.sources"),
      desc: t("crm.group.sourcesDesc"),
      items: [
        {
          to: "/admin/lead-sources",
          icon: Webhook,
          label: t("admin.leadSourcesSettings"),
          desc: t("crm.item.leadSources"),
        },
        {
          to: "/admin/web-forms",
          icon: FileText,
          label: t("admin.webFormsSettings"),
          desc: t("crm.item.webForms"),
        },
      ],
    },
    {
      title: t("crm.group.channels"),
      desc: t("crm.group.channelsDesc"),
      items: [
        {
          to: "/admin/telephony",
          icon: Phone,
          label: t("admin.telephonySettings"),
          desc: t("crm.item.telephony"),
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
        },
      ],
    },
    {
      title: t("crm.group.automation"),
      desc: t("crm.group.automationDesc"),
      items: [
        {
          to: "/admin/automations",
          icon: Zap,
          label: t("admin.automationsSettings"),
          desc: t("crm.item.automations"),
        },
        {
          to: "/admin/salesbots",
          icon: Bot,
          label: t("dp.salesbots"),
          desc: t("crm.item.salesbots"),
        },
      ],
    },
    {
      title: t("crm.group.documents"),
      desc: t("crm.group.documentsDesc"),
      items: [
        {
          to: "/admin/contract-templates",
          icon: FileSignature,
          label: t("admin.contractTemplatesSettings"),
          desc: t("crm.item.contracts"),
        },
      ],
    },
  ];

  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("crm.title")} description={t("crm.desc")} />
      <div className="space-y-3">
        {groups.map((g, gi) => (
          <section key={g.title} className="surface-card p-3 sm:p-4">
            <div className="mb-3 flex items-baseline gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-bold text-primary">
                {gi + 1}
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground">{g.title}</h2>
                <p className="text-xs text-subtle">{g.desc}</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((it) => (
                <Link
                  key={it.to}
                  to={it.to}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <it.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{it.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-subtle">{it.desc}</span>
                  </span>
                  <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

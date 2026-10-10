import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  Bot,
  Copy,
  FileSignature,
  FileText,
  ListChecks,
  MessageSquareReply,
  Phone,
  Plug,
  ShieldCheck,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// Everything that makes SalesIQ work as a CRM, grouped -- the CRM settings
// hub shows these as tiles and every CRM page lists them as its sub-tabs.

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
export type CountedTable = (typeof COUNTED_TABLES)[number];

// How many of each thing the company has set up -- head-only counts, no
// rows travel. A table the caller can't read comes back as undefined and
// its item simply shows no status.
export function useCrmSetupCounts() {
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

export type Item = {
  to: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  count?: CountedTable;
};
export type Group = { title: string; desc: string; icon: LucideIcon; items: Item[] };

export function useCrmPageGroups(): Group[] {
  const { t } = useI18n();
  return [
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
}

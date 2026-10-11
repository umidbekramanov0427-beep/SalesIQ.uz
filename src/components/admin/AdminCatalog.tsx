import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  Boxes,
  ChevronRight,
  Copy,
  Download,
  FileSignature,
  FileText,
  ListChecks,
  Lock,
  Mail,
  MessageSquareReply,
  MessageSquareText,
  Network,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { IconTile, StatusChip, type CardTone } from "@/components/layout/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCrmEnabled } from "@/lib/use-org-access";
import {
  useAmoConnectionStatus,
  useBitrix24ConnectionStatus,
  useSmsStatus,
  useSmtpStatus,
  useTelephonyStatus,
} from "@/hooks/use-crm-data";

// Everything an admin sets up, as one flat list of cards: one card is one
// page, nothing nested. The Admin panel shows all groups; /integrations
// shows only the integrations group.

export type CatalogGroupKey = "start" | "team" | "crm" | "integrations" | "ai";

type Status = { ok: boolean; label: string };
export type CatalogItem = {
  key: string;
  to: string;
  icon: LucideIcon;
  tone: CardTone;
  status?: Status | undefined;
};
export type CatalogGroup = { key: CatalogGroupKey; items: CatalogItem[] };

const COUNTED_TABLES = [
  "pipelines",
  "lead_custom_field_defs",
  "lead_sources",
  "web_forms",
  "auto_responders",
  "automation_rules",
  "salesbots",
  "contract_templates",
] as const;
type CountedTable = (typeof COUNTED_TABLES)[number];

// How many of each thing the company has set up -- head-only counts, no
// rows travel. A table the caller can't read comes back as undefined and
// its card simply shows no status.
function useSetupCounts() {
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

export function useAdminCatalog(): CatalogGroup[] {
  const { t } = useI18n();
  const crmEnabled = useCrmEnabled();
  const { data: counts } = useSetupCounts();
  const amo = useAmoConnectionStatus();
  const bitrix = useBitrix24ConnectionStatus();
  const sms = useSmsStatus();
  const smtp = useSmtpStatus();
  const telephony = useTelephonyStatus();

  const counted = (table: CountedTable): Status | undefined => {
    const n = counts?.[table];
    if (n === undefined) return undefined;
    return n > 0
      ? { ok: true, label: t("hub.status.count", { count: n }) }
      : { ok: false, label: t("hub.status.notSet") };
  };
  const connected = (loaded: boolean, isOn: boolean): Status | undefined =>
    loaded
      ? isOn
        ? { ok: true, label: t("hub.status.connected") }
        : { ok: false, label: t("hub.status.notConnected") }
      : undefined;

  const groups: CatalogGroup[] = [
    {
      key: "start",
      items: [
        { key: "rollout", to: "/rollout-plan", icon: ListChecks, tone: "emerald" },
        { key: "help", to: "/help", icon: BookOpen, tone: "sky" },
      ],
    },
    {
      key: "team",
      items: [
        { key: "employees", to: "/admin/employees", icon: Users, tone: "sky" },
        { key: "permissions", to: "/admin/permissions", icon: Lock, tone: "violet" },
        { key: "orgStructure", to: "/admin/org-structure", icon: Network, tone: "amber" },
        { key: "security", to: "/admin/security", icon: ShieldCheck, tone: "emerald" },
        { key: "errors", to: "/admin/errors", icon: AlertTriangle, tone: "rose" },
      ],
    },
  ];

  if (crmEnabled) {
    groups.push({
      key: "crm",
      items: [
        {
          key: "pipelines",
          to: "/admin/pipelines",
          icon: Workflow,
          tone: "violet",
          status: counted("pipelines"),
        },
        {
          key: "leadFields",
          to: "/admin/lead-fields",
          icon: ListChecks,
          tone: "violet",
          status: counted("lead_custom_field_defs"),
        },
        {
          key: "leadSources",
          to: "/admin/lead-sources",
          icon: Webhook,
          tone: "amber",
          status: counted("lead_sources"),
        },
        {
          key: "webForms",
          to: "/admin/web-forms",
          icon: FileText,
          tone: "amber",
          status: counted("web_forms"),
        },
        { key: "taskControl", to: "/admin/task-control", icon: AlarmClock, tone: "emerald" },
        { key: "duplicates", to: "/admin/duplicates", icon: Copy, tone: "emerald" },
        {
          key: "automations",
          to: "/admin/automations",
          icon: Zap,
          tone: "rose",
          status: counted("automation_rules"),
        },
        {
          key: "salesbots",
          to: "/admin/salesbots",
          icon: Bot,
          tone: "rose",
          status: counted("salesbots"),
        },
        {
          key: "autoResponders",
          to: "/admin/auto-responders",
          icon: MessageSquareReply,
          tone: "sky",
          status: counted("auto_responders"),
        },
        {
          key: "contracts",
          to: "/admin/contract-templates",
          icon: FileSignature,
          tone: "slate",
          status: counted("contract_templates"),
        },
      ],
    });
  }

  const integrations: CatalogItem[] = [
    {
      key: "amocrm",
      to: "/integrations/amocrm",
      icon: Boxes,
      tone: "sky",
      status: connected(amo.isFetched, !!amo.data),
    },
    {
      key: "bitrix24",
      to: "/integrations/bitrix24",
      icon: Boxes,
      tone: "violet",
      status: connected(bitrix.isFetched, !!bitrix.data),
    },
    { key: "amocrmImport", to: "/admin/amocrm-import", icon: Download, tone: "slate" },
  ];
  if (crmEnabled) {
    integrations.push(
      {
        key: "telephony",
        to: "/admin/telephony",
        icon: Phone,
        tone: "emerald",
        status: connected(telephony.isFetched, Object.keys(telephony.data ?? {}).length > 0),
      },
      {
        key: "sms",
        to: "/integrations/sms",
        icon: MessageSquareText,
        tone: "amber",
        status: connected(sms.isFetched, !!sms.data?.connected),
      },
      {
        key: "email",
        to: "/integrations/email",
        icon: Mail,
        tone: "rose",
        status: connected(smtp.isFetched, !!smtp.data?.connected),
      },
      { key: "webhook", to: "/integrations/webhook", icon: Webhook, tone: "primary" },
      { key: "telegramApp", to: "/integrations/telegram-app", icon: Send, tone: "sky" },
    );
  }
  groups.push({ key: "integrations", items: integrations });
  groups.push({
    key: "ai",
    items: [{ key: "aiAgents", to: "/admin/ai-agents", icon: Sparkles, tone: "violet" }],
  });
  return groups;
}

export function CatalogCard({ item }: { item: CatalogItem }) {
  const { t } = useI18n();
  return (
    <Link
      to={item.to}
      className="group flex h-full items-start gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.05)] transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <IconTile icon={item.icon} tone={item.tone} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] font-semibold leading-snug text-foreground">
          {t(`hub.item.${item.key}.title`)}
        </span>
        <span className="text-[13px] leading-snug text-muted-foreground">
          {t(`hub.item.${item.key}.desc`)}
        </span>
        {item.status && (
          <span className="mt-1.5">
            <StatusChip state={item.status.ok ? "ok" : "warn"}>{item.status.label}</StatusChip>
          </span>
        )}
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

export function CatalogGroupSection({ group }: { group: CatalogGroup }) {
  const { t } = useI18n();
  if (group.items.length === 0) return null;
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {t(`hub.group.${group.key}`)}
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {group.items.map((it) => (
          <CatalogCard key={it.key} item={it} />
        ))}
      </div>
    </section>
  );
}

// How far along the company is, and the one thing to do next.
export function SetupProgress({ groups }: { groups: CatalogGroup[] }) {
  const { t } = useI18n();
  const tracked = groups.flatMap((g) => g.items).filter((it) => it.status);
  if (tracked.length === 0) return null;
  const done = tracked.filter((it) => it.status!.ok);
  const next = tracked.find((it) => !it.status!.ok);
  const pct = Math.round((done.length / tracked.length) * 100);
  return (
    <section className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[36px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {pct}%
          </span>
          <span className="text-sm text-muted-foreground">
            {done.length} / {tracked.length}
          </span>
        </div>
        <div className="min-w-[220px] flex-1">
          <p className="text-[15px] font-semibold text-foreground">{t("hub.setupTitle")}</p>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {next
              ? t("hub.setupNext", { name: t(`hub.item.${next.key}.title`) })
              : t("hub.setupDone")}
          </p>
        </div>
        {next && (
          <Link
            to={next.to}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("hub.setupGo")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

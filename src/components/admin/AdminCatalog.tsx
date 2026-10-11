import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Circle,
  Code2,
  Copy,
  FileSignature,
  FileText,
  ListChecks,
  Lock,
  Mail,
  MessageSquareReply,
  MessageSquareText,
  Network,
  Phone,
  PhoneOutgoing,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { TONE_TILE } from "@/lib/tones";
import type { CardTone } from "@/components/layout/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCrmEnabled } from "@/lib/use-org-access";
import { cn } from "@/lib/utils";
import {
  useAmoConnectionStatus,
  useBitrix24ConnectionStatus,
  useProfilesRaw,
  useSmsStatus,
  useSmtpStatus,
  useTelephonyStatus,
} from "@/hooks/use-crm-data";
import type { TelephonyProvider } from "@/lib/telephony/provider-meta";

// Everything an admin sets up, as one flat list of cards: one card is one
// page, nothing nested. The Admin panel shows all groups; /integrations
// shows only the integration groups.

export type CatalogGroupKey = "start" | "team" | "crm" | "integrations" | "telephony" | "ai";

type Status = { ok: boolean; label: string };

// A card's picture: a platform feature gets a coloured icon; a service we
// connect to gets that service's own logo -- a file shipped with the app
// when we have its official mark, otherwise the favicon of its website.
export type CatalogLogo = { src: string } | { domain: string };

export type CatalogItem = {
  key: string;
  to: string;
  search?: Record<string, string>;
  icon: LucideIcon;
  tone: CardTone;
  logo?: CatalogLogo;
  guide: string;
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

// Telephony providers, each its own card and page (/admin/telephony?provider=…).
const TELEPHONY: {
  id: TelephonyProvider;
  logo?: CatalogLogo;
  icon: LucideIcon;
  tone: CardTone;
}[] = [
  { id: "onlinepbx", logo: { domain: "onlinepbx.ru" }, icon: Phone, tone: "emerald" },
  { id: "sipuni", logo: { domain: "sipuni.com" }, icon: Phone, tone: "sky" },
  { id: "moizvonki", logo: { domain: "moizvonki.ru" }, icon: Phone, tone: "sky" },
  { id: "binotel", logo: { domain: "binotel.ua" }, icon: Phone, tone: "emerald" },
  { id: "newtel", icon: Phone, tone: "violet" },
  { id: "freepbx", logo: { domain: "freepbx.org" }, icon: Server, tone: "slate" },
  { id: "issabel", logo: { domain: "issabel.org" }, icon: Server, tone: "slate" },
  { id: "api_inbound", icon: Code2, tone: "slate" },
  { id: "api_outbound", icon: Code2, tone: "slate" },
];

export function useAdminCatalog(): CatalogGroup[] {
  const { t } = useI18n();
  const crmEnabled = useCrmEnabled();
  const { data: counts } = useSetupCounts();
  const amo = useAmoConnectionStatus();
  const bitrix = useBitrix24ConnectionStatus();
  const sms = useSmsStatus();
  const smtp = useSmtpStatus();
  const telephony = useTelephonyStatus();
  const { data: profiles } = useProfilesRaw();

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
        {
          key: "rollout",
          to: "/rollout-plan",
          icon: ListChecks,
          tone: "emerald",
          guide: "start",
        },
        { key: "help", to: "/help", icon: BookOpen, tone: "sky", guide: "start" },
      ],
    },
    {
      key: "team",
      items: [
        { key: "employees", to: "/admin/employees", icon: Users, tone: "sky", guide: "employees" },
        {
          key: "permissions",
          to: "/admin/permissions",
          icon: Lock,
          tone: "violet",
          guide: "permissions",
        },
        {
          key: "orgStructure",
          to: "/admin/org-structure",
          icon: Network,
          tone: "amber",
          guide: "employees",
        },
        {
          key: "security",
          to: "/admin/security",
          icon: ShieldCheck,
          tone: "emerald",
          guide: "permissions",
        },
        { key: "errors", to: "/admin/errors", icon: AlertTriangle, tone: "rose", guide: "start" },
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
          guide: "pipelines",
          status: counted("pipelines"),
        },
        {
          key: "leadFields",
          to: "/admin/lead-fields",
          icon: ListChecks,
          tone: "violet",
          guide: "lead-fields",
          status: counted("lead_custom_field_defs"),
        },
        {
          key: "leadSources",
          to: "/admin/lead-sources",
          icon: Webhook,
          tone: "amber",
          guide: "lead-sources",
          status: counted("lead_sources"),
        },
        {
          key: "webForms",
          to: "/admin/web-forms",
          icon: FileText,
          tone: "amber",
          guide: "web-forms",
          status: counted("web_forms"),
        },
        {
          key: "taskControl",
          to: "/admin/task-control",
          icon: AlarmClock,
          tone: "emerald",
          guide: "task-control",
        },
        {
          key: "duplicates",
          to: "/admin/duplicates",
          icon: Copy,
          tone: "emerald",
          guide: "duplicates",
        },
        {
          key: "automations",
          to: "/admin/automations",
          icon: Zap,
          tone: "rose",
          guide: "automations",
          status: counted("automation_rules"),
        },
        {
          key: "salesbots",
          to: "/admin/salesbots",
          icon: Bot,
          tone: "rose",
          guide: "salesbots",
          status: counted("salesbots"),
        },
        {
          key: "autoResponders",
          to: "/admin/auto-responders",
          icon: MessageSquareReply,
          tone: "sky",
          guide: "auto-responders",
          status: counted("auto_responders"),
        },
        {
          key: "contracts",
          to: "/admin/contract-templates",
          icon: FileSignature,
          tone: "slate",
          guide: "contracts",
          status: counted("contract_templates"),
        },
      ],
    });
  }

  const integrations: CatalogItem[] = [
    {
      key: "amocrm",
      to: "/integrations/amocrm",
      icon: Workflow,
      tone: "sky",
      logo: { src: "/brand/amocrm.svg" },
      guide: "amocrm",
      status: connected(amo.isFetched, !!amo.data),
    },
    {
      key: "bitrix24",
      to: "/integrations/bitrix24",
      icon: Workflow,
      tone: "sky",
      logo: { src: "/brand/bitrix24.svg" },
      guide: "bitrix24",
      status: connected(bitrix.isFetched, !!bitrix.data),
    },
    {
      key: "amocrmImport",
      to: "/admin/amocrm-import",
      icon: Workflow,
      tone: "sky",
      logo: { src: "/brand/amocrm.svg" },
      guide: "amocrm",
    },
  ];
  if (crmEnabled) {
    integrations.push(
      {
        key: "telegramLink",
        to: "/admin/telephony",
        search: { provider: "telegram" },
        icon: MessageSquareText,
        tone: "sky",
        logo: { src: "/brand/telegram.svg" },
        guide: "telephony",
        status: profiles
          ? connected(
              true,
              profiles.some((p) => p.telegram_chat_id),
            )
          : undefined,
      },
      {
        key: "telegramApp",
        to: "/integrations/telegram-app",
        icon: MessageSquareText,
        tone: "sky",
        logo: { src: "/brand/telegram.svg" },
        guide: "telegram-app",
      },
      {
        key: "sms",
        to: "/integrations/sms",
        icon: MessageSquareText,
        tone: "amber",
        logo: { domain: "eskiz.uz" },
        guide: "sms",
        status: connected(sms.isFetched, !!sms.data?.connected),
      },
      {
        key: "email",
        to: "/integrations/email",
        icon: Mail,
        tone: "rose",
        guide: "email",
        status: connected(smtp.isFetched, !!smtp.data?.connected),
      },
      { key: "webhook", to: "/integrations/webhook", icon: Code2, tone: "slate", guide: "webhook" },
      {
        key: "outgoingWebhooks",
        to: "/admin/telephony",
        search: { provider: "webhooks" },
        icon: PhoneOutgoing,
        tone: "slate",
        guide: "webhook",
      },
    );
  }
  groups.push({ key: "integrations", items: integrations });

  if (crmEnabled) {
    groups.push({
      key: "telephony",
      items: TELEPHONY.map((p) => ({
        key: `tel_${p.id}`,
        to: "/admin/telephony",
        search: { provider: p.id },
        icon: p.icon,
        tone: p.tone,
        ...(p.logo ? { logo: p.logo } : {}),
        guide: "telephony",
        status: connected(telephony.isFetched, !!telephony.data?.[p.id]?.connected),
      })),
    });
  }

  groups.push({
    key: "ai",
    items: [
      {
        key: "aiAgents",
        to: "/admin/ai-agents",
        icon: Sparkles,
        tone: "violet",
        guide: "ai-agents",
      },
    ],
  });
  return groups;
}

// The card's picture: the service's logo on white, or a coloured icon tile.
function CardPicture({ item }: { item: CatalogItem }) {
  const [broken, setBroken] = useState(false);
  const Icon = item.icon;
  if (item.logo && !broken) {
    const src =
      "src" in item.logo
        ? item.logo.src
        : `https://www.google.com/s2/favicons?domain=${item.logo.domain}&sz=128`;
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-white p-2 phone:h-10 phone:w-10 phone:p-1.5">
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "grid h-12 w-12 shrink-0 place-items-center rounded-xl phone:h-10 phone:w-10",
        TONE_TILE[item.tone],
      )}
    >
      <Icon className="h-6 w-6 phone:h-5 phone:w-5" />
    </span>
  );
}

export function CatalogCard({ item }: { item: CatalogItem }) {
  const { t } = useI18n();
  return (
    <div className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-5 phone:rounded-xl phone:p-4 shadow-[0_1px_2px_rgb(0_0_0/0.05)] transition-[border-color,box-shadow,translate] duration-200 hover:border-primary/40 hover:shadow-[0_14px_28px_-16px_rgb(15_23_42/0.35)] motion-safe:hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <CardPicture item={item} />
        <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <h3 className="mt-4 text-[17px] font-bold leading-snug text-foreground phone:mt-3 phone:text-[15px]">
        {/* The whole card opens the page; the guide link sits above it. */}
        <Link
          to={item.to}
          search={(item.search ?? {}) as never}
          className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
        >
          {t(`hub.item.${item.key}.title`)}
        </Link>
      </h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground phone:mt-1 phone:text-[12.5px]">
        {t(`hub.item.${item.key}.desc`)}
      </p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-4 phone:pt-3">
        {item.status ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[13px] font-medium",
              item.status.ok ? "text-success" : "text-muted-foreground",
            )}
          >
            {item.status.ok ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            {item.status.label}
          </span>
        ) : (
          <span />
        )}
        <Link
          to="/help/$slug"
          params={{ slug: item.guide }}
          className="relative z-10 text-[13px] font-semibold text-primary hover:underline"
        >
          {t("help.button")}
        </Link>
      </div>
    </div>
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
  // Only the core setup counts here -- one telephony provider is enough,
  // so the long provider list doesn't drag the percentage down.
  const tracked = groups
    .filter((g) => g.key !== "telephony")
    .flatMap((g) => g.items)
    .filter((it) => it.status);
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
            search={(next.search ?? {}) as never}
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

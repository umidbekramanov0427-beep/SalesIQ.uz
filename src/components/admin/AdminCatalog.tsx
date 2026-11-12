import { forwardRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  DatabaseBackup,
  HardDrive,
  Trash2,
  KeyRound,
  CreditCard,
  AlarmClock,
  ArrowRight,
  BellRing,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
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
  PanelLeft,
  Gift,
  Phone,
  Receipt,
  Pin,
  Plus,
  PhoneOutgoing,
  ShieldCheck,
  Sparkles,
  Users,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon,
  UserCheck,
} from "lucide-react";
import { TONE_TILE } from "@/lib/tones";
import { InfoTip, type CardTone } from "@/components/layout/Primitives";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCrmEnabled } from "@/lib/use-org-access";
import { cn } from "@/lib/utils";
import {
  useAiOnboarding,
  useAmoConnectionStatus,
  useDidoxStatus,
  useInstagramAccount,
  usePaymentMerchant,
  useFollowupSettings,
  useBitrix24ConnectionStatus,
  useProfilesRaw,
  useSaveSidebarConfig,
  useSidebarConfig,
  useSmsStatus,
  useSmtpStatus,
  useTelephonyStatus,
} from "@/hooks/use-crm-data";
import type { TelephonyProvider } from "@/lib/telephony/provider-meta";
import { MODULE_NAV_ITEMS } from "@/lib/nav";
import { togglePinned } from "@/lib/sidebar-config";
import { toast } from "sonner";

// Everything an admin sets up, as one flat list of cards: one card is one
// page, nothing nested. The Admin panel shows all groups; /integrations
// shows only the integration groups.

export type CatalogGroupKey =
  "start" | "workspace" | "modules" | "team" | "crm" | "integrations" | "telephony" | "ai" | "bots";

// connection: a service that is either connected or not (its card gets the
// console's "Ulash" switch and a cable on the connections map).
type Status = { ok: boolean; label: string; connection?: boolean };

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
  status?: Status | undefined;
  /** An extra module that can be put into the sidebar from its card. */
  pinPath?: string;
};
export type CatalogGroup = { key: CatalogGroupKey; items: CatalogItem[] };

const COUNTED_TABLES = [
  "pipelines",
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
  const aiOnboarding = useAiOnboarding();
  const sidebar = useSidebarConfig();
  const didox = useDidoxStatus();
  const instagram = useInstagramAccount(crmEnabled);
  const payments = usePaymentMerchant(crmEnabled);
  const followups = useFollowupSettings();

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
        ? { ok: true, label: t("hub.status.connected"), connection: true }
        : { ok: false, label: t("hub.status.notConnected"), connection: true }
      : undefined;

  const groups: CatalogGroup[] = [
    {
      // The AI interview that sets the company up; the setup checklist
      // above the cards counts it as the first step.
      key: "start",
      items: [
        {
          key: "aiSetup",
          to: "/onboarding/ai-setup",
          icon: Sparkles,
          tone: "violet",
          status: aiOnboarding.isFetched
            ? aiOnboarding.data?.status === "applied"
              ? { ok: true, label: t("hub.status.done") }
              : { ok: false, label: t("hub.status.notSet") }
            : undefined,
        },
      ],
    },
    {
      // How the workspace looks for the whole company.
      key: "workspace",
      items: [
        {
          key: "sidebar",
          to: "/admin/sidebar",
          icon: PanelLeft,
          tone: "violet",
          status: sidebar.businessType
            ? { ok: true, label: t(`sidebarCfg.type.${sidebar.businessType}`) }
            : { ok: false, label: t("hub.status.notSet") },
        },
        {
          key: "referrals",
          to: "/admin/referrals",
          icon: Gift,
          tone: "emerald",
        },
      ],
    },
    {
      // Pages most companies don't need every day: each card opens it, and
      // its switch puts it into the sidebar.
      key: "modules",
      items: MODULE_NAV_ITEMS.filter((m) => crmEnabled || !m.crmOnly).map((m) => ({
        key: `module:${m.to}`,
        to: m.to,
        icon: m.icon,
        tone: m.tone,
        pinPath: m.to,
      })),
    },
    {
      key: "team",
      items: [
        { key: "employees", to: "/admin/employees", icon: Users, tone: "sky" },
        {
          key: "permissions",
          to: "/admin/permissions",
          icon: Lock,
          tone: "violet",
        },
        {
          key: "orgStructure",
          to: "/admin/org-structure",
          icon: Network,
          tone: "amber",
        },
        {
          key: "security",
          to: "/admin/security",
          icon: ShieldCheck,
          tone: "emerald",
        },
        {
          key: "attendanceRules",
          to: "/admin/attendance",
          icon: UserCheck,
          tone: "sky",
        },
        { key: "files", to: "/admin/files", icon: HardDrive, tone: "slate" },
        { key: "backup", to: "/admin/backup", icon: DatabaseBackup, tone: "emerald" },
        { key: "trash", to: "/admin/trash", icon: Trash2, tone: "amber" },
      ],
    },
  ];

  if (crmEnabled) {
    groups.push({
      key: "crm",
      items: [
        {
          key: "phoneFormat",
          to: "/admin/phone-format",
          icon: Phone,
          tone: "emerald",
        },
        {
          key: "replyRules",
          to: "/admin/reply-rules",
          icon: AlarmClock,
          tone: "amber",
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
      icon: Workflow,
      tone: "sky",
      logo: { src: "/brand/amocrm.svg" },
      status: connected(amo.isFetched, !!amo.data),
    },
    {
      key: "bitrix24",
      to: "/integrations/bitrix24",
      icon: Workflow,
      tone: "sky",
      logo: { src: "/brand/bitrix24.svg" },
      status: connected(bitrix.isFetched, !!bitrix.data),
    },
  ];
  if (crmEnabled) {
    integrations.push(
      {
        key: "telegramLink",
        to: "/daily-report-settings",
        icon: MessageSquareText,
        tone: "sky",
        logo: { src: "/brand/telegram.svg" },
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
      },
      {
        key: "instagram",
        to: "/integrations/instagram",
        icon: MessageSquareText,
        tone: "rose",
        logo: { domain: "instagram.com" },
        status: connected(instagram.isFetched, !!instagram.data?.account),
      },
      {
        key: "sms",
        to: "/integrations/sms",
        icon: MessageSquareText,
        tone: "amber",
        logo: { domain: "eskiz.uz" },
        status: connected(sms.isFetched, !!sms.data?.connected),
      },
      {
        key: "email",
        to: "/integrations/email",
        icon: Mail,
        tone: "rose",
        status: connected(smtp.isFetched, !!smtp.data?.connected),
      },
      {
        key: "payments",
        to: "/integrations/payments",
        icon: CreditCard,
        tone: "emerald",
        logo: { domain: "payme.uz" },
        status: connected(
          payments.isFetched,
          !!(payments.data?.paymeReady || payments.data?.clickReady),
        ),
      },
      {
        key: "didox",
        to: "/admin/invoices",
        icon: Receipt,
        tone: "amber",
        logo: { domain: "didox.uz" },
        status: connected(didox.isFetched, !!didox.data?.connected),
      },
      { key: "webhook", to: "/integrations/webhook", icon: Code2, tone: "slate" },
      { key: "apiKeys", to: "/admin/api", icon: KeyRound, tone: "slate" },
      {
        key: "outgoingWebhooks",
        to: "/admin/telephony",
        search: { provider: "webhooks" },
        icon: PhoneOutgoing,
        tone: "slate",
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
      },
    ],
  });

  // Everything that is a bot -- the salesbots, auto-replies and follow-ups
  // that talk to clients, the Telegram bot that sends staff their reports,
  // the Mini App -- in one "Botlar" section instead of spread over CRM and
  // integrations.
  const BOT_KEYS = ["salesbots", "autoResponders", "followUps", "telegramLink", "telegramApp"];
  const bots: CatalogItem[] = [];
  for (const g of groups) {
    for (const key of BOT_KEYS) {
      const it = g.items.find((i) => i.key === key);
      if (it) bots.push(it);
    }
    g.items = g.items.filter((i) => !BOT_KEYS.includes(i.key));
  }
  bots.sort((a, b) => BOT_KEYS.indexOf(a.key) - BOT_KEYS.indexOf(b.key));
  if (bots.length) groups.push({ key: "bots", items: bots });

  // One order for the whole panel: setup, people and rights, the CRM, bots,
  // integrations, telephony, AI, then how the workspace looks.
  const ORDER = [
    "start",
    "team",
    "crm",
    "bots",
    "integrations",
    "telephony",
    "ai",
    "workspace",
    "modules",
  ];
  return groups
    .filter((g) => g.items.length > 0)
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
}

// The card's picture: the service's logo on white, or a coloured icon tile.
export function CardPicture({ item, size = "md" }: { item: CatalogItem; size?: "sm" | "md" }) {
  const [broken, setBroken] = useState(false);
  const Icon = item.icon;
  const box = size === "sm" ? "h-9 w-9 rounded-lg" : "h-11 w-11 rounded-xl";
  if (item.logo && !broken) {
    const src =
      "src" in item.logo
        ? item.logo.src
        : `https://www.google.com/s2/favicons?domain=${item.logo.domain}&sz=128`;
    return (
      <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-white p-1.5", box)}>
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
    <span className={cn("icon-tile grid shrink-0 place-items-center", box, TONE_TILE[item.tone])}>
      <Icon className={size === "sm" ? "h-[18px] w-[18px]" : "h-5 w-5"} />
    </span>
  );
}

// The console's small switch (the platform's big iOS switch is for forms).
function MiniSwitch({
  on,
  label,
  busy,
  onToggle,
}: {
  on: boolean;
  label: string;
  busy?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className="mini-switch group/sw relative z-10 inline-flex shrink-0 items-center gap-2 rounded-full py-1 pl-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
    >
      <span className={cn(on && "text-foreground")}>{label}</span>
      <span
        className={cn(
          "relative h-[18px] w-8 rounded-full transition-colors duration-300",
          on
            ? "bg-primary shadow-[0_0_12px_-2px_var(--console-glow,transparent)]"
            : "bg-foreground/15 group-hover/sw:bg-foreground/25",
        )}
      >
        <span
          className={cn(
            "absolute left-0 top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(0.3,1.4,0.6,1)]",
            on ? "translate-x-[16px]" : "translate-x-[2px]",
          )}
        />
      </span>
    </button>
  );
}

function usePinToggle(path: string | undefined) {
  const { t } = useI18n();
  const config = useSidebarConfig();
  const save = useSaveSidebarConfig();
  const pinned = !!path && config.pinned.includes(path);
  async function toggle() {
    if (!path) return;
    try {
      await save.mutateAsync(togglePinned(config, path));
      toast.success(pinned ? t("sidebarCfg.unpinned") : t("sidebarCfg.pinned"));
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "MIGRATION_PENDING"
          ? t("sidebarCfg.migrationPending")
          : t("sidebarCfg.saveFailed"),
      );
    }
  }
  return { pinned, busy: save.isPending, toggle };
}

export const cardTitleKey = (item: CatalogItem) =>
  item.pinPath ? `nav.${item.pinPath}` : `hub.item.${item.key}.title`;
export const cardDescKey = (item: CatalogItem) =>
  item.pinPath ? `sidebarCfg.about.${item.pinPath}` : `hub.item.${item.key}.desc`;

/** On for a card whose service is live: connected, set up, or in the sidebar. */
export function cardIsLive(item: CatalogItem, pinned: string[]): boolean {
  if (item.pinPath) return pinned.includes(item.pinPath);
  return !!item.status?.ok;
}

// One setting as a console card: picture, name and a one-line summary, the
// "Ulash" switch for a service (or "Menyuda" for a module), its state in
// the corner, and "Sozlash" that unfolds the card in place.
export const CatalogCard = forwardRef<
  HTMLDivElement,
  { item: CatalogItem; compact?: boolean; current?: boolean }
>(function CatalogCard({ item, compact = false, current = false }, ref) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pin = usePinToggle(item.pinPath);
  const title = t(cardTitleKey(item));
  const desc = t(cardDescKey(item));
  const live = item.pinPath ? pin.pinned : !!item.status?.ok;
  const goTo = () => void navigate({ to: item.to, search: (item.search ?? {}) as never });

  let toggle: ReactNode = null;
  if (item.pinPath) {
    toggle = (
      <MiniSwitch
        on={pin.pinned}
        busy={pin.busy}
        label={t("console.inSidebar")}
        onToggle={() => void pin.toggle()}
      />
    );
  } else if (item.status?.connection) {
    // Connecting needs the service's own keys, and turning it off is a
    // decision made on its page -- the switch takes you there.
    toggle = (
      <MiniSwitch
        on={item.status.ok}
        label={item.status.ok ? t("console.connected") : t("console.connect")}
        onToggle={goTo}
      />
    );
  }

  let state: ReactNode;
  if (item.pinPath) {
    state = pin.pinned ? t("console.inSidebarOn") : t("console.inSidebarOff");
  } else if (item.status) {
    state = item.status.connection
      ? item.status.ok
        ? t("console.active")
        : t("console.notConnected")
      : item.status.label;
  } else {
    state = t("console.page");
  }

  return (
    <div
      ref={ref}
      data-live={live || undefined}
      className={cn(
        "catalog-card admin-card group relative flex flex-col rounded-2xl border bg-card transition-[border-color,box-shadow,translate] duration-300",
        compact ? "p-3.5" : "p-4",
        current
          ? "border-primary/70 shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent),0_14px_34px_-18px_var(--console-glow,transparent)]"
          : live
            ? "border-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_12%,transparent),0_14px_34px_-22px_var(--console-glow,transparent)]"
            : "border-border hover:border-foreground/20",
        !open && "motion-safe:hover:-translate-y-0.5",
      )}
    >
      <div className="flex items-start gap-3">
        <CardPicture item={item} size={compact ? "sm" : "md"} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="flex items-center gap-1.5 text-[15px] font-semibold leading-snug text-foreground">
            {/* The whole card opens the page. */}
            <Link
              to={item.to}
              search={(item.search ?? {}) as never}
              className="truncate after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
            >
              {title}
            </Link>
            <span className="relative z-10 inline-flex">
              <InfoTip text={desc} />
            </span>
          </h3>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{desc}</p>
        </div>
        {toggle}
      </div>

      <div
        className={cn(
          "flex items-center justify-between gap-3 text-[12.5px]",
          compact ? "mt-3" : "mt-4",
        )}
      >
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 font-medium",
            live ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {live ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
          ) : item.status || item.pinPath ? (
            <Plus className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{state}</span>
          {current && (
            <span className="ml-1 shrink-0 rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-primary">
              {t("console.here")}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="relative z-10 inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {t("console.configure")}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-300", open && "rotate-180")}
          />
        </button>
      </div>

      {/* Unfolds in place (grid-rows 0fr -> 1fr animates the height). */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="relative z-10 mt-3 space-y-3 border-t border-border pt-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">{desc}</p>
            {item.status && (
              <p className="console-caption !tracking-[0.08em]">
                {t("console.state")}: <span className="text-foreground">{item.status.label}</span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goTo}
                tabIndex={open ? 0 : -1}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {item.status?.connection && !item.status.ok
                  ? t("console.connectNow")
                  : t("console.open")}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              {item.pinPath && (
                <button
                  type="button"
                  onClick={() => void pin.toggle()}
                  disabled={pin.busy}
                  tabIndex={open ? 0 : -1}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors disabled:opacity-60",
                    pin.pinned
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {pin.pinned ? <Check className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  {pin.pinned ? t("sidebarCfg.inSidebar") : t("sidebarCfg.pin")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export function CatalogGroupSection({ group }: { group: CatalogGroup }) {
  const { t } = useI18n();
  if (group.items.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="console-caption">{t(`hub.group.${group.key}`)}</h2>
        <span className="console-caption opacity-70">· {group.items.length}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
    <section className="admin-card mb-8 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* The step-by-step rollout plan lives behind this checklist
              instead of being a separate "get started" card. */}
          <Link
            to="/rollout-plan"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <ListChecks className="h-4 w-4" />
            {t("hub.item.rollout.title")}
          </Link>
          {next && (
            <Link
              to={next.to}
              search={(next.search ?? {}) as never}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("hub.setupGo")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** The setup progress in one line, for the console map's header. */
export function SetupInline({ groups }: { groups: CatalogGroup[] }) {
  const { t } = useI18n();
  const tracked = groups
    .filter((g) => g.key !== "telephony")
    .flatMap((g) => g.items)
    .filter((it) => it.status);
  if (tracked.length === 0) return null;
  const done = tracked.filter((it) => it.status!.ok).length;
  const next = tracked.find((it) => !it.status!.ok);
  const pct = Math.round((done / tracked.length) * 100);
  return (
    <p className="console-caption flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        {t("console.setup")} <span className="text-primary">{pct}%</span>
      </span>
      {next && (
        <>
          <span aria-hidden>·</span>
          <Link
            to={next.to}
            search={(next.search ?? {}) as never}
            className="text-foreground/80 underline-offset-4 hover:text-primary hover:underline"
          >
            {t("console.next", { name: t(cardTitleKey(next)) })} →
          </Link>
        </>
      )}
      <span aria-hidden>·</span>
      <Link
        to="/rollout-plan"
        className="text-foreground/80 underline-offset-4 hover:text-primary hover:underline"
      >
        {t("hub.item.rollout.title")}
      </Link>
    </p>
  );
}

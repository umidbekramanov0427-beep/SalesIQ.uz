import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { shrinkLogo } from "@/lib/shrink-logo";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useIsMutating } from "@tanstack/react-query";
import {
  Bell,
  Inbox,
  Bot,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileBarChart,
  LayoutGrid,
  Link2,
  ListChecks,
  Loader2,
  Plus,
  Send,
  SlidersHorizontal,
  MessageCircle,
  Palette,
  Thermometer,
  Trash2,
  TrendingUp,
  Users,
  ShieldCheck,
  Wallet,
  Workflow,
  X,
  type LucideIcon,
  MessageSquare,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard, SettingsLayout } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { useI18n, LANGS } from "@/lib/i18n";
import { BackButton } from "@/components/layout/BackButton";
import { useAuth } from "@/lib/auth";
import { appRoleOf } from "@/lib/nav";
import { PersonalNotificationsCard } from "@/components/settings/NotificationsCard";
import {
  useBusinessProfile,
  useLinkTelegramGroup,
  useMyOrganization,
  useIntegrationSetting,
  useLinkTelegram,
  useOrgGeneralSettings,
  useOrgNotificationSettings,
  useSendFeedbackReport,
  useTelegramBoundChats,
  useUnbindTelegramChat,
  useUpdateBusinessProfile,
  useUpdateOrgGeneralSettings,
  useUpdateOrgNotificationSettings,
  type GlossaryItem,
  type ObjectionItem,
  type ProductServiceItem,
} from "@/hooks/use-crm-data";
import { cn, DATE_FORMATS, formatDate, formatDateAs } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { TONE_TEXT, type CardTone } from "@/lib/tones";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { BusinessProfileBot } from "@/components/settings/BusinessProfileBot";
import { AccentColorPicker } from "@/components/settings/AccentColorPicker";
import { SubdomainCard } from "@/components/settings/SubdomainCard";
import { MfaCard } from "@/components/settings/MfaCard";
import { LocationPicker } from "@/components/layout/LocationPicker";

type SectionKey =
  | "profile"
  | "personalization"
  | "notifications"
  | "messages"
  | "business"
  | "general"
  | "workSchedule"
  | "billing"
  | "amocrm"
  | "reportProblem";

const SECTION_KEYS: SectionKey[] = [
  "profile",
  "personalization",
  "notifications",
  "messages",
  "business",
  "general",
  "workSchedule",
  "billing",
  "amocrm",
  "reportProblem",
];

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { section?: SectionKey | undefined } => ({
    section: SECTION_KEYS.includes(search["section"] as SectionKey)
      ? (search["section"] as SectionKey)
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Settings — SalesIQ" },
      { name: "description", content: "Profile, workspace, language and appearance settings." },
      { property: "og:title", content: "Settings — SalesIQ" },
      { property: "og:description", content: "Workspace, appearance and preference settings." },
    ],
  }),
  component: SettingsPage,
});

const STAGE_COLORS = [
  "bg-primary",
  "bg-success",
  "bg-warning",
  "bg-destructive",
  "bg-mint-border",
  "bg-muted-foreground",
] as const;

// Name, phone, email and password are edited in the profile window (user
// menu → Hisob); this section only holds two-step sign-in.
function ProfileSection() {
  const { user } = useAuth();
  // The platform owner's sign-in protection lives in Platforma → Sozlamalar →
  // Xavfsizlik (with the login code); one place, not two.
  const { t } = useI18n();
  if (user?.role === "platform_owner") {
    return (
      <SectionCard icon={ShieldCheck} tone="emerald" title={t("settings.nav.profile")}>
        <Link
          to="/platform/settings"
          search={{ tab: "security" }}
          className="ctl-soft inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-foreground"
        >
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t("os.tab.security")}
        </Link>
      </SectionCard>
    );
  }
  return <MfaCard />;
}

// Language and light/dark mode are switched from the user menu; this is
// the currency and the platform colour.
function PersonalizationSection() {
  const { t } = useI18n();
  const { unit, setUnit } = useCurrency();
  const { user } = useAuth();
  const showCurrency = user?.role !== "sotuv_menejeri";

  return (
    <SectionCard
      icon={Palette}
      tone="violet"
      title={t("settings.nav.personalization")}
      description={t("settings.personalizationDesc")}
      info={t("settings.personalizationInfo")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {showCurrency && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wallet className="h-4 w-4" />
              </span>
              <span className="text-[13px] font-semibold text-foreground">
                {t("settings.currency")}
              </span>
            </div>
            <div className="mt-3">
              <SegmentedControl value={unit} options={CURRENCIES} onChange={setUnit} />
            </div>
          </div>
        )}
        <AccentColorPicker />
      </div>
    </SectionCard>
  );
}

// The reports/task-reminder Telegram bot has no way to know who's
// messaging it besides this one-time code exchange: super_admin sets
// which @bot the org uses
// once, then anyone here generates their own short-lived code and sends it
// to that bot as a plain text message (see telegram.webhook.ts) to link
// their own chat_id. Without this card there was no way to ever populate
// profiles.telegram_chat_id at all, silently breaking every Telegram
// delivery in the app (daily reports, task reminders) for every user.
function TelegramLinkCard() {
  const { t } = useI18n();
  const { user, refreshProfile } = useAuth();
  const { data: botSetting } = useIntegrationSetting("telegram_bot");
  const linkTelegram = useLinkTelegram();
  const [linkInfo, setLinkInfo] = useState<{ code: string; botUsername: string | null } | null>(
    null,
  );

  const config = (botSetting?.config ?? null) as { username?: string } | null;
  const botUsername = config?.username?.trim() || null;

  async function generateCode() {
    try {
      const result = await linkTelegram.mutateAsync();
      setLinkInfo(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("set.tgCodeFailed"));
    }
  }

  return (
    <SectionCard
      icon={Send}
      tone="sky"
      title={t("set.tgTitle")}
      description={t("set.tgDesc")}
      info="Faqat sizning shaxsiy hisobingizga ulanadi -- boshqa xodimlarning Telegram ulanishiga ta'sir qilmaydi."
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-surface p-4">
          {user?.telegramLinked ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-success">
              <Check className="h-4 w-4" /> {t("set.tgLinked")}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">
                    {t("set.tgNotLinked")}
                  </p>
                  <p className="mt-0.5 text-xs text-subtle">{t("set.tgCodeHint")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void generateCode()}
                  disabled={linkTelegram.isPending}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                >
                  {linkTelegram.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <MessageCircle className="h-4 w-4" /> {t("set.tgGetCode")}
                </button>
              </div>

              {linkInfo && (
                <div className="mt-4 space-y-2 rounded-lg bg-accent p-3.5 text-sm">
                  <p>
                    1.{" "}
                    {(linkInfo.botUsername ?? botUsername) ? (
                      <a
                        href={`https://t.me/${linkInfo.botUsername ?? botUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-primary hover:underline"
                      >
                        @{linkInfo.botUsername ?? botUsername}
                      </a>
                    ) : (
                      "Botni"
                    )}{" "}
                    {t("set.tgOpen")}
                  </p>
                  <p>
                    2. Shu kodni yuboring:{" "}
                    <span className="rounded-md bg-background px-2 py-0.5 font-mono font-bold">
                      {linkInfo.code}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void refreshProfile()}
                    className="mt-1 text-xs font-semibold text-primary hover:underline"
                  >
                    {t("set.tgCheck")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
  size = "md",
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-6 w-11" : "h-8 w-14",
        checked ? "bg-primary" : "bg-foreground/15 hover:bg-foreground/25",
      )}
    >
      <span
        className={cn(
          "absolute left-1 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200",
          size === "sm" ? "h-4 w-4" : "h-6 w-6",
          checked && (size === "sm" ? "translate-x-5" : "translate-x-6"),
        )}
      />
    </button>
  );
}

type NotifMatrixRow = {
  key: string;
  labelKey: string;
  descKey: string;
  web: { value: boolean; onChange: () => void } | null;
  bot: { value: boolean; onChange: () => void };
  group: { value: boolean; onChange: () => void };
  channel: { value: boolean; onChange: () => void };
};

function NotificationsSection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
  const { data: settings, isLoading } = useOrgNotificationSettings();
  const updateSettings = useUpdateOrgNotificationSettings();
  const { data: botSetting } = useIntegrationSetting("telegram_bot");
  const { data: boundChats = [] } = useTelegramBoundChats();
  const unbind = useUnbindTelegramChat();
  const linkGroup = useLinkTelegramGroup();
  const [bindInfo, setBindInfo] = useState<{ code: string; botUsername: string | null } | null>(
    null,
  );

  const [form, setForm] = useState({
    performance_web: true,
    performance_bot: true,
    performance_group: false,
    performance_channel: false,
    technical_web: true,
    technical_bot: true,
    technical_group: false,
    technical_channel: false,
    daily_report_bot: true,
    daily_report_group: false,
    daily_report_channel: false,
    call_analysis_web: true,
    call_analysis_bot: true,
    call_analysis_group: false,
    call_analysis_channel: false,
    low_quality_alert_enabled: false,
    quality_threshold: 30,
    min_call_duration_minutes: 5,
  });
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings || hydrated) return;
    setForm({
      performance_web: settings.performance_web,
      performance_bot: settings.performance_bot,
      performance_group: settings.performance_group,
      performance_channel: settings.performance_channel,
      technical_web: settings.technical_web,
      technical_bot: settings.technical_bot,
      technical_group: settings.technical_group,
      technical_channel: settings.technical_channel,
      daily_report_bot: settings.daily_report_bot,
      daily_report_group: settings.daily_report_group,
      daily_report_channel: settings.daily_report_channel,
      call_analysis_web: settings.call_analysis_web,
      call_analysis_bot: settings.call_analysis_bot,
      call_analysis_group: settings.call_analysis_group,
      call_analysis_channel: settings.call_analysis_channel,
      low_quality_alert_enabled: settings.low_quality_alert_enabled,
      quality_threshold: settings.quality_threshold,
      min_call_duration_minutes: settings.min_call_duration_minutes,
    });
    setHydrated(true);
  }, [settings, hydrated]);

  function toggle(
    key: Exclude<keyof typeof form, "quality_threshold" | "min_call_duration_minutes">,
  ) {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function onSave() {
    setSaving(true);
    try {
      await updateSettings.mutateAsync(form);
      toast.success(t("settings.notif.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.notif.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function onGenerateBindCode() {
    try {
      const result = await linkGroup.mutateAsync();
      setBindInfo(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.notif.bindFailed"));
    }
  }

  const rows: NotifMatrixRow[] = [
    {
      key: "performance",
      labelKey: "settings.notif.performance",
      descKey: "settings.notif.performanceDesc",
      web: { value: form.performance_web, onChange: () => toggle("performance_web") },
      bot: { value: form.performance_bot, onChange: () => toggle("performance_bot") },
      group: { value: form.performance_group, onChange: () => toggle("performance_group") },
      channel: { value: form.performance_channel, onChange: () => toggle("performance_channel") },
    },
    {
      key: "technical",
      labelKey: "settings.notif.technical",
      descKey: "settings.notif.technicalDesc",
      web: { value: form.technical_web, onChange: () => toggle("technical_web") },
      bot: { value: form.technical_bot, onChange: () => toggle("technical_bot") },
      group: { value: form.technical_group, onChange: () => toggle("technical_group") },
      channel: { value: form.technical_channel, onChange: () => toggle("technical_channel") },
    },
    {
      key: "dailyReport",
      labelKey: "settings.notif.dailyReport",
      descKey: "settings.notif.dailyReportDesc",
      web: null,
      bot: { value: form.daily_report_bot, onChange: () => toggle("daily_report_bot") },
      group: { value: form.daily_report_group, onChange: () => toggle("daily_report_group") },
      channel: { value: form.daily_report_channel, onChange: () => toggle("daily_report_channel") },
    },
    {
      key: "callAnalysis",
      labelKey: "settings.notif.callAnalysis",
      descKey: "settings.notif.callAnalysisDesc",
      web: { value: form.call_analysis_web, onChange: () => toggle("call_analysis_web") },
      bot: { value: form.call_analysis_bot, onChange: () => toggle("call_analysis_bot") },
      group: { value: form.call_analysis_group, onChange: () => toggle("call_analysis_group") },
      channel: {
        value: form.call_analysis_channel,
        onChange: () => toggle("call_analysis_channel"),
      },
    },
  ];

  const config = (botSetting?.config ?? null) as { username?: string } | null;
  const botUsername = bindInfo?.botUsername ?? config?.username?.trim() ?? null;

  return (
    <div className="space-y-5">
      <SectionCard
        icon={Bell}
        tone="amber"
        title={t("settings.nav.notifications")}
        description={t("settings.notif.desc")}
        info={t("settings.notifChannelsInfo")}
      >
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-[13px] font-semibold text-foreground">
                {t("settings.notif.channelsTitle")}
              </p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface text-left">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-subtle">
                        {t("settings.notif.type")}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-subtle">
                        {t("settings.notif.web")}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-subtle">
                        {t("settings.notif.bot")}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-subtle">
                        {t("settings.notif.group")}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-subtle">
                        {t("settings.notif.channel")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <p className="text-[13px] font-semibold text-foreground">
                            {t(row.labelKey)}
                          </p>
                          <p className="text-xs text-subtle">{t(row.descKey)}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.web ? (
                            <Switch
                              size="sm"
                              checked={row.web.value}
                              onChange={row.web.onChange}
                              disabled={!canManage}
                            />
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            size="sm"
                            checked={row.bot.value}
                            onChange={row.bot.onChange}
                            disabled={!canManage}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            size="sm"
                            checked={row.group.value}
                            onChange={row.group.onChange}
                            disabled={!canManage}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            size="sm"
                            checked={row.channel.value}
                            onChange={row.channel.onChange}
                            disabled={!canManage}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ml-4 mt-3 space-y-3 border-l-2 border-border pl-4">
                <div className="flex items-center justify-between gap-5">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">
                      {t("settings.notif.lowQuality")}
                    </p>
                    <p className="text-xs text-subtle">{t("settings.notif.lowQualityDesc")}</p>
                  </div>
                  <Switch
                    checked={form.low_quality_alert_enabled}
                    onChange={() => toggle("low_quality_alert_enabled")}
                    disabled={!canManage}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[13px] font-medium text-muted-foreground">
                      {t("settings.notif.qualityThreshold")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.quality_threshold}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          quality_threshold: Number(e.target.value) || 0,
                        }))
                      }
                      disabled={!canManage}
                      className="mt-2 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[13px] font-medium text-muted-foreground">
                      {t("settings.notif.minDuration")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={form.min_call_duration_minutes}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          min_call_duration_minutes: Number(e.target.value) || 0,
                        }))
                      }
                      disabled={!canManage}
                      className="mt-2 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-5">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">
                    {t("settings.notif.groupsTitle")}
                  </p>
                  <p className="text-xs text-subtle">{t("settings.notif.groupsDesc")}</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void onGenerateBindCode()}
                    disabled={linkGroup.isPending}
                    className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    {linkGroup.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Link2 className="h-3.5 w-3.5" /> {t("settings.notif.bindButton")}
                  </button>
                )}
              </div>

              {bindInfo && (
                <div className="mb-3 space-y-1.5 rounded-lg bg-accent p-3.5 text-sm">
                  <p>
                    {botUsername
                      ? t("settings.notif.bindInstructions", { bot: `@${botUsername}` })
                      : t("settings.notif.bindInstructionsNoBot")}
                  </p>
                  <p>
                    <span className="rounded-md bg-background px-2 py-0.5 font-mono font-bold">
                      /bind {bindInfo.code}
                    </span>
                  </p>
                  <p className="text-xs text-subtle">{t("settings.notif.bindExpiry")}</p>
                </div>
              )}

              {boundChats.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-surface px-3 py-2.5 text-xs text-subtle">
                  {t("settings.notif.noGroupsBound")}
                </p>
              ) : (
                <div className="space-y-2">
                  {boundChats.map((chat) => (
                    <div
                      key={chat.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <MessageCircle className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {chat.title || chat.chat_id}
                        </span>
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void unbind.mutateAsync(chat.id)}
                          disabled={unbind.isPending}
                          className="text-xs font-semibold text-subtle transition-colors hover:text-destructive"
                        >
                          {t("settings.notif.unbind")}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canManage && (
              <div className="flex justify-end border-t border-border pt-5">
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("settings.saveChanges")}
                </button>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function TwoFieldListEditor<T extends Record<string, string>>({
  items,
  onChange,
  keyA,
  keyB,
  placeholderA,
  placeholderB,
  addLabel,
  disabled,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  keyA: keyof T;
  keyB: keyof T;
  placeholderA: string;
  placeholderB: string;
  addLabel: string;
  disabled?: boolean;
}) {
  function update(i: number, key: keyof T, value: string) {
    const next = items.slice();
    next[i] = { ...next[i], [key]: value } as T;
    onChange(next);
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...items, { [keyA]: "", [keyB]: "" } as T]);
  }
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-start gap-2 rounded-xl border border-border bg-surface p-2.5"
        >
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            <input
              value={item[keyA] as string}
              onChange={(e) => update(i, keyA, e.target.value)}
              disabled={disabled}
              placeholder={placeholderA}
              className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40 disabled:bg-muted"
            />
            <input
              value={item[keyB] as string}
              onChange={(e) => update(i, keyB, e.target.value)}
              disabled={disabled}
              placeholder={placeholderB}
              className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40 disabled:bg-muted"
            />
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="mt-1.5 shrink-0 text-subtle transition-colors hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-subtle transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      )}
    </div>
  );
}

function TagListEditor({
  items,
  onChange,
  placeholder,
  disabled,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-subtle transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40"
          />
          <button
            type="button"
            onClick={add}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-subtle transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function BusinessProfileSection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = user?.role === "super_admin" || user?.role === "platform_owner";
  const { data: profile, isLoading } = useBusinessProfile();
  const updateProfile = useUpdateBusinessProfile();

  const [companyName, setCompanyName] = useState(profile?.company_name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [valueProposition, setValueProposition] = useState(profile?.value_proposition ?? "");
  const [targetCustomer, setTargetCustomer] = useState(profile?.target_customer ?? "");
  const [qualifiedLeadDefinition, setQualifiedLeadDefinition] = useState(
    profile?.qualified_lead_definition ?? "",
  );
  const [tone, setTone] = useState(profile?.tone ?? "");
  const [productsServices, setProductsServices] = useState<ProductServiceItem[]>([]);
  const [objections, setObjections] = useState<ObjectionItem[]>([]);
  const [glossary, setGlossary] = useState<GlossaryItem[]>([]);
  const [competitorsList, setCompetitorsList] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showBot, setShowBot] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!profile || hydrated) return;
    setCompanyName(profile.company_name);
    setDescription(profile.description);
    setValueProposition(profile.value_proposition);
    setTargetCustomer(profile.target_customer);
    setQualifiedLeadDefinition(profile.qualified_lead_definition);
    setTone(profile.tone);
    setProductsServices(
      Array.isArray(profile.products_services)
        ? (profile.products_services as ProductServiceItem[])
        : [],
    );
    setObjections(Array.isArray(profile.objections) ? (profile.objections as ObjectionItem[]) : []);
    setGlossary(Array.isArray(profile.glossary) ? (profile.glossary as GlossaryItem[]) : []);
    setCompetitorsList(profile.competitors_list ?? []);
    setHydrated(true);
  }, [profile, hydrated]);

  function clean<T extends Record<string, string>>(items: T[]): T[] {
    return items.filter((item) => Object.values(item).some((v) => v.trim() !== ""));
  }

  async function save(patch: Partial<Parameters<typeof updateProfile.mutateAsync>[0]>) {
    setSaving(true);
    try {
      await updateProfile.mutateAsync({
        company_name: companyName.trim(),
        description: description.trim(),
        value_proposition: valueProposition.trim(),
        target_customer: targetCustomer.trim(),
        qualified_lead_definition: qualifiedLeadDefinition.trim(),
        tone: tone.trim(),
        products_services: clean(productsServices),
        objections: clean(objections),
        glossary: clean(glossary),
        competitors_list: competitorsList,
        ...patch,
      });
      toast.success(t("settings.business.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.business.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    await save({});
  }

  async function onReset() {
    setCompanyName("");
    setDescription("");
    setValueProposition("");
    setTargetCustomer("");
    setQualifiedLeadDefinition("");
    setTone("");
    setProductsServices([]);
    setObjections([]);
    setGlossary([]);
    setCompetitorsList([]);
    await save({
      company_name: "",
      description: "",
      value_proposition: "",
      target_customer: "",
      qualified_lead_definition: "",
      tone: "",
      products_services: [],
      objections: [],
      glossary: [],
      competitors_list: [],
    });
  }

  return (
    <SectionCard
      icon={Building2}
      tone="sky"
      title={t("settings.business.title")}
      description={t("settings.business.desc")}
      info={t("settings.businessProfileInfo")}
      actions={
        canManage &&
        !showBot && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBot(true)}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              <Bot className="h-3.5 w-3.5" /> {t("bizbot.cta")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-subtle transition-colors hover:border-destructive/30 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("settings.business.resetToDefault")}
            </button>
          </div>
        )
      }
    >
      {isLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}
      {!canManage && (
        <p className="mb-4 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-subtle">
          {t("settings.business.readOnlyHint")}
        </p>
      )}
      {showBot && (
        <BusinessProfileBot
          onClose={() => setShowBot(false)}
          onComplete={(fields) => {
            if (fields.company_name) setCompanyName(fields.company_name);
            if (fields.description) setDescription(fields.description);
            if (fields.value_proposition) setValueProposition(fields.value_proposition);
            if (fields.target_customer) setTargetCustomer(fields.target_customer);
            if (fields.qualified_lead_definition)
              setQualifiedLeadDefinition(fields.qualified_lead_definition);
            if (fields.tone) setTone(fields.tone);
            toast.success(t("bizbot.reviewHint"));
          }}
        />
      )}
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("settings.business.resetConfirmTitle")}
        description={t("settings.business.resetConfirmDesc")}
        onConfirm={onReset}
      />
      <form onSubmit={onSave} className="grid gap-5 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.business.companyName")}
          </span>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={!canManage}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted disabled:text-muted-foreground"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.business.description")}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canManage}
            className="mt-2 h-20 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted disabled:text-muted-foreground"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.business.valueProposition")}
          </span>
          <textarea
            value={valueProposition}
            onChange={(e) => setValueProposition(e.target.value)}
            disabled={!canManage}
            className="mt-2 h-20 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted disabled:text-muted-foreground"
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.business.targetCustomer")}
          </span>
          <textarea
            value={targetCustomer}
            onChange={(e) => setTargetCustomer(e.target.value)}
            disabled={!canManage}
            className="mt-2 h-20 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted disabled:text-muted-foreground"
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.business.qualifiedLeadDefinition")}
          </span>
          <textarea
            value={qualifiedLeadDefinition}
            onChange={(e) => setQualifiedLeadDefinition(e.target.value)}
            disabled={!canManage}
            className="mt-2 h-20 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted disabled:text-muted-foreground"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.business.tone")}
          </span>
          <input
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            disabled={!canManage}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted disabled:text-muted-foreground"
          />
        </label>

        <div className="sm:col-span-2">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.business.productsServices")}
          </span>
          <div className="mt-2">
            <TwoFieldListEditor
              items={productsServices}
              onChange={setProductsServices}
              keyA="name"
              keyB="description"
              placeholderA={t("settings.business.productName")}
              placeholderB={t("settings.business.productDescription")}
              addLabel={t("settings.business.addProduct")}
              disabled={!canManage}
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.business.objections")}
          </span>
          <div className="mt-2">
            <TwoFieldListEditor
              items={objections}
              onChange={setObjections}
              keyA="objection"
              keyB="response"
              placeholderA={t("settings.business.objectionText")}
              placeholderB={t("settings.business.objectionResponse")}
              addLabel={t("settings.business.addObjection")}
              disabled={!canManage}
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.business.glossary")}
          </span>
          <div className="mt-2">
            <TwoFieldListEditor
              items={glossary}
              onChange={setGlossary}
              keyA="term"
              keyB="definition"
              placeholderA={t("settings.business.term")}
              placeholderB={t("settings.business.definition")}
              addLabel={t("settings.business.addTerm")}
              disabled={!canManage}
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.business.competitors")}
          </span>
          <div className="mt-2">
            <TagListEditor
              items={competitorsList}
              onChange={setCompetitorsList}
              placeholder={t("settings.business.addCompetitor")}
              disabled={!canManage}
            />
          </div>
        </div>

        {canManage && (
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("settings.saveChanges")}
            </button>
          </div>
        )}
      </form>
    </SectionCard>
  );
}

const TIMEZONE_OPTIONS = [
  "Asia/Tashkent",
  "Asia/Almaty",
  "Asia/Bishkek",
  "Asia/Dushanbe",
  "Asia/Ashgabat",
  "Europe/Moscow",
] as const;

const BUSINESS_LANG_KEY: Record<string, string> = {
  uz: "settings.general.langUz",
  ru: "settings.general.langRu",
  en: "settings.general.langEn",
};

function CompanyLogoPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-2 flex items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-contain" />
        ) : (
          <Logo className="h-7 w-7 opacity-60" />
        )}
      </span>
      <label
        className={cn(
          "inline-flex h-11 cursor-pointer items-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {value ? t("settings.general.logoChange") : t("settings.general.logoUpload")}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          disabled={disabled}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              onChange(await shrinkLogo(f));
            } catch {
              toast.error(t("settings.general.logoBad"));
            }
          }}
        />
      </label>
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-sm font-medium text-muted-foreground hover:text-destructive"
        >
          {t("settings.general.logoRemove")}
        </button>
      )}
    </div>
  );
}

function GeneralSection() {
  const { t } = useI18n();
  const { user, refreshProfile } = useAuth();
  const canManage = user?.role === "super_admin" || user?.role === "platform_owner";
  const { data: org } = useMyOrganization();
  const { data: general } = useOrgGeneralSettings();
  const updateGeneral = useUpdateOrgGeneralSettings();

  const [industry, setIndustry] = useState("");
  const [businessLanguage, setBusinessLanguage] = useState("");
  const [timezone, setTimezone] = useState<string>("Asia/Tashkent");
  const [crmForwarding, setCrmForwarding] = useState(true);
  const [aiTasks, setAiTasks] = useState(false);
  const [dateFormat, setDateFormat] = useState<string>("d mmm yyyy");
  const [logo, setLogo] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hydrated || general === undefined) return;
    setIndustry(general?.industry ?? "");
    setBusinessLanguage(general?.business_language ?? "");
    setTimezone(general?.timezone ?? "Asia/Tashkent");
    setCrmForwarding(general?.crm_task_forwarding_enabled ?? true);
    setAiTasks(general?.ai_task_creation_enabled ?? false);
    setDateFormat(general?.date_format ?? "d mmm yyyy");
    setLogo(general?.company_logo_url ?? null);
    setHydrated(true);
  }, [general, hydrated]);

  const languageLocked = !!general?.business_language;

  async function onSave() {
    setSaving(true);
    try {
      // The logo and date format are sent only when changed, so the rest
      // still saves on a database that hasn't got those columns yet.
      const dateChanged = dateFormat !== (general?.date_format ?? "d mmm yyyy");
      const logoChanged = logo !== (general?.company_logo_url ?? null);
      await updateGeneral.mutateAsync({
        industry: industry.trim(),
        business_language: businessLanguage || null,
        timezone,
        crm_task_forwarding_enabled: crmForwarding,
        ai_task_creation_enabled: aiTasks,
        ...(dateChanged ? { date_format: dateFormat } : {}),
        ...(logoChanged ? { company_logo_url: logo } : {}),
      });
      toast.success(t("settings.general.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.general.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      icon={SlidersHorizontal}
      tone="slate"
      title={t("settings.nav.general")}
      description={t("settings.general.desc")}
      info={t("settings.generalInfo")}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.general.industry")}
          </span>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            disabled={!canManage}
            placeholder={t("settings.general.industry")}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted disabled:text-muted-foreground"
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.general.businessLanguage")}
          </span>
          <select
            value={businessLanguage}
            onChange={(e) => setBusinessLanguage(e.target.value)}
            disabled={!canManage || languageLocked}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted disabled:text-muted-foreground"
          >
            {!businessLanguage && <option value="" />}
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(BUSINESS_LANG_KEY[l]!)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-subtle">{t("settings.general.businessLanguageHint")}</p>
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.general.timezone")}
          </span>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={!canManage}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted disabled:text-muted-foreground"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.general.dateFormat")}
          </span>
          <select
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value)}
            disabled={!canManage}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background disabled:bg-muted disabled:text-muted-foreground"
          >
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {formatDateAs(new Date(2026, 10, 5), f)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-subtle">{t("settings.general.dateFormatHint")}</p>
        </label>
        <div className="block">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("settings.general.logo")}
          </span>
          <CompanyLogoPicker value={logo} onChange={setLogo} disabled={!canManage} />
        </div>
        <label className="block">
          <span className="text-[13px] font-medium text-muted-foreground">
            {t("shell.setLocation")}
          </span>
          <div className="mt-2">
            <LocationPicker canEdit={canManage} />
          </div>
        </label>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-5 rounded-xl border border-border bg-surface p-4">
          <div>
            <p className="text-[13px] font-semibold text-foreground">
              {t("settings.general.crmForwarding")}
            </p>
            <p className="text-xs text-subtle">{t("settings.general.crmForwardingDesc")}</p>
          </div>
          <Switch
            checked={crmForwarding}
            onChange={() => setCrmForwarding((v) => !v)}
            disabled={!canManage}
          />
        </div>
        <div className="flex items-center justify-between gap-5 rounded-xl border border-border bg-surface p-4">
          <div>
            <p className="text-[13px] font-semibold text-foreground">
              {t("settings.general.aiTasks")}
            </p>
            <p className="text-xs text-subtle">{t("settings.general.aiTasksDesc")}</p>
          </div>
          <Switch checked={aiTasks} onChange={() => setAiTasks((v) => !v)} disabled={!canManage} />
        </div>
      </div>

      <SubdomainCard
        subdomain={user?.orgSubdomain ?? null}
        editable={user?.role === "platform_owner"}
        onChanged={refreshProfile}
      />

      <div className="mt-5 rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 text-[13px] font-semibold text-foreground">
          {t("settings.general.infoCardTitle")}
        </p>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-xs text-subtle">{t("settings.general.createdAt")}: </span>
            <span className="font-medium text-foreground">{formatDate(org?.created_at)}</span>
          </div>
          <div>
            <span className="text-xs text-subtle">{t("settings.general.status")}: </span>
            <span className="font-medium text-foreground">
              {org?.active
                ? t("settings.general.statusActive")
                : t("settings.general.statusInactive")}
            </span>
          </div>
        </div>
      </div>

      {canManage && (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("settings.saveChanges")}
          </button>
        </div>
      )}
    </SectionCard>
  );
}

const WEEK_DAYS: { value: number; labelKey: string }[] = [
  { value: 1, labelKey: "settings.schedule.dayMon" },
  { value: 2, labelKey: "settings.schedule.dayTue" },
  { value: 3, labelKey: "settings.schedule.dayWed" },
  { value: 4, labelKey: "settings.schedule.dayThu" },
  { value: 5, labelKey: "settings.schedule.dayFri" },
  { value: 6, labelKey: "settings.schedule.daySat" },
  { value: 7, labelKey: "settings.schedule.daySun" },
];

function ReportProblemSection() {
  const { t } = useI18n();
  const sendFeedback = useSendFeedbackReport();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function onSend() {
    if (!message.trim()) return;
    setSending(true);
    try {
      await sendFeedback.mutateAsync(message.trim());
      setMessage("");
      toast.success(t("settings.feedback.sent"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.feedback.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <SectionCard
      icon={MessageSquare}
      tone="sky"
      title={t("settings.feedback.cardTitle")}
      description={t("settings.feedback.desc")}
      info={t("settings.feedbackInfo")}
    >
      <div className="space-y-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("settings.feedback.placeholder")}
          className="h-32 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={sending || !message.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" /> {t("settings.feedback.send")}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

// Each settings section's icon keeps one color everywhere it shows (the
// same palette as the sidebar and page headers).
const SETTINGS_ICON_TONES = new Map<LucideIcon, CardTone>([
  [Users, "primary"],
  [ShieldCheck, "primary"],
  [Palette, "violet"],
  [Bell, "amber"],
  [Calendar, "emerald"],
  [Building2, "sky"],
  [SlidersHorizontal, "slate"],
  [CreditCard, "emerald"],
  [MessageCircle, "sky"],
  [ClipboardCheck, "violet"],
  [ListChecks, "sky"],
  [Workflow, "emerald"],
  [LayoutGrid, "amber"],
  [Bot, "violet"],
  [Thermometer, "rose"],
  [TrendingUp, "emerald"],
  [FileBarChart, "sky"],
]);

function settingsIconTone(icon: LucideIcon): string {
  return TONE_TEXT[SETTINGS_ICON_TONES.get(icon) ?? "primary"];
}

type NavItem =
  | {
      type: "section";
      key: SectionKey;
      icon: LucideIcon;
      label: string;
      badge?: number | undefined;
    }
  | { type: "reportLink"; icon: LucideIcon; label: string };

/**
 * What each section holds, for «Sozlama qidirish» (any language the person
 * types in): a search for "parol" finds the profile, "qr" the Telegram
 * account, and so on.
 */
const SECTION_WORDS: Partial<Record<SectionKey, string>> = {
  profile: "profil ism parol password 2fa ikki bosqichli kirish xavfsizlik security пароль",
  personalization:
    "til language язык shrift font rang color accent sana date valyuta currency ko'rinish тема",
  notifications: "bildirishnoma notification push uvedomlenie уведомления telegram bot ovoz sound",
  business: "biznes kompaniya company rekvizit logotip subdomen domen бизнес",
  general: "umumiy general valyuta vaqt mintaqa timezone dublikat duplicate лид",
  billing: "obuna tarif to'lov billing подписка оплата",
  reportProblem: "muammo xato bug support yordam проблема",
};

/** «Saqlanmoqda… / Saqlandi ✓» while anything on the page is being saved. */
function SaveStatus() {
  const { t } = useI18n();
  const busy = useIsMutating();
  const [done, setDone] = useState(false);
  const was = useRef(0);
  useEffect(() => {
    if (was.current > 0 && busy === 0) {
      setDone(true);
      const id = setTimeout(() => setDone(false), 2000);
      was.current = busy;
      return () => clearTimeout(id);
    }
    was.current = busy;
    return undefined;
  }, [busy]);
  if (!busy && !done) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[12px] font-semibold",
        busy
          ? "bg-muted text-muted-foreground"
          : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {busy ? t("set.saving") : `✓ ${t("set.saved")}`}
    </span>
  );
}

function SettingsPage() {
  const { t } = useI18n();
  const [navQuery, setNavQuery] = useState("");
  const { user } = useAuth();
  const { section: sectionParam } = Route.useSearch();
  // What each role configures here:
  //  - everyone: their own profile, appearance, and reporting a problem;
  //  - ROP: + how the sales team is run (notifications, work schedule,
  //    call/lead scoring, daily report -- a super admin finds the last two
  //    in the Admin panel);
  //  - super admin: + the company itself (business profile, general
  //    settings, subscription).
  const role = appRoleOf(user);
  const isAdmin = role === "super_admin";
  const isManager = isAdmin || role === "rop";

  const profileItems: NavItem[] = [
    { type: "section", key: "profile", icon: ShieldCheck, label: t("settings.nav.profile") },
    {
      type: "section",
      key: "personalization",
      icon: Palette,
      label: t("settings.nav.personalization"),
    },
    // Everyone: their own phone/computer notifications. The notification
    // center itself opens from the sidebar's bell.
    {
      type: "section",
      key: "notifications",
      icon: Bell,
      label: t("settings.nav.notifications"),
    },
  ];
  const generalItems: NavItem[] = [
    ...profileItems,
    ...(isAdmin
      ? ([
          {
            type: "section",
            key: "business",
            icon: Building2,
            label: t("settings.nav.business"),
          },
          {
            type: "section",
            key: "general",
            icon: SlidersHorizontal,
            label: t("settings.nav.general"),
          },
          { type: "section", key: "billing", icon: CreditCard, label: t("trial.subscribe") },
        ] satisfies NavItem[])
      : []),
    {
      type: "section",
      key: "reportProblem",
      icon: MessageCircle,
      label: t("settings.nav.reportProblem"),
    },
  ];

  const ALL_GROUPS: { label: string; items: NavItem[] }[] = [
    { label: t("settings.navGroup.general"), items: generalItems },
    // Call and lead scoring live in Audio tahlil / Lid tahlili -> Sozlash.
    // The Telegram report: a super admin finds it in the Admin panel.
    ...(role === "rop"
      ? [
          {
            label: t("settings.navGroup.reports"),
            items: [
              {
                type: "reportLink",
                icon: FileBarChart,
                label: t("settings.nav.dailyReportSettings"),
              },
            ] satisfies NavItem[],
          },
        ]
      : []),
  ];

  // «Sozlama qidirish»: sections whose name or contents match what is typed.
  const q = navQuery
    .trim()
    .toLowerCase()
    .replace(/[ʻʼ’‘`]/g, "'");
  const NAV_GROUPS = q
    ? ALL_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((i) =>
          `${i.label} ${i.type === "section" ? (SECTION_WORDS[i.key] ?? "") : ""}`
            .toLowerCase()
            .replace(/[ʻʼ’‘`]/g, "'")
            .includes(q),
        ),
      })).filter((g) => g.items.length > 0)
    : ALL_GROUPS;

  // A ?section= link to something this role doesn't get opens the profile.
  const allowedSections = new Set(
    generalItems.flatMap((i) => (i.type === "section" ? [i.key] : [])),
  );
  const [section, setSection] = useState<SectionKey>(
    sectionParam && allowedSections.has(sectionParam) ? sectionParam : "profile",
  );
  // A link to another section while already here (the bell's
  // "Hammasini ko'rish") switches to it.
  useEffect(() => {
    if (sectionParam && allowedSections.has(sectionParam)) setSection(sectionParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionParam]);
  // Each section opens at its top, not at the previous section's offset.
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [section]);

  // The first group ("Umumiy") is always visible, uncollapsible -- only
  // the groups after it (call scoring / lead-CRM / reports) can be
  // toggled, and they start collapsed on every page load.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(ALL_GROUPS.slice(1).map((g) => g.label)),
  );
  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    // A full-bleed, full-height two-pane layout (not a card floating in
    // <main>'s normal padding) -- the negative margins cancel <main>'s own
    // padding (px-4/md:px-6, pt-4, pb-28/md:pb-36) on every side, not just
    // left/right, so the nav panel can run truly edge-to-edge and
    // floor-to-ceiling. h-full alone was still landing 112-144px short of
    // <main>'s real bottom edge: percentage height resolves against
    // <main>'s CONTENT box, which is already <main>'s own height minus
    // that padding, so the nav (sized off this same h-full chain) was
    // being denied exactly the bottom-padding's worth of height too --
    // measured and confirmed against the actual compiled CSS, not
    // guessed. The h-[calc(...)] compensates by adding that padding back
    // to the element's own height, since negative margin alone repositions
    // a box but doesn't grow it.
    <div className="-mx-4 -mt-4 -mb-28 flex h-[calc(100%+8rem)] flex-col md:-mx-6 md:-mb-36 md:h-[calc(100%+10rem)] phone:m-0 phone:h-auto">
      {/* No local page-title bar here -- the global top header already
          shows "Sozlamalar" for this route (AppShell.tsx), so a second
          title row directly beneath it just duplicated it and read as an
          extra, differently-colored band sitting above the nav instead of
          the nav reaching the very top like the reference. The nav and
          content panes now start right at the top of this wrapper. */}

      {/* Below lg there's no room for a persistent 256px side nav next to
          the content pane -- both would get squeezed into slivers and read
          as broken/overlapping. Flatten every group into one horizontal
          scroll strip instead (same pattern used for filter bars
          elsewhere), and only show the real two-pane layout from lg up. */}
      <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border bg-background px-4 py-2.5 lg:hidden phone:mb-3 phone:border-b-0 phone:bg-transparent phone-tabs">
        {NAV_GROUPS.flatMap((group) => group.items).map((item) =>
          item.type === "section" ? (
            <button
              key={item.key}
              type="button"
              onClick={() => setSection(item.key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors",
                section === item.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground",
              )}
            >
              <item.icon className={cn("h-3.5 w-3.5 shrink-0", settingsIconTone(item.icon))} />
              {item.label}
            </button>
          ) : (
            <Link
              key="daily-report-settings-m"
              to="/daily-report-settings"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-muted-foreground"
            >
              <item.icon className={cn("h-3.5 w-3.5 shrink-0", settingsIconTone(item.icon))} />
              {item.label}
            </Link>
          ),
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* The column itself runs the page's full height (background and
            border); the menu inside it is pinned to the top of <main>'s
            scroll area, so it stays put while the content pane scrolls. */}
        <nav className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
          <div className="sticky top-0 max-h-dvh space-y-4 overflow-y-auto p-3">
            <label className="flex h-9 items-center gap-2 rounded-[6px] border border-border bg-card px-2.5 focus-within:border-primary">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const first = NAV_GROUPS[0]?.items.find((i) => i.type === "section");
                  if (first && first.type === "section") setSection(first.key);
                }}
                placeholder={t("set.search")}
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
              />
            </label>
            {q && NAV_GROUPS.length === 0 && (
              <p className="px-3 text-[12.5px] text-muted-foreground">{t("set.nothing")}</p>
            )}
            {NAV_GROUPS.map((group, groupIndex) => {
              const collapsible = groupIndex !== 0 && !q;
              const collapsed = collapsible && collapsedGroups.has(group.label);
              return (
                <div key={group.label}>
                  {collapsible ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.label)}
                      className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-subtle transition-colors hover:text-foreground"
                    >
                      <span>{group.label}</span>
                      <span className="flex items-center gap-1">
                        {group.items.length}
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 transition-transform",
                            collapsed && "-rotate-90",
                          )}
                        />
                      </span>
                    </button>
                  ) : (
                    <div className="mb-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      {group.label}
                    </div>
                  )}
                  {!collapsed && (
                    <div className="space-y-1">
                      {group.items.map((item) =>
                        item.type === "section" ? (
                          <button
                            key={item.key}
                            onClick={() => setSection(item.key)}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                              section === item.key
                                ? "bg-primary text-primary-foreground shadow-soft"
                                : "text-muted-foreground hover:bg-mint-border hover:text-mint-foreground",
                            )}
                          >
                            <item.icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                section !== item.key && settingsIconTone(item.icon),
                              )}
                            />
                            <span className="truncate">{item.label}</span>
                            {item.badge !== undefined && item.badge > 0 && (
                              <span className="ml-auto rounded-md bg-background px-1.5 py-0.5 text-[11px] font-semibold text-subtle">
                                {item.badge}
                              </span>
                            )}
                          </button>
                        ) : (
                          <Link
                            key="daily-report-settings"
                            to="/daily-report-settings"
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-mint-border hover:text-mint-foreground"
                          >
                            <item.icon
                              className={cn("h-4 w-4 shrink-0", settingsIconTone(item.icon))}
                            />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        ),
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* lg:pr-11 keeps the cards a good centimeter clear of the screen's
            right edge instead of running right up against it. */}
        <div
          ref={contentRef}
          className="min-w-0 flex-1 overflow-y-auto p-5 pb-6 md:p-6 lg:pr-11 phone:overflow-visible phone:p-0"
        >
          <SettingsLayout gutter={false}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <BackButton />
              <SaveStatus />
            </div>
            {section === "profile" && <ProfileSection />}
            {section === "personalization" && <PersonalizationSection />}
            {section === "notifications" && (
              <div className="space-y-5">
                {isManager && <NotificationsSection />}
                <PersonalNotificationsCard />
                <TelegramLinkCard />
              </div>
            )}
            {section === "business" && <BusinessProfileSection />}
            {section === "general" && <GeneralSection />}
            {/* Each lives in one place: working hours are the shifts in
                Admin -> Davomat, the subscription is the Billing page. */}
            {sectionParam === "workSchedule" && <Navigate to="/admin/attendance" replace />}
            {section === "billing" && <Navigate to="/billing" replace />}
            {/* AI -> amoCRM moved to the amoCRM integration page. */}
            {section === "amocrm" && (
              <Navigate to="/integrations/$slug" params={{ slug: "amocrm" }} replace />
            )}
            {section === "reportProblem" && <ReportProblemSection />}
            {/* A real block, not just scroll-container padding -- padding alone
              on this pane proved unreliable on real mobile Chrome (screenshots
              showed the last card flush against the viewport edge despite a
              large pb-* value), so the breathing room below the last section
              is now guaranteed DOM content instead of CSS that depends on how
              a given browser computes scrollable overflow around padding. */}
            <div aria-hidden className="pointer-events-none h-16 md:h-20 phone:hidden" />
          </SettingsLayout>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BellRing,
  Bot,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  FileBarChart,
  Globe,
  LayoutGrid,
  ListChecks,
  Loader2,
  Moon,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sun,
  Tag as TagIcon,
  MessageCircle,
  Palette,
  Thermometer,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { useI18n, LANGS, LANG_LABELS } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { usePushSubscription } from "@/hooks/use-push-notifications";
import {
  useBusinessProfile,
  useCreateSettingListItem,
  useCreateStage,
  useCrmLeads,
  useDeleteSettingListItem,
  useDeleteStage,
  useDeleteTag,
  useNotificationPreferences,
  useIntegrationSetting,
  useLinkTelegram,
  usePipelineStagesRaw,
  useRenameTag,
  useSetTelegramBotUsername,
  useSettingList,
  useTagsSummary,
  useUpdateBusinessProfile,
  useUpdateNotificationPreferences,
  useUpdateProfile,
  useUpdateSettingListItem,
  useUpdateStage,
  type GlossaryItem,
  type ObjectionItem,
  type ProductServiceItem,
  type SettingListType,
  type StageRow,
} from "@/hooks/use-crm-data";
import { cn, stageColorProps } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { BusinessProfileBot } from "@/components/settings/BusinessProfileBot";
import type { Tab as ScoringTab } from "@/routes/scoring-criteria";

type SectionKey =
  | "profile"
  | "personalization"
  | "notifications"
  | "business"
  | "general"
  | "workSchedule"
  | "reportProblem"
  | "stages"
  | "tags"
  | "leadCategories"
  | "conversion";

const SECTION_KEYS: SectionKey[] = [
  "profile",
  "personalization",
  "notifications",
  "business",
  "general",
  "workSchedule",
  "reportProblem",
  "stages",
  "tags",
  "leadCategories",
  "conversion",
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

const COMING_SOON: SectionKey[] = ["general", "workSchedule", "reportProblem"];

function ProfileSection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();

  const [fullName, setFullName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [saving, setSaving] = useState(false);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await updateProfile.mutateAsync({
        id: user.id,
        patch: { full_name: fullName.trim(), phone: phone.trim() || null },
      });
      toast.success(t("settings.profileUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.profileUpdateFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard title={t("settings.profile")} className="xl:col-span-2">
        <form onSubmit={onSaveProfile} className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("settings.fullName")}
            </span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("settings.email")}
            </span>
            <input
              value={user?.email ?? ""}
              disabled
              className="mt-2 h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm text-muted-foreground outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("settings.role")}
            </span>
            <input
              value={user?.role ?? ""}
              disabled
              className="mt-2 h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm capitalize text-muted-foreground outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("settings.phone")}
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 123 45 67"
              className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-background"
            />
          </label>
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
        </form>
      </SectionCard>
    </div>
  );
}

function PersonalizationSection() {
  const { t, lang, setLang } = useI18n();
  const { unit, setUnit } = useCurrency();
  const { dark, setDark } = useTheme();
  const { user } = useAuth();
  const showCurrency = user?.role !== "sotuv_menejeri";

  return (
    <SectionCard
      title={t("settings.nav.personalization")}
      description={t("settings.personalizationDesc")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {showCurrency && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
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
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <Globe className="h-4 w-4" />
            </span>
            <span className="text-[13px] font-semibold text-foreground">
              {t("settings.language")}
            </span>
          </div>
          <div className="mt-3">
            <SegmentedControl
              value={lang}
              options={LANGS}
              render={(l) => LANG_LABELS[l]}
              onChange={setLang}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-5 rounded-xl border border-border bg-surface p-4 sm:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning-foreground">
              {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </span>
            <div>
              <p className="text-[13px] font-semibold text-foreground">
                {t("settings.appearance")}
              </p>
              <p className="text-xs text-subtle">{t("settings.appearanceDesc")}</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            onClick={() => setDark(!dark)}
            className={cn(
              "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors",
              dark ? "bg-foreground" : "bg-warning/25",
            )}
          >
            <span
              className={cn(
                "absolute left-1 flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-soft transition-transform duration-200",
                dark && "translate-x-6",
              )}
            >
              {dark ? (
                <Moon className="h-3.5 w-3.5 text-foreground" />
              ) : (
                <Sun className="h-3.5 w-3.5 text-warning" />
              )}
            </span>
          </button>
        </div>
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
  const { user, refreshProfile } = useAuth();
  const { data: botSetting } = useIntegrationSetting("telegram_bot");
  const setBotUsername = useSetTelegramBotUsername();
  const linkTelegram = useLinkTelegram();
  const [usernameInput, setUsernameInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [linkInfo, setLinkInfo] = useState<{ code: string; botUsername: string | null } | null>(
    null,
  );

  const config = (botSetting?.config ?? null) as { username?: string } | null;
  const botUsername = config?.username?.trim() || null;
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";

  useEffect(() => {
    if (botSetting === undefined || hydrated) return;
    setUsernameInput(config?.username ?? "");
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSetting, hydrated]);

  async function saveBotUsername() {
    try {
      await setBotUsername.mutateAsync(usernameInput.trim().replace(/^@/, ""));
      toast.success("Saqlandi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Saqlashda xatolik yuz berdi.");
    }
  }

  async function generateCode() {
    try {
      const result = await linkTelegram.mutateAsync();
      setLinkInfo(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kodni olishda xatolik yuz berdi.");
    }
  }

  return (
    <SectionCard
      title="Telegram bot"
      description="Kunlik hisobot va vazifa eslatmalarini shaxsiy Telegram orqali olish uchun ulang."
    >
      <div className="space-y-5">
        {isAdmin && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-[13px] font-semibold text-foreground">
              Hisobot boti (@foydalanuvchi nomi)
            </p>
            <p className="mt-0.5 text-xs text-subtle">
              Kunlik hisobot va vazifa eslatmalarini yuboradigan bot.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="hisobotchi_bot"
                className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
              />
              <button
                type="button"
                onClick={() => void saveBotUsername()}
                disabled={setBotUsername.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {setBotUsername.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Saqlash
              </button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-4">
          {user?.telegramLinked ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-success">
              <Check className="h-4 w-4" /> Telegram ulangan
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">Telegram ulanmagan</p>
                  <p className="mt-0.5 text-xs text-subtle">
                    Ulash uchun bir martalik kod oling va uni botga yuboring.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void generateCode()}
                  disabled={linkTelegram.isPending}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                >
                  {linkTelegram.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <MessageCircle className="h-4 w-4" /> Kodni olish
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
                    Telegram'da oching
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
                    Yuborgach, shu yerni bosing — holatni tekshiramiz
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

function NotificationsSection() {
  const { t } = useI18n();
  const { data: prefs } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();
  const taskAssigned = prefs?.task_assigned ?? true;
  const push = usePushSubscription();

  async function toggleTaskAssigned() {
    try {
      await updatePrefs.mutateAsync({ task_assigned: !taskAssigned });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.notifications.saveFailed"));
    }
  }

  async function togglePush() {
    try {
      if (push.status === "subscribed") await push.unsubscribe.mutateAsync();
      else await push.subscribe.mutateAsync();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.notifications.saveFailed"));
    }
  }

  return (
    <SectionCard
      title={t("settings.nav.notifications")}
      description={t("settings.notifications.desc")}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-5 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Bell className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-foreground">
                {t("settings.notifications.taskAssigned")}
              </p>
              <p className="text-xs text-subtle">{t("settings.notifications.taskAssignedDesc")}</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={taskAssigned}
            disabled={updatePrefs.isPending}
            onClick={() => void toggleTaskAssigned()}
            className={cn(
              "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
              taskAssigned ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "absolute left-1 h-6 w-6 rounded-full bg-background shadow-soft transition-transform duration-200",
                taskAssigned && "translate-x-6",
              )}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-5 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <BellRing className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-foreground">
                {t("settings.notifications.push")}
              </p>
              <p className="text-xs text-subtle">
                {push.status === "unsupported"
                  ? t("settings.notifications.pushUnsupported")
                  : push.status === "subscribed"
                    ? t("settings.notifications.pushOnDesc")
                    : t("settings.notifications.pushOffDesc")}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={push.status === "subscribed"}
            disabled={
              push.status === "unsupported" ||
              push.status === "loading" ||
              push.subscribe.isPending ||
              push.unsubscribe.isPending
            }
            onClick={() => void togglePush()}
            className={cn(
              "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
              push.status === "subscribed" ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "absolute left-1 h-6 w-6 rounded-full bg-background shadow-soft transition-transform duration-200",
                push.status === "subscribed" && "translate-x-6",
              )}
            />
          </button>
        </div>
      </div>
    </SectionCard>
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
  const canManage =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
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
      title={t("settings.business.title")}
      description={t("settings.business.desc")}
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

function StageRowEditor({
  stage,
  leadCount,
  canManage,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  stage: StageRow;
  leadCount: number;
  canManage: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { t } = useI18n();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color);
  const [probability, setProbability] = useState(String(stage.probability));
  const [status, setStatus] = useState<"active" | "won" | "lost">(
    stage.is_won ? "won" : stage.is_lost ? "lost" : "active",
  );

  async function save() {
    try {
      await updateStage.mutateAsync({
        id: stage.id,
        patch: {
          name: name.trim() || stage.name,
          color,
          probability: Number(probability) || 0,
          is_won: status === "won",
          is_lost: status === "lost",
        },
      });
      toast.success(t("settings.stages.updated"));
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.stages.actionFailed"));
    }
  }

  async function remove() {
    try {
      await deleteStage.mutateAsync(stage.id);
      toast.success(t("settings.stages.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.stages.actionFailed"));
    } finally {
      setConfirmDelete(false);
    }
  }

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          {canManage && (
            <div className="flex flex-col">
              <button
                onClick={onMoveUp}
                disabled={isFirst}
                className="text-subtle hover:text-foreground disabled:opacity-30"
                aria-label={t("settings.moveUp")}
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                onClick={onMoveDown}
                disabled={isLast}
                className="text-subtle hover:text-foreground disabled:opacity-30"
                aria-label={t("settings.moveDown")}
              >
                <ArrowDown className="h-3 w-3" />
              </button>
            </div>
          )}
          <span
            className={cn("h-2.5 w-2.5 rounded-full", stageColorProps(stage.color).className)}
            style={stageColorProps(stage.color).style}
          />
          <div>
            <p className="text-sm font-medium text-foreground">{stage.name}</p>
            <p className="text-xs text-subtle">
              {t("settings.stages.leadCount", { count: leadCount })} · {stage.probability}%
            </p>
          </div>
          {stage.is_won && <Pill tone="success">{t("settings.stages.statusWon")}</Pill>}
          {stage.is_lost && <Pill tone="danger">{t("settings.stages.statusLost")}</Pill>}
        </div>
        {canManage && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg p-2 text-subtle hover:bg-accent hover:text-foreground"
              aria-label={t("admin.editRole")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg p-2 text-subtle hover:bg-destructive/10 hover:text-destructive"
              aria-label={t("settings.stages.deleteConfirmTitle")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("settings.stages.deleteConfirmTitle")}
          description={t("settings.stages.deleteConfirmDesc", { name: stage.name })}
          onConfirm={remove}
        />
      </li>
    );
  }

  return (
    <li className="space-y-3 rounded-xl border border-primary/30 bg-surface px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            {t("settings.stages.name")}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            {t("settings.stages.probability")}
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
            className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40"
          />
        </label>
      </div>
      <div>
        <span className="text-xs font-medium text-muted-foreground">
          {t("settings.stages.color")}
        </span>
        <div className="mt-1.5 flex items-center gap-2">
          {STAGE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                "h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition-shadow",
                c,
                color === c && "ring-2 ring-primary",
              )}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <div>
        <span className="text-xs font-medium text-muted-foreground">
          {t("settings.stages.status")}
        </span>
        <div className="mt-1.5">
          <SegmentedControl
            value={status}
            options={["active", "won", "lost"] as const}
            render={(v) =>
              v === "active"
                ? t("settings.stages.statusActive")
                : v === "won"
                  ? t("settings.stages.statusWon")
                  : t("settings.stages.statusLost")
            }
            onChange={setStatus}
            size="sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={save}
          disabled={updateStage.isPending}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {updateStage.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("common.save")}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-accent"
        >
          <X className="h-3.5 w-3.5" /> {t("common.cancel")}
        </button>
      </div>
    </li>
  );
}

function StagesSection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
  const { data: stages, isLoading } = usePipelineStagesRaw();
  const { rows: leads } = useCrmLeads();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const sorted = [...(stages ?? [])].sort((a, b) => a.position - b.position);
  const leadCountByStage = (id: string) => leads.filter((l) => l.stageId === id).length;

  async function move(index: number, dir: -1 | 1) {
    const target = sorted[index + dir];
    const current = sorted[index];
    if (!target || !current) return;
    try {
      await Promise.all([
        updateStage.mutateAsync({ id: current.id, patch: { position: target.position } }),
        updateStage.mutateAsync({ id: target.id, patch: { position: current.position } }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.stages.actionFailed"));
    }
  }

  async function addStage(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const base = newName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const existingKeys = new Set(sorted.map((s) => s.key));
      let key = base || "stage";
      let n = 2;
      while (existingKeys.has(key)) key = `${base}-${n++}`;
      const nextPosition = sorted.length ? Math.max(...sorted.map((s) => s.position)) + 1 : 1;
      await createStage.mutateAsync({
        organization_id: user!.organizationId!,
        key,
        name: newName.trim(),
        position: nextPosition,
        color: "bg-primary",
        probability: 10,
      });
      toast.success(t("settings.stages.created"));
      setNewName("");
      setAdding(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.stages.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title={t("settings.stages.title")}
      description={t("settings.stages.desc")}
      actions={
        canManage && (
          <button
            onClick={() => setAdding((a) => !a)}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t("settings.stages.add")}
          </button>
        )
      }
    >
      {isLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}
      {adding && (
        <form
          onSubmit={addStage}
          className="mb-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-surface p-3"
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("settings.stages.name")}
            className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("common.save")}
          </button>
        </form>
      )}
      <ul className="space-y-2">
        {sorted.map((s, i) => (
          <StageRowEditor
            key={s.id}
            stage={s}
            leadCount={leadCountByStage(s.id)}
            canManage={canManage}
            isFirst={i === 0}
            isLast={i === sorted.length - 1}
            onMoveUp={() => void move(i, -1)}
            onMoveDown={() => void move(i, 1)}
          />
        ))}
      </ul>
    </SectionCard>
  );
}

function TagsSection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
  const { tags, isLoading } = useTagsSummary();
  const renameTag = useRenameTag();
  const deleteTag = useDeleteTag();
  const [query, setQuery] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const visible = tags.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));

  async function rename(from: string) {
    const to = draftName.trim();
    if (!to || to === from) {
      setEditingTag(null);
      return;
    }
    try {
      await renameTag.mutateAsync({ from, to });
      toast.success(t("settings.tags.renamed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.tags.actionFailed"));
    } finally {
      setEditingTag(null);
    }
  }

  async function remove(tag: string) {
    try {
      await deleteTag.mutateAsync(tag);
      toast.success(t("settings.tags.deletedToast"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.tags.actionFailed"));
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <SectionCard
      title={t("settings.tags.title")}
      description={t("settings.tags.desc")}
      actions={
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("settings.tags.search")}
          className="h-10 w-56 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
        />
      }
    >
      {isLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}
      {!isLoading && visible.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("settings.tags.empty")}</p>
      )}
      <ul className="space-y-2">
        {visible.map((tag) => (
          <li
            key={tag.name}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5"
          >
            {editingTag === tag.name ? (
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void rename(tag.name);
                  if (e.key === "Escape") setEditingTag(null);
                }}
                onBlur={() => void rename(tag.name)}
                className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40"
              />
            ) : (
              <div className="flex items-center gap-2">
                <TagIcon className="h-3.5 w-3.5 text-subtle" />
                <span className="text-sm font-medium text-foreground">{tag.name}</span>
                <span className="text-xs text-subtle">
                  {t("settings.tags.leadCount", { count: tag.count })}
                </span>
              </div>
            )}
            {canManage && editingTag !== tag.name && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditingTag(tag.name);
                    setDraftName(tag.name);
                  }}
                  className="rounded-lg p-2 text-subtle hover:bg-accent hover:text-foreground"
                  aria-label={t("settings.tags.rename")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDelete(tag.name)}
                  className="rounded-lg p-2 text-subtle hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t("settings.tags.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={confirmDelete ? t("settings.tags.deleteConfirmTitle", { tag: confirmDelete }) : ""}
        description={
          confirmDelete
            ? t("settings.tags.deleteConfirmDesc", {
                count: tags.find((t) => t.name === confirmDelete)?.count ?? 0,
              })
            : ""
        }
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
      />
    </SectionCard>
  );
}

function ComingSoonSection({ label }: { label: string }) {
  const { t } = useI18n();
  return (
    <SectionCard title={label}>
      <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
        <p className="text-sm font-semibold text-foreground">{t("settings.comingSoonTitle")}</p>
        <p className="mt-1 text-sm text-subtle">{t("settings.comingSoonDesc")}</p>
      </div>
    </SectionCard>
  );
}

// Backs the admin-managed named lists (lead categories, conversion
// targets) — same shape (name + optional numeric value), one shared
// component instead of near-identical ones per list.
const LIST_SECTION_TYPE: Record<string, SettingListType> = {
  leadCategories: "lead_categories",
  conversion: "conversion_targets",
};
const LIST_SECTION_HAS_VALUE = new Set<SettingListType>(["conversion_targets"]);

function GenericListSection({ label, listType }: { label: string; listType: SettingListType }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
  const withValue = LIST_SECTION_HAS_VALUE.has(listType);
  const { data: items, isLoading } = useSettingList(listType);
  const createItem = useCreateSettingListItem();
  const updateItem = useUpdateSettingListItem();
  const deleteItem = useDeleteSettingListItem();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createItem.mutateAsync({
        organization_id: user!.organizationId!,
        list_type: listType,
        name: name.trim(),
        value: withValue && value.trim() ? Number(value) : null,
        position: items.length,
      });
      toast.success(t("settings.list.added"));
      setName("");
      setValue("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.list.actionFailed"));
    }
  }

  async function save(id: string) {
    try {
      await updateItem.mutateAsync({
        id,
        patch: {
          ...(editName.trim() ? { name: editName.trim() } : {}),
          ...(withValue ? { value: editValue.trim() ? Number(editValue) : null } : {}),
        },
      });
      toast.success(t("settings.list.updated"));
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.list.actionFailed"));
    }
  }

  async function remove(id: string) {
    try {
      await deleteItem.mutateAsync(id);
      toast.success(t("settings.list.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.list.actionFailed"));
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <SectionCard title={label} description={t("settings.list.desc")}>
      {canManage && (
        <form onSubmit={(e) => void add(e)} className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.list.namePlaceholder")}
            className="h-10 min-w-[180px] flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
          />
          {withValue && (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("settings.list.valuePlaceholder")}
              type="number"
              className="h-10 w-40 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
            />
          )}
          <button
            type="submit"
            disabled={createItem.isPending || !name.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {createItem.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t("settings.list.add")}
          </button>
        </form>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}
      {!isLoading && items.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("settings.list.empty")}</p>
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5"
          >
            {editingId === item.id ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void save(item.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-9 min-w-[160px] flex-1 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40"
                />
                {withValue && (
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    type="number"
                    className="h-9 w-32 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary/40"
                  />
                )}
                <button
                  onClick={() => void save(item.id)}
                  className="rounded-lg p-2 text-subtle hover:bg-accent hover:text-foreground"
                  aria-label={t("common.save")}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{item.name}</span>
                {withValue && item.value != null && (
                  <span className="text-xs text-subtle">{item.value}</span>
                )}
              </div>
            )}
            {canManage && editingId !== item.id && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditingId(item.id);
                    setEditName(item.name);
                    setEditValue(item.value != null ? String(item.value) : "");
                  }}
                  className="rounded-lg p-2 text-subtle hover:bg-accent hover:text-foreground"
                  aria-label={t("settings.list.rename")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDelete({ id: item.id, name: item.name })}
                  className="rounded-lg p-2 text-subtle hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t("settings.list.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={
          confirmDelete ? t("settings.list.deleteConfirmTitle", { name: confirmDelete.name }) : ""
        }
        description={t("settings.list.deleteConfirmDesc")}
        onConfirm={() => confirmDelete && void remove(confirmDelete.id)}
      />
    </SectionCard>
  );
}

type NavItem =
  | {
      type: "section";
      key: SectionKey;
      icon: LucideIcon;
      label: string;
      badge?: number | undefined;
    }
  | { type: "scoringLink"; tab: ScoringTab; icon: LucideIcon; label: string }
  | { type: "reportLink"; icon: LucideIcon; label: string }
  | { type: "billingLink"; icon: LucideIcon; label: string };

function SettingsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { section: sectionParam } = Route.useSearch();
  const { tags } = useTagsSummary();
  const { data: stages } = usePipelineStagesRaw();
  const isSotuvMenejeri = user?.role === "sotuv_menejeri";
  const [section, setSection] = useState<SectionKey>(
    sectionParam &&
      !(isSotuvMenejeri && sectionParam !== "profile" && sectionParam !== "personalization")
      ? sectionParam
      : "profile",
  );

  // Sotuv menejeri only gets their own profile + language/appearance —
  // everything else here is workspace-wide configuration, so the other
  // groups (call scoring, lead/CRM config, reports) don't apply to them.
  const NAV_GROUPS: { label: string; items: NavItem[] }[] = isSotuvMenejeri
    ? [
        {
          label: t("settings.navGroup.general"),
          items: [
            { type: "section", key: "profile", icon: Users, label: t("settings.nav.profile") },
            {
              type: "section",
              key: "personalization",
              icon: Palette,
              label: t("settings.nav.personalization"),
            },
          ],
        },
      ]
    : [
        {
          label: t("settings.navGroup.general"),
          items: [
            { type: "section", key: "profile", icon: Users, label: t("settings.nav.profile") },
            {
              type: "section",
              key: "personalization",
              icon: Palette,
              label: t("settings.nav.personalization"),
            },
            {
              type: "section",
              key: "notifications",
              icon: Bell,
              label: t("settings.nav.notifications"),
            },
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
            {
              type: "section",
              key: "workSchedule",
              icon: Calendar,
              label: t("settings.nav.workSchedule"),
            },
            { type: "billingLink", icon: CreditCard, label: t("trial.subscribe") },
            {
              type: "section",
              key: "reportProblem",
              icon: MessageCircle,
              label: t("settings.nav.reportProblem"),
            },
          ],
        },
        {
          label: t("settings.navGroup.callAnalysis"),
          items: [
            {
              type: "scoringLink",
              tab: "rubric",
              icon: ClipboardCheck,
              label: t("settings.nav.scoringCriteria"),
            },
            {
              type: "scoringLink",
              tab: "intake",
              icon: ListChecks,
              label: t("settings.nav.scoringIntake"),
            },
            {
              type: "scoringLink",
              tab: "services",
              icon: Workflow,
              label: t("settings.nav.scoringServices"),
            },
            {
              type: "scoringLink",
              tab: "families",
              icon: LayoutGrid,
              label: t("settings.nav.scoringFamilies"),
            },
            {
              type: "scoringLink",
              tab: "aiInstructions",
              icon: Bot,
              label: t("settings.nav.scoringAiInstructions"),
            },
          ],
        },
        {
          label: t("settings.navGroup.leadsAndCrm"),
          items: [
            {
              type: "section",
              key: "stages",
              icon: Workflow,
              label: t("settings.nav.stages"),
              badge: stages?.length,
            },
            {
              type: "section",
              key: "tags",
              icon: TagIcon,
              label: t("settings.nav.tags"),
              badge: tags.length,
            },
            {
              type: "section",
              key: "leadCategories",
              icon: Thermometer,
              label: t("settings.nav.leadCategories"),
            },
            {
              type: "section",
              key: "conversion",
              icon: TrendingUp,
              label: t("settings.nav.conversion"),
            },
            {
              type: "scoringLink",
              tab: "leadQuality",
              icon: Thermometer,
              label: t("settings.nav.scoringLeadQuality"),
            },
            {
              type: "scoringLink",
              tab: "outcomes",
              icon: TrendingUp,
              label: t("settings.nav.scoringOutcomes"),
            },
            {
              type: "scoringLink",
              tab: "leadAnalytics",
              icon: FileBarChart,
              label: t("settings.nav.scoringLeadAnalytics"),
            },
          ],
        },
        {
          label: t("settings.navGroup.reports"),
          items: [
            {
              type: "reportLink",
              icon: FileBarChart,
              label: t("settings.nav.dailyReportSettings"),
            },
          ],
        },
      ];

  const activeLabel = NAV_GROUPS.flatMap((g) => g.items)
    .filter((item): item is Extract<NavItem, { type: "section" }> => item.type === "section")
    .find((item) => item.key === section)?.label;

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.desc")} />

      <div className="mt-6 grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="space-y-4">
          {NAV_GROUPS.map((group) => {
            const collapsed = collapsedGroups.has(group.label);
            return (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-subtle transition-colors hover:text-foreground"
                >
                  <span>{group.label}</span>
                  <span className="flex items-center gap-1">
                    {group.items.length}
                    <ChevronDown
                      className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")}
                    />
                  </span>
                </button>
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
                            COMING_SOON.includes(item.key) && "opacity-70",
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                          {item.badge !== undefined && item.badge > 0 && (
                            <span className="ml-auto rounded-md bg-background px-1.5 py-0.5 text-[11px] font-semibold text-subtle">
                              {item.badge}
                            </span>
                          )}
                          {COMING_SOON.includes(item.key) && (
                            <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-subtle">
                              {t("settings.comingSoonBadge")}
                            </span>
                          )}
                        </button>
                      ) : item.type === "scoringLink" ? (
                        <Link
                          key={item.tab}
                          to="/scoring-criteria"
                          search={{ tab: item.tab }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-mint-border hover:text-mint-foreground"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      ) : item.type === "reportLink" ? (
                        <Link
                          key="daily-report-settings"
                          to="/daily-report-settings"
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-mint-border hover:text-mint-foreground"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      ) : (
                        <Link
                          key="billing"
                          to="/billing"
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-mint-border hover:text-mint-foreground"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div>
          {section === "profile" && <ProfileSection />}
          {section === "personalization" && <PersonalizationSection />}
          {section === "notifications" && (
            <div className="space-y-5">
              <NotificationsSection />
              <TelegramLinkCard />
            </div>
          )}
          {section === "business" && <BusinessProfileSection />}
          {section === "stages" && <StagesSection />}
          {section === "tags" && <TagsSection />}
          {section in LIST_SECTION_TYPE && (
            <GenericListSection label={activeLabel ?? ""} listType={LIST_SECTION_TYPE[section]!} />
          )}
          {COMING_SOON.includes(section) && <ComingSoonSection label={activeLabel ?? ""} />}
        </div>
      </div>
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
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
  useNotificationPreferences,
  useIntegrationSetting,
  useLinkTelegram,
  useSetTelegramBotUsername,
  useUpdateBusinessProfile,
  useUpdateNotificationPreferences,
  useUpdateProfile,
  type GlossaryItem,
  type ObjectionItem,
  type ProductServiceItem,
} from "@/hooks/use-crm-data";
import { cn } from "@/lib/utils";
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
  | "reportProblem";

const SECTION_KEYS: SectionKey[] = [
  "profile",
  "personalization",
  "notifications",
  "business",
  "general",
  "workSchedule",
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
          {COMING_SOON.includes(section) && <ComingSoonSection label={activeLabel ?? ""} />}
        </div>
      </div>
    </>
  );
}

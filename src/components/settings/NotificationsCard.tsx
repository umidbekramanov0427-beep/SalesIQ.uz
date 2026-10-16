import {
  Bell,
  BellOff,
  BellRing,
  CheckSquare,
  Download,
  Loader2,
  MessageCircle,
  MonitorSmartphone,
  PhoneIncoming,
  Send,
  Share,
  SquarePlus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { IconTile, SectionCard, StatusChip } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationPreferencesRow,
} from "@/hooks/use-crm-data";
import { usePushSubscription } from "@/hooks/use-push-notifications";
import { useI18n } from "@/lib/i18n";
import { isIos, isStandalone, promptInstall, useInstallState } from "@/lib/pwa";
import { cn } from "@/lib/utils";

type PrefKey = "push_new_lead" | "push_messages" | "push_calls" | "task_assigned";

const EVENTS: { key: PrefKey; icon: LucideIcon; tone: "sky" | "violet" | "emerald" | "amber" }[] = [
  { key: "push_new_lead", icon: UserPlus, tone: "sky" },
  { key: "push_messages", icon: MessageCircle, tone: "violet" },
  { key: "push_calls", icon: PhoneIncoming, tone: "emerald" },
  { key: "task_assigned", icon: CheckSquare, tone: "amber" },
];

const ERROR_KEYS: Record<string, string> = {
  PUSH_UNSUPPORTED: "push.err.unsupported",
  PUSH_NOT_CONFIGURED: "push.err.notConfigured",
  PUSH_BLOCKED: "push.err.blocked",
  PUSH_DISMISSED: "push.err.dismissed",
  NO_COMPANY: "push.err.noCompany",
  MIGRATION_PENDING: "push.err.migrationPending",
};

// Settings → Bildirishnomalar: this device's phone/computer notifications
// (on/off, a test), which events send one, and installing SalesIQ as an app.
export function PersonalNotificationsCard() {
  const { t } = useI18n();
  const { data: prefs } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();
  const push = usePushSubscription();
  const install = useInstallState();
  const iosBrowser = isIos() && !isStandalone();

  const errorText = (err: unknown) => {
    const code = err instanceof Error ? err.message : "";
    return ERROR_KEYS[code] ? t(ERROR_KEYS[code]) : code || t("settings.notifications.saveFailed");
  };

  async function togglePush() {
    try {
      if (push.status === "subscribed") {
        await push.unsubscribe.mutateAsync();
        toast.success(t("push.offDone"));
      } else {
        await push.subscribe.mutateAsync();
        toast.success(t("push.onDone"));
      }
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function sendTest() {
    try {
      const sent = await push.test.mutateAsync();
      if (sent > 0) toast.success(t("push.testSent"));
      else toast.error(t("push.testNone"));
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function togglePref(key: PrefKey, value: boolean) {
    try {
      await updatePrefs.mutateAsync({ [key]: value });
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function installApp() {
    const ok = await promptInstall().catch(() => false);
    if (ok) toast.success(t("pwa.installed"));
  }

  const busy = push.subscribe.isPending || push.unsubscribe.isPending;
  const on = push.status === "subscribed";
  const pushState =
    push.status === "subscribed"
      ? { chip: "ok" as const, label: t("push.state.on"), desc: t("push.desc.on") }
      : push.status === "blocked"
        ? { chip: "error" as const, label: t("push.state.blocked"), desc: t("push.desc.blocked") }
        : push.status === "unsupported"
          ? {
              chip: "off" as const,
              label: t("push.state.unsupported"),
              desc: iosBrowser ? t("push.desc.iosInstall") : t("push.desc.unsupported"),
            }
          : { chip: "off" as const, label: t("push.state.off"), desc: t("push.desc.off") };

  return (
    <SectionCard
      icon={Bell}
      tone="amber"
      title={t("settings.nav.notifications")}
      description={t("push.cardDesc")}
      info={t("settings.notifPersonalInfo")}
    >
      <div className="space-y-5">
        {/* This device */}
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-4">
            <IconTile icon={on ? BellRing : BellOff} tone={on ? "emerald" : "slate"} size="lg" />
            <div className="min-w-[220px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-semibold text-foreground">{t("push.title")}</p>
                <StatusChip state={pushState.chip}>{pushState.label}</StatusChip>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pushState.desc}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {on && (
                <button
                  type="button"
                  onClick={() => void sendTest()}
                  disabled={push.test.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                >
                  {push.test.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {t("push.test")}
                </button>
              )}
              {push.status !== "unsupported" && push.status !== "blocked" && (
                <button
                  type="button"
                  onClick={() => void togglePush()}
                  disabled={busy || push.status === "loading"}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-opacity disabled:opacity-60",
                    on
                      ? "border border-border bg-background text-foreground hover:bg-accent"
                      : "bg-primary text-primary-foreground hover:opacity-90",
                  )}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {on ? t("push.turnOff") : t("push.turnOn")}
                </button>
              )}
            </div>
          </div>
          {push.status === "blocked" && (
            <ol className="mt-4 list-decimal space-y-1 rounded-xl bg-rose-500/8 py-3 pr-4 pl-9 text-sm text-foreground/85">
              <li>{t("push.blocked.step1")}</li>
              <li>{t("push.blocked.step2")}</li>
              <li>{t("push.blocked.step3")}</li>
            </ol>
          )}
        </div>

        {/* Which events */}
        <div>
          <p className="mb-2 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t("push.eventsTitle")}
          </p>
          <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-background/40">
            {EVENTS.map(({ key, icon, tone }) => {
              const value = prefs ? (prefs as NotificationPreferencesRow)[key] !== false : true;
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3.5 px-4 py-3 transition-colors hover:bg-accent/30"
                >
                  <IconTile icon={icon} tone={tone} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {t(`push.event.${key}`)}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      {t(`push.event.${key}.desc`)}
                    </span>
                  </span>
                  <Switch
                    checked={value}
                    disabled={updatePrefs.isPending}
                    onCheckedChange={(v) => void togglePref(key, v)}
                  />
                </label>
              );
            })}
          </div>
        </div>

        {/* Install as an app */}
        <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <IconTile icon={MonitorSmartphone} tone="primary" size="lg" />
          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-semibold text-foreground">{t("pwa.title")}</p>
              {install === "installed" && (
                <StatusChip state="ok">{t("pwa.installedChip")}</StatusChip>
              )}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {install === "installed" ? t("pwa.descInstalled") : t("pwa.desc")}
            </p>
            {install === "ios" && (
              <ol className="mt-3 space-y-1.5 text-sm text-foreground/85">
                <li className="flex items-center gap-2">
                  <Share className="h-4 w-4 shrink-0 text-primary" /> {t("pwa.ios.step1")}
                </li>
                <li className="flex items-center gap-2">
                  <SquarePlus className="h-4 w-4 shrink-0 text-primary" /> {t("pwa.ios.step2")}
                </li>
              </ol>
            )}
            {install === "manual" && (
              <p className="mt-3 text-sm text-foreground/85">{t("pwa.manual")}</p>
            )}
          </div>
          {install === "available" && (
            <button
              type="button"
              onClick={() => void installApp()}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Download className="h-4 w-4" />
              {t("pwa.install")}
            </button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

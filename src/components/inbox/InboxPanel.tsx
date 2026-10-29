import { useMemo, useState } from "react";
import { Flag, Loader2, MicOff, TrendingDown, UserX, Inbox } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, Pill } from "@/components/layout/Primitives";
import { useOpenNotificationLink } from "@/components/notifications/open-link";
import { FilterSelect } from "@/components/filters/FilterSelect";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  useAlertsView,
  useDismissAlert,
  useMarkAlertRead,
  useMarkNotificationRead,
  useNotificationsView,
  type AlertType,
  type AlertView,
} from "@/hooks/use-crm-data";

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message || fallback;
  }
  return fallback;
}

// The notification kinds the platform writes, as a word the reader knows
// rather than the internal type code.
const NOTIF_LABEL: Record<string, string> = {
  ClientMessage: "notif.type.clientMessage",
  TaskSoon: "notif.type.taskSoon",
  TaskDue: "notif.type.taskDue",
  TaskOverdue: "notif.type.taskOverdue",
  Overdue: "notif.type.taskOverdue",
  task_assigned: "notif.type.taskAssigned",
  LeadRepeat: "notif.type.leadRepeat",
  LeadNew: "notif.type.leadNew",
  LeadOwner: "notif.type.leadOwner",
  LeadStage: "notif.type.leadStage",
  LeadWon: "notif.type.leadWon",
  LeadLost: "notif.type.leadLost",
};
const NOTIF_TONE: Record<string, "danger" | "info" | "success" | "neutral"> = {
  ClientMessage: "info",
  TaskDue: "info",
  TaskOverdue: "danger",
  Overdue: "danger",
  LeadLost: "danger",
  LeadWon: "success",
  AI: "info",
  LeadRepeat: "info",
};

const FILTERS = ["All", "Unread"] as const;
const ALERT_TABS = ["all", "new", "read", "dismissed"] as const;
type AlertTab = (typeof ALERT_TABS)[number];

const TYPE_ICON: Record<AlertType, React.ComponentType<{ className?: string }>> = {
  manager_inactive: UserX,
  no_audio: MicOff,
  low_quality: TrendingDown,
  red_flag: Flag,
};

const TYPE_TONE: Record<AlertType, "warning" | "info" | "danger"> = {
  manager_inactive: "warning",
  no_audio: "info",
  low_quality: "warning",
  red_flag: "danger",
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Inbox (per-user assignment/overdue notifications) and Alerts (org-wide,
// admin-only, AI-derived risk signals) used to be two separate notification
// centers with overlapping bells pointing at each other. They're merged here
// into one route with an internal tab switch instead of two pages, since the
// only real difference is audience (everyone vs admins) and shape, not the
// underlying "things needing your attention" concept.
// Settings → Xabarlar (also the bell's "Hammasini ko'rish").
export function InboxPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const [tab, setMainTab] = useState<"notifications" | "alerts">("notifications");
  const mainTab: "notifications" | "alerts" =
    tab === "alerts" && isAdmin ? "alerts" : "notifications";

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-300">
          <Inbox className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold text-foreground">
            {mainTab === "alerts" ? t("alerts.title") : t("inbox.title")}
          </p>
          <p className="text-sm text-muted-foreground">
            {mainTab === "alerts" ? t("alerts.desc") : t("inbox.desc")}
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setMainTab("notifications")}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              mainTab === "notifications"
                ? "bg-foreground text-background"
                : "border border-border bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            {t("inbox.tabNotifications")}
          </button>
          <button
            onClick={() => setMainTab("alerts")}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              mainTab === "alerts"
                ? "bg-foreground text-background"
                : "border border-border bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            {t("inbox.tabAlerts")}
          </button>
        </div>
      )}

      {mainTab === "alerts" ? <AlertsPanel /> : <NotificationsPanel />}
    </>
  );
}

function NotificationsPanel() {
  const { t } = useI18n();
  const openLink = useOpenNotificationLink();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const { rows: notifications, isLoading } = useNotificationsView();
  const markRead = useMarkNotificationRead();

  function open(n: (typeof notifications)[number]) {
    if (n.unread) markRead.mutate(n.id);
    if (n.link) openLink(n.link);
  }

  const rows = useMemo(
    () => (filter === "Unread" ? notifications.filter((n) => n.unread) : notifications),
    [notifications, filter],
  );

  const filterLabel: Record<(typeof FILTERS)[number], string> = {
    All: t("inbox.filterAll"),
    Unread: t("inbox.filterUnread"),
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              filter === f
                ? "bg-foreground text-background"
                : "border border-border bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            {filterLabel[f]}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}

      {rows.length === 0 && !isLoading ? (
        <SectionCard>
          <p className="py-10 text-center text-sm text-muted-foreground">{t("inbox.empty")}</p>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((n) => (
            <div
              key={n.id}
              onClick={() => open(n)}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft transition-colors hover:border-primary/40",
                (n.unread || n.link) && "cursor-pointer",
                n.unread && "bg-mint/10",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <Pill tone={NOTIF_TONE[n.type] ?? "neutral"}>
                  {NOTIF_LABEL[n.type] ? t(NOTIF_LABEL[n.type]!) : n.type}
                </Pill>
                <div className="flex shrink-0 items-center gap-1.5">
                  {n.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="text-[11px] text-subtle">{n.meta}</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{n.title}</p>
                {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
              </div>
              {n.link && (
                <span className="self-start text-xs font-semibold text-primary">
                  {t("inbox.open")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function AlertsPanel() {
  const { t } = useI18n();
  const openLink = useOpenNotificationLink();
  const { alerts, isLoading } = useAlertsView();
  const markRead = useMarkAlertRead();
  const dismiss = useDismissAlert();
  const [tab, setTab] = useState<AlertTab>("all");
  const [typeFilter, setTypeFilter] = useState<AlertType | "">("");

  const tabLabel: Record<AlertTab, string> = {
    all: t("alerts.tabAll"),
    new: t("alerts.tabNew"),
    read: t("alerts.tabRead"),
    dismissed: t("alerts.tabDismissed"),
  };

  const byTab = useMemo(() => {
    return alerts.filter((a) => {
      if (tab === "dismissed") return a.dismissed;
      if (a.dismissed) return false;
      if (tab === "new") return !a.read;
      if (tab === "read") return a.read;
      return true;
    });
  }, [alerts, tab]);

  const rows = useMemo(
    () => (typeFilter ? byTab.filter((a) => a.type === typeFilter) : byTab),
    [byTab, typeFilter],
  );

  function open(a: AlertView) {
    if (!a.read) {
      markRead.mutate(a.key, {
        onError: (err) => toast.error(errorMessage(err, t("alerts.actionFailed"))),
      });
    }
    if (a.link) openLink(a.link);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {ALERT_TABS.map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                tab === tb
                  ? "bg-foreground text-background"
                  : "border border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {tabLabel[tb]}
            </button>
          ))}
        </div>
        <FilterSelect
          icon={Flag}
          label={t("alerts.typeLabel")}
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as AlertType | "")}
          className="w-56"
        >
          <option value="">{t("alerts.filterAllTypes")}</option>
          {(Object.keys(TYPE_ICON) as AlertType[]).map((tp) => (
            <option key={tp} value={tp}>
              {t(`alerts.type.${tp}`)}
            </option>
          ))}
        </FilterSelect>
      </div>

      {isLoading && (
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}

      {rows.length === 0 && !isLoading ? (
        <SectionCard>
          <p className="py-10 text-center text-sm text-muted-foreground">{t("alerts.empty")}</p>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((a) => {
            const Icon = TYPE_ICON[a.type];
            const tone = TYPE_TONE[a.type];
            const borderTone = {
              warning: "border-l-warning",
              info: "border-l-primary",
              danger: "border-l-destructive",
            }[tone];
            return (
              <div
                key={a.key}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border border-border border-l-4 bg-card p-5 shadow-soft transition-colors",
                  borderTone,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <Pill tone={tone === "info" ? "info" : tone === "danger" ? "danger" : "warning"}>
                    <Icon className="mr-1 h-3 w-3" /> {t(`alerts.type.${a.type}`)}
                  </Pill>
                  <span className="shrink-0 text-xs text-subtle">
                    {formatDateTime(a.createdAt)}
                  </span>
                </div>
                <div
                  onClick={() => open(a)}
                  className={cn("min-w-0 flex-1", a.link && "cursor-pointer")}
                >
                  <p className="text-sm font-semibold text-foreground">{a.title}</p>
                  {a.body && <p className="mt-1 text-xs text-muted-foreground">{a.body}</p>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  {a.link ? (
                    <button
                      onClick={() => open(a)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {t("inbox.open")}
                    </button>
                  ) : (
                    <span />
                  )}
                  {!a.dismissed && (
                    <button
                      onClick={() =>
                        dismiss.mutate(a.key, {
                          onError: (err) =>
                            toast.error(errorMessage(err, t("alerts.actionFailed"))),
                        })
                      }
                      className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {t("alerts.dismiss")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

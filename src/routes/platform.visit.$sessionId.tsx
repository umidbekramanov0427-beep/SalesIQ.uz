import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Bug,
  CheckCircle2,
  Eye,
  KeyRound,
  Loader2,
  LogOut,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, roleTone } from "@/lib/utils";
import { deviceIcon, durationLabel, isAlert, placeLabel, timelineLabel } from "@/lib/visit-labels";
import {
  usePlatformInsightAction,
  usePlatformVisit,
  type PlatformVisitTimelineItem,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/platform/visit/$sessionId")({
  head: () => ({ meta: [{ title: "Tashrif — SalesIQ" }] }),
  component: VisitPage,
});

const KIND_STYLE: Record<PlatformVisitTimelineItem["kind"], { icon: LucideIcon; tone: string }> = {
  page: { icon: Eye, tone: "bg-sky-500/10 text-sky-600" },
  change: { icon: CheckCircle2, tone: "bg-success/15 text-success" },
  action: { icon: Sparkles, tone: "bg-violet-500/10 text-violet-600" },
  failed: { icon: AlertTriangle, tone: "bg-destructive/10 text-destructive" },
  blocked: { icon: Ban, tone: "bg-warning/15 text-warning-foreground" },
  error: { icon: Bug, tone: "bg-destructive/10 text-destructive" },
};
const ALERT_STYLE = { icon: ShieldAlert, tone: "bg-rose-500/12 text-rose-600" };

// One visit: who, from where and what device, then everything that
// happened in it in time order -- pages, changes they made, what failed
// and what they weren't allowed to open.
function VisitPage() {
  const { sessionId } = Route.useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const { data, isLoading, error } = usePlatformVisit(sessionId);
  const close = usePlatformInsightAction();
  const [confirming, setConfirming] = useState(false);

  if (user && user.role !== "platform_owner") {
    return (
      <SectionCard icon={ShieldAlert} tone="rose" title={t("admin.restrictedTitle")}>
        <p className="text-sm text-muted-foreground">{t("admin.restrictedHint")}</p>
      </SectionCard>
    );
  }
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </p>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : t("visits.notFound")}
      </p>
    );
  }

  const v = data.session;
  const failedLogin = v.kind === "failed_login";
  const Device = failedLogin ? KeyRound : deviceIcon(v.device);
  const when = new Date(v.createdAt);
  const facts: [string, string | null | undefined][] = [
    [t("visits.when"), when.toLocaleString()],
    [t("visits.duration"), failedLogin ? null : durationLabel(v.createdAt, v.lastSeenAt, t)],
    [t("visits.device"), v.device],
    [t("visits.place"), placeLabel(v)],
    ["IP", v.ip],
    [
      t("visits.company"),
      v.org ? `${v.org.name} · ${v.org.trial ? t("visits.trial") : t("visits.paid")}` : null,
    ],
    ["Email", failedLogin ? v.emailAttempted : v.user?.email],
  ];

  return (
    <>
      <PageHeader
        icon={Device}
        tone={failedLogin ? "rose" : "violet"}
        title={failedLogin ? t("visits.failedLogin") : (v.user?.name ?? t("visits.unknownUser"))}
        {...(v.userAgent ? { description: v.userAgent } : {})}
      />

      {!failedLogin && v.user && (
        <div
          className={cn(
            "mb-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3.5",
            v.revokedAt ? "border-border" : "border-destructive/30",
          )}
        >
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
              v.revokedAt ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive",
            )}
          >
            <LogOut className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {v.revokedAt
                ? t("visits.closedAt", { when: new Date(v.revokedAt).toLocaleString() })
                : v.online
                  ? t("visits.onlineNowShort")
                  : t("visits.closeTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {v.revokedAt
                ? t("visits.closedHint")
                : data.authSessionKnown
                  ? t("visits.closeHint")
                  : t("visits.closeAllHint")}
            </p>
          </div>
          {!v.revokedAt &&
            (confirming ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-9 rounded-xl border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={close.isPending}
                  onClick={() =>
                    close.mutate(
                      { action: "close", id: v.id },
                      {
                        onSuccess: (r) => {
                          setConfirming(false);
                          toast.success(
                            r.scope === "all" ? t("visits.closedAll") : t("visits.closedOne"),
                          );
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-destructive px-3 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {close.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("visits.closeConfirm")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-destructive/40 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-3.5 w-3.5" /> {t("visits.close")}
              </button>
            ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] phone:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <SectionCard title={t("visits.about")}>
          {v.user && (
            <div className="mb-3">
              <Pill tone={v.user.isIntern ? "info" : roleTone(v.user.role)}>
                {v.user.isIntern ? t("mentor.internBadge") : v.user.role}
              </Pill>
            </div>
          )}
          <dl className="divide-y divide-border text-sm">
            {facts
              .filter(([, value]) => value)
              .map(([k, value]) => (
                <div key={k} className="py-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    {k}
                  </dt>
                  <dd className="mt-0.5 break-words text-foreground">{value}</dd>
                </div>
              ))}
          </dl>
          {v.org && (
            <div className="mt-3 flex flex-col items-start gap-1.5">
              <Link
                to="/platform/usage/$orgId"
                params={{ orgId: v.org.id }}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <BarChart3 className="h-4 w-4" /> {t("visits.usageLink")}
              </Link>
              <Link
                to="/platform/organizations/$orgId"
                params={{ orgId: v.org.id }}
                className="text-sm font-semibold text-primary hover:underline"
              >
                {t("pint.openCompany")}
              </Link>
            </div>
          )}
        </SectionCard>

        <SectionCard title={t("visits.timeline")} description={t("visits.timelineDesc")}>
          {data.timeline.length === 0 ? (
            <p className="text-sm text-subtle">
              {failedLogin ? t("visits.failedLoginNote") : t("visits.timelineEmpty")}
            </p>
          ) : (
            <ol className="relative space-y-0">
              {data.timeline.map((item, i) => {
                const style =
                  item.kind === "action" && isAlert(item.label)
                    ? ALERT_STYLE
                    : (KIND_STYLE[item.kind] ?? KIND_STYLE.action);
                const Icon = style.icon;
                return (
                  <li key={i} className="flex gap-3 border-b border-border py-2.5 last:border-0">
                    <span className="w-14 shrink-0 pt-1 font-mono text-[11px] tabular-nums text-subtle">
                      {new Date(item.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                        style.tone,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm text-foreground">
                        {timelineLabel(item, t)}
                      </p>
                      <p className="text-[11px] text-subtle">
                        {item.kind === "action" && isAlert(item.label)
                          ? t("visits.kind.alert")
                          : t(`visits.kind.${item.kind}`)}
                        {item.path && item.kind !== "page" ? ` · ${item.path}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </SectionCard>
      </div>
    </>
  );
}

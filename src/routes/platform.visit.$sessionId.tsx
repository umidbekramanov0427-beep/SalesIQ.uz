import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bug,
  CheckCircle2,
  Eye,
  KeyRound,
  Loader2,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, roleTone } from "@/lib/utils";
import { deviceIcon, durationLabel, placeLabel, timelineLabel } from "@/lib/visit-labels";
import { usePlatformVisit, type PlatformVisitTimelineItem } from "@/hooks/use-crm-data";

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

// One visit: who, from where and what device, then everything that
// happened in it in time order -- pages, changes they made, what failed
// and what they weren't allowed to open.
function VisitPage() {
  const { sessionId } = Route.useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const { data, isLoading, error } = usePlatformVisit(sessionId);

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
        actions={
          <Link
            to="/platform/sessions"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {t("nav./platform/sessions")}
          </Link>
        }
      />

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
            <Link
              to="/platform/organizations/$orgId"
              params={{ orgId: v.org.id }}
              className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
            >
              {t("pint.openCompany")}
            </Link>
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
                const style = KIND_STYLE[item.kind] ?? KIND_STYLE.action;
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
                        {t(`visits.kind.${item.kind}`)}
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

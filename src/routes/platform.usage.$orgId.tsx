import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarDays,
  CircleOff,
  FileSpreadsheet,
  Loader2,
  LogIn,
  MousePointerClick,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, roleTone } from "@/lib/utils";
import { actionLabel, featureUsage, sectionUsage } from "@/lib/visit-labels";
import { downloadXlsx } from "@/lib/xlsx-write";
import { usePlatformOrgUsage, type PlatformOrgUsage } from "@/hooks/use-crm-data";

export const Route = createFileRoute("/platform/usage/$orgId")({
  head: () => ({ meta: [{ title: "Foydalanish tahlili — SalesIQ" }] }),
  component: UsagePage,
});

// One company's use of the platform over the last 30 days, for the
// platform owner: daily sign-ins, the sections it uses most, the features
// it has never opened (what to teach it) and how active each person is.
function UsagePage() {
  const { orgId } = Route.useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const { data, isLoading, error } = usePlatformOrgUsage(orgId);

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

  const sections = sectionUsage(data.pages, t);
  const features = featureUsage(data.pages, data.actions);
  const unused = features.filter((f) => f.count === 0);
  const totalSessions = data.daily.reduce((n, d) => n + d.sessions, 0);
  const activeDays = data.daily.filter((d) => d.sessions > 0).length;
  const activePeople = data.employees.filter((e) => e.sessions > 0).length;
  const work =
    data.actions.reduce((n, a) => n + a.count, 0) +
    data.employees.reduce((n, e) => n + e.changes, 0);

  const stats: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: LogIn, label: t("visits.usage.signIns"), value: String(totalSessions) },
    {
      icon: CalendarDays,
      label: t("visits.usage.activeDays"),
      value: `${activeDays} / ${data.days}`,
    },
    {
      icon: Users,
      label: t("visits.usage.activePeople"),
      value: `${activePeople} / ${data.employees.length}`,
    },
    { icon: MousePointerClick, label: t("visits.usage.work"), value: String(work) },
  ];

  return (
    <>
      <PageHeader
        icon={BarChart3}
        tone="violet"
        title={data.org.name}
        description={t("visits.usage.desc", { n: String(data.days) })}
        actions={
          <>
            <button
              type="button"
              onClick={() => exportUsage(data, sections, features, t)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <FileSpreadsheet className="h-4 w-4" /> {t("visits.excel")}
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Pill
          tone={
            data.org.phase === "paid"
              ? "success"
              : data.org.phase === "trial"
                ? "warning"
                : "danger"
          }
        >
          {t(`visits.phase.${data.org.phase}`)}
        </Pill>
        <span>
          {t("visits.signedUpOn", { date: new Date(data.org.createdAt).toLocaleDateString() })}
        </span>
        <Link
          to="/platform/organizations/$orgId"
          params={{ orgId: data.org.id }}
          className="font-semibold text-primary hover:underline"
        >
          {t("pint.openCompany")}
        </Link>
      </div>

      <div className="phone-joined grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <SectionCard
        className="mt-4"
        title={t("visits.usage.daily")}
        description={t("visits.usage.dailyDesc")}
      >
        <DailyChart daily={data.daily} />
      </SectionCard>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t("visits.usage.sections")}
          description={t("visits.usage.sectionsDesc")}
        >
          {sections.length === 0 ? (
            <p className="text-sm text-subtle">{t("visits.usage.noPages")}</p>
          ) : (
            <ul className="space-y-2.5">
              {sections.slice(0, 10).map((s) => (
                <li key={s.label}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-foreground">{s.label}</span>
                    <span className="tabular-nums text-muted-foreground">{s.count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${(s.count / sections[0]!.count) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={t("visits.usage.features")}
          description={t("visits.usage.featuresDesc")}
        >
          {unused.length > 0 && (
            <div className="mb-3 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-foreground">
                <CircleOff className="h-3.5 w-3.5" /> {t("visits.usage.neverOpened")}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unused.map((f) => (
                  <span
                    key={f.key}
                    className="rounded-lg bg-card px-2 py-1 text-[11px] font-semibold text-foreground"
                  >
                    {t(`visits.feature.${f.key}`)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <ul className="divide-y divide-border text-sm">
            {features
              .filter((f) => f.count > 0)
              .sort((a, b) => b.count - a.count)
              .map((f) => (
                <li key={f.key} className="flex items-center justify-between py-1.5">
                  <span className="text-foreground">{t(`visits.feature.${f.key}`)}</span>
                  <span className="tabular-nums text-muted-foreground">{f.count}</span>
                </li>
              ))}
          </ul>
          {data.actions.length > 0 && (
            <>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                {t("visits.usage.actions")}
              </p>
              <ul className="mt-1 divide-y divide-border text-sm">
                {data.actions.map((a) => (
                  <li key={a.label} className="flex items-center justify-between py-1.5">
                    <span className="text-foreground">{actionLabel(a.label, t)}</span>
                    <span className="tabular-nums text-muted-foreground">{a.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      </div>

      <SectionCard
        className="mt-4"
        title={t("visits.usage.people")}
        description={t("visits.usage.peopleDesc")}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-subtle">
                <th className="py-2 pr-3 font-semibold">{t("visits.user")}</th>
                <th className="px-2 py-2 text-right font-semibold">{t("visits.usage.signIns")}</th>
                <th className="px-2 py-2 text-right font-semibold">{t("visits.pages")}</th>
                <th className="px-2 py-2 text-right font-semibold">{t("visits.usage.changes")}</th>
                <th className="py-2 pl-2 text-right font-semibold">{t("visits.lastSeenCol")}</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((e) => {
                const max = Math.max(1, ...data.employees.map((x) => x.sessions + x.changes));
                return (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-foreground">{e.name}</span>
                        <Pill tone={e.isIntern ? "info" : roleTone(e.role)}>
                          {e.isIntern ? t("mentor.internBadge") : e.role}
                        </Pill>
                      </div>
                      <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-violet-500"
                          style={{ width: `${((e.sessions + e.changes) / max) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{e.sessions}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{e.pages}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{e.changes}</td>
                    <td
                      className={cn(
                        "py-2 pl-2 text-right text-xs",
                        e.lastSeenAt ? "text-muted-foreground" : "text-destructive",
                      )}
                    >
                      {e.lastSeenAt
                        ? new Date(e.lastSeenAt).toLocaleDateString()
                        : t("visits.neverSignedIn")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

// Sign-ins per day: one bar per day on the Tashkent calendar, the day's
// count and distinct people in a hover tooltip.
function DailyChart({ daily }: { daily: PlatformOrgUsage["daily"] }) {
  const { t } = useI18n();
  const max = Math.max(1, ...daily.map((d) => d.sessions));
  const short = (date: string) => {
    const [, m, d] = date.split("-");
    return `${d}.${m}`;
  };
  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="flex h-40 flex-col justify-between py-0.5 text-right text-[10px] tabular-nums text-subtle">
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative flex h-40 flex-1 items-end gap-[2px] border-b border-l border-border">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border/70" />
          {daily.map((d) => (
            <div key={d.date} className="group relative flex h-full flex-1 items-end">
              <div
                className={cn(
                  "w-full rounded-t-[4px] transition-colors",
                  d.sessions ? "bg-violet-500 group-hover:bg-violet-600" : "bg-transparent",
                )}
                style={{ height: `${(d.sessions / max) * 100}%`, minHeight: d.sessions ? 3 : 0 }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md group-hover:block">
                <b>{short(d.date)}</b> · {t("visits.usage.tipSignIns", { n: String(d.sessions) })}
                {" · "}
                {t("visits.usage.tipPeople", { n: String(d.users) })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="ml-8 mt-1 flex justify-between text-[10px] tabular-nums text-subtle">
        {daily
          .filter((_, i) => i % 7 === 0 || i === daily.length - 1)
          .map((d) => (
            <span key={d.date}>{short(d.date)}</span>
          ))}
      </div>
    </div>
  );
}

type T = (key: string, vars?: Record<string, string>) => string;

function exportUsage(
  data: PlatformOrgUsage,
  sections: { label: string; count: number }[],
  features: { key: string; count: number }[],
  t: T,
) {
  downloadXlsx(`${data.org.name}-foydalanish-${new Date().toISOString().slice(0, 10)}`, [
    {
      name: t("visits.usage.daily"),
      rows: [
        [t("visits.when"), t("visits.usage.signIns"), t("visits.usersCol")],
        ...data.daily.map((d) => [d.date, d.sessions, d.users]),
      ],
    },
    {
      name: t("visits.usage.sections"),
      rows: [
        [t("visits.usage.section"), t("visits.usage.opens")],
        ...sections.map((s) => [s.label, s.count]),
      ],
    },
    {
      name: t("visits.usage.features"),
      rows: [
        [t("visits.usage.feature"), t("visits.usage.uses")],
        ...features.map((f) => [t(`visits.feature.${f.key}`), f.count]),
      ],
    },
    {
      name: t("visits.usage.people"),
      rows: [
        [
          t("visits.user"),
          "Email",
          t("visits.role"),
          t("visits.usage.signIns"),
          t("visits.pages"),
          t("visits.usage.changes"),
          t("visits.lastSeenCol"),
        ],
        ...data.employees.map((e) => [
          e.name,
          e.email,
          e.role,
          e.sessions,
          e.pages,
          e.changes,
          e.lastSeenAt ? new Date(e.lastSeenAt).toLocaleString() : "",
        ]),
      ],
    },
  ]);
}

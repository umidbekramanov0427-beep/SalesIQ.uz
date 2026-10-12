import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Eye,
  FileSpreadsheet,
  History,
  KeyRound,
  Loader2,
  LogOut,
  MapPin,
  MonitorSmartphone,
  MousePointerClick,
  Route as RouteIcon,
  Search,
  ShieldAlert,
  Sprout,
  Timer,
} from "lucide-react";
import { OnlineNow } from "@/components/platform/OnlineNow";
import { TrialsPanel } from "@/components/platform/TrialsPanel";
import { FunnelPanel } from "@/components/platform/FunnelPanel";
import { ActivityLogPanel } from "@/components/platform/ActivityLogPanel";
import { downloadXlsx } from "@/lib/xlsx-write";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, roleTone } from "@/lib/utils";
import { deviceIcon, durationLabel, placeLabel } from "@/lib/visit-labels";
import {
  useOrganizations,
  usePlatformVisits,
  type PlatformFunnelCompany,
  type PlatformTrialHealth,
  type PlatformVisit,
  type PlatformVisitFilters,
} from "@/hooks/use-crm-data";

type Tab = "visits" | "trials" | "funnel" | "activity";

export const Route = createFileRoute("/platform/sessions")({
  head: () => ({ meta: [{ title: "Tashriflar — SalesIQ" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    search["tab"] === "trials" || search["tab"] === "funnel" || search["tab"] === "activity"
      ? { tab: search["tab"] }
      : {},
  component: PlatformSessionsPage,
});

const stamp = () => new Date().toISOString().slice(0, 10);

// The platform owner's visits report, in three tabs:
//   - Visits: who is online now, then every sign-in (trial and paying
//     companies alike) as a card -- device, person, company, place, time and
//     how much happened; a card opens that visit's full timeline;
//   - On trial: engagement score per trial company (whom to call);
//   - Customer path: how far companies got, sign-up to payment;
//   - Activity log: every company's data changes.
function PlatformSessionsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const tab: Tab = Route.useSearch().tab ?? "visits";
  const navigate = Route.useNavigate();
  const { data: orgs } = useOrganizations();
  const [filters, setFilters] = useState<PlatformVisitFilters>({
    org: "",
    type: "all",
    days: 7,
    q: "",
  });
  const [search, setSearch] = useState("");
  const visits = usePlatformVisits(filters);

  if (user && user.role !== "platform_owner") {
    return (
      <SectionCard
        icon={ShieldAlert}
        tone="rose"
        title={t("admin.restrictedTitle")}
        description={t("admin.restrictedDesc")}
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  const sessions = visits.data?.pages.flatMap((p) => p.sessions) ?? [];
  const types: { id: PlatformVisitFilters["type"]; label: string }[] = [
    { id: "all", label: t("visits.typeAll") },
    { id: "trial", label: t("visits.typeTrial") },
    { id: "paid", label: t("visits.typePaid") },
    { id: "failed", label: t("visits.typeFailed") },
  ];
  const periods: PlatformVisitFilters["days"][] = [1, 7, 30];
  const tabs: { id: Tab; label: string; hint: string; icon: typeof Eye }[] = [
    { id: "visits", label: t("visits.tabVisits"), hint: t("visits.tabVisitsHint"), icon: Eye },
    { id: "trials", label: t("visits.tabTrials"), hint: t("visits.tabTrialsHint"), icon: Sprout },
    {
      id: "funnel",
      label: t("visits.tabFunnel"),
      hint: t("visits.tabFunnelHint"),
      icon: RouteIcon,
    },
    {
      id: "activity",
      label: t("visits.tabActivity"),
      hint: t("visits.tabActivityHint"),
      icon: History,
    },
  ];

  const exportVisits = (rows: PlatformVisit[]) =>
    downloadXlsx(`tashriflar-${stamp()}`, [
      {
        name: t("visits.tabVisits"),
        rows: [
          [
            t("visits.when"),
            t("visits.user"),
            "Email",
            t("visits.role"),
            t("visits.company"),
            t("visits.status"),
            t("visits.device"),
            t("visits.place"),
            "IP",
            t("visits.duration"),
            t("visits.pages"),
            t("visits.actions"),
            t("visits.failedActions"),
            t("visits.blocked"),
            t("visits.alerts"),
          ],
          ...rows.map((v) => [
            new Date(v.createdAt).toLocaleString(),
            v.kind === "failed_login" ? t("visits.failedLogin") : (v.user?.name ?? ""),
            v.kind === "failed_login" ? v.emailAttempted : v.user?.email,
            v.user?.role,
            v.org?.name,
            v.org
              ? v.org.frozen
                ? t("orgcard.frozen")
                : v.org.trial
                  ? t("visits.trial")
                  : t("visits.paid")
              : "",
            v.device,
            placeLabel(v),
            v.ip,
            v.kind === "failed_login" ? "" : durationLabel(v.createdAt, v.lastSeenAt, t),
            v.counts?.pages ?? 0,
            v.counts?.actions ?? 0,
            v.counts?.failed ?? 0,
            v.counts?.blocked ?? 0,
            v.counts?.alerts ?? 0,
          ]),
        ],
      },
    ]);

  const exportTrials = (rows: PlatformTrialHealth[]) =>
    downloadXlsx(`sinovdagilar-${stamp()}`, [
      {
        name: t("visits.tabTrials"),
        rows: [
          [
            t("visits.company"),
            t("visits.score"),
            t("visits.tempCol"),
            t("visits.daysLeftCol"),
            t("visits.signIns7dCol"),
            t("visits.activeUsersCol"),
            t("visits.usersCol"),
            t("visits.leadsCol"),
            t("visits.integrationsCol"),
            t("visits.lastSeenCol"),
            t("visits.gapsCol"),
          ],
          ...rows.map((x) => [
            x.org.name,
            x.score,
            t(`visits.temp.${x.temp}`),
            x.daysLeft,
            x.sessions7d,
            x.activeUsers7d,
            x.users,
            x.leads,
            x.integrations.join(", "),
            x.lastSeenAt ? new Date(x.lastSeenAt).toLocaleString() : "",
            x.gaps.map((g) => t(`visits.gap.${g}`)).join(", "),
          ]),
        ],
      },
    ]);

  const exportFunnel = (rows: PlatformFunnelCompany[]) =>
    downloadXlsx(`mijoz-yoli-${stamp()}`, [
      {
        name: t("visits.tabFunnel"),
        rows: [
          [
            t("visits.company"),
            t("visits.signedUpCol"),
            t("visits.status"),
            ...(["signed_up", "bot_linked", "first_lead", "integration", "paid"] as const).map(
              (s) => t(`visits.step.${s}`),
            ),
            t("visits.stoppedAtCol"),
          ],
          ...rows.map((c) => [
            c.name,
            new Date(c.createdAt).toLocaleDateString(),
            c.frozen ? t("orgcard.frozen") : t(`visits.phase.${c.phase}`),
            ...(["signed_up", "bot_linked", "first_lead", "integration", "paid"] as const).map(
              (s) => (c.done[s] ? "✓" : ""),
            ),
            c.stoppedAt ? t(`visits.step.${c.stoppedAt}`) : t("visits.allDone"),
          ]),
        ],
      },
    ]);

  return (
    <>
      <PageHeader
        icon={MonitorSmartphone}
        tone="violet"
        title={t("nav./platform/sessions")}
        description={t("visits.desc")}
      />

      <div className="phone-joined mb-4 grid grid-cols-3 gap-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() =>
              void navigate({ search: x.id === "visits" ? {} : { tab: x.id }, replace: true })
            }
            className={cn(
              "flex min-w-0 items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left transition-colors",
              tab === x.id
                ? "border-primary/50 bg-primary/8 ring-1 ring-primary/30"
                : "border-border bg-card hover:bg-accent/40",
            )}
          >
            <span
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                tab === x.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted-foreground",
              )}
            >
              <x.icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {x.label}
              </span>
              <span className="block truncate text-[11px] text-subtle phone:hidden">{x.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {tab === "trials" && <TrialsPanel onExport={exportTrials} />}
      {tab === "funnel" && <FunnelPanel onExport={exportFunnel} />}
      {tab === "activity" && <ActivityLogPanel />}
      {tab === "visits" && (
        <>
          <OnlineNow />

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFilters((f) => ({ ...f, q: search }));
              }}
              className="relative min-w-[220px] flex-1 phone:basis-full"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => setFilters((f) => ({ ...f, q: search }))}
                placeholder={t("visits.search")}
                className="h-9 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary/50"
              />
            </form>
            <select
              value={filters.org}
              onChange={(e) => setFilters((f) => ({ ...f, org: e.target.value }))}
              className="h-9 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none phone:basis-full"
            >
              <option value="">{t("visits.allCompanies")}</option>
              {(orgs ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              {types.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, type: x.id }))}
                  className={cn(
                    "h-9 rounded-xl px-3 text-xs font-semibold transition-colors",
                    filters.type === x.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {periods.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, days: d }))}
                  className={cn(
                    "h-9 rounded-xl px-3 text-xs font-semibold transition-colors",
                    filters.days === d
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {t(`visits.days${d}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!sessions.length}
              onClick={() => exportVisits(sessions)}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> {t("visits.excel")}
            </button>
          </div>

          <div className="mt-4">
            {visits.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
              </p>
            ) : visits.error ? (
              <p className="text-sm text-destructive">
                {visits.error instanceof Error ? visits.error.message : String(visits.error)}
              </p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-subtle">{t("visits.empty")}</p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 phone:grid-cols-2">
                  {sessions.map((s) => (
                    <VisitCard key={s.id} visit={s} />
                  ))}
                </div>
                {visits.hasNextPage && (
                  <button
                    type="button"
                    onClick={() => void visits.fetchNextPage()}
                    disabled={visits.isFetchingNextPage}
                    className="mx-auto mt-4 flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-60"
                  >
                    {visits.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("visits.more")}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

function VisitCard({ visit: v }: { visit: PlatformVisit }) {
  const { t } = useI18n();
  const failedLogin = v.kind === "failed_login";
  const Device = deviceIcon(v.device);
  const place = placeLabel(v);
  const when = new Date(v.createdAt);
  const c = v.counts ?? { pages: 0, actions: 0, failed: 0, blocked: 0 };
  const alerts = c.alerts ?? 0;

  return (
    <Link
      to="/platform/visit/$sessionId"
      params={{ sessionId: v.id }}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-accent/30",
        failedLogin || alerts > 0 ? "border-destructive/40" : "border-border",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "relative grid h-10 w-10 shrink-0 place-items-center rounded-xl",
            failedLogin ? "bg-destructive/10 text-destructive" : "bg-violet-500/10 text-violet-600",
          )}
        >
          {failedLogin ? <KeyRound className="h-5 w-5" /> : <Device className="h-5 w-5" />}
          {v.online && (
            <span
              title={t("visits.online")}
              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-card"
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {failedLogin ? t("visits.failedLogin") : (v.user?.name ?? t("visits.unknownUser"))}
          </p>
          <p className="truncate text-xs text-subtle">
            {failedLogin ? v.emailAttempted : v.user?.email}
          </p>
        </div>
        {v.user && (
          <Pill tone={v.user.isIntern ? "info" : roleTone(v.user.role)}>
            {v.user.isIntern ? t("mentor.internBadge") : v.user.role}
          </Pill>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {v.org ? (
          <>
            <span className="max-w-[60%] truncate text-xs font-semibold text-foreground">
              {v.org.name}
            </span>
            <Pill tone={v.org.frozen ? "info" : v.org.trial ? "warning" : "success"}>
              {v.org.frozen
                ? t("orgcard.frozen")
                : v.org.trial
                  ? t("visits.trial")
                  : t("visits.paid")}
            </Pill>
          </>
        ) : (
          <span className="text-xs text-subtle">{t("visits.noCompany")}</span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-3 text-xs">
        <Fact
          icon={CalendarClock}
          text={`${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
        />
        <Fact icon={MonitorSmartphone} text={v.device ?? "—"} />
        <Fact icon={MapPin} text={place ?? "—"} />
        <Fact icon={Timer} text={failedLogin ? "—" : durationLabel(v.createdAt, v.lastSeenAt, t)} />
        <p className="col-span-2 truncate font-mono text-[11px] text-subtle">IP: {v.ip ?? "—"}</p>
      </dl>

      {!failedLogin && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Count icon={Eye} n={c.pages} label={t("visits.pages")} />
          <Count icon={MousePointerClick} n={c.actions} label={t("visits.actions")} />
          {c.failed > 0 && (
            <Count icon={AlertTriangle} n={c.failed} label={t("visits.failedActions")} danger />
          )}
          {c.blocked > 0 && <Count icon={Ban} n={c.blocked} label={t("visits.blocked")} danger />}
          {alerts > 0 && <Count icon={ShieldAlert} n={alerts} label={t("visits.alerts")} danger />}
          {v.revokedAt && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              <LogOut className="h-3 w-3" /> {t("visits.closed")}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function Fact({ icon: Icon, text }: { icon: typeof Eye; text: string }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0 text-subtle" />
      <span className="truncate">{text}</span>
    </p>
  );
}

function Count({
  icon: Icon,
  n,
  label,
  danger,
}: {
  icon: typeof Eye;
  n: number;
  label: string;
  danger?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold",
        danger ? "bg-destructive/10 text-destructive" : "bg-surface text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" /> {n} {label}
    </span>
  );
}

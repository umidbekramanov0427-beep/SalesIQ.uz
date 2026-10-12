import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Eye,
  KeyRound,
  Loader2,
  MapPin,
  MonitorSmartphone,
  MousePointerClick,
  Search,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, roleTone } from "@/lib/utils";
import { deviceIcon, durationLabel, placeLabel } from "@/lib/visit-labels";
import {
  useOrganizations,
  usePlatformVisits,
  type PlatformVisit,
  type PlatformVisitFilters,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/platform/sessions")({
  head: () => ({ meta: [{ title: "Tashriflar — SalesIQ" }] }),
  component: PlatformSessionsPage,
});

// Every sign-in to the platform (trial and paying companies alike) as a
// card: device, person, company, place, time and how much happened.
// Clicking a card opens that visit's full timeline.
function PlatformSessionsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
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

  return (
    <>
      <PageHeader
        icon={MonitorSmartphone}
        tone="violet"
        title={t("nav./platform/sessions")}
        description={t("visits.desc")}
      />

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
  );
}

function VisitCard({ visit: v }: { visit: PlatformVisit }) {
  const { t } = useI18n();
  const failedLogin = v.kind === "failed_login";
  const Device = deviceIcon(v.device);
  const place = placeLabel(v);
  const when = new Date(v.createdAt);
  const c = v.counts ?? { pages: 0, actions: 0, failed: 0, blocked: 0 };

  return (
    <Link
      to="/platform/visit/$sessionId"
      params={{ sessionId: v.id }}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-accent/30",
        failedLogin ? "border-destructive/40" : "border-border",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
            failedLogin ? "bg-destructive/10 text-destructive" : "bg-violet-500/10 text-violet-600",
          )}
        >
          {failedLogin ? <KeyRound className="h-5 w-5" /> : <Device className="h-5 w-5" />}
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

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BellRing,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Inbox,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { OwnerEmpty, OwnerHeader, OwnerPanel, OwnerStat } from "@/components/owner/OwnerPage";
import { useI18n } from "@/lib/i18n";
import { timeAgo, describeError } from "@/lib/utils";
import {
  useErrorLogsRaw,
  useOrganizations,
  useSubscriptionRequestsRaw,
  useResolveSubscriptionRequest,
} from "@/hooks/use-crm-data";

// Owner panel → So'rovlar: what is waiting for the owner. Renewal requests
// from companies (Billing → "Uzaytirish so'rovini yuborish", also sent to
// the owner's Telegram) with "Hal qilindi", and a feed of new companies and
// unresolved errors. The menu item shows the number of open requests.

const NEW_ORG_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export const Route = createFileRoute("/platform/notifications")({
  head: () => ({ meta: [{ title: "So'rovlar — SalesIQ Owner" }] }),
  component: OwnerRequestsPage,
});

function OwnerRequestsPage() {
  const { t } = useI18n();
  const { data: requests, isLoading } = useSubscriptionRequestsRaw();
  const resolve = useResolveSubscriptionRequest();
  const { data: errors } = useErrorLogsRaw({ orderBy: "created_at", ascending: false });
  const { data: orgs } = useOrganizations();

  const all = requests ?? [];
  const pending = all.filter((r) => r.status === "pending");
  const resolvedMonth = all.filter(
    (r) =>
      r.status !== "pending" &&
      r.resolved_at &&
      Date.now() - new Date(r.resolved_at).getTime() < MONTH_MS,
  ).length;
  const unresolvedErrors = (errors ?? []).filter((e) => !e.resolved);
  const recentOrgs = (orgs ?? []).filter(
    (o) => Date.now() - new Date(o.created_at).getTime() < NEW_ORG_WINDOW_MS,
  );

  const feed = [
    ...unresolvedErrors.slice(0, 20).map((e) => ({
      id: `err-${e.id}`,
      icon: AlertTriangle,
      tone: "text-rose-500",
      text: `${t("platform.notifNewError")}: ${e.message}`,
      at: e.created_at,
    })),
    ...recentOrgs.map((o) => ({
      id: `org-${o.id}`,
      icon: Building2,
      tone: "text-sky-500",
      text: `${t("platform.notifNewOrg")}: ${o.name}`,
      at: o.created_at,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  async function markResolved(id: string) {
    try {
      await resolve.mutateAsync(id);
      toast.success(t("trial.requestResolved"));
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    }
  }

  return (
    <div className="w-full">
      <OwnerHeader icon={BellRing} title={t("or.title")} desc={t("or.desc")} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OwnerStat
          icon={Clock}
          tone="amber"
          label={t("or.pending")}
          tipKey="or.pending"
          value={pending.length}
        />
        <OwnerStat
          icon={CheckCircle2}
          tone="green"
          label={t("or.resolvedMonth")}
          tipKey="or.resolvedMonth"
          value={resolvedMonth}
        />
        <OwnerStat
          icon={Building2}
          tone="blue"
          label={t("or.newOrgs")}
          tipKey="or.newOrgs"
          value={recentOrgs.length}
          note={t("or.last7")}
        />
        <OwnerStat
          icon={AlertTriangle}
          tone="rose"
          label={t("or.errors")}
          tipKey="or.errors"
          value={unresolvedErrors.length}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <OwnerPanel
          title={t("trial.pendingRequestsTitle")}
          info={t("trial.pendingRequestsDesc")}
          flush
        >
          {isLoading ? (
            <div className="grid place-items-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : pending.length === 0 ? (
            <OwnerEmpty
              icon={Inbox}
              title={t("trial.noPendingRequests")}
              hint={t("or.emptyHint")}
            />
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-300">
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/platform/organizations/$orgId"
                      params={{ orgId: r.organization_id }}
                      className="block truncate text-[13.5px] font-semibold text-foreground hover:text-primary"
                    >
                      {r.organizations?.name ?? "—"}
                    </Link>
                    <p className="truncate text-[12px] text-subtle">
                      {timeAgo(r.created_at)}
                      {r.note ? ` · ${r.note}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void markResolved(r.id)}
                    disabled={resolve.isPending}
                    className="h-8 shrink-0 rounded-lg bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
                  >
                    {t("trial.markResolved")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </OwnerPanel>

        <OwnerPanel title={t("or.feed")} flush>
          {feed.length === 0 ? (
            <OwnerEmpty icon={BellRing} title={t("platform.noNotifications")} />
          ) : (
            <ul className="max-h-[520px] divide-y divide-border overflow-y-auto">
              {feed.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-4 py-2.5">
                  <item.icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.tone}`} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] text-foreground">{item.text}</p>
                    <p className="text-[11.5px] text-subtle">{timeAgo(item.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </OwnerPanel>
      </div>
    </div>
  );
}

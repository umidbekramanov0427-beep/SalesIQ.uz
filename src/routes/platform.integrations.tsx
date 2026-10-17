import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  History,
  Loader2,
  MessageSquareText,
  Pause,
  Pencil,
  Phone,
  Play,
  Plug,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unplug,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill, StatCard } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, timeAgo } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  getTelephonyProviderMeta,
  isTelephonyProvider,
  type TelephonyFieldKey,
} from "@/lib/telephony/provider-meta";
import {
  usePlatformIntegrationAction,
  usePlatformIntegrationsOverview,
  usePlatformSetAmoCrmCredentials,
  type PlatformIntegrationAction,
  type PlatformIntegrationsCompany,
  type PlatformSyncLog,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/platform/integrations")({
  // ?org=<id> opens with that company's card first (from its company page).
  validateSearch: (search: Record<string, unknown>): { org?: string } =>
    typeof search["org"] === "string" ? { org: search["org"] } : {},
  head: () => ({
    meta: [{ title: "Integrations — SalesIQ" }],
  }),
  component: PlatformIntegrationsPage,
});

type Kind = PlatformIntegrationAction["kind"];
type Filter = "all" | "connected" | "problems" | "paused";

function counts(c: PlatformIntegrationsCompany) {
  const connected =
    (c.amocrm ? 1 : 0) +
    (c.bitrix24 ? 1 : 0) +
    c.telephony.length +
    (c.sms ? 1 : 0) +
    c.webhooks.length;
  const problems = (c.amocrm?.last_sync_error ? 1 : 0) + (c.bitrix24?.last_sync_error ? 1 : 0);
  return { connected, problems, paused: c.pauses.length };
}

function PlatformIntegrationsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { org: focus } = Route.useSearch();
  const { data, isLoading, error } = usePlatformIntegrationsOverview();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const companies = useMemo(() => {
    const list = (data ?? []).filter((c) => {
      if (query.trim() && !c.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
      const n = counts(c);
      if (filter === "connected") return n.connected > 0;
      if (filter === "problems") return n.problems > 0;
      if (filter === "paused") return n.paused > 0;
      return true;
    });
    // The company opened from its own page comes first.
    return focus ? [...list].sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0)) : list;
  }, [data, query, filter, focus]);

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

  const totals = (data ?? []).reduce(
    (acc, c) => {
      const n = counts(c);
      return {
        connected: acc.connected + n.connected,
        problems: acc.problems + n.problems,
        paused: acc.paused + n.paused,
      };
    },
    { connected: 0, problems: 0, paused: 0 },
  );

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: t("pint.filterAll") },
    { id: "connected", label: t("pint.filterConnected") },
    { id: "problems", label: t("pint.filterProblems") },
    { id: "paused", label: t("pint.filterPaused") },
  ];

  return (
    <>
      <PageHeader
        icon={Plug}
        tone="sky"
        title={t("platform.integrationsTitle")}
        description={t("pint.desc")}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t("pint.statCompanies")}
          value={String(data?.length ?? 0)}
          icon={Building2}
          iconTone="primary"
        />
        <StatCard
          label={t("pint.statConnected")}
          value={String(totals.connected)}
          icon={Plug}
          iconTone="emerald"
        />
        <StatCard
          label={t("pint.statProblems")}
          value={String(totals.problems)}
          icon={AlertTriangle}
          iconTone="rose"
        />
        <StatCard
          label={t("pint.statPaused")}
          value={String(totals.paused)}
          icon={Pause}
          iconTone="amber"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 phone:basis-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("pint.search")}
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary/50"
          />
        </div>
        <div className="phone-joined inline-flex gap-1 rounded-xl border border-border bg-card p-1 phone:w-full">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            {t("platform.loadFailed")}: {error instanceof Error ? error.message : String(error)}
          </p>
        ) : companies.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-subtle">
            <Plug className="h-4 w-4" /> {t("platform.noOrgs")}
          </p>
        ) : (
          companies.map((c) => <CompanyIntegrations key={c.id} company={c} />)
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

type Status = "connected" | "error" | "paused" | "off";

function StatusPill({ status }: { status: Status }) {
  const { t } = useI18n();
  const tone =
    status === "connected"
      ? "success"
      : status === "error"
        ? "danger"
        : status === "paused"
          ? "warning"
          : "neutral";
  return <Pill tone={tone}>{t(`pint.status.${status}`)}</Pill>;
}

function Tile({
  logo,
  icon: Icon,
  title,
  status,
  lines,
  children,
}: {
  logo?: string;
  icon?: LucideIcon;
  title: string;
  status: Status;
  lines: (string | null | false | undefined)[];
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border bg-card p-3.5 dark:bg-[color-mix(in_oklab,var(--card),white_5%)]",
        status === "error"
          ? "border-destructive/40"
          : status === "paused"
            ? "border-warning/50"
            : "border-border",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface">
          {logo ? (
            <img src={logo} alt="" className="h-5 w-5 object-contain" />
          ) : Icon ? (
            <Icon className="h-4 w-4 text-primary" />
          ) : null}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</p>
        <StatusPill status={status} />
      </div>
      <div className="mt-2 min-h-[2.5rem] space-y-0.5 text-xs text-muted-foreground">
        {lines.filter(Boolean).map((l, i) => (
          <p key={i} className={cn("truncate", i === 0 && "text-foreground/80")}>
            {l}
          </p>
        ))}
      </div>
      {children && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">{children}</div>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  busy,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  busy?: boolean;
  tone?: "default" | "danger" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors disabled:opacity-60",
        tone === "danger"
          ? "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
          : tone === "primary"
            ? "border-primary bg-primary text-primary-foreground hover:opacity-90"
            : "border-border bg-surface text-foreground hover:bg-accent",
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

type EditSpec = {
  kind: Kind;
  provider?: string | undefined;
  title: string;
  fields: {
    key: string;
    label: string;
    type?: string | undefined;
    placeholder?: string | undefined;
  }[];
};

function CompanyIntegrations({ company }: { company: PlatformIntegrationsCompany }) {
  const { t } = useI18n();
  const act = usePlatformIntegrationAction();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pausing, setPausing] = useState<{ kind: Kind; title: string } | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [disconnecting, setDisconnecting] = useState<{
    kind: Kind;
    provider?: string;
    webhookId?: string;
    title: string;
  } | null>(null);
  const [editing, setEditing] = useState<EditSpec | null>(null);
  const [logs, setLogs] = useState<{ title: string; rows: PlatformSyncLog[] } | null>(null);

  const paused = (kind: Kind) => company.pauses.find((p) => p.kind === kind) ?? null;

  async function run(input: Omit<PlatformIntegrationAction, "organizationId">, ok: string) {
    const key = `${input.kind}:${input.provider ?? input.webhookId ?? ""}:${input.action}`;
    setBusyKey(key);
    try {
      const res = await act.mutateAsync({ organizationId: company.id, ...input });
      if (input.action === "sync" && res["running"]) toast.success(t("pint.syncRunning"));
      else if (input.action === "sync" && typeof res["synced"] === "number")
        toast.success(t("pint.synced", { count: String(res["synced"]) }));
      else toast.success(ok);
    } catch (err) {
      toast.error(describeError(err, t("pint.actionFailed")));
    } finally {
      setBusyKey(null);
    }
  }
  const isBusy = (kind: Kind, action: string, sub = "") => busyKey === `${kind}:${sub}:${action}`;

  function pauseControls(kind: Kind, title: string) {
    const p = paused(kind);
    return p ? (
      <ActionButton
        icon={Play}
        label={t("pint.resume")}
        busy={isBusy(kind, "resume")}
        onClick={() => void run({ kind, action: "resume" }, t("pint.resumed"))}
      />
    ) : (
      <ActionButton
        icon={Pause}
        label={t("pint.pause")}
        onClick={() => setPausing({ kind, title })}
      />
    );
  }

  const pausedLine = (kind: Kind) => {
    const p = paused(kind);
    return p
      ? `${t("pint.pausedSince", { when: timeAgo(p.pausedAt) })}${p.reason ? ` — ${p.reason}` : ""}`
      : null;
  };

  const amo = company.amocrm;
  const bx = company.bitrix24;
  const n = counts(company);

  return (
    <SectionCard
      icon={Building2}
      tone="primary"
      title={
        <span className="flex items-center gap-2">
          {company.name}
          {company.frozen && <Pill tone="info">{t("orgcard.frozen")}</Pill>}
        </span>
      }
      description={t("pint.companyLine", {
        connected: String(n.connected),
        problems: String(n.problems),
      })}
      actions={
        <Link
          to="/platform/organizations/$orgId"
          params={{ orgId: company.id }}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {t("pint.openCompany")}
        </Link>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 phone:grid-cols-2">
        {/* amoCRM */}
        <Tile
          logo="/brand/amocrm.svg"
          title="amoCRM"
          status={
            paused("amocrm")
              ? "paused"
              : amo
                ? amo.last_sync_error
                  ? "error"
                  : "connected"
                : "off"
          }
          lines={
            amo
              ? [
                  `${amo.subdomain}.amocrm.ru`,
                  amo.sync_in_progress
                    ? t("pint.syncingNow")
                    : amo.last_synced_at &&
                      `${t("platform.lastSynced")}: ${timeAgo(amo.last_synced_at)}`,
                  amo.last_sync_error && `⚠ ${amo.last_sync_error}`,
                  pausedLine("amocrm"),
                ]
              : [t("platform.notConnected")]
          }
        >
          {amo ? (
            <>
              <ActionButton
                icon={RefreshCw}
                label={t("pint.syncNow")}
                busy={isBusy("amocrm", "sync")}
                onClick={() => void run({ kind: "amocrm", action: "sync" }, t("pint.synced"))}
              />
              <ActionButton
                icon={ShieldCheck}
                label={t("pint.test")}
                busy={isBusy("amocrm", "test")}
                onClick={() => void run({ kind: "amocrm", action: "test" }, t("pint.testOk"))}
              />
              <ActionButton
                icon={History}
                label={t("pint.history")}
                onClick={() => setLogs({ title: "amoCRM", rows: company.amocrmLogs })}
              />
              {pauseControls("amocrm", "amoCRM")}
              <ActionButton
                icon={Unplug}
                label={t("pint.disconnect")}
                tone="danger"
                onClick={() => setDisconnecting({ kind: "amocrm", title: "amoCRM" })}
              />
            </>
          ) : (
            <AmoConnect orgId={company.id} />
          )}
        </Tile>

        {/* Bitrix24 */}
        <Tile
          logo="/brand/bitrix24.svg"
          title="Bitrix24"
          status={
            paused("bitrix24")
              ? "paused"
              : bx
                ? bx.last_sync_error
                  ? "error"
                  : "connected"
                : "off"
          }
          lines={
            bx
              ? [
                  bx.portal_domain,
                  bx.sync_in_progress
                    ? t("pint.syncingNow")
                    : bx.last_synced_at &&
                      `${t("platform.lastSynced")}: ${timeAgo(bx.last_synced_at)}`,
                  bx.last_sync_error && `⚠ ${bx.last_sync_error}`,
                  pausedLine("bitrix24"),
                ]
              : [t("platform.notConnected")]
          }
        >
          <ActionButton
            icon={bx ? Pencil : Plug}
            label={bx ? t("pint.edit") : t("pint.connect")}
            tone={bx ? "default" : "primary"}
            onClick={() =>
              setEditing({
                kind: "bitrix24",
                title: "Bitrix24",
                fields: [
                  {
                    key: "webhookUrl",
                    label: t("pint.bitrixWebhook"),
                    placeholder: "https://portal.bitrix24.kz/rest/1/xxxx/",
                  },
                ],
              })
            }
          />
          {bx && (
            <>
              <ActionButton
                icon={RefreshCw}
                label={t("pint.syncNow")}
                busy={isBusy("bitrix24", "sync")}
                onClick={() => void run({ kind: "bitrix24", action: "sync" }, t("pint.synced"))}
              />
              <ActionButton
                icon={ShieldCheck}
                label={t("pint.test")}
                busy={isBusy("bitrix24", "test")}
                onClick={() => void run({ kind: "bitrix24", action: "test" }, t("pint.testOk"))}
              />
              <ActionButton
                icon={History}
                label={t("pint.history")}
                onClick={() => setLogs({ title: "Bitrix24", rows: company.bitrix24Logs })}
              />
              {pauseControls("bitrix24", "Bitrix24")}
              <ActionButton
                icon={Unplug}
                label={t("pint.disconnect")}
                tone="danger"
                onClick={() => setDisconnecting({ kind: "bitrix24", title: "Bitrix24" })}
              />
            </>
          )}
        </Tile>

        {/* Telephony: one tile per connected provider */}
        {company.telephony.length === 0 ? (
          <Tile
            icon={Phone}
            title={t("pint.telephony")}
            status="off"
            lines={[t("platform.notConnected")]}
          />
        ) : (
          company.telephony.map((tel) => {
            const meta = isTelephonyProvider(tel.provider)
              ? getTelephonyProviderMeta(tel.provider)
              : null;
            const title = meta ? t(meta.labelKey) : tel.provider;
            const editable = (meta?.fields ?? []).filter((f) => f.key !== "smsSenderName");
            return (
              <Tile
                key={tel.provider}
                icon={Phone}
                title={title}
                status={paused("telephony") ? "paused" : "connected"}
                lines={[
                  tel.pbx_domain || tel.caller_id || t("pint.telephony"),
                  tel.last_event_at
                    ? `${t("pint.lastCall")}: ${timeAgo(tel.last_event_at)}`
                    : t("pint.noCallsYet"),
                  pausedLine("telephony"),
                ]}
              >
                {editable.length > 0 && (
                  <ActionButton
                    icon={Pencil}
                    label={t("pint.edit")}
                    onClick={() =>
                      setEditing({
                        kind: "telephony",
                        provider: tel.provider,
                        title,
                        fields: editable.map((f) => ({
                          key: f.key as TelephonyFieldKey,
                          label: t(f.labelKey),
                          type:
                            f.key === "apiSecret" || f.inputType === "password"
                              ? "password"
                              : "text",
                          placeholder:
                            (f.key === "apiKey" && tel.hasApiKey) ||
                            (f.key === "apiSecret" && tel.hasApiSecret)
                              ? t("pint.keepSecret")
                              : f.key === "pbxDomain"
                                ? (tel.pbx_domain ?? "")
                                : f.key === "callerId"
                                  ? (tel.caller_id ?? "")
                                  : f.placeholder,
                        })),
                      })
                    }
                  />
                )}
                <ActionButton
                  icon={ShieldCheck}
                  label={t("pint.test")}
                  busy={isBusy("telephony", "test", tel.provider)}
                  onClick={() =>
                    void run(
                      { kind: "telephony", provider: tel.provider, action: "test" },
                      t("pint.testOk"),
                    )
                  }
                />
                {pauseControls("telephony", t("pint.telephony"))}
                <ActionButton
                  icon={Unplug}
                  label={t("pint.disconnect")}
                  tone="danger"
                  onClick={() =>
                    setDisconnecting({ kind: "telephony", provider: tel.provider, title })
                  }
                />
              </Tile>
            );
          })
        )}

        {/* SMS (Eskiz) */}
        <Tile
          icon={MessageSquareText}
          title="SMS (Eskiz)"
          status={paused("sms") ? "paused" : company.sms ? "connected" : "off"}
          lines={
            company.sms
              ? [
                  company.sms.email,
                  company.sms.sender_name && `${t("pint.sender")}: ${company.sms.sender_name}`,
                  pausedLine("sms"),
                ]
              : [t("platform.notConnected")]
          }
        >
          <ActionButton
            icon={company.sms ? Pencil : Plug}
            label={company.sms ? t("pint.edit") : t("pint.connect")}
            tone={company.sms ? "default" : "primary"}
            onClick={() =>
              setEditing({
                kind: "sms",
                title: "SMS (Eskiz)",
                fields: [
                  { key: "email", label: "Email", placeholder: company.sms?.email ?? "" },
                  {
                    key: "password",
                    label: t("orgcard.password"),
                    type: "password",
                    placeholder: company.sms ? t("pint.keepSecret") : "",
                  },
                  {
                    key: "senderName",
                    label: t("pint.sender"),
                    placeholder: company.sms?.sender_name ?? "4546",
                  },
                ],
              })
            }
          />
          {company.sms && (
            <>
              <ActionButton
                icon={ShieldCheck}
                label={t("pint.test")}
                busy={isBusy("sms", "test")}
                onClick={() => void run({ kind: "sms", action: "test" }, t("pint.testOk"))}
              />
              {pauseControls("sms", "SMS")}
              <ActionButton
                icon={Unplug}
                label={t("pint.disconnect")}
                tone="danger"
                onClick={() => setDisconnecting({ kind: "sms", title: "SMS (Eskiz)" })}
              />
            </>
          )}
        </Tile>

        {/* Outgoing webhooks */}
        <Tile
          icon={Webhook}
          title={t("pint.webhooks")}
          status={paused("webhooks") ? "paused" : company.webhooks.length ? "connected" : "off"}
          lines={
            company.webhooks.length
              ? [
                  t("pint.webhookCount", { count: String(company.webhooks.length) }),
                  pausedLine("webhooks"),
                ]
              : [t("platform.notConnected")]
          }
        >
          {company.webhooks.length > 0 && (
            <>
              <ul className="w-full space-y-1.5">
                {company.webhooks.map((w) => (
                  <li key={w.id} className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={w.enabled}
                      disabled={isBusy("webhooks", "toggle", w.id)}
                      onCheckedChange={(v) =>
                        void run(
                          { kind: "webhooks", action: "toggle", webhookId: w.id, enabled: v },
                          v ? t("pint.webhookOn") : t("pint.webhookOff"),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 truncate" title={w.url}>
                      {w.name || w.url}
                    </span>
                    <button
                      type="button"
                      aria-label={t("pint.delete")}
                      onClick={() =>
                        setDisconnecting({
                          kind: "webhooks",
                          webhookId: w.id,
                          title: w.name || w.url,
                        })
                      }
                      className="text-subtle hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              {pauseControls("webhooks", t("pint.webhooks"))}
            </>
          )}
        </Tile>
      </div>

      {/* Pause with a reason */}
      <Dialog open={!!pausing} onOpenChange={(v) => !v && setPausing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pint.pauseTitle", { name: pausing?.title ?? "" })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("pint.pauseDesc")}</p>
          <div>
            <Label htmlFor="pause-reason">{t("orgcard.freezeReason")}</Label>
            <Input
              id="pause-reason"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder={t("orgcard.freezeReasonPlaceholder")}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                const target = pausing!;
                setPausing(null);
                void run(
                  { kind: target.kind, action: "pause", reason: pauseReason },
                  t("pint.paused"),
                ).then(() => setPauseReason(""));
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-warning px-4 text-sm font-semibold text-warning-foreground hover:opacity-90"
            >
              <Pause className="h-4 w-4" /> {t("pint.pause")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditDialog
        spec={editing}
        onClose={() => setEditing(null)}
        onSubmit={(spec, fields) =>
          run({ kind: spec.kind, provider: spec.provider, action: "edit", fields }, t("pint.saved"))
        }
      />

      <Dialog open={!!logs} onOpenChange={(v) => !v && setLogs(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {logs?.title} — {t("pint.history")}
            </DialogTitle>
          </DialogHeader>
          {!logs?.rows.length ? (
            <p className="text-sm text-subtle">{t("pint.noHistory")}</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {logs.rows.map((r, i) => (
                <li key={i} className="flex items-start gap-3 py-2.5 text-sm">
                  <Pill tone={r.error ? "danger" : r.skipped ? "neutral" : "success"}>
                    {r.error
                      ? t("pint.logError")
                      : r.skipped
                        ? t("pint.logSkipped")
                        : `+${r.synced_count}`}
                  </Pill>
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground">
                      {new Date(r.started_at).toLocaleString()} · {r.trigger}
                    </p>
                    {r.error && (
                      <p className="mt-0.5 break-words text-xs text-destructive">{r.error}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!disconnecting}
        onOpenChange={(v) => !v && setDisconnecting(null)}
        title={
          disconnecting?.kind === "webhooks"
            ? t("pint.confirmDeleteWebhook")
            : t("pint.confirmDisconnect", { name: disconnecting?.title ?? "" })
        }
        description={t("pint.confirmDisconnectDesc", { company: company.name })}
        confirmLabel={disconnecting?.kind === "webhooks" ? t("pint.delete") : t("pint.disconnect")}
        destructive
        onConfirm={() => {
          const target = disconnecting!;
          setDisconnecting(null);
          void run(
            {
              kind: target.kind,
              provider: target.provider,
              webhookId: target.webhookId,
              action: target.kind === "webhooks" ? "delete" : "disconnect",
            },
            t("pint.disconnected"),
          );
        }}
      />
    </SectionCard>
  );
}

function EditDialog({
  spec,
  onClose,
  onSubmit,
}: {
  spec: EditSpec | null;
  onClose: () => void;
  onSubmit: (spec: EditSpec, fields: Record<string, string>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!spec) return;
    setBusy(true);
    try {
      await onSubmit(spec, values);
      setValues({});
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!spec}
      onOpenChange={(v) => {
        if (!v) {
          setValues({});
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{spec?.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {spec?.fields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`pint-${f.key}`}>{f.label}</Label>
              <Input
                id={`pint-${f.key}`}
                type={f.type ?? "text"}
                value={values[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <p className="text-xs text-subtle">{t("pint.blankKeeps")}</p>
          <DialogFooter>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Connecting amoCRM for a company: optionally with the company's own amoCRM
// app keys, then the usual OAuth hop (/integrations/amocrm/connect).
function AmoConnect({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const setCredentials = usePlatformSetAmoCrmCredentials();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    setConnecting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      window.location.href = `/integrations/amocrm/connect?token=${encodeURIComponent(token)}&org=${encodeURIComponent(orgId)}`;
    } finally {
      setConnecting(false);
    }
  }

  async function saveAndConnect(e: FormEvent) {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) return;
    try {
      await setCredentials.mutateAsync({ organizationId: orgId, clientId, clientSecret });
      toast.success(t("amocrm.credentialsSaved"));
      await connect();
    } catch (err) {
      toast.error(describeError(err, t("amocrm.credentialsSaveFailed")));
    }
  }

  return (
    <>
      <ActionButton
        icon={Plug}
        label={t("amocrm.connect")}
        tone="primary"
        busy={connecting}
        onClick={() => void connect()}
      />
      <ActionButton icon={Pencil} label={t("pint.ownKeys")} onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("amocrm.ownIntegrationToggle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("amocrm.ownIntegrationDesc")}</p>
          <form onSubmit={saveAndConnect} className="space-y-3">
            <div>
              <Label htmlFor="amo-client-id">{t("amocrm.fieldClientId")}</Label>
              <Input
                id="amo-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={t("amocrm.fieldClientIdPlaceholder")}
              />
            </div>
            <div>
              <Label htmlFor="amo-client-secret">{t("amocrm.fieldClientSecret")}</Label>
              <Input
                id="amo-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
            <DialogFooter>
              <button
                type="submit"
                disabled={
                  setCredentials.isPending || connecting || !clientId.trim() || !clientSecret.trim()
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {(setCredentials.isPending || connecting) && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t("amocrm.connect")}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

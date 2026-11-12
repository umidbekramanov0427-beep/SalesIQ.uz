import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  HardDriveDownload,
  Loader2,
  Bot,
  Radar,
  Send,
  ShieldAlert,
  Sparkles,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { Pill, SectionCard } from "@/components/layout/Primitives";
import { OwnerHeader, OwnerPanel, OwnerStat } from "@/components/owner/OwnerPage";
import { BotShortLinkCard } from "@/components/owner/OwnerSettingsCards";
import { PlatformBotsCard } from "@/components/owner/PlatformBotsCard";
import { apiFetch } from "@/lib/api";
import {
  useLinkTelegram,
  usePlatformOps,
  useSendOpsReport,
  type OpsCompany,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { OPS_COMMANDS, sinceLabel, type Level } from "@/lib/ops/health";
import { cn, describeError } from "@/lib/utils";

export const Route = createFileRoute("/platform/bot")({
  head: () => ({ meta: [{ title: "Botlar — SalesIQ Owner" }] }),
  component: PlatformBotPage,
});

// The platform's bots: the three bots (client / staff / monitoring) with
// their tokens on top, then the owner's monitoring bot: link Telegram,
// see which bot carries the messages and its commands, send the report now,
// and the same company-by-company health the bot reports every morning.
function PlatformBotPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const ops = usePlatformOps();

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

  const data = ops.data;
  const companies = [...(data?.companies ?? [])].sort(
    (a, b) => RANK[a.status] - RANK[b.status] || b.activeUsers24h - a.activeUsers24h,
  );
  const counts = {
    ok: companies.filter((c) => c.status === "ok").length,
    warning: companies.filter((c) => c.status === "warning").length,
    critical: companies.filter((c) => c.status === "critical").length,
  };
  const pIssues = (data?.platformIssues ?? []).filter((i) => i.level !== "info");

  return (
    <div className="mx-auto max-w-[1180px]">
      <OwnerHeader icon={Bot} title={t("obots.title")} desc={t("obots.desc")} />
      <div className="mb-4">
        <PlatformBotsCard />
      </div>

      {ops.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : ops.error ? (
        <SectionCard icon={AlertTriangle} tone="rose" title={t("ops.loadFailed")}>
          <p className="text-sm text-muted-foreground">{describeError(ops.error, "")}</p>
        </SectionCard>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <OwnerStat
              icon={Building2}
              tone="green"
              label={t("ops.statCompanies")}
              value={`${counts.ok} / ${companies.length}`}
              note={t("ops.statCompaniesHint", {
                warning: counts.warning,
                critical: counts.critical,
              })}
            />
            <OwnerStat
              icon={AlertTriangle}
              tone="rose"
              label={t("ops.statErrors")}
              value={data.platform.serverErrors24h}
              note={t("ops.statErrorsHint", {
                slow: data.platform.slowRequests24h,
                client: data.platform.clientErrors24h,
              })}
            />
            <OwnerStat
              icon={Sparkles}
              tone="violet"
              label={t("ops.statAi")}
              value={data.platform.aiPending}
              note={t("ops.statAiHint", { failed: data.platform.aiFailed24h })}
            />
            <OwnerStat
              icon={HardDriveDownload}
              tone={!data.platform.backup ? "slate" : data.platform.backup.ok ? "green" : "rose"}
              label={t("obots.backup")}
              value={
                !data.platform.backup
                  ? "—"
                  : data.platform.backup.ok
                    ? t("obots.backupOk")
                    : t("obots.backupFailed")
              }
              note={
                data.platform.backup
                  ? t("obots.backupAgo", {
                      ago: sinceLabel(Date.now() - Date.parse(data.platform.backup.at)),
                    })
                  : t("obots.backupUnknown")
              }
              info={t("obots.backupInfo")}
            />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <MainBotPanel />
            <OwnerPanel title={t("obots.opsTitle")} info={t("obots.opsInfo")} flush>
              <ConnectCard data={data} />
            </OwnerPanel>
          </div>

          <CompanyBotsPanel />

          {pIssues.length > 0 && (
            <div className="space-y-1.5 rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-sm font-bold text-destructive">{t("ops.platformProblems")}</p>
              {pIssues.map((i) => (
                <p key={i.code} className="text-sm text-foreground">
                  {DOT[i.level]} {i.text}
                </p>
              ))}
            </div>
          )}

          <OwnerPanel title={t("ops.companies")} info={t("ops.companiesDesc")}>
            {!companies.length ? (
              <p className="text-sm text-muted-foreground">{t("ops.noCompanies")}</p>
            ) : (
              <ul className="-my-3 divide-y divide-border">
                {companies.map((c) => (
                  <CompanyRow key={c.id} company={c} />
                ))}
              </ul>
            )}
          </OwnerPanel>
        </div>
      ) : null}
    </div>
  );
}

const RANK: Record<Level | "ok", number> = { critical: 0, warning: 1, info: 2, ok: 2 };
const DOT: Record<Level | "ok", string> = { critical: "🔴", warning: "🟡", info: "•", ok: "🟢" };

function ConnectCard({ data }: { data: NonNullable<ReturnType<typeof usePlatformOps>["data"]> }) {
  const { t } = useI18n();
  const link = useLinkTelegram();
  const send = useSendOpsReport();
  const [opened, setOpened] = useState(false);
  const botName = data.opsBotConfigured ? data.opsBot : data.sharedBot;

  async function connect() {
    // Opened before the request so the browser doesn't treat it as a popup.
    const tab = window.open("", "_blank");
    try {
      const { code, botUsername } = await link.mutateAsync();
      if (!botUsername) throw new Error(t("welcomeTg.noBot"));
      const url = `https://t.me/${botUsername}?start=${code}`;
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setOpened(true);
    } catch (err) {
      tab?.close();
      toast.error(describeError(err, t("welcomeTg.linkFailed")));
    }
  }

  async function sendNow() {
    try {
      const { sent } = await send.mutateAsync();
      if (sent > 0) toast.success(t("ops.sent"));
      else toast.error(t("ops.notSent"));
    } catch (err) {
      toast.error(describeError(err, t("ops.notSent")));
    }
  }

  return (
    <section className="grid gap-4 p-4">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-full",
              data.linked
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
          >
            {data.linked ? <CheckCircle2 className="h-5 w-5" /> : <Send className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-foreground">
              {data.linked ? t("ops.linked") : t("ops.notLinked")}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {botName ? (
                <>
                  {t("ops.botIs")}{" "}
                  <a
                    href={`https://t.me/${botName}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary underline underline-offset-2"
                  >
                    @{botName}
                  </a>
                  {data.opsBotConfigured
                    ? ` · ${t("ops.separateBot")}`
                    : ` · ${t("ops.sharedBot")}`}
                </>
              ) : (
                t("ops.noBotToken")
              )}
            </p>
          </div>
        </div>

        {!data.linked ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground/85">{t("ops.linkHint")}</p>
            <button
              type="button"
              onClick={() => void connect()}
              disabled={link.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {link.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t("ops.connect")}
            </button>
            {opened && <p className="text-[13px] text-muted-foreground">{t("ops.waitingStart")}</p>}
          </div>
        ) : (
          data.opsBotConfigured && (
            <p className="text-sm text-foreground/85">
              {t("ops.pressStartOps", { bot: `@${data.opsBot ?? "…"}` })}
            </p>
          )
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void sendNow()}
            disabled={send.isPending || !data.linked}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radar className="h-4 w-4" />
            )}
            {t("ops.sendNow")}
          </button>
          <span className="text-[13px] text-muted-foreground">
            {data.alertsReady ? t("ops.schedule") : t("ops.scheduleNotReady")}
          </span>
        </div>
        {!data.opsBotConfigured && (
          <p className="text-[12.5px] leading-snug text-muted-foreground">
            {t("ops.separateHint")}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface p-3.5">
        <p className="mb-2 flex items-center gap-2 text-[13px] font-bold text-foreground">
          <Terminal className="h-4 w-4 text-violet-600 dark:text-violet-400" /> {t("ops.commands")}
        </p>
        <ul className="space-y-1.5">
          {OPS_COMMANDS.map(([command, description]) => (
            <li key={command} className="flex items-baseline gap-2 text-[13px]">
              <code className="shrink-0 rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-violet-700 dark:text-violet-300">
                /{command}
              </code>
              <span className="text-muted-foreground">{description}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CompanyRow({ company: c }: { company: OpsCompany }) {
  const { t } = useI18n();
  const shown = c.issues.filter((i) => i.code !== "paused");
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className={cn(
          "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
          c.status === "critical"
            ? "bg-rose-500"
            : c.status === "warning"
              ? "bg-amber-500"
              : "bg-emerald-500",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-bold text-foreground">{c.name}</span>
          <Pill tone={c.phase === "paid" ? "success" : c.phase === "trial" ? "warning" : "neutral"}>
            {t(`ops.phase.${c.phase}`)}
          </Pill>
          {c.amocrm && <Pill tone="info">amoCRM</Pill>}
          {c.bitrix24 && <Pill tone="info">Bitrix24</Pill>}
          {c.telephony.map((tel) => (
            <Pill key={tel.provider} tone="info">
              {tel.provider}
            </Pill>
          ))}
          <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
            {t("ops.facts", {
              active: c.activeUsers24h,
              users: c.users,
              leads: c.leads24h,
              calls: c.callsAnalyzed24h,
            })}
            {" · "}
            {c.lastSeenAt
              ? t("ops.lastSeen", { ago: sinceLabel(Date.now() - Date.parse(c.lastSeenAt)) })
              : t("ops.neverSeen")}
          </span>
        </div>
        {shown.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {shown.map((i) => (
              <li key={i.code} className="text-[13px] text-foreground/85">
                {DOT[i.level]} {i.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

// The shared Telegram bot: what it does and which salesbot its plain link
// opens (ads, bios).
// The client bot's short link (t.me/<bot>?start=...) for companies; who the
// bot is and what it carries is in "Platforma botlari" above.
function MainBotPanel() {
  const { t } = useI18n();
  return (
    <OwnerPanel title={t("obots.mainTitle")} info={t("obots.mainInfo")} flush>
      <div className="[&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:shadow-none">
        <BotShortLinkCard />
      </div>
    </OwnerPanel>
  );
}

type CompanyBot = { id: string; name: string; enabled: boolean; organizationName: string };

// Every company's salesbots (Telegram ones), on/off.
function CompanyBotsPanel() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["platform", "salesbots"],
    queryFn: async () => {
      const res = await apiFetch("/platform/salesbots");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { defaultId: string | null; bots: CompanyBot[] };
    },
  });
  const bots = data?.bots ?? [];
  const on = bots.filter((b) => b.enabled).length;
  return (
    <OwnerPanel
      title={t("obots.companyTitle")}
      info={t("obots.companyInfo")}
      flush
      actions={
        <span className="text-[12px] text-muted-foreground">
          {t("obots.onOf", { on: String(on), all: String(bots.length) })}
        </span>
      }
    >
      {isLoading ? (
        <div className="grid place-items-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !bots.length ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">{t("obots.none")}</p>
      ) : (
        <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
          {bots.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 border-border px-4 py-2.5 sm:border-b sm:odd:border-r"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/12 text-violet-600 dark:text-violet-300">
                <Bot className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-foreground">
                  {b.name}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {b.organizationName}
                  {data?.defaultId === b.id ? ` · ${t("obots.isDefault")}` : ""}
                </span>
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  b.enabled
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {b.enabled ? t("obots.on") : t("obots.off")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </OwnerPanel>
  );
}

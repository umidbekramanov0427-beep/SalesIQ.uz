import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import {
  Bot,
  CreditCard,
  DatabaseBackup,
  FileSignature,
  LifeBuoy,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { Pill } from "@/components/layout/Primitives";
import {
  PlatformPaymentSettingsCard,
  SupportContactsCard,
} from "@/components/owner/OwnerSettingsCards";
import { ConsoleSideTabs, OwnerEmpty, OwnerHeader, OwnerPanel } from "@/components/owner/OwnerPage";
import type { CardTone } from "@/lib/tones";
import { RequisitesCard } from "@/components/platform/RequisitesCard";
import { BackupCard } from "@/components/platform/BackupCard";
import { MfaCard } from "@/components/settings/MfaCard";
import { useAllAiAgents } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Owner panel → Sozlamalar: every platform-wide setting in one place,
// one section at a time -- the owner's own Payme/Click cashbox, company
// requisites for invoices, support contacts shown to companies, the AI agents, the owner's own sign-in security
// and the daily backup of every company's data to a Telegram channel.
const TABS = ["payments", "requisites", "contacts", "ai", "security", "backup"] as const;
type Tab = (typeof TABS)[number];
const ICONS: Record<Tab, LucideIcon> = {
  payments: CreditCard,
  requisites: FileSignature,
  contacts: LifeBuoy,
  ai: Bot,
  security: ShieldCheck,
  backup: DatabaseBackup,
};
const TONES: Record<Tab, CardTone> = {
  payments: "emerald",
  requisites: "sky",
  contacts: "amber",
  ai: "violet",
  security: "rose",
  backup: "emerald",
};

export const Route = createFileRoute("/platform/settings")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: TABS.includes(s["tab"] as Tab) ? (s["tab"] as Tab) : undefined,
  }),
  head: () => ({ meta: [{ title: "Sozlamalar — SalesIQ Owner" }] }),
  component: OwnerSettingsPage,
});

function OwnerSettingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { tab = "payments" } = Route.useSearch();
  return (
    <div className="w-full">
      <OwnerHeader icon={SlidersHorizontal} title={t("os.title")} desc={t("os.desc")} />
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <ConsoleSideTabs
          value={tab}
          onChange={(k) =>
            void navigate({ to: "/platform/settings", search: { tab: k }, replace: true })
          }
          options={TABS.map((k) => ({
            value: k,
            label: t(`os.tab.${k}`),
            icon: ICONS[k],
            tone: TONES[k],
          }))}
        />
        <div className="min-w-0 space-y-4">
          {tab === "payments" && <PlatformPaymentSettingsCard />}
          {tab === "requisites" && <RequisitesCard />}
          {tab === "contacts" && <SupportContactsCard />}
          {tab === "ai" && <AiAgentsPanel />}
          {tab === "backup" && <BackupCard />}
          {tab === "security" && (
            <>
              <LoginCodeCard />
              <MfaCard />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AiAgentsPanel() {
  const { t } = useI18n();
  const { data: agents, isLoading } = useAllAiAgents();
  return (
    <OwnerPanel title={t("platform.aiTitle")} info={t("platform.aiDesc")} flush>
      {isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : !agents?.length ? (
        <OwnerEmpty icon={Bot} title={t("platform.noAiAgents")} />
      ) : (
        <ul className="divide-y divide-border">
          {agents.map((a) => (
            <li
              key={`${a.organization_id}-${a.kind}`}
              className="flex items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {a.organizations?.name ?? "—"} · {a.kind}
                </p>
                <p className="truncate text-xs text-subtle">{a.model ?? "—"}</p>
              </div>
              <Pill tone={a.active ? "success" : "neutral"}>
                {a.active ? t("platform.active") : t("platform.inactive")}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </OwnerPanel>
  );
}

// Sign-in confirmation code for every company's people (password sign-ins):
// on/off, and where the code goes -- email once PLATFORM_SMTP_* is set on
// the server, otherwise the person's linked Telegram.
function LoginCodeCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["owner-login-code"],
    queryFn: async () => {
      const res = await apiFetch("/platform/login-code-setting");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { ready: boolean; enabled: boolean; smtp: boolean };
    },
  });
  const save = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiFetch("/platform/login-code-setting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      void qc.invalidateQueries({ queryKey: ["owner-login-code"] });
    },
    onError: () => toast.error(t("common.saveFailed")),
  });
  return (
    <OwnerPanel title={t("lcode.cardTitle")} info={t("lcode.cardInfo")}>
      {data && !data.ready ? (
        <p className="text-[13px] text-amber-700 dark:text-amber-300">{t("lcode.notReady")}</p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-foreground">
                {t("lcode.switch")}
              </span>
              <span className="text-[12.5px] text-muted-foreground">{t("lcode.switchHint")}</span>
            </span>
            <Switch
              checked={!!data?.enabled}
              disabled={!data || save.isPending}
              onCheckedChange={(v) => save.mutate(v)}
            />
          </label>
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px]">
            <span
              className={cn(
                "mt-1 h-2 w-2 shrink-0 rounded-full",
                data?.smtp ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            <span className="text-muted-foreground">
              {data?.smtp ? t("lcode.smtpOn") : t("lcode.smtpOff")}
            </span>
          </div>
        </div>
      )}
    </OwnerPanel>
  );
}

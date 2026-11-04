import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bot,
  CreditCard,
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
import { OwnerEmpty, OwnerHeader, OwnerPanel } from "@/components/owner/OwnerPage";
import { RequisitesCard } from "@/components/platform/RequisitesCard";
import { MfaCard } from "@/components/settings/MfaCard";
import { useAllAiAgents } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Owner panel → Sozlamalar: every platform-wide setting in one place,
// one section at a time -- the owner's own Payme/Click cashbox, company
// requisites for invoices, support contacts shown to companies, the AI agents and the owner's own sign-in security.
const TABS = ["payments", "requisites", "contacts", "ai", "security"] as const;
type Tab = (typeof TABS)[number];
const ICONS: Record<Tab, LucideIcon> = {
  payments: CreditCard,
  requisites: FileSignature,
  contacts: LifeBuoy,
  ai: Bot,
  security: ShieldCheck,
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
    <div className="mx-auto max-w-[1180px]">
      <OwnerHeader icon={SlidersHorizontal} title={t("os.title")} desc={t("os.desc")} />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1.5 lg:flex-col lg:self-start phone-tabs">
          {TABS.map((k) => {
            const Icon = ICONS[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() =>
                  void navigate({ to: "/platform/settings", search: { tab: k }, replace: true })
                }
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-medium transition-colors",
                  tab === k
                    ? "bg-sidebar-active font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4", tab === k ? "text-primary" : "")} />
                {t(`os.tab.${k}`)}
              </button>
            );
          })}
        </nav>
        <div className="min-w-0 space-y-4">
          {tab === "payments" && <PlatformPaymentSettingsCard />}
          {tab === "requisites" && <RequisitesCard />}
          {tab === "contacts" && <SupportContactsCard />}
          {tab === "ai" && <AiAgentsPanel />}
          {tab === "security" && <MfaCard />}
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

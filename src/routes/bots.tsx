import { createFileRoute } from "@tanstack/react-router";
import { Bot, Megaphone, Send, Smartphone, Users, Workflow } from "lucide-react";
import { PageHeader } from "@/components/layout/Primitives";
import { Segmented } from "@/components/ui/segmented";
import { OrgBotCard } from "@/components/integrations/OrgBotCard";
import { TelegramMiniAppCard } from "@/components/integrations/IntegrationCards";
import { TelegramRosterCard } from "@/components/telegram/TelegramRoster";
import { MarketingBotSettings } from "@/components/marketing/MarketingBotSettings";
import { SalesbotsTab } from "@/components/funnel-settings/SalesbotsTab";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// Botlar: every bot a company sets up, in one place.
//   own        -- the company's own Telegram bot for its clients (token from
//                 @BotFather, the salesbot its plain link opens, new leads);
//   salesbots  -- the bots that talk to clients step by step;
//   staff      -- which of the company's people linked Telegram (the
//                 platform's companies' bot sends them reports and tasks);
//   marketing  -- the marketing bot (webinars, channels), for admins;
//   app        -- the Telegram Mini App.
// The platform's own bots (owner / companies / default clients' bot) are set
// by the platform owner in Platforma -> Botlar, not here.

const TABS = ["own", "salesbots", "staff", "marketing", "app"] as const;
type Tab = (typeof TABS)[number];
const ICON = {
  own: Send,
  salesbots: Workflow,
  staff: Users,
  marketing: Megaphone,
  app: Smartphone,
};

export const Route = createFileRoute("/bots")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { tab?: Tab | undefined; bot?: string | undefined } => ({
    tab: TABS.includes(s["tab"] as Tab) ? (s["tab"] as Tab) : undefined,
    bot: typeof s["bot"] === "string" ? (s["bot"] as string) : undefined,
  }),
  head: () => ({ meta: [{ title: "Botlar — SalesIQ" }] }),
  component: BotsPage,
});

function BotsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const admin = user?.role === "super_admin" || user?.role === "platform_owner";
  const tabs = TABS.filter((k) => k !== "marketing" || admin);
  const tab: Tab = search.tab && tabs.includes(search.tab) ? search.tab : "own";

  return (
    <div className="space-y-4">
      <PageHeader title={t("bots.title")} icon={Bot} tone="sky" description={t("bots.desc")} />
      <Segmented
        value={tab}
        onChange={(v) => void navigate({ search: { tab: v === "own" ? undefined : v } })}
        options={tabs.map((k) => ({ value: k, label: t(`bots.tab.${k}`), icon: ICON[k] }))}
      />
      {tab === "own" && <OrgBotCard />}
      {tab === "salesbots" && <SalesbotsTab embedded />}
      {tab === "staff" && <TelegramRosterCard />}
      {tab === "marketing" && admin && <MarketingBotSettings />}
      {tab === "app" && <TelegramMiniAppCard />}
    </div>
  );
}

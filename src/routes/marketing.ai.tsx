import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BrainCircuit,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Loader2,
  Megaphone,
  MessagesSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/Primitives";
import { Segmented } from "@/components/ui/segmented";
import { MarketingFilterBar, useMarketingFilters } from "@/components/marketing/MarketingFilters";
import { AiOverviewTab } from "@/components/marketing/ai/Overview";
import { AiCampaignsTab } from "@/components/marketing/ai/Campaigns";
import { AiChatTab } from "@/components/marketing/ai/Chat";
import { AiForecastTab } from "@/components/marketing/ai/Forecast";
import { AiRecsTab } from "@/components/marketing/ai/Recs";
import { RateProvider } from "@/components/marketing/ai/shared";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import { marketingAiPost, useMarketingAi, type AiScope } from "@/hooks/use-crm-data";
import type { Finding } from "@/lib/marketing-ai/diagnose";

// Marketing paneli -> AI tahlilchi. The figures are worked out by the
// system from the company's own data (never by the AI); the AI only
// explains them and recommends. Tabs: Umumiy (figures, funnel losses,
// alerts, the AI's findings), Kampaniyalar, Chat, Prognoz, Tavsiyalar.
// Money in so'm or dollars (the Central Bank's rate of the day).

const TABS = ["overview", "campaigns", "chat", "forecast", "recs"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/marketing/ai")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: TABS.includes(s["tab"] as Tab) ? (s["tab"] as Tab) : undefined,
  }),
  head: () => ({ meta: [{ title: "AI tahlilchi — SalesIQ Marketing" }] }),
  component: MarketingAi,
});

/** "2026-11-01" .. "2026-11-30" (Tashkent days) -> an ISO half-open range. */
function rangeOf(p: { from: string; to: string }) {
  const from = new Date(`${p.from}T00:00:00+05:00`);
  const to = new Date(new Date(`${p.to}T00:00:00+05:00`).getTime() + 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function MarketingAi() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: Tab = search.tab ?? "overview";
  const f = useMarketingFilters();
  const cur = useCurrency();
  const qc = useQueryClient();
  const scope: AiScope = useMemo(
    () => ({ ...rangeOf(f.period), project: f.projectId }),
    [f.period, f.projectId],
  );
  const q = useMarketingAi(scope);

  async function track(x: Finding) {
    try {
      await marketingAiPost({
        action: "rec",
        title: x.recommendations[0] ?? x.problem,
        problem: x.problem,
        priority: x.priority,
        metricKey: x.metric,
        scope,
      });
      await qc.invalidateQueries({ queryKey: ["marketing_ai_post"] });
      toast.success(t("ai.tracked"));
    } catch (e) {
      toast.error(describeError(e, t("ai.failed")));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        icon={BrainCircuit}
        tone="violet"
        title={t("mkt.nav.ai")}
        description={t("ai.desc")}
      />
      <MarketingFilterBar>
        <span
          className="ctl-track inline-flex rounded-xl p-0.5"
          role="tablist"
          aria-label={t("ai.currency")}
        >
          {(["UZS", "USD"] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="tab"
              aria-selected={cur.unit === u}
              onClick={() => cur.setUnit(u)}
              className="ctl-tab h-8 rounded-lg px-3 text-[13px] font-semibold"
            >
              {u === "UZS" ? "so'm" : "$"}
            </button>
          ))}
        </span>
        {q.data?.fx && (
          <span className="text-[11.5px] text-muted-foreground" title={t("ai.fxTip")}>
            1$ = {Math.round(q.data.fx.rate).toLocaleString("ru-RU")} so'm
            {q.data.fx.live ? " · MB" : ""}
          </span>
        )}
      </MarketingFilterBar>
      <Segmented
        sticky
        value={tab}
        onChange={(next) =>
          void navigate({ search: { tab: next === "overview" ? undefined : next }, replace: true })
        }
        options={[
          { value: "overview", label: t("ai.tab.overview"), icon: LayoutDashboard },
          { value: "campaigns", label: t("ai.tab.campaigns"), icon: Megaphone },
          { value: "chat", label: t("ai.tab.chat"), icon: MessagesSquare },
          { value: "forecast", label: t("ai.tab.forecast"), icon: LineChart },
          { value: "recs", label: t("ai.tab.recs"), icon: ListChecks },
        ]}
      />
      <RateProvider rate={q.data?.fx.rate ?? 12_900}>
        {q.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : q.error || !q.data ? (
          <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-200">
            {q.error?.message === "migration_pending"
              ? t("ai.migration")
              : (q.error?.message ?? t("ai.failed"))}
          </p>
        ) : tab === "overview" ? (
          <AiOverviewTab data={q.data} scope={scope} onTrack={(x) => void track(x)} />
        ) : tab === "campaigns" ? (
          <AiCampaignsTab m={q.data.current} />
        ) : tab === "chat" ? (
          <AiChatTab scope={scope} m={q.data.current} />
        ) : tab === "forecast" ? (
          <AiForecastTab scope={scope} />
        ) : (
          <AiRecsTab />
        )}
      </RateProvider>
    </div>
  );
}

import { createFileRoute, redirect } from "@tanstack/react-router";

// Analitika's sales reports now live in Bosh sahifa's tabs (the ads report
// moved to the marketing panel). Old links and bookmarks land on the tab
// that has their report.

const TO_HOME_TAB: Record<string, string> = {
  sales: "conversion",
  winloss: "conversion",
  summary: "rating",
  staff: "activity",
  events: "activity",
  forecast: "forecast",
  pnl: "finance",
};

export const Route = createFileRoute("/analytics")({
  validateSearch: (search: Record<string, unknown>): { tab?: string | undefined } => ({
    tab: typeof search["tab"] === "string" ? search["tab"] : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.tab === "marketing") throw redirect({ to: "/marketing/ads" });
    throw redirect({
      to: "/",
      search: { tab: TO_HOME_TAB[search.tab ?? "sales"] ?? "conversion" } as never,
    });
  },
});

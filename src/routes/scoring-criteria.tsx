import { createFileRoute, redirect } from "@tanstack/react-router";
import { LEAD_SETTINGS_TABS, SCORING_TABS, type Tab } from "@/components/scoring/ScoringTabs";

// The scoring settings now live in their sections' "Sozlash" rooms: call
// scoring in Audio tahlil, lead scoring in Lid tahlili. Old links land there.
export const Route = createFileRoute("/scoring-criteria")({
  beforeLoad: ({ search }) => {
    const raw = (search as { tab?: string }).tab;
    const tab = (SCORING_TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "rubric";
    throw redirect({
      to: LEAD_SETTINGS_TABS.includes(tab) ? "/lead-analytics" : "/audio-analytics",
      search: { settings: tab },
    });
  },
});

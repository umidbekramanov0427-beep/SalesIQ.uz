import { createFileRoute, redirect } from "@tanstack/react-router";

// The separate leads register duplicated the funnel's list view (Voronkalar
// → Ro'yxat) with its own KPI cards; old links to /crm/leads land there.
export const Route = createFileRoute("/crm/leads/")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels", search: { view: "list" }, replace: true });
  },
});

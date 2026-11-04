import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved into Voronkalar → Sozlash (automations tab); old links land there.
export const Route = createFileRoute("/admin/automations")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels/settings", search: { tab: "automations" } });
  },
});

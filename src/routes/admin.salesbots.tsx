import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved into Voronkalar → Sozlash (salesbots tab); old links land there.
export const Route = createFileRoute("/admin/salesbots")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels/settings", search: { tab: "salesbots" } });
  },
});

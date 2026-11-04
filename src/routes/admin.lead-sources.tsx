import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved into Voronkalar → Sozlash (sources tab); old links land there.
export const Route = createFileRoute("/admin/lead-sources")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels/settings", search: { tab: "sources" } });
  },
});

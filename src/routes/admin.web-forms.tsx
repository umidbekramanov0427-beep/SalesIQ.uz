import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved into Voronkalar → Sozlash (forms tab); old links land there.
export const Route = createFileRoute("/admin/web-forms")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels/settings", search: { tab: "forms" } });
  },
});

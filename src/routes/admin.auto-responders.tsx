import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved into Voronkalar → Sozlash (autoreplies tab); old links land there.
export const Route = createFileRoute("/admin/auto-responders")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels/settings", search: { tab: "autoreplies" } });
  },
});

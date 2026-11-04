import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved into Voronkalar → Sozlash (followups tab); old links land there.
export const Route = createFileRoute("/admin/follow-ups")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels/settings", search: { tab: "followups" } });
  },
});

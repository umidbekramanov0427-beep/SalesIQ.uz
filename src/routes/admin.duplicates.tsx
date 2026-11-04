import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved into Voronkalar → Sozlash (duplicates tab); old links land there.
export const Route = createFileRoute("/admin/duplicates")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels/settings", search: { tab: "duplicates" } });
  },
});

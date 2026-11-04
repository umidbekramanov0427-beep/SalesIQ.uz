import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved into Voronkalar → Sozlash (tasks tab); old links land there.
export const Route = createFileRoute("/admin/task-control")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels/settings", search: { tab: "tasks" } });
  },
});

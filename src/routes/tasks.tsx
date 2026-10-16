import { createFileRoute, redirect } from "@tanstack/react-router";

// Older "task assigned" notifications link to /tasks; tasks live in the
// funnels page's Vazifalar view.
export const Route = createFileRoute("/tasks")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels", search: { view: "tasks" }, replace: true });
  },
});

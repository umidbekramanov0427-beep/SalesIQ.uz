import { createFileRoute, redirect } from "@tanstack/react-router";

// The old "Lid vazifalari" page. Tasks live in the funnels page's Vazifalar
// view; old links (notifications, overdue alerts written by
// claim_overdue_tasks) still point here.
export const Route = createFileRoute("/lead-tasks")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels", search: { view: "tasks" }, replace: true });
  },
});

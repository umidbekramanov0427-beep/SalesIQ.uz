import { createFileRoute, redirect } from "@tanstack/react-router";

// Older "task assigned" notifications link to /tasks; the tasks page lives
// at /lead-tasks.
export const Route = createFileRoute("/tasks")({
  beforeLoad: () => {
    throw redirect({ to: "/lead-tasks", replace: true });
  },
});

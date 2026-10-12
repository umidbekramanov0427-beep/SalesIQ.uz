import { createFileRoute, redirect } from "@tanstack/react-router";

// The activity log is now a tab of Tashriflar (/platform/sessions).
export const Route = createFileRoute("/platform/activity")({
  beforeLoad: () => {
    throw redirect({ to: "/platform/sessions", search: { tab: "activity" }, replace: true });
  },
});

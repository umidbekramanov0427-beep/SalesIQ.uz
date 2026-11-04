import { createFileRoute, redirect } from "@tanstack/react-router";

// The AI agents list is now a section of the owner's Sozlamalar.
export const Route = createFileRoute("/platform/ai")({
  beforeLoad: () => {
    throw redirect({ to: "/platform/settings", search: { tab: "ai" }, replace: true });
  },
});

import { createFileRoute, redirect } from "@tanstack/react-router";

// Salesbots live on the one Botlar page (/bots); old links land there.
export const Route = createFileRoute("/admin/salesbots")({
  beforeLoad: () => {
    throw redirect({ to: "/bots", search: { tab: "salesbots" } });
  },
});

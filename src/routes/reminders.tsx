import { createFileRoute, redirect } from "@tanstack/react-router";

// Eslatmalar now live in Nazorat (a tab at the top); old links land there.
export const Route = createFileRoute("/reminders")({
  beforeLoad: () => {
    throw redirect({ to: "/attendance", search: { tab: "eslatmalar" }, replace: true });
  },
});

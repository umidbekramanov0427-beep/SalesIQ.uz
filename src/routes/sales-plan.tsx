import { createFileRoute, redirect } from "@tanstack/react-router";

// Reja va fakt now lives in Nazorat (/attendance, "Reja va fakt" tab);
// old links and bookmarks land there.
export const Route = createFileRoute("/sales-plan")({
  beforeLoad: () => {
    throw redirect({ to: "/attendance", search: { tab: "reja" }, replace: true });
  },
});

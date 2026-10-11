import { createFileRoute, Navigate } from "@tanstack/react-router";

// The dashboard lives on Bosh sahifa ("/") now. This route stays only so
// old links and bookmarks land there -- and as the parent of the
// /dashboard/amocrm-tasks endpoint.
export const Route = createFileRoute("/dashboard")({
  component: () => <Navigate to="/" search={{ tab: "overview" }} replace />,
});

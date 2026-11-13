import { createFileRoute, redirect } from "@tanstack/react-router";

// Funnels and their stages are set in one place: Voronkalar → Sozlash
// (funnels_.settings.tsx). This old copy's links land there.
export const Route = createFileRoute("/admin/pipelines")({
  beforeLoad: () => {
    throw redirect({ to: "/funnels/settings" });
  },
});

import { createFileRoute, redirect } from "@tanstack/react-router";

// The permissions table lives in the Admin panel (Admin → Ruxsatlar); this
// older address showed the same table and is kept only as a redirect.
export const Route = createFileRoute("/crm-stages")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/permissions", replace: true });
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { loadOrgReferrals } from "@/lib/referral.server";

// Admin panel → Taklif dasturi: the company's invitation link, whom it
// invited and the free days it earned. Company admins only.
export const Route = createFileRoute("/referral-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });
        try {
          // The public site (not the company's own subdomain); local runs keep their own.
          const here = new URL(request.url);
          const origin = /^(localhost|127\.0\.0\.1)$/.test(here.hostname)
            ? here.origin
            : (process.env["PUBLIC_APP_URL"] ?? "https://salesiq.uz").replace(/\/$/, "");
          return Response.json(await loadOrgReferrals(admin.organizationId, origin));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed";
          return Response.json(
            { error: message },
            { status: message === "MIGRATION_PENDING" ? 503 : 500 },
          );
        }
      },
    },
  },
});

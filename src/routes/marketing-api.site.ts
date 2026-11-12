import { createFileRoute } from "@tanstack/react-router";
import { requireMarketingMember } from "@/lib/marketing.server";

// Marketing -> Sayt:
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD -> { setup: {key, captureForms, lastVisit, snippet}, stats }
//   POST {captureForms}                 -> turns "forms become leads" on/off
export const Route = createFileRoute("/marketing-api/site")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const url = new URL(request.url);
        const from = url.searchParams.get("from") ?? "";
        const to = url.searchParams.get("to") ?? "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
          return Response.json({ error: "Bad period" }, { status: 400 });
        const { siteFigures, siteSetup } = await import("@/lib/site-tracking.server");
        const { snippet } = await import("@/lib/site-tracking");
        try {
          const setup = await siteSetup(caller.organizationId);
          const stats = await siteFigures(
            caller.organizationId,
            new Date(`${from}T00:00:00+05:00`).toISOString(),
            new Date(Date.parse(`${to}T00:00:00+05:00`) + 86_400_000).toISOString(),
          );
          const origin = (process.env["PUBLIC_APP_URL"] ?? url.origin).replace(/\/$/, "");
          return Response.json({ setup: { ...setup, snippet: snippet(origin, setup.key) }, stats });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          return Response.json(
            { error: /site_tracking|site_visits/.test(msg) ? "migration_pending" : msg },
            { status: 400 },
          );
        }
      },
      POST: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const b = (await request.json().catch(() => ({}))) as { captureForms?: unknown };
        if (typeof b.captureForms !== "boolean")
          return Response.json({ error: "Bad request" }, { status: 400 });
        const { siteSetup } = await import("@/lib/site-tracking.server");
        return Response.json(
          await siteSetup(caller.organizationId, { captureForms: b.captureForms }),
        );
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";

// Kompaniyalar -> "Xavf ostidagilar" (platform owners only):
//   GET                         companies at risk or worth watching, worst first
//   POST {orgId, title, dueAt?} a task for the owner about one of them
const UUID = /^[0-9a-f-]{36}$/i;

export const Route = createFileRoute("/platform/at-risk")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        const { loadAtRisk } = await import("@/lib/company-leads.server");
        return Response.json({ items: await loadAtRisk() });
      },
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const orgId = typeof b["orgId"] === "string" ? b["orgId"] : "";
        const title = typeof b["title"] === "string" ? b["title"].trim().slice(0, 300) : "";
        const due =
          typeof b["dueAt"] === "string" && !Number.isNaN(Date.parse(b["dueAt"]))
            ? b["dueAt"]
            : null;
        if (!UUID.test(orgId) || !title)
          return Response.json({ error: "BAD_INPUT" }, { status: 400 });
        const { addCompanyTask } = await import("@/lib/company-leads.server");
        const r = await addCompanyTask({ orgId, title, dueAt: due, createdBy: ownerId });
        return r.ok ? Response.json({ ok: true }) : Response.json(r, { status: 500 });
      },
    },
  },
});

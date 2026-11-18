import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";

// Kompaniyalar -> one company -> Faoliyat (platform owners only):
//   GET ?org=<id>  the company's facts (people active, payments, errors,
//                  support, health) and its lead in Arizalar.
const UUID = /^[0-9a-f-]{36}$/i;

export const Route = createFileRoute("/platform/org-facts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        const org = new URL(request.url).searchParams.get("org") ?? "";
        if (!UUID.test(org)) return Response.json({ error: "BAD_ORG" }, { status: 400 });
        const { loadOrgActivity } = await import("@/lib/company-leads.server");
        return Response.json(await loadOrgActivity(org));
      },
    },
  },
});

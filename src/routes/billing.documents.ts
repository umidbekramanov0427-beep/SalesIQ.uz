import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  loadBillingDoc,
  loadPlatformRequisites,
  savePlatformRequisites,
  type DocKind,
} from "@/lib/subscription-billing/documents.server";

// Subscription documents:
//   GET ?type=invoice|act&payment=<id>  a paid payment's invoice or act
//   GET ?type=proforma                  bill to pay the next month by bank
//   GET ?requisites=1                   SalesIQ's details (platform owner)
//   POST { requisites }                 save them (platform owner)
// A company's admin sees its own; the platform owner sees any.
async function viewer(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    owner: data.role === "platform_owner",
    admin: data.role === "super_admin",
    orgId: data.organization_id,
  };
}

export const Route = createFileRoute("/billing/documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const v = await viewer(request);
        if (!v || (!v.owner && !v.admin))
          return Response.json({ error: "Forbidden" }, { status: 403 });
        const url = new URL(request.url);
        if (url.searchParams.get("requisites")) {
          if (!v.owner) return Response.json({ error: "Forbidden" }, { status: 403 });
          return Response.json(await loadPlatformRequisites());
        }
        const type = url.searchParams.get("type");
        const kind: DocKind = type === "act" || type === "proforma" ? type : "invoice";
        const r = await loadBillingDoc(
          kind,
          url.searchParams.get("payment"),
          v.owner && kind !== "proforma" ? null : v.orgId,
        );
        return r.ok
          ? Response.json(r.doc)
          : Response.json({ error: r.error }, { status: r.status });
      },
      POST: async ({ request }) => {
        const v = await viewer(request);
        if (!v?.owner) return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = (await request.json().catch(() => ({}))) as { requisites?: unknown };
        try {
          return Response.json(await savePlatformRequisites(body.requisites));
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

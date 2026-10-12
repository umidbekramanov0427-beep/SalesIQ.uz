import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Body = {
  id?: string;
  password?: string;
};

export const Route = createFileRoute("/admin/set-employee-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const admin = await requireSuperAdmin(request);
        if (!admin) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const id = body.id?.trim();
        const password = body.password ?? "";
        if (!id) return Response.json({ error: "Employee id is required." }, { status: 400 });
        if (password.length < 8) {
          return Response.json(
            { error: "Password must be at least 8 characters." },
            { status: 400 },
          );
        }

        const { data: target } = await supabaseAdmin
          .from("profiles")
          .select("organization_id, role, email")
          .eq("id", id)
          .maybeSingle();
        if (!target || target.organization_id !== admin.organizationId) {
          return Response.json({ error: "Employee not found." }, { status: 404 });
        }
        if (target.role === "platform_owner") {
          return Response.json(
            { error: "Platform owner accounts can't be edited here." },
            { status: 400 },
          );
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
        if (error) return Response.json({ error: error.message }, { status: 400 });

        return Response.json({ ok: true }, { status: 200 });
      },
    },
  },
});

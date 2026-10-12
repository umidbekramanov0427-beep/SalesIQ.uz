import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  syncOrgAdminCredentials,
  syncOrgAdminEmail,
} from "@/lib/organization-admin-credentials.server";
import type { TablesUpdate } from "@/integrations/supabase/types";

const ALLOWED_ROLES = new Set(["super_admin", "rop", "sotuv_menejeri", "amaliyotchi"]);
// "amaliyotchi" (intern) is stored as a Sotuv menejeri with is_intern = true
// (see 20261016000000_intern_mentor.sql); every other role clears it.
function tashkentToday(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Body = {
  id?: string;
  full_name?: string;
  role?: string;
  password?: string;
  email?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Route = createFileRoute("/platform/update-user")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 403 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const id = body.id?.trim();
        if (!id) return Response.json({ error: "User id is required." }, { status: 400 });

        const { data: target } = await supabaseAdmin
          .from("profiles")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (!target) return Response.json({ error: "User not found." }, { status: 404 });
        if (target["role"] === "platform_owner") {
          return Response.json(
            { error: "Platform owner accounts can't be edited here." },
            { status: 400 },
          );
        }

        if (body.role !== undefined && !ALLOWED_ROLES.has(body.role)) {
          return Response.json({ error: "A valid role is required." }, { status: 400 });
        }
        if (body.password !== undefined && body.password.length < 8) {
          return Response.json(
            { error: "Password must be at least 8 characters." },
            { status: 400 },
          );
        }

        const email = body.email?.trim().toLowerCase();
        const emailChanged = !!email && email !== String(target["email"] ?? "").toLowerCase();
        if (email !== undefined && email !== "" && !EMAIL_RE.test(email)) {
          return Response.json({ error: "A valid email is required." }, { status: 400 });
        }
        // The login itself (Supabase Auth) first: if the address is taken
        // there, nothing else changes.
        if (emailChanged) {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
            email,
            email_confirm: true,
          });
          if (error) return Response.json({ error: error.message }, { status: 400 });
        }

        const profilePatch: TablesUpdate<"profiles"> = {};
        if (emailChanged) profilePatch.email = email;
        if (body.full_name !== undefined) profilePatch.full_name = body.full_name.trim();
        if (body.role === "amaliyotchi") {
          profilePatch.role = "sotuv_menejeri";
          profilePatch.is_intern = true;
          profilePatch.internship_start_date = target["internship_start_date"] ?? tashkentToday();
        } else if (body.role !== undefined) {
          profilePatch.role = body.role as NonNullable<TablesUpdate<"profiles">["role"]>;
          if (target["is_intern"]) profilePatch.is_intern = false;
        }

        if (Object.keys(profilePatch).length > 0) {
          const { error } = await supabaseAdmin.from("profiles").update(profilePatch).eq("id", id);
          if (error) return Response.json({ error: error.message }, { status: 400 });
        }

        const finalEmail = emailChanged ? email! : String(target["email"]);
        if (emailChanged && !body.password && target["organization_id"]) {
          await syncOrgAdminEmail(target["organization_id"], id, finalEmail);
        }

        if (body.password) {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
            password: body.password,
          });
          if (error) return Response.json({ error: error.message }, { status: 400 });

          const finalRole = body.role ?? target["role"];
          if (finalRole === "super_admin" && target["organization_id"]) {
            await syncOrgAdminCredentials(target["organization_id"], id, finalEmail, body.password);
          }
        }

        return Response.json({ ok: true }, { status: 200 });
      },
    },
  },
});

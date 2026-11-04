import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";

// Owner → Sozlamalar → Xavfsizlik: the sign-in code switch.
//   GET            { ready, enabled, smtp }  (smtp: the platform can send email)
//   POST {enabled}
export const Route = createFileRoute("/platform/login-code-setting")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { platformSmtp } = await import("@/lib/login-code.server");
        const { data, error } = await supabaseAdmin
          .from("platform_settings")
          .select("login_code_enabled")
          .eq("id", true)
          .maybeSingle();
        return Response.json({
          ready: !error,
          enabled: !!data?.login_code_enabled,
          smtp: !!platformSmtp(),
        });
      },
      POST: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const b = (await request.json().catch(() => ({}))) as { enabled?: unknown };
        if (typeof b.enabled !== "boolean")
          return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("platform_settings")
          .update({ login_code_enabled: b.enabled })
          .eq("id", true);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const { forgetLoginCodeSetting } = await import("@/lib/login-code.server");
        forgetLoginCodeSetting();
        return Response.json({ ok: true });
      },
    },
  },
});

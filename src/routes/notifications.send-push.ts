import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPush } from "@/lib/push/push.server";

type SendPushBody = {
  assigneeId: string;
  title: string;
  body: string;
  link?: string | null;
};

// Fires the browser push (a real notification, delivered even when the tab
// isn't open) for a task assigned in the browser, which already wrote its
// row into `notifications` itself -- the in-app bell keeps working through
// that RLS-backed insert; this route only adds the push on top, which
// needs the VAPID private key and can't run in the browser.
export const Route = createFileRoute("/notifications/send-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const callerId = await getRequestUserId(request);
        if (!callerId) return Response.json({ error: "Not signed in." }, { status: 401 });

        const { data: caller } = await supabaseAdmin
          .from("profiles")
          .select("organization_id")
          .eq("id", callerId)
          .maybeSingle();
        if (!caller?.organization_id) {
          return Response.json({ error: "Not signed in." }, { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as Partial<SendPushBody>;
        if (!body.assigneeId || !body.title) {
          return Response.json({ error: "assigneeId and title are required." }, { status: 400 });
        }

        const { data: assignee } = await supabaseAdmin
          .from("profiles")
          .select("id, organization_id")
          .eq("id", body.assigneeId)
          .maybeSingle();
        if (!assignee || assignee.organization_id !== caller.organization_id) {
          return Response.json({ error: "Unknown recipient." }, { status: 404 });
        }

        const sent = await sendPush(caller.organization_id, [assignee.id], {
          kind: "task",
          title: `✅ ${body.title}`,
          body: body.body ?? "",
          url: body.link?.startsWith("/") ? body.link : "/funnels?view=tasks",
          tag: `task:${body.title}`.slice(0, 60),
        });
        return Response.json({ sent });
      },
    },
  },
});

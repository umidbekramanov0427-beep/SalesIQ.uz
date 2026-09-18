import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Environment o'zgaruvchisi topilmadi: ${name}. Uni Vercel loyihasi -> Settings -> Environment Variables bo'limiga qo'shing.`,
    );
  return value;
}

type SendPushBody = {
  assigneeId: string;
  title: string;
  body: string;
  link?: string | null;
};

// Fires the actual browser push (real notification, delivered even when the
// tab isn't open) for an event that already wrote its row into the
// `notifications` table client-side -- the two are separate on purpose:
// the in-app bell keeps working exactly as before through the client's own
// RLS-backed insert, this route only adds the push send on top, which
// needs the VAPID private key and can't run in the browser.
export const Route = createFileRoute("/notifications/send-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
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

          const body = (await request.json()) as Partial<SendPushBody>;
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

          const { data: subs } = await supabaseAdmin
            .from("push_subscriptions")
            .select("id, endpoint, p256dh, auth")
            .eq("profile_id", body.assigneeId);
          if (!subs || subs.length === 0) return Response.json({ sent: 0 });

          const webpush = await import("web-push");
          webpush.setVapidDetails(
            requireEnv("VAPID_SUBJECT"),
            requireEnv("VAPID_PUBLIC_KEY"),
            requireEnv("VAPID_PRIVATE_KEY"),
          );

          const payload = JSON.stringify({
            title: body.title,
            body: body.body ?? "",
            url: body.link ?? "/",
          });

          let sent = 0;
          const staleIds: string[] = [];
          await Promise.all(
            subs.map(async (sub) => {
              try {
                await webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                  payload,
                );
                sent += 1;
              } catch (err) {
                // 404/410 = the browser dropped this subscription (uninstalled,
                // cleared data, expired) -- prune it so future sends don't
                // keep paying for a dead endpoint.
                const status = (err as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410) staleIds.push(sub.id);
              }
            }),
          );
          if (staleIds.length > 0) {
            await supabaseAdmin.from("push_subscriptions").delete().in("id", staleIds);
          }

          return Response.json({ sent });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});

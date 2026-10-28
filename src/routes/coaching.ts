import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { baselineFor, coachingOverview } from "@/lib/coaching.server";
import { sendPush } from "@/lib/push/push.server";

// The coaching cycle (Sinfxona → Mashqlar):
//   GET  /coaching -> each manager's weakest script step and the tasks with
//        their before/after rates (a manager sees only their own).
//   POST /coaching { action: "create", profileId, criterion, task, lessonId?, dueDate? }
//        (head of sales / admin) -- the "before" rate is stored with it.
//   POST /coaching { action: "done", id }   (the manager or their boss)
//   POST /coaching { action: "delete", id } (head of sales / admin)

const MISSING = "Murabbiylik hali yoqilmagan (bazaga yangilanish kerak).";

async function whoIs(request: Request) {
  const caller = await requireOrgMember(request);
  if (!caller) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  const boss = ["super_admin", "rop", "platform_owner"].includes(data?.role ?? "");
  // A head of sales coaches their own team; an admin the whole company.
  let team: string[] | null = null;
  if (data?.role === "rop") {
    const { data: members } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("organization_id", caller.organizationId)
      .eq("manager_id", caller.id);
    team = [caller.id, ...(members ?? []).map((m) => m.id)];
  }
  return { ...caller, boss, team };
}

export const Route = createFileRoute("/coaching")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await whoIs(request);
        if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });
        try {
          const data = await coachingOverview(me.organizationId, {
            id: me.id,
            boss: me.boss,
            team: me.team,
          });
          return Response.json({ ...data, boss: me.boss });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Failed" },
            { status: 500 },
          );
        }
      },
      POST: async ({ request }) => {
        const me = await whoIs(request);
        if (!me) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const org = me.organizationId;
        const action = body["action"];

        if (action === "create") {
          if (!me.boss) return Response.json({ error: "Faqat rahbar" }, { status: 403 });
          const profileId = typeof body["profileId"] === "string" ? body["profileId"] : "";
          const criterion = String(body["criterion"] ?? "")
            .trim()
            .slice(0, 200);
          const task = String(body["task"] ?? "")
            .trim()
            .slice(0, 1000);
          if (!criterion || !task)
            return Response.json({ error: "Mezon va topshiriqni yozing" }, { status: 400 });
          if (me.team && !me.team.includes(profileId))
            return Response.json({ error: "Bu xodim sizning jamoangizda emas" }, { status: 403 });
          const { data: target } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("id", profileId)
            .eq("organization_id", org)
            .maybeSingle();
          if (!target) return Response.json({ error: "Xodim topilmadi" }, { status: 404 });
          const lessonId =
            typeof body["lessonId"] === "string" && /^[0-9a-f-]{36}$/i.test(body["lessonId"])
              ? body["lessonId"]
              : null;
          const dueDate =
            typeof body["dueDate"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body["dueDate"])
              ? body["dueDate"]
              : null;
          const before = await baselineFor(org, profileId, criterion);
          const { data, error } = await supabaseAdmin
            .from("coaching_tasks")
            .insert({
              organization_id: org,
              profile_id: profileId,
              criterion,
              task,
              lesson_id: lessonId,
              due_date: dueDate,
              baseline_rate: before.total > 0 ? before.rate : null,
              baseline_calls: before.total,
              created_by: me.id,
            })
            .select("id")
            .single();
          if (error)
            return Response.json(
              { error: /coaching_tasks/.test(error.message) ? MISSING : error.message },
              { status: 500 },
            );
          const title = "🎯 Yangi mashq";
          const text = `"${criterion}" bosqichi: ${task}`;
          await supabaseAdmin
            .from("notifications")
            .insert({
              organization_id: org,
              user_id: profileId,
              type: "Coaching",
              title,
              body: text.slice(0, 300),
              link: "/content-library?tab=coaching",
            })
            .then(
              () => undefined,
              () => undefined,
            );
          await sendPush(org, [profileId], {
            kind: "task",
            title,
            body: text.slice(0, 160),
            url: "/content-library?tab=coaching",
            tag: `coaching:${data.id}`,
          }).catch(() => undefined);
          return Response.json({ ok: true, id: data.id });
        }

        const id = typeof body["id"] === "string" ? body["id"] : "";
        const { data: row } = await supabaseAdmin
          .from("coaching_tasks")
          .select("id, profile_id")
          .eq("id", id)
          .eq("organization_id", org)
          .maybeSingle();
        if (!row) return Response.json({ error: "Topilmadi" }, { status: 404 });

        const inTeam = !me.team || me.team.includes(row.profile_id);
        if (action === "done") {
          if (!(me.boss && inTeam) && row.profile_id !== me.id)
            return Response.json({ error: "Ruxsat yo'q" }, { status: 403 });
          await supabaseAdmin
            .from("coaching_tasks")
            .update({ status: "done", done_at: new Date().toISOString() })
            .eq("id", row.id)
            .eq("organization_id", org);
          return Response.json({ ok: true });
        }
        if (action === "delete") {
          if (!me.boss || !inTeam) return Response.json({ error: "Faqat rahbar" }, { status: 403 });
          await supabaseAdmin
            .from("coaching_tasks")
            .delete()
            .eq("id", row.id)
            .eq("organization_id", org);
          return Response.json({ ok: true });
        }
        return Response.json({ error: "Unknown action" }, { status: 400 });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { APPLICATION_STATUSES, NOTE_KINDS, parseApplication } from "@/lib/applications";
import { CURRENT_TOOLS } from "@/lib/company-leads";
import type { Database } from "@/integrations/supabase/types";

type AppUpdate = Database["public"]["Tables"]["platform_applications"]["Update"];

// Owner -> Arizalar API (platform owners only): the platform's CRM of
// companies (company-leads.ts / company-leads.server.ts).
//   GET                 every lead (newest first) with its counts and its
//                       company's phase
//   GET ?id=            one lead: its timeline (signed file links), tasks and
//                       the facts of its company
//   POST {..}           add one by hand
//   POST {action, ..}   task / taskDone / taskDelete / resolve / meeting / link
//   POST multipart      add a timeline item: id, kind, body, amount, file?
//   PATCH {id, ..}      stage (lost needs a reason) / amount / fields / owner
//   DELETE ?id=         remove a lead and its files
//   DELETE ?note=       remove one timeline item (and its file)
const BUCKET = "platform-files";
const MAX_FILE = 15 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/i;
const NOT_READY = "Bu imkoniyat bazani yangilagandan keyin ishlaydi.";

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\s/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const iso = (v: unknown) => {
  if (typeof v !== "string" || !v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const fail = (error: { message: string; code?: string } | null, status = 500) =>
  Response.json(
    {
      error:
        error && /column|does not exist|check constraint|schema cache/i.test(error.message)
          ? NOT_READY
          : (error?.message ?? "SAVE_FAILED"),
    },
    { status },
  );

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function touch(appId: string) {
  const db = await admin();
  const now = new Date().toISOString();
  const { error } = await db
    .from("platform_applications")
    .update({ updated_at: now, last_activity_at: now })
    .eq("id", appId);
  if (error) await db.from("platform_applications").update({ updated_at: now }).eq("id", appId);
}

export const Route = createFileRoute("/platform/applications-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const db = await admin();
        const id = new URL(request.url).searchParams.get("id");
        if (id) {
          if (!UUID.test(id)) return Response.json({ error: "BAD_ID" }, { status: 400 });
          const [{ data: app }, { data: notes }, tasks] = await Promise.all([
            db.from("platform_applications").select("*").eq("id", id).maybeSingle(),
            db
              .from("platform_application_notes")
              .select("*")
              .eq("application_id", id)
              .order("created_at", { ascending: false }),
            db
              .from("platform_lead_tasks")
              .select("*")
              .eq("application_id", id)
              .order("created_at", { ascending: false }),
          ]);
          if (!app) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
          const paths = (notes ?? []).map((n) => n.file_path).filter((p): p is string => !!p);
          const links = new Map<string, string>();
          if (paths.length) {
            const { data: signed } = await db.storage.from(BUCKET).createSignedUrls(paths, 3600);
            for (const s of signed ?? []) if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
          }
          const authorIds = [
            ...new Set(
              [
                ...(notes ?? []).map((n) => n.created_by),
                ...(tasks.data ?? []).map((t) => t.created_by),
              ].filter((x): x is string => !!x),
            ),
          ];
          const { data: authors } = authorIds.length
            ? await db.from("profiles").select("id, full_name").in("id", authorIds)
            : { data: [] as { id: string; full_name: string | null }[] };
          const name = (uid: string | null) =>
            authors?.find((a) => a.id === uid)?.full_name ?? null;
          const openIssues = (notes ?? []).filter(
            (n) => n.kind === "issue" && !(n as { resolved_at?: string | null }).resolved_at,
          ).length;
          const { loadLeadFacts } = await import("@/lib/company-leads.server");
          const facts = app.organization_id
            ? await loadLeadFacts(app.organization_id, openIssues).catch(() => null)
            : null;
          // A lead from the website form may already have a company: same email.
          let matches: { id: string; name: string }[] = [];
          if (!app.organization_id && app.email) {
            const { data: same } = await db
              .from("profiles")
              .select("organization_id")
              .ilike("email", app.email)
              .not("organization_id", "is", null)
              .limit(3);
            const orgIds = [
              ...new Set(
                (same ?? []).map((p) => p.organization_id).filter((x): x is string => !!x),
              ),
            ];
            if (orgIds.length) {
              const { data: orgs } = await db
                .from("organizations")
                .select("id, name")
                .in("id", orgIds);
              matches = orgs ?? [];
            }
          }
          return Response.json({
            app,
            notes: (notes ?? []).map((n) => ({
              ...n,
              url: n.file_path ? (links.get(n.file_path) ?? null) : null,
              author: name(n.created_by),
            })),
            tasks: (tasks.data ?? []).map((t) => ({ ...t, author: name(t.created_by) })),
            tasksReady: !tasks.error,
            facts,
            matches,
          });
        }

        const [{ data, error }, { data: notes }, tasks, owners] = await Promise.all([
          db
            .from("platform_applications")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1000),
          db.from("platform_application_notes").select("*").limit(10000),
          db
            .from("platform_lead_tasks")
            .select("application_id, due_at, done_at")
            .is("done_at", null)
            .limit(5000),
          db.from("profiles").select("id, full_name").eq("role", "platform_owner"),
        ]);
        if (error) return Response.json({ ready: false, items: [] });
        const counts = new Map<
          string,
          { notes: number; paid: number; issues: number; tasks: number; overdue: number }
        >();
        const get = (k: string) => {
          let c = counts.get(k);
          if (!c) counts.set(k, (c = { notes: 0, paid: 0, issues: 0, tasks: 0, overdue: 0 }));
          return c;
        };
        for (const n of notes ?? []) {
          const c = get(n.application_id);
          c.notes++;
          if (n.kind === "receipt") c.paid += Number(n.amount ?? 0);
          if (n.kind === "issue" && !(n as { resolved_at?: string | null }).resolved_at) c.issues++;
        }
        const now = Date.now();
        for (const t of tasks.data ?? []) {
          if (!t.application_id) continue;
          const c = get(t.application_id);
          c.tasks++;
          if (t.due_at && new Date(t.due_at).getTime() < now) c.overdue++;
        }
        const orgIds = [
          ...new Set((data ?? []).map((a) => a.organization_id).filter((x): x is string => !!x)),
        ];
        const { data: orgs } = orgIds.length
          ? await db.from("organizations").select("*").in("id", orgIds)
          : { data: [] };
        const orgOf = new Map((orgs ?? []).map((o) => [o.id, o]));
        return Response.json({
          ready: true,
          stagesReady: (data ?? []).every((a) => "stage_changed_at" in a) || !(data ?? []).length,
          owners: owners.data ?? [],
          items: (data ?? []).map((a) => {
            const o = a.organization_id ? orgOf.get(a.organization_id) : undefined;
            const c = counts.get(a.id);
            return {
              ...a,
              notes: c?.notes ?? 0,
              paid: c?.paid ?? 0,
              issues: c?.issues ?? 0,
              tasks: c?.tasks ?? 0,
              overdue: c?.overdue ?? 0,
              org: o
                ? {
                    id: o.id,
                    name: o.name,
                    plan: o.plan,
                    isTrial: !!o.is_trial,
                    active: o.active !== false,
                    trialEndsAt: o.trial_ends_at,
                    frozen: !!(o as { frozen_at?: string | null }).frozen_at,
                  }
                : null,
            };
          }),
        });
      },

      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const db = await admin();

        // A timeline item, maybe with a file.
        if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
          const form = await request.formData();
          const appId = String(form.get("id") ?? "");
          if (!UUID.test(appId)) return Response.json({ error: "BAD_ID" }, { status: 400 });
          const kindRaw = String(form.get("kind") ?? "note");
          const kind = (NOTE_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "note";
          const body = String(form.get("body") ?? "")
            .trim()
            .slice(0, 4000);
          const file = form.get("file");
          let filePath: string | null = null;
          let fileName: string | null = null;
          let fileSize: number | null = null;
          if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0) {
            if (file.size > MAX_FILE) return Response.json({ error: "TOO_BIG" }, { status: 413 });
            fileName = (file.name || "file").slice(0, 160);
            fileSize = file.size;
            const safe = fileName.replace(/[^\w.-]+/g, "_").slice(-80);
            filePath = `applications/${appId}/${Date.now()}-${safe}`;
            const { error: upErr } = await db.storage
              .from(BUCKET)
              .upload(filePath, await file.arrayBuffer(), {
                contentType: file.type || "application/octet-stream",
              });
            if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
          }
          if (!body && !filePath) return Response.json({ error: "EMPTY" }, { status: 400 });
          const { error } = await db.from("platform_application_notes").insert({
            application_id: appId,
            kind,
            body,
            amount: kind === "receipt" ? num(form.get("amount")) : null,
            file_path: filePath,
            file_name: fileName,
            file_size: fileSize,
            created_by: ownerId,
          });
          if (error) return fail(error);
          await touch(appId);
          return Response.json({ ok: true });
        }

        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const action = typeof b["action"] === "string" ? b["action"] : "";

        // Platforma -> Xatoliklar: an error a company ran into becomes an open
        // issue on that company's lead card (its newest application).
        if (action === "issueFromError") {
          const errorId = str(b["errorId"], 40);
          if (!UUID.test(errorId)) return Response.json({ error: "BAD_ID" }, { status: 400 });
          const { data: err } = await db
            .from("error_logs")
            .select("organization_id, message, route, created_at, source")
            .eq("id", errorId)
            .maybeSingle();
          if (!err?.organization_id)
            return Response.json({ error: "Bu xato kompaniyaga bog'lanmagan" }, { status: 400 });
          const { data: app } = await db
            .from("platform_applications")
            .select("id")
            .eq("organization_id", err.organization_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!app)
            return Response.json(
              { error: "Bu kompaniyaning Arizalarda kartasi yo'q" },
              { status: 404 },
            );
          const count = Math.max(1, Math.min(9999, Number(b["count"]) || 1));
          const body = [
            `Xato: ${err.message.slice(0, 1500)}`,
            err.route ? `Sahifa: ${err.route}` : null,
            `Turi: ${err.source} · ${count} marta · oxirgisi ${err.created_at.slice(0, 16).replace("T", " ")} UTC`,
          ]
            .filter(Boolean)
            .join("\n");
          const { error } = await db.from("platform_application_notes").insert({
            application_id: app.id,
            kind: "issue",
            body,
            created_by: ownerId,
          });
          if (error) return fail(error);
          await touch(app.id);
          return Response.json({ ok: true, appId: app.id });
        }

        if (action === "task") {
          const appId = str(b["id"], 40);
          if (!UUID.test(appId)) return Response.json({ error: "BAD_ID" }, { status: 400 });
          const title = str(b["title"], 300);
          if (!title) return Response.json({ error: "EMPTY" }, { status: 400 });
          const audience = ["owner", "company", "both"].includes(String(b["audience"]))
            ? String(b["audience"])
            : "owner";
          const { data: app } = await db
            .from("platform_applications")
            .select("organization_id")
            .eq("id", appId)
            .maybeSingle();
          if (audience !== "owner" && !app?.organization_id)
            return Response.json(
              { error: "Bu lid hali kompaniyaga bog'lanmagan" },
              { status: 400 },
            );
          const { error } = await db.from("platform_lead_tasks").insert({
            application_id: appId,
            organization_id: app?.organization_id ?? null,
            title,
            body: str(b["body"], 2000),
            due_at: iso(b["dueAt"]),
            audience,
            created_by: ownerId,
          });
          if (error) return fail(error);
          await touch(appId);
          return Response.json({ ok: true });
        }

        if (action === "taskDone" || action === "taskDelete") {
          const taskId = str(b["taskId"], 40);
          if (!UUID.test(taskId)) return Response.json({ error: "BAD_ID" }, { status: 400 });
          const q =
            action === "taskDelete"
              ? db.from("platform_lead_tasks").delete().eq("id", taskId)
              : db
                  .from("platform_lead_tasks")
                  .update(
                    b["done"] === false
                      ? { done_at: null, done_by: null }
                      : { done_at: new Date().toISOString(), done_by: ownerId },
                  )
                  .eq("id", taskId);
          const { error } = await q;
          return error ? fail(error) : Response.json({ ok: true });
        }

        if (action === "resolve") {
          const noteId = str(b["noteId"], 40);
          if (!UUID.test(noteId)) return Response.json({ error: "BAD_ID" }, { status: 400 });
          const reopen = b["reopen"] === true;
          const { error } = await db
            .from("platform_application_notes")
            .update(
              reopen
                ? { resolved_at: null, resolution: null }
                : {
                    resolved_at: new Date().toISOString(),
                    resolution: str(b["resolution"], 2000) || null,
                  },
            )
            .eq("id", noteId)
            .eq("kind", "issue");
          return error ? fail(error) : Response.json({ ok: true });
        }

        if (action === "meeting") {
          const appId = str(b["id"], 40);
          if (!UUID.test(appId)) return Response.json({ error: "BAD_ID" }, { status: 400 });
          const at = iso(b["at"]);
          const note = str(b["note"], 500) || null;
          const { data: before } = await db
            .from("platform_applications")
            .select("status")
            .eq("id", appId)
            .maybeSingle();
          const patch: AppUpdate = { meeting_at: at, meeting_note: note };
          if (at && before && ["new", "taken", "informed"].includes(before.status)) {
            patch.status = "meeting";
            patch.stage_changed_at = new Date().toISOString();
          }
          const { error } = await db.from("platform_applications").update(patch).eq("id", appId);
          if (error)
            return error.code === "23505"
              ? Response.json({ error: "Bu vaqtga boshqa suhbat belgilangan" }, { status: 409 })
              : fail(error);
          if (at) {
            await db.from("platform_application_notes").insert({
              application_id: appId,
              kind: "meeting",
              body: [at, note].filter(Boolean).join(" · "),
              created_by: ownerId,
            });
          }
          if (patch.status && before) {
            await db.from("platform_application_notes").insert({
              application_id: appId,
              kind: "status",
              body: `${before.status}→meeting`,
              created_by: ownerId,
            });
          }
          await touch(appId);
          return Response.json({ ok: true });
        }

        if (action === "link") {
          const appId = str(b["id"], 40);
          const orgId = b["orgId"] === null ? null : str(b["orgId"], 40);
          if (!UUID.test(appId) || (orgId !== null && !UUID.test(orgId)))
            return Response.json({ error: "BAD_ID" }, { status: 400 });
          const { error } = await db
            .from("platform_applications")
            .update({ organization_id: orgId })
            .eq("id", appId);
          if (error) return fail(error);
          if (orgId)
            await db
              .from("platform_lead_tasks")
              .update({ organization_id: orgId })
              .eq("application_id", appId);
          return Response.json({ ok: true });
        }

        // A new lead written by hand.
        const parsed = parseApplication({ ...b, source: "manual" });
        if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
        const a = parsed.value;
        const base = {
          name: a.name,
          phone: a.phone,
          email: a.email,
          company: a.company,
          team_size: a.teamSize,
          message: a.message,
          source: "manual",
          amount: num(b["amount"]),
        };
        const extra = {
          sales_reps: a.teamSize,
          business: str(b["business"], 300) || null,
          plan: str(b["plan"], 20) || null,
          current_tool: (CURRENT_TOOLS as readonly string[]).includes(String(b["currentTool"]))
            ? String(b["currentTool"])
            : null,
        };
        let res = await db
          .from("platform_applications")
          .insert({ ...base, ...extra })
          .select("id")
          .single();
        if (res.error)
          res = await db.from("platform_applications").insert(base).select("id").single();
        if (res.error || !res.data) return fail(res.error);
        return Response.json({ ok: true, id: res.data.id });
      },

      PATCH: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const id = typeof b["id"] === "string" ? b["id"] : "";
        if (!UUID.test(id)) return Response.json({ error: "BAD_ID" }, { status: 400 });
        const now = new Date().toISOString();
        const patch: AppUpdate = { updated_at: now, last_activity_at: now };
        const status = b["status"];
        if (typeof status === "string") {
          if (!(APPLICATION_STATUSES as readonly string[]).includes(status))
            return Response.json({ error: "BAD_STATUS" }, { status: 400 });
          patch.status = status;
          patch.stage_changed_at = now;
          if (status === "lost") {
            const reason = str(b["lostReason"], 500);
            if (!reason) return Response.json({ error: "LOST_REASON" }, { status: 400 });
            patch.lost_reason = reason;
          }
        }
        if ("amount" in b) patch.amount = num(b["amount"]);
        if ("assignedTo" in b)
          patch.assigned_to =
            typeof b["assignedTo"] === "string" && UUID.test(b["assignedTo"])
              ? b["assignedTo"]
              : null;
        for (const [k, col, max, required] of [
          ["name", "name", 120, true],
          ["phone", "phone", 40, true],
          ["company", "company", 160, false],
          ["email", "email", 160, false],
          ["business", "business", 300, false],
          ["salesReps", "sales_reps", 20, false],
          ["currentTool", "current_tool", 120, false],
          ["plan", "plan", 20, false],
        ] as const) {
          if (typeof b[k] === "string") {
            const v = (b[k] as string).trim().slice(0, max);
            if (required) {
              if (v) (patch as Record<string, unknown>)[col] = v;
            } else (patch as Record<string, unknown>)[col] = v || null;
          }
        }
        const db = await admin();
        const { data: before } = await db
          .from("platform_applications")
          .select("status")
          .eq("id", id)
          .maybeSingle();
        const { error } = await db.from("platform_applications").update(patch).eq("id", id);
        if (error) return fail(error);
        // A stage change goes on the timeline too.
        if (patch.status && before && before.status !== patch.status) {
          await db.from("platform_application_notes").insert({
            application_id: id,
            kind: "status",
            body:
              `${before.status}→${String(patch.status)}` +
              (patch.lost_reason ? ` · ${String(patch.lost_reason)}` : ""),
            created_by: ownerId,
          });
        }
        return Response.json({ ok: true });
      },

      DELETE: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const db = await admin();
        const noteId = url.searchParams.get("note");
        if (noteId) {
          if (!UUID.test(noteId)) return Response.json({ error: "BAD_ID" }, { status: 400 });
          const { data: n } = await db
            .from("platform_application_notes")
            .select("file_path")
            .eq("id", noteId)
            .maybeSingle();
          if (n?.file_path) await db.storage.from(BUCKET).remove([n.file_path]);
          await db.from("platform_application_notes").delete().eq("id", noteId);
          return Response.json({ ok: true });
        }
        const id = url.searchParams.get("id") ?? "";
        if (!UUID.test(id)) return Response.json({ error: "BAD_ID" }, { status: 400 });
        const { data: files } = await db
          .from("platform_application_notes")
          .select("file_path")
          .eq("application_id", id)
          .not("file_path", "is", null);
        const paths = (files ?? []).map((f) => f.file_path).filter((p): p is string => !!p);
        if (paths.length) await db.storage.from(BUCKET).remove(paths);
        const { error } = await db.from("platform_applications").delete().eq("id", id);
        return error ? fail(error) : Response.json({ ok: true });
      },
    },
  },
});

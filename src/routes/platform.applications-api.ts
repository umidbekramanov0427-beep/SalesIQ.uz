import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import { APPLICATION_STATUSES, NOTE_KINDS, parseApplication } from "@/lib/applications";

// Owner → Arizalar API (platform owners only).
//   GET                 every application (newest first) with its notes count
//   GET ?id=            one application and its timeline (signed file links)
//   POST {..}           add one by hand (a call, a meeting...)
//   POST multipart      add a timeline item: id, kind, body, amount, file?
//   PATCH {id, ..}      status / amount / contact fields
//   DELETE ?id=         remove an application and its files
//   DELETE ?note=       remove one timeline item (and its file)
const BUCKET = "platform-files";
const MAX_FILE = 15 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/i;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\s/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export const Route = createFileRoute("/platform/applications-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const id = new URL(request.url).searchParams.get("id");
        if (id) {
          if (!UUID.test(id)) return Response.json({ error: "BAD_ID" }, { status: 400 });
          const [{ data: app }, { data: notes }] = await Promise.all([
            supabaseAdmin.from("platform_applications").select("*").eq("id", id).maybeSingle(),
            supabaseAdmin
              .from("platform_application_notes")
              .select("*")
              .eq("application_id", id)
              .order("created_at", { ascending: false }),
          ]);
          if (!app) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
          const paths = (notes ?? []).map((n) => n.file_path).filter((p): p is string => !!p);
          const links = new Map<string, string>();
          if (paths.length) {
            const { data: signed } = await supabaseAdmin.storage
              .from(BUCKET)
              .createSignedUrls(paths, 3600);
            for (const s of signed ?? []) if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
          }
          const authorIds = [
            ...new Set((notes ?? []).map((n) => n.created_by).filter((x): x is string => !!x)),
          ];
          const { data: authors } = authorIds.length
            ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", authorIds)
            : { data: [] as { id: string; full_name: string | null }[] };
          return Response.json({
            app,
            notes: (notes ?? []).map((n) => ({
              ...n,
              url: n.file_path ? (links.get(n.file_path) ?? null) : null,
              author: authors?.find((a) => a.id === n.created_by)?.full_name ?? null,
            })),
          });
        }
        const [{ data, error }, { data: notes }] = await Promise.all([
          supabaseAdmin
            .from("platform_applications")
            .select(
              "id, name, phone, email, company, team_size, message, source, status, amount, created_at, updated_at",
            )
            .order("created_at", { ascending: false })
            .limit(500),
          supabaseAdmin
            .from("platform_application_notes")
            .select("application_id, kind, amount")
            .limit(5000),
        ]);
        if (error) return Response.json({ ready: false, items: [] });
        const counts = new Map<string, { notes: number; paid: number }>();
        for (const n of notes ?? []) {
          const c = counts.get(n.application_id) ?? { notes: 0, paid: 0 };
          c.notes++;
          if (n.kind === "receipt") c.paid += Number(n.amount ?? 0);
          counts.set(n.application_id, c);
        }
        return Response.json({
          ready: true,
          items: (data ?? []).map((a) => ({
            ...a,
            notes: counts.get(a.id)?.notes ?? 0,
            paid: counts.get(a.id)?.paid ?? 0,
          })),
        });
      },

      POST: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
            const { error: upErr } = await supabaseAdmin.storage
              .from(BUCKET)
              .upload(filePath, await file.arrayBuffer(), {
                contentType: file.type || "application/octet-stream",
              });
            if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
          }
          if (!body && !filePath) return Response.json({ error: "EMPTY" }, { status: 400 });
          const { error } = await supabaseAdmin.from("platform_application_notes").insert({
            application_id: appId,
            kind,
            body,
            amount: kind === "receipt" ? num(form.get("amount")) : null,
            file_path: filePath,
            file_name: fileName,
            file_size: fileSize,
            created_by: ownerId,
          });
          if (error) return Response.json({ error: error.message }, { status: 500 });
          await supabaseAdmin
            .from("platform_applications")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", appId);
          return Response.json({ ok: true });
        }

        // A new application written by hand.
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const parsed = parseApplication({ ...b, source: "manual" });
        if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
        const a = parsed.value;
        const { data, error } = await supabaseAdmin
          .from("platform_applications")
          .insert({
            name: a.name,
            phone: a.phone,
            email: a.email,
            company: a.company,
            team_size: a.teamSize,
            message: a.message,
            source: "manual",
            amount: num(b["amount"]),
          })
          .select("id")
          .single();
        if (error || !data)
          return Response.json({ error: error?.message ?? "SAVE_FAILED" }, { status: 500 });
        return Response.json({ ok: true, id: data.id });
      },

      PATCH: async ({ request }) => {
        const ownerId = await requirePlatformOwner(request);
        if (!ownerId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const id = typeof b["id"] === "string" ? b["id"] : "";
        if (!UUID.test(id)) return Response.json({ error: "BAD_ID" }, { status: 400 });
        const patch: {
          updated_at: string;
          status?: string;
          amount?: number | null;
          name?: string;
          company?: string | null;
          email?: string | null;
          phone?: string;
        } = { updated_at: new Date().toISOString() };
        const status = b["status"];
        if (typeof status === "string") {
          if (!(APPLICATION_STATUSES as readonly string[]).includes(status))
            return Response.json({ error: "BAD_STATUS" }, { status: 400 });
          patch.status = status;
        }
        if ("amount" in b) patch.amount = num(b["amount"]);
        for (const [k, col, max] of [
          ["name", "name", 120],
          ["company", "company", 160],
          ["email", "email", 160],
          ["phone", "phone", 40],
        ] as const) {
          if (typeof b[k] === "string") {
            const v = (b[k] as string).trim().slice(0, max);
            if (col === "name" || col === "phone") {
              if (v) patch[col] = v;
            } else patch[col] = v || null;
          }
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: before } = await supabaseAdmin
          .from("platform_applications")
          .select("status")
          .eq("id", id)
          .maybeSingle();
        const { error } = await supabaseAdmin
          .from("platform_applications")
          .update(patch)
          .eq("id", id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        // A status change goes on the timeline too.
        if (patch.status && before && before.status !== patch.status) {
          await supabaseAdmin.from("platform_application_notes").insert({
            application_id: id,
            kind: "status",
            body: `${before.status}→${patch.status}`,
            created_by: ownerId,
          });
        }
        return Response.json({ ok: true });
      },

      DELETE: async ({ request }) => {
        if (!(await requirePlatformOwner(request)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const noteId = url.searchParams.get("note");
        if (noteId) {
          if (!UUID.test(noteId)) return Response.json({ error: "BAD_ID" }, { status: 400 });
          const { data: n } = await supabaseAdmin
            .from("platform_application_notes")
            .select("file_path")
            .eq("id", noteId)
            .maybeSingle();
          if (n?.file_path) await supabaseAdmin.storage.from(BUCKET).remove([n.file_path]);
          await supabaseAdmin.from("platform_application_notes").delete().eq("id", noteId);
          return Response.json({ ok: true });
        }
        const id = url.searchParams.get("id") ?? "";
        if (!UUID.test(id)) return Response.json({ error: "BAD_ID" }, { status: 400 });
        const { data: files } = await supabaseAdmin
          .from("platform_application_notes")
          .select("file_path")
          .eq("application_id", id)
          .not("file_path", "is", null);
        const paths = (files ?? []).map((f) => f.file_path).filter((p): p is string => !!p);
        if (paths.length) await supabaseAdmin.storage.from(BUCKET).remove(paths);
        const { error } = await supabaseAdmin.from("platform_applications").delete().eq("id", id);
        return error
          ? Response.json({ error: error.message }, { status: 500 })
          : Response.json({ ok: true });
      },
    },
  },
});

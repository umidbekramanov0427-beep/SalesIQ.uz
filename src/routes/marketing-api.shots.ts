import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireMarketingMember } from "@/lib/marketing.server";
import { MAX_SHOT_BYTES, deleteShot, listShots, saveShot } from "@/lib/marketing-shots.server";

// Marketing paneli -> Rasmlar.
//   GET    ?project=<id> | ?webinar=<id>  -> the pictures with 10-minute links
//   POST   multipart {file, webinar?, project?, viewers?} -> a picture added by hand
//   DELETE ?id=<shot id>
// Marketing people of the company only.
export const Route = createFileRoute("/marketing-api/shots")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const url = new URL(request.url);
        const projectId = url.searchParams.get("project");
        const webinarId = url.searchParams.get("webinar");
        if (!projectId && !webinarId) return Response.json({ shots: [] });
        try {
          return Response.json({
            shots: await listShots(caller.organizationId, { projectId, webinarId }),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "error";
          if (/marketing_shots|does not exist|schema cache/i.test(msg))
            return Response.json({ shots: [] });
          return Response.json({ error: msg }, { status: 400 });
        }
      },
      POST: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File) || !file.type.startsWith("image/"))
          return Response.json({ error: "Rasm fayl kerak" }, { status: 400 });
        if (file.size > MAX_SHOT_BYTES)
          return Response.json({ error: "Rasm 8 MB dan katta" }, { status: 400 });
        let webinarId = String(form?.get("webinar") ?? "") || null;
        let projectId = String(form?.get("project") ?? "") || null;
        const viewersRaw = Number(form?.get("viewers"));
        // The webinar must be the company's; its project comes with it.
        if (webinarId) {
          const { data: w } = await supabaseAdmin
            .from("marketing_webinars")
            .select("id, project_id")
            .eq("organization_id", caller.organizationId)
            .eq("id", webinarId)
            .maybeSingle();
          if (!w) webinarId = null;
          else projectId = projectId ?? w.project_id;
        }
        if (projectId) {
          const { data: p } = await supabaseAdmin
            .from("marketing_projects")
            .select("id")
            .eq("organization_id", caller.organizationId)
            .eq("id", projectId)
            .maybeSingle();
          if (!p) projectId = null;
        }
        try {
          const id = await saveShot({
            orgId: caller.organizationId,
            webinarId,
            projectId,
            viewers: Number.isFinite(viewersRaw) && viewersRaw >= 0 ? Math.round(viewersRaw) : null,
            source: "manual",
            image: { data: new Uint8Array(await file.arrayBuffer()), type: file.type },
            createdBy: caller.id,
          });
          return Response.json({ id });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Saqlab bo'lmadi" },
            { status: 400 },
          );
        }
      },
      DELETE: async ({ request }) => {
        const caller = await requireMarketingMember(request);
        if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return Response.json({ error: "Bad request" }, { status: 400 });
        await deleteShot(caller.organizationId, id);
        return Response.json({ ok: true });
      },
    },
  },
});

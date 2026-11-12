// Server-only. Marketing paneli -> Rasmlar: proof pictures of live webinars
// (marketing_shots) in the private lead-files bucket under
// <org>/marketing/shots/. The cron saves frames (YouTube's live thumbnail,
// the Telegram stream through the connected account) or, when no frame can
// be taken, a card row (time + viewers, no file); people can upload their
// own. Links handed to the browser are signed for 10 minutes.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "lead-files";
export const MAX_SHOT_BYTES = 8 * 1024 * 1024;

export async function saveShot(input: {
  orgId: string;
  webinarId: string | null;
  projectId: string | null;
  channelId?: string | null;
  viewers: number | null;
  source: "youtube" | "telegram" | "manual";
  image: { data: Uint8Array | ArrayBuffer; type: string } | null;
  createdBy?: string | null;
  at?: Date;
}): Promise<string> {
  const at = input.at ?? new Date();
  let path: string | null = null;
  if (input.image) {
    const ext = input.image.type.includes("png") ? "png" : "jpg";
    path = `${input.orgId}/marketing/shots/${input.webinarId ?? "project"}/${at.getTime()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, input.image.data, { contentType: input.image.type, upsert: false });
    if (error) throw error;
  }
  const { data, error } = await supabaseAdmin
    .from("marketing_shots")
    .insert({
      organization_id: input.orgId,
      webinar_id: input.webinarId,
      project_id: input.projectId,
      channel_id: input.channelId ?? null,
      at: at.toISOString(),
      viewers: input.viewers,
      path,
      source: input.source,
      kind: path ? "frame" : "card",
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** A project's or a webinar's pictures with signed links, oldest first. */
export async function listShots(
  orgId: string,
  filter: { projectId?: string | null; webinarId?: string | null },
) {
  let q = supabaseAdmin
    .from("marketing_shots")
    .select("*")
    .eq("organization_id", orgId)
    .order("at")
    .limit(2000);
  if (filter.webinarId) q = q.eq("webinar_id", filter.webinarId);
  if (filter.projectId) {
    // A project's pictures: its own and those of its webinars.
    const { data: ws } = await supabaseAdmin
      .from("marketing_webinars")
      .select("id")
      .eq("organization_id", orgId)
      .eq("project_id", filter.projectId);
    const ids = (ws ?? []).map((w) => w.id);
    q = ids.length
      ? q.or(`project_id.eq.${filter.projectId},webinar_id.in.(${ids.join(",")})`)
      : q.eq("project_id", filter.projectId);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  const paths = rows.map((r) => r.path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 100) {
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrls(paths.slice(i, i + 100), 60 * 10);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return rows.map((r) => ({ ...r, url: r.path ? (urls.get(r.path) ?? null) : null }));
}

export async function deleteShot(orgId: string, id: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("marketing_shots")
    .select("path")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return;
  if (data.path)
    await supabaseAdmin.storage
      .from(BUCKET)
      .remove([data.path])
      .catch(() => undefined);
  await supabaseAdmin.from("marketing_shots").delete().eq("organization_id", orgId).eq("id", id);
}

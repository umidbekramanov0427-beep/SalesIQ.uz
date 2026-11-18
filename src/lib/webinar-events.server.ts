// Server-only. A webinar's counts and moments written by the server itself:
// a viewer count per source (YouTube and Telegram in the same minute both
// kept), the stored peak (per source and in total, with its time), and the
// events that need no one to press a button -- the YouTube / Telegram
// stream going live and an SMS broadcast sent while a webinar is live.
// Everything here degrades quietly until migration 20270128 has run.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { combineSamples, nextSeq, peaks, type EventKind } from "@/lib/webinar-timeline";

type SampleRow = {
  webinar_id: string;
  organization_id: string;
  at: string;
  viewers: number;
  source: "youtube" | "telegram" | "manual";
};

const noConstraint = (msg: string | undefined) =>
  !!msg && /no unique or exclusion constraint/i.test(msg);

/** One count; before the migration the old one-per-minute key is used. */
export async function upsertSample(row: SampleRow): Promise<void> {
  const { error } = await supabaseAdmin
    .from("marketing_webinar_samples")
    .upsert(row, { onConflict: "webinar_id,at,source" });
  if (!error) return;
  if (!noConstraint(error.message)) throw error;
  const old = await supabaseAdmin
    .from("marketing_webinar_samples")
    .upsert(row, { onConflict: "webinar_id,at" });
  if (old.error) throw old.error;
}

/** Keeps the webinar's peak (per source and in total) after a new count. */
export async function recordPeak(webinarId: string, now = new Date()): Promise<void> {
  const since = new Date(now.getTime() - 6 * 60_000).toISOString();
  const [{ data: w, error }, { data: recent }] = await Promise.all([
    supabaseAdmin
      .from("marketing_webinars")
      .select("peak_youtube, peak_telegram, peak_total")
      .eq("id", webinarId)
      .maybeSingle(),
    supabaseAdmin
      .from("marketing_webinar_samples")
      .select("at, viewers, source")
      .eq("webinar_id", webinarId)
      .gte("at", since)
      .order("at"),
  ]);
  if (error || !w || !recent?.length) return; // columns missing before the migration
  const p = peaks(combineSamples(recent));
  const last = combineSamples(recent).at(-1);
  const patch: {
    peak_youtube?: number;
    peak_telegram?: number;
    peak_total?: number;
    peak_at?: string;
  } = {};
  if (p.youtube && p.youtube.viewers > (w.peak_youtube ?? -1))
    patch.peak_youtube = p.youtube.viewers;
  if (p.telegram && p.telegram.viewers > (w.peak_telegram ?? -1))
    patch.peak_telegram = p.telegram.viewers;
  if (last && last.total > (w.peak_total ?? -1)) {
    patch.peak_total = last.total;
    patch.peak_at = last.at;
  }
  if (Object.keys(patch).length)
    await supabaseAdmin.from("marketing_webinars").update(patch).eq("id", webinarId);
}

/**
 * An event the server noticed. The "live on" kinds are written once per
 * start (not again within 10 minutes of the last one).
 */
export async function addAutoEvent(input: {
  webinarId: string;
  orgId: string;
  kind: EventKind;
  at: Date;
  meta?: Record<string, unknown> | null;
}): Promise<boolean> {
  const { data: existing } = await supabaseAdmin
    .from("marketing_webinar_marks")
    .select("id, at, kind, seq")
    .eq("webinar_id", input.webinarId)
    .eq("kind", input.kind);
  const rows = existing ?? [];
  if (input.kind !== "sms_sent") {
    const recent = rows.some(
      (r) => Math.abs(new Date(r.at).getTime() - input.at.getTime()) < 10 * 60_000,
    );
    if (recent) return false;
  }
  const seq =
    input.kind === "sms_sent"
      ? nextSeq(
          rows.map((r) => ({ id: r.id, at: r.at, kind: input.kind, seq: r.seq, label: null })),
          input.kind,
        )
      : null;
  const { error } = await supabaseAdmin.from("marketing_webinar_marks").insert({
    webinar_id: input.webinarId,
    organization_id: input.orgId,
    kind: input.kind,
    at: input.at.toISOString(),
    seq,
    auto: true,
    meta: (input.meta ?? null) as never,
  });
  if (error) {
    console.error("[webinar] auto event", input.kind, error.message);
    return false;
  }
  return true;
}

/**
 * An SMS broadcast went out from SalesIQ: every webinar of the company that
 * is live right now gets an "SMS sent" event with how many were sent.
 */
export async function markSmsSent(orgId: string, count: number, now = new Date()): Promise<void> {
  if (count <= 0) return;
  const { data } = await supabaseAdmin
    .from("marketing_webinars")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "live")
    .is("archived_at", null)
    .limit(5);
  for (const w of data ?? []) {
    await addAutoEvent({
      webinarId: w.id,
      orgId,
      kind: "sms_sent",
      at: now,
      meta: { count, channel: "sms" },
    });
  }
}

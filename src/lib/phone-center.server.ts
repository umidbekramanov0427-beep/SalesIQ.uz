import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Viewer } from "@/lib/analytics.server";
import {
  getAllTelephonyStatuses,
  type TelephonyCredentialsStatus,
} from "@/lib/telephony/telephony-data.server";
import {
  callOutcome,
  dailyOf,
  daysBetween,
  heatmapOf,
  hourlyOf,
  journalOf,
  journalTotalsOf,
  operatorsOf,
  splitOf,
  totalsOf,
  type PcCall,
  type PcScore,
  type PhoneCenterData,
} from "@/lib/phone-center";

// Telefon's rows: the company's PBX calls and AI-scored calls in the
// period, read with the service role, pinned to the caller's company and
// cut to whose calls the caller may see (Huquqlar).

const MAX_CALLS = 5000;

type CallRow = {
  id: string;
  created_at: string;
  direction: string | null;
  from_number: string | null;
  to_number: string | null;
  status: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  error: string | null;
  lead_id: string | null;
  initiated_by: string | null;
  lead: { name: string } | null;
  contact: { full_name: string } | null;
};

/** Who is on a call now (a call still ringing or talking, at most an hour old) and when each person last had the app open. */
async function gatherLive(orgId: string): Promise<PhoneCenterData["live"]> {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [active, seen] = await Promise.all([
    supabaseAdmin
      .from("pbx_calls")
      .select("initiated_by")
      .eq("organization_id", orgId)
      .in("status", ["initiated", "ringing", "answered"])
      .gte("created_at", hourAgo)
      .limit(200),
    supabaseAdmin
      .from("user_login_events")
      .select("user_id, last_seen_at")
      .eq("organization_id", orgId)
      .gte("last_seen_at", dayAgo)
      .order("last_seen_at", { ascending: false })
      .limit(500),
  ]);
  const onCall = [
    ...new Set((active.data ?? []).map((r) => r.initiated_by).filter((x): x is string => !!x)),
  ];
  const seenAt: Record<string, string> = {};
  for (const r of (seen.data ?? []) as { user_id: string; last_seen_at: string | null }[]) {
    if (r.last_seen_at && !seenAt[r.user_id]) seenAt[r.user_id] = r.last_seen_at;
  }
  return { onCall, seenAt };
}

export async function gatherPhoneCenter(
  v: Viewer,
  range: { from: string; to: string },
  days: { from: string; to: string },
): Promise<PhoneCenterData> {
  const owners = v.owners ? [...v.owners] : null;
  const [statuses, callsRes, scoresRes, live] = await Promise.all([
    getAllTelephonyStatuses(v.orgId).catch(
      () => ({}) as Awaited<ReturnType<typeof getAllTelephonyStatuses>>,
    ),
    (async () => {
      const rows: CallRow[] = [];
      for (let i = 0; i < MAX_CALLS; i += 1000) {
        let q = supabaseAdmin
          .from("pbx_calls")
          .select(
            "id, created_at, direction, from_number, to_number, status, duration_seconds, recording_url, error, lead_id, initiated_by, lead:leads(name), contact:contacts(full_name)",
          )
          .eq("organization_id", v.orgId)
          .gte("created_at", range.from)
          .lt("created_at", range.to);
        if (owners) q = q.in("initiated_by", owners);
        const { data, error } = await q.order("created_at", { ascending: false }).range(i, i + 999);
        if (error || !data) break;
        rows.push(...(data as unknown as CallRow[]));
        if (data.length < 1000) break;
      }
      return rows;
    })(),
    (async () => {
      let q = supabaseAdmin
        .from("amocrm_calls")
        .select("id, occurred_at, created_by, score, phone, lead_id, duration_seconds, ai_summary")
        .eq("organization_id", v.orgId)
        .not("score", "is", null)
        .gte("occurred_at", range.from)
        .lt("occurred_at", range.to);
      if (owners) q = q.in("created_by", owners);
      const { data } = await q.order("occurred_at", { ascending: false }).limit(1000);
      return data ?? [];
    })(),
    gatherLive(v.orgId).catch(() => ({ onCall: [], seenAt: {} })),
  ]);

  const calls: PcCall[] = callsRes.map((c) => {
    const incoming = c.direction === "incoming";
    const seconds = Number(c.duration_seconds) || 0;
    const phone = String((incoming ? c.from_number : c.to_number) ?? "");
    const lead = c.lead;
    const contact = c.contact;
    return {
      id: c.id,
      at: c.created_at,
      direction: incoming ? "incoming" : "outgoing",
      outcome: callOutcome(c.status, c.direction, seconds),
      seconds,
      by: c.initiated_by,
      phone: phone === "-" ? "" : phone,
      name: contact?.full_name || lead?.name || "",
      leadId: c.lead_id,
      recording: c.recording_url,
      error: c.error,
    };
  });
  const scores: PcScore[] = scoresRes.map((s) => ({
    id: s.id,
    at: s.occurred_at,
    by: s.created_by,
    score: Number(s.score) || 0,
    phone: s.phone,
    leadId: s.lead_id,
    seconds: s.duration_seconds ?? 0,
    summary: s.ai_summary,
  }));

  const pbx = Object.values(statuses).filter(
    (st): st is TelephonyCredentialsStatus => !!st && st.provider !== "telegram",
  );
  const active = pbx.find((s) => s.connected) ?? pbx[0] ?? null;
  const links = active?.extensionLinks ?? [];

  return {
    provider: active
      ? {
          id: active.provider,
          connected: active.connected,
          connectedAt: active.connectedAt,
          lastEventAt: active.lastEventAt,
        }
      : null,
    myExtension: links.find((l) => l.profileId === v.meId)?.code ?? null,
    totals: totalsOf(calls),
    operators: operatorsOf(
      calls,
      scores,
      v.people.filter((p) => p.role !== "platform_owner"),
      links,
    ),
    calls: calls.slice(0, 1500),
    scores: scores.slice(0, 200),
    hourly: hourlyOf(calls),
    heat: heatmapOf(calls),
    daily: dailyOf(calls, daysBetween(days.from, days.to)),
    journal: journalTotalsOf(journalOf(calls)),
    split: splitOf(calls),
    live,
  };
}

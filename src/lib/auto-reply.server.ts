// Answers a client's chat message automatically (lib/auto-reply.ts picks
// what): the after-hours message outside the company's working hours,
// otherwise a matching auto-responder. The same text goes to a lead at
// most once in 12 hours, so a chatty client doesn't get it on every line.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { insertLeadChatMessage } from "@/lib/telegram/lead-chat.server";
import {
  isWorkingTime,
  pickAutoReply,
  type ReplyChannel,
  type Responder,
  type WorkSchedule,
} from "@/lib/auto-reply";

const REPEAT_GAP_MS = 12 * 60 * 60 * 1000;

type GeneralRow = {
  timezone?: string | null;
  after_hours_enabled?: boolean | null;
  after_hours_text?: string | null;
};

export async function autoReplyToClient(input: {
  organizationId: string;
  leadId: string;
  channel: ReplyChannel;
  text: string;
  /** Sends the text on the client's channel; returns its message id when known. */
  send: (text: string) => Promise<string | null | void>;
}): Promise<void> {
  const org = input.organizationId;
  const [general, schedule, responders] = await Promise.all([
    // select("*"): before the migration the after-hours columns are just absent.
    supabaseAdmin
      .from("org_general_settings")
      .select("*")
      .eq("organization_id", org)
      .maybeSingle()
      .then((r) => (r.data ?? null) as GeneralRow | null),
    supabaseAdmin
      .from("org_work_schedule")
      .select("start_time, end_time, work_days")
      .eq("organization_id", org)
      .maybeSingle()
      .then((r) => (r.data ?? null) as WorkSchedule | null),
    supabaseAdmin
      .from("auto_responders")
      .select("id, trigger_text, message, channels, active")
      .eq("organization_id", org)
      .eq("active", true)
      .order("created_at")
      .then((r) => (r.data ?? []) as Responder[]),
  ]);

  // No schedule saved: never "after hours".
  const working = schedule
    ? isWorkingTime(schedule, new Date(), general?.timezone || "Asia/Tashkent")
    : true;
  const reply = pickAutoReply({
    text: input.text,
    channel: input.channel,
    working,
    afterHours: {
      enabled: !!general?.after_hours_enabled,
      text: general?.after_hours_text ?? null,
    },
    responders,
  });
  if (!reply) return;

  // A salesbot talking to this lead answers it itself -- one reply, not two.
  const { data: bot } = await supabaseAdmin
    .from("salesbot_runs")
    .select("id")
    .eq("organization_id", org)
    .eq("lead_id", input.leadId)
    .in("status", ["waiting", "running"])
    .limit(1);
  if (bot?.length) return;

  const { data: recent } = await supabaseAdmin
    .from("lead_telegram_messages")
    .select("id")
    .eq("lead_id", input.leadId)
    .eq("direction", "out")
    .eq("text", reply.text)
    .gte("created_at", new Date(Date.now() - REPEAT_GAP_MS).toISOString())
    .limit(1);
  if (recent?.length) return;

  const mid = await input.send(reply.text);
  await insertLeadChatMessage({
    organization_id: org,
    lead_id: input.leadId,
    direction: "out",
    text: reply.text,
    ...(input.channel === "instagram"
      ? { channel: "instagram", ext_message_id: typeof mid === "string" ? mid : null }
      : {}),
  });
}

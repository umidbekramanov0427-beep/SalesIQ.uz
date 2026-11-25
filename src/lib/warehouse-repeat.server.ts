// Ombor: "the client's goods are running out" -- once an hour, for every
// company with the module, a call-back task for the lead's owner when the
// next order is due within REMIND_DAYS (from the gaps between the client's
// own delivered orders, lib/warehouse.ts). One task per delivery: a task
// already made since the client's last delivery is not made again.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { repeatCandidates } from "@/lib/warehouse";

export const REPEAT_TASK_PREFIX = "Qayta sotuv:";
const REMIND_DAYS = 3;

export async function runWarehouseRepeatReminders(now: Date = new Date()) {
  // Hourly is enough: the 5-minute cron runs it in the hour's first tick.
  if (now.getUTCMinutes() >= 5) return { created: 0 };
  const { data: mods } = await supabaseAdmin
    .from("org_modules")
    .select("organization_id, enabled, until")
    .eq("module", "warehouse")
    .eq("enabled", true);
  let created = 0;
  for (const m of mods ?? []) {
    if (m.until && Date.parse(m.until) <= now.getTime()) continue;
    const org = m.organization_id;
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, lead_id, status, total, delivered_at, created_at")
      .eq("organization_id", org)
      .eq("status", "delivered")
      .not("lead_id", "is", null)
      .limit(5000);
    if (!orders?.length) continue;
    const due = repeatCandidates(
      orders.map((o) => ({
        leadId: o.lead_id,
        status: o.status,
        total: Number(o.total) || 0,
        deliveredAt: o.delivered_at,
        createdAt: o.created_at,
        productIds: [],
      })),
      now,
    ).filter((c) => c.dueInDays != null && c.dueInDays <= REMIND_DAYS && c.dueInDays >= -7);
    if (!due.length) continue;
    const ids = due.map((c) => c.leadId);
    const [{ data: leads }, { data: tasks }] = await Promise.all([
      supabaseAdmin.from("leads").select("id, name, owner_id").in("id", ids),
      supabaseAdmin
        .from("tasks")
        .select("lead_id, created_at")
        .eq("organization_id", org)
        .in("lead_id", ids)
        .like("title", `${REPEAT_TASK_PREFIX}%`),
    ]);
    const lead = new Map((leads ?? []).map((l) => [l.id, l]));
    for (const c of due) {
      const l = lead.get(c.leadId);
      if (!l) continue;
      // Already reminded since this delivery.
      if ((tasks ?? []).some((t) => t.lead_id === c.leadId && t.created_at > c.lastAt)) continue;
      const when = new Date(now);
      when.setUTCHours(13, 0, 0, 0); // 18:00 Tashkent
      const { error } = await supabaseAdmin.from("tasks").insert({
        organization_id: org,
        lead_id: c.leadId,
        title: `${REPEAT_TASK_PREFIX} ${l.name} — mahsuloti tugayapti, qayta buyurtma taklif qiling`,
        assignee_id: l.owner_id,
        due_date: when.toISOString(),
      });
      if (!error) created++;
    }
  }
  return { created };
}

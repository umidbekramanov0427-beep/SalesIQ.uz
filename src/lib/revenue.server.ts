import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildRevenueReport,
  type Prices,
  type RevenueOrg,
  type RevenuePayment,
  type RevenueReport,
} from "@/lib/revenue";

// Facts for Platforma → Daromad: every company, the platform's prices and
// the subscription payments of the last 13 months (plus the latest ones).
export async function loadRevenueReport(now = Date.now()): Promise<RevenueReport> {
  const since = new Date(now - 400 * 24 * 3600 * 1000).toISOString();
  const [orgsRes, settingsRes, paidRes, recentRes] = await Promise.all([
    supabaseAdmin
      .from("organizations")
      .select(
        "id, name, phone, plan, extra_seats, is_trial, active, trial_ends_at, created_at, frozen_at",
      )
      .limit(5000),
    supabaseAdmin
      .from("platform_settings")
      .select("price_start_iq_uzs, price_analyst_iq_uzs, price_master_iq_uzs, extra_seat_price_uzs")
      .eq("id", true)
      .maybeSingle(),
    supabaseAdmin
      .from("platform_subscription_payments")
      .select("organization_id, amount, status, provider, paid_at, created_at")
      .eq("status", "paid")
      .gte("paid_at", since)
      .limit(10000),
    supabaseAdmin
      .from("platform_subscription_payments")
      .select("organization_id, amount, status, provider, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  if (orgsRes.error) throw orgsRes.error;
  const s = settingsRes.data;
  const prices: Prices = {
    plans: {
      start_iq: s?.price_start_iq_uzs ?? 0,
      analyst_iq: s?.price_analyst_iq_uzs ?? 0,
      master_iq: s?.price_master_iq_uzs ?? 0,
    },
    extraSeat: s?.extra_seat_price_uzs ?? 0,
  };
  // Paid ones for the chart, the latest ones (any status) for the list.
  const seen = new Set<string>();
  const payments: RevenuePayment[] = [];
  for (const p of [...(paidRes.data ?? []), ...(recentRes.data ?? [])]) {
    const key = `${p.organization_id}|${p.created_at}|${p.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    payments.push({ ...p, amount: Number(p.amount) });
  }
  return buildRevenueReport((orgsRes.data ?? []) as RevenueOrg[], payments, prices, now);
}

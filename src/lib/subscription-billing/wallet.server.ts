// Server-only. Hisob va to'lov (5CRM style): the company's balance, topping
// it up through Click / Payme, buying seats and modules from it, renewing
// from it when the period ends, and the owner's price list and adjustments.
// The money moves only in the database functions billing_credit /
// billing_purchase (migration 20270212), each one transaction.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildPaymeCheckoutUrl } from "./payme.server";
import { buildClickCheckoutUrl } from "./click.server";
import { rewardReferral } from "@/lib/referral.server";
import { normalizePlan, SEAT_LIMITS } from "@/lib/plan-gating";
import {
  extraSeatsFor,
  parseCart,
  parseCatalog,
  quote,
  topupCharge,
  topupCredit,
  type BillingCatalog,
  type Cart,
} from "@/lib/billing-catalog";
import type { SubscriptionPaymentProvider } from "./billing-data.server";

const MISSING = /does not exist|schema cache|column|relation|function/i;
export const BILLING_NOT_READY =
  "Bu imkoniyat bazani yangilagandan keyin ishlaydi (migratsiya 20270212).";

export async function loadCatalog(): Promise<BillingCatalog> {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  return parseCatalog((data as { billing_catalog?: unknown } | null)?.billing_catalog);
}

export type WalletState = {
  ready: boolean;
  balance: number;
  autoRenew: boolean;
  cart: Cart | null;
  legal: Record<string, string>;
};

export async function getWallet(orgId: string, catalog?: BillingCatalog): Promise<WalletState> {
  const { data, error } = await supabaseAdmin
    .from("org_billing" as never)
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) return { ready: false, balance: 0, autoRenew: false, cart: null, legal: {} };
  const row = data as {
    balance_uzs?: number;
    auto_renew?: boolean;
    cart?: unknown;
    legal?: Record<string, string>;
  } | null;
  return {
    ready: true,
    balance: Number(row?.balance_uzs ?? 0),
    autoRenew: !!row?.auto_renew,
    cart: parseCart(row?.cart, catalog),
    legal: (row?.legal as Record<string, string>) ?? {},
  };
}

export type WalletTx = {
  id: string;
  amount: number;
  balanceAfter: number;
  kind: string;
  provider: string | null;
  note: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
};

export async function walletHistory(orgId: string, limit = 50): Promise<WalletTx[]> {
  const { data, error } = await supabaseAdmin
    .from("org_wallet_tx" as never)
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r["id"] as string,
    amount: Number(r["amount_uzs"]),
    balanceAfter: Number(r["balance_after"]),
    kind: r["kind"] as string,
    provider: (r["provider"] as string | null) ?? null,
    note: (r["note"] as string | null) ?? null,
    meta: (r["meta"] as Record<string, unknown>) ?? {},
    createdAt: r["created_at"] as string,
  }));
}

/** A Click / Payme link that credits `credit` so'm to the balance (commission on top). */
export async function createTopupLink(
  orgId: string,
  userId: string,
  provider: SubscriptionPaymentProvider,
  credit: number,
): Promise<{ id: string; payUrl: string; amount: number }> {
  const catalog = await loadCatalog();
  const want = Math.round(credit);
  if (!Number.isFinite(want) || want < catalog.minTopup)
    throw new Error(`Kamida ${catalog.minTopup} so'm kiriting.`);
  const amount = topupCharge(want, catalog.commissionPct);
  const { data: creds } = await supabaseAdmin
    .from("platform_payment_credentials")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (!creds) throw new Error("To'lov tizimi ulanmagan.");
  const { data: row, error } = await supabaseAdmin
    .from("platform_subscription_payments")
    .insert({
      organization_id: orgId,
      provider,
      amount,
      created_by: userId,
      purpose: "topup",
      credit_uzs: want,
    } as never)
    .select("id")
    .single();
  if (error) throw MISSING.test(error.message) ? new Error(BILLING_NOT_READY) : error;
  const id = (row as { id: string }).id;
  let payUrl: string;
  if (provider === "payme") {
    if (!creds.payme_merchant_id) throw new Error("Payme ulanmagan.");
    payUrl = buildPaymeCheckoutUrl(creds.payme_merchant_id, id, amount);
  } else {
    if (!creds.click_service_id || !creds.click_merchant_id) throw new Error("Click ulanmagan.");
    payUrl = buildClickCheckoutUrl(creds.click_service_id, creds.click_merchant_id, id, amount);
  }
  await supabaseAdmin
    .from("platform_subscription_payments")
    .update({ pay_url: payUrl })
    .eq("id", id);
  return { id, payUrl, amount };
}

/**
 * A paid payment that was a top-up: credit the balance (once per payment)
 * and tell the company's admins. Returns false when the payment is an
 * ordinary subscription payment (handled as before).
 */
export async function creditIfTopup(
  orgId: string,
  payment: { id: string; amount: number },
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("platform_subscription_payments")
    .select("*")
    .eq("id", payment.id)
    .maybeSingle();
  const row = data as { purpose?: string; credit_uzs?: number | null; provider?: string } | null;
  if (row?.purpose !== "topup") return false;
  const catalog = await loadCatalog();
  const credit = row.credit_uzs ?? topupCredit(payment.amount, catalog.commissionPct);
  const { error } = await supabaseAdmin.rpc(
    "billing_credit" as never,
    {
      p_org: orgId,
      p_amount: credit,
      p_kind: "topup",
      p_provider: row.provider ?? null,
      p_payment: payment.id,
    } as never,
  );
  if (error) throw error;
  await rewardReferral(orgId, payment);
  await notifyAdmins(orgId, "BalanceTopup", "💳 Balans to'ldirildi", `+${fmt(credit)} so'm`);
  return true;
}

/** Buys (or renews) a cart from the balance. Throws a readable error when the balance is short. */
export async function purchaseFromBalance(
  orgId: string,
  userId: string | null,
  rawCart: unknown,
  kind: "purchase" | "renewal" = "purchase",
): Promise<{ until: string; total: number }> {
  const catalog = await loadCatalog();
  const cart = parseCart(rawCart, catalog);
  if (!cart) throw new Error("Xodimlar soni yoki muddat noto'g'ri tanlangan.");
  const q = quote(cart, catalog);
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();
  const included = SEAT_LIMITS[normalizePlan(org?.plan)];
  const { data, error } = await supabaseAdmin.rpc(
    "billing_purchase" as never,
    {
      p_org: orgId,
      p_amount: q.total,
      p_days: q.days,
      p_extra_seats: extraSeatsFor(cart.seats, included),
      p_modules: cart.modules,
      p_cart: { ...cart, total: q.total, monthly: q.monthly },
      p_kind: kind,
      p_by: userId,
    } as never,
  );
  if (error) {
    if (/insufficient_balance/.test(error.message))
      throw new Error("Balansda mablag' yetarli emas.");
    if (MISSING.test(error.message)) throw new Error(BILLING_NOT_READY);
    throw error;
  }
  return { until: data as unknown as string, total: q.total };
}

async function updateBilling(orgId: string, patch: Record<string, unknown>) {
  await supabaseAdmin
    .from("org_billing" as never)
    .upsert({ organization_id: orgId, ...patch, updated_at: new Date().toISOString() } as never, {
      onConflict: "organization_id",
    })
    .then(({ error }) => {
      if (error) throw MISSING.test(error.message) ? new Error(BILLING_NOT_READY) : error;
    });
}

export const setAutoRenew = (orgId: string, on: boolean) =>
  updateBilling(orgId, { auto_renew: on });

const LEGAL_KEYS = [
  "name",
  "inn",
  "bank",
  "mfo",
  "account",
  "address",
  "director",
  "phone",
] as const;

/** «Yuridik shaxs — shartnoma bo'yicha»: the company's details for the contract and invoices. */
export async function saveLegal(orgId: string, raw: unknown) {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const legal = Object.fromEntries(
    LEGAL_KEYS.map((k) => [
      k,
      typeof o[k] === "string" ? (o[k] as string).trim().slice(0, 200) : "",
    ]),
  );
  if (!legal["name"] || !/^\d{9}$/.test(legal["inn"] ?? ""))
    throw new Error("Tashkilot nomi va 9 xonali STIR (INN) majburiy.");
  await updateBilling(orgId, { legal });
  await notifyPlatformOwnersOfContract(orgId, legal).catch(() => undefined);
  return legal;
}

/** The owner's adjustment (an offline / bank payment, a correction). */
export async function adjustBalance(orgId: string, ownerId: string, amount: number, note: string) {
  const { data, error } = await supabaseAdmin.rpc(
    "billing_credit" as never,
    {
      p_org: orgId,
      p_amount: Math.round(amount),
      p_kind: "adjust",
      p_note: note.trim() || null,
      p_by: ownerId,
    } as never,
  );
  if (error) throw MISSING.test(error.message) ? new Error(BILLING_NOT_READY) : error;
  return Number(data);
}

export async function saveCatalog(raw: unknown): Promise<BillingCatalog> {
  const catalog = parseCatalog(raw);
  const { error } = await supabaseAdmin
    .from("platform_settings")
    .update({ billing_catalog: catalog } as never)
    .eq("id", true);
  if (error) throw MISSING.test(error.message) ? new Error(BILLING_NOT_READY) : error;
  return catalog;
}

/**
 * «Balansdan avto-yangilash», from the 5-minute cron: a company whose paid
 * period ends within a day renews its last purchase from the balance; when
 * the balance is short its admins are told (once a day).
 */
export async function runAutoRenewals(now = new Date()): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("org_billing" as never)
    .select("organization_id, balance_uzs, cart")
    .eq("auto_renew", true);
  if (error || !data?.length) return 0;
  const rows = data as { organization_id: string; balance_uzs: number; cart: unknown }[];
  const { data: orgs } = await supabaseAdmin
    .from("organizations")
    .select("id, trial_ends_at, is_trial, active")
    .in(
      "id",
      rows.map((r) => r.organization_id),
    );
  const ends = new Map((orgs ?? []).map((o) => [o.id, o]));
  const soon = now.getTime() + 24 * 3_600_000;
  const catalog = await loadCatalog();
  let renewed = 0;
  for (const r of rows) {
    const o = ends.get(r.organization_id);
    if (!o || o.is_trial || !o.trial_ends_at) continue;
    if (Date.parse(o.trial_ends_at) > soon) continue;
    const cart = parseCart(r.cart, catalog);
    if (!cart) continue;
    const total = quote(cart, catalog).total;
    if (Number(r.balance_uzs) < total) {
      await notifyAdmins(
        r.organization_id,
        "BalanceLow",
        "⚠️ Balansda mablag' yetmaydi",
        `Avto-yangilash uchun ${fmt(total)} so'm kerak — balansni to'ldiring.`,
        true,
      );
      continue;
    }
    await purchaseFromBalance(r.organization_id, null, cart, "renewal")
      .then(async () => {
        renewed++;
        await notifyAdmins(
          r.organization_id,
          "BalanceRenewed",
          "🔄 Obuna balansdan yangilandi",
          `${fmt(total)} so'm`,
        );
      })
      .catch((err) => console.error("[billing] auto-renew failed", r.organization_id, err));
  }
  return renewed;
}

function fmt(n: number) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

async function notifyAdmins(
  orgId: string,
  type: string,
  title: string,
  body: string,
  daily = false,
) {
  const { data: admins } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("role", "super_admin");
  if (!admins?.length) return;
  if (daily) {
    const { count } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("type", type)
      .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
    if ((count ?? 0) > 0) return;
  }
  await supabaseAdmin.from("notifications").insert(
    admins.map((a) => ({
      organization_id: orgId,
      user_id: a.id,
      type,
      title,
      body,
      link: "/billing",
    })),
  );
}

async function notifyPlatformOwnersOfContract(orgId: string, legal: Record<string, string>) {
  const { notifyPlatformOwners } = await import("@/lib/owner-alerts.server");
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  await notifyPlatformOwners(
    `📄 Shartnoma so'rovi: ${org?.name ?? orgId}\n${legal["name"]} · STIR ${legal["inn"]}` +
      (legal["phone"] ? `\n☎️ ${legal["phone"]}` : ""),
  );
}

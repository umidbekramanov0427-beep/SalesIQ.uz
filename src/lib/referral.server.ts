import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  REFERRED_BONUS_DAYS,
  REFERRER_BONUS_DAYS,
  commissionFor,
  makeCode,
  normalizeCode,
  referralLink,
  withinCommissionWindow,
} from "@/lib/referral";

// Taklif dasturi, server side. A company's code lives on
// organizations.referral_code (made on first view); partners have theirs in
// referral_partners. Signing up with a code writes `referrals` and adds
// REFERRED_BONUS_DAYS to the new trial; the invited company's first payment
// adds REFERRER_BONUS_DAYS to the inviting company, and every payment in
// the first 12 months earns a partner its commission.

const DAY = 86_400_000;

type DbError = { code?: string; message?: string } | null;
export const isMissing = (e: DbError) =>
  !!e &&
  (e.code === "42P01" ||
    e.code === "42703" ||
    e.code === "PGRST204" ||
    e.code === "PGRST205" ||
    /does not exist|schema cache/.test(e.message ?? ""));

async function codeTaken(code: string): Promise<boolean> {
  const [{ data: org }, { data: partner }] = await Promise.all([
    supabaseAdmin.from("organizations").select("id").eq("referral_code", code).maybeSingle(),
    supabaseAdmin.from("referral_partners").select("id").eq("code", code).maybeSingle(),
  ]);
  return !!org || !!partner;
}

export async function uniqueCode(name: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = makeCode(name);
    if (!(await codeTaken(code))) return code;
  }
  return makeCode("SIQ" + Date.now().toString(36));
}

/** The company's own code, made on first use. Throws MIGRATION_PENDING before the update. */
export async function ensureOrgCode(orgId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("name, referral_code")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(isMissing(error) ? "MIGRATION_PENDING" : error.message);
  if (!data) throw new Error("Not found");
  if (data.referral_code) return data.referral_code;
  const code = await uniqueCode(data.name);
  const { error: upd } = await supabaseAdmin
    .from("organizations")
    .update({ referral_code: code })
    .eq("id", orgId)
    .is("referral_code", null);
  if (upd) throw new Error(upd.message);
  const { data: again } = await supabaseAdmin
    .from("organizations")
    .select("referral_code")
    .eq("id", orgId)
    .maybeSingle();
  return again?.referral_code ?? code;
}

type Owner = { referrerOrgId: string | null; partnerId: string | null; name: string };

async function findCodeOwner(code: string): Promise<Owner | null> {
  const [{ data: org }, { data: partner }] = await Promise.all([
    supabaseAdmin.from("organizations").select("id, name").eq("referral_code", code).maybeSingle(),
    supabaseAdmin
      .from("referral_partners")
      .select("id, name, active")
      .eq("code", code)
      .maybeSingle(),
  ]);
  if (org) return { referrerOrgId: org.id, partnerId: null, name: org.name };
  if (partner?.active) return { referrerOrgId: null, partnerId: partner.id, name: partner.name };
  return null;
}

/** Public check for the sign-up page: is this invitation real? */
export async function checkCode(raw: unknown): Promise<{ valid: boolean; bonusDays: number }> {
  const code = normalizeCode(raw);
  if (!code) return { valid: false, bonusDays: 0 };
  const owner = await findCodeOwner(code).catch(() => null);
  return { valid: !!owner, bonusDays: owner ? REFERRED_BONUS_DAYS : 0 };
}

/** A new company signed up with `raw` code: links it and lengthens its trial. */
export async function recordReferral(newOrgId: string, raw: unknown): Promise<number> {
  const code = normalizeCode(raw);
  if (!code) return 0;
  try {
    const owner = await findCodeOwner(code);
    if (!owner || owner.referrerOrgId === newOrgId) return 0;
    const { error } = await supabaseAdmin.from("referrals").insert({
      referred_org_id: newOrgId,
      referrer_org_id: owner.referrerOrgId,
      partner_id: owner.partnerId,
      code,
      referred_bonus_days: REFERRED_BONUS_DAYS,
    });
    if (error) return 0;
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("trial_ends_at")
      .eq("id", newOrgId)
      .maybeSingle();
    const base = Math.max(Date.now(), org?.trial_ends_at ? Date.parse(org.trial_ends_at) : 0);
    await supabaseAdmin
      .from("organizations")
      .update({ trial_ends_at: new Date(base + REFERRED_BONUS_DAYS * DAY).toISOString() })
      .eq("id", newOrgId);
    return REFERRED_BONUS_DAYS;
  } catch {
    return 0;
  }
}

/** Adds `days` to a company's paid period (from now or its current end, whichever is later). */
async function addDays(orgId: string, days: number): Promise<boolean> {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("trial_ends_at")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return false;
  // Paid without an end date: nothing to extend.
  if (!org.trial_ends_at) return true;
  const base = Math.max(Date.now(), Date.parse(org.trial_ends_at));
  await supabaseAdmin
    .from("organizations")
    .update({ trial_ends_at: new Date(base + days * DAY).toISOString() })
    .eq("id", orgId);
  return true;
}

async function tellReferrer(referrerOrgId: string, referredName: string): Promise<void> {
  const { data: admins } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("organization_id", referrerOrgId)
    .eq("role", "super_admin");
  if (!admins?.length) return;
  await supabaseAdmin.from("notifications").insert(
    admins.map((a) => ({
      organization_id: referrerOrgId,
      user_id: a.id,
      type: "ReferralReward",
      title: `🎁 +${REFERRER_BONUS_DAYS} kun obuna sovg'a`,
      body: `Siz taklif qilgan "${referredName}" birinchi to'lovni qildi — obunangizga ${REFERRER_BONUS_DAYS} kun qo'shildi.`,
      link: "/admin/referrals",
    })),
  );
}

/** The company's first reward step (also the owner's "Mukofot berish" for a payment taken by hand). */
async function rewardReferrer(referral: {
  id: string;
  referrer_org_id: string | null;
  referred_org_id: string;
}): Promise<void> {
  const { data: claimed } = await supabaseAdmin
    .from("referrals")
    .update({ status: "paid", rewarded_at: new Date().toISOString() })
    .eq("id", referral.id)
    .eq("status", "signed_up")
    .select("id")
    .maybeSingle();
  if (!claimed || !referral.referrer_org_id) return;
  if (await addDays(referral.referrer_org_id, REFERRER_BONUS_DAYS)) {
    await supabaseAdmin
      .from("referrals")
      .update({ referrer_bonus_days: REFERRER_BONUS_DAYS })
      .eq("id", referral.id);
    const { data: referred } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", referral.referred_org_id)
      .maybeSingle();
    await tellReferrer(referral.referrer_org_id, referred?.name ?? "kompaniya").catch(
      () => undefined,
    );
  }
}

/** Called when an invited company's subscription payment goes through. Never throws. */
export async function rewardReferral(
  orgId: string,
  payment: { id: string; amount: number } | null,
): Promise<void> {
  try {
    const { data: referral } = await supabaseAdmin
      .from("referrals")
      .select("id, referrer_org_id, referred_org_id, partner_id, status, created_at")
      .eq("referred_org_id", orgId)
      .maybeSingle();
    if (!referral) return;
    if (referral.status === "signed_up") await rewardReferrer(referral);
    if (referral.partner_id && payment && withinCommissionWindow(referral.created_at)) {
      const { data: partner } = await supabaseAdmin
        .from("referral_partners")
        .select("commission_pct, active")
        .eq("id", referral.partner_id)
        .maybeSingle();
      const amount = commissionFor(Number(payment.amount), Number(partner?.commission_pct ?? 0));
      if (partner?.active && amount > 0) {
        await supabaseAdmin.from("partner_commissions").insert({
          partner_id: referral.partner_id,
          referral_id: referral.id,
          payment_id: payment.id,
          amount,
        });
      }
    }
  } catch {
    // a reward problem never blocks the payment itself
  }
}

export type OrgReferralView = {
  code: string;
  link: string;
  referredBonusDays: number;
  referrerBonusDays: number;
  invited: { name: string; status: "signed_up" | "paid"; createdAt: string }[];
  daysEarned: number;
};

/** The company's own page: its link, whom it invited and the days it earned. */
export async function loadOrgReferrals(orgId: string, origin: string): Promise<OrgReferralView> {
  const code = await ensureOrgCode(orgId);
  const { data: rows } = await supabaseAdmin
    .from("referrals")
    .select("referred_org_id, status, referrer_bonus_days, created_at")
    .eq("referrer_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  const ids = (rows ?? []).map((r) => r.referred_org_id);
  const { data: orgs } = ids.length
    ? await supabaseAdmin.from("organizations").select("id, name").in("id", ids)
    : { data: [] as { id: string; name: string }[] };
  const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  return {
    code,
    link: referralLink(code, origin),
    referredBonusDays: REFERRED_BONUS_DAYS,
    referrerBonusDays: REFERRER_BONUS_DAYS,
    invited: (rows ?? []).map((r) => ({
      name: names.get(r.referred_org_id) ?? "—",
      status: r.status === "paid" ? "paid" : "signed_up",
      createdAt: r.created_at,
    })),
    daysEarned: (rows ?? []).reduce((s, r) => s + (r.referrer_bonus_days ?? 0), 0),
  };
}

export type PartnerRow = {
  id: string;
  name: string;
  phone: string | null;
  code: string;
  commissionPct: number;
  active: boolean;
  note: string | null;
  createdAt: string;
  invited: number;
  paying: number;
  earned: number;
  unpaid: number;
};

export type ReferralRow = {
  id: string;
  referredName: string;
  referredOrgId: string;
  by: string;
  byKind: "company" | "partner";
  status: "signed_up" | "paid";
  createdAt: string;
};

/** Platforma → Hamkorlar: partners with their results and every referral. */
export async function loadPartnersOverview(): Promise<{
  partners: PartnerRow[];
  referrals: ReferralRow[];
  totals: { referrals: number; paid: number; unpaid: number; topCompanies: number };
}> {
  const [{ data: partners, error }, { data: refs }, { data: comms }] = await Promise.all([
    supabaseAdmin.from("referral_partners").select("*").order("created_at", { ascending: false }),
    supabaseAdmin
      .from("referrals")
      .select("id, referred_org_id, referrer_org_id, partner_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin.from("partner_commissions").select("partner_id, amount, paid_out_at"),
  ]);
  if (error) throw new Error(isMissing(error) ? "MIGRATION_PENDING" : error.message);
  const orgIds = [
    ...new Set((refs ?? []).flatMap((r) => [r.referred_org_id, r.referrer_org_id]).filter(Boolean)),
  ] as string[];
  const { data: orgs } = orgIds.length
    ? await supabaseAdmin.from("organizations").select("id, name").in("id", orgIds)
    : { data: [] as { id: string; name: string }[] };
  const names = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const partnerNames = new Map((partners ?? []).map((p) => [p.id, p.name]));

  const rows: PartnerRow[] = (partners ?? []).map((p) => {
    const mine = (refs ?? []).filter((r) => r.partner_id === p.id);
    const c = (comms ?? []).filter((x) => x.partner_id === p.id);
    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      code: p.code,
      commissionPct: Number(p.commission_pct),
      active: p.active,
      note: p.note,
      createdAt: p.created_at,
      invited: mine.length,
      paying: mine.filter((r) => r.status === "paid").length,
      earned: c.reduce((s, x) => s + Number(x.amount), 0),
      unpaid: c.filter((x) => !x.paid_out_at).reduce((s, x) => s + Number(x.amount), 0),
    };
  });
  const referrals: ReferralRow[] = (refs ?? []).map((r) => ({
    id: r.id,
    referredOrgId: r.referred_org_id,
    referredName: names.get(r.referred_org_id) ?? "—",
    by: r.partner_id
      ? (partnerNames.get(r.partner_id) ?? "—")
      : (names.get(r.referrer_org_id ?? "") ?? "—"),
    byKind: r.partner_id ? "partner" : "company",
    status: r.status === "paid" ? "paid" : "signed_up",
    createdAt: r.created_at,
  }));
  return {
    partners: rows,
    referrals,
    totals: {
      referrals: referrals.length,
      paid: referrals.filter((r) => r.status === "paid").length,
      unpaid: rows.reduce((s, p) => s + p.unpaid, 0),
      topCompanies: new Set((refs ?? []).map((r) => r.referrer_org_id).filter(Boolean)).size,
    },
  };
}

export async function createPartner(input: {
  name: string;
  phone?: string | null;
  code?: string | null;
  commissionPct: number;
  note?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "NAME_REQUIRED" };
  const wanted = input.code ? normalizeCode(input.code) : null;
  if (input.code && !wanted) return { ok: false, error: "BAD_CODE" };
  if (wanted && (await codeTaken(wanted))) return { ok: false, error: "CODE_TAKEN" };
  const pct = Math.max(0, Math.min(100, Number(input.commissionPct) || 0));
  const { error } = await supabaseAdmin.from("referral_partners").insert({
    name,
    phone: input.phone?.trim() || null,
    code: wanted ?? (await uniqueCode(name)),
    commission_pct: pct,
    note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: isMissing(error) ? "MIGRATION_PENDING" : error.message };
  return { ok: true };
}

export async function updatePartner(
  id: string,
  patch: { active?: boolean; commissionPct?: number },
): Promise<void> {
  const values: { active?: boolean; commission_pct?: number } = {};
  if (typeof patch.active === "boolean") values.active = patch.active;
  if (typeof patch.commissionPct === "number") {
    values.commission_pct = Math.max(0, Math.min(100, patch.commissionPct));
  }
  if (Object.keys(values).length) {
    await supabaseAdmin.from("referral_partners").update(values).eq("id", id);
  }
}

/** Marks everything owed to a partner as paid out. */
export async function markPaidOut(partnerId: string): Promise<void> {
  await supabaseAdmin
    .from("partner_commissions")
    .update({ paid_out_at: new Date().toISOString() })
    .eq("partner_id", partnerId)
    .is("paid_out_at", null);
}

/** "Mukofot berish": for an invited company that paid by hand (no Payme/Click payment). */
export async function rewardManually(referralId: string): Promise<boolean> {
  const { data: referral } = await supabaseAdmin
    .from("referrals")
    .select("id, referrer_org_id, referred_org_id, status")
    .eq("id", referralId)
    .maybeSingle();
  if (!referral || referral.status !== "signed_up") return false;
  await rewardReferrer(referral);
  return true;
}

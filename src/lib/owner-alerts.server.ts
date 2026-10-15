import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Security alerts for the platform owner, sent to Telegram the moment they
// happen and kept in the visit's timeline (as an "alert:<kind>" action):
//   - one IP getting the password wrong again and again;
//   - an account signing in from a country or city it never used before;
//   - one account in use on two devices at the same time (shared login).
// Best effort: a failure here never affects the sign-in itself.

export const FAILED_BURST = 5;
export const FAILED_BURST_WINDOW_MS = 15 * 60_000;
// Another device counts as "at the same time" when it was active this recently.
export const CONCURRENT_WINDOW_MS = 3 * 60_000;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** To every platform owner, through the monitoring bot when there is one (ops/bot.server.ts). */
export async function notifyPlatformOwners(text: string): Promise<void> {
  const { notifyOwners } = await import("@/lib/ops/bot.server");
  await notifyOwners(text);
}

function place(p: { city: string | null; country: string | null }): string {
  return [p.city, p.country].filter(Boolean).join(", ") || "noma'lum joy";
}

/** After a failed sign-in: alert once when one IP reaches FAILED_BURST failures in the window. */
export async function checkFailedLoginBurst(ip: string | null): Promise<void> {
  if (!ip) return;
  const { data } = await supabaseAdmin
    .from("user_login_events")
    .select("email_attempted, city, country, device_label")
    .eq("kind", "failed_login")
    .eq("ip", ip)
    .gte("created_at", new Date(Date.now() - FAILED_BURST_WINDOW_MS).toISOString())
    .limit(FAILED_BURST + 1);
  // Exactly at the threshold, so a long attack is announced once.
  if ((data?.length ?? 0) !== FAILED_BURST) return;
  const emails = [...new Set((data ?? []).map((r) => r.email_attempted).filter(Boolean))];
  const first = data![0]!;
  await notifyPlatformOwners(
    `🔐 <b>Ketma-ket noto'g'ri parol</b>\n` +
      `IP <code>${esc(ip)}</code> (${esc(place(first))}, ${esc(first.device_label ?? "?")}) ` +
      `15 daqiqada ${FAILED_BURST} marta noto'g'ri parol kiritdi.\n` +
      `Urinilgan login: ${emails.map((e) => esc(String(e))).join(", ")}\n\n` +
      `Batafsil: Platforma → Tashriflar → Noto'g'ri parol`,
  );
}

type NewSession = {
  id: string;
  userId: string;
  organizationId: string | null;
  deviceId: string;
  deviceLabel: string;
  ip: string | null;
  city: string | null;
  country: string | null;
};

/** After a sign-in session is recorded: new place and shared-login checks. */
export async function checkNewSession(s: NewSession): Promise<void> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email, role, organization_id")
    .eq("id", s.userId)
    .maybeSingle();
  // The platform owner's own sign-ins aren't part of the report.
  if (!profile || profile.role === "platform_owner") return;

  const { data: earlier } = await supabaseAdmin
    .from("user_login_events")
    .select("id, device_id, device_label, city, country, last_seen_at, created_at")
    .eq("user_id", s.userId)
    .eq("kind", "session")
    .neq("id", s.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const prior = earlier ?? [];
  if (!prior.length) return; // First ever sign-in: nothing to compare with.

  const { data: org } = profile.organization_id
    ? await supabaseAdmin
        .from("organizations")
        .select("name")
        .eq("id", profile.organization_id)
        .maybeSingle()
    : { data: null };
  const who = `${esc(profile.full_name || profile.email)}${org ? ` (${esc(org.name)})` : ""}`;
  const alerts: { label: string; text: string }[] = [];

  const knownPlace = prior.some((p) => p.country || p.city);
  if (knownPlace && s.country && !prior.some((p) => p.country === s.country)) {
    alerts.push({
      label: "alert:new_country",
      text: `🌍 <b>Yangi davlatdan kirish</b>\n${who} — ${esc(place(s))}, ${esc(s.deviceLabel)}, IP ${esc(s.ip ?? "?")}`,
    });
  } else if (knownPlace && s.city && !prior.some((p) => p.city === s.city)) {
    alerts.push({
      label: "alert:new_city",
      text: `📍 <b>Yangi shahardan kirish</b>\n${who} — ${esc(place(s))}, ${esc(s.deviceLabel)}, IP ${esc(s.ip ?? "?")}`,
    });
  }

  const cutoff = Date.now() - CONCURRENT_WINDOW_MS;
  const other = prior.find(
    (p) =>
      p.device_id !== s.deviceId &&
      p.device_id !== "unknown" &&
      new Date(p.last_seen_at ?? p.created_at).getTime() >= cutoff,
  );
  if (other) {
    alerts.push({
      label: "alert:concurrent",
      text:
        `👥 <b>Bitta login ikki qurilmada</b>\n${who} hozir ${esc(s.deviceLabel)} (${esc(place(s))}) ` +
        `va ${esc(other.device_label ?? "boshqa qurilma")} (${esc(place(other))}) da ishlayapti. ` +
        `Login boshqaga berilgan bo'lishi mumkin.`,
    });
  }
  if (!alerts.length) return;

  await supabaseAdmin.from("user_session_events").insert(
    alerts.map((a) => ({
      session_id: s.id,
      user_id: s.userId,
      organization_id: s.organizationId,
      kind: "action",
      label: a.label,
      meta: other && a.label === "alert:concurrent" ? { otherSession: other.id } : {},
    })),
  );
  await notifyPlatformOwners(
    alerts.map((a) => a.text).join("\n\n") + "\n\nSeansni yopish: Platforma → Tashriflar",
  );
}

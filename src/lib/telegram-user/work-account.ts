// A salesperson's work Telegram account (Sozlamalar -> «Telegram akkauntim»),
// the pure part: how its chats and messages are named and keyed, and how
// Telegram's errors read to a person. The server side is
// work-account.server.ts; the account stays online in services/tg-live.

export type WorkPeer = {
  id: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
};

/** "+99890***4567" -- enough to recognise one's own number, never the whole of it. */
export function maskPhone(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 7) return null;
  return `+${d.slice(0, 5)}***${d.slice(-4)}`;
}

/** A Telegram phone ("998901234567") as the CRM keeps phones ("+998901234567"). */
export function peerPhone(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 7 ? `+${d}` : null;
}

/** How a client is named on a new lead: their name, else @username, else the number. */
export function peerName(p: WorkPeer): string {
  const name = [p.firstName, p.lastName]
    .filter((x) => x && x.trim())
    .join(" ")
    .trim();
  if (name) return name.slice(0, 120);
  if (p.username) return `@${p.username}`;
  return peerPhone(p.phone) ?? "Telegram mijoz";
}

/** The message's own id in the chat history (de-duplication across echoes). */
export function messageExtId(accountTgUserId: number, peerId: number, messageId: number): string {
  return `tgu:${accountTgUserId}:${peerId}:${messageId}`;
}

const MEDIA_LABEL: Record<string, string> = {
  photo: "🖼 Rasm",
  voice: "🎤 Ovozli xabar",
  video: "🎬 Video",
  video_note: "🎬 Dumaloq video",
  audio: "🎵 Audio",
  sticker: "🙂 Stiker",
  document: "📎 Fayl",
};

/**
 * The text kept for a message: its own text, and for media a line saying
 * what it was (the file itself stays in Telegram for now).
 */
export function inboundText(
  text: string | null | undefined,
  media: string | null | undefined,
  fileName?: string | null,
): string {
  const t = (text ?? "").trim();
  if (!media) return t;
  const label =
    media === "document" && fileName ? `📎 ${fileName}` : (MEDIA_LABEL[media] ?? "📎 Fayl");
  return t ? `${label}\n${t}` : label;
}

/** Telegram's sign-in and sending errors, as a person reads them. */
export function workAccountError(raw: string | null | undefined): string {
  const e = (raw ?? "").toLowerCase();
  if (/phone.?number.?invalid|phone_number_invalid/.test(e)) return "Telefon raqam noto'g'ri.";
  if (/phone.?code.?invalid|phone_code_invalid/.test(e))
    return "Kod noto'g'ri. Qayta tekshirib yozing.";
  if (/phone.?code.?expired|code_expired/.test(e))
    return "Kodning muddati o'tdi. Yangi kod so'rang.";
  if (/password.?hash.?invalid|password_hash_invalid/.test(e)) return "Parol noto'g'ri.";
  if (/flood|wait of \d+|too many/.test(e))
    return "Telegram ko'p urinish uchun vaqtincha to'xtatdi. Birozdan keyin urinib ko'ring.";
  if (/login_expired/.test(e)) return "Ulanish vaqti tugadi. Boshidan boshlang.";
  if (/session_revoked|auth_key|unauthorized/.test(e))
    return "Telegram'dan chiqilgan (sessiya yopilgan). Akkauntni qayta ulang.";
  if (/rate_limited/.test(e))
    return "Bir daqiqada juda ko'p xabar yuborildi. Akkaunt bloklanmasligi uchun biroz kuting.";
  if (/peer_unknown/.test(e)) return "Bu suhbat Telegram'da topilmadi.";
  if (/already_linked/.test(e)) return "Bu Telegram akkaunt boshqa xodimga ulangan.";
  return "Telegram bilan bog'lanib bo'lmadi. Birozdan keyin urinib ko'ring.";
}

/* ---- The company's rules (Integratsiyalar → «Telegram (sotuvchi akkaunti)») */

export const WORK_ROLES = ["sotuv_menejeri", "rop", "super_admin"] as const;
export type WorkRole = (typeof WORK_ROLES)[number];

export type WorkPolicy = {
  /** Work accounts are on for the company (off: none syncs, none can connect). */
  enabled: boolean;
  /** Who may connect their own account. */
  roles: WorkRole[];
  /** A new person writing to a work account becomes a lead. */
  createLeads: boolean;
};

export const DEFAULT_WORK_POLICY: WorkPolicy = {
  enabled: true,
  roles: [...WORK_ROLES],
  createLeads: true,
};

/** The saved row (integration_settings key 'telegram_user') as rules; no row = defaults. */
export function workPolicyOf(
  row: { enabled?: boolean | null; config?: unknown } | null | undefined,
): WorkPolicy {
  if (!row) return { ...DEFAULT_WORK_POLICY, roles: [...DEFAULT_WORK_POLICY.roles] };
  const c = (row.config && typeof row.config === "object" ? row.config : {}) as Record<
    string,
    unknown
  >;
  const roles = Array.isArray(c["roles"])
    ? (c["roles"] as unknown[]).filter((r): r is WorkRole =>
        (WORK_ROLES as readonly unknown[]).includes(r),
      )
    : [...WORK_ROLES];
  return {
    enabled: row.enabled !== false,
    roles,
    createLeads: c["createLeads"] !== false,
  };
}

/** May someone with this role connect their own work account? */
export function roleMayConnect(policy: WorkPolicy, role: string | null | undefined): boolean {
  return policy.enabled && !!role && (policy.roles as string[]).includes(role);
}

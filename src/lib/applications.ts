// Owner → Arizalar: the website application form's rules, shared by the
// public form, its endpoint and the owner's page. Pure, so it is unit-tested.

export const APPLICATION_STATUSES = ["new", "contacted", "demo", "won", "lost"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const TEAM_SIZES = ["1-5", "6-15", "16-50", "50+"] as const;

export const NOTE_KINDS = ["note", "receipt", "document", "file"] as const;

export type ApplicationInput = {
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  teamSize: string | null;
  message: string;
  source: string;
  utm: Record<string, string>;
};

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Uzbek numbers written any way → +998XXXXXXXXX; other numbers keep their digits. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

/** The form's body, cleaned; an error code when it can't be saved. */
export function parseApplication(
  b: Record<string, unknown>,
): { ok: true; value: ApplicationInput } | { ok: false; error: "NAME" | "PHONE" | "EMAIL" } {
  const name = clip(b["name"], 120);
  if (!name) return { ok: false, error: "NAME" };
  const phone = normalizePhone(clip(b["phone"], 40));
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return { ok: false, error: "PHONE" };
  const email = clip(b["email"], 160) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "EMAIL" };
  const teamSize = (TEAM_SIZES as readonly string[]).includes(b["teamSize"] as string)
    ? (b["teamSize"] as string)
    : null;
  const utm: Record<string, string> = {};
  if (b["utm"] && typeof b["utm"] === "object") {
    for (const [k, v] of Object.entries(b["utm"] as Record<string, unknown>).slice(0, 8)) {
      if (/^utm_[a-z]{3,10}$/.test(k) && typeof v === "string") utm[k] = v.slice(0, 120);
    }
  }
  return {
    ok: true,
    value: {
      name,
      phone,
      email,
      company: clip(b["company"], 160) || null,
      teamSize,
      message: clip(b["message"], 2000),
      source: clip(b["source"], 40).replace(/[^a-z0-9_-]/gi, "") || "landing",
      utm,
    },
  };
}

/** The owner's Telegram ping for a new application (HTML). */
export function applicationTelegramText(a: ApplicationInput): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = [
    "📝 <b>Yangi ariza</b>",
    `👤 ${esc(a.name)}${a.company ? ` · ${esc(a.company)}` : ""}`,
    `📞 ${esc(a.phone)}`,
  ];
  if (a.email) lines.push(`✉️ ${esc(a.email)}`);
  if (a.teamSize) lines.push(`👥 Jamoa: ${esc(a.teamSize)}`);
  if (a.message) lines.push(`💬 ${esc(a.message.slice(0, 400))}`);
  return lines.join("\n");
}

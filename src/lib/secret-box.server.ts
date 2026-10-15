import crypto from "node:crypto";

// Encrypts integration passwords and tokens before they are stored
// (AES-256-GCM). The key is INTEGRATIONS_SECRET when set, otherwise derived
// from the service-role key, so it exists without extra setup. Changing
// either makes stored secrets unreadable: the company then reconnects.

function key(): Buffer {
  const base = process.env["INTEGRATIONS_SECRET"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!base) throw new Error("No key for stored secrets (INTEGRATIONS_SECRET)");
  return crypto.createHash("sha256").update(`salesiq-secret-box:${base}`).digest();
}

/** "v1.<iv>.<tag>.<data>" in base64url. */
export function sealSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** The plain text, or null when it can't be opened (other key, tampered). */
export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

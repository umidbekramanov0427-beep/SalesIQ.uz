import { supabase } from "@/integrations/supabase/client";

// Two-step sign-in with an authenticator app (Google Authenticator, Authy,
// 1Password...), on Supabase's own MFA (TOTP). Once someone has a verified
// factor, a password alone only gets them an "aal1" session; the app asks
// for the 6-digit code and the session becomes "aal2" (see MfaGate in
// __root.tsx). Platform-owner powers additionally require aal2 on the
// server (auth.server.ts) and in the database (is_platform_owner()).

export type MfaStatus = {
  /** A verified authenticator is set up. */
  enabled: boolean;
  /** Signed in with the password but the code hasn't been entered yet. */
  needsCode: boolean;
  factorId: string | null;
};

export async function getMfaStatus(): Promise<MfaStatus> {
  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  const verified = factors?.totp?.find((f) => f.status === "verified") ?? null;
  return {
    enabled: !!verified,
    // Anything short of aal2 with a verified factor means the code is still
    // owed (a missing claim counts as not verified, never as passed).
    needsCode: !!verified && aal?.currentLevel !== "aal2",
    factorId: verified?.id ?? null,
  };
}

/** Starts setting up an authenticator: a QR code (SVG data URL) and the secret to type in by hand. */
export async function startEnrollment(): Promise<{ factorId: string; qr: string; secret: string }> {
  // A setup that was started and abandoned leaves an unverified factor
  // behind; clear those so a new one can be created.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `SalesIQ ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) throw error;
  return { factorId: data.id, qr: qrImageSrc(data.totp.qr_code), secret: data.totp.secret };
}

// Supabase hands the QR code as "data:image/svg+xml;utf-8,<svg ...>" -- raw
// markup behind a non-standard parameter, which some browsers refuse as an
// <img> source. Re-wrap it as base64.
export function qrImageSrc(qr: string): string {
  if (!qr.startsWith("data:image/svg+xml")) return qr;
  const comma = qr.indexOf(",");
  const head = qr.slice(0, comma);
  if (head.includes(";base64")) return qr;
  let svg = qr.slice(comma + 1);
  if (/^%3Csvg/i.test(svg)) svg = decodeURIComponent(svg);
  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/** Checks a 6-digit code against the factor (finishes setup, or completes a sign-in). */
export async function verifyCode(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\s+/g, ""),
  });
  if (error) throw error;
}

/** Turns two-step sign-in off (needs an aal2 session, i.e. the code was entered). */
export async function disableMfa(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
  // Drop the aal2 claim from the session so the UI reflects the change.
  await supabase.auth.refreshSession();
}

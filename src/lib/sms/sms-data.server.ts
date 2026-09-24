// Server-only. Credentials CRUD for the dedicated SMS module (Eskiz.uz) --
// kept separate from eskiz.server.ts (the actual API client) so the
// "read/write our own tables" half never needs to touch Eskiz's API
// surface. Mirrors telephony-data.server.ts / email-data.server.ts's shape.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SmsCredentialsStatus = {
  connected: boolean;
  email: string | null;
  senderName: string | null;
  connectedAt: string | null;
};

export async function getSmsCredentialsStatus(
  organizationId: string,
): Promise<SmsCredentialsStatus> {
  const { data, error } = await supabaseAdmin
    .from("org_sms_credentials")
    .select("email, sender_name, connected_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return {
    connected: !!data?.email,
    email: data?.email ?? null,
    senderName: data?.sender_name ?? null,
    connectedAt: data?.connected_at ?? null,
  };
}

export async function saveSmsCredentials(
  organizationId: string,
  connectedBy: string,
  input: { email: string; password: string; senderName: string },
): Promise<void> {
  const { error } = await supabaseAdmin.from("org_sms_credentials").upsert(
    {
      organization_id: organizationId,
      provider: "eskiz",
      email: input.email.trim(),
      password: input.password.trim(),
      sender_name: input.senderName.trim() || null,
      // A changed email/password invalidates any cached token immediately,
      // rather than waiting for it to expire and only then discover the
      // new credentials don't match it.
      token: null,
      token_expires_at: null,
      connected_by: connectedBy,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
}

export async function disconnectSms(organizationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_sms_credentials")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw error;
}

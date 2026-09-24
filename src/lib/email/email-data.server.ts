// Server-only. Credentials CRUD + send logging for the per-lead email
// module -- kept separate from smtp-client.server.ts (the actual SMTP send)
// so the "read/write our own tables" half of this feature never needs to
// touch nodemailer directly. Mirrors telephony-data.server.ts's shape.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SmtpCredentialsStatus = {
  connected: boolean;
  host: string | null;
  port: number | null;
  fromEmail: string | null;
  fromName: string | null;
  connectedAt: string | null;
};

export async function getSmtpCredentialsStatus(
  organizationId: string,
): Promise<SmtpCredentialsStatus> {
  const { data, error } = await supabaseAdmin
    .from("org_smtp_credentials")
    .select("host, port, from_email, from_name, connected_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return {
    connected: !!data,
    host: data?.host ?? null,
    port: data?.port ?? null,
    fromEmail: data?.from_email ?? null,
    fromName: data?.from_name ?? null,
    connectedAt: data?.connected_at ?? null,
  };
}

export type SmtpCredentials = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string | null;
};

export async function getSmtpCredentials(organizationId: string): Promise<SmtpCredentials | null> {
  const { data, error } = await supabaseAdmin
    .from("org_smtp_credentials")
    .select("host, port, username, password, from_email, from_name")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    host: data.host,
    port: data.port,
    username: data.username,
    password: data.password,
    fromEmail: data.from_email,
    fromName: data.from_name,
  };
}

export async function saveSmtpCredentials(
  organizationId: string,
  connectedBy: string,
  input: {
    host: string;
    port: number;
    username: string;
    password: string;
    fromEmail: string;
    fromName: string;
  },
): Promise<void> {
  const { error } = await supabaseAdmin.from("org_smtp_credentials").upsert(
    {
      organization_id: organizationId,
      host: input.host.trim(),
      port: input.port,
      username: input.username.trim(),
      password: input.password,
      from_email: input.fromEmail.trim(),
      from_name: input.fromName.trim() || null,
      connected_by: connectedBy,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
}

export async function disconnectSmtp(organizationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("org_smtp_credentials")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw error;
}

export async function logLeadEmail(input: {
  organizationId: string;
  leadId: string;
  toEmail: string;
  subject: string;
  body: string;
  sentBy: string;
  error: string | null;
}): Promise<void> {
  await supabaseAdmin.from("lead_emails").insert({
    organization_id: input.organizationId,
    lead_id: input.leadId,
    to_email: input.toEmail,
    subject: input.subject,
    body: input.body,
    sent_by: input.sentBy,
    error: input.error,
  });
}

// Server-only. Keeps organization_admin_credentials in sync with the one
// super_admin password Supabase Auth actually knows at any given moment.
// Auth only ever stores a hash, never the plaintext, so this mirror exists
// solely for the platform owner's company switcher (see
// platform.companies.ts) to be able to show/reveal it later. Called from
// every route that ever sets a super_admin's password: platform.create
// -organization.ts, platform.update-user.ts, admin.set-employee-password.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function syncOrgAdminCredentials(
  organizationId: string,
  userId: string,
  email: string,
  password: string,
): Promise<void> {
  await supabaseAdmin.from("organization_admin_credentials").upsert(
    {
      organization_id: organizationId,
      super_admin_user_id: userId,
      super_admin_email: email,
      super_admin_password_plaintext: password,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
}

/** A super_admin's login email changed: keep the mirrored login in step. */
export async function syncOrgAdminEmail(
  organizationId: string,
  userId: string,
  email: string,
): Promise<void> {
  await supabaseAdmin
    .from("organization_admin_credentials")
    .update({ super_admin_email: email, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("super_admin_user_id", userId);
}

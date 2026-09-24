-- Real email sending per lead, via each org's own SMTP credentials (a
-- Gmail app password or any other provider works -- no exotic paid email
-- API needed). Same shape as org_telephony_credentials: one row per org,
-- admin-managed, upserted on save.
create table if not exists public.org_smtp_credentials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  host text not null,
  port integer not null default 587,
  username text not null,
  password text not null,
  from_email text not null,
  from_name text,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table public.org_smtp_credentials enable row level security;

drop policy if exists "org_smtp_credentials_select" on public.org_smtp_credentials;
create policy "org_smtp_credentials_select" on public.org_smtp_credentials for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- No client-facing write policy: credentials (including the plaintext
-- password) are only ever written by the /integrations/email/credentials
-- route, which runs as service role after its own requireSuperAdmin check
-- -- same treatment as org_telephony_credentials.

-- lead_emails: every email actually sent from a lead, so the workspace can
-- show a real send history instead of a dead "Email" button. Outbound only
-- for now -- there is no inbound mailbox polling in scope yet.
create table if not exists public.lead_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  sent_by uuid references public.profiles(id) on delete set null,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists lead_emails_lead_idx on public.lead_emails(lead_id, created_at);

alter table public.lead_emails enable row level security;

drop policy if exists "lead_emails_select" on public.lead_emails;
create policy "lead_emails_select" on public.lead_emails for select to authenticated
  using (organization_id = public.current_user_org_id());

-- No insert policy for clients: rows are written only by
-- /integrations/email/send (service role), after an actual SMTP send
-- attempt -- success or failure both get logged, but only for a send that
-- really happened.

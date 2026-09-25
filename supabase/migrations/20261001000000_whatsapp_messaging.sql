-- Real WhatsApp Business messaging per lead, via Meta's WhatsApp Cloud API.
-- Unlike Telegram (which needs a customer to message a shared bot first so
-- their chat can be linked), a WhatsApp Business number can message any
-- customer phone number directly -- so there's no separate "link code" step
-- or table here, just the org's own API credentials and the resulting
-- message log.

create table if not exists public.org_whatsapp_credentials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  phone_number_id text not null,
  waba_id text,
  access_token text not null,
  display_phone_number text,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table public.org_whatsapp_credentials enable row level security;

drop policy if exists "org_whatsapp_credentials_select" on public.org_whatsapp_credentials;
create policy "org_whatsapp_credentials_select" on public.org_whatsapp_credentials for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- No client-facing write policy: credentials (including the access token)
-- are only ever written by /integrations/whatsapp/credentials, which runs
-- as service role after its own requireSuperAdmin check -- same treatment
-- as org_sms_credentials/org_telephony_credentials.

-- whatsapp_messages: every inbound customer message and outbound rep reply.
-- lead_id is nullable -- an inbound message from a number that doesn't
-- match any known contact/lead is still recorded (for a future unified
-- inbox) rather than silently dropped.
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  wa_number text not null,
  direction text not null check (direction in ('in', 'out')),
  text text not null,
  wa_message_id text,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_lead_idx
  on public.whatsapp_messages(lead_id, created_at);

alter table public.whatsapp_messages enable row level security;

drop policy if exists "whatsapp_messages_select" on public.whatsapp_messages;
create policy "whatsapp_messages_select" on public.whatsapp_messages for select to authenticated
  using (organization_id = public.current_user_org_id());

-- No insert policy for clients: outbound is written server-side after
-- actually calling the WhatsApp Cloud API (/whatsapp/send-lead-message),
-- inbound via the webhook -- both service role.

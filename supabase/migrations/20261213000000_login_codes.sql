-- Sign-in confirmation code: after the password, a 6-digit code sent to the
-- person's email (platform SMTP) or, without one, to their linked Telegram.
-- One row per Supabase auth session (the JWT's session_id), so a token
-- refresh keeps the confirmation and a new sign-in asks again.
--
-- platform_settings.login_code_enabled  the owner's switch (Platforma →
--                                        Sozlamalar → Xavfsizlik), off by default.
-- login_codes                            the code (hashed), tries, when it was
--                                        sent and confirmed. Server-only.

alter table public.platform_settings
  add column if not exists login_code_enabled boolean not null default false;

create table if not exists public.login_codes (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text,
  channel text check (channel is null or channel in ('email', 'telegram')),
  attempts integer not null default 0,
  sent_at timestamptz,
  expires_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists login_codes_user on public.login_codes (user_id, created_at desc);

alter table public.login_codes enable row level security;
revoke all on public.login_codes from anon, authenticated;
grant all on public.login_codes to service_role;

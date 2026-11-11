-- IP oq ro'yxati (src/lib/ip-allowlist.ts): a company can let its people
-- sign in only from listed addresses -- an IP or an IPv4 network, each with
-- a note ("Ofis"). The server checks every sign-in and page load
-- (/account/ip-check) and closes a session from elsewhere. Super admins are
-- left out unless ip_allowlist_admins is on. Off and empty by default, so
-- nothing changes until a company turns it on. Adds three columns to
-- security_settings (its existing policies apply: the company reads, its
-- super admin writes); nothing is deleted or rewritten.

alter table public.security_settings
  add column if not exists ip_allowlist_enabled boolean not null default false,
  add column if not exists ip_allowlist jsonb not null default '[]'::jsonb,
  add column if not exists ip_allowlist_admins boolean not null default false;

notify pgrst, 'reload schema';

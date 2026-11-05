-- API kalitlari (amoCRM's API keys): a company makes named keys for its own
-- systems (a website, 1C, a data warehouse) to read and write leads through
-- /api/v1. Only a SHA-256 hash of each key is stored -- the key itself is
-- shown once when it is made. Each key has scopes and can be revoked; the
-- server records when it was last used. Only the server reads this table.

create table if not exists public.org_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  -- The key's first characters, shown so people can tell keys apart.
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{leads:read}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint org_api_keys_scopes_check check (
    scopes <@ array['leads:read', 'leads:write', 'tasks:write']::text[]
    and cardinality(scopes) > 0
  )
);

create index if not exists org_api_keys_org_idx
  on public.org_api_keys (organization_id, created_at desc);

-- No policies: only the server (service role) reads and writes keys.
alter table public.org_api_keys enable row level security;

notify pgrst, 'reload schema';

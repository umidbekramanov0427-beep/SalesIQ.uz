-- Owner → Arizalar: applications left on the website (salesiq.uz "Ariza
-- qoldiring" form) and the owner's small CRM around them -- a status
-- (new → contacted → demo → won / lost), the expected sum, and a timeline of
-- notes, receipts, documents and files.
--
-- platform_applications       one application: who, contact, company,
--                              team size, message, where it came from.
-- platform_application_notes  its timeline: a note, or a receipt /
--                              document / file stored in the private
--                              "platform-files" bucket.
--
-- Written by the public /applications/submit endpoint and the owner's API,
-- both through the server, so RLS is on with no policies for signed-in users.

create table if not exists public.platform_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  phone text not null check (char_length(phone) between 5 and 40),
  email text check (email is null or char_length(email) <= 160),
  company text check (company is null or char_length(company) <= 160),
  team_size text check (team_size is null or char_length(team_size) <= 20),
  message text not null default '' check (char_length(message) <= 2000),
  source text not null default 'landing' check (char_length(source) <= 40),
  utm jsonb not null default '{}'::jsonb,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'demo', 'won', 'lost')),
  amount numeric(14, 2),
  organization_id uuid references public.organizations(id) on delete set null,
  ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_applications_created
  on public.platform_applications (created_at desc);
create index if not exists platform_applications_ip
  on public.platform_applications (ip, created_at desc);

create table if not exists public.platform_application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.platform_applications(id) on delete cascade,
  kind text not null default 'note'
    check (kind in ('note', 'receipt', 'document', 'file', 'status')),
  body text not null default '' check (char_length(body) <= 4000),
  amount numeric(14, 2),
  file_path text,
  file_name text,
  file_size integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists platform_application_notes_app
  on public.platform_application_notes (application_id, created_at desc);

alter table public.platform_applications enable row level security;
alter table public.platform_application_notes enable row level security;

revoke all on public.platform_applications from anon, authenticated;
revoke all on public.platform_application_notes from anon, authenticated;
grant all on public.platform_applications to service_role;
grant all on public.platform_application_notes to service_role;

-- Receipts, documents and files of the owner's applications: private, read
-- only through short-lived signed links the owner's API makes.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('platform-files', 'platform-files', false)
    on conflict (id) do update set public = false;
  end if;
end $$;

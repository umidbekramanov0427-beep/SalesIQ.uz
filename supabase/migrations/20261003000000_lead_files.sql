-- Simple per-lead file storage: reps attach contracts, screenshots, invoices,
-- etc straight to a lead's workspace. No folders/versioning/full document
-- management -- just a private Storage bucket + one metadata table, mirroring
-- the WhatsApp/SMS "service role writes, org members read" split used
-- elsewhere in this codebase.

insert into storage.buckets (id, name, public)
values ('lead-files', 'lead-files', false)
on conflict (id) do nothing;

create table if not exists public.lead_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_files_lead_idx on public.lead_files(lead_id, created_at);

alter table public.lead_files enable row level security;

drop policy if exists "lead_files_select" on public.lead_files;
create policy "lead_files_select" on public.lead_files for select to authenticated
  using (organization_id = public.current_user_org_id());

-- No client-facing write policy and no storage.objects RLS policies --
-- clients never talk to Storage directly. Every upload/download/delete goes
-- through /lead-files/upload, /lead-files/download, /lead-files/delete
-- (service role), which check the caller's org membership against the
-- lead/file row before touching Storage or this table.

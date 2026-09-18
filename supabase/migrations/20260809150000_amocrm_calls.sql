-- Real call activity pulled from AmoCRM (call-type notes on leads), synced
-- alongside the existing one-way lead sync. No transcription/sentiment yet —
-- that needs a speech-to-text provider that isn't connected to this workspace.
create table if not exists public.amocrm_calls (
  id uuid primary key default gen_random_uuid(),
  amocrm_note_id bigint not null unique,
  lead_id uuid references public.leads(id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  phone text,
  duration_seconds integer not null default 0,
  connected boolean not null default false,
  recording_url text,
  occurred_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create index if not exists amocrm_calls_lead_id_idx on public.amocrm_calls(lead_id);
create index if not exists amocrm_calls_occurred_at_idx on public.amocrm_calls(occurred_at desc);

alter table public.amocrm_calls enable row level security;

drop policy if exists "amocrm_calls_select" on public.amocrm_calls;
create policy "amocrm_calls_select" on public.amocrm_calls
  for select to authenticated using (true);

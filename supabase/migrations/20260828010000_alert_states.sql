-- Ogohlantirishlar (operational alerts): inactive reps, calls with no
-- recording, low-scored calls, AI-flagged deal-loss risks. The alerts
-- themselves are computed on the fly from amocrm_calls/profiles (there's
-- nothing to backfill and they can never go stale), but "read"/"dismissed"
-- is a real per-admin choice that has to survive a refresh — this table is
-- just that small piece of state, keyed by a stable string the client
-- derives from the alert's type + underlying row (e.g. "no_audio:<call id>").
create table if not exists public.alert_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  alert_key text not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, alert_key)
);

alter table public.alert_states enable row level security;

-- Each admin's read/dismissed state is their own -- one admin dismissing an
-- alert shouldn't hide it for another admin who hasn't seen it yet.
drop policy if exists "alert_states_select" on public.alert_states;
create policy "alert_states_select" on public.alert_states
  for select to authenticated using (
    organization_id = public.current_user_org_id() and user_id = auth.uid()
  );
drop policy if exists "alert_states_insert" on public.alert_states;
create policy "alert_states_insert" on public.alert_states
  for insert to authenticated with check (
    organization_id = public.current_user_org_id() and user_id = auth.uid()
  );
drop policy if exists "alert_states_update" on public.alert_states;
create policy "alert_states_update" on public.alert_states
  for update to authenticated using (
    organization_id = public.current_user_org_id() and user_id = auth.uid()
  );

create index if not exists alert_states_user_key_idx on public.alert_states (user_id, alert_key);

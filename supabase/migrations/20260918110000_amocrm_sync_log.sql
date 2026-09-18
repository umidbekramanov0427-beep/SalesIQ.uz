-- Real sync history for the Integrations page's "Operatsiyalar" panel --
-- amocrm_connection only ever carried the single latest
-- last_synced_at/last_sync_error, so there was no way to see whether a
-- sync failure was a one-off or a recurring problem, or how many calls a
-- given run actually pulled in. logAmoSyncRun() (client.server.ts) writes
-- one row here per sync attempt (manual or the 5-minute cron), and keeps
-- only the most recent 30 per org so this never grows unbounded.
create table if not exists public.amocrm_sync_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trigger text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  synced_count int not null default 0,
  calls_synced int,
  tasks_synced int,
  error text,
  skipped boolean not null default false
);

create index if not exists amocrm_sync_log_org_idx
  on public.amocrm_sync_log (organization_id, finished_at desc);

alter table public.amocrm_sync_log enable row level security;

drop policy if exists "amocrm_sync_log_select" on public.amocrm_sync_log;
create policy "amocrm_sync_log_select" on public.amocrm_sync_log
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
    or public.is_platform_owner()
  );

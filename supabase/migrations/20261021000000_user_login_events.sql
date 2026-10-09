-- Profile window: where and from what a user signed in, and what they did.
--
-- user_login_events: one row per browser session (device, browser, IP,
-- city/country from the hosting edge), written by the /account/login-event
-- server route with the service role. A user reads their own rows; admins
-- and ROPs can read their company's.
--
-- my_audit_activity: the caller's own actions from the audit log. The log
-- itself stays admin/ROP-only (audit_logs_select); this hands every user
-- just the rows they authored.

create table if not exists public.user_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  device_id text not null,
  device_label text,
  user_agent text,
  ip text,
  city text,
  country text,
  created_at timestamptz not null default now()
);

create index if not exists user_login_events_user_idx
  on public.user_login_events (user_id, created_at desc);

alter table public.user_login_events enable row level security;

drop policy if exists "user_login_events_select" on public.user_login_events;
create policy "user_login_events_select" on public.user_login_events for select to authenticated
  using (
    user_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  );

create or replace function public.my_audit_activity(p_limit integer default 100)
returns setof public.audit_logs
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.audit_logs
  where actor_id = auth.uid()
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke execute on function public.my_audit_activity(integer) from public, anon;
grant execute on function public.my_audit_activity(integer) to authenticated;

notify pgrst, 'reload schema';

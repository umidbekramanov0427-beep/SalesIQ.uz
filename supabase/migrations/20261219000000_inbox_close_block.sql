-- Inbox, the amoCRM imBox way: a conversation can be closed ("Suhbatni
-- yopish" -- handled, nothing to answer; a new client message opens it
-- again) and a chat can be blocked (spam: hidden from the inbox, no
-- notifications or pushes for its messages). One row per lead, shared by
-- the whole company.

create table if not exists public.inbox_chat_states (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  blocked_at timestamptz,
  blocked_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists inbox_chat_states_org_idx on public.inbox_chat_states (organization_id);

alter table public.inbox_chat_states enable row level security;

drop policy if exists inbox_chat_states_select on public.inbox_chat_states;
create policy inbox_chat_states_select on public.inbox_chat_states
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists inbox_chat_states_insert on public.inbox_chat_states;
create policy inbox_chat_states_insert on public.inbox_chat_states
  for insert to authenticated
  with check (organization_id = public.current_user_org_id());

drop policy if exists inbox_chat_states_update on public.inbox_chat_states;
create policy inbox_chat_states_update on public.inbox_chat_states
  for update to authenticated
  using (organization_id = public.current_user_org_id())
  with check (organization_id = public.current_user_org_id());

grant select, insert, update on public.inbox_chat_states to authenticated;
grant all on public.inbox_chat_states to service_role;

notify pgrst, 'reload schema';

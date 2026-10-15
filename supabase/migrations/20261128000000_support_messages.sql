-- Live support: a person's questions to the SalesIQ team (the "Operator"
-- tab of the AI assistant) and the team's answers. One thread per person.
--   direction 'in'  = the person wrote it, 'out' = the support team answered.
--   telegram_refs   = the Telegram copies of the message ("<chat id>:<message
--                     id>"), so a reply to one of them in Telegram lands in
--                     the right thread.
-- People read their own thread; every write goes through the server.
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  text text not null check (length(text) between 1 and 4000),
  sent_by uuid references public.profiles(id) on delete set null,
  page text,
  telegram_refs text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists support_messages_user_created_idx
  on public.support_messages (user_id, created_at);
create index if not exists support_messages_created_idx
  on public.support_messages (created_at desc);
create index if not exists support_messages_telegram_refs_idx
  on public.support_messages using gin (telegram_refs);

alter table public.support_messages enable row level security;

drop policy if exists support_messages_select_own on public.support_messages;
create policy support_messages_select_own on public.support_messages
  for select to authenticated
  using (user_id = auth.uid() and organization_id = current_user_org_id());

revoke all on public.support_messages from anon;
revoke insert, update, delete on public.support_messages from authenticated;
grant select on public.support_messages to authenticated;
grant all on public.support_messages to service_role;

-- Answers reach the person's open chat the moment they are written
-- (Realtime applies the select policy above, so each person only gets
-- their own thread).
do $$
begin
  alter publication supabase_realtime add table public.support_messages;
exception when duplicate_object then null;
end $$;

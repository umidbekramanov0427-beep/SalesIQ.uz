-- Ish guruhlari (Inbox → «Guruhlar»): a salesperson picks which Telegram
-- groups of their work account come into the CRM; their messages are kept
-- here and the salesperson writes to the group from Inbox, as themselves.
--
--   telegram_user_groups          one row per picked group of a work account
--                                 (keyed by the account's Telegram id, like
--                                 lead_telegram_user_links)
--   telegram_user_group_messages  the group's messages since it was picked
--
-- Who sees a group: the person whose account it is, and the company's
-- admins and heads of sales. Writes are server-only. Adds tables only;
-- idempotent.

create table if not exists public.telegram_user_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  account_tg_user_id bigint not null,
  chat_id bigint not null,
  title text not null default '',
  added_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_text text
);
create unique index if not exists telegram_user_groups_chat_key
  on public.telegram_user_groups (account_tg_user_id, chat_id);
create index if not exists telegram_user_groups_org_idx
  on public.telegram_user_groups (organization_id, last_message_at desc nulls last);

alter table public.telegram_user_groups enable row level security;
drop policy if exists "telegram_user_groups_select" on public.telegram_user_groups;
create policy "telegram_user_groups_select" on public.telegram_user_groups
  for select to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (
      profile_id = auth.uid()
      or coalesce(public.current_user_role()::text, '') in ('super_admin', 'rop')
    )
  );
revoke insert, update, delete on public.telegram_user_groups from anon, authenticated;
grant select on public.telegram_user_groups to authenticated;
grant all on public.telegram_user_groups to service_role;

create table if not exists public.telegram_user_group_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.telegram_user_groups(id) on delete cascade,
  sender_tg_id bigint,
  sender_name text,
  text text not null default '',
  is_out boolean not null default false,
  sent_by uuid references public.profiles(id) on delete set null,
  ext_message_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists telegram_user_group_messages_ext_key
  on public.telegram_user_group_messages (ext_message_id);
create index if not exists telegram_user_group_messages_group_idx
  on public.telegram_user_group_messages (group_id, created_at desc);

alter table public.telegram_user_group_messages enable row level security;
drop policy if exists "telegram_user_group_messages_select" on public.telegram_user_group_messages;
create policy "telegram_user_group_messages_select" on public.telegram_user_group_messages
  for select to authenticated
  using (
    organization_id = public.current_user_org_id()
    and exists (
      select 1 from public.telegram_user_groups g
      where g.id = group_id
        and (
          g.profile_id = auth.uid()
          or coalesce(public.current_user_role()::text, '') in ('super_admin', 'rop')
        )
    )
  );
revoke insert, update, delete on public.telegram_user_group_messages from anon, authenticated;
grant select on public.telegram_user_group_messages to authenticated;
grant all on public.telegram_user_group_messages to service_role;

-- A new group message shows in an open Inbox at once.
do $$ begin
  alter publication supabase_realtime add table public.telegram_user_group_messages;
exception
  when duplicate_object then null;
  when undefined_object then raise notice 'supabase_realtime publication not found';
end $$;

notify pgrst, 'reload schema';

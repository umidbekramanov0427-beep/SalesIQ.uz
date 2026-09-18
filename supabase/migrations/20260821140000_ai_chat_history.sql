-- AI Assistant chat history — conversations were never persisted before
-- (messages lived only in the browser tab's React state), so there was no
-- way to show a "Tarix" (history) panel, search past chats, or resume one.
-- Purely personal like the assistant itself: RLS is owner-only, no
-- team/manager visibility (unlike work_sessions/call_logs), since a rep's
-- own AI chat history isn't something a manager needs to browse.

create table if not exists public.ai_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.ai_chat_conversations enable row level security;
alter table public.ai_chat_messages enable row level security;

drop policy if exists "ai_chat_conversations_select" on public.ai_chat_conversations;
create policy "ai_chat_conversations_select" on public.ai_chat_conversations
  for select to authenticated using (profile_id = auth.uid());
drop policy if exists "ai_chat_conversations_insert" on public.ai_chat_conversations;
create policy "ai_chat_conversations_insert" on public.ai_chat_conversations
  for insert to authenticated with check (profile_id = auth.uid());
drop policy if exists "ai_chat_conversations_update" on public.ai_chat_conversations;
create policy "ai_chat_conversations_update" on public.ai_chat_conversations
  for update to authenticated using (profile_id = auth.uid());
drop policy if exists "ai_chat_conversations_delete" on public.ai_chat_conversations;
create policy "ai_chat_conversations_delete" on public.ai_chat_conversations
  for delete to authenticated using (profile_id = auth.uid());

-- Messages are reached only through their conversation, so the policy
-- checks ownership via a join rather than duplicating profile_id on every
-- message row.
drop policy if exists "ai_chat_messages_select" on public.ai_chat_messages;
create policy "ai_chat_messages_select" on public.ai_chat_messages
  for select to authenticated using (
    exists (
      select 1 from public.ai_chat_conversations c
      where c.id = ai_chat_messages.conversation_id and c.profile_id = auth.uid()
    )
  );
drop policy if exists "ai_chat_messages_insert" on public.ai_chat_messages;
create policy "ai_chat_messages_insert" on public.ai_chat_messages
  for insert to authenticated with check (
    exists (
      select 1 from public.ai_chat_conversations c
      where c.id = ai_chat_messages.conversation_id and c.profile_id = auth.uid()
    )
  );

create index if not exists ai_chat_conversations_profile_updated_idx
  on public.ai_chat_conversations (profile_id, updated_at desc);
create index if not exists ai_chat_messages_conversation_created_idx
  on public.ai_chat_messages (conversation_id, created_at);

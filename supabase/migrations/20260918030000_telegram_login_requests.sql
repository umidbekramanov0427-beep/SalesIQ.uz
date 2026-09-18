-- Telegram-based login: a short-lived, single-use handoff between a
-- browser tab (which only ever holds a random opaque token) and the
-- platform's Telegram bot webhook (which confirms the visitor's real
-- Telegram identity by matching their already-linked chat id, see
-- telegram_chat_id on profiles). No client-facing RLS policies at all --
-- every read/write goes through supabaseAdmin from
-- telegram.login-start/telegram.login-status/telegram.webhook, never the
-- browser's own Supabase client, so RLS with zero policies (default deny)
-- is exactly the posture this table needs.
create table if not exists public.telegram_login_requests (
  token text primary key,
  status text not null default 'pending',
  user_id uuid references public.profiles(id) on delete cascade,
  token_hash text,
  email text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

alter table public.telegram_login_requests enable row level security;

create index if not exists telegram_login_requests_expires_at_idx
  on public.telegram_login_requests (expires_at);

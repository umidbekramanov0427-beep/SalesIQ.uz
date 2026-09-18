-- Auto-responder rules: admin-configured "ask this, save the answer to this
-- CRM field" scripts for messaging channels. This migration only adds the
-- config table — actually sending messages needs a connected messaging
-- channel (WhatsApp/Telegram/Instagram), which isn't wired up yet.
-- Run this in the Supabase SQL Editor the same way as the earlier migrations.

create table if not exists public.auto_responders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_text text not null,
  message text not null,
  channels text[] not null default '{}',
  target_field text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auto_responders enable row level security;

drop policy if exists "auto_responders_select" on public.auto_responders;
create policy "auto_responders_select" on public.auto_responders
  for select to authenticated using (public.current_user_role() = 'super_admin');
drop policy if exists "auto_responders_write" on public.auto_responders;
create policy "auto_responders_write" on public.auto_responders
  for all to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

create index if not exists auto_responders_active_idx on public.auto_responders (active);

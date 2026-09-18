-- Two fixed AI agent configs (chat + call analysis), admin-managed. Actually
-- running them requires a live model API key configured server-side — this
-- table only stores the configuration/preset, enforced honestly in the UI.
create table if not exists public.ai_agents (
  kind text primary key check (kind in ('chat', 'call')),
  provider text not null default 'anthropic',
  model text not null default 'claude-sonnet-5',
  system_prompt text not null default '',
  channels text[] not null default '{}',
  active boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.ai_agents enable row level security;

drop policy if exists "ai_agents_select" on public.ai_agents;
create policy "ai_agents_select" on public.ai_agents
  for select to authenticated using (public.current_user_role() = 'super_admin');

drop policy if exists "ai_agents_write" on public.ai_agents;
create policy "ai_agents_write" on public.ai_agents
  for all to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

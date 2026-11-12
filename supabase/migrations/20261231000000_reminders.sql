-- Eslatmalar (src/lib/reminders.ts): a person's reminders -- a line of text
-- at a time, once or repeating, optionally about a lead. The every-minute
-- cron (/crm/speed-to-lead -> reminders.server.ts) sends each due one as a
-- bell notification, push and Telegram message. People see and change their
-- own reminders and the ones they set; admins and heads of sales also set
-- them for others and see the company's. Adds one table; nothing existing
-- is changed.

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Who is reminded.
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 500),
  remind_at timestamptz not null,
  repeat text not null default 'none'
    check (repeat in ('none', 'daily', 'weekdays', 'weekly', 'monthly')),
  -- When it was last sent (a repeating one moves remind_at past it).
  sent_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reminders_due_idx
  on public.reminders (remind_at) where done_at is null;
create index if not exists reminders_person_idx
  on public.reminders (organization_id, profile_id, remind_at);

alter table public.reminders enable row level security;

drop policy if exists reminders_select on public.reminders;
create policy reminders_select on public.reminders for select to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (profile_id = auth.uid() or created_by = auth.uid() or public.is_admin_or_manager())
  );

drop policy if exists reminders_insert on public.reminders;
create policy reminders_insert on public.reminders for insert to authenticated
  with check (
    organization_id = public.current_user_org_id()
    and created_by = auth.uid()
    and (profile_id = auth.uid() or public.is_admin_or_manager())
  );

drop policy if exists reminders_update on public.reminders;
create policy reminders_update on public.reminders for update to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (profile_id = auth.uid() or created_by = auth.uid() or public.is_admin_or_manager())
  )
  with check (organization_id = public.current_user_org_id());

drop policy if exists reminders_delete on public.reminders;
create policy reminders_delete on public.reminders for delete to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (profile_id = auth.uid() or created_by = auth.uid() or public.is_admin_or_manager())
  );

notify pgrst, 'reload schema';

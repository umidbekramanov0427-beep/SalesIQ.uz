-- Davomat izohlari: a comment a person leaves about their day -- the reason
-- they are late, won't come or leave early -- from the staff Telegram bot
-- ("📝 Izoh yozish", or "📝 Sababini yozish" under a late reminder) or from
-- Nazorat -> Davomat on the site. Admins and heads of sales see the
-- company's; everyone sees and writes their own. Adds a table; nothing is
-- deleted or rewritten. Idempotent.

create table if not exists public.attendance_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null default 'other' check (kind in ('late', 'absent', 'leave', 'other')),
  body text not null check (char_length(body) between 1 and 1000),
  source text not null default 'web' check (source in ('telegram', 'web')),
  created_at timestamptz not null default now()
);

create index if not exists attendance_notes_org_day_idx
  on public.attendance_notes (organization_id, day desc);
create index if not exists attendance_notes_profile_day_idx
  on public.attendance_notes (profile_id, day desc);

alter table public.attendance_notes enable row level security;

drop policy if exists "attendance_notes_select" on public.attendance_notes;
create policy "attendance_notes_select" on public.attendance_notes for select to authenticated
  using (organization_id = public.current_user_org_id()
         and (profile_id = auth.uid() or public.is_admin_or_manager()));

drop policy if exists "attendance_notes_insert" on public.attendance_notes;
create policy "attendance_notes_insert" on public.attendance_notes for insert to authenticated
  with check (organization_id = public.current_user_org_id() and profile_id = auth.uid()
              and source = 'web');

drop policy if exists "attendance_notes_delete" on public.attendance_notes;
create policy "attendance_notes_delete" on public.attendance_notes for delete to authenticated
  using (organization_id = public.current_user_org_id() and profile_id = auth.uid());

grant select, insert, delete on public.attendance_notes to authenticated;
grant all on public.attendance_notes to service_role;

-- A comment written in Telegram shows on an open Davomat page at once.
do $$ begin
  alter publication supabase_realtime add table public.attendance_notes;
exception
  when duplicate_object then null;
  when undefined_object then raise notice 'supabase_realtime publication not found';
end $$;

notify pgrst, 'reload schema';

-- Video lessons all render in one flat grid today (LessonsTab in
-- content-library.tsx), with no way to group them -- a sales-team lesson
-- and an AmoCRM how-to sit side by side with nothing telling them apart.
-- This adds admin-creatable folders ("Sotuv bo'limi", "AmoCRM darsliklari",
-- ...) a lesson can be filed under, so each topic gets its own place
-- instead of everything mixing together.

create table if not exists public.lesson_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Nullable and ON DELETE SET NULL: an existing lesson with no section (or
-- whose section gets deleted) falls back to the "General" bucket in the
-- UI rather than disappearing or blocking the delete.
alter table public.lessons
  add column if not exists section_id uuid references public.lesson_sections(id) on delete set null;

create index if not exists lesson_sections_org_idx on public.lesson_sections(organization_id, position);
create index if not exists lessons_section_idx on public.lessons(section_id);

alter table public.lesson_sections enable row level security;

drop trigger if exists set_org_id on public.lesson_sections;
create trigger set_org_id before insert on public.lesson_sections
  for each row execute function public.set_organization_id();

-- Same access shape as lessons themselves: everyone in the org can see the
-- folders (to browse by), only ROP/super_admin can create/rename/reorder
-- or delete them.
drop policy if exists "lesson_sections_select" on public.lesson_sections;
create policy "lesson_sections_select" on public.lesson_sections
  for select to authenticated using (organization_id = public.current_user_org_id());
drop policy if exists "lesson_sections_write" on public.lesson_sections;
create policy "lesson_sections_write" on public.lesson_sections
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

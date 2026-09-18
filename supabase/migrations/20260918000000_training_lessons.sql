-- Training module: video lessons with per-manager watch progress, plus AI
-- generated training recommendations rolled up from "lost" lead call
-- analysis (see analyzeCallById in audio-analytics.analyze.ts) so a ROP can
-- see which mistakes repeat across the team and point each rep at the
-- lesson that fixes it.

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title text not null,
  description text,
  video_url text not null,
  thumbnail_url text,
  duration_seconds integer,
  -- Free-form slug ("e'tirozlar", "narx taqdimoti", "call_to_action", ...)
  -- matched against training_recommendations.error_category so a fresh
  -- recommendation can be auto-linked to the lesson that addresses it.
  category text,
  position integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  -- Furthest playback position this manager has reached, in seconds --
  -- what "12-minut 45-sekundda to'xtatgan" reads off of.
  last_position_seconds integer not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  last_watched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (lesson_id, user_id)
);

create table if not exists public.training_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  manager_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  call_id uuid references public.amocrm_calls(id) on delete set null,
  -- Short stable slug the ranking groups by, e.g. "objection_handling",
  -- "pricing", "call_to_action", "discovery", "follow_up".
  error_category text not null,
  title text not null,
  description text not null,
  recommended_lesson_id uuid references public.lessons(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'acknowledged', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists lessons_org_idx on public.lessons(organization_id, position);
create index if not exists lesson_progress_lesson_idx on public.lesson_progress(lesson_id);
create index if not exists lesson_progress_user_idx on public.lesson_progress(user_id);
create index if not exists training_recommendations_org_idx
  on public.training_recommendations(organization_id, created_at desc);
create index if not exists training_recommendations_manager_idx
  on public.training_recommendations(manager_id, created_at desc);
create index if not exists training_recommendations_category_idx
  on public.training_recommendations(organization_id, error_category);

alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.training_recommendations enable row level security;

drop trigger if exists set_org_id on public.lessons;
create trigger set_org_id before insert on public.lessons
  for each row execute function public.set_organization_id();
drop trigger if exists set_org_id on public.lesson_progress;
create trigger set_org_id before insert on public.lesson_progress
  for each row execute function public.set_organization_id();
drop trigger if exists set_updated_at on public.lessons;
create trigger set_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();

-- Lessons: everyone in the org can watch, only ROP/super_admin curate them.
drop policy if exists "lessons_select" on public.lessons;
create policy "lessons_select" on public.lessons
  for select to authenticated using (organization_id = public.current_user_org_id());
drop policy if exists "lessons_write" on public.lessons;
create policy "lessons_write" on public.lessons
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- Lesson progress: a rep only ever writes their own row; ROP/super_admin
-- read everyone's for the per-video statistics panel.
drop policy if exists "lesson_progress_select" on public.lesson_progress;
create policy "lesson_progress_select" on public.lesson_progress
  for select to authenticated
  using (user_id = auth.uid() or (organization_id = public.current_user_org_id() and public.is_admin_or_manager()));
drop policy if exists "lesson_progress_upsert" on public.lesson_progress;
create policy "lesson_progress_upsert" on public.lesson_progress
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "lesson_progress_update" on public.lesson_progress;
create policy "lesson_progress_update" on public.lesson_progress
  for update to authenticated using (user_id = auth.uid());

-- Training recommendations: a rep sees their own; ROP/super_admin see the
-- whole team's (rows are written by the server with the service role from
-- audio-analytics.analyze.ts, so no insert policy is needed for clients --
-- only status updates, e.g. marking a recommendation "done").
drop policy if exists "training_recommendations_select" on public.training_recommendations;
create policy "training_recommendations_select" on public.training_recommendations
  for select to authenticated
  using (manager_id = auth.uid() or (organization_id = public.current_user_org_id() and public.is_admin_or_manager()));
drop policy if exists "training_recommendations_update" on public.training_recommendations;
create policy "training_recommendations_update" on public.training_recommendations
  for update to authenticated
  using (manager_id = auth.uid() or (organization_id = public.current_user_org_id() and public.is_admin_or_manager()));

-- Storage for lesson videos/thumbnails -- same public-bucket, path-scoped-
-- by-uploader shape as content-library.
insert into storage.buckets (id, name, public)
values ('lesson-videos', 'lesson-videos', true)
on conflict (id) do nothing;

drop policy if exists "lesson_videos_insert" on storage.objects;
create policy "lesson_videos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lesson-videos' and public.is_admin_or_manager());

drop policy if exists "lesson_videos_delete" on storage.objects;
create policy "lesson_videos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'lesson-videos' and public.is_admin_or_manager());

drop policy if exists "lesson_videos_read" on storage.objects;
create policy "lesson_videos_read" on storage.objects
  for select to public
  using (bucket_id = 'lesson-videos');

-- Stage hints by experience (5CRM's «bosqich uchun maslahatlar»): besides
-- the existing `hint` (now the «Usta» level, for everyone else), a text for
-- new people («Yangi boshlovchi») and for those with some experience
-- («Tajribali xodim»). Only adds two nullable columns; nothing is rewritten.
alter table public.pipeline_stages
  add column if not exists hint_novice text,
  add column if not exists hint_experienced text;

comment on column public.pipeline_stages.hint_novice is
  'Stage hint for new staff (trainees, first 30 days).';
comment on column public.pipeline_stages.hint_experienced is
  'Stage hint for staff with some experience (up to 6 months).';

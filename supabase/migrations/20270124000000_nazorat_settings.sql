-- Nazorat -> «Sozlash» and the team's celebrations.
--
-- 1. org_general_settings.control_settings: how Normativ, Jarimalar, KPI and
--    Reja va fakt count, and what the celebrations say
--    (src/lib/control-settings.ts).
-- 2. sales_plans: a plan may be a funnel's own (pipeline_id), is cut into
--    parts (4 = quarters, 8, ...) and carries the month's working days.
-- 3. plan_milestones: each part of a plan reached, once -- so a
--    celebration is shown once per part.
-- 4. check_plan_milestones(): when a lead enters a won stage, the plans it
--    counts for are re-checked; a newly reached part greets the people of
--    that plan ('TeamCelebrate' notifications -> confetti on their screens).
--    It also greets the day's first sale when that is switched on.
-- 5. fine_types: which automatic rule a fine type follows, and whether it
--    is computed automatically at all.

-- 1
alter table public.org_general_settings
  add column if not exists control_settings jsonb not null default '{}'::jsonb;

-- 2
alter table public.sales_plans
  add column if not exists pipeline_id uuid references public.pipelines(id) on delete cascade,
  add column if not exists parts smallint not null default 4,
  add column if not exists work_days smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_plans_parts_check') then
    alter table public.sales_plans
      add constraint sales_plans_parts_check check (parts between 1 and 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_plans_work_days_check') then
    alter table public.sales_plans
      add constraint sales_plans_work_days_check check (work_days is null or work_days between 1 and 31);
  end if;
end $$;

drop index if exists public.sales_plans_one_per_month;
create unique index if not exists sales_plans_one_per_month_v2
  on public.sales_plans (
    organization_id,
    coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(pipeline_id, '00000000-0000-0000-0000-000000000000'::uuid),
    month
  );

-- The month's won deals per owner and funnel (a funnel's plan sums its own).
create or replace function public.sales_plan_facts_by_funnel(p_from timestamptz, p_to timestamptz)
returns table (owner_id uuid, pipeline_id uuid, deals integer, revenue numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select l.owner_id,
         s.pipeline_id,
         count(*)::integer,
         coalesce(sum(coalesce(nullif(l.expected_revenue, 0), l.budget, 0)), 0)
    from public.leads l
    join public.pipeline_stages s
      on s.id = l.stage_id and (s.is_won or coalesce(s.counts_as_won_override, false))
   where l.organization_id = public.current_user_org_id()
     and coalesce(l.stage_changed_at, l.updated_at, l.created_at) >= p_from
     and coalesce(l.stage_changed_at, l.updated_at, l.created_at) < p_to
   group by l.owner_id, s.pipeline_id;
$$;

revoke execute on function public.sales_plan_facts_by_funnel(timestamptz, timestamptz) from public, anon;
grant execute on function public.sales_plan_facts_by_funnel(timestamptz, timestamptz) to authenticated;

-- 3
create table if not exists public.plan_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.sales_plans(id) on delete cascade,
  part smallint not null,
  parts smallint not null,
  fact numeric(18, 2) not null default 0,
  reached_at timestamptz not null default now(),
  unique (plan_id, part, parts)
);

create index if not exists plan_milestones_org on public.plan_milestones (organization_id, reached_at desc);

alter table public.plan_milestones enable row level security;

drop policy if exists plan_milestones_select on public.plan_milestones;
create policy plan_milestones_select on public.plan_milestones
  for select to authenticated
  using (organization_id = public.current_user_org_id());

grant select on public.plan_milestones to authenticated;
grant all on public.plan_milestones to service_role;

-- 1 250 000 000 -> '1,25 mlrd' (the same as shortMoney in control-settings.ts).
create or replace function public.short_money(p numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when abs(p) >= 1000000000 then replace(rtrim(rtrim(round(p / 1000000000, 2)::text, '0'), '.'), '.', ',') || ' mlrd'
    when abs(p) >= 1000000 then replace(rtrim(rtrim(round(p / 1000000, 2)::text, '0'), '.'), '.', ',') || ' mln'
    when abs(p) >= 1000 then replace(rtrim(rtrim(round(p / 1000, 2)::text, '0'), '.'), '.', ',') || ' ming'
    else round(p)::text
  end;
$$;

-- 4
create or replace function public.check_plan_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st public.pipeline_stages%rowtype;
  was_won boolean := false;
  cfg jsonb;
  tz text;
  v_month date;
  v_from timestamptz;
  v_to timestamptz;
  v_day_from timestamptz;
  p public.sales_plans%rowtype;
  v_rule jsonb;
  v_fact numeric;
  v_deals integer;
  v_ratio numeric;
  v_reached integer;
  v_new integer;
  v_pct numeric;
  v_pct_txt text;
  v_kind text;
  v_style text;
  v_text text;
  v_body text;
  v_name text;
  v_funnel text;
  v_fact_txt text;
  v_target_txt text;
  v_left_txt text;
begin
  if new.stage_id is null or new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  select * into st from public.pipeline_stages where id = new.stage_id;
  if not found or not (coalesce(st.is_won, false) or coalesce(st.counts_as_won_override, false)) then
    return new;
  end if;
  if old.stage_id is not null then
    select coalesce(s.is_won, false) or coalesce(s.counts_as_won_override, false)
      into was_won
      from public.pipeline_stages s where s.id = old.stage_id;
    if coalesce(was_won, false) then
      return new;
    end if;
  end if;

  select coalesce(g.control_settings -> 'celebrations', '{}'::jsonb),
         coalesce(nullif(g.timezone, ''), 'Asia/Tashkent')
    into cfg, tz
    from public.org_general_settings g
   where g.organization_id = new.organization_id;
  cfg := coalesce(cfg, '{}'::jsonb);
  tz := coalesce(tz, 'Asia/Tashkent');
  v_month := date_trunc('month', now() at time zone tz)::date;
  v_from := v_month::timestamp at time zone tz;
  v_to := (v_month + interval '1 month')::timestamp at time zone tz;

  select coalesce(nullif(full_name, ''), 'Jamoa') into v_name
    from public.profiles where id = new.owner_id;
  v_name := coalesce(v_name, 'Jamoa');

  -- The day's first sale in the company.
  if coalesce((cfg #>> '{firstSale,on}')::boolean, false) then
    v_day_from := date_trunc('day', now() at time zone tz) at time zone tz;
    if not exists (
      select 1
        from public.leads l
        join public.pipeline_stages s
          on s.id = l.stage_id and (s.is_won or coalesce(s.counts_as_won_override, false))
       where l.organization_id = new.organization_id
         and l.id <> new.id
         and coalesce(l.stage_changed_at, l.updated_at) >= v_day_from
    ) then
      v_style := coalesce(nullif(cfg #>> '{firstSale,style}', ''), 'rocket');
      v_text := replace(
        coalesce(nullif(cfg #>> '{firstSale,text}', ''), 'Bugungi birinchi sotuv! {name} ochib berdi'),
        '{name}', v_name);
      insert into public.notifications (organization_id, user_id, type, title, body, link, read)
      select new.organization_id, pr.id, 'TeamCelebrate', left(v_text, 300), new.name,
             '/crm/leads/' || new.id || '?c=first&s=' || v_style, false
        from public.profiles pr
       where pr.organization_id = new.organization_id
         and pr.role::text <> 'platform_owner';
    end if;
  end if;

  -- The plans this sale counts for: the company's, its funnel's, the owner's.
  for p in
    select * from public.sales_plans sp
     where sp.organization_id = new.organization_id
       and sp.month = v_month
       and (sp.profile_id is null or sp.profile_id = new.owner_id)
       and (sp.pipeline_id is null or sp.pipeline_id = st.pipeline_id)
       and (sp.target_amount > 0 or sp.target_deals > 0)
  loop
    v_rule := case when p.profile_id is null then cfg -> 'team' else cfg -> 'personal' end;
    v_rule := coalesce(v_rule, '{}'::jsonb);
    if not coalesce((v_rule ->> 'on')::boolean, true) then
      continue;
    end if;

    select count(*)::integer,
           coalesce(sum(coalesce(nullif(l.expected_revenue, 0), l.budget, 0)), 0)
      into v_deals, v_fact
      from public.leads l
      join public.pipeline_stages s
        on s.id = l.stage_id and (s.is_won or coalesce(s.counts_as_won_override, false))
     where l.organization_id = p.organization_id
       and coalesce(l.stage_changed_at, l.updated_at, l.created_at) >= v_from
       and coalesce(l.stage_changed_at, l.updated_at, l.created_at) < v_to
       and (p.profile_id is null or l.owner_id = p.profile_id)
       and (p.pipeline_id is null or s.pipeline_id = p.pipeline_id);

    if p.target_amount > 0 then
      v_ratio := v_fact / p.target_amount;
    else
      v_ratio := v_deals::numeric / p.target_deals;
    end if;
    v_reached := least(p.parts, floor(v_ratio * p.parts + 0.000000001)::integer);
    if v_reached < 1 then
      continue;
    end if;

    with ins as (
      insert into public.plan_milestones (organization_id, plan_id, part, parts, fact)
      select p.organization_id, p.id, g, p.parts,
             case when p.target_amount > 0 then v_fact else v_deals end
        from generate_series(1, v_reached) g
      on conflict (plan_id, part, parts) do nothing
      returning part
    )
    select max(part) into v_new from ins;
    if v_new is null then
      continue;
    end if;

    v_pct := round(v_new * 100.0 / p.parts, 1);
    v_pct_txt := case when v_pct = trunc(v_pct) then trunc(v_pct)::text
                      else replace(v_pct::text, '.', ',') end;
    if p.target_amount > 0 then
      v_fact_txt := public.short_money(v_fact);
      v_target_txt := public.short_money(p.target_amount);
      v_left_txt := public.short_money(greatest(p.target_amount - v_fact, 0));
    else
      v_fact_txt := v_deals || ' ta sotuv';
      v_target_txt := p.target_deals || ' ta sotuv';
      v_left_txt := greatest(p.target_deals - v_deals, 0) || ' ta sotuv';
    end if;
    v_funnel := null;
    if p.pipeline_id is not null then
      select name into v_funnel from public.pipelines where id = p.pipeline_id;
    end if;

    if p.profile_id is not null then
      v_kind := 'personal';
      v_style := coalesce(nullif(v_rule ->> 'style', ''), 'trophy');
      v_text := coalesce(nullif(v_rule ->> 'text', ''), '{name} shaxsiy rejasining {pct}% ini bajardi!');
    elsif v_new = p.parts then
      v_kind := 'done';
      v_style := coalesce(nullif(v_rule ->> 'style', ''), 'confetti');
      v_text := coalesce(nullif(v_rule ->> 'doneText', ''), 'Reja to''liq bajarildi! {fact} — bu {target} rejaning 100% i');
    else
      v_kind := 'part';
      v_style := coalesce(nullif(v_rule ->> 'style', ''), 'confetti');
      v_text := coalesce(nullif(v_rule ->> 'text', ''), 'Tabriklayman! Biz rejamizning {pct}% ini bosib o''tdik — {fact} / {target}');
    end if;
    v_text := replace(replace(replace(replace(replace(replace(replace(replace(v_text,
      '{pct}', v_pct_txt),
      '{part}', v_new::text),
      '{parts}', p.parts::text),
      '{fact}', v_fact_txt),
      '{target}', v_target_txt),
      '{left}', v_left_txt),
      '{name}', v_name),
      '{funnel}', coalesce(v_funnel, ''));
    v_body := coalesce(v_funnel || ' · ', '') || v_new || '/' || p.parts || ' · ' || v_fact_txt || ' / ' || v_target_txt;

    insert into public.notifications (organization_id, user_id, type, title, body, link, read)
    select new.organization_id, pr.id, 'TeamCelebrate', left(v_text, 300), v_body,
           '/attendance?tab=reja&c=' || v_kind || '&s=' || v_style || '&pct=' || v_pct::text, false
      from public.profiles pr
     where pr.organization_id = new.organization_id
       and pr.role::text <> 'platform_owner'
       and case
             when p.profile_id is not null and coalesce(v_rule ->> 'audience', 'all') = 'self'
               then pr.id = p.profile_id
             when p.pipeline_id is not null
               then pr.role::text in ('super_admin', 'rop')
                 or exists (
                   select 1
                     from public.leads l2
                     join public.pipeline_stages s2 on s2.id = l2.stage_id
                    where l2.organization_id = new.organization_id
                      and l2.owner_id = pr.id
                      and s2.pipeline_id = p.pipeline_id
                 )
             else true
           end;
  end loop;
  return new;
end;
$$;

revoke execute on function public.check_plan_milestones() from public, anon, authenticated;

drop trigger if exists check_plan_milestones on public.leads;
create trigger check_plan_milestones
  after update of stage_id on public.leads
  for each row execute function public.check_plan_milestones();

-- 5
alter table if exists public.fine_types
  add column if not exists rule_key text,
  add column if not exists auto boolean not null default true;

do $$
begin
  if to_regclass('public.fine_types') is not null then
    update public.fine_types
       set rule_key = name
     where rule_key is null
       and name in ('Ishlanmagan yangi lid', 'Bajarilmagan zadacha', 'Noto''g''ri LOST',
                    'Javobsiz kiruvchi aloqa');
  end if;
end $$;

notify pgrst, 'reload schema';

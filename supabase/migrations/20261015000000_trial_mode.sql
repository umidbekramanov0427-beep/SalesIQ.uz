-- Free-trial mode. A new organization (self-signup or created by the
-- platform owner) starts as a TRIAL: for its first 14 days it gets a
-- reduced version of its plan (no automation/telephony/bulk messaging/
-- e-signature/web forms/exports/report builder, at most 3 logins, at most
-- 20 AI-analyzed calls -- see src/lib/org-access.ts). The first real
-- payment (or the platform owner marking it paid) sets is_trial = false
-- and unlocks the full plan. Once trial_ends_at passes without payment the
-- whole app locks except the billing page.
--
-- Existing organizations are backfilled as NOT trial, so nobody already
-- using the platform loses features the moment this runs. Only done the
-- first time (when the column is created), so re-running this script later
-- never flips a genuine new trial org to paid.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'is_trial'
  ) then
    alter table public.organizations add column is_trial boolean not null default true;
    update public.organizations set is_trial = false;
  end if;
end $$;

-- Login-time seat check, now trial-aware: a trial org may have at most 3
-- people signed in regardless of plan (mirrors TRIAL_SEAT_LIMIT in
-- src/lib/org-access.ts -- keep both in sync).
create or replace function public.check_seat_login(p_profile_id uuid)
returns table(allowed boolean, seat_limit integer, seat_rank integer)
language sql stable security definer set search_path = public as $$
  with target as (
    select id, organization_id
    from public.profiles
    where id = p_profile_id
  ),
  ranked as (
    select p.id,
           row_number() over (
             partition by p.organization_id
             order by p.created_at asc, p.id asc
           ) as seat_rank
    from public.profiles p
    join target t on p.organization_id = t.organization_id
  ),
  org as (
    select o.plan, o.extra_seats, o.is_trial
    from public.organizations o
    join target t on o.id = t.organization_id
  )
  select
    case
      when target.organization_id is null then true
      when coalesce(org.is_trial, false) then coalesce(ranked.seat_rank, 2147483647) <= 3
      when org.plan = 'master_iq' then true
      else coalesce(ranked.seat_rank, 2147483647) <= (
        (case org.plan when 'start_iq' then 3 when 'analyst_iq' then 20 else 2147483647 end)
        + coalesce(org.extra_seats, 0)
      )
    end as allowed,
    case
      when coalesce(org.is_trial, false) then 3
      when org.plan = 'start_iq' then 3 + coalesce(org.extra_seats, 0)
      when org.plan = 'analyst_iq' then 20 + coalesce(org.extra_seats, 0)
      else null
    end as seat_limit,
    ranked.seat_rank as seat_rank
  from target
  left join ranked on ranked.id = target.id
  left join org on true;
$$;

grant execute on function public.check_seat_login(uuid) to authenticated;

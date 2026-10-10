-- Plan seats v2: Start IQ 5, Analyst IQ 25, Master IQ 60 included seats
-- (were 3 / 20 / unlimited). Mirrors SEAT_LIMITS in src/lib/plan-gating.ts.
--
-- Raising 3 -> 5 and 20 -> 25 applies to everyone right away. The new
-- 60-seat cap on Master IQ does NOT apply to organizations that were
-- already on Master IQ: they get unlimited_seats = true here and keep their
-- unlimited logins. The platform owner can also grant unlimited_seats to
-- any organization by hand on /platform/organizations/$orgId.

alter table public.organizations
  add column if not exists unlimited_seats boolean not null default false;

update public.organizations
   set unlimited_seats = true
 where plan = 'master_iq'
   and unlimited_seats = false;

-- Same contract as before (allowed, seat_limit, seat_rank). During a free
-- trial the limit is capped at 3 (TRIAL_SEAT_LIMIT in src/lib/org-access.ts).
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
           )::integer as seat_rank
    from public.profiles p
    join target t on p.organization_id = t.organization_id
  ),
  org as (
    select
      case
        when coalesce(o.unlimited_seats, false) then null
        else (case o.plan when 'analyst_iq' then 25 when 'master_iq' then 60 else 5 end)
             + coalesce(o.extra_seats, 0)
      end as plan_limit,
      (coalesce(o.is_trial, false)
        and coalesce(o.active, true)
        and (o.trial_ends_at is null or o.trial_ends_at > now())) as in_trial
    from public.organizations o
    join target t on o.id = t.organization_id
  ),
  lim as (
    select
      case
        when org.in_trial then least(coalesce(org.plan_limit, 3), 3)
        else org.plan_limit
      end as seat_limit
    from org
  )
  select
    case
      when target.organization_id is null then true
      when lim.seat_limit is null then true
      else coalesce(ranked.seat_rank, 2147483647) <= lim.seat_limit
    end as allowed,
    lim.seat_limit::integer as seat_limit,
    ranked.seat_rank as seat_rank
  from target
  left join ranked on ranked.id = target.id
  left join lim on true;
$$;

grant execute on function public.check_seat_login(uuid) to authenticated;

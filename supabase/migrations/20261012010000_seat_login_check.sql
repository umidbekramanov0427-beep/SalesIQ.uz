-- Enforces each plan's seat limit at LOGIN time, not just when an admin
-- explicitly adds a new employee (admin/create-employee.ts already checks
-- there). A profile auto-provisioned by AmoCRM sync (see syncUserMapping
-- in src/lib/amocrm/client.server.ts, which creates a 'sotuv_menejeri' row
-- with a shared default password so that rep can log in) still exists and
-- still owns synced leads regardless of plan -- the DATA import is never
-- blocked -- but actually SIGNING IN with it is blocked once the org is
-- over its plan's included seat count: CRM-imported logins should keep
-- working, but never push an org past its tariff's user limit.
--
-- Seats are ranked per organization by created_at (ties broken by id) --
-- the first N profiles (N = plan's included seats + extra_seats) may sign
-- in; anyone created after that boundary is blocked until the org
-- upgrades or the platform owner grants more seats via
-- /platform/organizations/$orgId. A profile with no organization (a pure
-- platform_owner) is always allowed. Mirrors SEAT_LIMITS in
-- src/lib/plan-gating.ts -- keep both in sync if the limits ever change.
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
    select o.plan, o.extra_seats
    from public.organizations o
    join target t on o.id = t.organization_id
  )
  select
    case
      when target.organization_id is null then true
      when org.plan = 'master_iq' then true
      else coalesce(ranked.seat_rank, 2147483647) <= (
        (case org.plan when 'start_iq' then 3 when 'analyst_iq' then 20 else 2147483647 end)
        + coalesce(org.extra_seats, 0)
      )
    end as allowed,
    case org.plan
      when 'start_iq' then 3 + coalesce(org.extra_seats, 0)
      when 'analyst_iq' then 20 + coalesce(org.extra_seats, 0)
      else null
    end as seat_limit,
    ranked.seat_rank as seat_rank
  from target
  left join ranked on ranked.id = target.id
  left join org on true;
$$;

grant execute on function public.check_seat_login(uuid) to authenticated;

-- leads.last_contact_at ("oxirgi aloqa") was never written by anything, so
-- Lid tahlili → Yo'nalish counted every open lead as "losing soon" and its
-- churn list showed "Hech qachon" with 100% risk for all of them.
--
-- It is now the time of the lead's last call that was actually talked
-- (amoCRM / uploaded calls that connected, telephony calls with talk time).
-- The amoCRM sync calls this for the leads of the calls it just wrote; one
-- statement per batch, and only leads whose value moves forward are touched.
create or replace function public.refresh_lead_last_contact(p_org uuid, p_lead_ids uuid[])
returns integer
language sql
security definer
set search_path to 'public'
as $$
  with last_call as (
    select lead_id, max(at) as at
    from (
      select c.lead_id, c.occurred_at as at
      from public.amocrm_calls c
      where c.organization_id = p_org
        and c.lead_id = any (p_lead_ids)
        and c.connected
      union all
      select p.lead_id, p.created_at
      from public.pbx_calls p
      where p.organization_id = p_org
        and p.lead_id = any (p_lead_ids)
        and p.duration_seconds > 0
    ) calls
    group by lead_id
  ),
  updated as (
    update public.leads l
    set last_contact_at = lc.at
    from last_call lc
    where l.id = lc.lead_id
      and l.organization_id = p_org
      and (l.last_contact_at is null or l.last_contact_at < lc.at)
    returning 1
  )
  select count(*)::integer from updated;
$$;

revoke execute on function public.refresh_lead_last_contact(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.refresh_lead_last_contact(uuid, uuid[]) to service_role;

-- One-time fill for calls already in the database (writes only leads whose
-- last_contact_at is empty or older than their last talked call).
select public.refresh_lead_last_contact(o.id, array(
  select distinct c.lead_id from public.amocrm_calls c
  where c.organization_id = o.id and c.lead_id is not null and c.connected
  union
  select distinct p.lead_id from public.pbx_calls p
  where p.organization_id = o.id and p.lead_id is not null and p.duration_seconds > 0
))
from public.organizations o;

notify pgrst, 'reload schema';

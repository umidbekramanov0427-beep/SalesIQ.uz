-- "Bugungi tushum" on the Reyting page: how much the funnel's revenue grew
-- since a moment (start of today). It used to rebuild every lead of the org
-- as it was at that moment (entities_as_of, all rows as JSON) and subtract
-- in the browser. Only leads changed since then can differ, so this sums
-- just those: their current revenue minus their revenue at that moment
-- (the "old" snapshot of their first audit row after it; a lead inserted
-- after it had none).
create or replace function public.lead_revenue_change_since(
  p_since timestamptz,
  p_funnel text default null,
  p_owner_ids uuid[] default null
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  with first_change as (
    select distinct on (a.entity_id) a.entity_id, a.action, a.meta
    from public.audit_logs a
    where a.organization_id = public.current_user_org_id()
      and a.entity_type = 'leads'
      and a.created_at >= p_since
    order by a.entity_id, a.created_at
  ),
  before_total as (
    select coalesce(sum(coalesce((f.meta -> 'old' ->> 'expected_revenue')::numeric, 0)), 0) as v
    from first_change f
    where f.action in ('update', 'delete')
      and (p_funnel is null
           or coalesce(nullif(f.meta -> 'old' ->> 'funnel', ''), 'Direct Sales') = p_funnel)
      and (p_owner_ids is null or (f.meta -> 'old' ->> 'owner_id')::uuid = any (p_owner_ids))
  ),
  after_total as (
    select coalesce(sum(l.expected_revenue), 0) as v
    from first_change f
    join public.leads l on l.id = f.entity_id
    where (p_funnel is null or coalesce(nullif(l.funnel, ''), 'Direct Sales') = p_funnel)
      and (p_owner_ids is null or l.owner_id = any (p_owner_ids))
  )
  select (select v from after_total) - (select v from before_total);
$$;

grant execute on function public.lead_revenue_change_since(timestamptz, text, uuid[]) to authenticated;

create index if not exists audit_logs_org_type_created_idx
  on public.audit_logs (organization_id, entity_type, created_at);

notify pgrst, 'reload schema';

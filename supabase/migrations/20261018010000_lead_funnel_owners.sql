-- The sidebar's funnel list (and every funnel picker) only needs the
-- distinct (funnel, owner) pairs of the org's leads, but it downloaded every
-- lead to work that out -- on every page, since the sidebar is always there.
-- This returns just those pairs (a few dozen rows). security invoker: the
-- caller's own leads RLS still applies.
create or replace function public.lead_funnel_owners()
returns table (funnel text, owner_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct coalesce(nullif(l.funnel, ''), 'Direct Sales') as funnel, l.owner_id
  from public.leads l
  where l.organization_id = public.current_user_org_id();
$$;

grant execute on function public.lead_funnel_owners() to authenticated;

notify pgrst, 'reload schema';

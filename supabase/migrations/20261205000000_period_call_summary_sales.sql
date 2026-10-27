-- Home page "Bog'langanlardan": a sale is any sales stage (prepayment,
-- half or full payment, won), the same set the period conversion counts --
-- not only won stages. Stage names decide that, so the function returns
-- connected leads per current stage (connected_by_stage) and the app sums
-- the sales ones. Same signature as before; idempotent.
create or replace function public.period_call_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_funnel text default null,
  p_owner_ids uuid[] default null,
  p_tz text default 'UTC'
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with c as (
    select c.lead_id, c.connected, c.duration_seconds, c.score, c.occurred_at,
           l.owner_id, l.stage_id
    from public.amocrm_calls c
    join public.leads l on l.id = c.lead_id
    where c.organization_id = public.current_user_org_id()
      and c.occurred_at >= p_from and c.occurred_at < p_to
      and l.owner_id is not null
      and (p_funnel is null or coalesce(nullif(l.funnel, ''), 'Direct Sales') = p_funnel)
      and (p_owner_ids is null or l.owner_id = any (p_owner_ids))
  )
  select jsonb_build_object(
    'total', (select count(*) from c),
    'connected', (select count(*) from c where c.connected),
    'seconds', (select coalesce(sum(c.duration_seconds), 0) from c),
    'scored', (select count(c.score) from c),
    'score_sum', (select coalesce(sum(c.score), 0) from c),
    'connected_leads', (select count(distinct c.lead_id) from c where c.connected),
    'won_connected_leads', (
      select count(distinct c.lead_id)
      from c join public.pipeline_stages s on s.id = c.stage_id and s.is_won
      where c.connected
    ),
    'connected_by_stage', coalesce((
      select jsonb_agg(jsonb_build_object('stage_id', z.stage_id, 'n', z.n))
      from (
        select x.stage_id, count(*) as n
        from (select distinct c.lead_id, c.stage_id from c where c.connected) x
        group by x.stage_id
      ) z
    ), '[]'::jsonb),
    'by_owner', coalesce((
      select jsonb_agg(jsonb_build_object(
        'owner_id', x.owner_id, 'calls', x.n, 'seconds', x.secs, 'scored', x.sc, 'score_sum', x.ss))
      from (
        select c.owner_id, count(*) as n, coalesce(sum(c.duration_seconds), 0) as secs,
               count(c.score) as sc, coalesce(sum(c.score), 0) as ss
        from c group by c.owner_id
      ) x
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', y.d, 'connected', y.cn, 'missed', y.ms))
      from (
        select (c.occurred_at at time zone p_tz)::date as d,
               count(*) filter (where c.connected) as cn,
               count(*) filter (where not c.connected) as ms
        from c group by 1
      ) y
    ), '[]'::jsonb)
  );
$$;
revoke execute on function public.period_call_summary(timestamptz, timestamptz, text, uuid[], text) from anon, public;
grant execute on function public.period_call_summary(timestamptz, timestamptz, text, uuid[], text) to authenticated;

notify pgrst, 'reload schema';

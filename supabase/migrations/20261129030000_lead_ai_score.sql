-- AI lead score from the lead's chat (src/lib/lead-scoring*.ts): the
-- existing leads.score / leads.temperature get filled for leads that talk
-- in Telegram, not only for leads with an analysed call, plus why and what
-- to do next.
alter table public.leads
  add column if not exists ai_score_reason text,
  add column if not exists ai_next_action text,
  add column if not exists ai_scored_at timestamptz;

-- Leads whose client wrote something new since they were last scored
-- (the 5-minute cron scores a few per tick). Server-only.
create or replace function public.leads_to_score(p_limit integer default 15)
returns table (lead_id uuid, organization_id uuid, last_in timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.organization_id, m.last_in
    from (
      select lead_id, max(created_at) as last_in
        from public.lead_telegram_messages
       where direction = 'in'
         and created_at > now() - interval '3 days'
       group by lead_id
    ) m
    join public.leads l on l.id = m.lead_id
   where l.ai_scored_at is null or l.ai_scored_at < m.last_in
   order by m.last_in desc
   limit greatest(1, least(p_limit, 100));
$$;

revoke execute on function public.leads_to_score(integer) from public, anon, authenticated;
grant execute on function public.leads_to_score(integer) to service_role;

-- Duplicate control per funnel + mandatory task control ("zapret zadacha").
--
-- 1) One client = one lead per funnel. A person who registers 10 or 20 times
--    into the same funnel stays a single lead there (repeat_count counts the
--    extra registrations); registering in a different funnel still creates a
--    separate lead in that funnel. Phones match on their last 9 digits, so
--    "+998 90 123-45-67" and "901234567" are the same client.
--    Only the platform's own CRM leads count: leads synced from amoCRM or
--    Bitrix24 are there for analytics only and never take part.
-- 2) A stage can require an open task, for everyone or only for chosen
--    managers. A lead can't be moved into such a stage without one -- checked
--    here in the database, not just in the UI.

alter table public.pipeline_stage_rules
  add column if not exists task_profiles uuid[] not null default '{}';

alter table public.org_general_settings
  add column if not exists dedupe_funnel_merge boolean not null default true;

alter table public.leads
  add column if not exists repeat_count integer not null default 0,
  add column if not exists last_repeat_at timestamptz;

create index if not exists idx_contacts_org_phone9
  on public.contacts (organization_id, right(regexp_replace(phone, '\D', '', 'g'), 9))
  where phone is not null;
create index if not exists idx_leads_org_funnel_contact
  on public.leads (organization_id, funnel, contact_id);

-- The last 9 digits of a phone, or null when it has fewer than 7 digits.
create or replace function public.phone9(p text)
returns text language sql immutable as $$
  select case
    when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 7
      then right(regexp_replace(p, '\D', '', 'g'), 9)
  end;
$$;

-- The oldest lead in p_funnel whose contact shares the phone (or, when the
-- org matches by email too, the email). Null when the client is new there.
create or replace function public.funnel_lead_for_client(
  p_org uuid,
  p_funnel text,
  p_phone text,
  p_email text,
  p_exclude uuid default null
)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_phone text := public.phone9(p_phone);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_match_email boolean;
  v_id uuid;
begin
  select coalesce(s.dedupe_match_email, false) into v_match_email
  from public.org_general_settings s where s.organization_id = p_org;
  if not coalesce(v_match_email, false) then
    v_email := null;
  end if;
  if v_phone is null and v_email is null then
    return null;
  end if;

  select l.id into v_id
  from public.leads l
  join public.contacts c on c.id = l.contact_id
  where l.organization_id = p_org
    and l.amocrm_id is null
    and l.bitrix24_deal_id is null
    and coalesce(l.funnel, 'Direct Sales') = coalesce(p_funnel, 'Direct Sales')
    and (p_exclude is null or l.id <> p_exclude)
    and (
      (v_phone is not null and (
        right(regexp_replace(c.phone, '\D', '', 'g'), 9) = v_phone
        or right(regexp_replace(c.alt_phone, '\D', '', 'g'), 9) = v_phone))
      or (v_email is not null and lower(c.email) = v_email)
    )
  order by l.created_at asc
  limit 1;
  return v_id;
end;
$$;

-- For the "new lead" form: is this client already a lead in the funnel?
create or replace function public.find_funnel_duplicate(
  p_funnel text,
  p_phone text,
  p_email text default null,
  p_exclude uuid default null
)
returns table (id uuid, name text, owner_id uuid, owner_name text, stage_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.name, l.owner_id, p.full_name, s.name, l.created_at
  from public.leads l
  left join public.profiles p on p.id = l.owner_id
  left join public.pipeline_stages s on s.id = l.stage_id
  where l.id = public.funnel_lead_for_client(
    public.current_user_org_id(), p_funnel, p_phone, p_email, p_exclude
  );
$$;

-- A person creating a lead in the app can't add a second lead for the same
-- client in one funnel. Webhooks, web forms and imports run on the server
-- (no auth.uid()) and merge the repeat into the existing lead instead.
create or replace function public.leads_block_funnel_duplicate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_on boolean;
  v_phone text;
  v_email text;
  v_existing uuid;
begin
  if auth.uid() is null or new.contact_id is null
     or new.amocrm_id is not null or new.bitrix24_deal_id is not null then
    return new;
  end if;
  select coalesce(s.dedupe_funnel_merge, true) into v_on
  from public.org_general_settings s where s.organization_id = new.organization_id;
  if not coalesce(v_on, true) then
    return new;
  end if;
  select c.phone, c.email into v_phone, v_email from public.contacts c where c.id = new.contact_id;
  v_existing := public.funnel_lead_for_client(
    new.organization_id, new.funnel, v_phone, v_email, new.id
  );
  if v_existing is null then
    -- The same contact may already have a phone-less lead in this funnel.
    select l.id into v_existing from public.leads l
    where l.organization_id = new.organization_id
      and l.contact_id = new.contact_id
      and l.id <> new.id
      and l.amocrm_id is null
      and l.bitrix24_deal_id is null
      and coalesce(l.funnel, 'Direct Sales') = coalesce(new.funnel, 'Direct Sales')
    order by l.created_at limit 1;
  end if;
  if v_existing is not null then
    raise exception 'duplicate_in_funnel:%', v_existing using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_block_funnel_duplicate on public.leads;
create trigger leads_block_funnel_duplicate before insert on public.leads
  for each row execute function public.leads_block_funnel_duplicate();

-- Whether p_stage needs a task from the current user before p_lead can sit
-- in it: the stage's name when it does and the lead has no open task, else
-- null.
create or replace function public.lead_task_block(p_lead uuid, p_stage uuid)
returns text language sql stable security definer set search_path = public as $$
  select s.name
  from public.pipeline_stage_rules r
  join public.pipeline_stages s on s.id = r.stage_id
  where r.stage_id = p_stage
    and r.organization_id = public.current_user_org_id()
    and r.requires_task
    and (cardinality(r.task_profiles) = 0 or auth.uid() = any (r.task_profiles))
    and not exists (
      select 1 from public.tasks t
      where t.lead_id = p_lead and t.status <> 'Done'
    );
$$;

create or replace function public.leads_require_stage_task()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_stage text;
begin
  if auth.uid() is null or new.stage_id is null
     or new.amocrm_id is not null or new.bitrix24_deal_id is not null
     or new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  v_stage := public.lead_task_block(new.id, new.stage_id);
  if v_stage is not null then
    raise exception 'task_required:%', v_stage using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_require_stage_task on public.leads;
create trigger leads_require_stage_task before update of stage_id on public.leads
  for each row execute function public.leads_require_stage_task();

-- Existing duplicates, grouped per funnel and client, for the admin page.
-- The oldest lead of each group is the one the rest merge into.
create or replace function public.funnel_duplicate_groups()
returns table (
  funnel text,
  phone text,
  lead_ids uuid[],
  names text[],
  owner_names text[],
  created_ats timestamptz[]
)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.current_user_role()::text, '') not in ('super_admin', 'rop', 'platform_owner') then
    raise exception 'forbidden';
  end if;
  return query
  with keyed as (
    select l.id, l.name, l.created_at, coalesce(l.funnel, 'Direct Sales') as funnel,
           public.phone9(c.phone) as phone9, c.phone, p.full_name as owner_name
    from public.leads l
    join public.contacts c on c.id = l.contact_id
    left join public.profiles p on p.id = l.owner_id
    where l.organization_id = public.current_user_org_id()
      and l.amocrm_id is null
      and l.bitrix24_deal_id is null
      and public.phone9(c.phone) is not null
  )
  select k.funnel,
         (array_agg(k.phone order by k.created_at))[1],
         array_agg(k.id order by k.created_at),
         array_agg(k.name order by k.created_at),
         array_agg(coalesce(k.owner_name, '') order by k.created_at),
         array_agg(k.created_at order by k.created_at)
  from keyed k
  group by k.funnel, k.phone9
  having count(*) > 1
  order by max(k.created_at) desc
  limit 500;
end;
$$;

-- Takes any org id, so only the server (service role) may call it directly.
revoke all on function public.funnel_lead_for_client(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.funnel_lead_for_client(uuid, text, text, text, uuid) to service_role;
grant execute on function public.find_funnel_duplicate(text, text, text, uuid) to authenticated;
grant execute on function public.lead_task_block(uuid, uuid) to authenticated;
grant execute on function public.funnel_duplicate_groups() to authenticated;

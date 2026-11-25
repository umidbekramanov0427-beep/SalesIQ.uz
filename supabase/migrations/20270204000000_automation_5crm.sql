-- Triggers as in 5CRM's guide (Voronka triggerlari qo'llanmasi).
--  * automation_condition_matches: several conditions at once
--    (condition_field = 'multi', condition_value = JSON list), «katta yoki
--    teng» / «kichik yoki teng», the company's own fields (custom:<key>),
--    a tag among the lead's tags.
--  * fire_lead_automations: «Lidda mas'ul almashganda» set in a stage
--    column fires only for leads in that stage (as in 20261019, plus that).
--  * apply_automation_actions: as in 20270120 plus «Lid egaligi» modes
--    (lead_owner), «Sifat nazorati» (quality_check), «Faqat egasi yo'q
--    lidlarga» for Lidni taqsimlash, the other funnel's chosen stage,
--    «Faqat birinchi marta» and {{today}} for Maydonga yozish, a stage after
--    the phone is found, and the new app-run actions queued to the outbox
--    (tg_chat_message, api_post, sale_congrats, auto_chat, send_card).
-- Only functions are replaced; no data is changed. Idempotent.

create or replace function public.automation_condition_matches(
  p_lead jsonb,
  p_field text,
  p_operator text,
  p_value text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  actual text;
  c jsonb;
begin
  if p_field is null or p_field = '' then return true; end if;
  -- Several conditions (5CRM's «+ Shart qo'shish»): all must hold.
  if p_field = 'multi' then
    for c in select value from jsonb_array_elements(coalesce(p_value, '[]')::jsonb) loop
      if not public.automation_condition_matches(
        p_lead, c->>'field', coalesce(c->>'operator', 'eq'), c->>'value'
      ) then
        return false;
      end if;
    end loop;
    return true;
  end if;
  if p_field like 'custom:%' then
    actual := p_lead->'custom_fields'->>substr(p_field, 8);
  else
    actual := p_lead->>p_field;
  end if;
  if p_operator = 'eq' then
    return lower(coalesce(actual, '')) = lower(coalesce(p_value, ''))
      or (p_field = 'tags' and (p_lead->'tags') ? p_value);
  elsif p_operator = 'neq' then
    return not (lower(coalesce(actual, '')) = lower(coalesce(p_value, ''))
      or (p_field = 'tags' and (p_lead->'tags') ? p_value));
  elsif p_operator = 'contains' then
    return actual is not null and actual ilike ('%' || p_value || '%');
  elsif p_operator = 'gt' then
    return actual is not null and p_value is not null and (actual)::numeric > (p_value)::numeric;
  elsif p_operator = 'lt' then
    return actual is not null and p_value is not null and (actual)::numeric < (p_value)::numeric;
  elsif p_operator = 'gte' then
    return actual is not null and p_value is not null and (actual)::numeric >= (p_value)::numeric;
  elsif p_operator = 'lte' then
    return actual is not null and p_value is not null and (actual)::numeric <= (p_value)::numeric;
  else
    return true;
  end if;
exception when others then
  -- A bad value (a word against katta/kichik, broken JSON) fails the
  -- condition: the rule just does not fire, leads still move.
  return false;
end;
$$;

revoke execute on function public.automation_condition_matches(jsonb, text, text, text) from anon, public;

-- fire_lead_automations (20261019): one more filter line, patched into the
-- function as it is so nothing else in it changes.
do $patch$
declare d text;
begin
  if to_regprocedure('public.fire_lead_automations(public.leads,text,text,text)') is null then
    return;
  end if;
  d := pg_get_functiondef('public.fire_lead_automations(public.leads,text,text,text)'::regprocedure);
  if position('owner_changed'' or r.trigger_stage_id' in d) > 0 then
    return;
  end if;
  d := replace(d,
    $x$(p_trigger_type not in ('stage_enter') or r.trigger_stage_id = p_lead.stage_id)$x$,
    $x$(p_trigger_type not in ('stage_enter') or r.trigger_stage_id = p_lead.stage_id)
      -- «Lidda mas'ul almashganda» set in a stage column: only in that stage.
      and (p_trigger_type <> 'owner_changed' or r.trigger_stage_id is null
           or r.trigger_stage_id = p_lead.stage_id)$x$);
  if position('owner_changed'' or r.trigger_stage_id' in d) > 0 then
    execute d;
  end if;
end
$patch$;

create or replace function public.apply_automation_actions(
  p_actions jsonb,
  p_lead_id uuid,
  p_organization_id uuid,
  p_rule_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  action jsonb;
  applied jsonb := '[]'::jsonb;
  lead_row public.leads%rowtype;
  target_stage uuid;
  t text;
  idx bigint;
  target_owner uuid;
  found_phone text;
  new_contact uuid;
  field_value text;
  stage_after uuid;
begin
  for action, idx in
    select value, ordinality from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb)) with ordinality
  loop
    t := action->>'type';
    select * into lead_row from public.leads where id = p_lead_id;
    if not found then exit; end if;

    if t = 'assign_owner' and coalesce(action->>'ownerId', '') <> '' then
      update public.leads set owner_id = (action->>'ownerId')::uuid where id = p_lead_id;

    elsif t = 'add_tag' and coalesce(action->>'tag', '') <> '' then
      update public.leads
        set tags = case when (action->>'tag') = any(tags) then tags
                        else array_append(tags, action->>'tag') end
        where id = p_lead_id;

    elsif t = 'remove_tag' and coalesce(action->>'tag', '') <> '' then
      update public.leads set tags = array_remove(tags, action->>'tag') where id = p_lead_id;

    elsif t = 'create_task' and coalesce(action->>'title', '') <> '' then
      insert into public.tasks
        (organization_id, lead_id, title, description, assignee_id, due_date, priority)
      values (
        p_organization_id,
        p_lead_id,
        action->>'title',
        nullif(action->>'description', ''),
        coalesce(nullif(action->>'assigneeId', '')::uuid, lead_row.owner_id),
        case
          when coalesce(action->>'dueInMinutes', '') <> ''
            then now() + (((action->>'dueInMinutes')::int) || ' minutes')::interval
          when coalesce(action->>'dueInDays', '') <> ''
            then now() + (((action->>'dueInDays')::int) || ' days')::interval
          else null
        end,
        coalesce(nullif(action->>'priority', '')::public.priority_level, 'Normal')
      );

    elsif t = 'add_note' and coalesce(action->>'text', '') <> '' then
      insert into public.lead_activities (organization_id, lead_id, type, content)
      values (p_organization_id, p_lead_id, 'note', action->>'text');

    elsif t = 'move_stage' and coalesce(action->>'stageId', '') <> '' then
      select id into target_stage from public.pipeline_stages
        where id = (action->>'stageId')::uuid and organization_id = p_organization_id;
      if target_stage is not null then
        update public.leads set stage_id = target_stage,
          funnel = coalesce((select pipeline_name from public.pipeline_stages where id = target_stage), funnel)
          where id = p_lead_id;
      end if;

    elsif t in ('close_won', 'close_lost') then
      select id into target_stage from public.pipeline_stages
        where organization_id = p_organization_id
          and coalesce(pipeline_name, 'Direct Sales') = coalesce(lead_row.funnel, 'Direct Sales')
          and (case when t = 'close_won' then is_won else is_lost end)
        order by position
        limit 1;
      if target_stage is not null then
        update public.leads
          set stage_id = target_stage,
              loss_reason = case when t = 'close_lost'
                                 then coalesce(nullif(action->>'reason', ''), loss_reason)
                                 else loss_reason end
          where id = p_lead_id;
      end if;

    elsif t = 'set_field' and coalesce(action->>'field', '') <> '' then
      -- «Maydonga yozish»: {{today}} becomes today's date (Tashkent);
      -- with onlyEmpty the field is written only while it is still empty.
      field_value := replace(coalesce(action->>'value', ''), '{{today}}',
        to_char(now() at time zone 'Asia/Tashkent', 'DD.MM.YYYY'));
      if (action->>'onlyEmpty') = 'true' and (
           (action->>'field' = 'budget' and lead_row.budget is not null)
        or (action->>'field' = 'paid_amount' and coalesce(lead_row.paid_amount, 0) <> 0)
        or (action->>'field' = 'source' and coalesce(lead_row.source, '') <> '')
        or (action->>'field' like 'custom:%'
            and coalesce(lead_row.custom_fields->>substr(action->>'field', 8), '') <> '')
      ) then
        continue;
      end if;
      if action->>'field' = 'budget' then
        update public.leads set budget = nullif(field_value, '')::numeric where id = p_lead_id;
      elsif action->>'field' = 'paid_amount' then
        update public.leads set paid_amount = coalesce(nullif(field_value, '')::numeric, 0) where id = p_lead_id;
      elsif action->>'field' = 'priority' then
        update public.leads set priority = field_value::public.priority_level where id = p_lead_id;
      elsif action->>'field' = 'temperature' then
        update public.leads set temperature = field_value::public.lead_temperature where id = p_lead_id;
      elsif action->>'field' = 'source' then
        update public.leads set source = field_value where id = p_lead_id;
      elsif action->>'field' like 'custom:%' then
        update public.leads
          set custom_fields = coalesce(custom_fields, '{}'::jsonb)
            || jsonb_build_object(substr(action->>'field', 8), field_value)
          where id = p_lead_id;
      end if;

    elsif t = 'delay' and coalesce(action->>'minutes', '') <> '' then
      -- The actions after a delay run later, from the outbox.
      insert into public.automation_outbox (organization_id, rule_id, lead_id, action, run_after)
      values (
        p_organization_id, p_rule_id, p_lead_id,
        jsonb_build_object(
          'type', 'run_actions',
          'actions', coalesce(
            (select jsonb_agg(e.value order by e.ordinality)
               from jsonb_array_elements(p_actions) with ordinality e
              where e.ordinality > idx),
            '[]'::jsonb)
        ),
        now() + (greatest(1, least(43200, (action->>'minutes')::int)) || ' minutes')::interval
      );
      applied := applied || jsonb_build_array(action);
      exit;

    elsif t = 'close_tasks' then
      update public.tasks set status = 'Done'
        where lead_id = p_lead_id and organization_id = p_organization_id and status <> 'Done';

    elsif t = 'move_funnel' and coalesce(action->>'funnel', '') <> '' then
      -- The chosen stage of the other funnel, else its first open stage.
      target_stage := null;
      if coalesce(action->>'stageId', '') <> '' then
        select id into target_stage from public.pipeline_stages
          where id = (action->>'stageId')::uuid
            and organization_id = p_organization_id
            and coalesce(pipeline_name, 'Direct Sales') = action->>'funnel';
      end if;
      if target_stage is null then
        select id into target_stage from public.pipeline_stages
          where organization_id = p_organization_id
            and coalesce(pipeline_name, 'Direct Sales') = action->>'funnel'
            and not is_won and not is_lost
          order by position
          limit 1;
      end if;
      if target_stage is not null then
        update public.leads set stage_id = target_stage, funnel = action->>'funnel'
          where id = p_lead_id;
      end if;

    elsif t = 'distribute' and jsonb_typeof(action->'ownerIds') = 'array'
          and jsonb_array_length(action->'ownerIds') > 0 then
      -- In turn: the chosen person with the fewest open leads gets it.
      if (action->>'onlyUnowned') = 'true' and lead_row.owner_id is not null then
        continue;
      end if;
      select u.id into target_owner
      from (
        select (x)::uuid as id
        from jsonb_array_elements_text(action->'ownerIds') x
      ) u
      join public.profiles p on p.id = u.id and p.organization_id = p_organization_id
      order by (
        select count(*) from public.leads l
        left join public.pipeline_stages s on s.id = l.stage_id
        where l.owner_id = u.id and not coalesce(s.is_won, false) and not coalesce(s.is_lost, false)
      ), random()
      limit 1;
      if target_owner is not null then
        update public.leads set owner_id = target_owner where id = p_lead_id;
      end if;

    elsif t = 'lead_owner' then
      -- «Lid egaligi» (5CRM): to the company's admin, a head of sales, one
      -- chosen person, or in turn among the sales reps; «Tarixga avto».
      if (action->>'onlyUnowned') = 'true' and lead_row.owner_id is not null then
        continue;
      end if;
      target_owner := null;
      if action->>'mode' = 'specific' and coalesce(action->>'ownerId', '') <> '' then
        select id into target_owner from public.profiles
          where id = (action->>'ownerId')::uuid and organization_id = p_organization_id;
      elsif action->>'mode' in ('admin', 'rop') then
        select id into target_owner from public.profiles
          where organization_id = p_organization_id
            and role = (case when action->>'mode' = 'admin' then 'super_admin' else 'rop' end)::public.app_role
          order by created_at
          limit 1;
      elsif action->>'mode' = 'roundrobin' then
        select p.id into target_owner
          from public.profiles p
         where p.organization_id = p_organization_id and p.role = 'sotuv_menejeri'
         order by (
           select count(*) from public.leads l
           left join public.pipeline_stages s on s.id = l.stage_id
           where l.owner_id = p.id and not coalesce(s.is_won, false) and not coalesce(s.is_lost, false)
         ), random()
         limit 1;
      end if;
      if target_owner is null then
        continue;
      end if;
      update public.leads set owner_id = target_owner where id = p_lead_id;

    elsif t = 'quality_check' and coalesce(action->>'tag', '') <> '' then
      -- «Sifat nazorati»: the lead's closing reason is one of those chosen
      -- (or any, when none is chosen) -> the tag goes on for review.
      if coalesce(lead_row.loss_reason, '') = '' then
        continue;
      end if;
      if jsonb_typeof(action->'reasons') = 'array' and jsonb_array_length(action->'reasons') > 0
         and not exists (
           select 1 from jsonb_array_elements_text(action->'reasons') r
           where lower(r) = lower(lead_row.loss_reason)
         ) then
        continue;
      end if;
      update public.leads
        set tags = case when (action->>'tag') = any(tags) then tags
                        else array_append(tags, action->>'tag') end
        where id = p_lead_id;

    elsif t = 'previous_owner' then
      -- «Lid egaligi»: the lead goes to whoever owns this client's latest
      -- other lead (the same contact) -- the client stays with their person.
      select l.owner_id into target_owner
        from public.leads l
        join public.profiles p on p.id = l.owner_id and p.organization_id = p_organization_id
       where l.organization_id = p_organization_id
         and l.contact_id = lead_row.contact_id
         and l.id <> p_lead_id
         and l.owner_id is not null
       order by l.created_at desc
       limit 1;
      if lead_row.contact_id is null or target_owner is null then
        continue;
      end if;
      update public.leads set owner_id = target_owner where id = p_lead_id;

    elsif t = 'release_owner' then
      -- «Umumiy bazaga qaytarish»: the lead goes back to the shared pool.
      update public.leads set owner_id = null where id = p_lead_id;

    elsif t = 'detect_phone' then
      -- «Raqamni chatdan aniqlash»: a lead without a phone takes the number
      -- the client wrote in the chat (their latest message that has one).
      select c.phone into found_phone from public.contacts c where c.id = lead_row.contact_id;
      if public.phone9(found_phone) is not null then
        continue;
      end if;
      select public.extract_uz_phone(m.text) into found_phone
        from public.lead_telegram_messages m
       where m.lead_id = p_lead_id
         and m.direction = 'in'
         and public.extract_uz_phone(m.text) is not null
       order by m.created_at desc
       limit 1;
      if found_phone is null then
        continue;
      end if;
      if lead_row.contact_id is not null then
        update public.contacts set phone = found_phone
         where id = lead_row.contact_id and organization_id = p_organization_id;
      else
        insert into public.contacts (organization_id, full_name, phone)
        values (p_organization_id, coalesce(nullif(trim(lead_row.name), ''), 'Mijoz'), found_phone)
        returning id into new_contact;
        update public.leads set contact_id = new_contact where id = p_lead_id;
      end if;
      -- «Tg nomer» / «AI raqam aniqlash»: then to the chosen stage.
      if coalesce(action->>'stageId', '') <> '' then
        select id into stage_after from public.pipeline_stages
          where id = (action->>'stageId')::uuid and organization_id = p_organization_id;
        if stage_after is not null then
          update public.leads set stage_id = stage_after,
            funnel = coalesce((select pipeline_name from public.pipeline_stages where id = stage_after), funnel)
            where id = p_lead_id;
        end if;
      end if;

    elsif t in ('send_message', 'webhook', 'start_salesbot', 'dedupe',
                'tg_chat_message', 'api_post', 'sale_congrats', 'auto_chat', 'send_card') then
      insert into public.automation_outbox (organization_id, rule_id, lead_id, action)
      values (p_organization_id, p_rule_id, p_lead_id, action);

    else
      continue;
    end if;

    applied := applied || jsonb_build_array(action);
  end loop;
  return applied;
end;
$$;

revoke execute on function public.apply_automation_actions(jsonb, uuid, uuid, uuid) from anon, authenticated, public;
grant execute on function public.apply_automation_actions(jsonb, uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';

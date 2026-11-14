-- «Lid egaligi» (5CRM's trigger catalog, Taqsimlash): previous_owner hands
-- the lead to whoever owns the same client's latest other lead, so a
-- returning client stays with their salesperson. apply_automation_actions
-- is the same as in 20270117000000 plus this branch. Nothing is deleted or
-- rewritten; idempotent.

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
      if action->>'field' = 'budget' then
        update public.leads set budget = nullif(action->>'value', '')::numeric where id = p_lead_id;
      elsif action->>'field' = 'priority' then
        update public.leads set priority = (action->>'value')::public.priority_level where id = p_lead_id;
      elsif action->>'field' = 'temperature' then
        update public.leads set temperature = (action->>'value')::public.lead_temperature where id = p_lead_id;
      elsif action->>'field' = 'source' then
        update public.leads set source = action->>'value' where id = p_lead_id;
      elsif action->>'field' like 'custom:%' then
        update public.leads
          set custom_fields = coalesce(custom_fields, '{}'::jsonb)
            || jsonb_build_object(substr(action->>'field', 8), action->>'value')
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
      select id into target_stage from public.pipeline_stages
        where organization_id = p_organization_id
          and coalesce(pipeline_name, 'Direct Sales') = action->>'funnel'
          and not is_won and not is_lost
        order by position
        limit 1;
      if target_stage is not null then
        update public.leads set stage_id = target_stage, funnel = action->>'funnel'
          where id = p_lead_id;
      end if;

    elsif t = 'distribute' and jsonb_typeof(action->'ownerIds') = 'array'
          and jsonb_array_length(action->'ownerIds') > 0 then
      -- In turn: the chosen person with the fewest open leads gets it.
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

    elsif t in ('send_message', 'webhook', 'start_salesbot', 'dedupe') then
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

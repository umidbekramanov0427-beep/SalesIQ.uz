-- «Lidni taqsimlash» like 5CRM. Who gets the lead is decided by one
-- function, distribute_pick_owner:
--  * mode 'turn' (default, as before): the chosen person with the fewest
--    open leads per share (weights 1-10);
--  * mode 'score' («Aloqa sifati va samaradorligi bo'yicha»): the best
--    score over the last 30 days -- conversion (won / own leads), contact
--    speed (minutes to the first call or message), task discipline (open
--    tasks not overdue) and activity in the app (online now / this hour);
--    shares scoreWeights {conv, speed, tasks, active}, default 30/25/25/20;
--  * maxUnworked: a person who already has that many unworked leads gets
--    none («N tadan ko'p ishlanmagan bo'lsa bermasin»); unworked =
--    not contacted yet (unworkedBy 'contact', default) or still in the
--    stage it was given in (unworkedBy 'stage', «bosqichdan surilmasa»);
--  * onlineOnly as before (everyone when nobody is online).
-- apply_automation_actions is the 20270205 version with only its
-- distribute pick replaced by this function. No data is changed. Idempotent.

create or replace function public.distribute_pick_owner(
  p_organization_id uuid,
  p_action jsonb,
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _stage uuid;
  _cap int := coalesce(nullif(p_action->>'maxUnworked', '')::int, 0);
  _by text := coalesce(p_action->>'unworkedBy', 'contact');
  _mode text := coalesce(p_action->>'mode', 'turn');
  _w jsonb := coalesce(p_action->'scoreWeights', '{}'::jsonb);
  _wc numeric := coalesce((_w->>'conv')::numeric, 30);
  _ws numeric := coalesce((_w->>'speed')::numeric, 25);
  _wt numeric := coalesce((_w->>'tasks')::numeric, 25);
  _wa numeric := coalesce((_w->>'active')::numeric, 20);
  _any_online boolean;
  _pick uuid;
begin
  select stage_id into _stage from public.leads where id = p_lead_id;
  select exists (
    select 1 from public.user_login_events e
     where e.user_id in (select (y)::uuid from jsonb_array_elements_text(p_action->'ownerIds') y)
       and e.last_seen_at > now() - interval '5 minutes'
  ) into _any_online;

  with cand as (
    select p.id
      from jsonb_array_elements_text(p_action->'ownerIds') x
      join public.profiles p on p.id = (x)::uuid and p.organization_id = p_organization_id
  ),
  facts as (
    select c.id,
      -- open leads now (the load), and the unworked among them
      (select count(*) from public.leads l
         left join public.pipeline_stages s on s.id = l.stage_id
        where l.organization_id = p_organization_id and l.owner_id = c.id
          and not coalesce(s.is_won, false) and not coalesce(s.is_lost, false)) as open_n,
      (select count(*) from public.leads l
         left join public.pipeline_stages s on s.id = l.stage_id
        where l.organization_id = p_organization_id and l.owner_id = c.id and l.id <> p_lead_id
          and not coalesce(s.is_won, false) and not coalesce(s.is_lost, false)
          and case when _by = 'stage' then l.stage_id is not distinct from _stage
                   else l.first_contact_at is null end) as unworked_n,
      -- last 30 days
      (select count(*) from public.leads l
        where l.organization_id = p_organization_id and l.owner_id = c.id
          and l.created_at > now() - interval '30 days') as got_n,
      (select count(*) from public.leads l
         join public.pipeline_stages s on s.id = l.stage_id and s.is_won
        where l.organization_id = p_organization_id and l.owner_id = c.id
          and l.created_at > now() - interval '30 days') as won_n,
      (select avg(extract(epoch from (l.first_contact_at - l.created_at)) / 60)
         from public.leads l
        where l.organization_id = p_organization_id and l.owner_id = c.id
          and l.first_contact_at is not null
          and l.created_at > now() - interval '30 days') as speed_min,
      (select count(*) from public.tasks t
        where t.assignee_id = c.id and t.status <> 'Done') as tasks_open,
      (select count(*) from public.tasks t
        where t.assignee_id = c.id and t.status <> 'Done' and t.due_date < now()) as tasks_late,
      (select max(e.last_seen_at) from public.user_login_events e where e.user_id = c.id) as seen_at
    from cand c
  )
  select f.id into _pick
    from facts f
   where (_cap <= 0 or f.unworked_n < _cap)
     and ((p_action->>'onlineOnly') is distinct from 'true'
          or not _any_online
          or f.seen_at > now() - interval '5 minutes')
   order by
     case when _mode = 'score' then
       -(_wc * (case when f.got_n > 0 then f.won_n::numeric / f.got_n else 0 end)
         + _ws * (case when f.speed_min is null then 0 else 1 / (1 + greatest(f.speed_min, 0) / 15) end)
         + _wt * (case when f.tasks_open > 0 then 1 - f.tasks_late::numeric / f.tasks_open else 1 end)
         + _wa * (case when f.seen_at > now() - interval '5 minutes' then 1
                       when f.seen_at > now() - interval '1 hour' then 0.5 else 0 end))
     end,
     f.open_n::numeric / greatest(1, least(10, coalesce((p_action->'weights'->>f.id::text)::int, 1))),
     random()
   limit 1;
  return _pick;
end;
$$;

revoke execute on function public.distribute_pick_owner(uuid, jsonb, uuid) from anon, authenticated, public;
grant execute on function public.distribute_pick_owner(uuid, jsonb, uuid) to service_role;

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
      -- «Izoh (ixtiyoriy)»: left in the lead's history.
      if coalesce(trim(action->>'note'), '') <> '' then
        insert into public.lead_activities (organization_id, lead_id, type, content)
        values (p_organization_id, p_lead_id, 'note', action->>'note');
      end if;

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
      -- In turn: the chosen person with the fewest open leads per share
      -- («weights», 1-10) gets it; «Faqat online xodimlarga» keeps to those
      -- seen in the app in the last 5 minutes (everyone if nobody is).
      if (action->>'onlyUnowned') = 'true' and lead_row.owner_id is not null then
        continue;
      end if;
      target_owner := public.distribute_pick_owner(p_organization_id, action, p_lead_id);
      if target_owner is not null then
        update public.leads set owner_id = target_owner where id = p_lead_id;
        -- «N daqiqada ishlanmasa»: the app checks later and hands it on.
        if coalesce((action->>'reassignMinutes')::int, 0) > 0 then
          insert into public.automation_outbox (organization_id, rule_id, lead_id, action, run_after)
          values (
            p_organization_id, p_rule_id, p_lead_id,
            jsonb_build_object(
              'type', 'distribute_check',
              'ownerIds', action->'ownerIds',
              'ownerId', target_owner,
              'assignedAt', now(),
              'round', 0,
              'reassignMinutes', (action->>'reassignMinutes')::int,
              'controller', coalesce(action->>'controller', 'rop_or_owner'),
              'onlineOnly', coalesce((action->>'onlineOnly')::boolean, false),
              'weights', coalesce(action->'weights', '{}'::jsonb)
            ),
            now() + make_interval(mins => (action->>'reassignMinutes')::int)
          );
        end if;
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

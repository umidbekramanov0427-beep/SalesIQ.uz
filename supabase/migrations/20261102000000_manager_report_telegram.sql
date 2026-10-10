-- Daily report → Telegram group: the report window's "Guruhga yuborish"
-- posts the manager's report through the platform's bot into the team's
-- group. The group is one of the org's bound chats (telegram_bound_chats,
-- bound with /bind CODE); a super admin / ROP picks which one in the report
-- window. With exactly one bound chat and none picked, that one is used.

alter table public.org_general_settings
  add column if not exists manager_report_chat_id bigint;

create or replace function public.set_manager_report_chat(p_chat_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_user_org_id();
begin
  if v_org is null
     or coalesce(public.current_user_role()::text, '') not in ('super_admin', 'rop', 'platform_owner') then
    raise exception 'forbidden';
  end if;
  if p_chat_id is not null and not exists (
    select 1 from public.telegram_bound_chats c
    where c.organization_id = v_org and c.chat_id = p_chat_id
  ) then
    raise exception 'Bu Telegram guruhi kompaniyaga ulanmagan';
  end if;
  update public.org_general_settings
     set manager_report_chat_id = p_chat_id
   where organization_id = v_org;
  if not found then
    insert into public.org_general_settings (organization_id, manager_report_chat_id)
    values (v_org, p_chat_id);
  end if;
end;
$$;

grant execute on function public.set_manager_report_chat(bigint) to authenticated;

notify pgrst, 'reload schema';

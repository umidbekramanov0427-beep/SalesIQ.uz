-- Sozlamalar like amoCRM, part 3: files.
--  * Trash: deleting a lead file only marks it (deleted_at); it can be
--    restored for 30 days, then the app removes it from Storage for good.
--    Browsers never see trashed files: the read policy hides them; the
--    trash list goes through a server route.
--  * Chat files copied into our storage (Telegram / Instagram) are lead
--    files too (source + the chat message), so the Files list, the size
--    count and the rules cover them.
--  * Company settings: which chat files to copy automatically (none / all /
--    only from sources that don't keep files -- Instagram), and rules that
--    move files to the trash (older than N days; leads lost N days ago).
-- Adds columns only; existing files are untouched.

alter table public.lead_files
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists source text not null default 'upload',
  add column if not exists chat_message_id uuid;

alter table public.lead_files drop constraint if exists lead_files_source_check;
alter table public.lead_files
  add constraint lead_files_source_check check (source in ('upload', 'telegram', 'instagram'));

create index if not exists lead_files_org_deleted_idx
  on public.lead_files (organization_id, deleted_at);
create unique index if not exists lead_files_chat_message_uniq
  on public.lead_files (chat_message_id) where chat_message_id is not null;

drop policy if exists "lead_files_select" on public.lead_files;
create policy "lead_files_select" on public.lead_files for select to authenticated
  using (organization_id = public.current_user_org_id() and deleted_at is null);

alter table public.org_general_settings
  add column if not exists file_autoload text,
  add column if not exists file_retention_days integer,
  add column if not exists file_lost_lead_days integer;

alter table public.org_general_settings drop constraint if exists org_general_settings_file_rules_check;
alter table public.org_general_settings
  add constraint org_general_settings_file_rules_check check (
    (file_autoload is null or file_autoload in ('none', 'all', 'smart'))
    and (file_retention_days is null or file_retention_days between 1 and 3650)
    and (file_lost_lead_days is null or file_lost_lead_days between 1 and 3650)
  );

notify pgrst, 'reload schema';

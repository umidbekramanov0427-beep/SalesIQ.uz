-- Lets a user upload a call recording by hand (no AmoCRM sync needed) so it
-- can be run through the same Whisper/DeepSeek analysis pipeline. Synced
-- AmoCRM calls keep amocrm_note_id; manual ones leave it null.
alter table public.amocrm_calls
  alter column amocrm_note_id drop not null,
  add column if not exists source text not null default 'amocrm' check (source in ('amocrm', 'manual')),
  add column if not exists created_by uuid references public.profiles(id);

drop policy if exists "amocrm_calls_insert_manual" on public.amocrm_calls;
create policy "amocrm_calls_insert_manual" on public.amocrm_calls
  for insert to authenticated
  with check (source = 'manual' and created_by = auth.uid() and amocrm_note_id is null);

insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', true)
on conflict (id) do nothing;

drop policy if exists "call_recordings_insert_own" on storage.objects;
create policy "call_recordings_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'call-recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "call_recordings_read" on storage.objects;
create policy "call_recordings_read" on storage.objects
  for select to public
  using (bucket_id = 'call-recordings');

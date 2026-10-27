-- Call recordings stop being world-readable. Until now "call-recordings" was
-- a public bucket, so anyone holding a recording's link could listen to it.
-- The app now plays and analyses our own recordings through short-lived
-- signed links (src/lib/recording-url.ts), so the bucket can be private.
--
-- Signed links need read access: people of a company may read their own
-- company's recordings -- hand uploads under "<uploader's profile id>/..."
-- (as before) and recordings kept from the PBX under "pbx/<organization id>/..."
-- (new; the server stores those). The server's service role is unaffected.
--
-- Run after the app version that signs recording links is live; re-runnable.

drop policy if exists call_recordings_read on storage.objects;
create policy call_recordings_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'call-recordings'
    and (
      exists (
        select 1 from public.profiles p
        where p.id::text = (storage.foldername(name))[1]
          and p.organization_id = public.current_user_org_id()
      )
      or (
        (storage.foldername(name))[1] = 'pbx'
        and (storage.foldername(name))[2] = public.current_user_org_id()::text
      )
    )
  );

update storage.buckets set public = false where id = 'call-recordings';

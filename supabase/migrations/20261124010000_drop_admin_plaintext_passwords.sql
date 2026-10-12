-- Stop keeping company Super Admin passwords in plain text.
--
-- organization_admin_credentials mirrored every Super Admin's password so
-- the platform owner could read it on Kompaniyalar and sign in with it.
-- "Kirish" now signs in with a one-time token (/platform/enter-company)
-- and a forgotten password is replaced, not read back, so the app no
-- longer reads or writes this table. Dropping it deletes the stored
-- passwords; the Super Admins' real logins (Supabase Auth, hashed) are
-- untouched.
drop table if exists public.organization_admin_credentials;

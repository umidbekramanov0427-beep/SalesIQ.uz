-- New top-level role, above per-company super_admin: the actual SaaS
-- operator. Added in its own migration because Postgres requires a new
-- enum value to be committed before it can be referenced by name.
alter type public.app_role add value if not exists 'platform_owner';

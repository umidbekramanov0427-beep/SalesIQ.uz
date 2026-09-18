-- Deleting an empty organization via delete_organization_data() timed out
-- even though the target org had zero rows anywhere -- because several
-- tables have no index on organization_id, so every
-- `delete ... where organization_id = ...` (and every RLS-filtered select
-- on these tables, on every page load) forces a full sequential scan of
-- the whole table, not just the target org's rows.
--
-- A plain CREATE INDEX takes a SHARE lock that blocks concurrent writers,
-- and the AmoCRM sync cron writes to these same tables continuously for
-- its own (large, actively syncing) organization -- so a plain CREATE
-- INDEX just queued up waiting for that write lock to free, indefinitely.
-- CONCURRENTLY builds the index without blocking writers, avoiding that
-- wait entirely. It cannot run inside a transaction block, so each
-- statement below must be executed on its own, not batched together.
create index if not exists concurrently if not exists audit_logs_org_idx on public.audit_logs (organization_id);
create index if not exists concurrently if not exists work_sessions_org_idx on public.work_sessions (organization_id);
create index if not exists concurrently if not exists call_logs_org_idx on public.call_logs (organization_id);
create index if not exists concurrently if not exists task_comments_org_idx on public.task_comments (organization_id);
create index if not exists concurrently if not exists error_logs_org_idx on public.error_logs (organization_id);
create index if not exists concurrently if not exists auto_responders_org_idx on public.auto_responders (organization_id);

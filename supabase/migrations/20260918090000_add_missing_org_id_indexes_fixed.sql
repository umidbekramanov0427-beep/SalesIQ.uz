-- 20260826040000_add_missing_org_id_indexes.sql and
-- 20260826070000_audit_logs_dedupe_support_index.sql both have a syntax
-- bug -- "create index if not exists concurrently if not exists x on y"
-- puts the keywords in the wrong order (the valid form is
-- "create index concurrently if not exists x on y") -- so neither has ever
-- successfully applied anywhere, on any database, since the day they were
-- written. CONCURRENTLY also cannot run inside the multi-statement
-- transaction /admin/run-migrations sends each file as, so this recreates
-- the same 7 indexes as plain (non-concurrent) creates instead. That takes
-- a brief write-blocking lock per table for a one-time backfill -- for
-- audit_logs specifically (the ~5.8M-row table those files call out) that
-- lock can run for a while, so apply this outside of a busy stretch.
create index if not exists audit_logs_org_idx on public.audit_logs (organization_id);
create index if not exists work_sessions_org_idx on public.work_sessions (organization_id);
create index if not exists call_logs_org_idx on public.call_logs (organization_id);
create index if not exists task_comments_org_idx on public.task_comments (organization_id);
create index if not exists error_logs_org_idx on public.error_logs (organization_id);
create index if not exists auto_responders_org_idx on public.auto_responders (organization_id);
create index if not exists audit_logs_entity_created_idx
  on public.audit_logs (entity_type, entity_id, created_at);

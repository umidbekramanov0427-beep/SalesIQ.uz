-- Supports the one-time cleanup of ~5.8M redundant audit_logs rows: the
-- AmoCRM sync re-saved identical row states repeatedly before the
-- audit_row_change() no-op fix, leaving long runs of consecutive,
-- content-identical snapshots per entity. Deduping requires scanning each
-- entity's history in created_at order; this index lets Postgres do that
-- per-partition instead of sorting the whole 5.8M-row table from scratch.
create index if not exists concurrently if not exists audit_logs_entity_created_idx
  on public.audit_logs (entity_type, entity_id, created_at);

-- AI call-analysis verdict on whether a lost lead can realistically be
-- re-sold (fixable reason -- price/timing objection, still some interest)
-- vs a genuine dead end (went to a competitor, no real need). Set by
-- analyzeCallById (audio-analytics.analyze.ts) only for a call on a lead
-- already in a lost stage; null means "not yet AI-assessed", not "not
-- recoverable" -- every "recoverable" query below must filter on
-- `recoverable is true`, never `not recoverable`, to avoid silently
-- treating an unanalyzed lost lead as a lost cause.
alter table public.leads add column if not exists recoverable boolean;
alter table public.leads add column if not exists recoverable_reason text;

-- New UI briefing: "since your last visit". last_visit_at is bumped at most once
-- per 30 minutes (one session); prev_visit_at is the visit before that.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS prev_visit_at TIMESTAMPTZ NULL;

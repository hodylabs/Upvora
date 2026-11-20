-- New UI "moved since you voted": when a post's status last changed, and what it
-- was before. Written by the response and duplicate commands from now on.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS prev_status_slug VARCHAR(50) NULL;

-- Existing posts have no history: the best guess for a past change is the staff
-- response date of a post that is no longer open. Its previous status stays unknown.
UPDATE posts SET status_changed_at = response_date
WHERE status_changed_at IS NULL AND response_date IS NOT NULL AND status_slug <> 'open';

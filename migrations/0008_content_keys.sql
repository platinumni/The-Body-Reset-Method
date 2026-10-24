-- 0008_content_keys: lets programme content written in the repo (content/programmes/)
-- be imported into any site (test or live) without creating duplicates.
-- Add-only: never edit this file once committed.

ALTER TABLE programme_lessons ADD COLUMN content_key TEXT;
CREATE UNIQUE INDEX idx_lessons_content_key ON programme_lessons(content_key);

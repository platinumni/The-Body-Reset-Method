-- Recipe photos, chosen in Admin → Recipe photos (from Pixabay for now). The image is copied
-- into our own storage (R2 MEDIA, recipe-photos/<id>.jpg); the licence is recorded for each one.
CREATE TABLE recipe_photos (
  recipe_id    TEXT PRIMARY KEY,
  r2_key       TEXT NOT NULL,
  source       TEXT NOT NULL,              -- 'pixabay'
  source_id    TEXT NOT NULL,
  page_url     TEXT NOT NULL,
  photographer TEXT,
  licence      TEXT NOT NULL,
  search       TEXT,
  chosen_by    TEXT NOT NULL CHECK (chosen_by IN ('auto', 'owner')),
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

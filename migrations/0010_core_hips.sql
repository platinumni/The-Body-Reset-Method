-- 0010_core_hips: the Hips and Core programmes, the Core & Hips bundle, free bonuses,
-- and two more exercise parts ("what to watch for" and easier/harder levels).
-- Add-only: never edit this file once committed.

ALTER TABLE programme_lessons ADD COLUMN watch_for TEXT;  -- common compensations and tension spots
ALTER TABLE programme_lessons ADD COLUMN levels TEXT;     -- beginner / intermediate / advanced versions

-- Programmes ("hips" already exists from 0002). Prices are set by the owner in admin.
INSERT INTO products (slug, title, kind, status, sort_order) VALUES ('core', 'Core', 'programme', 'draft', 4);
INSERT INTO products (slug, title, kind, status, sort_order) VALUES ('core-and-hips', 'Core & Hips', 'bundle', 'draft', 2);

-- Core & Hips = Hips + Core.
INSERT INTO bundle_items (bundle_id, product_id)
SELECT b.id, p.id FROM products b, products p WHERE b.slug = 'core-and-hips' AND p.slug IN ('hips', 'core');

-- Free bonus: buying Lower Body Regeneration also unlocks Hips and Core.
-- (A programme's bundle_items are bonuses granted with it.)
INSERT INTO bundle_items (bundle_id, product_id)
SELECT b.id, p.id FROM products b, products p WHERE b.slug = 'lower-body-regeneration' AND p.slug IN ('hips', 'core');

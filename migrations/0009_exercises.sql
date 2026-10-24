-- 0009_exercises: structured exercises inside programmes.
-- A lesson is either a 'section' (written teaching, e.g. the introduction) or an
-- 'exercise' with its own parts: starting position, conducting the exercise, key
-- points, a suggested time and a one-line entry for the printable exercise sheet.
-- Add-only: never edit this file once committed.

ALTER TABLE programme_lessons ADD COLUMN kind TEXT NOT NULL DEFAULT 'section' CHECK (kind IN ('section', 'exercise'));
ALTER TABLE programme_lessons ADD COLUMN stage TEXT;              -- e.g. "Stage 1: Feet, arches and toes"
ALTER TABLE programme_lessons ADD COLUMN starting_position TEXT;
ALTER TABLE programme_lessons ADD COLUMN conducting TEXT;
ALTER TABLE programme_lessons ADD COLUMN key_points TEXT;
ALTER TABLE programme_lessons ADD COLUMN recommended_time TEXT;   -- e.g. "30–60 seconds"
ALTER TABLE programme_lessons ADD COLUMN sheet_line TEXT;         -- one short cue for the exercise sheet

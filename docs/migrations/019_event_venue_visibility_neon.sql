-- =========================================================================
-- MIGRATION 019: ADD ADMIN-CONTROLLED VENUE VISIBILITY FOR SELECTED PARENTS
-- =========================================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_visible_to_selected_parents INTEGER DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_visibility_released_at VARCHAR(64);
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_visibility_released_by VARCHAR(64);
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_visibility_updated_at VARCHAR(64);
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_visibility_updated_by VARCHAR(64);

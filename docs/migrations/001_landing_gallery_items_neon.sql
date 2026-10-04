-- ==============================================================================
-- Migration: 001_landing_gallery_items_neon.sql
-- Target Database: PostgreSQL / Neon (Production)
-- Purpose: Add landing_gallery_items table and indices for public orbital photo gallery
-- Status: PREPARED FOR REVIEW (DO NOT EXECUTE AUTOMATICALLY)
-- ==============================================================================

BEGIN;

-- 1. Create table landing_gallery_items
CREATE TABLE IF NOT EXISTS landing_gallery_items (
    id VARCHAR(64) PRIMARY KEY,
    media_file_id VARCHAR(64) NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    alt_text VARCHAR(255) NOT NULL,
    caption TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Indices for high-frequency queries
-- Optimizes the public query: SELECT ... FROM landing_gallery_items WHERE is_active = 1 ORDER BY sort_order ASC, created_at ASC
CREATE INDEX IF NOT EXISTS idx_landing_gallery_active_sort 
    ON landing_gallery_items(is_active, sort_order, created_at);

-- Optimizes cascade lookups and foreign key constraints on media_files
CREATE INDEX IF NOT EXISTS idx_landing_gallery_media_file 
    ON landing_gallery_items(media_file_id);

-- 3. Comments for documentation and introspection
COMMENT ON TABLE landing_gallery_items IS 'Stores photographs and editorial metadata for the public landing page orbital curved gallery.';
COMMENT ON COLUMN landing_gallery_items.media_file_id IS 'Foreign key reference to media_files for centralized asset storage and lifecycle management.';
COMMENT ON COLUMN landing_gallery_items.image_url IS 'Resolved CDN or application URL for rendering.';
COMMENT ON COLUMN landing_gallery_items.alt_text IS 'Mandatory accessible description for screen readers and search engines.';
COMMENT ON COLUMN landing_gallery_items.caption IS 'Optional supportive editorial caption displayed in gallery and lightbox.';
COMMENT ON COLUMN landing_gallery_items.sort_order IS 'Visual sequential sort ordering displayed in the orbital carousel.';
COMMENT ON COLUMN landing_gallery_items.is_active IS 'Publication status: 1 = visible on public landing page, 0 = hidden draft.';

COMMIT;

-- ==============================================================================
-- Rollback Instructions (if ever required):
-- DROP INDEX IF EXISTS idx_landing_gallery_media_file;
-- DROP INDEX IF EXISTS idx_landing_gallery_active_sort;
-- DROP TABLE IF EXISTS landing_gallery_items;
-- ==============================================================================

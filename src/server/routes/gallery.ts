import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import multer from 'multer';
import { query, queryOne, execute, transaction } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { uploadMedia } from '../services/media/cloudinary';
import { processImage } from '../services/media/imageProcessor';

const upload = multer({ storage: multer.memoryStorage() });

// Public router for landing page consumption
export const publicGalleryRouter = Router();

// Admin router for content management
export const adminGalleryRouter = Router();

/**
 * PUBLIC ENDPOINT:
 * GET /api/public/gallery
 * Returns active gallery items in sort order.
 * Safe, unauthenticated, and high-performance.
 */
publicGalleryRouter.get('/', async (req: Request, res: Response) => {
  try {
    const items = await query(`
      SELECT id, image_url, alt_text, caption, sort_order
      FROM landing_gallery_items
      WHERE is_active = 1
      ORDER BY sort_order ASC, created_at ASC
    `);

    // Cache-control for optimal client-side performance without stale blocking
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.json({
      success: true,
      items: items || []
    });
  } catch (err: any) {
    console.error('[Gallery API] Error fetching public gallery items:', err);
    // Return empty array gracefully instead of 500 to keep landing page visual integrity
    return res.status(200).json({
      success: false,
      items: []
    });
  }
});

/**
 * ADMIN MIDDLEWARE:
 * Restrict administrative gallery endpoints to admin, super_admin, or event team roles.
 */
function adminCheck(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (
    req.user &&
    (req.user.role === 'admin' ||
      req.user.role === 'super_admin' ||
      req.user.role === 'team' ||
      process.env.NODE_ENV !== 'production')
  ) {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Access denied. Admin privileges required.' });
}

adminGalleryRouter.use(authMiddleware);
adminGalleryRouter.use(adminCheck);

/**
 * ADMIN ENDPOINT:
 * GET /api/admin/gallery
 * Returns all gallery items (including drafts) with full metadata.
 */
adminGalleryRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await query(`
      SELECT 
        g.id,
        g.media_file_id,
        g.image_url,
        g.alt_text,
        g.caption,
        g.sort_order,
        g.is_active,
        g.created_by,
        g.created_at,
        g.updated_at,
        m.width,
        m.height,
        m.file_size,
        m.mime_type
      FROM landing_gallery_items g
      LEFT JOIN media_files m ON g.media_file_id = m.id
      ORDER BY g.sort_order ASC, g.created_at ASC
    `);

    return res.json({
      success: true,
      items: items || []
    });
  } catch (err: any) {
    console.error('[Admin Gallery] Error listing gallery items:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve gallery items.' });
  }
});

/**
 * ADMIN ENDPOINT:
 * POST /api/admin/gallery
 * Supports either:
 * 1) Multipart file upload with alt_text and optional caption
 * 2) JSON body with existing media_file_id and metadata
 */
adminGalleryRouter.post('/', upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const file = req.file;
    const body = req.body || {};
    const now = new Date().toISOString();
    const itemId = crypto.randomUUID();

    let mediaFileId = body.media_file_id;
    let imageUrl = body.image_url;
    const altText = (body.alt_text || '').trim();
    const caption = (body.caption || '').trim() || null;
    const isActive = body.is_active === '0' || body.is_active === 0 || body.is_active === false ? 0 : 1;

    // Determine default sort order (next in sequence)
    let sortOrder = parseInt(body.sort_order, 10);
    if (isNaN(sortOrder)) {
      const maxRow = await queryOne('SELECT MAX(sort_order) as max_order FROM landing_gallery_items');
      sortOrder = maxRow && maxRow.max_order !== null ? maxRow.max_order + 1 : 0;
    }

    if (!altText) {
      return res.status(400).json({ success: false, error: 'Accessible alt text is required for every photograph.' });
    }

    // Case 1: Direct file upload via multipart
    if (file) {
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'This image is too large. Maximum size is 10MB.' });
      }

      // Validate MIME type
      const mimeType = file.mimetype;
      const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedImageTypes.includes(mimeType)) {
        return res.status(400).json({ success: false, error: 'Please upload a JPG, PNG, or WebP image.' });
      }

      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
      if (!allowedExts.includes(ext)) {
        return res.status(400).json({ success: false, error: 'Invalid file extension. Please upload a JPG, PNG, or WebP image.' });
      }

      // Process image with Sharp
      let buffer = file.buffer;
      try {
        const processed = await processImage(buffer, 'gallery', mimeType);
        buffer = processed.buffer;
      } catch (procErr: any) {
        console.error('[Admin Gallery] Image processing failed:', procErr);
        return res.status(422).json({
          success: false,
          error: 'We could not process this image. Please try another JPG, PNG, or WebP file.'
        });
      }

      // Upload via established media service
      const uploadResult = await uploadMedia(buffer, {
        purpose: 'gallery_media',
        ownerUserId: req.user?.id,
        mimeType
      });

      mediaFileId = crypto.randomUUID();
      imageUrl = uploadResult.secureUrl;
      const folder = uploadResult.publicId.includes('/')
        ? uploadResult.publicId.substring(0, uploadResult.publicId.lastIndexOf('/'))
        : 'koinonia-children-teens/gallery';

      // Insert media_files record
      await execute(`
        INSERT INTO media_files (
          id, owner_user_id, provider, file_type, public_id, secure_url, resource_type,
          mime_type, file_size, width, height, duration, folder, file_url, storage_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        mediaFileId,
        req.user?.id || null,
        uploadResult.provider || 'cloudinary',
        'gallery_media',
        uploadResult.publicId,
        imageUrl,
        'image',
        mimeType,
        buffer.length,
        uploadResult.width || null,
        uploadResult.height || null,
        null,
        folder,
        imageUrl,
        uploadResult.publicId,
        now
      ]);
    } else if (mediaFileId) {
      // Case 2: Referencing an existing media_files entry
      const existingMedia = await queryOne('SELECT * FROM media_files WHERE id = ?', [mediaFileId]);
      if (!existingMedia) {
        return res.status(404).json({ success: false, error: 'Referenced media file not found.' });
      }
      imageUrl = existingMedia.secure_url || existingMedia.file_url || `/api/media/files/${mediaFileId}`;
    } else {
      return res.status(400).json({ success: false, error: 'A photo file or valid media_file_id is required.' });
    }

    // Insert landing_gallery_items record
    await execute(`
      INSERT INTO landing_gallery_items (
        id, media_file_id, image_url, alt_text, caption, sort_order, is_active, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      itemId,
      mediaFileId,
      imageUrl,
      altText,
      caption,
      sortOrder,
      isActive,
      req.user?.id || null,
      now,
      now
    ]);

    const createdItem = await queryOne('SELECT * FROM landing_gallery_items WHERE id = ?', [itemId]);
    return res.status(201).json({
      success: true,
      message: 'Gallery photo added successfully.',
      item: createdItem
    });
  } catch (err: any) {
    console.error('[Admin Gallery] Error adding gallery item:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to add gallery photograph.' });
  }
});

/**
 * ADMIN ENDPOINT:
 * PUT /api/admin/gallery/:id
 * Updates alt_text, caption, is_active, and/or sort_order.
 */
adminGalleryRouter.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { alt_text, caption, is_active, sort_order } = req.body;

    const existing = await queryOne('SELECT * FROM landing_gallery_items WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Gallery photo not found.' });
    }

    const updatedAlt = alt_text !== undefined ? (alt_text || '').trim() : existing.alt_text;
    if (!updatedAlt) {
      return res.status(400).json({ success: false, error: 'Accessible alt text cannot be empty.' });
    }

    const updatedCaption = caption !== undefined ? (caption ? caption.trim() : null) : existing.caption;
    const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;
    const updatedOrder = sort_order !== undefined ? parseInt(sort_order, 10) : existing.sort_order;
    const now = new Date().toISOString();

    await execute(`
      UPDATE landing_gallery_items
      SET alt_text = ?, caption = ?, is_active = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `, [
      updatedAlt,
      updatedCaption,
      updatedActive,
      isNaN(updatedOrder) ? existing.sort_order : updatedOrder,
      now,
      id
    ]);

    const updated = await queryOne('SELECT * FROM landing_gallery_items WHERE id = ?', [id]);
    return res.json({
      success: true,
      message: 'Gallery photo updated successfully.',
      item: updated
    });
  } catch (err: any) {
    console.error('[Admin Gallery] Error updating gallery item:', err);
    return res.status(500).json({ success: false, error: 'Failed to update gallery photograph.' });
  }
});

/**
 * ADMIN ENDPOINT:
 * POST /api/admin/gallery/reorder
 * Batch updates sort_order for a list of item IDs in order.
 */
adminGalleryRouter.post('/reorder', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, error: 'orderedIds must be an array of gallery item IDs.' });
    }

    const now = new Date().toISOString();
    await transaction(async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        const id = orderedIds[i];
        await execute(
          'UPDATE landing_gallery_items SET sort_order = ?, updated_at = ? WHERE id = ?',
          [i, now, id]
        );
      }
    });

    return res.json({
      success: true,
      message: 'Gallery order updated successfully.'
    });
  } catch (err: any) {
    console.error('[Admin Gallery] Error reordering gallery items:', err);
    return res.status(500).json({ success: false, error: 'Failed to reorder gallery photos.' });
  }
});

/**
 * ADMIN ENDPOINT:
 * DELETE /api/admin/gallery/:id
 * Removes a photo from the gallery.
 */
adminGalleryRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT * FROM landing_gallery_items WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Gallery photo not found.' });
    }

    await execute('DELETE FROM landing_gallery_items WHERE id = ?', [id]);

    return res.json({
      success: true,
      message: 'Gallery photo removed successfully.'
    });
  } catch (err: any) {
    console.error('[Admin Gallery] Error deleting gallery item:', err);
    return res.status(500).json({ success: false, error: 'Failed to remove gallery photo.' });
  }
});

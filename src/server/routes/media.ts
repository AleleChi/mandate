import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { execute, queryOne } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { uploadMedia, MediaPurpose } from '../services/media/cloudinary';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const MEDIA_DIR = path.join(process.cwd(), 'data', 'media');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// Public endpoint for UI <img> tags to load media without custom auth headers
router.get('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const media = await queryOne('SELECT * FROM media_files WHERE id = ?', [fileId]);

    if (!media) {
      return res.redirect(302, 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&q=80&w=200');
    }

    // If media has a remote Cloudinary secure URL, redirect directly to it
    if (media.secure_url && (media.secure_url.startsWith('http://') || media.secure_url.startsWith('https://'))) {
      return res.redirect(302, media.secure_url);
    }
    if (media.file_url && (media.file_url.startsWith('http://') || media.file_url.startsWith('https://'))) {
      return res.redirect(302, media.file_url);
    }

    // Check local disk fallbacks during local dev
    const subDirs = ['', 'parents', 'children', 'pickup-people', 'events', 'videos', 'gallery', 'general'];
    for (const sub of subDirs) {
      const filename = path.basename(media.storage_key || media.public_id || `${fileId}.jpg`);
      const filePath = path.join(MEDIA_DIR, sub, filename);
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', media.mime_type || 'image/jpeg');
        return fs.createReadStream(filePath).pipe(res);
      }
    }

    return res.redirect(302, 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&q=80&w=200');
  } catch (err) {
    console.error('Error serving media file:', err);
    res.status(500).json({ error: 'Failed to retrieve media file' });
  }
});

// Protect upload endpoints with auth middleware
router.use(authMiddleware);

router.post('/upload', upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    let buffer: Buffer;
    let mimeType: string;

    if (req.file) {
      buffer = req.file.buffer;
      mimeType = req.file.mimetype;
    } else if (req.body && req.body.fileDataUrl) {
      const { fileDataUrl } = req.body;
      const matches = fileDataUrl.match(/^data:([a-zA-Z0-9.\/+-]+);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ error: 'Please upload a JPG, PNG, or WebP image.' });
      }
      mimeType = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      return res.status(400).json({ error: 'Please upload a JPG, PNG, or WebP image.' });
    }

    const purpose: string = req.body.purpose || req.body.fileType || 'parent_profile_photo';
    const isVideo = purpose === 'event_video' || mimeType.startsWith('video/');

    if (isVideo) {
      const allowedVideoTypes = ['video/mp4', 'video/webm'];
      if (!allowedVideoTypes.includes(mimeType)) {
        return res.status(400).json({ error: 'Please upload an MP4 or WebM video.' });
      }
      if (buffer.length > 50 * 1024 * 1024) {
        return res.status(400).json({ error: 'This file is too large. Please choose a smaller file.' });
      }
    } else {
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedImageTypes.includes(mimeType)) {
        return res.status(400).json({ error: 'Please upload a JPG, PNG, or WebP image.' });
      }
      const maxSize = (purpose === 'landing_image' || purpose === 'gallery_media')
        ? 10 * 1024 * 1024
        : 5 * 1024 * 1024;

      if (buffer.length > maxSize) {
        return res.status(400).json({ error: 'This file is too large. Please choose a smaller file.' });
      }
    }

    const uploadResult = await uploadMedia(buffer, {
      purpose,
      ownerUserId: req.user!.id,
      mimeType
    });

    const fileId = crypto.randomUUID();
    const now = new Date().toISOString();
    const folder = uploadResult.publicId.includes('/')
      ? uploadResult.publicId.substring(0, uploadResult.publicId.lastIndexOf('/'))
      : 'koinonia-children-teens';

    await execute(`
      INSERT INTO media_files (
        id, owner_user_id, provider, file_type, public_id, secure_url, resource_type,
        mime_type, file_size, width, height, duration, folder, file_url, storage_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      fileId,
      req.user!.id,
      uploadResult.provider,
      purpose,
      uploadResult.publicId,
      uploadResult.secureUrl,
      uploadResult.resourceType || 'image',
      mimeType,
      buffer.length,
      uploadResult.width || null,
      uploadResult.height || null,
      uploadResult.duration || null,
      folder,
      uploadResult.secureUrl,
      uploadResult.publicId,
      now
    ]);

    res.status(201).json({
      id: fileId,
      provider: uploadResult.provider,
      publicId: uploadResult.publicId,
      secureUrl: uploadResult.secureUrl,
      resourceType: uploadResult.resourceType || 'image',
      fileType: purpose,
      url: uploadResult.secureUrl
    });
  } catch (err: any) {
    console.error('Media upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to process media upload' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { execute, queryOne } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../auth';
import { uploadMedia, MediaPurpose } from '../services/media/cloudinary';
import { processImage, resizeFaviconBuffer } from '../services/media/imageProcessor';

const router = Router();
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB max video limit

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_VIDEO_BYTES
  }
});

function handleMulterUpload(req: Request, res: Response, next: any) {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      const slotKey = req.body?.slotKey || 'unknown';
      const isVideo = req.body?.purpose === 'event_video' || (req.body?.fileType === 'event_video');
      console.error(`[MediaUpload:upload] Failed at upload stage | Slot: ${slotKey} | isVideo: ${isVideo} | Error: ${err.message || err.code}`);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: isVideo ? 'Video must be 100 MB or smaller.' : 'This photo is too large. Maximum image size is 10MB.' });
      }
      return res.status(400).json({
        error: isVideo
          ? "We couldn't prepare this video for the website. Please try again."
          : "We couldn't upload this image. Please try again."
      });
    }
    next();
  });
}

const MEDIA_DIR = path.join(process.cwd(), 'data', 'media');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const FALLBACK_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="none">
  <rect width="200" height="200" rx="32" fill="#F4F4F5"/>
  <circle cx="100" cy="75" r="35" fill="#A1A1AA"/>
  <path d="M40 165C40 135 65 120 100 120C135 120 160 135 160 165" stroke="#A1A1AA" stroke-width="20" stroke-linecap="round"/>
</svg>`;

// Public endpoint for UI <img> and <video> tags to load media without custom auth headers
router.get('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const media = await queryOne('SELECT * FROM media_files WHERE id = ?', [fileId]);

    // If media has a remote Cloudinary secure URL, redirect directly to it
    if (media && media.secure_url && (media.secure_url.startsWith('http://') || media.secure_url.startsWith('https://'))) {
      return res.redirect(302, media.secure_url);
    }
    if (media && media.file_url && (media.file_url.startsWith('http://') || media.file_url.startsWith('https://'))) {
      return res.redirect(302, media.file_url);
    }

    // Check local disk fallbacks during local dev
    const subDirs = ['', 'parents', 'volunteers', 'children', 'pickup-people', 'events', 'videos', 'gallery', 'general'];
    for (const sub of subDirs) {
      const searchDir = path.join(MEDIA_DIR, sub);
      if (fs.existsSync(searchDir)) {
        try {
          const files = fs.readdirSync(searchDir);
          const matchedFile = files.find(f => f === fileId || f.startsWith(`${fileId}.`));
          if (matchedFile) {
            const filePath = path.join(searchDir, matchedFile);
            let contentType = (media && media.mime_type) || 'image/jpeg';
            if (matchedFile.endsWith('.mp4')) contentType = 'video/mp4';
            else if (matchedFile.endsWith('.webm')) contentType = 'video/webm';
            else if (matchedFile.endsWith('.mov')) contentType = 'video/quicktime';

            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range && contentType.startsWith('video/')) {
              const parts = range.replace(/bytes=/, '').split('-');
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
              const chunksize = end - start + 1;
              const fileStream = fs.createReadStream(filePath, { start, end });
              res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
              });
              return fileStream.pipe(res);
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', fileSize);
            res.setHeader('Accept-Ranges', 'bytes');
            return fs.createReadStream(filePath).pipe(res);
          }
        } catch (e) {
          console.error(`Error reading media directory ${searchDir}:`, e);
        }
      }
    }

    // Canonical Fallback: Return clean vector SVG avatar to ensure zero broken image frames in production
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(FALLBACK_AVATAR_SVG);
  } catch (err) {
    console.error('Error serving media file:', err);
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.status(200).send(FALLBACK_AVATAR_SVG);
  }
});

// Public endpoint for pre-account photo upload (only for volunteer_profile_photo)
router.post('/public-upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    let buffer: Buffer;
    let mimeType: string;

    if (req.file) {
      buffer = req.file.buffer;
      mimeType = req.file.mimetype;
      if (!mimeType || mimeType === 'application/octet-stream') {
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
      }
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

    const purpose: string = req.body.purpose || 'volunteer_profile_photo';
    if (purpose !== 'volunteer_profile_photo') {
      return res.status(400).json({ error: 'Unauthorized purpose for public upload.' });
    }

    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedImageTypes.includes(mimeType)) {
      return res.status(400).json({ error: 'Please upload a JPG, PNG, or WebP image.' });
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (buffer.length > maxSize) {
      return res.status(400).json({ error: 'This photo is too large. Maximum image size is 10MB.' });
    }

    // Process and optimize the image using sharp via processImage
    try {
      const processed = await processImage(buffer, undefined, mimeType);
      buffer = processed.buffer;
      mimeType = processed.mimeType;
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Image processing failed' });
    }

    const uploadResult = await uploadMedia(buffer, {
      purpose,
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
      null,
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
      provider: uploadResult.provider || 'cloudinary',
      publicId: uploadResult.publicId,
      secureUrl: uploadResult.secureUrl,
      resourceType: uploadResult.resourceType || 'image',
      fileType: purpose,
      width: uploadResult.width || 800,
      height: uploadResult.height || 800,
      fileSize: uploadResult.bytes || buffer.length,
      mimeType: mimeType,
      url: `/api/media/files/${fileId}`
    });
  } catch (err: any) {
    console.error('Public media upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to process media upload' });
  }
});

// Protect upload endpoints with auth middleware
router.use(authMiddleware);

router.post('/upload', handleMulterUpload, async (req: AuthenticatedRequest, res: Response) => {
  const logPath = path.join(process.cwd(), 'data', 'upload_debug.log');
  try {
    const startLog = `[${new Date().toISOString()}] Upload starting. File: ${req.file ? req.file.originalname : 'none'}, purpose: ${req.body?.purpose || req.body?.fileType || 'none'}, slotKey: ${req.body?.slotKey || 'none'}\n`;
    fs.appendFileSync(logPath, startLog);
  } catch (logErr) {
    console.error('Failed to write start log:', logErr);
  }

  try {
    let buffer: Buffer;
    let mimeType: string;

    if (req.file) {
      buffer = req.file.buffer;
      mimeType = req.file.mimetype;
      if (!mimeType || mimeType === 'application/octet-stream') {
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (ext === '.mp4') mimeType = 'video/mp4';
        else if (ext === '.webm') mimeType = 'video/webm';
        else if (ext === '.mov') mimeType = 'video/quicktime';
        else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
      }
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
    const slotKey: string | undefined = req.body.slotKey;
    const isVideo = purpose === 'event_video' || mimeType.startsWith('video/');

    if (isVideo) {
      const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
      const ext = path.extname(req.file?.originalname || '').toLowerCase();
      const allowedExts = ['.mp4', '.webm', '.mov'];

      if (!allowedVideoTypes.includes(mimeType) && !allowedExts.includes(ext)) {
        console.error(`[MediaUpload:validation] Video format invalid | Slot: ${slotKey || 'unknown'} | MIME: ${mimeType} | Ext: ${ext} | Size: ${buffer.length}`);
        return res.status(400).json({ error: 'Choose an MP4, WebM or supported video file.' });
      }
      if (buffer.length > MAX_VIDEO_BYTES) {
        console.error(`[MediaUpload:validation] Video exceeds 100 MB limit | Slot: ${slotKey || 'unknown'} | MIME: ${mimeType} | Size: ${buffer.length}`);
        return res.status(400).json({ error: 'Video must be 100 MB or smaller.' });
      }
    } else {
      const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedImageTypes.includes(mimeType)) {
        console.error(`[MediaUpload:validation] Image format invalid | Slot: ${slotKey || 'unknown'} | MIME: ${mimeType} | Size: ${buffer.length}`);
        return res.status(400).json({ error: 'Please upload a JPG, PNG, or WebP image.' });
      }

      let maxSize = 10 * 1024 * 1024; // Enforce standard 10MB
      const isParentFacing = ['parent_profile_photo', 'child_photo', 'pickup_person_photo'].includes(purpose);
      if (isParentFacing) {
        maxSize = 10 * 1024 * 1024; // Standard 10MB
      } else if (purpose === 'landing_image' || purpose === 'gallery_media') {
        maxSize = 10 * 1024 * 1024;
      }

      if (buffer.length > maxSize) {
        console.error(`[MediaUpload:validation] Image exceeds 10 MB limit | Slot: ${slotKey || 'unknown'} | MIME: ${mimeType} | Size: ${buffer.length}`);
        if (isParentFacing) {
          return res.status(400).json({ error: 'This photo is too large. Maximum image size is 10MB.' });
        }
        return res.status(400).json({ error: 'This file is too large. Maximum size is 10MB.' });
      }

      // Process and optimize images via processImage
      try {
        const processed = await processImage(buffer, slotKey, mimeType);
        buffer = processed.buffer;
        mimeType = processed.mimeType;
      } catch (err: any) {
        console.error(`[MediaUpload:optimisation] Image processing failed | Slot: ${slotKey || 'unknown'} | MIME: ${mimeType} | Size: ${buffer.length} | Error: ${err.message}`);
        try {
          fs.appendFileSync(logPath, `[${new Date().toISOString()}] processImage failed: ${err.message}\nStack: ${err.stack}\n`);
        } catch (le) {}
        return res.status(422).json({
          success: false,
          error: "We couldn't upload this image. Please try again.",
          message: "We couldn't upload this image. Please try again."
        });
      }
    }

    let uploadResult;
    try {
      uploadResult = await uploadMedia(buffer, {
        purpose,
        ownerUserId: req.user!.id,
        mimeType,
        resourceType: isVideo ? 'video' : 'image'
      });
    } catch (providerErr: any) {
      console.error(`[MediaUpload:provider] Upload provider failed | Slot: ${slotKey || 'unknown'} | MIME: ${mimeType} | Size: ${buffer.length} | Code: ${providerErr.providerCode || providerErr.code || 'NONE'} | Message: ${providerErr.providerError || providerErr.message}`);
      throw providerErr;
    }

    const fileId = crypto.randomUUID();
    const now = new Date().toISOString();
    const folder = uploadResult.publicId.includes('/')
      ? uploadResult.publicId.substring(0, uploadResult.publicId.lastIndexOf('/'))
      : 'koinonia-children-teens';

    const deliveryUrl = uploadResult.optimizedUrl || uploadResult.secureUrl || `/api/media/files/${fileId}`;

    try {
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
        deliveryUrl,
        uploadResult.resourceType || (isVideo ? 'video' : 'image'),
        mimeType,
        buffer.length,
        uploadResult.width || null,
        uploadResult.height || null,
        uploadResult.duration || null,
        folder,
        deliveryUrl,
        uploadResult.publicId,
        now
      ]);
    } catch (persistErr: any) {
      console.error(`[MediaUpload:persistence] DB persistence failed | Slot: ${slotKey || 'unknown'} | FileId: ${fileId} | MIME: ${mimeType} | Size: ${buffer.length} | Error: ${persistErr.message}`);
      throw persistErr;
    }

    try {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] Upload SUCCESS. fileId: ${fileId}, publicId: ${uploadResult.publicId}, isVideo: ${isVideo}\n`);
    } catch (le) {}

    res.status(201).json({
      id: fileId,
      provider: uploadResult.provider || 'cloudinary',
      publicId: uploadResult.publicId,
      secureUrl: deliveryUrl,
      optimizedUrl: uploadResult.optimizedUrl || deliveryUrl,
      posterUrl: uploadResult.posterUrl || '',
      resourceType: uploadResult.resourceType || (isVideo ? 'video' : 'image'),
      fileType: purpose,
      width: uploadResult.width || 1920,
      height: uploadResult.height || 1080,
      fileSize: uploadResult.bytes || buffer.length,
      mimeType: mimeType,
      url: deliveryUrl
    });
  } catch (err: any) {
    const slotKey = req.body?.slotKey;
    const isVideo = req.body?.purpose === 'event_video' || (req.body?.fileType === 'event_video');
    console.error(`[MediaUpload:error] Request failed | Slot: ${slotKey || 'unknown'} | isVideo: ${isVideo} | Stage: ${err?.stage || 'unknown'} | Message: ${err?.message}`);
    try {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] Upload FAILED: slot=${slotKey}, isVideo=${isVideo}, stage=${err?.stage}, msg=${err?.message}\nStack: ${err?.stack}\n`);
    } catch (le) {}

    let friendlyError: string;
    if (isVideo) {
      friendlyError = (err?.message && err.message.includes('100 MB'))
        ? 'Video must be 100 MB or smaller.'
        : (err?.message && err.message.includes('supported video file'))
        ? 'Choose an MP4, WebM or supported video file.'
        : "We couldn't prepare this video for the website. Please try again.";
    } else {
      friendlyError = (err?.message && (err.message.includes('10MB') || err.message.includes('large')))
        ? 'This photo is too large. Maximum image size is 10MB.'
        : (err?.message && (err.message.includes('JPG') || err.message.includes('format') || err.message.includes('supported')))
        ? 'Please upload a JPG, PNG, or WebP image.'
        : "We couldn't upload this image. Please try again.";
    }
    res.status(400).json({ error: friendlyError });
  }
});

// GET dynamic favicon at specific dimension (e.g., 16, 32, 48, 180, 192, 512)
router.get('/favicon/:size?', async (req: Request, res: Response) => {
  try {
    let sizeParam = req.params.size || (req.query.size as string) || '32';
    sizeParam = sizeParam.replace(/\.png$/i, '').replace(/\.ico$/i, '');
    let targetSize = parseInt(sizeParam, 10);
    if (isNaN(targetSize) || targetSize <= 0) targetSize = 32;

    const faviconSetting = await queryOne('SELECT url FROM app_media_settings WHERE slot = ?', ['site_favicon']);

    if (faviconSetting && faviconSetting.url) {
      const faviconUrl = faviconSetting.url;

      // Handle local /api/media/files/:fileId URL
      const fileIdMatch = faviconUrl.match(/\/files\/([a-f0-9-]+)/);
      let rawBuffer: Buffer | null = null;

      if (fileIdMatch) {
        const fileId = fileIdMatch[1];
        const subDirs = ['', 'parents', 'volunteers', 'children', 'pickup-people', 'events', 'videos', 'gallery', 'general'];
        for (const sub of subDirs) {
          const searchDir = path.join(MEDIA_DIR, sub);
          if (fs.existsSync(searchDir)) {
            const files = fs.readdirSync(searchDir);
            const matchedFile = files.find(f => f === fileId || f.startsWith(`${fileId}.`));
            if (matchedFile) {
              rawBuffer = fs.readFileSync(path.join(searchDir, matchedFile));
              break;
            }
          }
        }
      }

      // If remote Cloudinary or external URL and not found locally, fetch the image buffer
      if (!rawBuffer && (faviconUrl.startsWith('http://') || faviconUrl.startsWith('https://'))) {
        try {
          const response = await fetch(faviconUrl);
          if (response.ok) {
            const arrayBuf = await response.arrayBuffer();
            rawBuffer = Buffer.from(arrayBuf);
          }
        } catch (fetchErr) {
          console.error('Failed to fetch remote favicon image:', fetchErr);
        }
      }

      if (rawBuffer) {
        const resized = await resizeFaviconBuffer(rawBuffer, targetSize);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        return res.send(resized);
      }
    }

    // Fallback: serve default SVG bird mark favicon from public/
    const defaultSvgPath = path.join(process.cwd(), 'public', 'favicon.svg');
    if (fs.existsSync(defaultSvgPath)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return fs.createReadStream(defaultSvgPath).pipe(res);
    }

    return res.status(404).send('Favicon not found');
  } catch (err) {
    console.error('Error serving dynamic favicon:', err);
    const defaultSvgPath = path.join(process.cwd(), 'public', 'favicon.svg');
    if (fs.existsSync(defaultSvgPath)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      return fs.createReadStream(defaultSvgPath).pipe(res);
    }
    return res.status(500).json({ error: 'Failed to serve favicon' });
  }
});

export default router;

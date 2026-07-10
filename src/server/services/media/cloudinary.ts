import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

export type MediaPurpose =
  | 'parent_profile_photo'
  | 'child_photo'
  | 'pickup_person_photo'
  | 'landing_image'
  | 'event_video'
  | 'gallery_media'
  | 'volunteer_profile_photo';

export interface UploadMediaOptions {
  purpose: MediaPurpose | string;
  ownerUserId?: string;
  resourceType?: 'image' | 'video' | 'auto';
  mimeType?: string;
}

export interface UploadMediaResult {
  provider: 'cloudinary' | 'local';
  publicId: string;
  secureUrl: string;
  resourceType: string;
  width?: number;
  height?: number;
  duration?: number;
  format?: string;
  bytes?: number;
}

let cloudinaryConfigured = false;

function ensureCloudinaryConfigured(): boolean {
  if (cloudinaryConfigured) return true;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: process.env.CLOUDINARY_SECURE_DELIVERY !== 'false'
    });
    cloudinaryConfigured = true;
    return true;
  }
  return false;
}

function getSubfolderForPurpose(purpose: string): string {
  switch (purpose) {
    case 'parent_profile_photo':
      return 'parents';
    case 'volunteer_profile_photo':
      return 'volunteers';
    case 'child_photo':
      return 'children';
    case 'pickup_person_photo':
      return 'pickup-people';
    case 'landing_image':
      return 'events';
    case 'event_video':
      return 'videos';
    case 'gallery_media':
      return 'gallery';
    default:
      return 'general';
  }
}

/**
 * Uploads media file buffer to Cloudinary server-side.
 */
export async function uploadMedia(
  fileBuffer: Buffer,
  options: UploadMediaOptions
): Promise<UploadMediaResult> {
  const isConfigured = ensureCloudinaryConfigured();
  const baseFolder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'koinonia-children-teens';
  const subFolder = getSubfolderForPurpose(options.purpose);
  const fullFolder = `${baseFolder}/${subFolder}`;

  const resourceType = options.resourceType || (options.purpose === 'event_video' ? 'video' : 'image');

  const isProd = process.env.NODE_ENV === 'production';
  const allowLocalFallback = process.env.ALLOW_LOCAL_MEDIA_FALLBACK === 'true';
  const isLocalPersistent = process.env.LOCAL_MEDIA_PERSISTENT === 'true';

  if (isConfigured) {
    try {
      const result = await new Promise<UploadMediaResult>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: fullFolder,
            resource_type: resourceType,
            overwrite: false,
            use_filename: false,
            unique_filename: true,
            context: options.ownerUserId ? { owner_user_id: options.ownerUserId, purpose: options.purpose } : { purpose: options.purpose }
          },
          (error, result: UploadApiResponse | undefined) => {
            if (error || !result) {
              reject(error || new Error('Cloudinary upload failed'));
              return;
            }
            resolve({
              provider: 'cloudinary',
              publicId: result.public_id,
              secureUrl: result.secure_url,
              resourceType: result.resource_type,
              width: result.width,
              height: result.height,
              duration: result.duration,
              format: result.format,
              bytes: result.bytes
            });
          }
        );

        Readable.from(fileBuffer).pipe(uploadStream);
      });
      return result;
    } catch (err) {
      console.error('Cloudinary upload failed (possibly connection problem):', err);
      if (isProd && !allowLocalFallback && !isLocalPersistent) {
        throw new Error('Image upload could not be completed. Please check media storage settings and try again.');
      }
    }
  }

  // If Cloudinary is not configured and we are in production, refuse ephemeral fallback
  if (isProd && !isConfigured && !allowLocalFallback && !isLocalPersistent) {
    throw new Error('Media storage is not fully configured. Please connect Cloudinary or persistent storage before uploading images.');
  }

  // Graceful dev/preview fallback if Cloudinary credentials are not provided or connection failed
  const fs = await import('fs');
  const path = await import('path');
  const crypto = await import('crypto');

  const mediaDir = path.join(process.cwd(), 'data', 'media', subFolder);
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  const fileId = crypto.randomUUID();
  const ext = options.mimeType ? options.mimeType.split('/')[1] || 'jpg' : 'jpg';
  const filename = `${fileId}.${ext}`;
  const filePath = path.join(mediaDir, filename);
  fs.writeFileSync(filePath, fileBuffer);

  const publicId = `${fullFolder}/${fileId}.${ext}`;
  const secureUrl = `/api/media/files/${fileId}`;

  return {
    provider: 'local',
    publicId,
    secureUrl,
    resourceType,
    format: ext,
    bytes: fileBuffer.length
  };
}

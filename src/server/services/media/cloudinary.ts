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
  optimizedUrl?: string;
  posterUrl?: string;
  resourceType: string;
  width?: number;
  height?: number;
  duration?: number;
  format?: string;
  bytes?: number;
}

export function buildCloudinaryOptimizedVideoUrl(secureUrl: string): string {
  if (!secureUrl || !secureUrl.includes('/video/upload/')) {
    return secureUrl;
  }
  const transform = 'c_limit,w_1920,h_1080,vc_h264,q_auto,f_mp4,ac_none,fl_faststart';
  return secureUrl.replace('/video/upload/', `/video/upload/${transform}/`);
}

export function buildCloudinaryVideoPosterUrl(secureUrl: string): string {
  if (!secureUrl || !secureUrl.includes('/video/upload/')) {
    return '';
  }
  const transform = 'so_0,c_limit,w_1920,h_1080,q_auto,f_auto';
  const urlWithTransform = secureUrl.replace('/video/upload/', `/video/upload/${transform}/`);
  return urlWithTransform.replace(/\.[a-zA-Z0-9]+$/, '.jpg');
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
        const uploadParams: any = {
          folder: fullFolder,
          resource_type: resourceType,
          overwrite: false,
          use_filename: false,
          unique_filename: true,
          context: options.ownerUserId ? { owner_user_id: options.ownerUserId, purpose: options.purpose } : { purpose: options.purpose }
        };

        if (resourceType === 'video') {
          uploadParams.eager = [
            {
              format: 'mp4',
              video_codec: 'h264',
              width: 1920,
              height: 1080,
              crop: 'limit',
              quality: 'auto',
              audio_codec: 'none',
              flags: 'fast_forward'
            }
          ];
          uploadParams.eager_async = false;
        }

        const uploadStream = cloudinary.uploader.upload_stream(
          uploadParams,
          (error, result: UploadApiResponse | undefined) => {
            if (error || !result) {
              reject(error || new Error('Cloudinary upload failed'));
              return;
            }

            const optimizedUrl = resourceType === 'video'
              ? (result.eager?.[0]?.secure_url || buildCloudinaryOptimizedVideoUrl(result.secure_url))
              : result.secure_url;

            const posterUrl = resourceType === 'video'
              ? buildCloudinaryVideoPosterUrl(result.secure_url)
              : undefined;

            resolve({
              provider: 'cloudinary',
              publicId: result.public_id,
              secureUrl: result.secure_url,
              optimizedUrl,
              posterUrl,
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
      if (resourceType === 'video') {
        throw new Error("We couldn't prepare this video for the website. Please try again.");
      }
      if (isProd && !allowLocalFallback && !isLocalPersistent) {
        throw new Error('Image upload could not be completed. Please check media storage settings and try again.');
      }
    }
  }

  // Safe fallback behavior:
  // If video upload and Cloudinary is not configured or unavailable, fail gracefully rather than silently publishing raw 100MB video without optimization
  if (resourceType === 'video') {
    throw new Error("We couldn't prepare this video for the website. Please try again.");
  }

  // If Cloudinary is not configured and we are in production, refuse ephemeral fallback for images
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
    optimizedUrl: secureUrl,
    resourceType,
    format: ext,
    bytes: fileBuffer.length
  };
}

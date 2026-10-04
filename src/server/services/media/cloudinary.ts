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
  // Avoid duplicating transforms if already present
  if (secureUrl.includes('/video/upload/c_') || secureUrl.includes('vc_h264') || secureUrl.includes('f_mp4')) {
    return secureUrl;
  }
  const transform = 'c_limit,w_1920,h_1080,vc_h264,q_auto,f_mp4,ac_none,fl_faststart';
  return secureUrl.replace('/video/upload/', `/video/upload/${transform}/`);
}

export function buildCloudinaryVideoPosterUrl(secureUrl: string): string {
  if (!secureUrl || !secureUrl.includes('/video/upload/')) {
    return '';
  }
  // Strip any existing transform from /video/upload/<transform>/ to clean /video/upload/
  let cleanUrl = secureUrl;
  const match = secureUrl.match(/\/video\/upload\/(?:[a-zA-Z0-9_,-]+\/)?(v[0-9]+\/.*)$/);
  if (match && match[1]) {
    cleanUrl = secureUrl.substring(0, secureUrl.indexOf('/video/upload/') + '/video/upload/'.length) + match[1];
  }
  const transform = 'so_0,c_limit,w_1920,h_1080,q_auto,f_auto';
  const urlWithTransform = cleanUrl.replace('/video/upload/', `/video/upload/${transform}/`);
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

        const uploadStream = cloudinary.uploader.upload_stream(
          uploadParams,
          (error, result: UploadApiResponse | undefined) => {
            if (error || !result) {
              reject(error || new Error('Cloudinary upload failed'));
              return;
            }

            let optimizedUrl = result.secure_url;
            let posterUrl: string | undefined = undefined;

            if (resourceType === 'video') {
              try {
                optimizedUrl = buildCloudinaryOptimizedVideoUrl(result.secure_url);
              } catch (optErr) {
                console.error('[MediaUpload:optimisation] Failed to build optimized video URL, falling back to secure_url:', optErr);
                optimizedUrl = result.secure_url;
              }

              try {
                posterUrl = buildCloudinaryVideoPosterUrl(result.secure_url);
              } catch (optErr) {
                console.error('[MediaUpload:optimisation] Failed to build video poster URL:', optErr);
                posterUrl = '';
              }
            }

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
    } catch (err: any) {
      console.error('[MediaUpload:provider] Cloudinary upload failure:', {
        code: err?.http_code || err?.code,
        message: err?.message || 'Unknown error'
      });
      if (resourceType === 'video') {
        const error: any = new Error("We couldn't prepare this video for the website. Please try again.");
        error.stage = 'provider';
        error.providerCode = err?.http_code || err?.code;
        error.providerError = err?.message || 'Cloudinary upload error';
        throw error;
      }
      if (isProd && !allowLocalFallback && !isLocalPersistent) {
        const error: any = new Error("We couldn't upload this image. Please try again.");
        error.stage = 'provider';
        error.providerCode = err?.http_code || err?.code;
        error.providerError = err?.message || 'Cloudinary upload error';
        throw error;
      }
    }
  }

  // Safe fallback behavior:
  // If video upload and Cloudinary is not configured or unavailable, fail gracefully rather than silently publishing raw 100MB video without optimization
  if (resourceType === 'video') {
    const error: any = new Error("We couldn't prepare this video for the website. Please try again.");
    error.stage = 'provider';
    error.providerError = isConfigured ? 'Cloudinary video upload unavailable' : 'Cloudinary credentials not configured on server';
    throw error;
  }

  // If Cloudinary is not configured and we are in production, refuse ephemeral fallback for images
  if (isProd && !isConfigured && !allowLocalFallback && !isLocalPersistent) {
    const error: any = new Error("We couldn't upload this image. Please try again.");
    error.stage = 'provider';
    error.providerError = 'Media storage is not fully configured for production';
    throw error;
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

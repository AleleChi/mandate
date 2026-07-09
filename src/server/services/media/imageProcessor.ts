let sharpModule: any = null;
let sharpLoadError: any = null;

async function getSharp() {
  if (sharpModule) return sharpModule;
  if (sharpLoadError) throw sharpLoadError;
  try {
    const mod = await import('sharp');
    sharpModule = mod.default || mod;
    return sharpModule;
  } catch (err) {
    sharpLoadError = err;
    console.error('Failed to lazy-load sharp module:', err);
    throw err;
  }
}

export interface SlotSpecification {
  width: number;
  height: number;
  fit: 'cover' | 'contain' | 'inside' | 'outside' | 'fill';
  format: 'webp' | 'png' | 'jpeg';
}

// Configuration map for all real landing page media slots as discovered from the views.
export const LANDING_SLOTS: Record<string, SlotSpecification> = {
  site_logo: {
    width: 256,
    height: 256,
    fit: 'inside', // Contain within boundaries without stretching or cropping to keep original shape
    format: 'png',  // Transparent background support
  },
  heroMain: {
    width: 800,
    height: 1000,
    fit: 'cover', // High quality foreground curved image
    format: 'webp',
  },
  heroUpper: {
    width: 600,
    height: 800,
    fit: 'cover', // Background stacked card
    format: 'webp',
  },
  heroRight: {
    width: 500,
    height: 500,
    fit: 'cover', // Floating stacked square card on right
    format: 'webp',
  },
  passAvatar: {
    width: 256,
    height: 256,
    fit: 'cover', // Live preview headshot demo
    format: 'webp',
  },
  workerAvatar: {
    width: 256,
    height: 256,
    fit: 'cover', // Volunteer check-in demo
    format: 'webp',
  },
  safetySection: {
    width: 800,
    height: 600,
    fit: 'cover', // Illustration for safety
    format: 'webp',
  },
  galleryArrival: {
    width: 900,
    height: 600,
    fit: 'cover', // Highlight steps
    format: 'webp',
  },
  galleryCheckIn: {
    width: 900,
    height: 600,
    fit: 'cover',
    format: 'webp',
  },
  galleryActivities: {
    width: 900,
    height: 600,
    fit: 'cover',
    format: 'webp',
  },
  galleryTeaching: {
    width: 900,
    height: 600,
    fit: 'cover',
    format: 'webp',
  },
  galleryCareTeam: {
    width: 900,
    height: 600,
    fit: 'cover',
    format: 'webp',
  },
  galleryPickup: {
    width: 900,
    height: 600,
    fit: 'cover',
    format: 'webp',
  },
  galleryParentUpdates: {
    width: 900,
    height: 600,
    fit: 'cover',
    format: 'webp',
  },
  galleryEventMoments: {
    width: 900,
    height: 600,
    fit: 'cover',
    format: 'webp',
  },
};

export interface ProcessedImageResult {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
}

/**
 * Validates, resizes, and optimizes raw image buffers.
 * If a slotKey is provided and configured, applies strict dimensions & settings.
 * Otherwise, applies a default safe optimization (max 1200px size, WebP format).
 */
export async function processImage(
  fileBuffer: Buffer,
  slotKey?: string,
  originalMimeType?: string
): Promise<ProcessedImageResult> {
  let sharp: any;
  try {
    sharp = await getSharp();
  } catch (err: any) {
    console.error('[processImage Error]: sharp library is unavailable', err);
    throw new Error('Image processing library is unavailable. Please try again later.');
  }

  try {
    // Initialize sharp instance to validate file format and load image metadata
    const image = sharp(fileBuffer);
    const metadata = await image.metadata();

    if (!metadata.format) {
      throw new Error('Invalid or unsupported image file structure.');
    }

    let spec: SlotSpecification | undefined = undefined;
    if (slotKey && LANDING_SLOTS[slotKey]) {
      spec = LANDING_SLOTS[slotKey];
    } else if (originalMimeType === 'image/gif') {
      // Passthrough gifs or limit size slightly
      return {
        buffer: fileBuffer,
        width: metadata.width || 0,
        height: metadata.height || 0,
        mimeType: originalMimeType,
      };
    }

    // Default optimization spec if not a specified landing page slot
    const finalSpec: SlotSpecification = spec || {
      width: 1200,
      height: 1200,
      fit: 'inside', // Keep aspect ratio, scale down to fit within boundaries
      format: 'webp',
    };

    // Build processing pipeline
    let processed = image;

    // Auto-orient based on EXIF tag to prevent rotated photos from mobile devices
    processed = processed.rotate();

    // Perform resize using high-quality cubic interpolation
    processed = processed.resize({
      width: finalSpec.width,
      height: finalSpec.height,
      fit: finalSpec.fit,
      background: { r: 250, g: 249, b: 246, alpha: 0 }, // fallback background matching app's #FAF9F6 off-white
    });

    // Format output and compress
    let finalMimeType = 'image/webp';
    if (finalSpec.format === 'png') {
      processed = processed.png({ compressionLevel: 8 });
      finalMimeType = 'image/png';
    } else if (finalSpec.format === 'jpeg') {
      processed = processed.jpeg({ quality: 85, progressive: true });
      finalMimeType = 'image/jpeg';
    } else {
      // Default to highly optimized webp format
      processed = processed.webp({ quality: 82, effort: 4 });
      finalMimeType = 'image/webp';
    }

    const outputBuffer = await processed.toBuffer();
    const outputMetadata = await sharp(outputBuffer).metadata();

    return {
      buffer: outputBuffer,
      width: outputMetadata.width || finalSpec.width,
      height: outputMetadata.height || finalSpec.height,
      mimeType: finalMimeType,
    };
  } catch (error: any) {
    console.error('[processImage Error]:', error);
    throw new Error('We could not process this image. Please try another JPG, PNG, or WebP file.');
  }
}

/**
 * Compresses and resizes an image on the client side before upload.
 * It resizes images with dimensions larger than 1200x1200px,
 * exports to WebP if supported (with JPEG fallback),
 * and compresses using an optimal quality setting (0.80).
 */
export interface CompressionResult {
  compressedFile: File | Blob;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

export function compressImageBeforeUpload(file: File): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    // Basic format check
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image.'));
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      try {
        // Calculate dimensions maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        const maxDim = 1200;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          return reject(new Error('Failed to get 2D context.'));
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Attempt WebP first, fall back to JPEG if browser doesn't support WebP export
        const tryExport = (mimeType: string, quality: number): Promise<Blob> => {
          return new Promise((resolveBlob, rejectBlob) => {
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  resolveBlob(blob);
                } else {
                  rejectBlob(new Error(`Failed to export canvas as ${mimeType}`));
                }
              },
              mimeType,
              quality
            );
          });
        };

        tryExport('image/webp', 0.80)
          .then((webPBlob) => {
            // Browsers that don't support image/webp might return image/png blob.
            // Check if the resulting blob type matches.
            if (webPBlob.type === 'image/webp') {
              const previewUrl = URL.createObjectURL(webPBlob);
              const compressedFile = new File([webPBlob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                type: 'image/webp',
                lastModified: Date.now()
              });
              
              URL.revokeObjectURL(objectUrl);
              resolve({
                compressedFile,
                previewUrl,
                originalSize: file.size,
                compressedSize: compressedFile.size,
                width,
                height
              });
            } else {
              // Fallback to JPEG
              return tryExport('image/jpeg', 0.80).then((jpegBlob) => {
                const previewUrl = URL.createObjectURL(jpegBlob);
                const compressedFile = new File([jpegBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                  type: 'image/jpeg',
                  lastModified: Date.now()
                });

                URL.revokeObjectURL(objectUrl);
                resolve({
                  compressedFile,
                  previewUrl,
                  originalSize: file.size,
                  compressedSize: compressedFile.size,
                  width,
                  height
                });
              });
            }
          })
          .catch((err) => {
            // Fallback directly to JPEG in case of error in WebP pipeline
            tryExport('image/jpeg', 0.80)
              .then((jpegBlob) => {
                const previewUrl = URL.createObjectURL(jpegBlob);
                const compressedFile = new File([jpegBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                  type: 'image/jpeg',
                  lastModified: Date.now()
                });

                URL.revokeObjectURL(objectUrl);
                resolve({
                  compressedFile,
                  previewUrl,
                  originalSize: file.size,
                  compressedSize: compressedFile.size,
                  width,
                  height
                });
              })
              .catch((jpegErr) => {
                URL.revokeObjectURL(objectUrl);
                reject(jpegErr);
              });
          });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image. Please choose another file.'));
    };

    img.src = objectUrl;
  });
}

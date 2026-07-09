import { REAL_ASSETS } from '../config/assets';

/**
 * Resolves a media path or database reference to a reliable, optimized absolute URL
 * for frontend rendering. Handles local assets, raw absolute URLs, temporary blobs,
 * and uploaded server media paths.
 * 
 * @param input The relative path, absolute URL, blob URI, or empty value to resolve.
 * @param fallback Optional custom fallback URL to return if the input is empty.
 * @returns The resolved absolute URL or relative path.
 */
export function resolveMediaUrl(input?: string | null, fallback?: string): string {
  if (!input || input.trim() === '') {
    return fallback || '';
  }

  // Raw absolute URLs (http:// or https://) are returned as-is
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }

  // Temporary blob URIs (useful for instant preview before form upload) are returned as-is
  if (input.startsWith('blob:')) {
    return input;
  }

  // Determine the API base URL from Vite environment variables
  let apiBaseUrl = '';
  try {
    apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
  } catch {
    apiBaseUrl = ((import.meta as any).env?.VITE_API_BASE_URL || '').trim();
  }

  // In local development or container preview where apiBaseUrl is not explicitly configured,
  // we fallback to the current page origin so media files are requested from the same container.
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalOrPreview =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.run.app') ||
      hostname.endsWith('.google.com') ||
      hostname.endsWith('.googleusercontent.com');

    if (isLocalOrPreview && !apiBaseUrl) {
      apiBaseUrl = window.location.origin;
    }
  }

  const cleanBase = apiBaseUrl ? apiBaseUrl.replace(/\/+$/, '') : '';
  const cleanInput = input.replace(/^\/+/, '');

  // Prepend API base URL for uploaded media or assets served by the backend
  if (cleanInput.startsWith('uploads/') || cleanInput.startsWith('media/') || cleanInput.startsWith('api/')) {
    if (cleanBase) {
      return `${cleanBase}/${cleanInput}`;
    }
    return `/${cleanInput}`;
  }

  // Native public/assets of the frontend should be requested relatively from the client origin
  if (cleanInput.startsWith('assets/') || cleanInput.startsWith('images/') || cleanInput.startsWith('public/')) {
    return `/${cleanInput}`;
  }

  // Default to appending to backend base if available, otherwise return relative path
  if (cleanBase) {
    return `${cleanBase}/${cleanInput}`;
  }
  return `/${cleanInput}`;
}

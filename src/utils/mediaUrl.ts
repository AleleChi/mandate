import { REAL_ASSETS } from '../config/assets';

// Proof string as required by Phase 3 rules
export const SAFE_MEDIA_URL_RESOLVER_VERSION = "safe-media-url-resolver-v3-secure";

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
  // Rule 1: If input is empty/null/undefined: return fallback
  if (!input || input.trim() === '') {
    return fallback || '';
  }

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // Rule 7: Prevent path traversal
  if (
    trimmed.includes('../') || 
    trimmed.includes('..\\') || 
    trimmed.includes('%2e%2e') || 
    lower.includes('..%2f') || 
    lower.includes('%2e%2e%2f')
  ) {
    console.warn('[media-security] Path traversal attempt blocked:', trimmed);
    return fallback || '';
  }

  // Rule 6: Never render or persist dangerous protocols, localhost in production, or raw server filesystem paths
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.includes('/tmp') ||
    lower.includes('c:\\') ||
    lower.includes('googleusercontent.com/translate') || // Google temporary translation/AI studio proxy
    (lower.includes('localhost') && process.env.NODE_ENV === 'production')
  ) {
    console.warn('[media-security] Malicious or unsafe URL protocol/path blocked:', trimmed);
    return fallback || '';
  }

  // Rule 2: If input starts with https:// or http://: allow only safe http/https URL and return as-is
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Temporary blob URIs are returned as-is
  if (trimmed.startsWith('blob:')) {
    return trimmed;
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
  const cleanInput = trimmed.replace(/^\/+/, '');

  // Rule 3 & 4: If input starts with /uploads, uploads/, api/, or media/: prefix backend API origin
  if (
    cleanInput.startsWith('uploads/') || 
    cleanInput.startsWith('media/') || 
    cleanInput.startsWith('api/')
  ) {
    if (cleanBase) {
      return `${cleanBase}/${cleanInput}`;
    }
    return `/${cleanInput}`;
  }

  // Rule 5: If input is a committed public/static frontend asset (assets/, images/, public/)
  if (cleanInput.startsWith('assets/') || cleanInput.startsWith('images/') || cleanInput.startsWith('public/')) {
    return `/${cleanInput}`;
  }

  // Default to appending to backend base if available, otherwise return relative path
  if (cleanBase) {
    return `${cleanBase}/${cleanInput}`;
  }
  return `/${cleanInput}`;
}

import { getApiBaseUrl } from './urlHelper';

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
/**
 * Detects whether a URL or path is a static bundled frontend asset
 * (e.g. Vite dev or build imported asset, public folder asset, data/blob URI).
 * Static bundled assets must NEVER be passed through backend API prefixing.
 */
export function isStaticBundledAsset(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed === '') return false;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return true;

  const clean = trimmed.replace(/^\/+/, '');
  const lower = clean.toLowerCase();

  return (
    lower.startsWith('src/') ||
    lower.startsWith('assets/') ||
    lower.startsWith('@fs/') ||
    lower.startsWith('@id/') ||
    lower.startsWith('@vite/') ||
    lower.startsWith('node_modules/') ||
    lower.startsWith('images/') ||
    lower.startsWith('public/') ||
    lower.startsWith('favicon') ||
    lower.startsWith('social_share') ||
    lower.startsWith('apple-touch-icon') ||
    lower.startsWith('android-chrome') ||
    lower.startsWith('icon-') ||
    lower.startsWith('site.webmanifest') ||
    lower.startsWith('koinonia-logo') ||
    lower.startsWith('parent_hero') ||
    lower.startsWith('volunteer_hero') ||
    lower.includes('parent_hero_') ||
    lower.includes('volunteer_hero_') ||
    lower.includes('koinonia-logo') ||
    lower.includes('social_share')
  );
}

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

  // A. STATIC BUNDLED ASSETS: Return directly as frontend asset path without backend URL manipulation
  if (isStaticBundledAsset(trimmed)) {
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:') || trimmed.startsWith('data:') || trimmed.startsWith('/')
      ? trimmed
      : `/${trimmed}`;
  }

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

  // Dangerous protocols, localhost in production, or raw server filesystem paths
  // Note: blob: and data: are legitimate frontend media URIs and allowed.
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('file:') ||
    lower.includes('/tmp') ||
    lower.includes('c:\\') ||
    lower.includes('googleusercontent.com/translate') || // Google temporary translation/AI studio proxy
    (lower.includes('localhost') && process.env.NODE_ENV === 'production')
  ) {
    console.warn('[media-security] Malicious or unsafe URL protocol/path blocked:', trimmed);
    return fallback || '';
  }

  // B. ABSOLUTE REMOTE URLS: Leave unchanged (http://, https://, including Cloudinary)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Temporary blob URIs and data URIs are returned as-is
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  const cleanInput = trimmed.replace(/^\/+/, '');

  // Determine the API base URL from Vite environment variables or urlHelper
  let apiBaseUrl = getApiBaseUrl();

  // In local development or container preview where apiBaseUrl is not explicitly configured,
  // we fallback to the current page origin so media files are requested from the same container.
  if (typeof window !== 'undefined' && !apiBaseUrl) {
    const hostname = window.location.hostname;
    const isLocalOrPreview =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.run.app') ||
      hostname.endsWith('.google.com') ||
      hostname.endsWith('.googleusercontent.com');

    if (isLocalOrPreview) {
      apiBaseUrl = window.location.origin;
    }
  }

  const cleanBase = apiBaseUrl ? apiBaseUrl.replace(/\/+$/, '') : '';

  // C. BACKEND MEDIA PATHS: Only backend-owned media paths receive API base
  const isBackendMedia =
    cleanInput.startsWith('api/media/') ||
    cleanInput.startsWith('media/') ||
    cleanInput.startsWith('uploads/') ||
    cleanInput.startsWith('api/');

  if (isBackendMedia) {
    return cleanBase ? `${cleanBase}/${cleanInput}` : `/${cleanInput}`;
  }

  // UUID or media prefix reference (e.g. child/parent photo ID saved without full path)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanInput);
  const isMediaPrefix = /^(media|photo|file)[-_][a-zA-Z0-9_-]+/i.test(cleanInput);
  if (!cleanInput.includes('/') && (isUuid || isMediaPrefix)) {
    const apiPath = `api/media/files/${cleanInput}`;
    return cleanBase ? `${cleanBase}/${apiPath}` : `/${apiPath}`;
  }

  // Default: Frontend-local relative path (never prefix API base to unknown local paths)
  return `/${cleanInput}`;
}

/**
 * Injects responsive width and automatic compression/format (q_auto, f_auto)
 * into Cloudinary image delivery URLs without modifying other media providers.
 */
export function getOptimizedThumbnailUrl(input?: string | null, width = 500): string {
  const resolved = resolveMediaUrl(input);
  if (!resolved) return '';

  // Only transform Cloudinary URLs
  if (resolved.includes('res.cloudinary.com') && resolved.includes('/image/upload/')) {
    // Avoid double-transforming
    if (resolved.includes('/w_') && resolved.includes('q_auto')) {
      return resolved;
    }
    const transform = `w_${width},c_limit,q_auto,f_auto`;
    return resolved.replace('/image/upload/', `/image/upload/${transform}/`);
  }

  return resolved;
}


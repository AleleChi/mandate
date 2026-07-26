import { URL } from 'url';

/**
 * Server-side Canonical Public Application URL Helper
 *
 * Resolves the canonical public application base URL from environment variables.
 * Priority: PUBLIC_APP_URL -> APP_BASE_URL -> APP_URL
 */
export function getPublicAppUrl(): string {
  let rawUrl = (
    process.env.PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    process.env.APP_URL ||
    ''
  ).trim();

  const isProduction = process.env.NODE_ENV === 'production';

  if (!rawUrl) {
    if (isProduction) {
      console.error('[URL Helper] CRITICAL: Neither PUBLIC_APP_URL nor APP_BASE_URL is configured in production environment!');
      throw new Error('PUBLIC_APP_URL environment variable is required in production mode.');
    }
    rawUrl = 'http://localhost:3000';
  }

  // Strip trailing slash
  rawUrl = rawUrl.replace(/\/+$/, '');

  // Strict URL Validation
  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported protocol "${parsed.protocol}" in PUBLIC_APP_URL.`);
    }

    if (parsed.username || parsed.password) {
      throw new Error('PUBLIC_APP_URL must not contain authentication credentials (username or password).');
    }

    if (isProduction && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      console.error('[URL Helper] WARNING: PUBLIC_APP_URL is pointing to localhost in production mode!');
    }

    return `${parsed.protocol}//${parsed.host}`;
  } catch (err: any) {
    if (isProduction) {
      console.error('[URL Helper] Invalid PUBLIC_APP_URL configuration in production:', rawUrl, err?.message);
      throw new Error(`Invalid PUBLIC_APP_URL configuration: ${err?.message || 'Malformed URL'}`);
    }
    return 'http://localhost:3000';
  }
}

/**
 * Validates public URL configuration on server startup.
 * Logs configuration or throws an explicit error in production if misconfigured.
 */
export function validatePublicAppUrlOnStartup(): string {
  try {
    const publicUrl = getPublicAppUrl();
    console.log(`[URL Config] Canonical Public App URL initialized: ${publicUrl}`);
    return publicUrl;
  } catch (err: any) {
    console.error(`[URL Config Error] ${err.message}`);
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
    return 'http://localhost:3000';
  }
}

/**
 * Builds a safe public application URL by joining the canonical origin with an approved relative route.
 *
 * Example:
 * buildPublicAppUrl('/admin/incidents/123')
 * => 'https://koinonia12.netlify.app/#/admin/incidents/123'
 */
export function buildPublicAppUrl(path?: string): string {
  const origin = getPublicAppUrl();

  if (!path || !path.trim()) {
    return origin;
  }

  const cleanPath = path.trim();

  // Security Check 1: Block scripting / data protocols
  if (
    cleanPath.toLowerCase().startsWith('javascript:') ||
    cleanPath.toLowerCase().startsWith('data:') ||
    cleanPath.toLowerCase().startsWith('vbscript:') ||
    cleanPath.includes('\r') ||
    cleanPath.includes('\n')
  ) {
    console.error('[URL Helper] Security alert: Invalid protocol or line break injection in path:', path);
    return origin;
  }

  // Security Check 2: Block absolute external URLs (Open Redirect Protection)
  if (/^https?:\/\//i.test(cleanPath)) {
    console.error('[URL Helper] Security alert: Absolute external URL rejected in buildPublicAppUrl:', path);
    return origin;
  }

  // Security Check 3: Ensure path starts with / and no double slashes
  let normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  normalizedPath = normalizedPath.replace(/^\/{2,}/, '/');

  // Security Check 4: Block /api endpoints from being formatted as public frontend links
  if (normalizedPath.startsWith('/api/') || normalizedPath === '/api') {
    console.error('[URL Helper] Security alert: API route rejected from frontend link generation:', path);
    return origin;
  }

  // If already hash-formatted (e.g., /#/admin/incidents)
  if (normalizedPath.startsWith('/#')) {
    return `${origin}${normalizedPath}`;
  }

  // Single SPA Hash route join
  return `${origin}/#${normalizedPath}`;
}

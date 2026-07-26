/**
 * Canonical helper to retrieve the configured API base URL.
 * Reads VITE_API_BASE_URL safely from import.meta.env.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalOrPreview =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.run.app') ||
      hostname.endsWith('.google.com') ||
      hostname.endsWith('.googleusercontent.com');

    if (isLocalOrPreview) {
      return '';
    }
  }

  let url = '';
  try {
    url = (import.meta.env.VITE_API_BASE_URL || '').trim();
  } catch {
    url = ((import.meta as any).env?.VITE_API_BASE_URL || '').trim();
  }
  return url.replace(/\/+$/, '');
}

/**
 * Canonical helper to safely build full API URLs.
 * Joins the API base URL and endpoint path without duplicate slashes or duplicated /api segments.
 *
 * Examples:
 * - VITE_API_BASE_URL="https://mandate-2i7u.onrender.com", endpoint="/api/v1/auth/me"
 *   => "https://mandate-2i7u.onrender.com/api/v1/auth/me"
 * - VITE_API_BASE_URL="https://mandate-2i7u.onrender.com/api", endpoint="/api/v1/auth/me"
 *   => "https://mandate-2i7u.onrender.com/api/v1/auth/me"
 * - VITE_API_BASE_URL="", endpoint="/api/v1/auth/me"
 *   => "/api/v1/auth/me"
 */
export function buildApiUrl(endpoint: string): string {
  if (!endpoint) return '';

  // If endpoint is already a full absolute HTTP/HTTPS URL, return as-is
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }

  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (!baseUrl) {
    return cleanEndpoint;
  }

  // Prevent duplicate /api/api/ segments if baseUrl already ends with /api and endpoint starts with /api/
  if (baseUrl.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
    return `${baseUrl}${cleanEndpoint.slice(4)}`;
  }

  return `${baseUrl}${cleanEndpoint}`;
}

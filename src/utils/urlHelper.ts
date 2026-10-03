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

/**
 * Canonical helper for frontend parent status URL (HashRouter)
 */
export function buildFrontendParentStatusUrl(childId?: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (childId && childId.trim()) {
    return `${origin}/#/parent/children/${encodeURIComponent(childId.trim())}/status`;
  }
  return `${origin}/#/parent/status`;
}

/**
 * Canonical helper for frontend parent passes URL (HashRouter)
 */
export function buildFrontendParentPassUrl(childId?: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (childId && childId.trim()) {
    return `${origin}/#/parent/children/${encodeURIComponent(childId.trim())}/pass`;
  }
  return `${origin}/#/parent/passes`;
}

export interface RecipientTokenContext {
  parentName?: string;
  childName?: string;
  volunteerName?: string;
  team?: string;
  location?: string;
  eventName?: string;
  passUrl?: string;
  reviewUrl?: string;
  pickupTime?: string;
  supportContact?: string;
}

/**
 * Resolves communication tokens against recipient context.
 * Shared implementation with server urlHelper.
 */
export function resolveMessageTokens(template: string, context: RecipientTokenContext): string {
  if (!template) return '';
  const pName = (context.parentName || '').trim() || 'Parent';
  const cName = (context.childName || '').trim() || 'your child';
  const vName = (context.volunteerName || '').trim() || 'Volunteer';
  const vTeam = (context.team || '').trim() || 'Assigned Team';
  const vLoc = (context.location || '').trim();
  const eName = (context.eventName || '').trim() || 'The General Assembly';
  const pLink = context.passUrl || buildFrontendParentPassUrl();
  const rLink = context.reviewUrl || buildFrontendParentStatusUrl();
  const pTime = (context.pickupTime || '').trim() || '4:00 PM';
  const sContact = (context.supportContact || '').trim() || '+234 803 123 4567';

  let result = template
    .replace(/\{Parent name\}/gi, pName)
    .replace(/\{Child name\}/gi, cName)
    .replace(/\{Volunteer name\}/gi, vName)
    .replace(/\{Team\}/gi, vTeam)
    .replace(/\{Event name\}/gi, eName)
    .replace(/\{Pass link\}/gi, pLink)
    .replace(/\{Review link\}/gi, rLink)
    .replace(/\{Pickup time\}/gi, pTime)
    .replace(/\{Support contact\}/gi, sContact);

  if (vLoc) {
    result = result.replace(/\{Location\}/gi, vLoc);
  }

  return result;
}

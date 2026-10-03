import { buildApiUrl } from './urlHelper';

export function updateDocumentFavicon(customFaviconUrl?: string | null, updatedAt?: string | number) {
  if (typeof document === 'undefined') return;

  const versionTag = updatedAt ? `?v=${updatedAt}` : `?v=${Date.now()}`;

  if (customFaviconUrl && customFaviconUrl.trim() !== '') {
    const safeUrl = buildApiUrl(customFaviconUrl.trim());
    const versionedUrl = safeUrl.includes('?') ? `${safeUrl}&v=${updatedAt || Date.now()}` : `${safeUrl}${versionTag}`;

    const icon32 = (document.getElementById('favicon-32') as HTMLLinkElement) || document.querySelector('link[sizes="32x32"]');
    if (icon32) icon32.href = versionedUrl;

    const icon16 = (document.getElementById('favicon-16') as HTMLLinkElement) || document.querySelector('link[sizes="16x16"]');
    if (icon16) icon16.href = versionedUrl;

    const iconApple = (document.getElementById('favicon-apple') as HTMLLinkElement) || document.querySelector('link[rel="apple-touch-icon"]');
    if (iconApple) iconApple.href = versionedUrl;

    const iconIco = (document.getElementById('favicon-ico') as HTMLLinkElement) || document.querySelector('link[rel="shortcut icon"]');
    if (iconIco) iconIco.href = versionedUrl;
  } else {
    // Reset to static bundled bird mark assets
    const icon32 = document.getElementById('favicon-32') as HTMLLinkElement;
    if (icon32) icon32.href = '/favicon-32x32.png';

    const icon16 = document.getElementById('favicon-16') as HTMLLinkElement;
    if (icon16) icon16.href = '/favicon-16x16.png';

    const iconApple = document.getElementById('favicon-apple') as HTMLLinkElement;
    if (iconApple) iconApple.href = '/apple-touch-icon.png';

    const iconIco = document.getElementById('favicon-ico') as HTMLLinkElement;
    if (iconIco) iconIco.href = '/favicon.ico';
  }
}

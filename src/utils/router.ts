import { AppRoute } from '../types';

export const isValidRoute = (route: string): boolean => {
  if (!route) return false;
  const cleanRoute = route.split('?')[0];
  if (cleanRoute.startsWith('/parent/status/')) return true;
  if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/status')) return true;
  if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/edit')) return true;
  if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/pass')) return true;
  if (cleanRoute.startsWith('/volunteer/')) return true;
  if (cleanRoute.startsWith('/admin/')) return true;
  if (cleanRoute === '/admin') return true;
  if (cleanRoute === '/parent/volunteer-request') return true;
  if (cleanRoute.startsWith('/duty/location/')) return true;
  if (cleanRoute.startsWith('/duty/scan/')) return true;
  if (cleanRoute.startsWith('/event-duty/location-access/')) return true;
  const validRoutes: string[] = [
    '/',
    '/parent/create-account',
    '/parent/check-email',
    '/parent/verify-email',
    '/parent/sign-in',
    '/parent/forgot-password',
    '/parent/new-password',
    '/parent/profile-setup',
    '/parent/profile/edit',
    '/parent/home',
    '/parent/profile',
    '/parent/children',
    '/parent/children/new',
    '/parent/children/new/care-details',
    '/parent/children/new/health-and-support',
    '/parent/children/new/health-and-care',
    '/parent/children/new/pickup-person',
    '/parent/children/new/review',
    '/parent/children/review-sent',
    '/parent/status',
    '/parent/passes',
    '/admin/sign-in',
    '/admin/forgot-password',
    '/admin/reset-password',
    '/admin/overview',
    '/admin/settings',
    '/admin/applications',
    '/admin/accept-invite',
    '/admin/wristbands',
    '/admin/wristbands/inventory',
    '/volunteer/wristbands',
    '/privacy',
    '/terms',
    '/child-safety',
    '/contact'
  ];
  return validRoutes.includes(cleanRoute);
};

export const getInitialRoute = (): AppRoute => {
  if (typeof window === 'undefined') return '/';
  const pathname = window.location.pathname || '';
  let hash = (window.location.hash || '').replace(/^#+/, '');
  if (hash && !hash.startsWith('/')) hash = '/' + hash;

  // 1. Pathname takes precedence if valid
  if (pathname && pathname !== '/' && isValidRoute(pathname)) {
    return pathname.split('?')[0] as AppRoute;
  }

  // 2. Legacy hash fallback if pathname is root
  if (hash) {
    const [hashRoute] = hash.split('?');
    if (isValidRoute(hashRoute)) {
      return hashRoute as AppRoute;
    }
  }

  return '/';
};

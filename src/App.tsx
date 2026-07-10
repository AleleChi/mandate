/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AppRoute, ChildItem, ParentProfile } from './types';
import { initialChildren, initialParentProfile } from './data/mockData';
import { api, extractApiError } from './services/api';
import { useNotification } from './context/NotificationContext';
import { LandingPage } from './views/LandingPage';
import { CreateAccountView } from './views/CreateAccountView';
import { CheckEmailView } from './views/CheckEmailView';
import { VerifyEmailView } from './views/VerifyEmailView';
import { SignInView } from './views/SignInView';
import { ForgotPasswordView } from './views/ForgotPasswordView';
import { NewPasswordView } from './views/NewPasswordView';
import { ProfileSetupView } from './views/ProfileSetupView';
import { ParentHomeView } from './views/ParentHomeView';
import { VolunteerSignInView } from './views/VolunteerSignInView';
import { VolunteerCreateAccountView } from './views/VolunteerCreateAccountView';
import { VolunteerVerifyEmailView } from './views/VolunteerVerifyEmailView';
import { VolunteerForgotPasswordView } from './views/VolunteerForgotPasswordView';
import { VolunteerResetPasswordView } from './views/VolunteerResetPasswordView';
import { VolunteerPendingReviewView } from './views/VolunteerPendingReviewView';
import { VolunteerEventDashboardView } from './views/VolunteerEventDashboardView';
import { VolunteerRequestView } from './views/VolunteerRequestView';
import { AddChildStep1View } from './views/AddChildStep1View';
import { AddChildStep2View } from './views/AddChildStep2View';
import { AddChildStep3View } from './views/AddChildStep3View';
import { AddChildStep4View } from './views/AddChildStep4View';
import { AddChildStep5View } from './views/AddChildStep5View';
import { ReviewSentConfirmationView } from './views/ReviewSentConfirmationView';
import { ChildStatusView } from './views/ChildStatusView';
import { DevNavigator } from './components/common/DevNavigator';
import { AddChildDraft } from './types';
import { Button } from './components/common/Button';
import { AppPreloader } from './components/common/AppPreloader';
import { KoinoniaInlineLoader } from './components/common/KoinoniaInlineLoader';
import { safeStorage } from './utils/storage';

import { AdminSignInView } from './views/admin/AdminSignInView';
import { AdminForgotPasswordView } from './views/admin/AdminForgotPasswordView';
import { AdminResetPasswordView } from './views/admin/AdminResetPasswordView';
import { AdminOverviewView } from './views/admin/AdminOverviewView';
import { AdminAcceptInviteView } from './views/admin/AdminAcceptInviteView';
import { Seo } from './components/common/Seo';

const getSeoPropsForRoute = (route: string) => {
  const cleanRoute = route.split('?')[0];

  // Note: '/' is handled directly inside LandingPage.tsx for deep landing page metadata
  if (cleanRoute === '/') {
    return null;
  }

  // Safe defaults
  const defaults = {
    robots: 'noindex, nofollow',
  };

  // Auth & Private Route Titles
  if (cleanRoute === '/parent/sign-in') {
    return {
      title: 'Parent Sign In | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute === '/parent/create-account') {
    return {
      title: 'Create Parent Account | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute === '/parent/check-email') {
    return {
      title: 'Verify Your Inbox | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute === '/parent/verify-email') {
    return {
      title: 'Email Verification | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute === '/parent/forgot-password') {
    return {
      title: 'Reset Parent Password | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute === '/parent/new-password') {
    return {
      title: 'Choose New Password | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute.startsWith('/parent')) {
    return {
      title: 'Parent Access | Koinonia Children and Teens',
      ...defaults,
    };
  }

  // Volunteer Routes
  if (cleanRoute === '/volunteer/sign-in') {
    return {
      title: 'Volunteer Sign In | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute === '/volunteer/create-account') {
    return {
      title: 'Volunteer Account Creation | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute === '/volunteer/forgot-password') {
    return {
      title: 'Reset Volunteer Password | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute === '/volunteer/reset-password') {
    return {
      title: 'Choose New Volunteer Password | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute.startsWith('/volunteer')) {
    return {
      title: 'Volunteer Operations | Koinonia Children and Teens',
      ...defaults,
    };
  }

  // Admin Routes
  if (cleanRoute === '/admin/sign-in') {
    return {
      title: 'Admin Sign In | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute === '/admin/forgot-password') {
    return {
      title: 'Reset Administrator Password | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute === '/admin/reset-password') {
    return {
      title: 'Choose New Administrator Password | Koinonia Children and Teens',
      ...defaults,
    };
  }
  if (cleanRoute.startsWith('/admin')) {
    return {
      title: 'Admin Command Center | Koinonia Children and Teens',
      ...defaults,
    };
  }

  // Fallback for other unrecognized paths
  return {
    title: 'Koinonia Children and Teens',
    ...defaults,
  };
};

function normalizeParentProfile(p: any): ParentProfile {
  if (!p) return initialParentProfile;
  return {
    fullName: p.fullName || p.full_name || '',
    email: p.email || '',
    phone: p.phone || p.phone_number || '',
    phoneNumber: p.phone || p.phone_number || '',
    whatsapp: p.whatsapp || p.whatsapp_number || p.phone_number || p.phone || '',
    whatsappNumber: p.whatsapp || p.whatsapp_number || p.phone_number || p.phone || '',
    homeAddress: p.homeAddress || p.home_address || '',
    country: p.country || '',
    stateRegion: p.stateRegion || p.state_region || '',
    city: p.city || '',
    preferredContact: p.preferredContact || p.preferred_contact || 'WhatsApp',
    isWorker: p.isWorker !== undefined ? Boolean(p.isWorker) : Boolean(p.is_koinonia_worker),
    department: p.department || '',
    photoFileId: p.photoFileId || p.photo_file_id || '',
    photoUrl: p.photoUrl || p.photo_url || '',
    profileCompletedAt: p.profileCompletedAt || p.profile_completed_at || null
  };
}

export default function App() {
  const { showSuccess, showError, showWarning } = useNotification();
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('/');
  const [parentEmail, setParentEmail] = useState<string>('');
  const [parentProfile, setParentProfile] = useState<ParentProfile>(initialParentProfile);
  const [volunteerProfile, setVolunteerProfile] = useState<any>(null);
  const [childrenList, setChildrenList] = useState<ChildItem[]>(initialChildren);
  const [activeEvent, setActiveEvent] = useState<any>(null);
  const [isMobileLandingView, setIsMobileLandingView] = useState<boolean>(false);
  const [addChildDraft, setAddChildDraft] = useState<AddChildDraft | null>(null);
  const [lastSubmittedChild, setLastSubmittedChild] = useState<ChildItem | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [showPreloader, setShowPreloader] = useState<boolean>(true);

  // Sync route with URL hash for easy browser bookmarking/testing
  useEffect(() => {
    const handleHashChange = () => {
      let hash = window.location.hash;
      // Strip all leading '#' and ensure there is exactly one leading '/'
      hash = hash.replace(/^#+/, '');
      if (!hash.startsWith('/')) {
        hash = '/' + hash;
      }
      const [routePath] = hash.split('?');
      if (routePath && isValidRoute(routePath)) {
        setCurrentRoute(routePath as AppRoute);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const isProfileComplete = (p: ParentProfile | null | undefined): boolean => {
    if (!p) return false;
    const name = p.fullName || (p as any).full_name;
    const phone = p.phone || (p as any).phone_number || (p as any).phone;
    if (!name || !name.trim()) return false;
    if (!phone || !phone.trim()) return false;
    return true;
  };

  const [user, setUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  const checkAuth = async () => {
    const token = api.getToken();
    if (!token) {
      setUser(null);
      setParentProfile(initialParentProfile);
      setVolunteerProfile(null);
      setChildrenList([]);
      setIsCheckingAuth(false);
      return;
    }

    try {
      const accessData = await api.auth.getAccess();
      if (accessData && accessData.user) {
        setUser(accessData.user);

        if (accessData.access.parent && accessData.access.parent.exists) {
          try {
            const homeData = await api.parent.getHome();
            if (homeData) {
              if (homeData.parentProfile) {
                setParentProfile(normalizeParentProfile(homeData.parentProfile));
                setParentEmail(homeData.parentProfile.email || '');
              }
              if (homeData.activeEvent) {
                setActiveEvent(homeData.activeEvent);
              }
              if (Array.isArray(homeData.childrenList)) {
                setChildrenList(homeData.childrenList);
                const activeId = safeStorage.getItem('koinonia_active_draft_id');
                if (activeId) {
                  const matched = homeData.childrenList.find((c) => c.id === activeId);
                  if (matched && matched.draftData) {
                    setAddChildDraft(matched.draftData);
                  }
                }
              }
            }
          } catch (e) {
            console.error('Failed to load initial home data:', e);
          }
        }

        if (accessData.access.volunteer && accessData.access.volunteer.exists) {
          try {
            const volMe = await api.volunteer.getMe() as any;
            if (volMe) {
              setVolunteerProfile(volMe.profile || volMe.volunteerProfile);
            }
          } catch (e) {
            console.error('Failed to load initial volunteer profile:', e);
          }
        } else {
          setVolunteerProfile(null);
        }
      } else {
        api.clearToken();
        setUser(null);
        setParentProfile(initialParentProfile);
        setVolunteerProfile(null);
        setChildrenList([]);
      }
    } catch (err) {
      console.error('Initial checkAuth failed:', err);
      api.clearToken();
      setUser(null);
      setParentProfile(initialParentProfile);
      setVolunteerProfile(null);
      setChildrenList([]);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const fetchBackendData = async () => {
    if (api.getToken() && user) {
      const isParentRoute = currentRoute.startsWith('/parent');
      const hasParentRole = user.role === 'parent';
      if (!hasParentRole && !isParentRoute) {
        return;
      }

      try {
        const homeData = await api.parent.getHome();
        if (homeData && homeData.parentProfile) {
          setParentProfile(normalizeParentProfile(homeData.parentProfile));
          setParentEmail(homeData.parentProfile.email || '');
          if (homeData.activeEvent) {
            setActiveEvent(homeData.activeEvent);
          }
          if (Array.isArray(homeData.childrenList)) {
            setChildrenList(homeData.childrenList);
            const activeId = safeStorage.getItem('koinonia_active_draft_id');
            if (activeId) {
              const matched = homeData.childrenList.find((c) => c.id === activeId);
              if (matched && matched.draftData) {
                setAddChildDraft(matched.draftData);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load home data:', err);
      }
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    fetchBackendData();
  }, [currentRoute, user]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      showSuccess('Back online.', 'Updating your information...');
      fetchBackendData();
    };
    const handleOffline = () => {
      setIsOffline(true);
      const role = user?.role || 'parent';
      if (role === 'admin') {
        showWarning('You are offline.', 'Please reconnect before making changes.');
      } else if (role === 'staff' || role === 'volunteer') {
        showWarning('You are offline.', 'Scanning may be limited until connection returns.');
      } else {
        showWarning('You are offline.', 'Some updates will appear when your connection returns.');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  const isValidRoute = (route: string): boolean => {
    const cleanRoute = route.split('?')[0];
    if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/status')) return true;
    if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/edit')) return true;
    if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/pass')) return true;
    if (cleanRoute.startsWith('/volunteer/')) return true;
    if (cleanRoute.startsWith('/admin/')) return true;
    if (cleanRoute === '/admin') return true;
    if (cleanRoute === '/parent/volunteer-request') return true;
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
      '/admin/accept-invite'
    ];
    return validRoutes.includes(cleanRoute);
  };

  const navigate = (route: AppRoute | string) => {
    const [routePath] = route.split('?');
    setCurrentRoute(routePath as AppRoute);
    window.location.hash = route;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddChild = (newChild: ChildItem) => {
    setChildrenList((prev) => [newChild, ...prev]);
  };

  const handleSignOut = async () => {
    try {
      await api.auth.signOut();
    } catch (e) {
      console.error('Sign out error:', e);
    }
    setUser(null);
    setParentProfile(initialParentProfile);
    setVolunteerProfile(null);
    setChildrenList([]);
    setAddChildDraft(null);
    safeStorage.removeItem('koinonia_active_draft_id');
    navigate('/');
    showSuccess('Signed out', 'You have been successfully signed out.');
  };

  const handleSaveDraft = async (draft: AddChildDraft, isFinishLater?: boolean) => {
    setAddChildDraft(draft);
    if (draft.id) {
      safeStorage.setItem('koinonia_active_draft_id', draft.id);
    }
    if (api.getToken()) {
      try {
        const savedChild = await api.parent.saveChildDraft(draft, draft.id);
        if (savedChild && savedChild.id) {
          draft.id = savedChild.id;
          safeStorage.setItem('koinonia_active_draft_id', savedChild.id);
          if (savedChild.draftData) setAddChildDraft(savedChild.draftData);
          setChildrenList((prev) => {
            const existingIdx = prev.findIndex((c) => c.id === savedChild.id);
            if (existingIdx !== -1) {
              const copy = [...prev];
              copy[existingIdx] = savedChild;
              return copy;
            }
            return [savedChild, ...prev];
          });
          if (isFinishLater) {
            showSuccess('Progress saved', 'You can continue later from Home.');
          } else {
            showSuccess('Progress saved');
          }
        }
      } catch (e: any) {
        console.error('Failed to save draft to backend:', e);
        if (isFinishLater) {
          showError('Something went wrong', 'We could not save your progress.');
        }
      }
    } else if (isFinishLater) {
      const name = (draft.childDetails?.fullName || draft.fullName || '').trim();
      if (name && name !== '') {
        const ageVal = draft.childDetails?.calculatedAge !== undefined ? draft.childDetails.calculatedAge : draft.age;
        const ageGroupVal = draft.childDetails?.ageGroup || draft.ageGroup || 'Not specified';
        const photoVal = draft.childDetails?.photo || draft.photoUrl || '';

        const draftChild: ChildItem = {
          id: draft.id || `child-${Date.now()}`,
          name: name,
          age: ageVal !== null && ageVal !== undefined ? ageVal : 0,
          ageGroup: ageGroupVal,
          status: 'Incomplete',
          statusNote: 'Continue entering child details',
          photoUrl: photoVal,
          draftData: {
            ...draft,
            review: {
              ...draft.review,
              status: 'Incomplete'
            }
          }
        };
        setChildrenList((prev) => {
          const existingIdx = prev.findIndex((c) => c.id === draftChild.id);
          if (existingIdx !== -1) {
            const copy = [...prev];
            copy[existingIdx] = draftChild;
            return copy;
          }
          return [draftChild, ...prev];
        });
      }
      showSuccess('Progress saved', 'You can continue later from Home.');
    }
  };

  const handleSubmitReview = async (draft: AddChildDraft): Promise<boolean> => {
    const name = (draft.childDetails?.fullName || draft.fullName || 'Untitled Child').trim();
    const ageVal = draft.childDetails?.calculatedAge !== undefined ? draft.childDetails.calculatedAge : draft.age;
    const ageGroupVal = draft.childDetails?.ageGroup || draft.ageGroup || 'Not specified';
    const photoVal = draft.childDetails?.photo || draft.photoUrl || '';

    safeStorage.removeItem('koinonia_active_draft_id');

    if (api.getToken() && draft.id) {
      try {
        const response = await api.parent.submitChildReview(draft.id, draft);
        const reviewedChild = {
          ...response,
          status: 'Under review',
          id: response.id || response.childId || draft.id
        };
        setLastSubmittedChild(reviewedChild);
        setChildrenList((prev) => {
          const existingIdx = prev.findIndex((c) => c.id === reviewedChild.id);
          if (existingIdx !== -1) {
            const copy = [...prev];
            copy[existingIdx] = reviewedChild;
            return copy;
          }
          return [reviewedChild, ...prev];
        });
        setAddChildDraft(null);
        showSuccess('Details sent for review', 'You can follow the child’s status from Home.');
        return true;
      } catch (e: any) {
        console.error('Submit review error:', e);
        throw e;
      }
    }

    const reviewedChild: ChildItem = {
      id: draft.id || `child-${Date.now()}`,
      name: name,
      age: ageVal !== null && ageVal !== undefined ? ageVal : 0,
      ageGroup: ageGroupVal,
      status: 'Under review',
      statusNote: 'Details sent for review',
      photoUrl: photoVal,
      submittedAt: draft.review?.submittedAt || new Date().toISOString(),
      draftData: {
        ...draft,
        review: {
          detailsConfirmed: true,
          submittedAt: draft.review?.submittedAt || new Date().toISOString(),
          status: 'Under review'
        }
      }
    };
    setLastSubmittedChild(reviewedChild);
    setChildrenList((prev) => {
      const existingIdx = prev.findIndex((c) => c.id === reviewedChild.id);
      if (existingIdx !== -1) {
        const copy = [...prev];
        copy[existingIdx] = reviewedChild;
        return copy;
      }
      return [reviewedChild, ...prev];
    });
    setAddChildDraft(null);
    showSuccess('Details sent for review', 'You can follow the child’s status from Home.');
    return true;
  };

  const handleEditChild = (child: ChildItem) => {
    if (child.id) {
      safeStorage.setItem('koinonia_active_draft_id', child.id);
    }
    if (child.draftData) {
      setAddChildDraft(child.draftData);
    } else {
      setAddChildDraft({
        id: child.id,
        fullName: child.name,
        photoUrl: child.photoUrl,
        age: child.age,
        ageGroup: child.ageGroup,
        gender: '',
        dob: '',
        relationship: 'Parent'
      });
    }
    navigate(`/parent/children/${child.id}/edit`);
  };

  const handleStartNewChild = () => {
    safeStorage.removeItem('koinonia_active_draft_id');
    setAddChildDraft(null);
    navigate('/parent/children/new');
  };

  const handleResumeChildDraft = (child: ChildItem) => {
    if (child.id) {
      safeStorage.setItem('koinonia_active_draft_id', child.id);
    }
    if (child.draftData) {
      setAddChildDraft(child.draftData);
    } else {
      setAddChildDraft({
        id: child.id,
        photoUrl: child.photoUrl || '',
        fullName: child.name,
        gender: '',
        dob: '',
        age: child.age,
        ageGroup: child.ageGroup || '',
        relationship: 'Parent',
        childDetails: {
          photo: child.photoUrl || '',
          fullName: child.name,
          gender: '',
          dateOfBirth: '',
          calculatedAge: child.age,
          ageGroup: child.ageGroup || '',
          relationshipToChild: 'Parent'
        }
      });
    }
    navigate('/parent/children/new');
  };

  const handleDeleteChild = async (childId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const response = await api.parent.deleteChild(childId);
      if (response && response.success) {
        showSuccess(response.message || 'Action completed successfully');
        await fetchBackendData();
        return { success: true, message: response.message };
      } else {
        const errorMsg = response?.error || 'Failed to remove child details.';
        showError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError(apiErr.message);
      return { success: false, error: apiErr.message };
    }
  };

  const RedirectToSignIn = ({ next }: { next: string }) => {
    useEffect(() => {
      const nextParam = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
      navigate(`/parent/sign-in${nextParam}`);
    }, [next]);

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27] mb-4"></div>
          <p className="text-sm text-gray-500 font-medium">Redirecting to Sign In...</p>
        </div>
      </div>
    );
  };

  const RedirectToRoute = ({ route }: { route: string }) => {
    useEffect(() => {
      navigate(route);
    }, [route]);

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27] mb-4"></div>
          <p className="text-sm text-gray-500 font-medium">Redirecting...</p>
        </div>
      </div>
    );
  };

  const ProtectedRoute = ({
    requiredRole = 'parent',
    requiresCompletedProfile = true,
    children
  }: {
    requiredRole?: string;
    requiresCompletedProfile?: boolean;
    children: React.ReactNode;
  }) => {
    if (isCheckingAuth) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] font-sans">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27] mb-4"></div>
            <p className="text-sm text-[#52525B] font-medium tracking-wide">Checking access...</p>
          </div>
        </div>
      );
    }

    if (!user) {
      return <RedirectToSignIn next={currentRoute} />;
    }

    if (requiredRole && user.role !== requiredRole) {
      const isParentHybrid = requiredRole === 'parent' && 
        ['volunteer', 'staff', 'admin', 'super_admin', 'team'].includes(user.role) && 
        parentProfile && parentProfile.fullName && parentProfile.fullName.trim() !== '';

      if (isParentHybrid) {
        // Allow access to parent routes for hybrid users!
      } else if (user.role === 'volunteer' || user.role === 'staff') {
        return <RedirectToRoute route="/volunteer/event" />;
      } else if (user.role === 'admin' || user.role === 'super_admin') {
        return <RedirectToRoute route="/admin/overview" />;
      } else {
        return (
          <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] p-4">
            <div className="bg-white rounded-3xl p-8 border border-[#EAE8E1] shadow-sm max-w-md w-full text-center space-y-6">
              <h3 className="text-xl font-serif-koinonia font-bold text-[#18181B]">Access Denied</h3>
              <p className="text-sm text-[#6B7280]">
                You do not have access to this area. Your account role is <span className="font-semibold">{user.role}</span>.
              </p>
              <Button onClick={handleSignOut} variant="primary" fullWidth>
                Sign Out
              </Button>
            </div>
          </div>
        );
      }
    }

    const emailVerified = user.email_verified === 1 || user.email_verified === true || user.email_verified === '1';
    if (!emailVerified) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-8 border border-[#EAE8E1] shadow-sm max-w-md w-full text-center space-y-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#B89047]/10 text-[#B89047]">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 19v-8.93a2 2 0 01.89-1.664l8-5.333a2 2 0 012.22 0l8 5.333A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-serif-koinonia font-bold text-[#18181B]">Verify your email</h3>
              <p className="text-sm text-[#6B7280]">
                Please verify your email address to continue. We've sent a verification link to <span className="font-medium text-[#18181B]">{user.email}</span>.
              </p>
            </div>
            <div className="space-y-3">
              <Button
                variant="primary"
                fullWidth
                onClick={async () => {
                  try {
                    await api.auth.resendVerification(user.email);
                    showSuccess('Verification email sent', 'Please check your inbox.');
                  } catch (e: any) {
                    showError('Failed to resend', e.message || 'Please try again.');
                  }
                }}
              >
                Resend verification email
              </Button>
              <button
                onClick={handleSignOut}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (requiresCompletedProfile && !isProfileComplete(parentProfile)) {
      return <RedirectToRoute route="/parent/profile-setup" />;
    }

    return <>{children}</>;
  };

  const VolunteerProtectedRoute = ({
    children
  }: {
    children: React.ReactNode;
  }) => {
    if (isCheckingAuth) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] font-sans">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27] mb-4"></div>
            <p className="text-sm text-[#52525B] font-medium tracking-wide">Checking access...</p>
          </div>
        </div>
      );
    }

    if (!user) {
      return <RedirectToRoute route="/volunteer/sign-in" />;
    }

    const allowedRoles = ['volunteer', 'staff', 'admin', 'super_admin'];
    if (!allowedRoles.includes(user.role) && !volunteerProfile) {
      return <RedirectToRoute route="/parent/home" />;
    }

    const emailVerified = user.email_verified === 1 || user.email_verified === true || user.email_verified === '1';
    if (!emailVerified) {
      return <RedirectToRoute route="/volunteer/verify-email" />;
    }

    const isStaffOrAdmin = ['staff', 'admin', 'super_admin'].includes(user.role);
    if (isStaffOrAdmin) {
      return <>{children}</>;
    }

    // If volunteer profile is missing but user role is volunteer, wait for it or show loading state
    if (!volunteerProfile) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] font-sans p-6">
          <KoinoniaInlineLoader
            variant="logo"
            size="lg"
            label="Loading volunteer profile..."
            centered
          />
        </div>
      );
    }

    const status = volunteerProfile.status;
    const isApprovedOrActive = status === 'active' || status === 'approved';

    if (isApprovedOrActive) {
      const cleanRoute = currentRoute.split('?')[0];
      if (cleanRoute === '/volunteer/pending-review') {
        return <RedirectToRoute route="/volunteer/event" />;
      }
      return <>{children}</>;
    }

    // Direct other statuses (pending_review, request_update, rejected) to pending-review screen
    const cleanRoute = currentRoute.split('?')[0];
    if (cleanRoute !== '/volunteer/pending-review' && cleanRoute !== '/volunteer/verify-email') {
      return <RedirectToRoute route="/volunteer/pending-review" />;
    }

    return <>{children}</>;
  };

  const AdminProtectedRoute = ({
    children
  }: {
    children: React.ReactNode;
  }) => {
    if (isCheckingAuth) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] font-sans">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27] mb-4"></div>
            <p className="text-sm text-[#52525B] font-medium tracking-wide">Checking administrator access...</p>
          </div>
        </div>
      );
    }

    if (!user) {
      return <RedirectToRoute route="/admin/sign-in" />;
    }

    const allowedRoles = ['admin', 'super_admin', 'team'];
    if (!allowedRoles.includes(user.role)) {
      return <RedirectToRoute route="/parent/home" />;
    }

    return <>{children}</>;
  };

  const handleSignInSuccess = (userData: any, profileData: any) => {
    setUser(userData);
    if (profileData) {
      setParentProfile(normalizeParentProfile(profileData));
      setParentEmail(profileData.email || '');
    }
  };

  const renderCurrentRoute = () => {
    const cleanRoute = currentRoute.split('?')[0];
    const pRoute = user ? (isProfileComplete(parentProfile) ? '/parent/home' : '/parent/profile-setup') : '/parent/create-account';
    
    let vRoute = '/volunteer/sign-in';
    if (user) {
      const hasVolunteerRole = ['volunteer', 'staff', 'admin', 'super_admin'].includes(user.role);
      if (hasVolunteerRole || volunteerProfile) {
        if (volunteerProfile && volunteerProfile.status === 'pending_review') {
          vRoute = '/volunteer/pending-review';
        } else {
          vRoute = '/volunteer/event';
        }
      } else {
        vRoute = '/parent/volunteer-request';
      }
    }

    if (cleanRoute === '/parent/status' || (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/status'))) {
      const parts = cleanRoute.split('/');
      const childIdParam = parts.length >= 4 && parts[3] !== 'review-sent' && parts[3] !== 'new' ? parts[3] : undefined;
      return (
        <ProtectedRoute requiresCompletedProfile={true}>
          <ChildStatusView
            childId={childIdParam}
            childrenList={childrenList}
            parentProfile={parentProfile}
            onNavigate={navigate}
            onEditChild={handleEditChild}
            onDeleteChild={handleDeleteChild}
          />
        </ProtectedRoute>
      );
    }

    if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/edit')) {
      return (
        <ProtectedRoute requiresCompletedProfile={true}>
          <AddChildStep5View
            onNavigate={navigate}
            draft={addChildDraft}
            parentProfile={parentProfile}
            onSubmitReview={handleSubmitReview}
            onSaveDraft={handleSaveDraft}
          />
        </ProtectedRoute>
      );
    }

    if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/pass')) {
      const parts = cleanRoute.split('/');
      const childIdParam = parts[3];
      return (
        <ProtectedRoute requiresCompletedProfile={true}>
          <ParentHomeView
            onNavigate={navigate}
            parentProfile={parentProfile}
            childrenList={childrenList}
            onAddChild={handleAddChild}
            onStartNewChild={handleStartNewChild}
            onResumeChildDraft={handleResumeChildDraft}
            onSignOut={handleSignOut}
            onDeleteChild={handleDeleteChild}
            initialTab="Passes"
            selectedChildId={childIdParam}
            volunteerProfile={volunteerProfile}
            activeEvent={activeEvent}
          />
        </ProtectedRoute>
      );
    }

    if (cleanRoute.startsWith('/admin')) {
      const isAdminSignRoute = cleanRoute === '/admin/sign-in' || cleanRoute === '/admin/forgot-password' || cleanRoute === '/admin/reset-password' || cleanRoute === '/admin/accept-invite';
      if (!isAdminSignRoute) {
        return (
          <AdminProtectedRoute>
            <AdminOverviewView
              onNavigate={navigate}
              onSignOut={handleSignOut}
              adminUser={user}
              currentRoute={currentRoute}
              initialTab={
                cleanRoute === '/admin/settings'
                  ? 'settings'
                  : cleanRoute === '/admin/applications'
                    ? 'applications'
                    : cleanRoute === '/admin/review'
                      ? 'review'
                      : cleanRoute === '/admin/children'
                        ? 'children'
                        : cleanRoute === '/admin/attendance'
                          ? 'attendance'
                          : cleanRoute === '/admin/reports'
                            ? 'reports'
                            : cleanRoute === '/admin/messages'
                              ? 'messages'
                              : cleanRoute === '/admin/volunteers'
                                ? 'volunteers'
                                : cleanRoute === '/admin/parents' || cleanRoute.startsWith('/admin/parents/')
                                  ? 'parents'
                                  : 'overview'
              }
            />
          </AdminProtectedRoute>
        );
      }
    }

    switch (cleanRoute) {
      case '/':
        return (
          <LandingPage
            onNavigate={navigate}
            isMobileLandingView={isMobileLandingView}
            onToggleMobileView={(mobile) => setIsMobileLandingView(mobile)}
            parentCtaRoute={pRoute}
            volunteerCtaRoute={vRoute}
          />
        );
      case '/parent/create-account':
        return (
          <CreateAccountView
            onNavigate={navigate}
            onSetParentEmail={(email) => setParentEmail(email)}
            onUpdateProfile={(updated) => setParentProfile(updated)}
            onSignInSuccess={handleSignInSuccess}
          />
        );
      case '/parent/check-email':
        return (
          <CheckEmailView
            onNavigate={navigate}
            parentEmail={parentEmail}
          />
        );
      case '/parent/verify-email':
        return (
          <VerifyEmailView
            onNavigate={navigate}
          />
        );
      case '/parent/sign-in':
        return (
          <SignInView
            onNavigate={navigate}
            onSetParentEmail={(email) => setParentEmail(email)}
            onSignInSuccess={handleSignInSuccess}
          />
        );
      case '/parent/forgot-password':
        return <ForgotPasswordView onNavigate={navigate} />;
      case '/parent/new-password':
        return <NewPasswordView onNavigate={navigate} />;
      case '/parent/profile-setup':
        return (
          <ProtectedRoute requiresCompletedProfile={false}>
            <ProfileSetupView
              key="onboarding"
              mode="onboarding"
              onNavigate={navigate}
              initialProfile={parentProfile}
              onUpdateProfile={(updated) => setParentProfile(updated)}
            />
          </ProtectedRoute>
        );
      case '/parent/profile/edit':
        return (
          <ProtectedRoute requiresCompletedProfile={false}>
            <ProfileSetupView
              key="edit"
              mode="edit"
              onNavigate={navigate}
              initialProfile={parentProfile}
              onUpdateProfile={(updated) => setParentProfile(updated)}
            />
          </ProtectedRoute>
        );
      case '/parent/home':
        return (
          <ProtectedRoute requiresCompletedProfile={true}>
            <ParentHomeView
              onNavigate={navigate}
              parentProfile={parentProfile}
              childrenList={childrenList}
              onAddChild={handleAddChild}
              onStartNewChild={handleStartNewChild}
              onResumeChildDraft={handleResumeChildDraft}
              onSignOut={handleSignOut}
              onDeleteChild={handleDeleteChild}
              initialTab="Home"
              volunteerProfile={volunteerProfile}
              activeEvent={activeEvent}
            />
          </ProtectedRoute>
        );
      case '/parent/profile':
        return (
          <ProtectedRoute requiresCompletedProfile={false}>
            <ParentHomeView
              onNavigate={navigate}
              parentProfile={parentProfile}
              childrenList={childrenList}
              onAddChild={handleAddChild}
              onStartNewChild={handleStartNewChild}
              onResumeChildDraft={handleResumeChildDraft}
              onSignOut={handleSignOut}
              onDeleteChild={handleDeleteChild}
              initialTab="Profile"
              volunteerProfile={volunteerProfile}
              activeEvent={activeEvent}
            />
          </ProtectedRoute>
        );
      case '/parent/children':
        return (
          <ProtectedRoute requiresCompletedProfile={true}>
            <ParentHomeView
              onNavigate={navigate}
              parentProfile={parentProfile}
              childrenList={childrenList}
              onAddChild={handleAddChild}
              onStartNewChild={handleStartNewChild}
              onResumeChildDraft={handleResumeChildDraft}
              onSignOut={handleSignOut}
              onDeleteChild={handleDeleteChild}
              initialTab="Children"
              volunteerProfile={volunteerProfile}
              activeEvent={activeEvent}
            />
          </ProtectedRoute>
        );
      case '/parent/children/new':
        return (
          <ProtectedRoute requiresCompletedProfile={true}>
            <AddChildStep1View
              onNavigate={navigate}
              initialDraft={addChildDraft}
              onSaveDraft={handleSaveDraft}
            />
          </ProtectedRoute>
        );
      case '/parent/children/new/care-details':
        return (
          <ProtectedRoute requiresCompletedProfile={true}>
            <AddChildStep2View
              onNavigate={navigate}
              draft={addChildDraft}
              onSaveDraft={handleSaveDraft}
            />
          </ProtectedRoute>
        );
      case '/parent/children/new/health-and-support':
      case '/parent/children/new/health-and-care':
        return (
          <ProtectedRoute requiresCompletedProfile={true}>
            <AddChildStep3View
              onNavigate={navigate}
              draft={addChildDraft}
              onSaveDraft={handleSaveDraft}
            />
          </ProtectedRoute>
        );
      case '/parent/children/new/pickup-person':
        return (
          <ProtectedRoute requiresCompletedProfile={true}>
            <AddChildStep4View
              onNavigate={navigate}
              draft={addChildDraft}
              parentProfile={parentProfile}
              onSaveDraft={handleSaveDraft}
            />
          </ProtectedRoute>
        );
      case '/parent/children/new/review':
        return (
          <ProtectedRoute requiresCompletedProfile={true}>
            <AddChildStep5View
              onNavigate={navigate}
              draft={addChildDraft}
              parentProfile={parentProfile}
              onSubmitReview={handleSubmitReview}
              onSaveDraft={handleSaveDraft}
            />
          </ProtectedRoute>
        );
      case '/parent/children/review-sent':
        return (
          <ProtectedRoute requiresCompletedProfile={true}>
            <ReviewSentConfirmationView
              onNavigate={navigate}
              submittedChild={lastSubmittedChild || childrenList.find(c => c.status === 'Under review') || null}
              onStartNewChild={handleStartNewChild}
            />
          </ProtectedRoute>
        );
      case '/parent/passes':
        return (
          <ProtectedRoute requiresCompletedProfile={true}>
            <ParentHomeView
              onNavigate={navigate}
              parentProfile={parentProfile}
              childrenList={childrenList}
              onAddChild={handleAddChild}
              onStartNewChild={handleStartNewChild}
              onResumeChildDraft={handleResumeChildDraft}
              onSignOut={handleSignOut}
              onDeleteChild={handleDeleteChild}
              initialTab="Passes"
              volunteerProfile={volunteerProfile}
              activeEvent={activeEvent}
            />
          </ProtectedRoute>
        );
      case '/parent/volunteer-request':
        return (
          <ProtectedRoute requiresCompletedProfile={true}>
            <VolunteerRequestView
              onNavigate={navigate}
              parentProfile={parentProfile}
              onRefreshAccess={checkAuth}
            />
          </ProtectedRoute>
        );
      case '/volunteer/forgot-password':
        return <VolunteerForgotPasswordView onNavigate={navigate} />;
      case '/volunteer/reset-password':
        return <VolunteerResetPasswordView onNavigate={navigate} />;
      case '/volunteer/sign-in':
        return (
          <VolunteerSignInView
            onNavigate={navigate}
            onSignInSuccess={async (u, p) => {
              setUser(u);
              if (p) {
                setVolunteerProfile(p);
              }
              await checkAuth();
            }}
          />
        );
      case '/volunteer/create-account':
        return (
          <VolunteerCreateAccountView
            onNavigate={navigate}
            onSignInSuccess={async (u, p) => {
              setUser(u);
              if (p) {
                setVolunteerProfile(p);
              }
              await checkAuth();
            }}
          />
        );
      case '/admin/accept-invite':
        return <AdminAcceptInviteView onNavigate={navigate} />;
      case '/admin/sign-in':
        if (user && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'team')) {
          return <RedirectToRoute route="/admin/overview" />;
        }
        return (
          <AdminSignInView
            onNavigate={navigate}
            onSignInSuccess={async (u) => {
              setUser(u);
              await checkAuth();
            }}
          />
        );
      case '/admin/forgot-password':
        return <AdminForgotPasswordView onNavigate={navigate} />;
      case '/admin/reset-password':
        return <AdminResetPasswordView onNavigate={navigate} />;
      case '/volunteer/verify-email':
        return (
          <VolunteerVerifyEmailView
            onNavigate={navigate}
          />
        );
      case '/volunteer/pending-review':
        return (
          <VolunteerProtectedRoute>
            <VolunteerPendingReviewView
              onNavigate={navigate}
              volunteerProfile={volunteerProfile}
              onSignOut={handleSignOut}
              hasParentProfile={!!parentProfile && !!parentProfile.email}
              onRefreshAccess={checkAuth}
            />
          </VolunteerProtectedRoute>
        );
      case '/volunteer/event':
      case '/volunteer/scan':
      case '/volunteer/children':
      case '/volunteer/reports':
      case '/volunteer/profile':
      case '/volunteer/pickup':
        return (
          <VolunteerProtectedRoute>
            <VolunteerEventDashboardView
              onNavigate={navigate}
              volunteerProfile={volunteerProfile}
              onSignOut={handleSignOut}
              isOffline={isOffline}
              hasParentProfile={!!parentProfile && !!parentProfile.email}
              currentRoute={currentRoute}
            />
          </VolunteerProtectedRoute>
        );
      default:
        return (
          <LandingPage
            onNavigate={navigate}
            isMobileLandingView={isMobileLandingView}
            onToggleMobileView={(mobile) => setIsMobileLandingView(mobile)}
            parentCtaRoute={pRoute}
            volunteerCtaRoute={vRoute}
          />
        );
    }
  };

  const seoProps = getSeoPropsForRoute(currentRoute);

  return (
    <div className="min-h-screen bg-[#FAF9F6] selection:bg-[#C59B27]/30 selection:text-[#18181B]">
      {seoProps && <Seo {...seoProps} />}
      {isOffline && (
        <div className="bg-amber-600 text-white text-xs font-semibold py-2.5 px-4 text-center sticky top-0 z-[100] flex items-center justify-center gap-2 shadow-md">
          <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-3.536 4.978 4.978 0 011.414-3.536m0 0l2.828 2.829M12 12a1 1 0 112 0 1 1 0 01-2 0z" />
          </svg>
          <span>
            {user?.role === 'admin' 
              ? 'You are offline. Please reconnect before making changes.'
              : user?.role === 'staff' || user?.role === 'volunteer'
                ? 'You are offline. Scanning may be limited until connection returns.'
                : 'You are offline. Some updates will appear when your connection returns.'}
          </span>
        </div>
      )}
      {renderCurrentRoute()}

      {showPreloader && (
        <AppPreloader 
          isAppReady={!isCheckingAuth} 
          onComplete={() => setShowPreloader(false)} 
        />
      )}

      {/* Only show DevNavigator on internal parent routes in local development mode, remove from public landing page & production builds */}
      {import.meta.env.DEV && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && currentRoute !== '/' && (
        <DevNavigator
          currentRoute={currentRoute}
          onNavigate={navigate}
          isMobileLandingView={isMobileLandingView}
          onToggleLandingView={(mobile) => setIsMobileLandingView(mobile)}
        />
      )}
    </div>
  );
}


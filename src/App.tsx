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

export default function App() {
  const { showSuccess, showError } = useNotification();
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('/');
  const [parentEmail, setParentEmail] = useState<string>('');
  const [parentProfile, setParentProfile] = useState<ParentProfile>(initialParentProfile);
  const [childrenList, setChildrenList] = useState<ChildItem[]>(initialChildren);
  const [isMobileLandingView, setIsMobileLandingView] = useState<boolean>(false);
  const [addChildDraft, setAddChildDraft] = useState<AddChildDraft | null>(null);
  const [lastSubmittedChild, setLastSubmittedChild] = useState<ChildItem | null>(null);

  // Sync route with URL hash for easy browser bookmarking/testing
  useEffect(() => {
    const handleHashChange = () => {
      let hash = window.location.hash;
      // Strip all leading '#' and ensure there is exactly one leading '/'
      hash = hash.replace(/^#+/, '');
      if (!hash.startsWith('/')) {
        hash = '/' + hash;
      }
      if (hash && isValidRoute(hash)) {
        setCurrentRoute(hash as AppRoute);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const isProfileComplete = (p: ParentProfile | null | undefined): boolean => {
    if (!p) return false;
    if (!p.fullName || !p.fullName.trim()) return false;
    if (!p.email || !p.email.trim()) return false;
    if (!p.phone || !p.phone.trim()) return false;
    if (!p.whatsapp || !p.whatsapp.trim()) return false;
    if (!p.homeAddress || !p.homeAddress.trim()) return false;
    if (!p.country || !p.country.trim()) return false;
    if (!p.stateRegion || !p.stateRegion.trim()) return false;
    if (!p.city || !p.city.trim()) return false;
    if (!p.preferredContact || !p.preferredContact.trim()) return false;
    if (!p.photoUrl || !p.photoUrl.trim()) return false;
    if (p.isWorker && (!p.department || !p.department.trim())) return false;
    return true;
  };

  const [user, setUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  const checkAuth = async () => {
    const token = api.getToken();
    if (!token) {
      setUser(null);
      setParentProfile(initialParentProfile);
      setChildrenList([]);
      setIsCheckingAuth(false);
      return;
    }

    try {
      const meData = await api.auth.getMe();
      if (meData && meData.user) {
        setUser(meData.user);
        if (meData.profile) {
          setParentProfile(meData.profile);
          setParentEmail(meData.profile.email || '');
        }
        
        try {
          const homeData = await api.parent.getHome();
          if (homeData) {
            if (homeData.parentProfile) {
              setParentProfile(homeData.parentProfile);
            }
            if (Array.isArray(homeData.childrenList)) {
              setChildrenList(homeData.childrenList);
              const activeId = localStorage.getItem('koinonia_active_draft_id');
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
      } else {
        api.clearToken();
        setUser(null);
        setParentProfile(initialParentProfile);
        setChildrenList([]);
      }
    } catch (err) {
      console.error('Initial checkAuth failed:', err);
      api.clearToken();
      setUser(null);
      setParentProfile(initialParentProfile);
      setChildrenList([]);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const fetchBackendData = async () => {
    if (api.getToken() && user) {
      try {
        const homeData = await api.parent.getHome();
        if (homeData && homeData.parentProfile) {
          setParentProfile(homeData.parentProfile);
          setParentEmail(homeData.parentProfile.email || '');
          if (Array.isArray(homeData.childrenList)) {
            setChildrenList(homeData.childrenList);
            const activeId = localStorage.getItem('koinonia_active_draft_id');
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

  const isValidRoute = (route: string): boolean => {
    const cleanRoute = route.split('?')[0];
    if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/status')) return true;
    if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/edit')) return true;
    if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/pass')) return true;
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
      '/parent/passes'
    ];
    return validRoutes.includes(cleanRoute);
  };

  const navigate = (route: AppRoute | string) => {
    setCurrentRoute(route as AppRoute);
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
    setChildrenList([]);
    setAddChildDraft(null);
    localStorage.removeItem('koinonia_active_draft_id');
    navigate('/');
    showSuccess('Signed out', 'You have been successfully signed out.');
  };

  const handleSaveDraft = async (draft: AddChildDraft, isFinishLater?: boolean) => {
    setAddChildDraft(draft);
    if (draft.id) {
      localStorage.setItem('koinonia_active_draft_id', draft.id);
    }
    if (api.getToken()) {
      try {
        const savedChild = await api.parent.saveChildDraft(draft, draft.id);
        if (savedChild && savedChild.id) {
          draft.id = savedChild.id;
          localStorage.setItem('koinonia_active_draft_id', savedChild.id);
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

    localStorage.removeItem('koinonia_active_draft_id');

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
      localStorage.setItem('koinonia_active_draft_id', child.id);
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
    localStorage.removeItem('koinonia_active_draft_id');
    setAddChildDraft(null);
    navigate('/parent/children/new');
  };

  const handleResumeChildDraft = (child: ChildItem) => {
    if (child.id) {
      localStorage.setItem('koinonia_active_draft_id', child.id);
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
      if (user.role === 'volunteer') {
        return <RedirectToRoute route="/volunteer/home" />;
      } else if (user.role === 'staff') {
        return <RedirectToRoute route="/staff/home" />;
      } else if (user.role === 'admin' || user.role === 'super_admin') {
        return <RedirectToRoute route="/admin/home" />;
      } else {
        return (
          <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] p-4">
            <div className="bg-white rounded-3xl p-8 border border-[#EAE8E1] shadow-sm max-w-md w-full text-center space-y-6">
              <h3 className="text-xl font-serif-koinonia font-bold text-[#18181B]">Access Denied</h3>
              <p className="text-sm text-[#6B7280]">
                You do not have access to this portal. Your account role is <span className="font-semibold">{user.role}</span>.
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

  const handleSignInSuccess = (userData: any, profileData: any) => {
    setUser(userData);
    if (profileData) {
      setParentProfile(profileData);
      setParentEmail(profileData.email || '');
    }
  };

  const renderCurrentRoute = () => {
    const cleanRoute = currentRoute.split('?')[0];
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
          />
        </ProtectedRoute>
      );
    }

    switch (cleanRoute) {
      case '/':
        return (
          <LandingPage
            onNavigate={navigate}
            isMobileLandingView={isMobileLandingView}
            onToggleMobileView={(mobile) => setIsMobileLandingView(mobile)}
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
            />
          </ProtectedRoute>
        );
      default:
        return (
          <LandingPage
            onNavigate={navigate}
            isMobileLandingView={isMobileLandingView}
            onToggleMobileView={(mobile) => setIsMobileLandingView(mobile)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] selection:bg-[#C59B27]/30 selection:text-[#18181B]">
      {renderCurrentRoute()}

      {/* Only show DevNavigator on internal parent routes, remove from public landing page */}
      {currentRoute !== '/' && (
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


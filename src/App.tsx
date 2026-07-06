/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
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

  const fetchBackendData = async () => {
    if (api.getToken()) {
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

          // Route Gate inside fetch
          const cleanRoute = currentRoute.split('?')[0];
          const allowedRoutes = [
            '/',
            '/parent/create-account',
            '/parent/check-email',
            '/parent/verify-email',
            '/parent/sign-in',
            '/parent/forgot-password',
            '/parent/new-password',
            '/parent/profile-setup'
          ];
          if (!allowedRoutes.includes(cleanRoute)) {
            if (!isProfileComplete(homeData.parentProfile)) {
              navigate('/parent/profile-setup');
            }
          }
        }
      } catch (err) {
        console.error('Failed to load home data:', err);
      }
    }
  };

  useEffect(() => {
    fetchBackendData();
  }, [currentRoute]);

  useEffect(() => {
    const checkGate = () => {
      const token = api.getToken();
      if (!token) return;

      const cleanRoute = currentRoute.split('?')[0];
      const allowedRoutes = [
        '/',
        '/parent/create-account',
        '/parent/check-email',
        '/parent/verify-email',
        '/parent/sign-in',
        '/parent/forgot-password',
        '/parent/new-password',
        '/parent/profile-setup'
      ];
      if (!allowedRoutes.includes(cleanRoute)) {
        if (parentProfile && parentProfile.email && !isProfileComplete(parentProfile)) {
          navigate('/parent/profile-setup');
        }
      }
    };
    checkGate();
  }, [currentRoute, parentProfile]);

  const isValidRoute = (route: string): boolean => {
    const cleanRoute = route.split('?')[0];
    if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/status')) return true;
    if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/edit')) return true;
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

  const renderCurrentRoute = () => {
    const cleanRoute = currentRoute.split('?')[0];
    if (cleanRoute === '/parent/status' || (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/status'))) {
      const parts = cleanRoute.split('/');
      const childIdParam = parts.length >= 4 && parts[3] !== 'review-sent' && parts[3] !== 'new' ? parts[3] : undefined;
      return (
        <ChildStatusView
          childId={childIdParam}
          childrenList={childrenList}
          parentProfile={parentProfile}
          onNavigate={navigate}
          onEditChild={handleEditChild}
          onDeleteChild={handleDeleteChild}
        />
      );
    }

    if (cleanRoute.startsWith('/parent/children/') && cleanRoute.endsWith('/edit')) {
      return (
        <AddChildStep5View
          onNavigate={navigate}
          draft={addChildDraft}
          parentProfile={parentProfile}
          onSubmitReview={handleSubmitReview}
          onSaveDraft={handleSaveDraft}
        />
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
          />
        );
      case '/parent/forgot-password':
        return <ForgotPasswordView onNavigate={navigate} />;
      case '/parent/new-password':
        return <NewPasswordView onNavigate={navigate} />;
      case '/parent/profile-setup':
        return (
          <ProfileSetupView
            key="onboarding"
            mode="onboarding"
            onNavigate={navigate}
            initialProfile={parentProfile}
            onUpdateProfile={(updated) => setParentProfile(updated)}
          />
        );
      case '/parent/profile/edit':
        return (
          <ProfileSetupView
            key="edit"
            mode="edit"
            onNavigate={navigate}
            initialProfile={parentProfile}
            onUpdateProfile={(updated) => setParentProfile(updated)}
          />
        );
      case '/parent/home':
        return (
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
        );
      case '/parent/profile':
        return (
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
        );
      case '/parent/children':
        return (
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
        );
      case '/parent/children/new':
        return (
          <AddChildStep1View
            onNavigate={navigate}
            initialDraft={addChildDraft}
            onSaveDraft={handleSaveDraft}
          />
        );
      case '/parent/children/new/care-details':
        return (
          <AddChildStep2View
            onNavigate={navigate}
            draft={addChildDraft}
            onSaveDraft={handleSaveDraft}
          />
        );
      case '/parent/children/new/health-and-support':
      case '/parent/children/new/health-and-care':
        return (
          <AddChildStep3View
            onNavigate={navigate}
            draft={addChildDraft}
            onSaveDraft={handleSaveDraft}
          />
        );
      case '/parent/children/new/pickup-person':
        return (
          <AddChildStep4View
            onNavigate={navigate}
            draft={addChildDraft}
            parentProfile={parentProfile}
            onSaveDraft={handleSaveDraft}
          />
        );
      case '/parent/children/new/review':
        return (
          <AddChildStep5View
            onNavigate={navigate}
            draft={addChildDraft}
            parentProfile={parentProfile}
            onSubmitReview={handleSubmitReview}
            onSaveDraft={handleSaveDraft}
          />
        );
      case '/parent/children/review-sent':
        return (
          <ReviewSentConfirmationView
            onNavigate={navigate}
            submittedChild={lastSubmittedChild || childrenList.find(c => c.status === 'Under review') || null}
            onStartNewChild={handleStartNewChild}
          />
        );
      case '/parent/passes':
        return (
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


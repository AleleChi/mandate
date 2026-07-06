/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { AppRoute, ChildItem, ParentProfile } from './types';
import { initialChildren, initialParentProfile } from './data/mockData';
import { api } from './services/api';
import { LandingPage } from './views/LandingPage';
import { CreateAccountView } from './views/CreateAccountView';
import { CheckEmailView } from './views/CheckEmailView';
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
      const hash = window.location.hash.replace('#', '');
      if (hash && isValidRoute(hash)) {
        setCurrentRoute(hash as AppRoute);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const fetchBackendData = async () => {
    if (api.getToken()) {
      try {
        const homeData = await api.parent.getHome();
        if (homeData && homeData.parentProfile) {
          setParentProfile(homeData.parentProfile);
          setParentEmail(homeData.parentProfile.email || '');
          if (Array.isArray(homeData.childrenList)) {
            setChildrenList(homeData.childrenList);
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

  const isValidRoute = (route: string): boolean => {
    if (route.startsWith('/parent/children/') && route.endsWith('/status')) return true;
    if (route.startsWith('/parent/children/') && route.endsWith('/edit')) return true;
    const validRoutes: string[] = [
      '/',
      '/parent/create-account',
      '/parent/check-email',
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
    return validRoutes.includes(route);
  };

  const navigate = (route: AppRoute | string) => {
    setCurrentRoute(route as AppRoute);
    window.location.hash = route;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddChild = (newChild: ChildItem) => {
    setChildrenList((prev) => [newChild, ...prev]);
  };

  const handleSaveDraft = async (draft: AddChildDraft, isFinishLater?: boolean) => {
    setAddChildDraft(draft);
    if (api.getToken()) {
      try {
        const savedChild = await api.parent.saveChildDraft(draft, draft.id);
        if (savedChild && savedChild.id) {
          draft.id = savedChild.id;
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
        }
      } catch (e) {
        console.error('Failed to save draft to backend:', e);
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
    }
  };

  const handleSubmitReview = async (draft: AddChildDraft) => {
    const name = (draft.childDetails?.fullName || draft.fullName || 'Untitled Child').trim();
    const ageVal = draft.childDetails?.calculatedAge !== undefined ? draft.childDetails.calculatedAge : draft.age;
    const ageGroupVal = draft.childDetails?.ageGroup || draft.ageGroup || 'Not specified';
    const photoVal = draft.childDetails?.photo || draft.photoUrl || '';

    if (api.getToken() && draft.id) {
      try {
        const reviewedChild = await api.parent.submitChildReview(draft.id, draft);
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
        return;
      } catch (e: any) {
        console.error('Submit review error:', e);
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
  };

  const handleEditChild = (child: ChildItem) => {
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
    setAddChildDraft(null);
    navigate('/parent/children/new');
  };

  const handleResumeChildDraft = (child: ChildItem) => {
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

  const renderCurrentRoute = () => {
    if (currentRoute === '/parent/status' || (currentRoute.startsWith('/parent/children/') && currentRoute.endsWith('/status'))) {
      const parts = currentRoute.split('/');
      const childIdParam = parts.length >= 4 && parts[3] !== 'review-sent' && parts[3] !== 'new' ? parts[3] : undefined;
      return (
        <ChildStatusView
          childId={childIdParam}
          childrenList={childrenList}
          parentProfile={parentProfile}
          onNavigate={navigate}
          onEditChild={handleEditChild}
        />
      );
    }

    if (currentRoute.startsWith('/parent/children/') && currentRoute.endsWith('/edit')) {
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

    switch (currentRoute) {
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


import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Check,
  ShieldCheck,
  Info,
  Camera,
  Shield,
  Home,
  Users,
  Activity,
  QrCode,
  User
} from 'lucide-react';
import { AppRoute, ChildItem, BottomNavTab, ParentProfile } from '../types';
import { REAL_ASSETS } from '../config/assets';

interface ChildStatusViewProps {
  childId?: string;
  childrenList: ChildItem[];
  parentProfile?: ParentProfile;
  onNavigate: (route: AppRoute | string) => void;
  onEditChild?: (child: ChildItem) => void;
  onDeleteChild?: (childId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
}

const isRealUploadedPhoto = (url?: string) => {
  if (!url || !url.trim()) return false;
  if (url === REAL_ASSETS.passAvatar || url === REAL_ASSETS.workerAvatar) return false;
  return true;
};

const FallbackAvatar: React.FC<{
  src?: string;
  name: string;
  className?: string;
}> = ({ src, name, className = '' }) => {
  const [error, setError] = useState(false);

  const getInitials = (fullName: string) => {
    if (!fullName || !fullName.trim()) return 'SO';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  if (src && src.trim() !== '' && !error) {
    return (
      <div className={`overflow-hidden bg-[#FAF6EB] flex items-center justify-center shrink-0 ${className}`}>
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`bg-[#FAF6EB] border border-[#E5D5AE] flex items-center justify-center select-none font-serif-koinonia shrink-0 text-[#9A7326] ${className}`}
    >
      <span>{getInitials(name)}</span>
    </div>
  );
};

export const ChildStatusView: React.FC<ChildStatusViewProps> = ({
  childId,
  childrenList,
  parentProfile,
  onNavigate,
  onEditChild,
  onDeleteChild
}) => {
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const foundChild = childId
    ? childrenList.find((c) => c.id === childId)
    : childrenList.find((c) => c.status === 'Under review' || c.status !== 'Draft') || childrenList[0];

  useEffect(() => {
    if (!foundChild) {
      onNavigate('/parent/home');
    }
  }, [foundChild, onNavigate]);

  if (!foundChild) {
    return null;
  }

  const childFirstName = foundChild.name ? foundChild.name.trim().split(' ')[0] : 'your child';

  const formatSubmittedDate = (dateStr?: string) => {
    if (!dateStr) return '12 Oct 2025';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return '12 Oct 2025';
    }
  };

  const submittedDateText = formatSubmittedDate(
    foundChild.draftData?.review?.submittedAt
  );

  const pickupData = foundChild.draftData?.pickup;
  const pickupType = pickupData?.pickupType || 'parent';
  const isParentPickup = pickupType === 'parent';

  const pickupName = isParentPickup
    ? parentProfile?.fullName || 'Parent'
    : pickupData?.pickupPersonFullName || 'Not specified';

  const pickupRelation = isParentPickup
    ? foundChild.draftData?.childDetails?.relationshipToChild || foundChild.draftData?.relationship || 'Parent'
    : pickupData?.pickupPersonRelationship || 'Authorized adult';

  const pickupPhone = isParentPickup
    ? parentProfile?.phone || 'Not provided'
    : pickupData?.pickupPersonPhone || 'Not specified';

  const pickupPhoto = isParentPickup
    ? parentProfile?.photoUrl
    : pickupData?.pickupPersonPhoto;

  const handleBack = () => {
    if (window.history.length > 2) {
      window.history.back();
    } else {
      onNavigate('/parent/home');
    }
  };

  const handleWithdrawConfirm = async () => {
    if (!foundChild || !onDeleteChild) return;
    setIsWithdrawing(true);
    try {
      const res = await onDeleteChild(foundChild.id);
      if (res.success) {
        setShowWithdrawModal(false);
        onNavigate('/parent/home');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleEditDetails = () => {
    if (onEditChild) {
      onEditChild(foundChild);
    } else {
      onNavigate('/parent/children/new/review');
    }
  };

  const handleTabChange = (tab: BottomNavTab) => {
    if (tab === 'Home') onNavigate('/parent/home');
    else if (tab === 'Children') onNavigate('/parent/children');
    else if (tab === 'Status') {
      // already on status
    }
    else if (tab === 'Passes') onNavigate('/parent/passes');
    else if (tab === 'Profile') onNavigate('/parent/profile');
  };

  // Determine active progress steps based on status
  const currentStatus = foundChild.status || 'Under review';
  const isDetailsSentDone = true;
  const isReviewDone = ['Selected', 'Not selected', 'Waiting list', 'Pass ready'].includes(currentStatus);
  const isReviewActive = currentStatus === 'Under review';
  const isDecisionDone = ['Pass ready'].includes(currentStatus);
  const isDecisionActive = ['Selected', 'Not selected', 'Waiting list'].includes(currentStatus);
  const isPassDone = currentStatus === 'Pass ready';

  return (
    <div className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 pb-24">
      {/* Scrollable Content */}
      <div className="px-5 pt-5 pb-8">
        {/* Top bar */}
        <div className="pt-2 pb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            className="p-1 -ml-1 text-[#18181B] hover:text-[#715D3A] active:opacity-75 transition-all cursor-pointer focus:outline-none shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>
          <h1 className="text-xl font-serif-koinonia font-bold text-[#8C6D23] tracking-tight">
            Status
          </h1>
          <div className="w-5" />
        </div>

        {/* Child summary card */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] shadow-2xs mt-3">
          <div className="relative inline-block">
            <FallbackAvatar
              src={isRealUploadedPhoto(foundChild.photoUrl) ? foundChild.photoUrl : undefined}
              name={foundChild.name}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border border-[#EAE8E1]"
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#8C6D23] text-white flex items-center justify-center border border-white shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 stroke-[2.25]" />
            </div>
          </div>

          <div className="mt-3.5">
            <h2 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B]">
              {foundChild.name}
            </h2>
            <p className="text-xs sm:text-sm text-[#3F3F46] mt-0.5">
              {foundChild.age} years old • {foundChild.ageGroup}
            </p>
          </div>

          <div className="mt-3 flex items-center gap-2.5 flex-wrap">
            <span className="inline-block px-2.5 py-0.5 rounded bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] text-[10px] sm:text-[11px] font-bold tracking-wider uppercase">
              {currentStatus.toUpperCase()}
            </span>
            <span className="text-xs sm:text-sm text-[#6B7280]">
              Details sent on {submittedDateText}
            </span>
          </div>
        </div>

        {/* Status message card */}
        <div className="bg-[#FAF8F3] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] flex items-start gap-3 sm:gap-3.5 mt-4">
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#8C6D23] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
            <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-serif-koinonia font-bold text-base sm:text-lg text-[#8C6D23] leading-snug">
              {currentStatus === 'Pass ready' ? 'Pass ready' : currentStatus === 'Selected' ? 'Selected' : currentStatus === 'Not selected' ? 'Not selected' : currentStatus === 'Waiting list' ? 'Waiting list' : 'Under review'}
            </h3>
            <p className="text-xs sm:text-sm text-[#3F3F46] mt-1 leading-relaxed">
              {currentStatus === 'Pass ready' ? (
                <>Great news! {childFirstName}’s event pass is now available.</>
              ) : currentStatus === 'Selected' ? (
                <>{childFirstName} has been selected. Your pass will be generated shortly.</>
              ) : currentStatus === 'Not selected' ? (
                <>Thank you for your submission. Unfortunately {childFirstName} was not selected this time.</>
              ) : currentStatus === 'Waiting list' ? (
                <>{childFirstName} is currently on the waiting list. We will notify you if a space opens up.</>
              ) : (
                <>
                  The team is checking {childFirstName}’s details.<br />
                  You will receive a message when there is a decision.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Progress section */}
        <div className="mt-8">
          <h4 className="text-[11px] sm:text-xs font-bold text-[#6B7280] tracking-widest uppercase pb-2">
            PROGRESS
          </h4>

          <div className="relative pt-3 pl-1 space-y-6">
            {/* Vertical connecting line */}
            <div className="absolute left-[13px] top-[24px] bottom-[24px] w-[2px] bg-[#EAE8E1]" />

            {/* Step 1: Details sent */}
            <div className="flex items-start space-x-3.5 relative z-10">
              <div className="w-5 h-5 rounded-full bg-[#8C6D23] text-white flex items-center justify-center shadow-2xs shrink-0 mt-0.5">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
              <div>
                <span className="font-bold text-sm sm:text-base text-[#3F3F46] block leading-snug">
                  Details sent
                </span>
              </div>
            </div>

            {/* Step 2: Team review */}
            <div className="flex items-start space-x-3.5 relative z-10">
              {isReviewDone ? (
                <div className="w-5 h-5 rounded-full bg-[#8C6D23] text-white flex items-center justify-center shadow-2xs shrink-0 mt-0.5">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              ) : isReviewActive ? (
                <div className="w-5 h-5 rounded-full border-2 border-[#8C6D23] bg-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <div className="w-2 h-2 rounded-full bg-[#8C6D23]" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-[#EAE8E1] bg-[#FAF8F3] shrink-0 mt-0.5" />
              )}
              <div>
                <span className={`font-bold text-sm sm:text-base leading-snug block ${isReviewActive ? 'font-serif-koinonia text-[#18181B]' : isReviewDone ? 'text-[#3F3F46]' : 'text-[#A1A1AA]'}`}>
                  Team review
                </span>
                {(isReviewActive || isReviewDone) && (
                  <span className="text-xs text-[#3F3F46] block mt-0.5">
                    {isReviewDone ? 'Review completed' : 'Currently processing'}
                  </span>
                )}
              </div>
            </div>

            {/* Step 3: Decision */}
            <div className="flex items-start space-x-3.5 relative z-10">
              {isDecisionDone ? (
                <div className="w-5 h-5 rounded-full bg-[#8C6D23] text-white flex items-center justify-center shadow-2xs shrink-0 mt-0.5">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              ) : isDecisionActive ? (
                <div className="w-5 h-5 rounded-full border-2 border-[#8C6D23] bg-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <div className="w-2 h-2 rounded-full bg-[#8C6D23]" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-[#EAE8E1] bg-[#FAF8F3] shrink-0 mt-0.5" />
              )}
              <div>
                <span className={`font-medium text-sm sm:text-base leading-snug block ${isDecisionActive ? 'font-serif-koinonia font-bold text-[#18181B]' : isDecisionDone ? 'font-bold text-[#3F3F46]' : 'text-[#A1A1AA]'}`}>
                  Decision
                </span>
                {isDecisionActive && (
                  <span className="text-xs text-[#3F3F46] block mt-0.5">
                    {currentStatus}
                  </span>
                )}
              </div>
            </div>

            {/* Step 4: Pass */}
            <div className="flex items-start space-x-3.5 relative z-10">
              {isPassDone ? (
                <div className="w-5 h-5 rounded-full bg-[#8C6D23] text-white flex items-center justify-center shadow-2xs shrink-0 mt-0.5">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-[#EAE8E1] bg-[#FAF8F3] shrink-0 mt-0.5" />
              )}
              <div>
                <span className={`font-medium text-sm sm:text-base leading-snug block ${isPassDone ? 'font-serif-koinonia font-bold text-[#18181B]' : 'text-[#A1A1AA]'}`}>
                  Pass
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Details shared section */}
        <div className="mt-8 pt-2">
          <h3 className="font-serif-koinonia text-lg sm:text-xl font-bold text-[#18181B]">
            Details shared
          </h3>
          <div className="mt-3.5 space-y-3">
            {['Child details', 'Health and support', 'Pickup person', 'Parent details'].map((item) => (
              <div key={item} className="flex items-center space-x-3 text-sm sm:text-base text-[#3F3F46] font-medium">
                <Check className="w-4 h-4 text-[#8C6D23] shrink-0 stroke-[2.5]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pickup person card */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] shadow-2xs mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[22px] font-serif-koinonia text-[#18181B] font-medium leading-tight">
              Pickup person
            </h3>
            {isRealUploadedPhoto(pickupPhoto) || pickupPhoto ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] text-xs font-semibold">
                <Camera className="w-3.5 h-3.5" />
                <span>Photo added</span>
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-y-4 gap-x-8 min-w-0 mt-5">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#71717A] block">
                NAME
              </span>
              <span className="font-normal text-[16px] text-[#18181B] block mt-1.5 leading-[1.35] line-clamp-2 [word-break:break-word] overflow-wrap-anywhere">
                {pickupName || 'Not specified'}
              </span>
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#71717A] block">
                RELATION
              </span>
              <span className="font-normal text-[16px] text-[#18181B] block mt-1.5 leading-[1.35] line-clamp-2 [word-break:break-word] overflow-wrap-anywhere">
                {pickupRelation || 'Not specified'}
              </span>
            </div>
            <div className="min-w-0 min-[560px]:col-span-2">
              <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#71717A] block">
                PHONE
              </span>
              <span className="font-normal text-[16px] text-[#18181B] block mt-1.5 leading-[1.35] [word-break:break-word] overflow-wrap-anywhere">
                {pickupPhone || 'Not specified'}
              </span>
            </div>
          </div>

          <div className="bg-[#FAF8F3] rounded-xl p-3 border border-[#EAE8E1] mt-4 flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-[#8C6D23] shrink-0 stroke-[2]" />
            <span className="text-xs sm:text-sm text-[#3F3F46]">
              This person will be checked at pickup.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => onNavigate('/parent/home')}
            className="w-full py-3.5 px-5 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-sm transition-all duration-200 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#8C6D23]"
          >
            Back to Home
          </button>
          <button
            type="button"
            onClick={handleEditDetails}
            className="w-full py-3.5 px-5 rounded-xl bg-white hover:bg-[#FAF9F6] active:bg-[#F4F1EA] border border-[#18181B] text-[#18181B] font-semibold text-sm transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#18181B]"
          >
            Edit details
          </button>
          {foundChild?.status === 'Under review' && (
            <button
              type="button"
              onClick={() => setShowWithdrawModal(true)}
              className="w-full py-2 px-5 rounded-xl text-[#6B7280] hover:text-[#4B5563] font-semibold text-xs transition-all cursor-pointer focus:outline-none text-center bg-transparent mt-1"
            >
              Withdraw details
            </button>
          )}
        </div>
      </div>

      {/* Fixed Bottom Navigation locked within the mobile app shell */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 max-w-[390px] mx-auto bg-white/95 backdrop-blur-md border-t border-[#EAE8E1] shadow-lg">
        <div className="px-2 h-16 flex items-center justify-around">
          {[
            { label: 'Home' as BottomNavTab, icon: <Home className="w-5 h-5" /> },
            { label: 'Children' as BottomNavTab, icon: <Users className="w-5 h-5" /> },
            { label: 'Status' as BottomNavTab, icon: <Activity className="w-5 h-5" /> },
            { label: 'Passes' as BottomNavTab, icon: <QrCode className="w-5 h-5" /> },
            { label: 'Profile' as BottomNavTab, icon: <User className="w-5 h-5" /> }
          ].map((item) => {
            const isActive = item.label === 'Status';
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleTabChange(item.label)}
                className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-xl transition-all cursor-pointer focus:outline-none ${
                  isActive
                    ? 'text-[#B89047] font-semibold'
                    : 'text-[#6B7280] hover:text-[#18181B]'
                }`}
              >
                <div
                  className={`p-1 rounded-lg transition-transform ${
                    isActive ? 'bg-[#FAF6EB] scale-110 text-[#C59B27]' : ''
                  }`}
                >
                  {item.icon}
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Withdraw details modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-[#EAE8E1] shadow-2xl max-w-sm w-full animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-serif-koinonia font-bold text-[#18181B] mb-2">
              Withdraw details?
            </h3>
            <p className="text-sm text-[#3F3F46] leading-relaxed mb-6">
              The Children and Teens team will no longer review this child’s details for this event.
            </p>
            <div className="flex space-x-3">
              <button
                type="button"
                disabled={isWithdrawing}
                onClick={() => setShowWithdrawModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-[#EAE8E1] text-[#3F3F46] hover:bg-[#FAF9F6] font-semibold text-sm transition-all focus:outline-none cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isWithdrawing}
                onClick={handleWithdrawConfirm}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold text-sm transition-all focus:outline-none cursor-pointer text-center"
              >
                {isWithdrawing ? 'Withdrawing...' : 'Withdraw details'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

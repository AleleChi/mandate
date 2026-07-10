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
import { resolveMediaUrl } from '../utils/mediaUrl';
import { api } from '../services/api';

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
    const resolved = resolveMediaUrl(src);
    return (
      <div className={`overflow-hidden bg-[#FAF6EB] flex items-center justify-center shrink-0 ${className}`}>
        <img
          src={resolved}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setError(true)}
          loading="lazy"
          referrerPolicy="no-referrer"
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

  const [localStatus, setLocalStatus] = useState<string>(foundChild?.status || 'Under review');

  useEffect(() => {
    if (foundChild) {
      setLocalStatus(foundChild.status);
    }
  }, [foundChild?.id, foundChild?.status]);

  useEffect(() => {
    let intervalId: any;
    if (foundChild && (localStatus === 'Selected' || localStatus === 'selected')) {
      const pollStatus = async () => {
        try {
          const res = await api.parent.getChildStatus(foundChild.id);
          if (res && res.status) {
            setLocalStatus(res.status);
          }
        } catch (e) {
          console.error('Error polling child status:', e);
        }
      };
      
      // Poll every 5 seconds
      intervalId = setInterval(pollStatus, 5000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [foundChild?.id, localStatus]);

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
    try {
      const hash = window.location.hash;
      if (hash.includes('from=passes')) {
        onNavigate('/parent/passes');
      } else if (hash.includes('from=children')) {
        onNavigate('/parent/children');
      } else {
        onNavigate('/parent/home');
      }
    } catch (e) {
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
  const currentStatus = localStatus || 'Under review';
  const isDetailsSentDone = true;
  const isReviewDone = ['Selected', 'Not selected', 'Waiting list', 'Pass ready', 'Checked in', 'Picked up'].includes(currentStatus);
  const isReviewActive = currentStatus === 'Under review';
  const isDecisionDone = ['Selected', 'Not selected', 'Waiting list', 'Pass ready', 'Checked in', 'Picked up'].includes(currentStatus);
  const isDecisionActive = false;
  const isPassDone = ['Pass ready', 'Checked in', 'Picked up'].includes(currentStatus);
  const isPassPending = currentStatus === 'Selected';

  return (
    <div 
      data-view-version="parent-child-status-v9-brand-polished"
      className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF9F6] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 pb-24"
    >
      {/* Scrollable Content */}
      <div className="px-5 pt-5 pb-8">
        {/* Top bar */}
        <div className="pt-2 pb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            data-component-version="parent-child-status-back-action-v1"
            className="p-1 -ml-1 text-[#18181B] hover:text-[#715D3A] active:opacity-75 transition-all cursor-pointer focus:outline-none shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>
          <h1 className="text-xl font-serif-koinonia font-bold text-[#8C6D23] tracking-tight">
            Child Status
          </h1>
          <div className="w-5" />
        </div>

        {/* Child summary card (Elegant Header) */}
        <div data-component-version="parent-child-status-summary-card-v2" className="bg-white rounded-3xl p-5 border border-[#EAE8E1] shadow-xs mt-3 space-y-4">
          <div className="flex items-center space-x-4">
            <div className="relative shrink-0">
              <FallbackAvatar
                src={isRealUploadedPhoto(foundChild.photoUrl) ? foundChild.photoUrl : undefined}
                name={foundChild.name}
                className="w-16 h-16 rounded-2xl border border-[#E5D5AE]"
              />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#C59B27] text-white flex items-center justify-center border border-white shadow-2xs">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-serif-koinonia font-bold text-[#18181B] truncate leading-tight">
                {foundChild.name}
              </h2>
              <p className="text-xs text-[#5C5A54] mt-0.5 font-medium">
                {foundChild.age} yrs old • {foundChild.ageGroup}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-[#EAE8E1]/60 flex items-center justify-between gap-2.5 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] text-[10px] font-bold uppercase tracking-wider">
              ● {currentStatus.toUpperCase()}
            </span>
            <span className="text-[10px] text-[#8E8B82] font-semibold">
              Submitted on {submittedDateText}
            </span>
          </div>
        </div>

        {/* Status message card */}
        <div data-component-version="parent-child-status-message-card-v2" className="bg-[#FAF6EB]/40 rounded-2xl p-4 border border-[#E5D5AE]/40 flex items-start gap-3 mt-4">
          <div className="w-6 h-6 rounded-full bg-white text-[#C59B27] flex items-center justify-center shrink-0 mt-0.5 border border-[#EAE8E1]">
            <Info className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-serif-koinonia font-bold text-sm text-[#18181B] leading-snug">
              {currentStatus === 'Pass ready' ? 'Pass ready' : currentStatus === 'Selected' ? 'Selected' : currentStatus === 'Not selected' ? 'Not selected' : currentStatus === 'Waiting list' ? 'Waiting list' : 'Details under review'}
            </h3>
            <p className="text-xs text-[#5C5A54] mt-1 leading-relaxed">
              {currentStatus === 'Pass ready' ? (
                <>Your child’s event pass is ready. Please present it at arrival and keep it available for pickup.</>
              ) : currentStatus === 'Selected' ? (
                <>Your child has been selected. The event pass is being generated.</>
              ) : currentStatus === 'Not selected' ? (
                <>Unfortunately, your child was not selected for this session.</>
              ) : currentStatus === 'Waiting list' ? (
                <>Your child is currently on the waiting list. We will notify you if a space opens up.</>
              ) : (
                <>The care team is reviewing your child’s details. You will be notified once verified.</>
              )}
            </p>
          </div>
        </div>

        {/* Progress section (Vertical Timeline) */}
        <div className="mt-8 space-y-4">
          <h4 className="text-[10px] font-bold text-[#8E8B82] tracking-widest uppercase pb-1 border-b border-[#EAE8E1]">
            Progress
          </h4>

          {/* Timeline Wrapper */}
          <div className="relative border-l-2 border-[#E5D5AE] ml-4 pl-6 py-2 space-y-6">
            
            {/* Step 1: Details sent */}
            <div className="relative">
              {/* Dot */}
              <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-[#137333]/10 border border-[#137333]/30 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-[#137333]" />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#137333] block">Details sent</span>
                <span className="text-[11px] text-[#5C5A54] leading-relaxed block">Your child’s details were received.</span>
                <span className="text-[9px] text-[#8E8B82] font-semibold block">Verified on {submittedDateText}</span>
              </div>
            </div>

            {/* Step 2: Review completed */}
            <div className="relative">
              {/* Dot */}
              <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border flex items-center justify-center ${
                isReviewDone 
                  ? 'bg-[#137333]/10 border-[#137333]/30 text-[#137333]' 
                  : 'bg-[#C59B27]/10 border-[#C59B27]/30 text-[#C59B27] animate-pulse'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isReviewDone ? 'bg-[#137333]' : 'bg-[#C59B27]'}`} />
              </div>
              <div className="space-y-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider block ${isReviewDone ? 'text-[#137333]' : 'text-[#C59B27]'}`}>
                  Review completed
                </span>
                <span className="text-[11px] text-[#5C5A54] leading-relaxed block">
                  {isReviewDone ? 'The care team has reviewed the details.' : 'The care team is reviewing the details.'}
                </span>
              </div>
            </div>

            {/* Step 3: Pass ready */}
            <div className="relative">
              {/* Dot */}
              <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border flex items-center justify-center ${
                isPassDone 
                  ? 'bg-[#137333]/10 border-[#137333]/30 text-[#137333]' 
                  : (currentStatus === 'Selected') 
                    ? 'bg-[#C59B27]/10 border-[#C59B27]/30 text-[#C59B27] animate-pulse' 
                    : 'bg-[#FAF9F6] border-[#EAE8E1] text-[#8E8B82]'
              }`}>
                {isPassDone || currentStatus === 'Selected' ? (
                  <div className={`w-1.5 h-1.5 rounded-full ${isPassDone ? 'bg-[#137333]' : 'bg-[#C59B27]'}`} />
                ) : null}
              </div>
              <div className="space-y-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                  isPassDone ? 'text-[#137333]' : (currentStatus === 'Selected') ? 'text-[#C59B27]' : 'text-[#8E8B82]'
                }`}>
                  Pass ready
                </span>
                <span className="text-[11px] text-[#5C5A54] leading-relaxed block">
                  {isPassDone ? 'Your child’s event pass is ready.' : (currentStatus === 'Selected') ? 'Generating secure pass...' : 'Your pass reference is being compiled.'}
                </span>
              </div>
            </div>

            {/* Step 4: Arrival check-in */}
            <div className="relative">
              {/* Dot */}
              <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border flex items-center justify-center ${
                (currentStatus === 'Checked in' || currentStatus === 'Inside' || currentStatus === 'Picked up')
                  ? 'bg-[#137333]/10 border-[#137333]/30 text-[#137333]'
                  : (currentStatus === 'Pass ready')
                    ? 'bg-[#C59B27]/10 border-[#C59B27]/30 text-[#C59B27] animate-pulse'
                    : 'bg-[#FAF9F6] border-[#EAE8E1] text-[#8E8B82]'
              }`}>
                {(currentStatus === 'Checked in' || currentStatus === 'Inside' || currentStatus === 'Picked up' || currentStatus === 'Pass ready') ? (
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    (currentStatus === 'Checked in' || currentStatus === 'Inside' || currentStatus === 'Picked up') ? 'bg-[#137333]' : 'bg-[#C59B27]'
                  }`} />
                ) : null}
              </div>
              <div className="space-y-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                  (currentStatus === 'Checked in' || currentStatus === 'Inside' || currentStatus === 'Picked up')
                    ? 'text-[#137333]'
                    : (currentStatus === 'Pass ready')
                      ? 'text-[#C59B27]'
                      : 'text-[#8E8B82]'
                }`}>
                  Arrival check-in
                </span>
                <span className="text-[11px] text-[#5C5A54] leading-relaxed block">
                  {(currentStatus === 'Checked in' || currentStatus === 'Inside' || currentStatus === 'Picked up')
                    ? 'Child successfully checked in.'
                    : 'Show the pass when your child arrives.'}
                </span>
              </div>
            </div>

            {/* Step 5: Pickup and release */}
            <div className="relative">
              {/* Dot */}
              <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border flex items-center justify-center ${
                currentStatus === 'Picked up'
                  ? 'bg-[#137333]/10 border-[#137333]/30 text-[#137333]'
                  : (currentStatus === 'Checked in' || currentStatus === 'Inside')
                    ? 'bg-[#C59B27]/10 border-[#C59B27]/30 text-[#C59B27] animate-pulse'
                    : 'bg-[#FAF9F6] border-[#EAE8E1] text-[#8E8B82]'
              }`}>
                {currentStatus === 'Picked up' || currentStatus === 'Checked in' || currentStatus === 'Inside' ? (
                  <div className={`w-1.5 h-1.5 rounded-full ${currentStatus === 'Picked up' ? 'bg-[#137333]' : 'bg-[#C59B27]'}`} />
                ) : null}
              </div>
              <div className="space-y-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                  currentStatus === 'Picked up' ? 'text-[#137333]' : (currentStatus === 'Checked in' || currentStatus === 'Inside') ? 'text-[#C59B27]' : 'text-[#8E8B82]'
                }`}>
                  Pickup and release
                </span>
                <span className="text-[11px] text-[#5C5A54] leading-relaxed block">
                  {currentStatus === 'Picked up'
                    ? 'Child safely picked up.'
                    : 'Pickup will be confirmed before release.'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Details shared section */}
        <div data-component-version="parent-child-details-confirmed-v2" className="mt-8 pt-2">
          <h3 className="font-serif-koinonia text-base font-bold text-[#18181B]">
            Details confirmed
          </h3>
          <div className="mt-3 space-y-2">
            {[
              'Child photo and age group',
              'Health and support notes',
              'Approved pickup details',
              'Parent contact details'
            ].map((item) => (
              <div key={item} className="flex items-center space-x-3 text-xs text-[#5C5A54] font-medium">
                <Check className="w-4 h-4 text-[#137333] shrink-0 stroke-[2.5]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pickup person card */}
        <div data-component-version="parent-child-pickup-person-card-v2" className="bg-white rounded-2xl p-4 border border-[#EAE8E1] mt-6">
          <div className="flex items-center justify-between border-b border-[#FAF9F6] pb-3 mb-3">
            <h3 className="text-sm font-serif-koinonia text-[#18181B] font-bold">
              Pickup person
            </h3>
            {isRealUploadedPhoto(pickupPhoto) || pickupPhoto ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] text-[9px] font-bold uppercase tracking-wider">
                Photo Added
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-[#8E8B82] block font-medium uppercase">Name</span>
              <span className="font-semibold text-[#18181B] block mt-0.5 truncate">{pickupName || 'Not specified'}</span>
            </div>
            <div>
              <span className="text-[10px] text-[#8E8B82] block font-medium uppercase">Relationship</span>
              <span className="font-semibold text-[#18181B] block mt-0.5 truncate">{pickupRelation || 'Not specified'}</span>
            </div>
            <div className="col-span-2">
              <span className="text-[10px] text-[#8E8B82] block font-medium uppercase">Phone</span>
              <span className="font-semibold text-[#18181B] block mt-0.5 font-mono">{pickupPhone || 'Not specified'}</span>
            </div>
          </div>

          <div className="bg-[#FAF6EB]/40 rounded-xl p-2.5 border border-[#E5D5AE]/20 mt-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#C59B27] shrink-0" />
            <span className="text-[10px] text-[#9A7326] font-medium">
              Photo ID and pass details may be checked before pickup.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 space-y-3">
          {(currentStatus === 'Pass ready' || currentStatus === 'Checked in' || currentStatus === 'Inside') ? (
            <button
              type="button"
              onClick={() => onNavigate(`/parent/children/${foundChild.id}/pass`)}
              data-component-version="parent-status-view-pass-action-v6"
              className="w-full py-3.5 px-5 rounded-2xl bg-[#18181B] hover:bg-[#27272A] active:opacity-90 text-white font-bold text-sm transition-all duration-200 shadow-sm cursor-pointer focus:outline-none flex items-center justify-center gap-2"
            >
              <QrCode className="w-4 h-4" />
              <span>View pass</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onNavigate('/parent/home')}
            className="w-full py-3.5 px-5 rounded-2xl bg-[#C59B27] hover:bg-[#B58E33] text-[#18181B] font-bold text-sm transition-all duration-200 shadow-2xs cursor-pointer focus:outline-none"
          >
            Back to Home
          </button>
          
          {currentStatus === 'Under review' && (
            <>
              <button
                type="button"
                onClick={handleEditDetails}
                className="w-full py-3.5 px-5 rounded-2xl bg-white hover:bg-[#FAF9F6] border border-[#18181B] text-[#18181B] font-bold text-sm transition-all duration-200 cursor-pointer focus:outline-none"
              >
                Edit details
              </button>
              <button
                type="button"
                onClick={() => setShowWithdrawModal(true)}
                className="w-full py-2.5 px-5 rounded-2xl text-[#6B7280] hover:text-[#4B5563] font-semibold text-xs transition-all cursor-pointer focus:outline-none text-center bg-transparent mt-1"
              >
                Withdraw details
              </button>
            </>
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

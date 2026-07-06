import React, { useState, useEffect } from 'react';
import { AppRoute, AddChildDraft, ParentProfile } from '../types';
import { ArrowLeft, Check, Send, Info, AlertCircle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

interface AddChildStep5ViewProps {
  onNavigate: (route: AppRoute) => void;
  draft?: AddChildDraft | null;
  parentProfile?: ParentProfile;
  onSubmitReview: (draft: AddChildDraft) => Promise<boolean>;
  onSaveDraft: (draft: AddChildDraft, isFinishLater?: boolean) => void;
}

export const AddChildStep5View: React.FC<AddChildStep5ViewProps> = ({
  onNavigate,
  draft,
  parentProfile,
  onSubmitReview,
  onSaveDraft
}) => {
  const { showError } = useNotification();
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!draft || !draft.fullName) {
      onNavigate('/parent/children/new');
    }
  }, [draft, onNavigate]);

  if (!draft || !draft.fullName) {
    return null;
  }

  const calculateAgeDetails = () => {
    let ageYears = draft.age !== null && draft.age !== undefined ? draft.age : null;

    if (draft.dob) {
      const birthDate = new Date(draft.dob);
      const today = new Date();
      if (!isNaN(birthDate.getTime()) && birthDate <= today) {
        let years = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          years--;
        }
        if (years < 0) years = 0;
        ageYears = years;
      }
    }

    if (ageYears === null) {
      ageYears = 0;
    }

    const ageText = ageYears === 0 ? 'Under 1 year old' : `${ageYears} ${ageYears === 1 ? 'year old' : 'years old'}`;
    const groupRaw = draft.ageGroup || 'Ages 4 to 6';

    return { ageText, groupRaw };
  };

  const { ageText, groupRaw } = calculateAgeDetails();

  const formatDobToWords = (dobString?: string) => {
    if (!dobString) return 'Not specified';
    const parts = dobString.split('-');
    if (parts.length === 3) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const year = parts[0];
      if (months[monthIdx]) {
        return `${day} ${months[monthIdx]} ${year}`;
      }
    }
    return dobString;
  };

  const getResolvedPickupDetails = () => {
    const isParent = draft.pickupType === 'parent' || draft.pickup?.pickupType === 'parent' || draft.pickup?.mode === 'parent' || draft.pickupPersonMode === 'parent';
    
    if (isParent) {
      const parentRel = draft.relationship || draft.childDetails?.relationshipToChild || 'Parent';
      const phoneVal = parentProfile?.phoneNumber || parentProfile?.phone || '';
      const whatsappVal = parentProfile?.whatsappNumber || parentProfile?.whatsapp || parentProfile?.phone || parentProfile?.phoneNumber || '';
      return {
        isParent: true,
        fullName: parentProfile?.fullName || '',
        relationship: parentRel,
        phone: phoneVal,
        whatsapp: whatsappVal,
        photoUrl: parentProfile?.photoUrl || '',
        photoFileId: parentProfile?.photoFileId || '',
        initials: parentProfile?.fullName ? parentProfile.fullName.charAt(0).toUpperCase() : 'P'
      };
    } else {
      const fullNameVal = draft.pickupPersonFullName || draft.pickup?.pickupPersonFullName || '';
      const relationshipVal = draft.pickupPersonRelationship || draft.pickup?.pickupPersonRelationship || '';
      const phoneVal = draft.pickupPersonPhone || draft.pickup?.pickupPersonPhone || '';
      const whatsappVal = draft.pickupPersonWhatsapp || draft.pickup?.pickupPersonWhatsApp || '';
      const photoUrlVal = draft.pickupPersonPhotoUrl || draft.pickup?.pickupPersonPhotoUrl || draft.pickup?.pickupPersonPhoto || '';
      return {
        isParent: false,
        fullName: fullNameVal,
        relationship: relationshipVal,
        phone: phoneVal,
        whatsapp: whatsappVal,
        photoUrl: photoUrlVal,
        photoFileId: draft.pickupPersonPhotoFileId || draft.pickup?.pickupPersonPhotoFileId || '',
        initials: fullNameVal ? fullNameVal.charAt(0).toUpperCase() : 'U'
      };
    }
  };

  const pickupDetails = getResolvedPickupDetails();
  const hasMissingPickupData = !draft.pickupType && !draft.pickup?.pickupType;
  
  const isPickupIncomplete = hasMissingPickupData || (
    pickupDetails.isParent
      ? !pickupDetails.fullName || !pickupDetails.fullName.trim() || !pickupDetails.phone || !pickupDetails.phone.trim() || !pickupDetails.photoUrl
      : !pickupDetails.fullName || !pickupDetails.fullName.trim() || !pickupDetails.relationship || !pickupDetails.relationship.trim() || !pickupDetails.phone || !pickupDetails.phone.trim() || !pickupDetails.photoUrl
  );

  const needsAgeReview = draft.needsAgeReview || draft.childDetails?.needsAgeReview || draft.needsReview || (draft.dob && new Date().getFullYear() - new Date(draft.dob).getFullYear() < 4);

  // Check required data across steps
  const isStep1Complete = Boolean(draft.fullName && draft.photoUrl && draft.dob);
  const isStep2Complete = Boolean(draft.ageGroup);
  const isStep3Complete = Boolean(draft.hasAllergies && draft.needsExtraSupport);
  const isStep4Complete = !hasMissingPickupData && (
    pickupDetails.isParent
      ? Boolean(pickupDetails.fullName && pickupDetails.phone && pickupDetails.photoUrl)
      : Boolean(pickupDetails.fullName && pickupDetails.relationship && pickupDetails.phone && pickupDetails.photoUrl)
  );

  const hasMissingSteps = !isStep1Complete || !isStep2Complete || !isStep3Complete || !isStep4Complete;

  const handleSendForReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const newErrors: Record<string, string> = {};

    // 1. Child validations
    if (!draft.fullName || !draft.fullName.trim()) {
      newErrors.fullName = 'Child full name is missing.';
    }
    if (!draft.photoUrl) {
      newErrors.childPhoto = 'Child photo is missing.';
    }
    if (!draft.dob) {
      newErrors.dob = 'Child date of birth is missing.';
    }
    if (!draft.ageGroup) {
      newErrors.ageGroup = 'Suggested age group is missing.';
    }

    // 2. Pickup person validations
    if (isPickupIncomplete) {
      newErrors.pickup = 'Pickup person details are incomplete.';
    } else {
      if (pickupDetails.isParent) {
        if (!pickupDetails.fullName.trim()) {
          newErrors.pickupName = 'Parent full name is missing.';
        }
        if (!pickupDetails.phone.trim()) {
          newErrors.pickupPhone = 'Parent phone number is missing.';
        }
        if (!pickupDetails.photoUrl) {
          newErrors.pickupPhoto = 'Parent profile photo is missing. Please add a profile photo in your profile before sending for review.';
        }
      } else {
        if (!pickupDetails.fullName.trim()) {
          newErrors.pickupName = 'Pickup person full name is missing.';
        }
        if (!pickupDetails.relationship.trim()) {
          newErrors.pickupRelationship = 'Pickup person relationship is missing.';
        }
        if (!pickupDetails.phone.trim()) {
          newErrors.pickupPhone = 'Pickup person phone number is missing.';
        }
        if (!pickupDetails.photoUrl) {
          newErrors.pickupPhoto = 'Pickup person photo is missing. Please go back and upload a photo.';
        }
      }
    }

    if (!isConfirmed) {
      newErrors.confirmed = 'Please confirm the details before sending.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Highlight the first error
      const errorMsg = Object.values(newErrors)[0];
      showError('Details could not be sent', errorMsg);
      return;
    }

    setIsSubmitting(true);

    const submittedDraft: AddChildDraft = {
      ...draft,
      review: {
        detailsConfirmed: isConfirmed,
        submittedAt: new Date().toISOString(),
        status: 'Under review'
      }
    };

    try {
      const success = await onSubmitReview(submittedDraft);
      if (success) {
        // Keep button disabled briefly then navigate
        setTimeout(() => {
          onNavigate('/parent/children/review-sent');
        }, 1000);
      } else {
        setIsSubmitting(false);
        showError('Submission failed', 'We could not send the details right now. Please try again.');
      }
    } catch (err: any) {
      console.error('Submit review error:', err);
      setIsSubmitting(false);
      showError('Submission failed', 'We could not send the details right now. Please try again.');
    }
  };

  const handleSaveAndFinishLater = () => {
    const incompleteDraft: AddChildDraft = {
      ...draft,
      review: {
        detailsConfirmed: isConfirmed,
        status: 'Incomplete'
      }
    };
    onSaveDraft(incompleteDraft, true);
    onNavigate('/parent/home');
  };

  const childFirstName = draft.fullName ? draft.fullName.split(' ')[0] : 'your child';

  return (
    <div className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 px-5 pb-10">
      <div className="space-y-6">
        {/* Top bar */}
        <div className="pt-5 pb-1 flex items-center justify-between relative">
          <button
            type="button"
            onClick={() => onNavigate('/parent/children/new/pickup-person')}
            className="p-1 -ml-1 text-[#18181B] hover:text-[#715D3A] active:opacity-75 transition-all cursor-pointer focus:outline-none shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>
          <span className="text-base sm:text-lg font-serif-koinonia font-bold text-[#18181B] tracking-tight">
            Add a child
          </span>
          <div className="w-5" />
        </div>

        {/* Progress bar */}
        <div className="flex items-center justify-center gap-2 pt-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#D9D6CE]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#D9D6CE]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#D9D6CE]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#D9D6CE]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#C59B27]" />
          </div>
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#715D3A]">
            STEP 5 OF 5
          </span>
        </div>

        {/* Main section heading */}
        <div className="text-center space-y-1.5 pt-1">
          <h1 className="text-xl sm:text-2xl font-serif-koinonia font-bold text-[#18181B]">
            Review details
          </h1>
          <p className="text-xs sm:text-sm text-[#3F3F46] leading-relaxed">
            Please check the information before sending it to the team.
          </p>
        </div>

        {/* Missing steps calm message */}
        {hasMissingSteps && (
          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-3.5 flex items-start space-x-3 text-xs text-[#92400E]">
            <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Some details are missing.</p>
              <p className="mt-0.5">Please review the previous steps before sending for review.</p>
            </div>
          </div>
        )}

        {/* Child photo & basic summary */}
        <div className="flex flex-col items-center pt-2 pb-1">
          <div className="w-32 h-32 rounded-[24px] border border-[#C59B27] p-0.5 bg-white shadow-xs overflow-hidden flex-none">
            {draft.photoUrl ? (
              <img
                src={draft.photoUrl}
                alt={draft.fullName}
                className="w-full h-full rounded-[20px] object-cover object-center block"
              />
            ) : (
              <div className="w-full h-full rounded-[20px] bg-[#FAF8F4] text-[#715D3A] flex items-center justify-center font-bold text-3xl">
                {draft.fullName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <h2 className="text-[#18181B] font-serif-koinonia text-2xl font-medium tracking-tight mt-4 text-center">
            {draft.fullName}
          </h2>
          <p className="text-xs text-[#3F3F46] mt-1 font-normal text-center flex items-center justify-center gap-1.5 flex-wrap">
            <span>{ageText}</span>
            <span className="text-[#D9D6CE]">•</span>
            <span className="text-[#3F3F46]">{groupRaw}</span>
            {needsAgeReview && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 text-[#92400E] border border-amber-200 tracking-wider">
                Review Needed
              </span>
            )}
          </p>
        </div>

        {/* Review Cards Stack */}
        <div className="space-y-4">
          {/* 1. CHILD DETAILS */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-widest uppercase text-[#52525B]">
                CHILD DETAILS
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new')}
                className="text-xs font-bold text-[#C59B27] hover:text-[#9A7326] transition-colors cursor-pointer focus:outline-none"
              >
                Edit
              </button>
            </div>

            <div className="grid grid-cols-2 gap-y-3.5 gap-x-2 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  FULL NAME
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.fullName || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  GENDER
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.gender || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  DATE OF BIRTH
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {formatDobToWords(draft.dob)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  RELATIONSHIP
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.relationship || 'Not specified'}
                </span>
              </div>
            </div>
          </div>

          {/* 2. SCHOOL & AGE GROUP */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-widest uppercase text-[#52525B]">
                SCHOOL & AGE GROUP
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new/care-details')}
                className="text-xs font-bold text-[#C59B27] hover:text-[#9A7326] transition-colors cursor-pointer focus:outline-none"
              >
                Edit
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  CLASS / GRADE
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.schoolClass || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  SUGGESTED AGE GROUP
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.ageGroup || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  PREVIOUS ATTENDANCE
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.attendedBefore === 'Yes' ? 'Yes' : 'No, first time'}
                </span>
              </div>
            </div>
          </div>

          {/* 3. HEALTH & SUPPORT */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-widest uppercase text-[#52525B]">
                HEALTH & SUPPORT
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new/health-and-support')}
                className="text-xs font-bold text-[#C59B27] hover:text-[#9A7326] transition-colors cursor-pointer focus:outline-none"
              >
                Edit
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  ALLERGIES / MEDICAL NOTES
                </span>
                <span className="font-normal text-[#18181B] block mt-1 leading-relaxed">
                  {draft.hasAllergies === 'Yes' && draft.medicalNote ? draft.medicalNote : 'None'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  EXTRA SUPPORT NEEDED
                </span>
                <span className="font-normal text-[#18181B] block mt-1 leading-relaxed">
                  {draft.needsExtraSupport === 'Yes' && draft.supportNote ? draft.supportNote : 'None'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  EMERGENCY CARE CONSENT
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  Granted
                </span>
              </div>
            </div>
          </div>

          {/* 4. PICKUP PERSON */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] transition-all duration-200 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[22px] font-serif-koinonia text-[#18181B] font-medium leading-tight">
                Pickup person
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new/pickup-person')}
                className="text-xs font-bold text-[#C59B27] hover:text-[#9A7326] transition-colors cursor-pointer focus:outline-none"
              >
                Edit
              </button>
            </div>

            {isPickupIncomplete ? (
              <div className="space-y-3 pt-1">
                <div className="text-xs text-red-600 font-medium bg-red-50/50 border border-red-200/60 rounded-xl p-3.5 flex items-start space-x-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="leading-relaxed font-normal">Pickup person details are incomplete.</p>
                    <button
                      type="button"
                      onClick={() => onNavigate('/parent/children/new/pickup-person')}
                      className="font-bold underline text-red-700 hover:text-red-800 mt-1 cursor-pointer focus:outline-none inline-block"
                    >
                      Complete pickup details
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                <div className="flex items-center space-x-3.5">
                  <div className="w-14 h-14 rounded-xl bg-[#FAF8F4] border border-[#EAE8E1] flex items-center justify-center overflow-hidden shrink-0">
                    {pickupDetails.photoUrl ? (
                      <img src={pickupDetails.photoUrl} alt={pickupDetails.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-bold text-lg text-[#715D3A]">
                        {pickupDetails.initials}
                      </span>
                    )}
                  </div>
                  {pickupDetails.photoUrl && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#FAF6EB] text-[#9A7326] border border-[#EAE8E1] tracking-wider uppercase">
                      Photo added
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-y-4 gap-x-8 min-w-0">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#71717A] block">
                      NAME
                    </span>
                    <span className="font-normal text-[16px] text-[#18181B] block mt-1.5 leading-[1.35] line-clamp-2 [word-break:break-word] overflow-wrap-anywhere">
                      {pickupDetails.fullName || 'Not specified'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#71717A] block">
                      RELATION
                    </span>
                    <span className="font-normal text-[16px] text-[#18181B] block mt-1.5 leading-[1.35] line-clamp-2 [word-break:break-word] overflow-wrap-anywhere">
                      {pickupDetails.relationship || 'Not specified'}
                    </span>
                  </div>
                  <div className="min-w-0 min-[560px]:col-span-2">
                    <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#71717A] block">
                      PHONE
                    </span>
                    <span className="font-normal text-[16px] text-[#18181B] block mt-1.5 leading-[1.35] [word-break:break-word] overflow-wrap-anywhere">
                      {pickupDetails.phone || 'Not specified'}
                    </span>
                  </div>
                </div>

                {pickupDetails.isParent && !pickupDetails.photoUrl && (
                  <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-3 flex items-start space-x-2.5 text-xs text-[#92400E] mt-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="leading-relaxed font-normal">
                      Your profile photo is missing. Please <button type="button" onClick={() => onNavigate('/parent/profile/edit')} className="font-bold underline text-[#9A7326] hover:text-[#715D3A]">add a profile photo</button> before sending for review.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. PARENT DETAILS */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-widest uppercase text-[#52525B]">
                PARENT DETAILS
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/profile/edit')}
                className="text-xs font-bold text-[#C59B27] hover:text-[#9A7326] transition-colors cursor-pointer focus:outline-none"
              >
                Edit
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  PRIMARY CONTACT
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {parentProfile?.fullName || 'Parent'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                    PHONE
                  </span>
                  <span className="font-normal text-[#18181B] block mt-1">
                    {parentProfile?.phone || 'Not specified'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                    WHATSAPP
                  </span>
                  <span className="font-normal text-[#18181B] block mt-1">
                    {parentProfile?.whatsapp && parentProfile.whatsapp !== parentProfile.phone
                      ? parentProfile.whatsapp
                      : 'Same as phone'}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#71717A] block">
                  EMAIL
                </span>
                <span className="font-normal text-[#18181B] block mt-1 break-all">
                  {parentProfile?.email || 'Not specified'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmation Form & Actions */}
        <form onSubmit={handleSendForReview} className="space-y-5 pt-2" noValidate>
          <label 
            className={`block p-4 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
              errors.confirmed ? 'bg-red-50/40 border-red-500' : 'bg-[#FAF8F4] border-[#EAE8E1] hover:border-[#C59B27]'
            }`}
          >
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                checked={isConfirmed}
                disabled={isSubmitting}
                onChange={(e) => {
                  setIsConfirmed(e.target.checked);
                  if (errors.confirmed && e.target.checked) {
                    setErrors((prev) => ({ ...prev, confirmed: undefined }));
                  }
                }}
                className="w-4 h-4 rounded border-[#D9D6CE] text-[#C59B27] focus:ring-[#C59B27] mt-0.5 shrink-0 accent-[#C59B27] cursor-pointer"
              />
              <span className="text-xs sm:text-sm text-[#18181B] leading-relaxed font-medium">
                I confirm that these details are correct and up to date.
              </span>
            </div>
            {errors.confirmed && (
              <p className="text-xs text-red-600 font-medium mt-2 pl-7" onClick={(e) => e.stopPropagation()}>{errors.confirmed}</p>
            )}
          </label>

          {/* Action buttons */}
          <div className="space-y-3 pt-1">
            <button
              type="submit"
              disabled={isSubmitting || isPickupIncomplete}
              aria-busy={isSubmitting ? "true" : "false"}
              className={`w-full py-3.5 px-4 font-semibold text-sm rounded-xl transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27] focus:ring-offset-2 flex items-center justify-center gap-2 shadow-2xs ${
                isSubmitting || isPickupIncomplete
                  ? 'bg-[#EAE8E1] text-[#A3A3A3] cursor-not-allowed border border-[#D9D6CE]'
                  : 'bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] hover:-translate-y-[1px] hover:shadow-sm'
              }`}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-[#18181B] shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Sending details...</span>
                </>
              ) : (
                <>
                  <span>Send for review</span>
                  <Send className="w-4 h-4 text-[#18181B] shrink-0" />
                </>
              )}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSaveAndFinishLater}
              className={`w-full py-3.5 px-4 bg-white hover:bg-[#FAF8F4] active:bg-[#F3EFE6] active:scale-[0.99] border border-[#D9D6CE] hover:border-[#C59B27] text-[#18181B] hover:text-[#9A7326] font-semibold text-sm rounded-xl transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27] text-center block ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              Save and finish later
            </button>
          </div>

          {/* Small note */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-[#6B7280] pt-1">
            <Info className="w-4 h-4 text-[#9A7326] shrink-0" />
            <span>You can follow {childFirstName}’s status from Home.</span>
          </div>
        </form>
      </div>
    </div>
  );
};

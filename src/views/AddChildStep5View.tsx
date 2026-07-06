import React, { useState, useEffect } from 'react';
import { AppRoute, AddChildDraft, ParentProfile } from '../types';
import { ArrowLeft, Check, Send, Info, AlertCircle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

interface AddChildStep5ViewProps {
  onNavigate: (route: AppRoute) => void;
  draft?: AddChildDraft | null;
  parentProfile?: ParentProfile;
  onSubmitReview: (draft: AddChildDraft) => void;
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

  // Check required data across steps
  const isStep1Complete = Boolean(draft.fullName && draft.photoUrl);
  const isStep2Complete = Boolean(draft.ageGroup);
  const isStep3Complete = Boolean(draft.hasAllergies && draft.needsExtraSupport);
  const isStep4Complete = Boolean(draft.pickupType);

  const hasMissingSteps = !isStep1Complete || !isStep2Complete || !isStep3Complete || !isStep4Complete;

  const handleSendForReview = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (hasMissingSteps) {
      newErrors.missing = 'Some details are missing. Please review the previous steps.';
    }

    if (!isConfirmed) {
      newErrors.confirmed = 'Confirm that the details are correct.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showError('Details could not be sent', 'Please review the required fields and try again.');
      return;
    }

    const submittedDraft: AddChildDraft = {
      ...draft,
      review: {
        detailsConfirmed: isConfirmed,
        submittedAt: new Date().toISOString(),
        status: 'Under review'
      }
    };
    onSubmitReview(submittedDraft);
    onNavigate('/parent/children/review-sent');
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
          <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl border-2 border-[#C59B27] p-0.5 bg-white shadow-2xs overflow-hidden">
            {draft.photoUrl ? (
              <img
                src={draft.photoUrl}
                alt={draft.fullName}
                className="w-full h-full rounded-xl object-cover"
              />
            ) : (
              <div className="w-full h-full rounded-xl bg-[#F3EFE6] text-[#715D3A] flex items-center justify-center font-bold text-2xl">
                {draft.fullName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] mt-3">
            {draft.fullName}
          </h2>
          <p className="text-xs sm:text-sm text-[#3F3F46] mt-0.5">
            {ageText} • {groupRaw}
          </p>
        </div>

        {/* Review Cards Stack */}
        <div className="space-y-4">
          {/* 1. CHILD DETAILS */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] hover:border-[#C59B27] hover:shadow-2xs active:bg-[#FAF6EB] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider uppercase text-[#18181B]">
                CHILD DETAILS
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new')}
                className="text-xs sm:text-sm font-bold text-[#9A7326] hover:text-[#715D3A] hover:underline active:opacity-75 transition-all cursor-pointer focus:outline-none"
              >
                Edit
              </button>
            </div>

            <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  FULL NAME
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5">
                  {draft.fullName || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  GENDER
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5">
                  {draft.gender || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  DATE OF BIRTH
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5">
                  {formatDobToWords(draft.dob)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  RELATIONSHIP
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5">
                  {draft.relationship || 'Not specified'}
                </span>
              </div>
            </div>
          </div>

          {/* 2. SCHOOL & AGE GROUP */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] hover:border-[#C59B27] hover:shadow-2xs active:bg-[#FAF6EB] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider uppercase text-[#18181B]">
                SCHOOL & AGE GROUP
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new/care-details')}
                className="text-xs sm:text-sm font-bold text-[#9A7326] hover:text-[#715D3A] hover:underline active:opacity-75 transition-all cursor-pointer focus:outline-none"
              >
                Edit
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  CLASS / GRADE
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5">
                  {draft.schoolClass || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  SUGGESTED AGE GROUP
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5">
                  {draft.ageGroup || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  PREVIOUS ATTENDANCE
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5">
                  {draft.attendedBefore === 'Yes' ? 'Yes' : 'No, first time'}
                </span>
              </div>
            </div>
          </div>

          {/* 3. HEALTH & SUPPORT */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] hover:border-[#C59B27] hover:shadow-2xs active:bg-[#FAF6EB] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider uppercase text-[#18181B]">
                HEALTH & SUPPORT
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new/health-and-support')}
                className="text-xs sm:text-sm font-bold text-[#9A7326] hover:text-[#715D3A] hover:underline active:opacity-75 transition-all cursor-pointer focus:outline-none"
              >
                Edit
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  ALLERGIES / MEDICAL NOTES
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5 leading-relaxed">
                  {draft.hasAllergies === 'Yes' && draft.medicalNote ? draft.medicalNote : 'None'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  EXTRA SUPPORT NEEDED
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5 leading-relaxed">
                  {draft.needsExtraSupport === 'Yes' && draft.supportNote ? draft.supportNote : 'None'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  EMERGENCY CARE CONSENT
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5">
                  Granted
                </span>
              </div>
            </div>
          </div>

          {/* 4. PICKUP PERSON */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] hover:border-[#C59B27] hover:shadow-2xs active:bg-[#FAF6EB] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider uppercase text-[#18181B]">
                PICKUP PERSON
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new/pickup-person')}
                className="text-xs sm:text-sm font-bold text-[#9A7326] hover:text-[#715D3A] hover:underline active:opacity-75 transition-all cursor-pointer focus:outline-none"
              >
                Edit
              </button>
            </div>

            {draft.pickupType === 'parent' ? (
              <div className="flex items-center space-x-3 pt-1">
                <div className="w-12 h-12 rounded-xl bg-[#F3EFE6] border border-[#D9D6CE] flex items-center justify-center overflow-hidden shrink-0">
                  {parentProfile?.photoUrl ? (
                    <img src={parentProfile.photoUrl} alt="Parent" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-bold text-base text-[#715D3A]">
                      {parentProfile?.fullName ? parentProfile.fullName.charAt(0).toUpperCase() : 'P'}
                    </span>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-sm text-[#18181B] block">
                    Parent pickup
                  </span>
                  <span className="text-xs text-[#3F3F46] mt-0.5 block">
                    Uses parent profile details and photo.
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-3 pt-1">
                <div className="w-12 h-12 rounded-xl bg-[#F3EFE6] border border-[#D9D6CE] flex items-center justify-center overflow-hidden shrink-0">
                  {draft.pickupPersonPhotoUrl ? (
                    <img
                      src={draft.pickupPersonPhotoUrl}
                      alt={draft.pickupPersonFullName || 'Pickup person'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-bold text-base text-[#715D3A]">
                      {draft.pickupPersonFullName ? draft.pickupPersonFullName.charAt(0).toUpperCase() : 'U'}
                    </span>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-sm text-[#18181B] block leading-snug">
                    {draft.pickupPersonFullName || 'Not specified'}
                  </span>
                  <span className="text-xs text-[#6B7280] block mt-0.5">
                    {draft.pickupPersonRelationship || 'Not specified'}
                  </span>
                  <span className="text-xs font-medium text-[#3F3F46] block mt-0.5">
                    {draft.pickupPersonPhone || 'Not specified'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 5. PARENT DETAILS */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] hover:border-[#C59B27] hover:shadow-2xs active:bg-[#FAF6EB] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider uppercase text-[#18181B]">
                PARENT DETAILS
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/profile/edit')}
                className="text-xs sm:text-sm font-bold text-[#9A7326] hover:text-[#715D3A] hover:underline active:opacity-75 transition-all cursor-pointer focus:outline-none"
              >
                Edit
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  PRIMARY CONTACT
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5">
                  {parentProfile?.fullName || 'Parent'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                    PHONE
                  </span>
                  <span className="font-semibold text-[#18181B] block mt-0.5">
                    {parentProfile?.phone || 'Not specified'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                    WHATSAPP
                  </span>
                  <span className="font-semibold text-[#18181B] block mt-0.5">
                    {parentProfile?.whatsapp && parentProfile.whatsapp !== parentProfile.phone
                      ? parentProfile.whatsapp
                      : 'Same as phone'}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#6B7280] block">
                  EMAIL
                </span>
                <span className="font-semibold text-[#18181B] block mt-0.5 break-all">
                  {parentProfile?.email || 'Not specified'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmation Form & Actions */}
        <form onSubmit={handleSendForReview} className="space-y-5 pt-2" noValidate>
          <div className={`p-4 rounded-xl border transition-all duration-200 ${
            errors.confirmed ? 'bg-red-50/40 border-red-500' : 'bg-[#FAF8F4] border-[#EAE8E1] hover:border-[#C59B27]'
          }`}>
            <label className="flex items-start space-x-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isConfirmed}
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
            </label>
            {errors.confirmed && (
              <p className="text-xs text-red-600 font-medium mt-2 pl-7">{errors.confirmed}</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="space-y-3 pt-1">
            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] active:translate-y-0 text-[#18181B] font-semibold text-sm rounded-xl transition-all duration-200 hover:-translate-y-[1px] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C59B27] focus:ring-offset-2 cursor-pointer shadow-2xs flex items-center justify-center gap-2"
            >
              <span>Send for review</span>
              <Send className="w-4 h-4 text-[#18181B]" />
            </button>
            <button
              type="button"
              onClick={handleSaveAndFinishLater}
              className="w-full py-3.5 px-4 bg-white hover:bg-[#FAF8F4] active:bg-[#F3EFE6] active:scale-[0.99] border border-[#D9D6CE] hover:border-[#C59B27] text-[#18181B] hover:text-[#9A7326] font-semibold text-sm rounded-xl transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27] text-center block"
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

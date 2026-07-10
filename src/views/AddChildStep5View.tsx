import React, { useState, useEffect } from 'react';
import { AppRoute, AddChildDraft, ParentProfile } from '../types';
import { ArrowLeft, Check, Send, Info, AlertCircle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { Button } from '../components/common/Button';
import { extractApiError } from '../services/api';

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
  const [showValidationErrors, setShowValidationErrors] = useState<boolean>(false);

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

  // Robust, dynamic missing fields validator
  const getMissingFields = () => {
    const groups = [];

    // 1. Child Details
    const childFields = [];
    const cName = (draft.childDetails?.fullName || draft.fullName || '').trim();
    if (!cName) {
      childFields.push({ field: 'fullName', message: 'Child full name is missing.' });
    } else if (cName.length < 2) {
      childFields.push({ field: 'fullName', message: 'Child name must be at least 2 characters.' });
    } else if (/\d/.test(cName)) {
      childFields.push({ field: 'fullName', message: 'Child name cannot contain digits.' });
    }

    const cGender = draft.childDetails?.gender || draft.gender;
    if (!cGender || !['Male', 'Female'].includes(cGender)) {
      childFields.push({ field: 'gender', message: 'Child gender is missing.' });
    }

    const cDob = draft.childDetails?.dateOfBirth || draft.dob;
    if (!cDob) {
      childFields.push({ field: 'dob', message: 'Child date of birth is missing.' });
    } else {
      const dobDate = new Date(cDob);
      const now = new Date();
      if (dobDate > now) {
        childFields.push({ field: 'dob', message: 'Date of birth cannot be in the future.' });
      } else {
        const ageInMs = now.getTime() - dobDate.getTime();
        const ageInYears = ageInMs / (1000 * 60 * 60 * 24 * 365.25);
        if (ageInYears > 18) {
          childFields.push({ field: 'dob', message: 'Child must be under 18 years old.' });
        }
      }
    }

    const cRel = draft.childDetails?.relationshipToChild || draft.relationship || '';
    if (!cRel.trim()) {
      childFields.push({ field: 'relationship', message: 'Child relationship to parent/guardian is missing.' });
    }

    const cPhoto = draft.childDetails?.photo || draft.photoUrl;
    if (!cPhoto) {
      childFields.push({ field: 'childPhoto', message: 'Child photo is required.' });
    }

    if (childFields.length > 0) {
      groups.push({
        section: 'Child Details',
        stepRoute: '/parent/children/new' as AppRoute,
        editLabel: 'Edit Child details',
        fields: childFields
      });
    }

    // 2. School & Age Group
    const schoolFields = [];
    const sClass = (draft.schoolAndAgeGroup?.schoolClass || draft.schoolClass || '').trim();
    if (!sClass) {
      schoolFields.push({ field: 'schoolClass', message: 'Class / grade is missing.' });
    }

    const sAttended = draft.schoolAndAgeGroup?.previousChildrenProgramme || draft.attendedBefore;
    if (!sAttended || !['Yes', 'No'].includes(sAttended)) {
      schoolFields.push({ field: 'attendedBefore', message: 'Previous attendance response is required.' });
    }

    if (schoolFields.length > 0) {
      groups.push({
        section: 'School & Age Group',
        stepRoute: '/parent/children/new/care-details' as AppRoute,
        editLabel: 'Edit School & age group',
        fields: schoolFields
      });
    }

    // 3. Health & Support
    const healthFields = [];
    const hMed = draft.healthAndSupport?.hasMedicalNotes || draft.hasAllergies;
    if (!hMed || !['Yes', 'No'].includes(hMed)) {
      healthFields.push({ field: 'hasAllergies', message: 'Medical & allergy response is required.' });
    } else if (hMed === 'Yes') {
      const medNotes = (draft.healthAndSupport?.medicalNotes || draft.medicalNote || '').trim();
      if (!medNotes) {
        healthFields.push({ field: 'medicalNote', message: 'Please provide allergy & medical details.' });
      }
    }

    const hSup = draft.healthAndSupport?.needsExtraSupport || draft.needsExtraSupport;
    if (!hSup || !['Yes', 'No'].includes(hSup)) {
      healthFields.push({ field: 'needsExtraSupport', message: 'Extra support response is required.' });
    } else if (hSup === 'Yes') {
      const supNotes = (draft.healthAndSupport?.supportNotes || draft.supportNote || '').trim();
      if (!supNotes) {
        healthFields.push({ field: 'supportNote', message: 'Please provide extra support details.' });
      }
    }

    const hConf = draft.healthAndSupport?.informationConfirmed || draft.infoConfirmed;
    if (!hConf) {
      healthFields.push({ field: 'infoConfirmed', message: 'Health & care confirmation is required.' });
    }

    if (healthFields.length > 0) {
      groups.push({
        section: 'Health & Support',
        stepRoute: '/parent/children/new/health-and-support' as AppRoute,
        editLabel: 'Edit Health & support',
        fields: healthFields
      });
    }

    // 4. Pickup Person
    const pickupFields = [];
    const pType = draft.pickup?.pickupType || draft.pickupType;
    if (!pType) {
      pickupFields.push({ field: 'pickupType', message: 'Pickup option must be selected.' });
    } else if (pType === 'parent') {
      if (!parentProfile?.fullName || !parentProfile.fullName.trim()) {
        pickupFields.push({ field: 'pickupParentName', message: 'Parent profile name is missing.' });
      }
      const pPhone = parentProfile?.phone || parentProfile?.phoneNumber || '';
      if (!pPhone || !pPhone.trim()) {
        pickupFields.push({ field: 'pickupParentPhone', message: 'Parent profile phone number is missing.' });
      }
      if (!parentProfile?.photoUrl) {
        pickupFields.push({ field: 'pickupParentPhoto', message: 'Parent profile photo is required for parent pickup.' });
      }
    } else if (pType === 'other_person') {
      const pName = (draft.pickup?.pickupPersonFullName || draft.pickupPersonFullName || '').trim();
      if (!pName) {
        pickupFields.push({ field: 'pickupPersonFullName', message: 'Pickup person full name is missing.' });
      } else {
        const parts = pName.split(/\s+/).filter(Boolean);
        if (parts.length < 2) {
          pickupFields.push({ field: 'pickupPersonFullName', message: 'Pickup name must include first and last name.' });
        } else if (/\d/.test(pName)) {
          pickupFields.push({ field: 'pickupPersonFullName', message: 'Pickup name cannot contain digits.' });
        }
      }

      const pRel = (draft.pickup?.pickupPersonRelationship || draft.pickupPersonRelationship || '').trim();
      if (!pRel) {
        pickupFields.push({ field: 'pickupPersonRelationship', message: 'Pickup person relationship is missing.' });
      }

      const pPhone = (draft.pickup?.pickupPersonPhone || draft.pickupPersonPhone || '').trim();
      if (!pPhone) {
        pickupFields.push({ field: 'pickupPersonPhone', message: 'Pickup person phone number is missing.' });
      } else {
        if (!/^[+\d\s]+$/.test(pPhone)) {
          pickupFields.push({ field: 'pickupPersonPhone', message: 'Pickup phone can only contain digits, spaces, and +.' });
        }
      }

      const pPhoto = draft.pickup?.pickupPersonPhoto || draft.pickupPersonPhotoUrl;
      if (!pPhoto) {
        pickupFields.push({ field: 'pickupPersonPhoto', message: 'Pickup person photo is required.' });
      }

      const pApproved = draft.pickup?.approvedByParent || draft.pickupPersonApproved;
      if (!pApproved) {
        pickupFields.push({ field: 'pickupPersonApproved', message: 'Pickup authorization checkbox must be checked.' });
      }
    }

    if (pickupFields.length > 0) {
      groups.push({
        section: 'Pickup Person',
        stepRoute: '/parent/children/new/pickup-person' as AppRoute,
        editLabel: 'Edit Pickup person',
        fields: pickupFields
      });
    }

    // 5. Parent Details
    const parentFields = [];
    if (!parentProfile?.fullName || !parentProfile.fullName.trim()) {
      parentFields.push({ field: 'parentFullName', message: 'Parent full name is missing.' });
    }
    const phoneNum = parentProfile?.phone || parentProfile?.phoneNumber || '';
    if (!phoneNum || !phoneNum.trim()) {
      parentFields.push({ field: 'parentPhone', message: 'Parent phone number is missing.' });
    }
    if (!parentProfile?.email || !parentProfile.email.trim()) {
      parentFields.push({ field: 'parentEmail', message: 'Parent email address is missing.' });
    }
    if (!parentProfile?.photoUrl) {
      parentFields.push({ field: 'parentPhoto', message: 'Parent profile photo is required.' });
    }

    if (parentFields.length > 0) {
      groups.push({
        section: 'Parent Details',
        stepRoute: '/parent/profile/edit' as AppRoute,
        editLabel: 'Edit Parent details',
        fields: parentFields
      });
    }

    return groups;
  };

  const missingGroups = getMissingFields();
  const hasMissingSteps = missingGroups.length > 0;

  // Compatibility variables to prevent any parent flow breaks
  const isStep1Complete = !missingGroups.some(g => g.section === 'Child Details');
  const isStep2Complete = !missingGroups.some(g => g.section === 'School & Age Group');
  const isStep3Complete = !missingGroups.some(g => g.section === 'Health & Support');
  const isStep4Complete = !missingGroups.some(g => g.section === 'Pickup Person');
  const isPickupIncomplete = !isStep4Complete;

  const needsAgeReview = draft.needsAgeReview || draft.childDetails?.needsAgeReview || draft.needsReview || (draft.dob && new Date().getFullYear() - new Date(draft.dob).getFullYear() < 4);

  // Helper to render card-level status badges and inline error lists
  const renderCardStatus = (sectionName: string, hasOptionalEmpty = false, isOptionalEmpty = false) => {
    const group = missingGroups.find(g => g.section === sectionName);
    const hasErrors = group && group.fields.length > 0;

    return (
      <div className="flex flex-col space-y-1.5" data-component-version="parent-review-section-status-v1">
        <div className="flex items-center gap-1.5">
          {hasErrors ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 tracking-wide">
              Needs update
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 tracking-wide">
              Completed
            </span>
          )}
          {(!hasErrors && hasOptionalEmpty && isOptionalEmpty) && (
            <span className="text-[10px] text-zinc-400 italic">Optional details empty</span>
          )}
        </div>
        {hasErrors && (
          <div className="space-y-1 mt-1 pl-1">
            {group.fields.map((f, idx) => (
              <p key={idx} className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-rose-500 shrink-0" />
                {f.message}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleSendForReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!navigator.onLine) {
      showError('You are offline', 'Please reconnect before sending these details.');
      return;
    }

    const freshMissing = getMissingFields();
    if (freshMissing.length > 0 || !isConfirmed) {
      const fieldErrors: Record<string, string> = {};
      freshMissing.forEach(g => {
        g.fields.forEach(f => {
          fieldErrors[f.field] = f.message;
        });
      });
      if (!isConfirmed) {
        fieldErrors.confirmed = 'Please confirm that these details are correct.';
      }
      setErrors(fieldErrors);
      setShowValidationErrors(true);

      // Smooth scroll to top validation panel
      const panel = document.getElementById('validation-summary-panel');
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      showError('Review Checklist Incomplete', 'Please check and complete all required fields listed at the top.');
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
      const apiErr = extractApiError(err) as any;
      
      if (apiErr.errors && Array.isArray(apiErr.errors)) {
        const backendErrors: Record<string, string> = {};
        apiErr.errors.forEach((e: any) => {
          backendErrors[e.field || 'backend'] = e.message;
        });
        setErrors(backendErrors);
        setShowValidationErrors(true);
        showError('Cannot Send for Review', apiErr.message || 'Required details are missing. Please review and try again.');
        
        const panel = document.getElementById('validation-summary-panel');
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        showError('Submission failed', apiErr.message || 'We could not send the details right now. Please try again.');
      }
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

  // Check optional fields emptiness for badges
  const isSchoolNameEmpty = !draft.schoolName || !draft.schoolName.trim();
  const isWhatsappEmpty = !parentProfile?.whatsapp || parentProfile.whatsapp === parentProfile.phone;

  return (
    <div 
      data-view-version="parent-add-child-review-v3-premium-validation"
      className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 px-5 pb-10"
    >
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
          <p className="text-xs sm:text-sm text-[#3F3F46] leading-relaxed font-normal">
            Please check the information before sending it to the team.
          </p>
        </div>

        {/* Specific Missing Details Panel (Phase 2 & Phase 7) */}
        {hasMissingSteps && (
          <div 
            id="validation-summary-panel"
            data-component-version="parent-child-review-validation-v2-specific"
            className="bg-[#FEF2F2] border border-red-200/80 rounded-2xl p-4 space-y-3.5 transition-all duration-300"
          >
            <div className="flex items-start space-x-2.5">
              <AlertCircle className="w-4.5 h-4.5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <h3 className="font-serif-koinonia text-base font-bold text-red-950">
                  Please complete these details
                </h3>
                <p className="text-xs text-red-700 leading-relaxed font-normal">
                  Review the items below before sending this child for review.
                </p>
              </div>
            </div>

            <div className="divide-y divide-red-100 pt-1">
              {missingGroups.map((group, groupIdx) => (
                <div key={groupIdx} className="py-2.5 first:pt-0 last:pb-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold tracking-wider uppercase text-red-800">
                      {group.section}
                    </span>
                    <button
                      type="button"
                      data-component-version="parent-review-fix-action-v1"
                      onClick={() => onNavigate(group.stepRoute)}
                      className="text-[11px] font-bold text-red-700 hover:text-red-900 transition-colors cursor-pointer hover:underline focus:outline-none"
                    >
                      {group.editLabel}
                    </button>
                  </div>
                  <ul className="space-y-1 pl-3.5 list-disc list-outside text-xs text-red-700">
                    {group.fields.map((field, fieldIdx) => (
                      <li key={fieldIdx} className="font-normal">
                        {field.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
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
              <div className="w-full h-full rounded-[20px] bg-[#FAF8F4] text-[#715D3A] flex items-center justify-center font-serif-koinonia font-bold text-3xl">
                {draft.fullName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <h2 className="text-[#18181B] font-serif-koinonia text-xl font-bold tracking-tight mt-4 text-center">
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
          
          {/* 1. CHILD DETAILS CARD */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-[#52525B]">
                CHILD DETAILS
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new')}
                className="text-xs font-semibold text-[#C59B27] hover:text-[#9A7326] transition-colors cursor-pointer focus:outline-none hover:underline"
              >
                Edit
              </button>
            </div>

            {renderCardStatus('Child Details')}

            <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  Full Name
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.fullName || <span className="text-rose-600 font-medium">Required</span>}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  Gender
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.gender || <span className="text-rose-600 font-medium">Required</span>}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  Date of Birth
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.dob ? formatDobToWords(draft.dob) : <span className="text-rose-600 font-medium">Required</span>}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  Relationship
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.relationship || <span className="text-rose-600 font-medium">Required</span>}
                </span>
              </div>
            </div>
          </div>

          {/* 2. SCHOOL & AGE GROUP CARD */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-[#52525B]">
                SCHOOL & AGE GROUP
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new/care-details')}
                className="text-xs font-semibold text-[#C59B27] hover:text-[#9A7326] transition-colors cursor-pointer focus:outline-none hover:underline"
              >
                Edit
              </button>
            </div>

            {renderCardStatus('School & Age Group', true, isSchoolNameEmpty)}

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  Class / Grade
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.schoolClass || <span className="text-rose-600 font-medium">Required</span>}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  School Name
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.schoolName || <span className="text-zinc-400 italic">Not added</span>}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  Previous Attendance
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {draft.attendedBefore ? (draft.attendedBefore === 'Yes' ? 'Yes' : 'No, first time') : <span className="text-rose-600 font-medium">Required</span>}
                </span>
              </div>
            </div>
          </div>

          {/* 3. HEALTH & SUPPORT CARD */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-[#52525B]">
                HEALTH & SUPPORT
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new/health-and-support')}
                className="text-xs font-semibold text-[#C59B27] hover:text-[#9A7326] transition-colors cursor-pointer focus:outline-none hover:underline"
              >
                Edit
              </button>
            </div>

            {renderCardStatus('Health & Support')}

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  Allergies / Medical Notes
                </span>
                <span className="font-normal text-[#18181B] block mt-1 leading-relaxed">
                  {draft.hasAllergies === 'Yes' ? (draft.medicalNote || <span className="text-rose-600 font-medium">Required details empty</span>) : 'None'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  Extra Support Needed
                </span>
                <span className="font-normal text-[#18181B] block mt-1 leading-relaxed">
                  {draft.needsExtraSupport === 'Yes' ? (draft.supportNote || <span className="text-rose-600 font-medium">Required details empty</span>) : 'None'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  Emergency Care Consent
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  Granted
                </span>
              </div>
            </div>
          </div>

          {/* 4. PICKUP PERSON CARD */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] transition-all duration-200 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-[#52525B]">
                PICKUP PERSON
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/children/new/pickup-person')}
                className="text-xs font-semibold text-[#C59B27] hover:text-[#9A7326] transition-colors cursor-pointer focus:outline-none hover:underline"
              >
                Edit
              </button>
            </div>

            {renderCardStatus('Pickup Person')}

            {!isPickupIncomplete && (
              <div className="space-y-4 pt-1">
                <div className="flex items-center space-x-3.5">
                  <div className="w-14 h-14 rounded-xl bg-[#FAF8F4] border border-[#EAE8E1] flex items-center justify-center overflow-hidden shrink-0">
                    {pickupDetails.photoUrl ? (
                      <img src={pickupDetails.photoUrl} alt={pickupDetails.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-serif-koinonia font-bold text-lg text-[#715D3A]">
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

                <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-y-3.5 gap-x-8 min-w-0 text-xs sm:text-sm">
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                      Name
                    </span>
                    <span className="font-normal text-[#18181B] block mt-1 leading-[1.35] line-clamp-2 [word-break:break-word] overflow-wrap-anywhere">
                      {pickupDetails.fullName || 'Not specified'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                      Relation
                    </span>
                    <span className="font-normal text-[#18181B] block mt-1 leading-[1.35] line-clamp-2 [word-break:break-word] overflow-wrap-anywhere">
                      {pickupDetails.relationship || 'Not specified'}
                    </span>
                  </div>
                  <div className="min-w-0 min-[560px]:col-span-2">
                    <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                      Phone
                    </span>
                    <span className="font-normal text-[#18181B] block mt-1 leading-[1.35] [word-break:break-word] overflow-wrap-anywhere">
                      {pickupDetails.phone || 'Not specified'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. PARENT DETAILS CARD */}
          <div className="bg-[#FAF8F4] rounded-2xl p-4 sm:p-5 border border-[#EAE8E1] transition-all duration-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-[#52525B]">
                PARENT DETAILS
              </span>
              <button
                type="button"
                onClick={() => onNavigate('/parent/profile/edit')}
                className="text-xs font-semibold text-[#C59B27] hover:text-[#9A7326] transition-colors cursor-pointer focus:outline-none hover:underline"
              >
                Edit
              </button>
            </div>

            {renderCardStatus('Parent Details', true, isWhatsappEmpty)}

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  Primary Contact
                </span>
                <span className="font-normal text-[#18181B] block mt-1">
                  {parentProfile?.fullName || 'Parent'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                    Phone
                  </span>
                  <span className="font-normal text-[#18181B] block mt-1">
                    {parentProfile?.phone || parentProfile?.phoneNumber || <span className="text-rose-600 font-medium">Required</span>}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                    WhatsApp
                  </span>
                  <span className="font-normal text-[#18181B] block mt-1">
                    {parentProfile?.whatsapp && parentProfile.whatsapp !== parentProfile.phone
                      ? parentProfile.whatsapp
                      : 'Same as phone'}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-medium tracking-wide uppercase text-[#71717A] block">
                  Email
                </span>
                <span className="font-normal text-[#18181B] block mt-1 break-all">
                  {parentProfile?.email || <span className="text-rose-600 font-medium">Required</span>}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmation Form & Actions */}
        <form onSubmit={handleSendForReview} className="space-y-5 pt-2" noValidate>
          <label 
            className={`block p-4 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
              errors.confirmed && showValidationErrors ? 'bg-red-50/40 border-red-500' : 'bg-[#FAF8F4] border-[#EAE8E1] hover:border-[#C59B27]'
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
            {errors.confirmed && showValidationErrors && (
              <p className="text-xs text-red-600 font-medium mt-2 pl-7" onClick={(e) => e.stopPropagation()}>{errors.confirmed}</p>
            )}
          </label>

          {/* Action buttons */}
          <div className="space-y-3 pt-1" data-component-version="parent-review-submit-validation-v1">
            <Button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting ? "true" : "false"}
              fullWidth
              size="lg"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-[#18181B] shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Sending details...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>Send for review</span>
                  <Send className="w-4 h-4 text-[#18181B] shrink-0" />
                </span>
              )}
            </Button>
            
            <div data-component-version="parent-review-save-later-v1" className="space-y-1.5">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveAndFinishLater}
                className={`w-full py-3.5 px-4 bg-white hover:bg-[#FAF8F4] active:bg-[#F3EFE6] active:scale-[0.99] border border-[#D9D6CE] hover:border-[#C59B27] text-[#18181B] hover:text-[#9A7326] font-semibold text-sm rounded-xl transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27] text-center block ${
                  isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                Save for later
              </button>
              <p className="text-center text-[11px] text-zinc-500 font-normal leading-relaxed">
                You can finish this child’s details later.
              </p>
            </div>
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

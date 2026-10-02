import React, { useState, useRef } from 'react';
import { AppRoute, AddChildDraft } from '../types';
import { ArrowLeft, ChevronDown, Info } from 'lucide-react';
import { PremiumSelect } from '../components/common/PremiumSelect';
import { useNotification } from '../context/NotificationContext';
import { PhotoUploadBox } from '../components/common/PhotoUploadBox';
import { KoinoniaDatePicker } from '../components/common/KoinoniaDatePicker';
import { Button } from '../components/common/Button';
import { validateChildName } from '../utils/validation';

interface AddChildStep1ViewProps {
  onNavigate: (route: AppRoute) => void;
  initialDraft?: AddChildDraft | null;
  onSaveDraft: (draft: AddChildDraft, isFinishLater?: boolean) => Promise<boolean> | void | Promise<void>;
}

export const AddChildStep1View: React.FC<AddChildStep1ViewProps> = ({
  onNavigate,
  initialDraft,
  onSaveDraft
}) => {
  const { showSuccess, showError } = useNotification();
  const [photoUrl, setPhotoUrl] = useState<string>(
    initialDraft?.childDetails?.photo || initialDraft?.photoUrl || ''
  );
  const [fullName, setFullName] = useState<string>(
    initialDraft?.childDetails?.fullName || initialDraft?.fullName || ''
  );
  const [gender, setGender] = useState<string>(
    initialDraft?.childDetails?.gender || initialDraft?.gender || ''
  );
  const [dob, setDob] = useState<string>(
    initialDraft?.childDetails?.dateOfBirth || initialDraft?.dob || ''
  );
  const [relationship, setRelationship] = useState<string>(
    initialDraft?.childDetails?.relationshipToChild || initialDraft?.relationship || ''
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Field refs for accessible focus and scroll
  const photoContainerRef = useRef<HTMLDivElement>(null);
  const fullNameInputRef = useRef<HTMLInputElement>(null);
  const genderContainerRef = useRef<HTMLDivElement>(null);
  const dobContainerRef = useRef<HTMLDivElement>(null);
  const relationshipContainerRef = useRef<HTMLDivElement>(null);

  const calculateAgeAndGroup = (dobString: string) => {
    if (!dobString) {
      return { ageYears: null, ageText: null, ageGroup: null };
    }
    const birthDate = new Date(dobString);
    const today = new Date();
    if (isNaN(birthDate.getTime()) || birthDate > today) {
      return { ageYears: null, ageText: null, ageGroup: null };
    }

    let ageYears = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      ageYears--;
    }

    if (ageYears < 0) ageYears = 0;

    let ageGroup = 'Ages 4 to 6';
    if (ageYears < 1) {
      ageGroup = 'Under 1 year';
    } else if (ageYears <= 3) {
      ageGroup = 'Ages 1 to 3';
    } else if (ageYears <= 6) {
      ageGroup = 'Ages 4 to 6';
    } else if (ageYears <= 9) {
      ageGroup = 'Ages 7 to 9';
    } else if (ageYears <= 12) {
      ageGroup = 'Ages 10 to 12';
    } else {
      ageGroup = 'Teens';
    }

    const ageText = ageYears === 0 ? 'Under 1 year' : `${ageYears} ${ageYears === 1 ? 'year' : 'years'}`;

    return { ageYears, ageText, ageGroup };
  };

  const ageData = calculateAgeAndGroup(dob);

  const formatDobDisplay = (dobString: string) => {
    if (!dobString) return '';
    const parts = dobString.split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dobString;
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || isUploadingPhoto) return;

    const newErrors: Record<string, string> = {};

    if (!photoUrl.trim()) {
      newErrors.photo = 'Add the child’s photo.';
    }

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      newErrors.fullName = 'Enter the child’s full name.';
    } else {
      const nameError = validateChildName(trimmedName);
      if (nameError) {
        newErrors.fullName = nameError;
      }
    }

    if (!gender) {
      newErrors.gender = 'Choose gender.';
    }

    if (!dob) {
      newErrors.dob = 'Add date of birth.';
    } else {
      const parsed = new Date(dob);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (parsed > today) {
        newErrors.dob = 'Date of birth cannot be in the future.';
      }
    }

    if (!relationship) {
      newErrors.relationship = 'Choose your relationship to the child.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Focus/scroll to first invalid field
      if (newErrors.photo && photoContainerRef.current) {
        photoContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (newErrors.fullName && fullNameInputRef.current) {
        fullNameInputRef.current.focus();
        fullNameInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (newErrors.gender && genderContainerRef.current) {
        genderContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (newErrors.dob && dobContainerRef.current) {
        dobContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (newErrors.relationship && relationshipContainerRef.current) {
        relationshipContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    const needsAgeReviewVal = ageData.ageYears !== null && ageData.ageYears < 1;
    const draftData: AddChildDraft = {
      ...initialDraft,
      id: initialDraft?.id || `child-${Date.now()}`,
      photoUrl,
      fullName: trimmedName,
      gender,
      dob,
      age: ageData.ageYears,
      ageGroup: ageData.ageGroup || 'Not specified',
      relationship,
      needsReview: needsAgeReviewVal,
      childDetails: {
        photo: photoUrl,
        fullName: trimmedName,
        gender,
        dateOfBirth: dob,
        calculatedAge: ageData.ageYears,
        ageGroup: ageData.ageGroup || 'Not specified',
        relationshipToChild: relationship,
        needsAgeReview: needsAgeReviewVal
      }
    };

    onSaveDraft(draftData, false);
    onNavigate('/parent/children/new/care-details');
  };

  const handleSaveAndFinishLater = async () => {
    if (isSaving || isUploadingPhoto) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErrors((prev) => ({
        ...prev,
        fullName: 'Enter your child’s name before saving.'
      }));
      fullNameInputRef.current?.focus();
      fullNameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Format validation if name entered
    const nameFormatError = validateChildName(trimmedName);
    if (nameFormatError) {
      setErrors((prev) => ({
        ...prev,
        fullName: nameFormatError
      }));
      fullNameInputRef.current?.focus();
      fullNameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Format validation for other partially entered fields
    if (dob) {
      const parsed = new Date(dob);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (parsed > today) {
        setErrors((prev) => ({
          ...prev,
          dob: 'Date of birth cannot be in the future.'
        }));
        dobContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    setIsSaving(true);
    try {
      const needsAgeReviewVal = ageData.ageYears !== null && ageData.ageYears < 1;
      const draftData: AddChildDraft = {
        ...initialDraft,
        id: initialDraft?.id || `child-${Date.now()}`,
        photoUrl: photoUrl.trim() || '',
        fullName: trimmedName,
        gender: gender || 'Not specified',
        dob: dob || '',
        age: ageData.ageYears !== null ? ageData.ageYears : null,
        ageGroup: ageData.ageGroup || 'Not specified',
        relationship: relationship || 'Guardian',
        needsReview: needsAgeReviewVal,
        childDetails: {
          photo: photoUrl.trim() || '',
          fullName: trimmedName,
          gender: gender || 'Not specified',
          dateOfBirth: dob || '',
          calculatedAge: ageData.ageYears !== null ? ageData.ageYears : null,
          ageGroup: ageData.ageGroup || 'Not specified',
          relationshipToChild: relationship || 'Guardian',
          needsAgeReview: needsAgeReviewVal
        }
      };

      const result = await onSaveDraft(draftData, true);
      // Only after a successful server response return to Parent Home
      if (result !== false) {
        onNavigate('/parent/home');
      }
    } catch (err) {
      console.error('Save for later failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 px-5 pb-10">
      <div className="space-y-6">
        {/* Top bar */}
        <div className="pt-5 pb-1 flex items-center justify-between relative">
          <button
            type="button"
            onClick={() => onNavigate('/parent/home')}
            className="p-1 -ml-1 text-[#18181B] hover:text-[#715D3A] transition-colors cursor-pointer focus:outline-none"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>
          <span className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
            Add a child
          </span>
          <div className="w-5" />
        </div>

        {/* Progress */}
        <div className="flex flex-col items-center mt-1 mb-2">
          <span className="text-xs font-medium text-[#715D3A] mb-1.5">Step 1 of 5</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#C59B27]" />
            <div className="w-2 h-2 rounded-full bg-[#D9D6CE]" />
            <div className="w-2 h-2 rounded-full bg-[#D9D6CE]" />
            <div className="w-2 h-2 rounded-full bg-[#D9D6CE]" />
            <div className="w-2 h-2 rounded-full bg-[#D9D6CE]" />
          </div>
        </div>

        {/* Main section heading */}
        <div className="text-center space-y-1">
          <h1 className="text-xl sm:text-2xl font-serif-koinonia font-bold text-[#18181B]">
            Child details
          </h1>
          <p className="text-xs sm:text-sm text-[#3F3F46]">
            Start with your child’s basic information.
          </p>
        </div>

        <form onSubmit={handleContinue} className="space-y-5" noValidate>
          {/* Photo upload */}
          <div ref={photoContainerRef} className="flex flex-col items-center pt-1">
            <PhotoUploadBox
              value={photoUrl}
              onUploaded={(url) => {
                setPhotoUrl(url);
                if (errors.photo) setErrors((prev) => ({ ...prev, photo: undefined }));
              }}
              label="Add child photo"
              helperText="Use a clear photo of the child’s face."
              purpose="child_photo"
              error={errors.photo}
              sizeVariant="w-24-28"
              onUploadingStateChange={(uploading) => {
                setIsUploadingPhoto(uploading);
              }}
            />
          </div>

          {/* 1. Child's full name */}
          <div>
            <label htmlFor="child-full-name" className="text-xs font-semibold text-[#18181B] block mb-1">
              Child’s full name
            </label>
            <input
              id="child-full-name"
              ref={fullNameInputRef}
              type="text"
              placeholder="First and last name"
              value={fullName}
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? "child-full-name-error" : undefined}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
              }}
              className={`w-full py-2 px-0 bg-transparent border-0 border-b ${
                errors.fullName ? 'border-red-500' : 'border-[#D9D6CE]'
              } text-sm text-[#18181B] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#C59B27] focus:ring-0 rounded-none transition-colors`}
            />
            {errors.fullName && (
              <p id="child-full-name-error" role="alert" className="text-xs text-red-600 mt-1 font-medium">
                {errors.fullName}
              </p>
            )}
          </div>

          {/* 2. Gender */}
          <div ref={genderContainerRef}>
            <PremiumSelect
              variant="underline"
              label="Gender"
              value={gender}
              placeholder="Select gender"
              options={['Male', 'Female']}
              error={errors.gender}
              onChange={(val) => {
                setGender(val);
                if (errors.gender) setErrors((prev) => ({ ...prev, gender: undefined }));
              }}
            />
          </div>

          {/* 3. Date of birth */}
          <div ref={dobContainerRef}>
            <KoinoniaDatePicker
              label="Date of birth"
              value={dob}
              onChange={(val) => {
                setDob(val);
                if (errors.dob) setErrors((prev) => ({ ...prev, dob: undefined }));
              }}
              maxDate={new Date().toISOString().split('T')[0]}
              error={errors.dob}
              required
            />

            {/* 4. Age helper text */}
            {ageData.ageText && ageData.ageGroup ? (
              <div className="mt-2 text-xs text-[#18181B] space-y-0.5">
                <div>
                  <span className="font-semibold">Age:</span> {ageData.ageText}
                </div>
                <div>
                  <span className="font-semibold">Age group:</span> {ageData.ageGroup}
                </div>
              </div>
            ) : (
              <p className="mt-1.5 text-xs italic text-[#6B7280]">
                Age will appear after date of birth is added
              </p>
            )}
          </div>

          {/* 5. Relationship to child */}
          <div ref={relationshipContainerRef}>
            <PremiumSelect
              variant="underline"
              label="Relationship to child"
              value={relationship}
              placeholder="Select relationship"
              options={['Mother', 'Father', 'Guardian', 'Grandparent', 'Aunt', 'Uncle', 'Other']}
              error={errors.relationship}
              onChange={(val) => {
                setRelationship(val);
                if (errors.relationship) setErrors((prev) => ({ ...prev, relationship: undefined }));
              }}
            />
          </div>

          {/* Information note */}
          {ageData.ageYears !== null && ageData.ageYears < 2 && (
            <div className="mt-4 bg-[#FAF8F4] border border-[#EAE8E1] p-3.5 rounded-xl flex items-start space-x-2.5 text-xs text-[#3F3F46]">
              <Info className="w-4 h-4 text-[#9A7326] shrink-0 mt-0.5" />
              <span>Some age groups may need team review before passes are prepared.</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 space-y-2.5">
            <Button
              type="submit"
              disabled={isUploadingPhoto || isSaving}
              fullWidth
              size="lg"
            >
              {isUploadingPhoto ? 'Uploading photo...' : 'Continue'}
            </Button>
            <button
              type="button"
              disabled={isUploadingPhoto || isSaving}
              onClick={handleSaveAndFinishLater}
              className="w-full py-2.5 text-xs sm:text-sm font-medium text-[#3F3F46] hover:text-[#9A7326] hover:underline active:opacity-80 transition-all duration-200 cursor-pointer focus:outline-none text-center block disabled:opacity-55"
            >
              {isSaving ? 'Saving...' : 'Save and finish later'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState, useRef } from 'react';
import { AppRoute, AddChildDraft } from '../types';
import { ArrowLeft, Camera, ChevronDown, Calendar, Info } from 'lucide-react';
import { PremiumSelect } from '../components/common/PremiumSelect';
import { api } from '../services/api';
import { useNotification } from '../context/NotificationContext';

interface AddChildStep1ViewProps {
  onNavigate: (route: AppRoute) => void;
  initialDraft?: AddChildDraft | null;
  onSaveDraft: (draft: AddChildDraft, isFinishLater?: boolean) => void;
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        setIsUploadingPhoto(true);
        if (errors.photo) {
          setErrors((prev) => ({ ...prev, photo: undefined }));
        }
        if (api.getToken()) {
          const res = await api.media.uploadFile(file, 'child_photo');
          setPhotoUrl(res.secureUrl || res.url);
        } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) setPhotoUrl(event.target.result as string);
          };
          reader.readAsDataURL(file);
        }
        showSuccess('Photo added', 'The photo has been saved.');
      } catch (err: any) {
        showError('Photo could not be uploaded', 'Please choose another photo and try again.');
        setErrors((prev) => ({ ...prev, photo: 'Failed to upload photo' }));
      } finally {
        setIsUploadingPhoto(false);
      }
    }
  };

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
    const newErrors: Record<string, string> = {};

    if (!photoUrl.trim()) {
      newErrors.photo = 'Add the child’s photo.';
    }

    if (!fullName.trim() || fullName.trim().split(/\s+/).length < 2) {
      newErrors.fullName = 'Enter the child’s full name.';
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
      return;
    }

    const needsAgeReviewVal = ageData.ageYears !== null && ageData.ageYears < 1;
    const draftData: AddChildDraft = {
      ...initialDraft,
      id: initialDraft?.id || `child-${Date.now()}`,
      photoUrl,
      fullName: fullName.trim(),
      gender,
      dob,
      age: ageData.ageYears,
      ageGroup: ageData.ageGroup || 'Not specified',
      relationship,
      needsReview: needsAgeReviewVal,
      childDetails: {
        photo: photoUrl,
        fullName: fullName.trim(),
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

  const handleSaveAndFinishLater = () => {
    const hasAnyData = photoUrl.trim() || fullName.trim() || gender || dob || relationship;
    if (hasAnyData) {
      const needsAgeReviewVal = ageData.ageYears !== null && ageData.ageYears < 1;
      const draftData: AddChildDraft = {
        ...initialDraft,
        id: initialDraft?.id || `child-${Date.now()}`,
        photoUrl: photoUrl.trim() || '',
        fullName: fullName.trim(),
        gender: gender || 'Not specified',
        dob: dob || '',
        age: ageData.ageYears !== null ? ageData.ageYears : null,
        ageGroup: ageData.ageGroup || 'Not specified',
        relationship: relationship || 'Guardian',
        needsReview: needsAgeReviewVal,
        childDetails: {
          photo: photoUrl.trim() || '',
          fullName: fullName.trim(),
          gender: gender || 'Not specified',
          dateOfBirth: dob || '',
          calculatedAge: ageData.ageYears !== null ? ageData.ageYears : null,
          ageGroup: ageData.ageGroup || 'Not specified',
          relationshipToChild: relationship || 'Guardian',
          needsAgeReview: needsAgeReviewVal
        }
      };
      onSaveDraft(draftData, true);
    }
    onNavigate('/parent/home');
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
          <div className="flex flex-col items-center pt-1">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border border-[#D9D6CE] bg-[#FAF9F6] flex flex-col items-center justify-center cursor-pointer hover:border-[#C59B27] hover:bg-[#FAF8F4] active:scale-[0.99] transition-all duration-200 relative overflow-hidden shadow-2xs"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="Child preview" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-7 h-7 text-[#C59B27] stroke-[1.75]" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <span className="text-xs font-semibold text-[#18181B] mt-2.5">Add child photo</span>
            <span className="text-[11px] sm:text-xs text-[#6B7280] mt-0.5">
              Use a clear photo of the child’s face.
            </span>
            {errors.photo && <p className="text-xs text-red-600 mt-1.5 font-medium text-center">{errors.photo}</p>}
          </div>

          {/* 1. Child's full name */}
          <div>
            <label className="text-xs font-semibold text-[#18181B] block mb-1">
              Child’s full name
            </label>
            <input
              type="text"
              placeholder="First and last name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
              }}
              className="w-full py-2 px-0 bg-transparent border-0 border-b border-[#D9D6CE] text-sm text-[#18181B] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#C59B27] focus:ring-0 rounded-none transition-colors"
            />
            {errors.fullName && <p className="text-xs text-red-600 mt-1 font-medium">{errors.fullName}</p>}
          </div>

          {/* 2. Gender */}
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

          {/* 3. Date of birth */}
          <div>
            <label className="text-xs font-semibold text-[#18181B] block mb-1">
              Date of birth
            </label>
            <div className="relative">
              <div className={`w-full py-2 px-0 bg-transparent border-0 border-b border-[#D9D6CE] text-sm flex items-center justify-between ${!dob ? 'text-[#9CA3AF]' : 'text-[#18181B]'}`}>
                <span>{dob ? formatDobDisplay(dob) : 'mm/dd/yyyy'}</span>
                <Calendar className="w-4 h-4 text-[#18181B] shrink-0 pointer-events-none" />
              </div>
              <input
                type="date"
                value={dob}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  setDob(e.target.value);
                  if (errors.dob) setErrors((prev) => ({ ...prev, dob: undefined }));
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
            {errors.dob && <p className="text-xs text-red-600 mt-1 font-medium">{errors.dob}</p>}

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

          {/* Information note */}
          <div className="mt-4 bg-[#FAF8F4] border border-[#EAE8E1] p-3.5 rounded-xl flex items-start space-x-2.5 text-xs text-[#3F3F46]">
            <Info className="w-4 h-4 text-[#9A7326] shrink-0 mt-0.5" />
            <span>Some age groups may need team review before passes are prepared.</span>
          </div>

          {/* Actions */}
          <div className="pt-2 space-y-2.5">
            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] active:translate-y-0 text-[#18181B] font-semibold text-sm rounded-xl transition-all duration-200 hover:-translate-y-[1px] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C59B27] focus:ring-offset-2 cursor-pointer shadow-2xs text-center block"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={handleSaveAndFinishLater}
              className="w-full py-2.5 text-xs sm:text-sm font-medium text-[#3F3F46] hover:text-[#9A7326] hover:underline active:opacity-80 transition-all duration-200 cursor-pointer focus:outline-none text-center block"
            >
              Save and finish later
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

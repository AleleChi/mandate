import React, { useState, useEffect, useRef } from 'react';
import { AppRoute, AddChildDraft, ParentProfile } from '../types';
import { ArrowLeft, Check, Camera, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { useNotification } from '../context/NotificationContext';

interface AddChildStep4ViewProps {
  onNavigate: (route: AppRoute) => void;
  draft?: AddChildDraft | null;
  parentProfile?: ParentProfile;
  onSaveDraft: (draft: AddChildDraft, isFinishLater?: boolean) => void;
}

export const AddChildStep4View: React.FC<AddChildStep4ViewProps> = ({
  onNavigate,
  draft,
  parentProfile,
  onSaveDraft
}) => {
  const { showSuccess, showError } = useNotification();
  const [pickupType, setPickupType] = useState<'parent' | 'other_person'>(
    draft?.pickup?.pickupType || draft?.pickupType || 'parent'
  );
  const [pickupPersonPhotoUrl, setPickupPersonPhotoUrl] = useState<string>(
    draft?.pickup?.pickupPersonPhoto || draft?.pickupPersonPhotoUrl || ''
  );
  const [pickupPersonFullName, setPickupPersonFullName] = useState<string>(
    draft?.pickup?.pickupPersonFullName || draft?.pickupPersonFullName || ''
  );
  const [pickupPersonRelationship, setPickupPersonRelationship] = useState<string>(
    draft?.pickup?.pickupPersonRelationship || draft?.pickupPersonRelationship || ''
  );
  const [pickupPersonPhone, setPickupPersonPhone] = useState<string>(
    draft?.pickup?.pickupPersonPhone || draft?.pickupPersonPhone || ''
  );
  const [pickupPersonWhatsapp, setPickupPersonWhatsapp] = useState<string>(
    draft?.pickup?.pickupPersonWhatsApp || draft?.pickupPersonWhatsapp || ''
  );
  const [pickupPersonApproved, setPickupPersonApproved] = useState<boolean>(
    draft?.pickup?.approvedByParent !== undefined
      ? draft.pickup.approvedByParent
      : (draft?.pickupPersonApproved || false)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!draft || !draft.fullName) {
      onNavigate('/parent/children/new');
    }
  }, [draft, onNavigate]);

  const calculateAgeDetails = () => {
    if (!draft) return { ageText: '0 YEARS OLD', group: 'AGES 4-6' };

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

    const ageText = ageYears === 0 ? 'UNDER 1 YEAR OLD' : `${ageYears} ${ageYears === 1 ? 'YEAR OLD' : 'YEARS OLD'}`;
    const groupRaw = draft.ageGroup || 'Ages 4 to 6';
    // Format group like screenshot: AGES 7-9 or uppercase
    const groupFormatted = groupRaw.toUpperCase().replace(' TO ', '-');

    return { ageText, groupFormatted };
  };

  const { ageText, groupFormatted } = calculateAgeDetails();

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        if (errors.pickupPersonPhotoUrl) {
          setErrors((prev) => ({ ...prev, pickupPersonPhotoUrl: undefined }));
        }
        if (api.getToken()) {
          const res = await api.media.uploadFile(file, 'pickup_person_photo');
          setPickupPersonPhotoUrl(res.secureUrl || res.url);
        } else {
          const reader = new FileReader();
          reader.onloadend = () => {
            setPickupPersonPhotoUrl(reader.result as string);
          };
          reader.readAsDataURL(file);
        }
        showSuccess('Photo added', 'The photo has been saved.');
      } catch (err: any) {
        showError('Photo could not be uploaded', 'Please choose another photo and try again.');
        setErrors((prev) => ({ ...prev, pickupPersonPhotoUrl: 'Failed to upload photo' }));
      }
    }
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!pickupType) {
      newErrors.pickupType = 'Choose who will pick up this child.';
    } else if (pickupType === 'other_person') {
      if (!pickupPersonPhotoUrl) {
        newErrors.pickupPersonPhotoUrl = 'Add the pickup person’s photo.';
      }
      if (!pickupPersonFullName.trim()) {
        newErrors.pickupPersonFullName = 'Enter the pickup person’s full name.';
      }
      if (!pickupPersonRelationship.trim()) {
        newErrors.pickupPersonRelationship = 'Add the person’s relationship to the child.';
      }
      if (!pickupPersonPhone.trim()) {
        newErrors.pickupPersonPhone = 'Enter the pickup person’s phone number.';
      } else {
        const cleanDigits = pickupPersonPhone.replace(/\D/g, '');
        if (cleanDigits.length < 10) {
          newErrors.pickupPersonPhone = 'Phone number must contain at least 10 digits.';
        }
      }
      if (pickupPersonWhatsapp.trim()) {
        const cleanWhatsapp = pickupPersonWhatsapp.replace(/\D/g, '');
        if (cleanWhatsapp.length < 10) {
          newErrors.pickupPersonWhatsapp = 'WhatsApp number must contain at least 10 digits.';
        }
      }
      if (!pickupPersonApproved) {
        newErrors.pickupPersonApproved = 'Confirm that this person can pick up your child.';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (draft) {
      let updatedDraft: AddChildDraft;
      if (pickupType === 'parent') {
        updatedDraft = {
          ...draft,
          pickupType: 'parent',
          pickupPersonFullName: parentProfile?.fullName || 'Parent',
          pickupPersonPhone: parentProfile?.phone || '',
          pickupPersonWhatsapp: parentProfile?.whatsapp || '',
          pickupPersonPhotoUrl: parentProfile?.photoUrl || '',
          pickupPersonRelationship: 'Parent',
          pickupPersonApproved: true,
          pickup: {
            pickupType: 'parent',
            pickupPersonPhoto: parentProfile?.photoUrl || '',
            pickupPersonFullName: parentProfile?.fullName || 'Parent',
            pickupPersonRelationship: 'Parent',
            pickupPersonPhone: parentProfile?.phone || '',
            pickupPersonWhatsApp: parentProfile?.whatsapp || '',
            approvedByParent: true
          }
        };
      } else {
        updatedDraft = {
          ...draft,
          pickupType: 'other_person',
          pickupPersonFullName: pickupPersonFullName.trim(),
          pickupPersonRelationship: pickupPersonRelationship.trim(),
          pickupPersonPhone: pickupPersonPhone.trim(),
          pickupPersonWhatsapp: pickupPersonWhatsapp.trim(),
          pickupPersonPhotoUrl,
          pickupPersonApproved,
          pickup: {
            pickupType: 'other_person',
            pickupPersonPhoto: pickupPersonPhotoUrl,
            pickupPersonFullName: pickupPersonFullName.trim(),
            pickupPersonRelationship: pickupPersonRelationship.trim(),
            pickupPersonPhone: pickupPersonPhone.trim(),
            pickupPersonWhatsApp: pickupPersonWhatsapp.trim(),
            approvedByParent: pickupPersonApproved
          }
        };
      }
      onSaveDraft(updatedDraft, false);
    }

    onNavigate('/parent/children/new/review');
  };

  const handleSaveAndFinishLater = () => {
    if (draft) {
      let updatedDraft: AddChildDraft;
      if (pickupType === 'parent') {
        updatedDraft = {
          ...draft,
          pickupType: 'parent',
          pickupPersonFullName: parentProfile?.fullName || 'Parent',
          pickupPersonPhone: parentProfile?.phone || '',
          pickupPersonWhatsapp: parentProfile?.whatsapp || '',
          pickupPersonPhotoUrl: parentProfile?.photoUrl || '',
          pickupPersonRelationship: 'Parent',
          pickupPersonApproved: true,
          pickup: {
            pickupType: 'parent',
            pickupPersonPhoto: parentProfile?.photoUrl || '',
            pickupPersonFullName: parentProfile?.fullName || 'Parent',
            pickupPersonRelationship: 'Parent',
            pickupPersonPhone: parentProfile?.phone || '',
            pickupPersonWhatsApp: parentProfile?.whatsapp || '',
            approvedByParent: true
          }
        };
      } else {
        updatedDraft = {
          ...draft,
          pickupType: 'other_person',
          pickupPersonFullName: pickupPersonFullName.trim(),
          pickupPersonRelationship: pickupPersonRelationship.trim(),
          pickupPersonPhone: pickupPersonPhone.trim(),
          pickupPersonWhatsapp: pickupPersonWhatsapp.trim(),
          pickupPersonPhotoUrl,
          pickupPersonApproved,
          pickup: {
            pickupType: 'other_person',
            pickupPersonPhoto: pickupPersonPhotoUrl,
            pickupPersonFullName: pickupPersonFullName.trim(),
            pickupPersonRelationship: pickupPersonRelationship.trim(),
            pickupPersonPhone: pickupPersonPhone.trim(),
            pickupPersonWhatsApp: pickupPersonWhatsapp.trim(),
            approvedByParent: pickupPersonApproved
          }
        };
      }
      onSaveDraft(updatedDraft, true);
    }
    onNavigate('/parent/home');
  };

  if (!draft || !draft.fullName) {
    return null;
  }

  return (
    <div className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 px-5 pb-10">
      <div className="space-y-5">
        {/* Top bar */}
        <div className="pt-5 pb-1 flex items-center justify-between relative">
          <button
            type="button"
            onClick={() => onNavigate('/parent/children/new/health-and-support')}
            className="p-1 -ml-1 text-[#18181B] hover:text-[#715D3A] transition-colors cursor-pointer focus:outline-none shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>
          <span className="text-base sm:text-lg font-serif-koinonia font-bold text-[#18181B] tracking-tight">
            Add a child
          </span>
          <div className="w-5" />
        </div>

        {/* Progress indicator */}
        <div className="flex flex-col items-center pt-1 mb-1">
          <span className="text-xs font-semibold text-[#715D3A] mb-1.5">
            Step 4 of 5
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#D9D6CE]" />
            <div className="w-2 h-2 rounded-full bg-[#D9D6CE]" />
            <div className="w-2 h-2 rounded-full bg-[#D9D6CE]" />
            <div className="w-2 h-2 rounded-full bg-[#C59B27]" />
            <div className="w-2 h-2 rounded-full bg-[#D9D6CE]" />
          </div>
        </div>

        {/* Intro */}
        <div className="text-center space-y-1 pt-1">
          <h1 className="text-xl sm:text-2xl font-serif-koinonia font-bold text-[#18181B]">
            Who can pick up this child?
          </h1>
          <p className="text-xs sm:text-sm text-[#3F3F46]">
            Add the person the team should confirm before pickup.
          </p>
        </div>

        {/* Child summary card */}
        <div className="bg-white border border-[#EAE8E1] rounded-xl p-3.5 shadow-2xs flex items-center space-x-3.5">
          {draft.photoUrl ? (
            <img
              src={draft.photoUrl}
              alt={draft.fullName}
              className="w-12 h-12 rounded-xl object-cover shrink-0 border border-[#EAE8E1]"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-[#F3EFE6] text-[#715D3A] flex items-center justify-center font-bold text-lg shrink-0 border border-[#D9D6CE]/50">
              {draft.fullName ? draft.fullName.charAt(0).toUpperCase() : 'C'}
            </div>
          )}
          <div className="overflow-hidden">
            <h3 className="text-base font-serif-koinonia font-bold text-[#18181B] leading-tight truncate">
              {draft.fullName}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-[10px] sm:text-[11px] font-bold text-[#3F3F46] tracking-wide">
              <span>{ageText}</span>
              <span className="text-[#9CA3AF]">•</span>
              <span className="bg-[#F3EFE6] text-[#715D3A] px-1.5 py-0.5 rounded uppercase font-bold">
                {groupFormatted}
              </span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleContinue} className="space-y-5" noValidate>
          {/* Pickup choice cards */}
          <div className="space-y-3 pt-1">
            {/* Option 1: Parent */}
            <div
              onClick={() => {
                setPickupType('parent');
                if (errors.pickupType) setErrors((prev) => ({ ...prev, pickupType: undefined }));
              }}
              className={`p-4 rounded-xl cursor-pointer transition-all duration-200 active:scale-[0.99] flex items-center justify-between border ${
                pickupType === 'parent'
                  ? 'bg-[#FAF8F4] border-[#C59B27] shadow-2xs'
                  : 'bg-white border-[#EAE8E1] hover:border-[#C59B27] hover:bg-[#FAF8F4]'
              }`}
            >
              <div className="pr-3">
                <h4 className="font-semibold text-sm sm:text-base text-[#18181B] leading-snug">
                  I will pick up this child
                </h4>
                <p className="text-xs sm:text-sm text-[#3F3F46] mt-0.5 leading-relaxed">
                  Use my parent details and photo for pickup.
                </p>
              </div>
              <div className="shrink-0">
                {pickupType === 'parent' ? (
                  <div className="w-6 h-6 rounded-full bg-[#C59B27] text-white flex items-center justify-center shadow-2xs">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full border border-[#D9D6CE]" />
                )}
              </div>
            </div>

            {/* Option 2: Someone else */}
            <div
              onClick={() => {
                setPickupType('other_person');
                if (errors.pickupType) setErrors((prev) => ({ ...prev, pickupType: undefined }));
              }}
              className={`p-4 rounded-xl cursor-pointer transition-all duration-200 active:scale-[0.99] flex items-center justify-between border ${
                pickupType === 'other_person'
                  ? 'bg-[#FAF8F4] border-[#C59B27] shadow-2xs'
                  : 'bg-white border-[#EAE8E1] hover:border-[#C59B27] hover:bg-[#FAF8F4]'
              }`}
            >
              <div className="pr-3">
                <h4 className="font-semibold text-sm sm:text-base text-[#18181B] leading-snug">
                  Someone else will pick up this child
                </h4>
                <p className="text-xs sm:text-sm text-[#3F3F46] mt-0.5 leading-relaxed">
                  Add the person’s details and a clear photo.
                </p>
              </div>
              <div className="shrink-0">
                {pickupType === 'other_person' ? (
                  <div className="w-6 h-6 rounded-full bg-[#C59B27] text-white flex items-center justify-center shadow-2xs">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full border border-[#D9D6CE]" />
                )}
              </div>
            </div>
            {errors.pickupType && (
              <p className="text-xs text-red-600 font-medium">{errors.pickupType}</p>
            )}
          </div>

          {/* Pickup person section (Only shown when Option 2 selected) */}
          {pickupType === 'other_person' && (
            <div className="space-y-5 pt-3 animate-fadeIn">
              <h2 className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B]">
                Pickup person
              </h2>

              {/* Photo upload */}
              <div className="flex flex-col items-center">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-24 h-24 rounded-2xl border-2 border-dashed ${
                    errors.pickupPersonPhotoUrl ? 'border-red-500' : 'border-[#D9D6CE]'
                  } bg-[#FAF8F4] flex flex-col items-center justify-center cursor-pointer hover:border-[#C59B27] hover:bg-[#F3EFE6] active:scale-[0.99] transition-all duration-200 relative overflow-hidden shadow-2xs`}
                >
                  {pickupPersonPhotoUrl ? (
                    <img
                      src={pickupPersonPhotoUrl}
                      alt="Pickup person"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera className="w-6 h-6 text-[#9A7326]" />
                  )}
                </div>
                <div className="text-center mt-2.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="font-semibold text-sm text-[#18181B] hover:text-[#9A7326] transition-colors focus:outline-none cursor-pointer block mx-auto"
                  >
                    Add pickup person photo
                  </button>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Use a clear photo of the person’s face
                  </p>
                </div>
                {errors.pickupPersonPhotoUrl && (
                  <p className="text-xs text-red-600 font-medium mt-1">
                    {errors.pickupPersonPhotoUrl}
                  </p>
                )}
              </div>

              {/* Fields */}
              <div className="space-y-4">
                {/* Full name */}
                <div>
                  <label className="text-[11px] font-bold tracking-wider uppercase text-[#715D3A] block mb-1.5">
                    FULL NAME
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={pickupPersonFullName}
                    onChange={(e) => {
                      setPickupPersonFullName(e.target.value);
                      if (errors.pickupPersonFullName) {
                        setErrors((prev) => ({ ...prev, pickupPersonFullName: undefined }));
                      }
                    }}
                    className={`w-full py-3 px-3.5 bg-white border ${
                      errors.pickupPersonFullName ? 'border-red-500' : 'border-[#D9D6CE]'
                    } rounded-xl text-sm text-[#18181B] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#C59B27] shadow-2xs transition-colors`}
                  />
                  {errors.pickupPersonFullName && (
                    <p className="text-xs text-red-600 font-medium mt-1">
                      {errors.pickupPersonFullName}
                    </p>
                  )}
                </div>

                {/* Relationship to child */}
                <div>
                  <label className="text-[11px] font-bold tracking-wider uppercase text-[#715D3A] block mb-1.5">
                    RELATIONSHIP TO CHILD
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Uncle"
                    value={pickupPersonRelationship}
                    onChange={(e) => {
                      setPickupPersonRelationship(e.target.value);
                      if (errors.pickupPersonRelationship) {
                        setErrors((prev) => ({ ...prev, pickupPersonRelationship: undefined }));
                      }
                    }}
                    className={`w-full py-3 px-3.5 bg-white border ${
                      errors.pickupPersonRelationship ? 'border-red-500' : 'border-[#D9D6CE]'
                    } rounded-xl text-sm text-[#18181B] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#C59B27] shadow-2xs transition-colors`}
                  />
                  {errors.pickupPersonRelationship && (
                    <p className="text-xs text-red-600 font-medium mt-1">
                      {errors.pickupPersonRelationship}
                    </p>
                  )}
                </div>

                {/* Phone number */}
                <div>
                  <label className="text-[11px] font-bold tracking-wider uppercase text-[#715D3A] block mb-1.5">
                    PHONE NUMBER
                  </label>
                  <input
                    type="tel"
                    placeholder="0800 000 0000"
                    value={pickupPersonPhone}
                    onChange={(e) => {
                      setPickupPersonPhone(e.target.value);
                      if (errors.pickupPersonPhone) {
                        setErrors((prev) => ({ ...prev, pickupPersonPhone: undefined }));
                      }
                    }}
                    className={`w-full py-3 px-3.5 bg-white border ${
                      errors.pickupPersonPhone ? 'border-red-500' : 'border-[#D9D6CE]'
                    } rounded-xl text-sm text-[#18181B] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#C59B27] shadow-2xs transition-colors`}
                  />
                  {errors.pickupPersonPhone && (
                    <p className="text-xs text-red-600 font-medium mt-1">
                      {errors.pickupPersonPhone}
                    </p>
                  )}
                </div>

                {/* WhatsApp number */}
                <div>
                  <label className="text-[11px] font-bold tracking-wider uppercase text-[#715D3A] block mb-1.5">
                    WHATSAPP NUMBER (OPTIONAL)
                  </label>
                  <input
                    type="tel"
                    placeholder="0800 000 0000"
                    value={pickupPersonWhatsapp}
                    onChange={(e) => {
                      setPickupPersonWhatsapp(e.target.value);
                      if (errors.pickupPersonWhatsapp) {
                        setErrors((prev) => ({ ...prev, pickupPersonWhatsapp: undefined }));
                      }
                    }}
                    className={`w-full py-3 px-3.5 bg-white border ${
                      errors.pickupPersonWhatsapp ? 'border-red-500' : 'border-[#D9D6CE]'
                    } rounded-xl text-sm text-[#18181B] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#C59B27] shadow-2xs transition-colors`}
                  />
                  {errors.pickupPersonWhatsapp && (
                    <p className="text-xs text-red-600 font-medium mt-1">
                      {errors.pickupPersonWhatsapp}
                    </p>
                  )}
                </div>
              </div>

              {/* Approval checkbox */}
              <div className="pt-2">
                <label className="flex items-center space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pickupPersonApproved}
                    onChange={(e) => {
                      setPickupPersonApproved(e.target.checked);
                      if (errors.pickupPersonApproved && e.target.checked) {
                        setErrors((prev) => ({ ...prev, pickupPersonApproved: undefined }));
                      }
                    }}
                    className="w-4 h-4 rounded border-[#D9D6CE] text-[#C59B27] focus:ring-[#C59B27] accent-[#C59B27] cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm text-[#18181B] font-normal">
                    I approve this person to pick up my child.
                  </span>
                </label>
                {errors.pickupPersonApproved && (
                  <p className="text-xs text-red-600 font-medium mt-1.5 pl-7">
                    {errors.pickupPersonApproved}
                  </p>
                )}
              </div>

              {/* Information note */}
              <div className="bg-[#FAF8F4] border border-[#EAE8E1] rounded-xl p-3.5 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-[#9A7326] shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-[#3F3F46] leading-relaxed">
                  At pickup, the team will compare the photo and contact details before releasing the child.
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 space-y-2.5">
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

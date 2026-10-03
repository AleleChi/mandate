import React, { useState, useEffect } from 'react';
import { AppRoute, AddChildDraft } from '../types';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/common/Button';

interface AddChildStep3ViewProps {
  onNavigate: (route: AppRoute) => void;
  draft?: AddChildDraft | null;
  onSaveDraft: (draft: AddChildDraft, isFinishLater?: boolean) => void;
}

export const AddChildStep3View: React.FC<AddChildStep3ViewProps> = ({
  onNavigate,
  draft,
  onSaveDraft
}) => {
  const [hasAllergies, setHasAllergies] = useState<'Yes' | 'No'>(
    draft?.healthAndSupport?.hasMedicalNotes || draft?.hasAllergies || 'No'
  );
  const [medicalNote, setMedicalNote] = useState<string>(
    draft?.healthAndSupport?.medicalNotes || draft?.medicalNote || ''
  );
  const [needsExtraSupport, setNeedsExtraSupport] = useState<'Yes' | 'No'>(
    draft?.healthAndSupport?.needsExtraSupport || draft?.needsExtraSupport || 'No'
  );
  const [supportNote, setSupportNote] = useState<string>(
    draft?.healthAndSupport?.supportNotes || draft?.supportNote || ''
  );
  const [infoConfirmed, setInfoConfirmed] = useState<boolean>(
    draft?.healthAndSupport?.informationConfirmed !== undefined
      ? draft.healthAndSupport.informationConfirmed
      : (draft?.infoConfirmed || false)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!draft || !draft.fullName) {
      onNavigate('/parent/children/new');
    }
  }, [draft, onNavigate]);

  const calculateAgeDetails = () => {
    if (!draft) return { ageText: '', group: 'Ages 4 to 6' };

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
    const group = draft.ageGroup || 'Ages 4 to 6';

    return { ageText, group };
  };

  const { ageText, group } = calculateAgeDetails();

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!hasAllergies) {
      newErrors.hasAllergies = 'Choose Yes or No.';
    } else if (hasAllergies === 'Yes' && !medicalNote.trim()) {
      newErrors.medicalNote = 'Add the medical note.';
    }

    if (!needsExtraSupport) {
      newErrors.needsExtraSupport = 'Choose Yes or No.';
    } else if (needsExtraSupport === 'Yes' && !supportNote.trim()) {
      newErrors.supportNote = 'Add the support note.';
    }

    if (!infoConfirmed) {
      newErrors.infoConfirmed = 'Confirm that the information is correct.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (draft) {
      const updatedDraft: AddChildDraft = {
        ...draft,
        hasAllergies,
        medicalNote: medicalNote.trim(),
        needsExtraSupport,
        supportNote: supportNote.trim(),
        infoConfirmed,
        healthAndSupport: {
          hasMedicalNotes: hasAllergies,
          medicalNotes: medicalNote.trim(),
          needsExtraSupport,
          supportNotes: supportNote.trim(),
          informationConfirmed: infoConfirmed
        }
      };
      onSaveDraft(updatedDraft, false);
    }
    onNavigate('/parent/children/new/pickup-person');
  };

  const handleSaveAndFinishLater = () => {
    if (draft) {
      const updatedDraft: AddChildDraft = {
        ...draft,
        hasAllergies,
        medicalNote: medicalNote.trim(),
        needsExtraSupport,
        supportNote: supportNote.trim(),
        infoConfirmed,
        healthAndSupport: {
          hasMedicalNotes: hasAllergies,
          medicalNotes: medicalNote.trim(),
          needsExtraSupport,
          supportNotes: supportNote.trim(),
          informationConfirmed: infoConfirmed
        }
      };
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
            onClick={() => onNavigate('/parent/children/new/care-details')}
            className="p-1 -ml-1 text-[#18181B] hover:text-[#715D3A] transition-colors cursor-pointer focus:outline-none shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#6B7280]">
              ADD A CHILD
            </span>
            <span className="text-base sm:text-lg font-serif-koinonia font-bold text-[#9A7326] tracking-tight">
              Step 3 of 5
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-[#D9D6CE]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#D9D6CE]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#C59B27]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#D9D6CE]" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#D9D6CE]" />
          </div>
        </div>

        {/* Main section heading */}
        <div className="text-center space-y-1 pt-1">
          <h1 className="text-xl sm:text-2xl font-serif-koinonia font-bold text-[#18181B]">
            Health and support
          </h1>
          <p className="text-xs sm:text-sm text-[#3F3F46]">
            Share anything the care team should know.
          </p>
        </div>

        {/* Child summary card */}
        <div className="bg-white border border-[#EAE8E1] border-l-4 border-l-[#C59B27] rounded-xl p-3.5 shadow-2xs flex items-center space-x-3.5">
          {draft.photoUrl ? (
            <img
              src={draft.photoUrl}
              alt={draft.fullName}
              className="w-11 h-11 rounded-xl object-cover shrink-0 border border-[#EAE8E1]"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-[#F3EFE6] text-[#715D3A] flex items-center justify-center font-bold text-base shrink-0 border border-[#D9D6CE]/50">
              {draft.fullName ? draft.fullName.charAt(0).toUpperCase() : 'C'}
            </div>
          )}
          <div>
            <h3 className="text-base font-serif-koinonia font-bold text-[#18181B] leading-tight">
              {draft.fullName}
            </h3>
            <p className="text-xs text-[#3F3F46] mt-0.5">
              {ageText} • {group}
            </p>
          </div>
        </div>

        <div className="border-b border-[#EAE8E1]/80 my-1" />

        {/* Form */}
        <form onSubmit={handleContinue} className="space-y-6" noValidate>
          {/* Question 1: Allergies or medical notes */}
          <div>
            <label className="text-sm font-semibold text-[#18181B] block mb-2.5">
              Does your child have any allergies or medical notes?
            </label>
            <div className="bg-[#FAF8F4] p-1 rounded-xl flex items-center gap-1.5 border border-[#EAE8E1]/80">
              <button
                type="button"
                onClick={() => {
                  setHasAllergies('No');
                  if (errors.hasAllergies) setErrors((prev) => ({ ...prev, hasAllergies: undefined }));
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer focus:outline-none ${
                  hasAllergies === 'No'
                    ? 'bg-white text-[#9A7326] shadow-2xs border border-[#D9D6CE]/80'
                    : 'text-[#3F3F46] hover:text-[#18181B]'
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  setHasAllergies('Yes');
                  if (errors.hasAllergies) setErrors((prev) => ({ ...prev, hasAllergies: undefined }));
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer focus:outline-none ${
                  hasAllergies === 'Yes'
                    ? 'bg-white text-[#9A7326] shadow-2xs border border-[#D9D6CE]/80'
                    : 'text-[#3F3F46] hover:text-[#18181B]'
                }`}
              >
                Yes
              </button>
            </div>
            {errors.hasAllergies && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errors.hasAllergies}</p>
            )}

            {/* Textarea for Question 1 */}
            <div className="mt-3">
              <textarea
                rows={3}
                placeholder="Example: peanut allergy, asthma inhaler, medication, food restriction"
                value={medicalNote}
                onChange={(e) => {
                  setMedicalNote(e.target.value);
                  if (errors.medicalNote) setErrors((prev) => ({ ...prev, medicalNote: undefined }));
                }}
                className={`w-full py-3 px-3.5 bg-white border ${
                  errors.medicalNote ? 'border-red-500' : 'border-[#D9D6CE]'
                } text-sm text-[#18181B] placeholder:text-[#9CA3AF] rounded-xl focus:outline-none focus:border-[#C59B27] shadow-2xs transition-colors resize-none`}
              />
              {errors.medicalNote && (
                <p className="text-xs text-red-600 mt-1 font-medium">{errors.medicalNote}</p>
              )}
            </div>
          </div>

          {/* Question 2: Extra support */}
          <div>
            <label className="text-sm font-semibold text-[#18181B] block mb-2.5">
              Does your child need any extra support?
            </label>
            <div className="bg-[#FAF8F4] p-1 rounded-xl flex items-center gap-1.5 border border-[#EAE8E1]/80">
              <button
                type="button"
                onClick={() => {
                  setNeedsExtraSupport('No');
                  if (errors.needsExtraSupport) setErrors((prev) => ({ ...prev, needsExtraSupport: undefined }));
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer focus:outline-none ${
                  needsExtraSupport === 'No'
                    ? 'bg-white text-[#9A7326] shadow-2xs border border-[#D9D6CE]/80'
                    : 'text-[#3F3F46] hover:text-[#18181B]'
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  setNeedsExtraSupport('Yes');
                  if (errors.needsExtraSupport) setErrors((prev) => ({ ...prev, needsExtraSupport: undefined }));
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer focus:outline-none ${
                  needsExtraSupport === 'Yes'
                    ? 'bg-white text-[#9A7326] shadow-2xs border border-[#D9D6CE]/80'
                    : 'text-[#3F3F46] hover:text-[#18181B]'
                }`}
              >
                Yes
              </button>
            </div>
            {errors.needsExtraSupport && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errors.needsExtraSupport}</p>
            )}

            {/* Textarea for Question 2 when Yes */}
            {needsExtraSupport === 'Yes' && (
              <div className="mt-3">
                <textarea
                  rows={3}
                  placeholder="Tell us what support may help your child."
                  value={supportNote}
                  onChange={(e) => {
                    setSupportNote(e.target.value);
                    if (errors.supportNote) setErrors((prev) => ({ ...prev, supportNote: undefined }));
                  }}
                  className={`w-full py-3 px-3.5 bg-white border ${
                    errors.supportNote ? 'border-red-500' : 'border-[#D9D6CE]'
                  } text-sm text-[#18181B] placeholder:text-[#9CA3AF] rounded-xl focus:outline-none focus:border-[#C59B27] shadow-2xs transition-colors resize-none`}
                />
                {errors.supportNote && (
                  <p className="text-xs text-red-600 mt-1 font-medium">{errors.supportNote}</p>
                )}
              </div>
            )}
          </div>

          {/* Confirmation card */}
          <div className={`bg-[#FAF8F4] border ${errors.infoConfirmed ? 'border-red-500 bg-red-50/40' : 'border-[#EAE8E1]'} p-4 rounded-xl`}>
            <label className="flex items-start space-x-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={infoConfirmed}
                onChange={(e) => {
                  setInfoConfirmed(e.target.checked);
                  if (errors.infoConfirmed && e.target.checked) {
                    setErrors((prev) => ({ ...prev, infoConfirmed: undefined }));
                  }
                }}
                className="w-4 h-4 rounded border-[#D9D6CE] text-[#C59B27] focus:ring-[#C59B27] mt-0.5 shrink-0 accent-[#C59B27] cursor-pointer"
              />
              <span className="text-xs sm:text-sm text-[#3F3F46] leading-relaxed font-normal">
                I confirm that the information provided is correct and may be used by the care team during the event.
              </span>
            </label>
            {errors.infoConfirmed && (
              <p className="text-xs text-red-600 mt-2 font-medium pl-7">{errors.infoConfirmed}</p>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 space-y-2.5">
            <Button
              type="submit"
              disabled={!(
                (hasAllergies === 'No' || (hasAllergies === 'Yes' && medicalNote.trim() !== '')) &&
                (needsExtraSupport === 'No' || (needsExtraSupport === 'Yes' && supportNote.trim() !== '')) &&
                infoConfirmed
              )}
              fullWidth
              size="lg"
            >
              <span className="flex items-center justify-center gap-1.5">
                <span>Continue</span>
                <span className="text-base leading-none">→</span>
              </span>
            </Button>
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

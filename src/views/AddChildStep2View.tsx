import React, { useState, useEffect } from 'react';
import { AppRoute, AddChildDraft } from '../types';
import { ArrowLeft, CheckCircle2, ChevronDown, Info } from 'lucide-react';
import { PremiumSelect } from '../components/common/PremiumSelect';
import { Button } from '../components/common/Button';
import { calculateAgeOnEventDate } from '../utils/age';

interface AddChildStep2ViewProps {
  onNavigate: (route: AppRoute) => void;
  draft?: AddChildDraft | null;
  onSaveDraft: (draft: AddChildDraft, isFinishLater?: boolean) => void;
}

const schoolClassOptions = [
  'Nursery',
  'Primary 1',
  'Primary 2',
  'Primary 3',
  'Primary 4',
  'Primary 5',
  'Primary 6',
  'JSS 1',
  'JSS 2',
  'JSS 3',
  'SSS 1',
  'SSS 2',
  'SSS 3',
  'Not in school yet',
  'Other'
];

export const AddChildStep2View: React.FC<AddChildStep2ViewProps> = ({
  onNavigate,
  draft,
  onSaveDraft
}) => {
  const [schoolClass, setSchoolClass] = useState<string>(
    draft?.schoolAndAgeGroup?.schoolClass || draft?.schoolClass || ''
  );
  const [attendedBefore, setAttendedBefore] = useState<'Yes' | 'No'>(
    draft?.schoolAndAgeGroup?.previousChildrenProgramme || draft?.attendedBefore || 'No'
  );
  const [careNote, setCareNote] = useState<string>(
    draft?.schoolAndAgeGroup?.noteToTeam || draft?.careNote || ''
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!draft || !draft.fullName) {
      onNavigate('/parent/children/new');
    }
  }, [draft, onNavigate]);

  const calculateAgeDetails = () => {
    if (!draft) return { ageText: '', group: '4–6 Years', ageYears: 0 };

    let ageYears = draft.age !== null && draft.age !== undefined ? draft.age : null;

    if (draft.dob) {
      const eventAge = calculateAgeOnEventDate(draft.dob);
      if (eventAge !== null) {
        ageYears = eventAge;
      } else {
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
    }

    if (ageYears === null) {
      ageYears = 0;
    }

    let group = '4–6 Years';
    if (ageYears <= 3) {
      group = '2–3 Years (Early Years)';
    } else if (ageYears <= 6) {
      group = '4–6 Years';
    } else if (ageYears <= 9) {
      group = '7–9 Years';
    } else if (ageYears <= 12) {
      group = '10–12 Years';
    } else {
      group = 'Teens';
    }

    const ageText = ageYears === 0 ? 'Under 1 year old' : `${ageYears} ${ageYears === 1 ? 'year old' : 'years old'}`;

    return { ageText, group, ageYears };
  };

  const { ageText, group, ageYears } = calculateAgeDetails();

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!schoolClass) {
      newErrors.schoolClass = 'Choose the child’s school class.';
    }

    if (!attendedBefore) {
      newErrors.attendedBefore = 'Choose Yes or No.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (draft) {
      const existingSchoolName = draft?.schoolAndAgeGroup?.schoolName || draft?.schoolName || '';
      const updatedDraft: AddChildDraft = {
        ...draft,
        schoolClass,
        ...(existingSchoolName ? { schoolName: existingSchoolName } : {}),
        attendedBefore,
        careNote: careNote.trim(),
        needsReview: ageYears < 2 ? true : draft.needsReview,
        schoolAndAgeGroup: {
          schoolClass,
          ...(existingSchoolName ? { schoolName: existingSchoolName } : {}),
          previousChildrenProgramme: attendedBefore,
          noteToTeam: careNote.trim()
        }
      };
      onSaveDraft(updatedDraft, false);
    }
    onNavigate('/parent/children/new/health-and-support');
  };

  const handleSaveAndFinishLater = () => {
    if (draft) {
      const existingSchoolName = draft?.schoolAndAgeGroup?.schoolName || draft?.schoolName || '';
      const updatedDraft: AddChildDraft = {
        ...draft,
        schoolClass,
        ...(existingSchoolName ? { schoolName: existingSchoolName } : {}),
        attendedBefore,
        careNote: careNote.trim(),
        needsReview: ageYears < 2 ? true : draft.needsReview,
        schoolAndAgeGroup: {
          schoolClass,
          ...(existingSchoolName ? { schoolName: existingSchoolName } : {}),
          previousChildrenProgramme: attendedBefore,
          noteToTeam: careNote.trim()
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
    <div className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] dark:bg-[#19191A] text-[#18181B] dark:text-[#F0EBE3] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 dark:border-[#302E29] px-5 pb-10">
      <div className="space-y-6">
        {/* Top bar */}
        <div className="pt-5 pb-1 flex items-center justify-between relative">
          <button
            type="button"
            onClick={() => onNavigate('/parent/children/new')}
            className="p-1 -ml-1 text-[#18181B] dark:text-[#F0EBE3] hover:text-[#715D3A] dark:hover:text-[#C59B27] transition-colors cursor-pointer focus:outline-none"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>
          <span className="text-lg sm:text-xl font-serif-koinonia font-bold text-[#18181B] dark:text-[#F0EBE3] tracking-tight">
            Add a child
          </span>
          <div className="w-5" />
        </div>

        {/* Progress */}
        <div className="flex flex-col items-center mt-1 mb-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-[#715D3A] dark:text-[#D4AF37] mb-1.5">
            STEP 2 OF 5
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-5 sm:w-6 h-1 rounded-full bg-[#D9D6CE] dark:bg-[#3A3835]" />
            <div className="w-5 sm:w-6 h-1 rounded-full bg-[#C59B27]" />
            <div className="w-5 sm:w-6 h-1 rounded-full bg-[#D9D6CE] dark:bg-[#3A3835]" />
            <div className="w-5 sm:w-6 h-1 rounded-full bg-[#D9D6CE] dark:bg-[#3A3835]" />
            <div className="w-5 sm:w-6 h-1 rounded-full bg-[#D9D6CE] dark:bg-[#3A3835]" />
          </div>
        </div>

        {/* Main section heading */}
        <div className="text-center space-y-1">
          <h1 className="text-xl sm:text-2xl font-serif-koinonia font-bold text-[#18181B] dark:text-[#F0EBE3]">
            School and age group
          </h1>
          <p className="text-xs sm:text-sm text-[#3F3F46] dark:text-[#B8B0A5]">
            Help the team place your child in the right group.
          </p>
        </div>

        {/* Child summary card */}
        <div className="bg-white dark:bg-[#1D1D1A] sm:bg-[#FAF9F6] dark:sm:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center space-x-3.5">
            {draft.photoUrl ? (
              <img
                src={draft.photoUrl}
                alt={draft.fullName}
                className="w-11 h-11 rounded-xl object-cover shrink-0 border border-[#EAE8E1] dark:border-[#302E29]"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-[#F3EFE6] dark:bg-[#262520] text-[#715D3A] dark:text-[#D4AF37] flex items-center justify-center font-bold text-base shrink-0 border border-[#D9D6CE]/50 dark:border-[#3A3835]">
                {draft.fullName ? draft.fullName.charAt(0).toUpperCase() : 'C'}
              </div>
            )}
            <div>
              <h3 className="text-base font-serif-koinonia font-bold text-[#18181B] dark:text-[#F0EBE3] leading-tight">
                {draft.fullName}
              </h3>
              <p className="text-xs text-[#3F3F46] dark:text-[#B8B0A5] mt-0.5">{ageText}</p>
            </div>
          </div>

          <div className="bg-[#F4F2EB] dark:bg-[#21211E] sm:bg-[#F5F3ED] dark:sm:bg-[#21211E] rounded-xl p-3 mt-3.5 border border-[#EAE8E1]/80 dark:border-[#302E29] relative overflow-hidden">
            <div className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#715D3A] dark:text-[#C59B27] shrink-0" />
              <span className="text-xs text-[#3F3F46] dark:text-[#B8B0A5]">
                Suggested group: <strong className="font-semibold text-[#715D3A] dark:text-[#C59B27]">{group}</strong>
              </span>
            </div>
            <span className="text-[11px] sm:text-xs italic text-[#3F3F46] dark:text-[#7A7570] mt-1 block">
              The team may adjust the group during review.
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleContinue} className="space-y-5" noValidate>
          {/* 1. SCHOOL CLASS */}
          <PremiumSelect
            variant="bordered"
            label="SCHOOL CLASS"
            value={schoolClass}
            placeholder="Select class"
            options={schoolClassOptions}
            error={errors.schoolClass}
            onChange={(val) => {
              setSchoolClass(val);
              if (errors.schoolClass) setErrors((prev) => ({ ...prev, schoolClass: undefined }));
            }}
          />

          {/* 2. Previous programme */}
          <div>
            <label className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] block mb-2">
              Has your child attended a previous children or teens programme?
            </label>
            <div className="bg-[#EAE8E1]/60 dark:bg-[#21211E] border border-transparent dark:border-[#302E29] p-1 rounded-xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setAttendedBefore('Yes');
                  if (errors.attendedBefore) setErrors((prev) => ({ ...prev, attendedBefore: undefined }));
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer focus:outline-none ${
                  attendedBefore === 'Yes'
                    ? 'bg-[#C59B27] text-white shadow-xs'
                    : 'text-[#3F3F46] dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3]'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttendedBefore('No');
                  if (errors.attendedBefore) setErrors((prev) => ({ ...prev, attendedBefore: undefined }));
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer focus:outline-none ${
                  attendedBefore === 'No'
                    ? 'bg-[#C59B27] text-white shadow-xs'
                    : 'text-[#3F3F46] dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3]'
                }`}
              >
                No
              </button>
            </div>
            {errors.attendedBefore && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{errors.attendedBefore}</p>
            )}
          </div>

          {/* 4. NOTE TO TEAM */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold tracking-wider uppercase text-[#3F3F46] dark:text-[#B8B0A5]">
                ANY NOTE YOU WANT THE TEAM TO KNOW?
              </label>
              <span className="text-xs text-[#6B7280] dark:text-[#7A7570]">Optional</span>
            </div>
            <textarea
              rows={3}
              placeholder="Allergies, specific needs..."
              value={careNote}
              onChange={(e) => setCareNote(e.target.value)}
              className="w-full py-2.5 px-3.5 bg-white dark:bg-[#1D1D1A] border border-[#D9D6CE] dark:border-[#3A3835] text-sm text-[#18181B] dark:text-[#F0EBE3] placeholder:text-[#9CA3AF] dark:placeholder:text-[#7A7570] rounded-xl focus:outline-none focus:border-[#C59B27] shadow-2xs transition-colors resize-none"
            />
          </div>

          {/* Information note */}
          <div className="bg-[#FAF8F4] dark:bg-[#201F1C] border border-[#EAE8E1] dark:border-[#302E29] p-3.5 rounded-xl flex items-start space-x-2.5 text-xs text-[#3F3F46] dark:text-[#B8B0A5]">
            <Info className="w-4 h-4 text-[#9A7326] dark:text-[#C59B27] shrink-0 mt-0.5" />
            <span>This age may need team review before a pass is prepared.</span>
          </div>

          {/* Actions */}
          <div className="pt-2 space-y-2.5">
            <Button
              type="submit"
              disabled={!schoolClass || !attendedBefore}
              fullWidth
              size="lg"
            >
              Continue
            </Button>
            <button
              type="button"
              onClick={handleSaveAndFinishLater}
              className="w-full py-2.5 text-xs sm:text-sm font-medium text-[#3F3F46] dark:text-[#B8B0A5] hover:text-[#9A7326] dark:hover:text-[#D4AF37] hover:underline active:opacity-80 transition-all duration-200 cursor-pointer focus:outline-none text-center block"
            >
              Save and finish later
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

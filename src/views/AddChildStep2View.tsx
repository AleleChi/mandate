import React, { useState, useEffect } from 'react';
import { AppRoute, AddChildDraft } from '../types';
import { ArrowLeft, CheckCircle2, ChevronDown, Info } from 'lucide-react';
import { PremiumSelect } from '../components/common/PremiumSelect';

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
  const [schoolName, setSchoolName] = useState<string>(
    draft?.schoolAndAgeGroup?.schoolName || draft?.schoolName || ''
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
    if (!draft) return { ageText: '', group: 'Ages 4 to 6', ageYears: 0 };

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

    let group = 'Ages 4 to 6';
    if (ageYears < 1) {
      group = 'Under 1 year';
    } else if (ageYears <= 3) {
      group = 'Ages 1 to 3';
    } else if (ageYears <= 6) {
      group = 'Ages 4 to 6';
    } else if (ageYears <= 9) {
      group = 'Ages 7 to 9';
    } else if (ageYears <= 12) {
      group = 'Ages 10 to 12';
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
      const updatedDraft: AddChildDraft = {
        ...draft,
        schoolClass,
        schoolName: schoolName.trim(),
        attendedBefore,
        careNote: careNote.trim(),
        needsReview: ageYears < 2 ? true : draft.needsReview,
        schoolAndAgeGroup: {
          schoolClass,
          schoolName: schoolName.trim(),
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
      const updatedDraft: AddChildDraft = {
        ...draft,
        schoolClass,
        schoolName: schoolName.trim(),
        attendedBefore,
        careNote: careNote.trim(),
        needsReview: ageYears < 2 ? true : draft.needsReview,
        schoolAndAgeGroup: {
          schoolClass,
          schoolName: schoolName.trim(),
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
    <div className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 px-5 pb-10">
      <div className="space-y-6">
        {/* Top bar */}
        <div className="pt-5 pb-1 flex items-center justify-between relative">
          <button
            type="button"
            onClick={() => onNavigate('/parent/children/new')}
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
          <span className="text-[11px] uppercase tracking-wider font-semibold text-[#715D3A] mb-1.5">
            STEP 2 OF 5
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-5 sm:w-6 h-1 rounded-full bg-[#D9D6CE]" />
            <div className="w-5 sm:w-6 h-1 rounded-full bg-[#C59B27]" />
            <div className="w-5 sm:w-6 h-1 rounded-full bg-[#D9D6CE]" />
            <div className="w-5 sm:w-6 h-1 rounded-full bg-[#D9D6CE]" />
            <div className="w-5 sm:w-6 h-1 rounded-full bg-[#D9D6CE]" />
          </div>
        </div>

        {/* Main section heading */}
        <div className="text-center space-y-1">
          <h1 className="text-xl sm:text-2xl font-serif-koinonia font-bold text-[#18181B]">
            School and age group
          </h1>
          <p className="text-xs sm:text-sm text-[#3F3F46]">
            Help the team place your child in the right group.
          </p>
        </div>

        {/* Child summary card */}
        <div className="bg-white sm:bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center space-x-3.5">
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
              <p className="text-xs text-[#3F3F46] mt-0.5">{ageText}</p>
            </div>
          </div>

          <div className="bg-[#F4F2EB] sm:bg-[#F5F3ED] rounded-xl p-3 mt-3.5 border border-[#EAE8E1]/80 relative overflow-hidden">
            <div className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#715D3A] shrink-0" />
              <span className="text-xs text-[#3F3F46]">
                Suggested group: <strong className="font-semibold text-[#715D3A]">{group}</strong>
              </span>
            </div>
            <span className="text-[11px] sm:text-xs italic text-[#3F3F46] mt-1 block">
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

          {/* 2. SCHOOL NAME */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold tracking-wider uppercase text-[#3F3F46]">
                SCHOOL NAME
              </label>
              <span className="text-xs text-[#6B7280]">Optional</span>
            </div>
            <input
              type="text"
              placeholder="Enter school name"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="w-full py-2.5 px-3.5 bg-white border border-[#D9D6CE] text-sm text-[#18181B] placeholder:text-[#9CA3AF] rounded-xl focus:outline-none focus:border-[#C59B27] shadow-2xs transition-colors"
            />
          </div>

          {/* 3. Previous programme */}
          <div>
            <label className="text-xs font-semibold text-[#18181B] block mb-2">
              Has your child attended a previous children or teens programme?
            </label>
            <div className="bg-[#EAE8E1]/60 p-1 rounded-xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setAttendedBefore('Yes');
                  if (errors.attendedBefore) setErrors((prev) => ({ ...prev, attendedBefore: undefined }));
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer focus:outline-none ${
                  attendedBefore === 'Yes'
                    ? 'bg-[#C59B27] text-white shadow-xs'
                    : 'text-[#3F3F46] hover:text-[#18181B]'
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
                    : 'text-[#3F3F46] hover:text-[#18181B]'
                }`}
              >
                No
              </button>
            </div>
            {errors.attendedBefore && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errors.attendedBefore}</p>
            )}
          </div>

          {/* 4. NOTE TO TEAM */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold tracking-wider uppercase text-[#3F3F46]">
                ANY NOTE YOU WANT THE TEAM TO KNOW?
              </label>
              <span className="text-xs text-[#6B7280]">Optional</span>
            </div>
            <textarea
              rows={3}
              placeholder="Allergies, specific needs..."
              value={careNote}
              onChange={(e) => setCareNote(e.target.value)}
              className="w-full py-2.5 px-3.5 bg-white border border-[#D9D6CE] text-sm text-[#18181B] placeholder:text-[#9CA3AF] rounded-xl focus:outline-none focus:border-[#C59B27] shadow-2xs transition-colors resize-none"
            />
          </div>

          {/* Information note */}
          <div className="bg-[#FAF8F4] border border-[#EAE8E1] p-3.5 rounded-xl flex items-start space-x-2.5 text-xs text-[#3F3F46]">
            <Info className="w-4 h-4 text-[#9A7326] shrink-0 mt-0.5" />
            <span>This age may need team review before a pass is prepared.</span>
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

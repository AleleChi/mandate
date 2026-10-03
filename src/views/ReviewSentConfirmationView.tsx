import React, { useState, useEffect } from 'react';
import { Check, Clock } from 'lucide-react';
import { AppRoute, ChildItem } from '../types';
import { REAL_ASSETS } from '../config/assets';

interface ReviewSentConfirmationViewProps {
  onNavigate: (route: AppRoute) => void;
  submittedChild: ChildItem | null;
  onStartNewChild?: () => void;
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
    return (
      <div className={`overflow-hidden bg-[#FAF6EB] flex items-center justify-center shrink-0 ${className}`}>
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setError(true)}
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

export const ReviewSentConfirmationView: React.FC<ReviewSentConfirmationViewProps> = ({
  onNavigate,
  submittedChild,
  onStartNewChild
}) => {
  useEffect(() => {
    if (!submittedChild) {
      onNavigate('/parent/home');
    }
  }, [submittedChild, onNavigate]);

  if (!submittedChild) {
    return null;
  }

  const childFirstName = submittedChild.name ? submittedChild.name.trim().split(' ')[0] : 'your child';

  const handleAddAnotherChild = () => {
    if (onStartNewChild) {
      onStartNewChild();
    } else {
      onNavigate('/parent/children/new');
    }
  };

  return (
    <div className="w-full max-w-[390px] mx-auto min-h-screen bg-[#FAF8F3] text-[#18181B] font-sans selection:bg-[#C59B27]/20 flex flex-col justify-between relative shadow-xl border-x border-[#EAE8E1]/50 px-5 pt-10 pb-8 sm:pt-12 sm:pb-10">
      <div>
        {/* Top success icon */}
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#8C6D23] flex items-center justify-center mx-auto shadow-sm">
          <Check className="w-8 h-8 text-white stroke-[3]" />
        </div>

        {/* Main heading */}
        <h1 className="font-serif-koinonia text-2xl sm:text-3xl font-bold text-[#18181B] text-center mt-4 sm:mt-5 tracking-tight">
          Details sent for review
        </h1>

        {/* Supporting text */}
        <p className="text-sm sm:text-base text-[#3F3F46] text-center leading-relaxed max-w-[320px] mx-auto mt-2.5">
          The team will review {childFirstName}’s details.<br />
          You will see updates here and receive a message when there is a decision.
        </p>

        {/* Child summary card */}
        <div className="bg-white rounded-2xl p-4 border border-[#EAE8E1] shadow-2xs mt-6 flex items-center space-x-3.5">
          <FallbackAvatar
            src={isRealUploadedPhoto(submittedChild.photoUrl) ? submittedChild.photoUrl : undefined}
            name={submittedChild.name}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover shrink-0 border border-[#EAE8E1]"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base sm:text-lg text-[#18181B] truncate">
              {submittedChild.name}
            </h3>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {submittedChild.age === 0 ? 'Under 1 year old' : `${submittedChild.age} years old`} • {submittedChild.ageGroup}
            </p>
            <div className="mt-1.5">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-[#FAF6EB] border border-[#E5D5AE] text-[#9A7326] text-[10px] sm:text-[11px] font-bold tracking-wider uppercase">
                <Clock className="w-3.5 h-3.5 mr-1 text-[#D97706] shrink-0" />
                <span>Under review</span>
              </span>
            </div>
          </div>
        </div>

        {/* What Happens Next Section */}
        <div className="mt-8">
          <h4 className="text-[11px] sm:text-xs font-bold text-[#6B7280] tracking-widest uppercase pb-2 border-b border-[#EAE8E1]">
            What Happens Next
          </h4>

          <div className="space-y-4 pt-4">
            {/* Step 1 */}
            <div className="flex items-start space-x-3.5">
              <span className="font-serif-koinonia font-bold text-base sm:text-lg text-[#8C6D23] w-5 shrink-0 pt-0.5">
                1
              </span>
              <div>
                <h5 className="font-bold text-sm sm:text-base text-[#18181B] leading-snug">
                  Review
                </h5>
                <p className="text-xs sm:text-sm text-[#6B7280] mt-0.5 leading-relaxed">
                  The team checks the details.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start space-x-3.5">
              <span className="font-serif-koinonia font-bold text-base sm:text-lg text-[#8C6D23] w-5 shrink-0 pt-0.5">
                2
              </span>
              <div>
                <h5 className="font-bold text-sm sm:text-base text-[#18181B] leading-snug">
                  Decision
                </h5>
                <p className="text-xs sm:text-sm text-[#6B7280] mt-0.5 leading-relaxed">
                  You will see if {childFirstName} is selected.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start space-x-3.5">
              <span className="font-serif-koinonia font-bold text-base sm:text-lg text-[#8C6D23] w-5 shrink-0 pt-0.5">
                3
              </span>
              <div>
                <h5 className="font-bold text-sm sm:text-base text-[#18181B] leading-snug">
                  Pass
                </h5>
                <p className="text-xs sm:text-sm text-[#6B7280] mt-0.5 leading-relaxed">
                  If selected, {childFirstName}’s event pass will appear in Passes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 pt-4 flex flex-col space-y-3">
        <button
          type="button"
          onClick={() => onNavigate(submittedChild ? `/parent/children/${submittedChild.id}/status` : '/parent/status')}
          className="w-full py-3.5 px-5 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-sm transition-all duration-200 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#8C6D23]"
        >
          View status
        </button>

        <button
          type="button"
          onClick={handleAddAnotherChild}
          className="w-full py-3.5 px-5 rounded-xl bg-white hover:bg-[#FAF9F6] active:bg-[#F4F1EA] border border-[#18181B] text-[#18181B] font-semibold text-sm transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#18181B]"
        >
          Add another child
        </button>

        <button
          type="button"
          onClick={() => onNavigate('/parent/home')}
          className="w-full py-2.5 text-[#8C6D23] hover:underline font-semibold text-sm transition-all cursor-pointer focus:outline-none text-center"
        >
          Back to Home
        </button>

        <p className="text-xs sm:text-sm text-[#6B7280] text-center pt-1">
          You can still add another child from Home.
        </p>
      </div>
    </div>
  );
};

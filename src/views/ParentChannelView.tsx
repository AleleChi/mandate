import React, { useState, useEffect } from 'react';
import { ArrowLeft, MessageCircle, ExternalLink, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AppRoute } from '../types';
import { api, extractApiError } from '../services/api';
import { Button } from '../components/common/Button';
import { KoinoniaInlineLoader } from '../components/common/KoinoniaInlineLoader';

interface ParentChannelViewProps {
  onNavigate: (route: AppRoute | string) => void;
  onSignOut?: () => void;
}

interface ChannelAccessData {
  eligible: boolean;
  eventTitle?: string;
  selectedChildren?: Array<{ id: string; fullName: string; firstName: string }>;
  selectedChildNames?: string;
  channelUrl?: string;
  notice?: string;
  message?: string;
}

export const ParentChannelView: React.FC<ParentChannelViewProps> = ({
  onNavigate,
  onSignOut
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChannelAccessData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkEligibility() {
      setLoading(true);
      setError(null);
      try {
        const response = await api.parent.getChannelAccess();
        if (isMounted) {
          setData(response);
        }
      } catch (err: any) {
        if (isMounted) {
          const apiErr = extractApiError(err);
          setError(apiErr.message || 'Unable to verify channel access at this time.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    checkEligibility();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenChannel = () => {
    if (data?.channelUrl) {
      window.open(data.channelUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] flex flex-col justify-between py-6 px-4 sm:px-6">
      {/* Top Bar */}
      <div className="max-w-md w-full mx-auto">
        <button
          onClick={() => onNavigate('/parent/home')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#71717A] hover:text-[#18181B] transition-colors py-1.5 px-2 -ml-2 rounded-md hover:bg-[#F4F2EC]"
          aria-label="Return to Parent Portal"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Parent Portal</span>
        </button>
      </div>

      {/* Main Content Card */}
      <div className="max-w-md w-full mx-auto my-auto py-4">
        <div className="bg-white border border-[#EAE8E1] rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#FAF6EB] border border-[#EAD89C] flex items-center justify-center text-[#9A7326]">
              <MessageCircle className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-serif-koinonia font-bold tracking-tight text-[#18181B]">
              Children's Session Parents Channel
            </h1>
            <p className="text-xs sm:text-sm text-[#71717A]">
              Official communication channel for The Koinonia General Assembly
            </p>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="py-8 text-center space-y-3">
              <KoinoniaInlineLoader />
              <p className="text-xs text-[#71717A]">Verifying your registration details...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#FDF2F2] border border-[#F8D7DA] text-center space-y-2">
                <AlertCircle className="w-5 h-5 text-[#DC2626] mx-auto" />
                <p className="text-xs sm:text-sm text-[#991B1B]">{error}</p>
              </div>
              <Button
                variant="outline"
                fullWidth
                onClick={() => onNavigate('/parent/home')}
              >
                Return to Parent Portal
              </Button>
            </div>
          )}

          {/* Ineligible State */}
          {!loading && !error && data && !data.eligible && (
            <div className="space-y-5 text-center">
              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#EAE8E1] space-y-2">
                <ShieldCheck className="w-5 h-5 text-[#71717A] mx-auto" />
                <p className="text-xs sm:text-sm text-[#52525B] leading-relaxed">
                  {data.message || 'Parents Channel access is available to registered parents and guardians of selected children for this event.'}
                </p>
              </div>
              <p className="text-xs text-[#71717A]">
                If your child's application is currently under review or on the waiting list, you will receive an update as soon as their status changes.
              </p>
              <Button
                variant="outline"
                fullWidth
                onClick={() => onNavigate('/parent/home')}
              >
                Return to Parent Portal
              </Button>
            </div>
          )}

          {/* Eligible State */}
          {!loading && !error && data && data.eligible && (
            <div className="space-y-6">
              {/* Selected Children List */}
              <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                    Your selected children
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#15803D] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    Confirmed
                  </span>
                </div>
                <div className="space-y-1.5 pt-1">
                  {data.selectedChildren && data.selectedChildren.length > 0 ? (
                    data.selectedChildren.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between py-1 px-2.5 bg-white rounded-lg border border-[#EAE8E1] text-xs font-medium text-[#18181B]"
                      >
                        <span>{c.fullName}</span>
                        <span className="text-[10px] text-[#71717A]">Selected</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs font-semibold text-[#18181B]">
                      {data.selectedChildNames}
                    </p>
                  )}
                </div>
              </div>

              {/* Explanatory text */}
              <p className="text-xs sm:text-sm text-[#52525B] leading-relaxed text-center">
                Stay updated with official Children's Session announcements, schedule updates, arrival procedures, and pickup reminders.
              </p>

              {/* Action Button */}
              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  onClick={handleOpenChannel}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-[#C59B27] hover:bg-[#B08820] active:scale-[0.99] transition-all shadow-sm cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Open Parents Channel</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </button>

                <p className="text-[11px] text-[#71717A] text-center leading-normal px-2">
                  {data.notice || 'This channel is for registered parents and guardians of selected children. Please do not share the channel link with others.'}
                </p>
              </div>

              <div className="pt-2 border-t border-[#EAE8E1]">
                <button
                  onClick={() => onNavigate('/parent/home')}
                  className="w-full text-center py-2 text-xs font-semibold text-[#71717A] hover:text-[#18181B] transition-colors cursor-pointer"
                >
                  Return to Parent Portal
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-md w-full mx-auto text-center">
        <p className="text-[11px] text-[#A1A1AA]">
          Koinonia Children and Teens • Official Parent Access
        </p>
      </div>
    </div>
  );
};

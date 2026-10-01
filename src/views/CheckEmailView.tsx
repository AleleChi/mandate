import React, { useState, useEffect } from 'react';
import { ArrowLeft, Info, AlertCircle, Check, Mail } from 'lucide-react';
import { AppRoute } from '../types';
import { api, extractApiError } from '../services/api';
import { AuthScreenShell } from '../components/common/AuthScreenShell';

interface CheckEmailViewProps {
  onNavigate: (route: AppRoute) => void;
  parentEmail: string;
}

export const CheckEmailView: React.FC<CheckEmailViewProps> = ({
  onNavigate,
  parentEmail
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setTimeout(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (loading || cooldown > 0) return;

    setLoading(true);
    setErrorMessage(null);
    setResendStatus(null);
    try {
      const emailToResend = parentEmail || '';
      await api.auth.resendVerification(emailToResend);
      setResendStatus('A new verification link has been sent. Please check your inbox and spam folder.');
      setCooldown(60);
      setTimeout(() => setResendStatus(null), 6000);
    } catch (err: any) {
      if (err?.code === 'RESEND_COOLDOWN' || err?.response?.status === 429) {
        const retry = err?.data?.retryAfterSeconds || 60;
        setCooldown(retry);
        setErrorMessage('Please wait before requesting another link.');
      } else {
        const { message } = extractApiError(err);
        setErrorMessage(message || 'We could not send a new verification email right now. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const displayEmail = parentEmail || 'your email address';

  return (
    <AuthScreenShell
      dataViewVersion="parent-check-email-soft-surface-v1"
      showBack
      onBack={() => onNavigate('/parent/create-account')}
      maxWidth="md"
    >
      {/* Icon */}
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-full bg-[#C59B27]/10 flex items-center justify-center text-[#9A7326]">
          <Mail className="w-8 h-8 stroke-[1.5]" />
        </div>
      </div>

      {/* Title & Delivery Guidance */}
      <div className="text-center mb-6 space-y-2">
        <h1 className="type-h1-app text-2xl sm:text-3xl text-[#18181B] dark:text-[#F0EBE3] leading-tight tracking-tight">
          Check your email
        </h1>
        <div className="text-sm text-[#3F3F46] dark:text-[#B8B0A5] leading-relaxed max-w-[360px] mx-auto pt-1">
          <p className="text-zinc-600 dark:text-[#B8B0A5]">We sent a verification link to:</p>
          <p className="font-semibold text-[#18181B] dark:text-[#F0EBE3] text-base mt-0.5 break-all">
            {displayEmail}
          </p>
        </div>
        <p className="text-xs sm:text-sm text-zinc-600 dark:text-[#B8B0A5] pt-1 max-w-[340px] mx-auto leading-relaxed">
          Open the email and verify your address to continue.
        </p>
      </div>

      {/* Spam / Junk Helper Card */}
      <div className="mb-6 p-4 rounded-2xl bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] text-left shadow-2xs">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-[#9A7326] dark:text-[#D4AF37] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs text-zinc-600 dark:text-[#B8B0A5] leading-relaxed">
            <span className="font-semibold text-zinc-900 dark:text-[#F0EBE3] block mb-0.5">Can't find it?</span>
            Check your Spam, Junk or Promotions folder. It may take a few minutes to arrive.
          </div>
        </div>
      </div>

      {/* Resend status notice */}
      {resendStatus && (
        <div
          role="status"
          className="mb-5 p-3 rounded-xl bg-[#ECFDF5] dark:bg-emerald-950/20 border border-[#A7F3D0] dark:border-emerald-800/40 text-[#065F46] dark:text-emerald-300 text-xs font-medium flex items-center justify-center gap-2 animate-fadeIn"
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{resendStatus}</span>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div
          role="alert"
          className="mb-5 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs font-medium flex items-center justify-center gap-2 animate-fadeIn"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-4">
        <button
          type="button"
          disabled={loading || cooldown > 0}
          onClick={handleResend}
          className="w-full py-3.5 px-6 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-semibold text-base shadow-sm transition-all text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? 'Resending...'
            : cooldown > 0
            ? `Resend available in ${cooldown}s`
            : 'Resend verification email'}
        </button>

        {/* Small secondary action: Use a different email */}
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => onNavigate('/parent/create-account')}
            className="text-xs font-semibold tracking-wider text-zinc-600 dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3] transition-colors cursor-pointer focus:outline-none"
          >
            Use a different email
          </button>
        </div>
      </div>
    </AuthScreenShell>
  );
};

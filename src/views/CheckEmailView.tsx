import React, { useState } from 'react';
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

  const handleResend = async () => {
    setLoading(true);
    setErrorMessage(null);
    setResendStatus(null);
    try {
      const emailToResend = parentEmail || '';
      await api.auth.resendVerification(emailToResend);
      setResendStatus('A new verification link has been sent.');
      setTimeout(() => setResendStatus(null), 5000);
    } catch (err: any) {
      const { message } = extractApiError(err);
      setErrorMessage(message || 'Failed to resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  const displayEmail = parentEmail || 'your email';

  return (
    <AuthScreenShell
      dataViewVersion="parent-check-email-soft-surface-v1"
      showBack
      onBack={() => onNavigate('/parent/create-account')}
      maxWidth="md"
    >
      {/* Animated Icon */}
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-full bg-[#C59B27]/10 flex items-center justify-center text-[#9A7326]">
          <Mail className="w-8 h-8 stroke-[1.5]" />
        </div>
      </div>

      {/* Title & Helper Text */}
      <div className="text-center mb-8">
        <h1 className="font-serif-koinonia font-bold text-3xl sm:text-[34px] text-[#18181B] leading-tight tracking-tight mb-3">
          Check your email
        </h1>
        <p className="text-sm text-[#3F3F46] leading-relaxed max-w-[340px] mx-auto">
          We sent a confirmation link to{' '}
          <span className="font-semibold text-[#18181B] block sm:inline mt-0.5 sm:mt-0 break-all">
            {displayEmail}
          </span>.
        </p>
        <p className="text-xs text-[#71717A] mt-3 max-w-[320px] mx-auto leading-relaxed">
          Please click the button inside the email to verify your address and continue setting up your Parent Access.
        </p>
      </div>

      {/* Resend status notice */}
      {resendStatus && (
        <div
          role="status"
          className="mb-6 p-3 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-xs font-medium flex items-center justify-center gap-2 animate-fadeIn"
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{resendStatus}</span>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div
          role="alert"
          className="mb-6 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center justify-center gap-2 animate-fadeIn"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="space-y-4">
        <button
          type="button"
          disabled={loading}
          onClick={handleResend}
          className="w-full py-3.5 px-6 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-medium text-base shadow-sm transition-all text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Resending...' : 'Resend link'}
        </button>

        {/* Text link: Change email address */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => onNavigate('/parent/create-account')}
            className="text-xs font-semibold tracking-widest text-[#18181B] underline underline-offset-4 hover:text-[#C59B27] uppercase transition-colors cursor-pointer focus:outline-none"
          >
            Change email address
          </button>
        </div>
      </div>

      {/* Small Note Card */}
      <div className="mt-8 p-4 rounded-2xl bg-[#FAF6EC] border border-[#EBE3D3] flex items-start gap-3.5 text-left shadow-2xs">
        <Info className="w-5 h-5 text-[#9A7326] shrink-0 mt-0.5 stroke-[2]" aria-hidden="true" />
        <p className="text-xs sm:text-sm text-[#3F3F46] leading-relaxed">
          Once you click the link, your email is confirmed and you can set up your parent profile.
        </p>
      </div>
    </AuthScreenShell>
  );
};

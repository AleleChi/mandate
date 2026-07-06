import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ArrowRight, Mail } from 'lucide-react';
import { AppRoute } from '../types';
import { api, extractApiError } from '../services/api';

interface VerifyEmailViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const VerifyEmailView: React.FC<VerifyEmailViewProps> = ({ onNavigate }) => {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState<{ title: string; description: string } | null>(null);

  // Extract query parameters from hash route
  const getQueryParams = () => {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    const queryString = queryIndex !== -1 ? hash.substring(queryIndex) : window.location.search;
    return new URLSearchParams(queryString);
  };

  const queryParams = getQueryParams();
  const token = queryParams.get('token') || '';
  const emailParam = queryParams.get('email') || '';

  useEffect(() => {
    const performVerification = async () => {
      if (!token) {
        setStatus('error');
        setErrorMessage('Verification link is missing or invalid. Please request a new email link.');
        return;
      }

      try {
        await api.auth.verifyEmail(token);
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        const { message } = extractApiError(err);
        setErrorMessage(message || 'The verification link is invalid or expired.');
      }
    };

    performVerification();
  }, [token]);

  const handleSendNewLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const emailToUse = emailParam || emailInput;
    if (!emailToUse) {
      setShowEmailInput(true);
      return;
    }

    setResendLoading(true);
    setErrorMessage(null);
    setResendSuccess(null);
    setResendError(null);

    try {
      const res = await api.auth.resendVerification(emailToUse);
      if (res && res.message && res.message.toLowerCase().includes('already verified')) {
        setResendSuccess('already_verified');
      } else {
        setResendSuccess('sent');
      }
    } catch (err: any) {
      setResendError({
        title: 'We could not send a new link',
        description: 'Please try again in a moment.'
      });
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#18181B] flex flex-col justify-between font-sans selection:bg-[#C59B27]/20 pb-12">
      {/* Top Header */}
      <header className="w-full pt-4 pb-3 px-6">
        <div className="max-w-[440px] mx-auto flex items-center justify-between">
          <div className="w-6" />
          <div
            onClick={() => onNavigate('/')}
            className="font-serif-koinonia font-bold text-xl tracking-[0.2em] text-[#9A7326] uppercase cursor-pointer select-none"
          >
            Koinonia
          </div>
          <div className="w-6" />
        </div>
      </header>

      {/* Main Container: Centered Column */}
      <main className="flex-1 max-w-[440px] w-full mx-auto px-6 pt-6 pb-8 flex flex-col justify-center">
        <div className="bg-white border border-[#E5D5AE]/40 rounded-3xl p-8 shadow-sm text-center">
          
          {status === 'verifying' && (
            <div className="space-y-6 py-6 flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-[#C59B27] animate-spin stroke-[2]" />
              <div>
                <h1 className="font-serif-koinonia font-bold text-2xl text-[#18181B] tracking-tight mb-2">
                  Verifying your email...
                </h1>
                <p className="text-sm text-[#71717A]">
                  Please hold on while we verify your secure access credentials.
                </p>
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-6 py-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-10 h-10 stroke-[1.5]" />
                </div>
              </div>
              <div>
                <h1 className="font-serif-koinonia font-bold text-2xl text-[#18181B] tracking-tight mb-3">
                  Email verified
                </h1>
                <p className="text-sm text-[#3F3F46] leading-relaxed">
                  Your email has been confirmed. You can now continue setting up your parent profile.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('/parent/profile-setup')}
                className="w-full py-3.5 px-6 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-medium text-base shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-6 py-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                  <XCircle className="w-10 h-10 stroke-[1.5]" />
                </div>
              </div>
              
              <div>
                <h1 className="font-serif-koinonia font-bold text-2xl text-[#18181B] tracking-tight mb-3">
                  This link is no longer valid
                </h1>
                <p className="text-sm text-[#3F3F46] leading-relaxed">
                  Please request a new email link.
                </p>
              </div>

               {resendSuccess === 'already_verified' ? (
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-left space-y-1">
                  <div className="flex items-center gap-2 text-blue-800 text-sm font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />
                    <span>Email already verified</span>
                  </div>
                  <p className="text-xs text-blue-600 pl-7">You can sign in with this email.</p>
                </div>
              ) : resendSuccess === 'sent' ? (
                <div className="p-4 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-left space-y-1">
                  <div className="flex items-center gap-2 text-[#065F46] text-sm font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span>New link sent</span>
                  </div>
                  <p className="text-xs text-[#047857] pl-7">Please check your email.</p>
                </div>
              ) : (
                <form onSubmit={handleSendNewLink} className="space-y-4">
                  {resendError ? (
                    <div className="text-left bg-red-50 p-4 rounded-xl border border-red-100 space-y-1">
                      <div className="flex items-center gap-2 text-red-800 text-sm font-semibold">
                        <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                        <span>{resendError.title}</span>
                      </div>
                      <p className="text-xs text-red-600 pl-7">{resendError.description}</p>
                    </div>
                  ) : errorMessage ? (
                    <p className="text-xs text-red-600 font-medium leading-normal bg-red-50 p-2.5 rounded-lg border border-red-100">
                      {errorMessage}
                    </p>
                  ) : null}

                  {showEmailInput && (
                    <div className="space-y-1.5 text-left">
                      <label htmlFor="resend-email" className="text-xs font-semibold uppercase tracking-wider text-[#71717A]">
                        Email Address
                      </label>
                      <input
                        id="resend-email"
                        type="email"
                        required
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="e.g. sarah@example.com"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#D9D6CE] bg-white text-[#18181B] text-sm focus:outline-none focus:ring-2 focus:ring-[#C59B27]/30 focus:border-[#C59B27] transition-all"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={resendLoading}
                    className="w-full py-3.5 px-6 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-medium text-base shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40 disabled:opacity-50"
                  >
                    {resendLoading ? 'Sending...' : 'Send new link'}
                  </button>
                </form>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('/parent/sign-in')}
                  className="text-xs font-semibold tracking-widest text-[#18181B] underline underline-offset-4 hover:text-[#C59B27] uppercase transition-colors"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

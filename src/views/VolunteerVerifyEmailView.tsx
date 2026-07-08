import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Mail } from 'lucide-react';
import { AppRoute } from '../types';
import { api, extractApiError } from '../services/api';
import { validateEmailSyntax } from '../utils/validation';
import { AuthScreenShell } from '../components/common/AuthScreenShell';

interface VolunteerVerifyEmailViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const VolunteerVerifyEmailView: React.FC<VolunteerVerifyEmailViewProps> = ({ onNavigate }) => {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'check_email'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<'sent' | 'generic' | 'already_verified' | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState<{ title: string; description: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const [emailInputError, setEmailInputError] = useState<string | null>(null);
  const [emailInputSuggestion, setEmailInputSuggestion] = useState<string | null>(null);
  const [emailInputTouched, setEmailInputTouched] = useState(false);

  const validateEmailInput = (val: string) => {
    const res = validateEmailSyntax(val);
    if (!res.valid) {
      if (res.suggestion) {
        const [local] = val.trim().split('@');
        setEmailInputSuggestion(`${local}@${res.suggestion}`);
      } else {
        setEmailInputSuggestion(null);
      }
      return res.message || 'Enter a valid email address.';
    }
    setEmailInputSuggestion(null);
    return null;
  };

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
        setStatus('check_email');
        return;
      }

      try {
        await api.auth.verifyEmail(token);
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        const { message } = extractApiError(err);
        setErrorMessage(message || 'The confirmation link is invalid or expired.');
      }
    };

    performVerification();
  }, [token]);

  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setTimeout(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendNewLink = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const emailToUse = emailParam || emailInput;
    if (!emailToUse) {
      setShowEmailInput(true);
      return;
    }

    if (!emailParam) {
      setEmailInputTouched(true);
      const err = validateEmailInput(emailInput);
      setEmailInputError(err);
      if (err) {
        return;
      }
    }

    setResendLoading(true);
    setErrorMessage(null);
    setResendSuccess(null);
    setResendError(null);

    try {
      const res = await api.volunteer.resendVerification(emailToUse);
      if (res && res.alreadyVerified) {
        setResendSuccess('already_verified');
      } else if (res && res.generic) {
        setResendSuccess('generic');
      } else if (res && res.emailSent) {
        setResendSuccess('sent');
        setCooldown(res.retryAfterSeconds || 60);
      } else {
        setResendError({
          title: 'We could not send a new confirmation link right now. Please try again.',
          description: res?.message || 'Please try again.'
        });
      }
    } catch (err: any) {
      if (err && typeof err === 'object' && err.code === 'RESEND_COOLDOWN') {
        const retry = err.data?.retryAfterSeconds || 60;
        setCooldown(retry);
        setResendError({
          title: 'Please wait before requesting another link.',
          description: 'Please wait for the cooldown to expire.'
        });
      } else {
        const parsed = extractApiError(err);
        setResendError({
          title: 'We could not send a new confirmation link right now. Please try again.',
          description: parsed.message || 'Please try again.'
        });
      }
    } finally {
      setResendLoading(false);
    }
  };

  const isButtonDisabled =
    resendLoading ||
    cooldown > 0 ||
    (!emailParam && (!emailInput || !!emailInputError)) ||
    resendSuccess === 'already_verified';

  return (
    <AuthScreenShell
      dataViewVersion="volunteer-verify-email-soft-surface-v1"
      showBack
      onBack={() => onNavigate('/')}
      maxWidth="md"
    >
      {status === 'verifying' && (
        <div className="space-y-6 py-6 flex flex-col items-center animate-pulse">
          <Loader2 className="w-12 h-12 text-[#C59B27] animate-spin stroke-[2]" />
          <div className="space-y-1">
            <h1 className="font-serif-koinonia font-bold text-xl text-[#18181B] tracking-tight">
              Confirming your email...
            </h1>
            <p className="text-xs text-gray-500 animate-pulse">
              Please wait while we confirm your email address for Volunteer Access.
            </p>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-6 py-4 animate-fade-in text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-10 h-10 stroke-[1.5]" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="font-serif-koinonia font-bold text-2xl text-[#18181B] tracking-tight">
              Email Verified!
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Thank you! Your email is now successfully confirmed. You can now log into your Volunteer Access account.
            </p>
          </div>

          <button
            onClick={() => onNavigate('/volunteer/sign-in')}
            className="w-full h-11 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-2xl flex items-center justify-center space-x-2 shadow-sm transition-colors cursor-pointer focus:outline-none"
          >
            <span>Continue to Sign In</span>
          </button>
        </div>
      )}

      {status === 'check_email' && (
        <div className="space-y-6 py-4 animate-fade-in text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-[#C59B27]">
              <Mail className="w-8 h-8 stroke-[1.5]" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="font-serif-koinonia font-bold text-xl text-[#18181B] tracking-tight">
              Check your email
            </h1>
            <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
              We sent a confirmation link for Volunteer Access. Please open it to confirm your email.
            </p>
            {emailParam && (
              <p className="text-xs text-gray-700 font-semibold bg-[#FAF6EC] border border-[#EBE3D3] rounded-xl py-1.5 px-3 inline-block mt-2">
                Sent to: {emailParam}
              </p>
            )}
          </div>

          {/* RESEND FLOW NOTIFICATIONS */}
          {resendSuccess === 'sent' && (
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs text-emerald-800 font-semibold text-center animate-fade-in">
              A fresh confirmation link has been sent. Please check your inbox and spam folder.
            </div>
          )}

          {resendSuccess === 'generic' && (
            <div className="p-4 bg-[#F4F4F5] border border-gray-200 rounded-2xl text-xs text-gray-600 font-semibold text-center animate-fade-in">
              If this email is connected to Volunteer Access, a confirmation link will be sent.
            </div>
          )}

          {resendSuccess === 'already_verified' && (
            <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-2xl text-left space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 stroke-[2.5]" />
                <span>This email is already confirmed. You can sign in.</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/volunteer/sign-in')}
                className="w-full h-11 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-2xl flex items-center justify-center space-x-2 shadow-sm transition-colors cursor-pointer focus:outline-none"
              >
                Continue to Volunteer Sign In
              </button>
            </div>
          )}

          {resendError && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 font-medium text-left">
              <strong>{resendError.title}</strong>
              <p className="mt-0.5 text-gray-500">{resendError.description}</p>
            </div>
          )}

          {resendSuccess !== 'already_verified' && (
            <div className="space-y-3 pt-2">
              {(!emailParam || showEmailInput) && (
                <div className="space-y-1 text-left">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block ml-1">
                    EMAIL ADDRESS
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setEmailInputError(validateEmailInput(e.target.value));
                    }}
                    className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-white"
                    disabled={resendLoading}
                  />
                  {emailInputError && (
                    <p className="text-xs text-red-600 font-medium ml-1">{emailInputError}</p>
                  )}
                  {emailInputSuggestion && (
                    <button
                      type="button"
                      onClick={() => {
                        setEmailInput(emailInputSuggestion);
                        setEmailInputError(null);
                        setEmailInputSuggestion(null);
                      }}
                      className="text-xs text-[#C59B27] hover:underline block ml-1 text-left cursor-pointer"
                    >
                      Did you mean <span className="font-semibold">{emailInputSuggestion}</span>?
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleSendNewLink()}
                disabled={isButtonDisabled}
                className="w-full h-11 bg-[#C59B27] hover:bg-[#B89047] disabled:bg-gray-200 text-white font-semibold rounded-2xl flex items-center justify-center space-x-2 transition-colors cursor-pointer focus:outline-none"
              >
                {resendLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span>
                    {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend confirmation email'}
                  </span>
                )}
              </button>

              {!emailParam && !showEmailInput && (
                <button
                  type="button"
                  onClick={() => setShowEmailInput(true)}
                  className="text-xs font-semibold text-[#B89047] hover:underline block mx-auto cursor-pointer focus:outline-none"
                >
                  Enter a different email address
                </button>
              )}

              <button
                onClick={() => onNavigate('/volunteer/sign-in')}
                className="text-xs font-semibold text-[#6B7280] hover:text-[#262626] block mx-auto cursor-pointer focus:outline-none"
              >
                Back to Volunteer Sign In
              </button>
            </div>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-6 py-4 animate-fade-in text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-600">
              <XCircle className="w-10 h-10 stroke-[1.5]" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="font-serif-koinonia font-bold text-xl text-[#18181B] tracking-tight">
              Confirmation Link Invalid
            </h1>
            <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
              The confirmation link is invalid, broken, or has expired. You can request a fresh link below.
            </p>
          </div>

          {errorMessage && (
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-gray-600 font-medium text-left">
              {errorMessage}
            </div>
          )}

          {/* RESEND FLOW NOTIFICATIONS */}
          {resendSuccess === 'sent' && (
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs text-emerald-800 font-semibold text-center animate-fade-in">
              A fresh confirmation link has been sent. Please check your inbox and spam folder.
            </div>
          )}

          {resendSuccess === 'generic' && (
            <div className="p-4 bg-[#F4F4F5] border border-gray-200 rounded-2xl text-xs text-gray-600 font-semibold text-center animate-fade-in">
              If this email is connected to Volunteer Access, a confirmation link will be sent.
            </div>
          )}

          {resendSuccess === 'already_verified' && (
            <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-2xl text-left space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 stroke-[2.5]" />
                <span>This email is already confirmed. You can sign in.</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/volunteer/sign-in')}
                className="w-full h-11 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-2xl flex items-center justify-center space-x-2 shadow-sm transition-colors cursor-pointer focus:outline-none"
              >
                Continue to Volunteer Sign In
              </button>
            </div>
          )}

          {resendError && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 font-medium text-left animate-fade-in">
              <strong>{resendError.title}</strong>
              <p className="mt-0.5 text-gray-500">{resendError.description}</p>
            </div>
          )}

          {resendSuccess !== 'already_verified' && (
            <div className="space-y-3 pt-2">
              {(!emailParam || showEmailInput) && (
                <div className="space-y-1 text-left">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block ml-1">
                    EMAIL ADDRESS
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setEmailInputError(validateEmailInput(e.target.value));
                    }}
                    className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-white"
                    disabled={resendLoading}
                  />
                  {emailInputError && (
                    <p className="text-xs text-red-600 font-medium ml-1">{emailInputError}</p>
                  )}
                  {emailInputSuggestion && (
                    <button
                      type="button"
                      onClick={() => {
                        setEmailInput(emailInputSuggestion);
                        setEmailInputError(null);
                        setEmailInputSuggestion(null);
                      }}
                      className="text-xs text-[#C59B27] hover:underline block ml-1 text-left cursor-pointer"
                    >
                      Did you mean <span className="font-semibold">{emailInputSuggestion}</span>?
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleSendNewLink()}
                disabled={isButtonDisabled}
                className="w-full h-11 bg-[#C59B27] hover:bg-[#B89047] disabled:bg-gray-200 text-white font-semibold rounded-2xl flex items-center justify-center space-x-2 transition-colors cursor-pointer focus:outline-none"
              >
                {resendLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span>
                    {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend confirmation email'}
                  </span>
                )}
              </button>

              {!emailParam && !showEmailInput && (
                <button
                  type="button"
                  onClick={() => setShowEmailInput(true)}
                  className="text-xs font-semibold text-[#B89047] hover:underline block mx-auto cursor-pointer focus:outline-none"
                >
                  Enter a different email address
                </button>
              )}

              <button
                onClick={() => onNavigate('/volunteer/sign-in')}
                className="text-xs font-semibold text-[#6B7280] hover:text-[#262626] block mx-auto cursor-pointer focus:outline-none"
              >
                Back to Volunteer Sign In
              </button>
            </div>
          )}
        </div>
      )}
    </AuthScreenShell>
  );
};

import React, { useState, useEffect } from 'react';
import { Mail, ChevronLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { AppRoute } from '../types';
import { api, extractApiError } from '../services/api';
import { validateEmailSyntax } from '../utils/validation';

interface VolunteerForgotPasswordViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const VolunteerForgotPasswordView: React.FC<VolunteerForgotPasswordViewProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [emailSent, setEmailSent] = useState(false);
  const [generic, setGeneric] = useState(false);

  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setTimeout(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const validateEmail = (val: string) => {
    const res = validateEmailSyntax(val);
    if (!res.valid) {
      if (res.suggestion) {
        const [local] = val.trim().split('@');
        setSuggestion(`${local}@${res.suggestion}`);
      } else {
        setSuggestion(null);
      }
      return res.message || 'Enter a valid email address.';
    }
    setSuggestion(null);
    return null;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    if (touched) {
      setEmailError(validateEmail(val));
    }
    setError(null);
  };

  const handleEmailBlur = () => {
    setTouched(true);
    setEmailError(validateEmail(email));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const err = validateEmail(email);
    setEmailError(err);
    if (err) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.volunteer.requestPasswordReset(email.trim().toLowerCase());
      
      if (res && res.emailSent === true) {
        setEmailSent(true);
        setGeneric(false);
        setSubmitted(true);
        if (res.retryAfterSeconds) {
          setCooldown(res.retryAfterSeconds);
        }
      } else if (res && res.generic === true) {
        setEmailSent(false);
        setGeneric(true);
        setSubmitted(true);
      } else {
        setEmailSent(false);
        setGeneric(true);
        setSubmitted(true);
      }
    } catch (err: any) {
      const parsed: any = extractApiError(err);
      const code = parsed.code || err.code;
      const data = parsed.data || err.data;
      if (code === 'RESET_COOLDOWN' || code === 'RESEND_COOLDOWN') {
        const retry = data?.retryAfterSeconds || 60;
        setCooldown(retry);
        setError('Please wait before requesting another reset link.');
      } else if (code === 'EMAIL_SEND_FAILED') {
        setError('We could not send a reset link right now. Please try again.');
      } else {
        setError(parsed.message || 'We could not send a reset link right now. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const emailValid = email.trim().length > 0 && validateEmailSyntax(email).valid;
  const isButtonDisabled = loading || cooldown > 0 || !emailValid;

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] flex flex-col justify-between font-sans pb-12">
      {/* Header Bar */}
      <header className="w-full pt-4 pb-3 px-6 bg-white border-b border-[#EAE8E1]">
        <div className="max-w-[440px] mx-auto flex items-center justify-between">
          <button
            onClick={() => onNavigate('/volunteer/sign-in')}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer focus:outline-none"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span id="forgot-password-eyebrow" className="text-xs font-mono font-medium text-gray-400 tracking-wider uppercase">VOLUNTEER ACCESS</span>
          <div className="w-8" />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[440px] w-full mx-auto px-6 pt-12 pb-8 flex flex-col justify-center">
        <div className="bg-white border border-[#EAE8E1] rounded-3xl p-8 shadow-sm space-y-6">
          
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-serif-koinonia font-bold text-[#18181B]">
              Reset your password
            </h1>
            <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
              Enter the email connected to your Volunteer Access. If it matches our records, we’ll send a secure reset link.
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 font-medium">
              {error}
            </div>
          )}

          {cooldown > 0 && !submitted && (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-800 font-medium">
              Please wait {cooldown}s before requesting another reset link.
            </div>
          )}

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700 block">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="you@koinonia.org"
                    value={email}
                    onChange={handleEmailChange}
                    onBlur={handleEmailBlur}
                    className="w-full h-11 pl-4 pr-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                    disabled={loading}
                  />
                </div>
                {emailError && <p className="text-xs text-red-600 font-medium ml-1">{emailError}</p>}
                
                {suggestion && (
                  <div className="mt-1.5 text-xs text-[#B89047] font-semibold bg-[#FAF6EC] border border-[#EBE3D3] p-2 px-3 rounded-xl flex items-center justify-between">
                    <span>Did you mean <strong>{suggestion}</strong>?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(suggestion);
                        setEmailError(null);
                        setSuggestion(null);
                      }}
                      className="ml-2 bg-[#B89047] hover:bg-[#A37E3A] text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isButtonDisabled}
                className="w-full h-11 bg-[#C59B27] hover:bg-[#B89047] disabled:bg-gray-200 text-white font-semibold rounded-2xl flex items-center justify-center space-x-2 transition-colors cursor-pointer focus:outline-none shadow-sm"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : cooldown > 0 ? (
                  <span>Wait {cooldown}s</span>
                ) : (
                  <span>Send reset link</span>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-6 py-2 animate-fade-in text-center">
              <div className="flex justify-center">
                {emailSent ? (
                  <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="w-10 h-10 stroke-[1.5]" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400">
                    <Mail className="w-8 h-8 stroke-[1.5]" />
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <p className="text-sm text-gray-600 leading-relaxed max-w-sm mx-auto font-medium">
                  {emailSent 
                    ? "A reset link has been sent. Please check your inbox and spam folder."
                    : "If this email is connected to Volunteer Access, a reset link will be sent."}
                </p>
                {email && (
                  <p className="text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-full py-1 px-4 inline-block mt-2">
                    {emailSent ? `Sent to: ${email}` : `Target: ${email}`}
                  </p>
                )}
              </div>

              {cooldown > 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-800 font-medium">
                  Try again in {cooldown}s
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="text-xs font-semibold text-[#B89047] hover:underline block mx-auto cursor-pointer focus:outline-none"
                >
                  Request another link
                </button>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-[#EAE8E1] text-center">
            <button
              onClick={() => onNavigate('/volunteer/sign-in')}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700 block mx-auto cursor-pointer focus:outline-none"
            >
              Back to Volunteer Sign In
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Mail, ChevronLeft, Loader2, CheckCircle2, KeyRound, Info } from 'lucide-react';
import { AppRoute } from '../types';
import { api, extractApiError } from '../services/api';
import { validateEmailSyntax } from '../utils/validation';
import { AuthFormField } from '../components/common/AuthFormField';
import { Button } from '../components/common/Button';
import { AuthScreenShell } from '../components/common/AuthScreenShell';

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
    <AuthScreenShell
      dataViewVersion="volunteer-forgot-password-soft-surface-v1"
      showBack
      onBack={() => onNavigate('/volunteer/sign-in')}
      maxWidth="md"
    >
      <div className="flex justify-center">
        <div className="w-14 h-14 rounded-2xl bg-[#FAF6EC] text-[#C59B27] flex items-center justify-center shadow-inner border border-[#E5D5AE]">
          <KeyRound className="w-7 h-7" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-3xl font-serif-koinonia font-bold text-[#18181B]">
          Forgot password?
        </h1>
        <p className="text-sm text-[#52525B] leading-relaxed max-w-sm mx-auto">
          Enter the email connected to your Volunteer Access. We’ll send steps to help you continue.
        </p>
      </div>

      {error && (
        <div className="bg-red-50/50 border border-red-200/60 text-red-600 p-3.5 rounded-2xl text-xs font-medium text-center">
          {error}
        </div>
      )}

      {cooldown > 0 && !submitted && (
        <div className="bg-amber-50/50 border border-amber-200/60 text-amber-800 p-3.5 rounded-2xl text-xs font-medium text-center">
          Please wait {cooldown}s before requesting another reset link.
        </div>
      )}

      {!submitted ? (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <AuthFormField
            id="email"
            label="Email address"
            type="email"
            placeholder="e.g. volunteer@email.com"
            value={email}
            onChange={handleEmailChange}
            onBlur={handleEmailBlur}
            error={emailError || undefined}
            isValid={!emailError}
            isTouched={touched}
            suggestion={suggestion || undefined}
            onApplySuggestion={() => {
              setEmail(suggestion!);
              setEmailError(null);
              setSuggestion(null);
            }}
          />

          <div className="pt-2">
            <Button
              type="submit"
              disabled={isButtonDisabled}
              fullWidth
              size="lg"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                </span>
              ) : cooldown > 0 ? (
                `Wait ${cooldown}s`
              ) : (
                'Send reset link'
              )}
            </Button>
          </div>
        </form>
      ) : (
        <div className="bg-[#FFFDF9] rounded-2xl p-6 border border-[#EBE3D3]/70 space-y-6 text-center animate-fade-in">
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
          
          <p className="text-sm text-[#52525B] leading-relaxed max-w-sm mx-auto">
            {emailSent 
              ? "A reset link has been sent. Please check your inbox and spam folder."
              : "If this email is connected to Volunteer Access, a reset link will be sent."}
          </p>

          {email && (
            <div className="inline-flex items-center justify-center bg-[#FAF6EC] border border-[#EBE3D3] rounded-full py-1.5 px-4 text-xs font-medium text-[#715D3A] break-all max-w-full">
              {emailSent ? `Sent to: ${email}` : `Target: ${email}`}
            </div>
          )}

          <div className="pt-2">
            {cooldown > 0 ? (
              <Button
                variant="primary"
                disabled
                fullWidth
                size="lg"
              >
                Try again in {cooldown}s
              </Button>
            ) : (
              <Button
                variant="primary"
                fullWidth
                size="lg"
                onClick={() => setSubmitted(false)}
              >
                Resend reset link
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Bottom helper box */}
      {!submitted && (
        <div className="bg-[#FAF6EC] border border-[#EBE3D3] rounded-[16px] p-4 flex items-start space-x-3 shadow-sm text-left">
          <Info className="w-5 h-5 text-[#B89047] shrink-0 mt-0.5" />
          <p className="text-xs text-[#52525B] leading-relaxed">
            After you receive the email, follow the steps to create a new password.
          </p>
        </div>
      )}

      {/* Back link */}
      <div className="pt-4 border-t border-[#EBE3D3] text-center shrink-0">
        <button
          onClick={() => onNavigate('/volunteer/sign-in')}
          className="inline-flex items-center text-xs font-semibold text-[#6B7280] hover:text-[#262626] cursor-pointer focus:outline-none"
        >
          <ChevronLeft className="w-3.5 h-3.5 mr-1" />
          Back to Volunteer Sign In
        </button>
      </div>
    </AuthScreenShell>
  );
};

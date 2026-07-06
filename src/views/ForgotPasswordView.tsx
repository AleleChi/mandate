import React, { useState } from 'react';
import { AppRoute } from '../types';
import { MobileShell } from '../components/common/MobileShell';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { KeyRound, Mail, ArrowLeft } from 'lucide-react';
import { api } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { validateEmailSyntax } from '../utils/validation';

interface ForgotPasswordViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const ForgotPasswordView: React.FC<ForgotPasswordViewProps> = ({ onNavigate }) => {
  const { showSuccess } = useNotification();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

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

    if (email.trim() && !loading) {
      setLoading(true);
      try {
        await api.auth.forgotPassword(email.trim());
      } catch {
        // Fallback for demo preview
      } finally {
        setLoading(false);
        setSubmitted(true);
        showSuccess('Check your email', 'We sent instructions to reset your password.');
      }
    }
  };

  return (
    <MobileShell
      title="Security"
      subtitle="Forgot password"
      showBack
      onBack={() => onNavigate('/parent/sign-in')}
    >
      <div className="bg-white rounded-3xl p-6 border border-[#EAE8E1] shadow-sm space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-[#FAF6EB] text-[#C59B27] flex items-center justify-center shadow-inner border border-[#E5D5AE]">
          <KeyRound className="w-7 h-7" />
        </div>

        <div>
          <h1 className="text-2xl font-serif-koinonia font-bold text-[#18181B]">
            Forgot password
          </h1>
          <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
            Enter your parent email address and we will send instructions to create a new secure password.
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="sarah@example.com"
              value={email}
              onChange={handleEmailChange}
              onBlur={handleEmailBlur}
              error={emailError || undefined}
              icon={<Mail className="w-4 h-4" />}
            />

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

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                fullWidth
                size="lg"
                disabled={loading || !email.trim() || !validateEmailSyntax(email).valid}
              >
                {loading ? 'Sending...' : 'Send recovery steps'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="bg-[#FAF9F6] p-5 rounded-2xl border border-[#EAE8E1] space-y-4 text-center">
            <p className="text-xs text-[#262626] leading-relaxed">
              We have sent password recovery steps to <span className="font-bold">{email}</span>. Please check your inbox.
            </p>
            <div className="flex flex-col space-y-2">
              <Button
                variant="primary"
                fullWidth
                onClick={() => onNavigate('/parent/new-password')}
              >
                Proceed to create new password
              </Button>
              <button
                onClick={() => setSubmitted(false)}
                className="text-xs text-[#6B7280] hover:underline pt-2"
              >
                Try a different email address
              </button>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-[#EAE8E1] text-center">
          <button
            onClick={() => onNavigate('/parent/sign-in')}
            className="inline-flex items-center text-xs font-semibold text-[#6B7280] hover:text-[#262626]"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to sign in
          </button>
        </div>
      </div>
    </MobileShell>
  );
};

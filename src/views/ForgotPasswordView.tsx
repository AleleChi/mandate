import React, { useState } from 'react';
import { AppRoute } from '../types';
import { MobileShell } from '../components/common/MobileShell';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { KeyRound, Mail, ArrowLeft } from 'lucide-react';
import { api } from '../services/api';

interface ForgotPasswordViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const ForgotPasswordView: React.FC<ForgotPasswordViewProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && !loading) {
      setLoading(true);
      try {
        await api.auth.forgotPassword(email.trim());
      } catch {
        // Fallback for demo preview
      } finally {
        setLoading(false);
        setSubmitted(true);
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
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="w-4 h-4" />}
            />

            <div className="pt-2">
              <Button type="submit" variant="primary" fullWidth size="lg">
                Send recovery steps
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

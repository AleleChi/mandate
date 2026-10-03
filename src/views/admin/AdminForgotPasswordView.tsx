import React, { useState } from 'react';
import { AppRoute } from '../../types';
import { Info, Mail, CheckCircle } from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { Button } from '../../components/common/Button';
import { AuthScreenShell } from '../../components/common/AuthScreenShell';
import { validateEmailSyntax } from '../../utils/validation';

interface AdminForgotPasswordViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const AdminForgotPasswordView: React.FC<AdminForgotPasswordViewProps> = ({
  onNavigate
}) => {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validateEmail = (val: string) => {
    const res = validateEmailSyntax(val);
    if (!res.valid) {
      return res.message || 'Enter a valid email address.';
    }
    return null;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    setError(null);
    setEmailError(validateEmail(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const emailErr = validateEmail(email);
    setEmailError(emailErr);

    if (emailErr) {
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await api.admin.requestPasswordReset(email.trim().toLowerCase());
      setSuccess(true);
    } catch (err: any) {
      const parsed = extractApiError(err);
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthScreenShell showBack={true} onBack={() => onNavigate('/admin/sign-in')}>
        <div className="space-y-6 text-center py-4">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto text-green-600">
            <CheckCircle className="w-10 h-10" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
              Link Sent Successfully
            </h2>
            <p className="text-sm text-[#71717A] max-w-sm mx-auto">
              If an administrator account is registered with <strong className="text-[#18181B]">{email.trim()}</strong>, you will receive a secure password reset link shortly.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 text-left flex items-start space-x-3">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Please check your inbox (and spam folder if needed) for instructions on creating a secure new password. The reset link is valid for 1 hour.</p>
          </div>

          <Button
            type="button"
            onClick={() => onNavigate('/admin/sign-in')}
            className="w-full bg-[#18181B] text-white py-3.5 rounded-xl hover:bg-[#27272A] font-medium"
          >
            Return to Admin Sign In
          </Button>
        </div>
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell showBack={true} onBack={() => onNavigate('/admin/sign-in')}>
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
          Recover Password
        </h2>
        <p className="text-sm text-[#71717A] max-w-xs mx-auto">
          Enter your administrator email to receive a secure recovery link.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm flex items-start space-x-3">
          <Info className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#18181B]">
            Administrator Email
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
              <Mail className="w-5 h-5" />
            </span>
            <input
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder="e.g. admin@koinonia.org"
              disabled={loading}
              className={`w-full pl-11 pr-4 py-3 rounded-xl bg-white border ${
                emailError ? 'border-red-500 focus:ring-red-100' : 'border-[#EAE8E1] focus:ring-amber-100 focus:border-[#C59B27]'
              } focus:outline-none focus:ring-4 transition-all duration-200 text-[#18181B] text-base`}
            />
          </div>
          {emailError && (
            <p className="text-xs text-red-600 font-medium">{emailError}</p>
          )}
        </div>

        <Button
          type="submit"
          loading={loading}
          className="w-full bg-[#18181B] text-white py-3.5 rounded-xl hover:bg-[#27272A] transition-colors font-medium flex items-center justify-center space-x-2 text-base"
        >
          Request Recovery Link
        </Button>
      </form>
    </AuthScreenShell>
  );
};

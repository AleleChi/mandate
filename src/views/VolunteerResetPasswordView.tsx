import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, ChevronLeft, KeyRound } from 'lucide-react';
import { AppRoute } from '../types';
import { api, extractApiError } from '../services/api';
import { AuthFormField } from '../components/common/AuthFormField';
import { Button } from '../components/common/Button';
import { AuthScreenShell } from '../components/common/AuthScreenShell';

interface VolunteerResetPasswordViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const VolunteerResetPasswordView: React.FC<VolunteerResetPasswordViewProps> = ({ onNavigate }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'editing' | 'success' | 'expired'>('editing');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getQueryParams = () => {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    const queryString = queryIndex !== -1 ? hash.substring(queryIndex) : window.location.search;
    return new URLSearchParams(queryString);
  };

  const queryParams = getQueryParams();
  const token = queryParams.get('token') || '';

  // Password Validation Rules: at least 8 characters with a letter and a number
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordValid = password.length >= 8 && hasLetter && hasNumber;
  const passwordsMatch = password === confirmPassword;
  const canSubmit = passwordValid && passwordsMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Reset token is missing. Please request a new link.');
      return;
    }

    if (!passwordValid) {
      setError('Use at least 8 characters with a letter and a number.');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await api.volunteer.resetPassword(token, password);
      setStatus('success');
    } catch (err: any) {
      const parsed = extractApiError(err);
      if (parsed.code === 'INVALID_OR_EXPIRED_TOKEN') {
        setStatus('expired');
      } else {
        setError(parsed.message || 'We could not update your password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell
      dataViewVersion="volunteer-reset-password-soft-surface-v1"
      showBack
      onBack={() => onNavigate('/volunteer/sign-in')}
      maxWidth="md"
    >
      {!token ? (
        <div className="space-y-6 text-center animate-fade-in">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-600">
              <AlertTriangle className="w-10 h-10 stroke-[1.5]" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="font-serif-koinonia font-bold text-2xl text-[#18181B] tracking-tight">
              Reset link missing
            </h1>
            <p className="text-sm text-[#52525B] leading-relaxed max-w-sm mx-auto">
              Please request a new password reset link to continue.
            </p>
          </div>

          <div className="pt-2">
            <Button
              onClick={() => onNavigate('/volunteer/forgot-password')}
              fullWidth
              size="lg"
            >
              Request new link
            </Button>
          </div>
        </div>
      ) : status === 'expired' ? (
        <div className="space-y-6 text-center animate-fade-in">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-600">
              <AlertTriangle className="w-10 h-10 stroke-[1.5]" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="font-serif-koinonia font-bold text-2xl text-[#18181B] tracking-tight">
              Reset link expired
            </h1>
            <p className="text-sm text-[#52525B] leading-relaxed max-w-sm mx-auto">
              This reset link has expired. Please request a new one.
            </p>
          </div>

          <div className="pt-2">
            <Button
              onClick={() => onNavigate('/volunteer/forgot-password')}
              fullWidth
              size="lg"
            >
              Request new link
            </Button>
          </div>
        </div>
      ) : status === 'success' ? (
        <div className="space-y-6 text-center animate-fade-in">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-10 h-10 stroke-[1.5]" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="font-serif-koinonia font-bold text-3xl text-[#18181B] tracking-tight">
              Password updated
            </h1>
            <p className="text-sm text-[#52525B] leading-relaxed max-w-sm mx-auto font-medium">
              Your password has been updated. You can now sign in.
            </p>
          </div>

          <div className="pt-2">
            <Button
              onClick={() => onNavigate('/volunteer/sign-in')}
              fullWidth
              size="lg"
            >
              Continue to Volunteer Sign In
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF6EC] text-[#C59B27] flex items-center justify-center shadow-inner border border-[#E5D5AE]">
              <KeyRound className="w-7 h-7" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-3xl font-serif-koinonia font-bold text-[#18181B]">
              Create new password
            </h1>
            <p className="text-sm text-[#52525B] leading-relaxed max-w-sm mx-auto">
              Choose a new password for your Volunteer Access.
            </p>
          </div>

          {error && (
            <div className="bg-red-50/50 border border-red-200/60 text-red-600 p-3.5 rounded-2xl text-xs font-medium text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <AuthFormField
              id="password"
              label="NEW PASSWORD"
              type="password"
              placeholder="Enter new password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              error={password.length > 0 && !passwordValid ? "Use at least 8 characters with a letter and a number." : undefined}
              isTouched={password.length > 0}
              isValid={passwordValid}
            />

            <AuthFormField
              id="confirmPassword"
              label="CONFIRM PASSWORD"
              type="password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
              error={confirmPassword.length > 0 && !passwordsMatch ? "Passwords do not match." : undefined}
              isTouched={confirmPassword.length > 0}
              isValid={passwordsMatch && confirmPassword.length > 0}
              helperText="Use at least 8 characters with a letter and a number."
            />

            <div className="pt-2">
              <Button
                type="submit"
                disabled={!canSubmit}
                fullWidth
                size="lg"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                  </span>
                ) : (
                  'Continue'
                )}
              </Button>
            </div>
          </form>
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

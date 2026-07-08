import React, { useState } from 'react';
import { AppRoute } from '../../types';
import { Eye, EyeOff, CheckCircle, Info, Lock, KeyRound } from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { Button } from '../../components/common/Button';
import { AuthScreenShell } from '../../components/common/AuthScreenShell';

interface AdminResetPasswordViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const AdminResetPasswordView: React.FC<AdminResetPasswordViewProps> = ({
  onNavigate
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  // Password rules: 8+ chars, at least 1 letter and 1 number
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordValid = password.length >= 8 && hasLetter && hasNumber;
  const passwordsMatch = password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setError('Recovery token is missing. Please request a new link.');
      return;
    }

    if (!passwordValid) {
      setError('Password does not meet the complexity requirements.');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await api.admin.resetPassword({ token, password });
      setStatus('success');
    } catch (err: any) {
      const parsed = extractApiError(err);
      setError(parsed.message);
      if (parsed.message.toLowerCase().includes('expired') || parsed.message.toLowerCase().includes('invalid')) {
        setStatus('expired');
      }
    } finally {
      setLoading(false);
    }
  };

  if (status === 'success') {
    return (
      <AuthScreenShell showBack={false}>
        <div className="space-y-6 text-center py-4">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto text-green-600">
            <CheckCircle className="w-10 h-10" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
              Password Updated
            </h2>
            <p className="text-sm text-[#71717A] max-w-sm mx-auto">
              Your administrator password has been updated. You can now log in using your new credentials.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => onNavigate('/admin/sign-in')}
            className="w-full bg-[#18181B] text-white py-3.5 rounded-xl hover:bg-[#27272A] font-medium"
          >
            Go to Admin Sign In
          </Button>
        </div>
      </AuthScreenShell>
    );
  }

  if (status === 'expired' || !token) {
    return (
      <AuthScreenShell showBack={true} onBack={() => onNavigate('/admin/sign-in')}>
        <div className="space-y-6 text-center py-4">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-600">
            <Info className="w-10 h-10" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
              Link Expired or Invalid
            </h2>
            <p className="text-sm text-[#71717A] max-w-sm mx-auto">
              This recovery link is invalid or has expired. Recovery links are single-use and only valid for 1 hour.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => onNavigate('/admin/forgot-password')}
            className="w-full bg-[#18181B] text-white py-3.5 rounded-xl hover:bg-[#27272A] font-medium"
          >
            Request New Recovery Link
          </Button>
        </div>
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell showBack={true} onBack={() => onNavigate('/admin/sign-in')}>
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
          Create New Password
        </h2>
        <p className="text-sm text-[#71717A] max-w-xs mx-auto">
          Please choose a strong, secure new password for your admin account.
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
            New Password
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
              <Lock className="w-5 h-5" />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              disabled={loading}
              placeholder="Min. 8 characters"
              className={`w-full pl-11 pr-11 py-3 rounded-xl bg-white border ${
                password && !passwordValid ? 'border-amber-400' : 'border-[#EAE8E1]'
              } focus:ring-4 focus:outline-none focus:ring-amber-100 focus:border-[#C59B27] transition-all duration-200 text-[#18181B] text-base`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          
          {/* Rules list */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs text-gray-500 space-y-1">
            <div className="flex items-center space-x-2">
              <span className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span>At least 8 characters ({password.length}/8)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-1.5 h-1.5 rounded-full ${hasLetter ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span>At least one letter (a-z)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`w-1.5 h-1.5 rounded-full ${hasNumber ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span>At least one number (0-9)</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#18181B]">
            Confirm Password
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
              <Lock className="w-5 h-5" />
            </span>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
              disabled={loading}
              placeholder="Confirm new password"
              className={`w-full pl-11 pr-11 py-3 rounded-xl bg-white border ${
                confirmPassword && !passwordsMatch ? 'border-red-500 focus:ring-red-100' : 'border-[#EAE8E1]'
              } focus:ring-4 focus:outline-none focus:ring-amber-100 focus:border-[#C59B27] transition-all duration-200 text-[#18181B] text-base`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {confirmPassword && !passwordsMatch && (
            <p className="text-xs text-red-600 font-medium">Passwords do not match.</p>
          )}
        </div>

        <Button
          type="submit"
          loading={loading}
          disabled={!passwordValid || !passwordsMatch}
          className="w-full bg-[#18181B] text-white py-3.5 rounded-xl hover:bg-[#27272A] transition-colors font-medium flex items-center justify-center space-x-2 text-base"
        >
          <KeyRound className="w-5 h-5" />
          <span>Save New Password</span>
        </Button>
      </form>
    </AuthScreenShell>
  );
};

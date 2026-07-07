import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { AppRoute } from '../types';
import { api, extractApiError } from '../services/api';

interface VolunteerResetPasswordViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const VolunteerResetPasswordView: React.FC<VolunteerResetPasswordViewProps> = ({ onNavigate }) => {
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
    <div className="min-h-screen bg-[#FAF9F6] text-[#18181B] flex flex-col justify-between font-sans pb-12">
      {/* Header Bar */}
      <header className="w-full pt-4 pb-3 px-6 bg-white border-b border-[#EAE8E1]">
        <div className="max-w-[440px] mx-auto flex items-center justify-between">
          <div className="w-6" />
          <span id="reset-password-eyebrow" className="text-xs font-mono font-medium text-gray-400 tracking-wider uppercase">VOLUNTEER ACCESS</span>
          <div className="w-6" />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[440px] w-full mx-auto px-6 pt-12 pb-8 flex flex-col justify-center">
        <div className="bg-white border border-[#EAE8E1] rounded-3xl p-8 shadow-sm space-y-6">
          
          {!token ? (
            <div className="space-y-6 py-4 text-center animate-fade-in">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                  <AlertTriangle className="w-10 h-10 stroke-[1.5]" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h1 className="font-serif-koinonia font-bold text-xl text-[#18181B] tracking-tight">
                  Reset link missing
                </h1>
                <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
                  Please request a new password reset link to continue.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('/volunteer/forgot-password')}
                className="w-full h-11 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-2xl flex items-center justify-center shadow-sm transition-colors cursor-pointer focus:outline-none"
              >
                Request new link
              </button>
            </div>
          ) : status === 'expired' ? (
            <div className="space-y-6 py-4 text-center animate-fade-in">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                  <AlertTriangle className="w-10 h-10 stroke-[1.5]" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h1 className="font-serif-koinonia font-bold text-xl text-[#18181B] tracking-tight">
                  Reset link expired
                </h1>
                <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
                  This reset link has expired. Please request a new one.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('/volunteer/forgot-password')}
                className="w-full h-11 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-2xl flex items-center justify-center shadow-sm transition-colors cursor-pointer focus:outline-none"
              >
                Request new link
              </button>
            </div>
          ) : status === 'success' ? (
            <div className="space-y-6 py-4 text-center animate-fade-in">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-10 h-10 stroke-[1.5]" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h1 className="font-serif-koinonia font-bold text-2xl text-[#18181B] tracking-tight">
                  Password updated
                </h1>
                <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
                  Your password has been updated. You can now sign in.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('/volunteer/sign-in')}
                className="w-full h-11 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold rounded-2xl flex items-center justify-center shadow-sm transition-colors cursor-pointer focus:outline-none"
              >
                Continue to Volunteer Sign In
              </button>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-serif-koinonia font-bold text-[#18181B]">
                  Create a new password
                </h1>
                <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
                  Choose a new password for your Volunteer Access.
                </p>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 font-medium">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 block">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                      className="w-full h-11 pl-4 pr-11 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {password.length > 0 && !passwordValid && (
                    <p className="text-[11px] text-red-600 font-medium ml-1">
                      Use at least 8 characters with a letter and a number.
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 block">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setError(null);
                      }}
                      className="w-full h-11 pl-4 pr-11 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p className="text-[11px] text-red-600 font-medium ml-1">
                      Passwords do not match.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full h-11 bg-[#C59B27] hover:bg-[#B89047] disabled:bg-gray-200 text-white font-semibold rounded-2xl flex items-center justify-center space-x-2 transition-colors cursor-pointer focus:outline-none shadow-sm"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span>Save new password</span>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

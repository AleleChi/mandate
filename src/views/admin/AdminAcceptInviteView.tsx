import React, { useState, useEffect } from 'react';
import { AppRoute } from '../../types';
import { ShieldCheck, Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';

interface AdminAcceptInviteViewProps {
  onNavigate: (route: AppRoute) => void;
}

export const AdminAcceptInviteView: React.FC<AdminAcceptInviteViewProps> = ({ onNavigate }) => {
  const { showSuccess, showError } = useNotification();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Parse token from window.location.hash, e.g. #/admin/accept-invite?token=xyz
    const hash = window.location.hash;
    const queryIdx = hash.indexOf('?');
    if (queryIdx !== -1) {
      const searchParams = new URLSearchParams(hash.substring(queryIdx));
      const t = searchParams.get('token');
      if (t) {
        setToken(t);
      } else {
        setErrorMsg('Invalid or missing invitation token.');
      }
    } else {
      setErrorMsg('Invalid or missing invitation token.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      showError('Activation Failed', 'No invitation token found in link.');
      return;
    }

    if (!password) {
      showError('Password Required', 'Please enter a password.');
      return;
    }

    if (password !== confirmPassword) {
      showError('Mismatch', 'Passwords do not match.');
      return;
    }

    // Client-side strength check
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (password.length < 8 || !hasLetter || !hasNumber) {
      showError('Weak Password', 'Password must be at least 8 characters and contain both letters and numbers.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.admin.acceptInvite({ token, password });
      if (res.success) {
        setSuccess(true);
        showSuccess('Account Activated', 'Your administrator profile is now active.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      setErrorMsg(parsed.message || 'Failed to activate account.');
      showError('Activation Failed', parsed.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F2EB] flex items-center justify-center px-4 font-sans antialiased selection:bg-[#C59B27]/30">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#EAE8E1] p-8 shadow-sm space-y-6">
        
        {/* Header Block */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 text-[#C59B27] mb-2">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
            Activate Admin Profile
          </h2>
          <p className="text-sm text-gray-500">
            Set up your password to complete your administrator onboarding
          </p>
        </div>

        {errorMsg && !success && (
          <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-start space-x-3 text-sm text-red-800">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {success ? (
          <div className="space-y-6 text-center animate-fade-in">
            <div className="p-4 bg-green-50 rounded-xl border border-green-100 flex items-start space-x-3 text-sm text-green-800 text-left">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">Activation Successful!</span>
                <span className="block text-xs">Your administrator credentials are now active. You can now log into the Event Command Centre.</span>
              </div>
            </div>
            <Button
              onClick={() => onNavigate('/admin/sign-in')}
              variant="primary"
              fullWidth
            >
              Sign In to Admin Area
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                New Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  disabled={loading || !!errorMsg}
                  className="w-full pl-10 pr-10 py-3 text-sm rounded-xl border border-[#EAE8E1] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all disabled:opacity-55"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={!!errorMsg}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                Confirm Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  disabled={loading || !!errorMsg}
                  className="w-full pl-10 pr-10 py-3 text-sm rounded-xl border border-[#EAE8E1] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-[#C59B27] transition-all disabled:opacity-55"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Must contain at least 8 characters, with at least one letter and one number.
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              disabled={loading || !!errorMsg}
            >
              Set Password & Activate
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

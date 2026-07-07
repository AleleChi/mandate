import React, { useState } from 'react';
import { AppRoute } from '../types';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { validateEmailSyntax } from '../utils/validation';
import { Button } from '../components/common/Button';

interface VolunteerSignInViewProps {
  onNavigate: (route: AppRoute) => void;
  onSignInSuccess?: (user: any, profile: any) => void;
}

export const VolunteerSignInView: React.FC<VolunteerSignInViewProps> = ({
  onNavigate,
  onSignInSuccess
}) => {
  const { showSuccess, showWarning, showError } = useNotification();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailReady = email.trim().length > 0 && validateEmailSyntax(email).valid;
  const passwordReady = password.trim().length > 0;
  const canSubmit = emailReady && passwordReady && !loading;

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

  const validatePassword = (val: string) => {
    if (!val) {
      return 'Enter your password.';
    }
    return null;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    setError(null);
    setEmailError(validateEmail(val));
  };

  const handleEmailBlur = () => {
    setEmailError(validateEmail(email));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPassword(val);
    setError(null);
    setPasswordError(validatePassword(val));
  };

  const handlePasswordBlur = () => {
    setPasswordError(validatePassword(password));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);

    setEmailError(emailErr);
    setPasswordError(passwordErr);

    if (emailErr || passwordErr) {
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await api.volunteer.signIn({ email: cleanEmail, password });

      if (onSignInSuccess) {
        onSignInSuccess(res.user, res.profile);
      }

      showSuccess('Signed in successfully', 'Welcome back to Koinonia Volunteer Access.');

      // Route checks
      if (res.nextRoute) {
        onNavigate(res.nextRoute);
      } else {
        const status = res.profile?.status;
        if (status === 'pending_review') {
          onNavigate('/volunteer/pending-review');
        } else {
          onNavigate('/volunteer/event');
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err) as any;
      const code = err.code || parsed.code;
      const data = err.data || parsed.data;

      if (code === 'ROLE_MISMATCH') {
        setError('This account is not set up for volunteer access.');
        showWarning('Access Blocked', 'This account is set up for parent access. Please log in using Parent Access.');
      } else if (code === 'NO_VOLUNTEER_ACCESS') {
        setError('Volunteer Access has not been requested for this email.');
        showWarning('Access Blocked', 'Volunteer Access has not been requested for this email.');
      } else if (code === 'EMAIL_NOT_VERIFIED') {
        if (onSignInSuccess && data) {
          onSignInSuccess(data.user, data.profile);
        }
        showWarning('Email verification required', 'Please verify your email address to continue.');
        onNavigate(`/volunteer/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      } else {
        setError('Email or password is incorrect.');
        showWarning('Sign-in failed', 'Email or password is incorrect.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] font-sans flex flex-col">
      {/* Header Bar */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-[#EAE8E1] bg-white sticky top-0 z-10">
        <button
          onClick={() => onNavigate('/')}
          className="p-2 -ml-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-xs font-mono font-medium text-gray-400 tracking-wider">VOLUNTEER SIGN IN</span>
        <div className="w-8" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EAE8E1] shadow-sm max-w-md w-full space-y-6">
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-bold font-serif-koinonia text-[#18181B]">Volunteer Access</h1>
            <p id="volunteer-signin-subtitle" className="text-sm text-gray-500">Sign in to support Children and Teens check-in, pickup, and care during the event.</p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Email Address</label>
              <input
                type="email"
                placeholder="you@koinonia.org"
                value={email}
                onChange={handleEmailChange}
                onBlur={handleEmailBlur}
                className="w-full h-11 px-4 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C59B27] bg-gray-50/50"
                disabled={loading}
              />
              {emailError && <p className="text-xs text-red-600 font-medium ml-1">{emailError}</p>}
              {suggestion && (
                <button
                  type="button"
                  onClick={() => {
                    setEmail(suggestion);
                    setEmailError(null);
                    setSuggestion(null);
                  }}
                  className="text-xs text-[#C59B27] hover:underline block ml-1 text-left cursor-pointer"
                >
                  Did you mean <span className="font-semibold">{suggestion}</span>?
                </button>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={handlePasswordChange}
                  onBlur={handlePasswordBlur}
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
              {passwordError && <p className="text-xs text-red-600 font-medium ml-1">{passwordError}</p>}
              
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  id="forgot-password-link"
                  onClick={() => onNavigate('/volunteer/forgot-password')}
                  className="text-xs font-medium text-[#C59B27] hover:underline cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C59B27] rounded-md"
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <Button type="submit" variant="primary" fullWidth loading={loading} disabled={!canSubmit}>
              Sign In
            </Button>
            {!canSubmit && (
              <p className="text-xs text-gray-500 text-center mt-2 font-medium">
                {email.trim().length === 0 || password.trim().length === 0
                  ? "Enter your email and password to continue."
                  : "Enter a valid email address to continue."}
              </p>
            )}
          </form>

          <div className="text-center space-y-2 pt-2">
            <p className="text-xs text-gray-500">
              Want to join the team?{' '}
              <button
                onClick={() => onNavigate('/volunteer/create-account')}
                className="text-[#C59B27] font-semibold hover:underline cursor-pointer"
              >
                Create a volunteer account
              </button>
            </p>
            <p className="text-xs text-gray-400">
              Are you a parent?{' '}
              <button
                onClick={() => onNavigate('/parent/sign-in')}
                className="text-gray-600 hover:underline cursor-pointer"
              >
                Sign in to Parent Access
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

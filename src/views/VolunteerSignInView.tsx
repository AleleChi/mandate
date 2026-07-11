import React, { useState } from 'react';
import { AppRoute } from '../types';
import { ChevronLeft, Eye, EyeOff, KeyRound, Fingerprint } from 'lucide-react';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { validateEmailSyntax } from '../utils/validation';
import { Button } from '../components/common/Button';
import { AuthFormField } from '../components/common/AuthFormField';
import { AuthScreenShell } from '../components/common/AuthScreenShell';
import { DeviceSecurityModal } from '../components/common/DeviceSecurityModal';

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

  // Passkey Authentication States
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyModalOpen, setPasskeyModalOpen] = useState(false);
  const [passkeyOptions, setPasskeyOptions] = useState<any>(null);
  const [passkeyChallengeKey, setPasskeyChallengeKey] = useState('');

  const handlePasskeySignIn = async () => {
    const emailErr = validateEmail(email);
    setEmailError(emailErr);
    if (emailErr || !email.trim()) {
      setError('Please enter your email address to sign in with your device key.');
      return;
    }

    setError(null);
    setPasskeyLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await api.auth.passkeys.loginOptions(cleanEmail);
      if (res.success && res.options) {
        if (!res.options.allowCredentials || res.options.allowCredentials.length === 0) {
          setError('No secure device key is registered for this account.');
          return;
        }
        setPasskeyOptions(res.options);
        setPasskeyChallengeKey(res.challengeKey);
        setPasskeyModalOpen(true);
      } else {
        setError('Could not prepare device verification options.');
      }
    } catch (err: any) {
      setError('No secure device key found or device verification failed.');
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handlePasskeySuccess = async (credentialId?: string) => {
    try {
      const meRes = await api.auth.getMe();
      showSuccess('Welcome back', 'Signed in securely using your device key.');
      if (onSignInSuccess) {
        onSignInSuccess(meRes.user, meRes.profile);
      }
      onNavigate('/volunteer/dashboard');
    } catch (err) {
      setError('Failed to load profile after device verification.');
    }
  };

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
    <AuthScreenShell
      dataViewVersion="volunteer-sign-in-soft-surface-v1"
      showBack
      onBack={() => onNavigate('/')}
      maxWidth="md"
    >
      <div className="flex justify-center">
        <div className="w-14 h-14 rounded-2xl bg-[#FAF6EC] text-[#C59B27] flex items-center justify-center shadow-inner border border-[#E5D5AE]">
          <KeyRound className="w-7 h-7" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-3xl font-serif-koinonia font-bold text-[#18181B]">
          Volunteer Access
        </h1>
        <p id="volunteer-signin-subtitle" className="text-sm text-[#52525B] leading-relaxed max-w-sm mx-auto">
          Sign in to support Children and Teens check-in, pickup, and care during the event.
        </p>
      </div>

      {error && (
        <div className="bg-red-50/50 border border-red-200/60 text-red-600 p-3.5 rounded-2xl text-xs font-medium text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <AuthFormField
          id="email"
          label="EMAIL ADDRESS"
          type="email"
          placeholder="you@koinonia.org"
          value={email}
          onChange={handleEmailChange}
          onBlur={handleEmailBlur}
          error={emailError || undefined}
          isValid={!emailError && email.trim().length > 0}
          isTouched={email.trim().length > 0}
          suggestion={suggestion || undefined}
          onApplySuggestion={() => {
            setEmail(suggestion!);
            setEmailError(null);
            setSuggestion(null);
          }}
          disabled={loading}
        />

        <div className="space-y-1">
          <AuthFormField
            id="password"
            label="PASSWORD"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={handlePasswordChange}
            onBlur={handlePasswordBlur}
            error={passwordError || undefined}
            isValid={!passwordError && password.trim().length > 0}
            isTouched={password.trim().length > 0}
            disabled={loading}
          />
          
          <div className="flex justify-end pt-1">
            <button
              type="button"
              id="forgot-password-link"
              onClick={() => onNavigate('/volunteer/forgot-password')}
              className="text-xs font-semibold text-[#B89047] hover:underline cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C59B27] rounded-md"
            >
              Forgot password?
            </button>
          </div>
        </div>

        <div className="pt-2">
          <Button type="submit" variant="primary" fullWidth loading={loading} disabled={passkeyLoading || !canSubmit}>
            Sign In
          </Button>
        </div>

        {/* Passkey Sign In */}
        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-[#EAE8E1]"></div>
          <span className="flex-shrink mx-4 text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">or</span>
          <div className="flex-grow border-t border-[#EAE8E1]"></div>
        </div>

        <Button
          type="button"
          onClick={handlePasskeySignIn}
          disabled={loading || passkeyLoading}
          variant="outline"
          fullWidth
          data-component-version="passkey-native-auth-prompt-v2"
          className="border-[#C59B27] text-[#C59B27] hover:bg-[#FAF6EC] py-3 text-sm font-semibold rounded-xl flex items-center justify-center space-x-1.5"
        >
          {passkeyLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#C59B27] border-t-transparent"></span>
              <span>Preparing...</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <Fingerprint className="w-4 h-4 text-[#C59B27]" />
              <span>Sign in with secure device key</span>
            </span>
          )}
        </Button>
      </form>

      <div className="text-center space-y-3 pt-4 border-t border-[#EAE8E1]">
        <p className="text-xs text-gray-500">
          Want to join the team?{' '}
          <button
            onClick={() => onNavigate('/volunteer/create-account')}
            className="text-[#C59B27] font-semibold hover:underline cursor-pointer focus:outline-none"
          >
            Create a volunteer account
          </button>
        </p>
        <p className="text-xs text-gray-400">
          Are you a parent?{' '}
          <button
            onClick={() => onNavigate('/parent/sign-in')}
            className="text-gray-500 font-semibold hover:underline cursor-pointer focus:outline-none"
          >
            Sign in to Parent Access
          </button>
        </p>
      </div>

      <DeviceSecurityModal
        isOpen={passkeyModalOpen}
        onClose={() => setPasskeyModalOpen(false)}
        onSuccess={handlePasskeySuccess}
        actionName="Sign in with device key"
        emailForLogin={email}
        challengeKey={passkeyChallengeKey}
        loginOptions={passkeyOptions}
      />
    </AuthScreenShell>
  );
};

import React, { useState } from 'react';
import { AppRoute } from '../types';
import { ChevronLeft, Info, Eye, EyeOff, Fingerprint } from 'lucide-react';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { validateEmailSyntax } from '../utils/validation';
import { Button } from '../components/common/Button';
import { AuthScreenShell } from '../components/common/AuthScreenShell';
import { isWebAuthnSupported, base64URLToBuffer } from '../utils/passkey';

interface SignInViewProps {
  onNavigate: (route: AppRoute) => void;
  onSetParentEmail?: (email: string) => void;
  onSignInSuccess?: (user: any, profile: any) => void;
}

export const SignInView: React.FC<SignInViewProps> = ({
  onNavigate,
  onSetParentEmail,
  onSignInSuccess
}) => {
  const { showSuccess } = useNotification();
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

  const handlePasskeySignIn = async () => {
    setError(null);
    if (!isWebAuthnSupported()) {
      setError("Secure sign-in isn't available on this browser.");
      return;
    }

    setPasskeyLoading(true);
    try {
      // 1. Fetch challenge/options from server without requiring an email (supports discoverable credentials)
      const cleanEmail = email.trim() ? email.trim().toLowerCase() : undefined;
      const res = await api.auth.passkeys.loginOptions(cleanEmail);
      if (!res.success || !res.options) {
        setError(res?.error || "We couldn't prepare device sign-in.");
        return;
      }

      // 2. Format WebAuthn get options
      const formattedOpts: any = {
        publicKey: {
          ...res.options,
          challenge: base64URLToBuffer(res.options.challenge),
        }
      };

      if (res.options.allowCredentials && res.options.allowCredentials.length > 0) {
        formattedOpts.publicKey.allowCredentials = res.options.allowCredentials.map((c: any) => ({
          type: c.type,
          id: base64URLToBuffer(c.id)
        }));
      } else {
        delete formattedOpts.publicKey.allowCredentials;
      }

      // 3. Trigger OS passkey/biometric prompt directly
      const assertion = await window.navigator.credentials.get(formattedOpts) as any;
      if (!assertion) {
        return;
      }

      // 4. Verify assertion with backend
      const loginRes = await api.auth.passkeys.loginVerify(
        { id: assertion.id },
        res.challengeKey
      );

      if (loginRes.success && loginRes.user) {
        if (onSetParentEmail && loginRes.user.email) {
          onSetParentEmail(loginRes.user.email);
        }
        showSuccess('Welcome back', 'Signed in securely with your device.');
        if (onSignInSuccess) {
          onSignInSuccess(loginRes.user, loginRes.profile || loginRes.volunteerProfile);
        }

        if (loginRes.user.role === 'volunteer') {
          onNavigate('/volunteer/event' as AppRoute);
        } else if (loginRes.user.role === 'admin') {
          onNavigate('/admin/overview' as AppRoute);
        } else {
          onNavigate('/parent/home' as AppRoute);
        }
      } else {
        setError(loginRes.error || "We couldn't sign in with this device. Please try again or use your password.");
      }
    } catch (err: any) {
      console.error('Passwordless sign in error:', err);
      const isCancel = err?.name === 'NotAllowedError' || err?.message?.toLowerCase().includes('cancel') || err?.message?.toLowerCase().includes('abort');
      if (isCancel) {
        return;
      }
      setError("We couldn't sign in with this device. Please try again or use your password.");
    } finally {
      setPasskeyLoading(false);
    }
  };

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
      const res = await api.auth.signIn({ email: cleanEmail, password });
      if (onSetParentEmail) onSetParentEmail(cleanEmail);
      showSuccess('Welcome back', 'Your parent account is ready.');

      const isProfileComplete = (p: any) => {
        if (!p) return false;
        const fullName = p.fullName || p.full_name;
        const phone = p.phone || p.phone_number;
        if (!fullName || !fullName.trim()) return false;
        if (!phone || !phone.trim()) return false;
        return true;
      };

      if (onSignInSuccess) {
        onSignInSuccess(res.user, res.profile);
      }

      const searchParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const nextRoute = searchParams.get('next');

      if (nextRoute) {
        onNavigate(decodeURIComponent(nextRoute) as AppRoute);
      } else {
        onNavigate('/parent/home');
      }
    } catch (err: any) {
      const { message, code } = extractApiError(err);
      
      if (code === 'ACCOUNT_NOT_FOUND') {
        const cleanEmail = email.trim().toLowerCase();
        const searchParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const nextRoute = searchParams.get('next');
        const nextParam = nextRoute ? `&next=${encodeURIComponent(nextRoute)}` : '';
        onNavigate(`/parent/create-account?email=${encodeURIComponent(cleanEmail)}${nextParam}` as AppRoute);
        return;
      }

      if (code === 'EMAIL_NOT_VERIFIED') {
        if (err.data && err.data.token) {
          api.setToken(err.data.token);
          if (onSignInSuccess) {
            onSignInSuccess(err.data.user, err.data.profile);
          }
        }
        const searchParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const nextRoute = searchParams.get('next');
        if (nextRoute) {
          onNavigate(decodeURIComponent(nextRoute) as AppRoute);
        } else {
          onNavigate('/parent/home');
        }
        return;
      }

      if (code === 'INVALID_CREDENTIALS') {
        setError('Email or password is incorrect.');
        return;
      }

      const displayError = message.includes('Invalid') || message.includes('User not found') || message.includes('Incorrect')
        ? 'Email or password is incorrect.'
        : message;
      setError(displayError);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = email.trim() !== '' && validateEmailSyntax(email).valid && password !== '';

  return (
    <AuthScreenShell
      dataViewVersion="parent-sign-in-soft-surface-v1"
      showBack
      onBack={() => onNavigate('/')}
      maxWidth="md"
    >
      {/* Hero Heading */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-serif-koinonia font-bold text-[#18181B]">
          Sign in
        </h1>
        <p className="text-sm text-[#52525B]">
          Continue to your parent account.
        </p>
      </div>

      {/* Info Card */}
      <div className="bg-[#FAF6EC] border border-[#EBE3D3] rounded-[16px] p-4 flex items-start space-x-3 shadow-sm">
        <Info className="w-5 h-5 text-[#B89047] shrink-0 mt-0.5" />
        <p className="text-xs text-[#52525B] leading-relaxed">
          You can view your children, follow their status, and keep passes ready when selected.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50/50 border border-red-200/60 text-red-600 p-3.5 rounded-2xl text-xs font-medium text-center">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        
        {/* Email Field */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-[10px] font-bold tracking-widest text-[#52525B] uppercase">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={handleEmailChange}
            onBlur={handleEmailBlur}
            className={`w-full bg-white border rounded-xl py-3 px-4 text-[#18181B] placeholder-[#9CA3AF] text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#B89047]/40 focus:border-[#B89047] transition-all ${
              emailError ? 'border-red-500 bg-red-50/30' : 'border-[#EAE8E1]'
            }`}
          />
          {emailError && (
            <p className="text-xs text-red-600 font-medium mt-1 pl-1">{emailError}</p>
          )}
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
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-[10px] font-bold tracking-widest text-[#52525B] uppercase">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={handlePasswordChange}
              onBlur={handlePasswordBlur}
              className={`w-full bg-white border rounded-xl py-3 pl-4 pr-11 text-[#18181B] placeholder-[#9CA3AF] text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#B89047]/40 focus:border-[#B89047] transition-all ${
                passwordError ? 'border-red-500 bg-red-50/30' : 'border-[#EAE8E1]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#9CA3AF] hover:text-[#18181B] focus:outline-none"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {passwordError && (
            <p className="text-xs text-red-600 font-medium mt-1 pl-1">{passwordError}</p>
          )}
          
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => onNavigate('/parent/forgot-password')}
              className="text-xs font-semibold text-[#B89047] hover:underline focus:outline-none"
            >
              Forgot password?
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <Button
            type="submit"
            disabled={loading || passkeyLoading || !isFormValid}
            fullWidth
            size="lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                <span>Signing in...</span>
              </span>
            ) : (
              <span>Continue</span>
            )}
          </Button>
        </div>

        {/* Passkey Sign In */}
        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-[#EAE8E1]"></div>
          <span className="flex-shrink mx-4 text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">or</span>
          <div className="flex-grow border-t border-[#EAE8E1]"></div>
        </div>

        <div className="space-y-1 text-center">
          <Button
            type="button"
            onClick={handlePasskeySignIn}
            disabled={loading || passkeyLoading}
            variant="outline"
            fullWidth
            size="lg"
            data-component-version="passkey-native-auth-prompt-v2"
            className="border-[#C59B27] text-[#C59B27] hover:bg-[#FAF6EC] flex items-center justify-center space-x-1.5"
          >
            {passkeyLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#C59B27] border-t-transparent"></span>
                <span>Signing in...</span>
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <Fingerprint className="w-4 h-4 text-[#C59B27]" />
                <span>Sign in with your device</span>
              </span>
            )}
          </Button>
          <p className="text-[11px] text-[#71717A]">
            Use your fingerprint, face, screen lock or device PIN.
          </p>
        </div>
      </form>

      {/* Create Account Link */}
      <div className="text-center pt-2">
        <span className="text-xs text-[#52525B]">New here? </span>
        <button
          type="button"
          onClick={() => onNavigate('/parent/create-account')}
          className="text-xs font-bold text-[#B89047] hover:underline focus:outline-none"
        >
          Create parent account
        </button>
      </div>
    </AuthScreenShell>
  );
};

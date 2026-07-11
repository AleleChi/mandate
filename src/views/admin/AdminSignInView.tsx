import React, { useState } from 'react';
import { AppRoute } from '../../types';
import { Info, Eye, EyeOff, Lock, Mail, Fingerprint } from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { validateEmailSyntax } from '../../utils/validation';
import { Button } from '../../components/common/Button';
import { AuthScreenShell } from '../../components/common/AuthScreenShell';
import { DeviceSecurityModal } from '../../components/common/DeviceSecurityModal';

interface AdminSignInViewProps {
  onNavigate: (route: AppRoute) => void;
  onSignInSuccess?: (user: any, profile: any) => void;
}

export const AdminSignInView: React.FC<AdminSignInViewProps> = ({
  onNavigate,
  onSignInSuccess
}) => {
  const { showSuccess } = useNotification();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
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
      setError('Please enter your administrator email to sign in with your device key.');
      return;
    }

    setError(null);
    setPasskeyLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await api.auth.passkeys.loginOptions(cleanEmail);
      if (res.success && res.options) {
        if (!res.options.allowCredentials || res.options.allowCredentials.length === 0) {
          setError('No secure device key is registered for this administrator account.');
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
      showSuccess('Access Granted', 'Signed in successfully.');
      if (onSignInSuccess) {
        onSignInSuccess(meRes.user, null);
      }
      onNavigate('/admin/overview');
    } catch (err) {
      setError('Failed to load profile after device verification.');
    }
  };

  const validateEmail = (val: string) => {
    const res = validateEmailSyntax(val);
    if (!res.valid) {
      return res.message || 'Enter a valid email address.';
    }
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
      const res = await api.admin.signIn({ email: cleanEmail, password });
      
      showSuccess('Access Granted', 'Signed in successfully.');
      
      if (onSignInSuccess) {
        onSignInSuccess(res.user, null);
      }
      
      onNavigate('/admin/overview');
    } catch (err: any) {
      const parsed = extractApiError(err);
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell showBack={true} onBack={() => onNavigate('/')}>
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-serif-koinonia font-bold text-[#18181B] tracking-tight">
          Admin Access
        </h2>
        <p className="text-sm text-[#71717A] max-w-xs mx-auto">
          Enter your administrator credentials to sign in.
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
              onBlur={handleEmailBlur}
              disabled={loading}
              placeholder="e.g. admin@koinonia.org"
              className={`w-full pl-11 pr-4 py-3 rounded-xl bg-white border ${
                emailError ? 'border-red-500 focus:ring-red-100' : 'border-[#EAE8E1] focus:ring-amber-100 focus:border-[#C59B27]'
              } focus:outline-none focus:ring-4 transition-all duration-200 text-[#18181B] text-base`}
            />
          </div>
          {emailError && (
            <p className="text-xs text-red-600 font-medium">{emailError}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-[#18181B]">
              Password
            </label>
            <button
              type="button"
              onClick={() => onNavigate('/admin/forgot-password')}
              className="text-xs font-semibold text-[#B89047] hover:text-[#C59B27] transition-colors focus:outline-none"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
              <Lock className="w-5 h-5" />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={handlePasswordChange}
              onBlur={handlePasswordBlur}
              disabled={loading}
              placeholder="Enter your admin password"
              className={`w-full pl-11 pr-11 py-3 rounded-xl bg-white border ${
                passwordError ? 'border-red-500 focus:ring-red-100' : 'border-[#EAE8E1] focus:ring-amber-100 focus:border-[#C59B27]'
              } focus:outline-none focus:ring-4 transition-all duration-200 text-[#18181B] text-base`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
          {passwordError && (
            <p className="text-xs text-red-600 font-medium">{passwordError}</p>
          )}
        </div>

        <Button
          type="submit"
          loading={loading}
          disabled={passkeyLoading}
          className="w-full bg-[#18181B] text-white py-3.5 rounded-xl hover:bg-[#27272A] transition-colors font-medium flex items-center justify-center space-x-2 text-base shrink-0"
        >
          Sign in to Admin Access
        </Button>

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

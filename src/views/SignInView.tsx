import React, { useState } from 'react';
import { AppRoute } from '../types';
import { ChevronLeft, Info, Eye, EyeOff } from 'lucide-react';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { validateEmailSyntax } from '../utils/validation';
import { Button } from '../components/common/Button';

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
        const emailVal = p.email;
        const phone = p.phone || p.phone_number;
        const whatsapp = p.whatsapp || p.whatsapp_number;
        const homeAddress = p.homeAddress || p.home_address;
        const country = p.country;
        const stateRegion = p.stateRegion || p.state_region;
        const city = p.city;
        const preferredContact = p.preferredContact || p.preferred_contact;
        const hasPhoto = p.photoUrl || p.photo_file_id;
        const isWorker = p.isWorker === true || p.is_koinonia_worker === 1 || p.is_koinonia_worker === '1';
        const department = p.department;

        if (!fullName || !fullName.trim()) return false;
        if (!emailVal || !emailVal.trim()) return false;
        if (!phone || !phone.trim()) return false;
        if (!whatsapp || !whatsapp.trim()) return false;
        if (!homeAddress || !homeAddress.trim()) return false;
        if (!country || !country.trim()) return false;
        if (!stateRegion || !stateRegion.trim()) return false;
        if (!city || !city.trim()) return false;
        if (!preferredContact || !preferredContact.trim()) return false;
        if (!hasPhoto || !hasPhoto.trim()) return false;
        if (isWorker && (!department || !department.trim())) return false;
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
        if (isProfileComplete(res.profile)) {
          onNavigate('/parent/home');
        } else {
          onNavigate('/parent/profile-setup');
        }
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
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col justify-between items-center font-sans antialiased">
      <div className="w-full max-w-md flex flex-col min-h-screen justify-between px-6 py-4">
        
        {/* Header bar */}
        <header className="relative flex items-center justify-center h-14 shrink-0">
          <button
            onClick={() => onNavigate('/')}
            className="absolute left-0 p-2 rounded-full text-[#18181B] hover:bg-black/5 transition-colors focus:outline-none"
            aria-label="Back"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="font-serif-koinonia font-bold text-lg text-[#B89047] tracking-wider uppercase">
            Koinonia
          </span>
        </header>

        {/* Content area */}
        <div className="flex-1 flex flex-col justify-start pt-6 space-y-6">
          
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
                disabled={loading || !isFormValid}
                fullWidth
                size="lg"
              >
                {loading ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></span>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Continue</span>
                )}
              </Button>
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

        </div>

        {/* Bottom Decorative Indicator */}
        <div className="w-16 h-1 bg-[#B89047]/30 rounded-full mx-auto mt-6 mb-2 shrink-0"></div>

      </div>
    </div>
  );
};

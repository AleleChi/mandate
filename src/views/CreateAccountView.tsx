import React, { useState } from 'react';
import { ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { AppRoute } from '../types';
import { AuthFormField } from '../components/common/AuthFormField';
import { authValidation } from '../utils/authValidation';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { validateEmailSyntax } from '../utils/validation';
import { Button } from '../components/common/Button';

const generateStrongPassword = (): string => {
  const lowercase = 'abcdefghijkmnopqrstuvwxyz'; // avoided confusing 'l'
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // avoided confusing 'I', 'O'
  const numbers = '23456789'; // avoided confusing '0', '1'
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const allChars = lowercase + uppercase + numbers + symbols;

  let password = '';
  const getRandomChar = (charSet: string): string => {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return charSet[arr[0] % charSet.length];
  };

  password += getRandomChar(lowercase);
  password += getRandomChar(uppercase);
  password += getRandomChar(numbers);
  password += getRandomChar(symbols);

  for (let i = 4; i < 14; i++) {
    password += getRandomChar(allChars);
  }

  const passwordArr = password.split('');
  for (let i = passwordArr.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    const temp = passwordArr[i];
    passwordArr[i] = passwordArr[j];
    passwordArr[j] = temp;
  }

  return passwordArr.join('');
};

interface CreateAccountViewProps {
  onNavigate: (route: AppRoute) => void;
  onSetParentEmail: (email: string) => void;
  onUpdateProfile?: (profile: any) => void;
  onSignInSuccess?: (user: any, profile: any) => void;
}

export const CreateAccountView: React.FC<CreateAccountViewProps> = ({
  onNavigate,
  onSetParentEmail,
  onUpdateProfile,
  onSignInSuccess
}) => {
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState(() => {
    const searchParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const emailParam = searchParams.get('email') || '';
    return {
      fullName: '',
      email: emailParam,
      phone: '',
      whatsapp: '',
      password: '',
      confirmPassword: ''
    };
  });

  const showNotice = React.useMemo(() => {
    const searchParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    return !!searchParams.get('email');
  }, []);

  const [agreedToUpdates, setAgreedToUpdates] = useState(false);

  const [touched, setTouched] = useState({
    fullName: false,
    email: false,
    phone: false,
    whatsapp: false,
    password: false,
    confirmPassword: false,
    agreement: false
  });

  // Calculate validation state for each field dynamically
  const errors = {
    fullName: authValidation.fullName(formData.fullName),
    email: authValidation.email(formData.email),
    phone: authValidation.phone(formData.phone),
    whatsapp: authValidation.whatsapp(formData.whatsapp),
    password: authValidation.password(formData.password),
    confirmPassword: authValidation.confirmPassword(formData.confirmPassword, formData.password),
    agreement: authValidation.agreement(agreedToUpdates)
  };

  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [showPasswordNotice, setShowPasswordNotice] = useState(false);
  const [passwordType, setPasswordType] = useState<'password' | 'text'>('password');

  const handleSuggestPassword = () => {
    const strongPassword = generateStrongPassword();
    setFormData((prev) => ({
      ...prev,
      password: strongPassword,
      confirmPassword: strongPassword
    }));
    setTouched((prev) => ({
      ...prev,
      password: true,
      confirmPassword: true
    }));
    setPasswordType('text');
    setShowPasswordNotice(true);
    
    // Auto-mask after 5 seconds
    setTimeout(() => {
      setPasswordType('password');
    }, 5000);
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(formData.password);
    showSuccess('Copied', 'Password copied to clipboard.');
  };

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (field === 'email') {
      const res = validateEmailSyntax(formData.email);
      if (!res.valid && res.suggestion) {
        const [local] = formData.email.trim().split('@');
        setEmailSuggestion(`${local}@${res.suggestion}`);
      } else {
        setEmailSuggestion(null);
      }
    }
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'email') {
      const res = validateEmailSyntax(value);
      if (!res.valid && res.suggestion) {
        const [local] = value.trim().split('@');
        setEmailSuggestion(`${local}@${res.suggestion}`);
      } else {
        setEmailSuggestion(null);
      }
    }
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mark all fields as touched on submit attempt
    setTouched({
      fullName: true,
      email: true,
      phone: true,
      whatsapp: true,
      password: true,
      confirmPassword: true,
      agreement: true
    });

    const hasErrors = Object.values(errors).some((err) => err !== undefined);

    if (!hasErrors) {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await api.auth.createAccount({
          email: formData.email.trim(),
          password: formData.password,
          fullName: formData.fullName.trim(),
          phone: formData.phone.trim(),
          whatsapp: formData.whatsapp.trim() || formData.phone.trim()
        });
        onSetParentEmail(formData.email.trim());
        if (onUpdateProfile) {
          onUpdateProfile(res.profile || {
            fullName: formData.fullName.trim(),
            email: formData.email.trim(),
            phone: formData.phone.trim(),
            whatsapp: formData.whatsapp.trim() || formData.phone.trim(),
            homeAddress: '',
            preferredContact: 'WhatsApp',
            isWorker: false,
            department: '',
            photoUrl: ''
          });
        }
        if (onSignInSuccess) {
          onSignInSuccess(res.user, res.profile);
        }
        showSuccess('Account created', 'Continue setting up your parent profile.');
        onNavigate('/parent/check-email');
      } catch (err: any) {
        const { message, description } = extractApiError(err);
        setErrorMsg(message);
        showError(message, description);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#18181B] flex flex-col justify-between font-sans selection:bg-[#C59B27]/20 pb-12">
      {/* Top Header */}
      <header className="w-full pt-4 pb-3 px-6">
        <div className="max-w-[440px] mx-auto flex items-center justify-between">
          <button
            onClick={() => onNavigate('/')}
            className="p-2 -ml-2 rounded-full text-[#18181B] hover:bg-black/5 transition-colors cursor-pointer focus:outline-none"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6 stroke-[1.75]" />
          </button>

          <div
            onClick={() => onNavigate('/')}
            className="font-serif-koinonia font-bold text-xl tracking-[0.2em] text-[#9A7326] uppercase cursor-pointer select-none"
          >
            Koinonia
          </div>

          <div className="w-6" />
        </div>
      </header>

      {/* Main Form Container: One Centered Column (max-w 440px on Desktop, px-6 on Mobile) */}
      <main className="flex-1 max-w-[440px] w-full mx-auto px-6 pt-4 pb-8 flex flex-col justify-center">
        {/* Title Area */}
        <div className="text-center mb-8">
          <h1 className="font-serif-koinonia font-bold text-3xl sm:text-[34px] text-[#18181B] leading-tight tracking-tight">
            Create parent<br />account
          </h1>
          <p className="text-sm text-[#3F3F46] mt-3 max-w-[300px] mx-auto leading-relaxed">
            Start here. You can add your children after your account is ready.
          </p>
        </div>

        {showNotice && (
          <div className="bg-[#FAF6EC] border border-[#EBE3D3] text-[#9A7326] p-4 rounded-2xl text-sm font-medium mb-6 text-center shadow-sm">
            Create a parent account to continue.
          </div>
        )}

        {/* Clean, Aligned, Single-Column Form */}
        <form onSubmit={handleContinue} noValidate className="space-y-5">
          {/* Full name */}
          <AuthFormField
            id="fullName"
            label="Full name"
            placeholder="e.g. Grace Omikunle"
            value={formData.fullName}
            onChange={(e) => handleChange('fullName', e.target.value)}
            onBlur={() => handleBlur('fullName')}
            error={errors.fullName}
            isValid={!errors.fullName}
            isTouched={touched.fullName}
          />

          {/* Email address */}
          <AuthFormField
            id="email"
            label="Email address"
            type="email"
            placeholder="sarah@example.com"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            onBlur={() => handleBlur('email')}
            error={errors.email}
            isValid={!errors.email}
            isTouched={touched.email}
            suggestion={emailSuggestion || undefined}
            onApplySuggestion={() => {
              setFormData(prev => ({ ...prev, email: emailSuggestion! }));
              setEmailSuggestion(null);
            }}
          />

          {/* Phone number */}
          <AuthFormField
            id="phone"
            label="Phone number"
            type="tel"
            placeholder="0801 234 5678"
            value={formData.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            onBlur={() => handleBlur('phone')}
            error={errors.phone}
            isValid={!errors.phone}
            isTouched={touched.phone}
          />

          {/* WhatsApp number */}
          <AuthFormField
            id="whatsapp"
            label="WhatsApp number"
            type="tel"
            placeholder="0801 234 5678"
            helperText="We may send important updates here."
            value={formData.whatsapp}
            onChange={(e) => handleChange('whatsapp', e.target.value)}
            onBlur={() => handleBlur('whatsapp')}
            error={errors.whatsapp}
            isValid={!errors.whatsapp}
            isTouched={touched.whatsapp}
          />

          {/* Password */}
          <div className="space-y-1 relative">
            <div className="flex justify-between items-center -mb-7 relative z-10">
              <span className="text-sm font-medium text-[#18181B]"></span>
              <button
                type="button"
                onClick={handleSuggestPassword}
                className="text-xs font-semibold text-[#B89047] hover:underline focus:outline-none cursor-pointer"
              >
                Suggest strong password
              </button>
            </div>
            <AuthFormField
              id="password"
              label="Password"
              type={passwordType}
              autoComplete="new-password"
              placeholder="Create password"
              value={formData.password}
              onChange={(e) => {
                handleChange('password', e.target.value);
                setShowPasswordNotice(false);
              }}
              onBlur={() => handleBlur('password')}
              error={errors.password}
              isValid={!errors.password}
              isTouched={touched.password}
              helperText="Use at least 8 characters with a letter and a number."
            />
          </div>

          {showPasswordNotice && (
            <div className="bg-[#FAF6EC] border border-[#EBE3D3] text-[#9A7326] p-3 rounded-xl text-xs font-medium flex items-center justify-between shadow-sm">
              <span>Strong password added. Please keep it somewhere safe.</span>
              <button
                type="button"
                onClick={handleCopyPassword}
                className="ml-2 bg-[#B89047] hover:bg-[#A37E3A] text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition-colors cursor-pointer shrink-0"
              >
                Copy
              </button>
            </div>
          )}

          {/* Confirm password */}
          <AuthFormField
            id="confirmPassword"
            label="Confirm password"
            type={passwordType}
            placeholder="Confirm password"
            value={formData.confirmPassword}
            onChange={(e) => handleChange('confirmPassword', e.target.value)}
            onBlur={() => handleBlur('confirmPassword')}
            error={errors.confirmPassword}
            isValid={!errors.confirmPassword}
            isTouched={touched.confirmPassword}
          />

          {/* Checkbox: I agree to receive event updates about my children */}
          <div className="pt-2">
            <label
              htmlFor="agreement"
              className="flex items-start gap-3 cursor-pointer select-none group"
            >
              <input
                id="agreement"
                type="checkbox"
                className="sr-only"
                checked={agreedToUpdates}
                onChange={(e) => {
                  setAgreedToUpdates(e.target.checked);
                  handleBlur('agreement');
                }}
              />
              <div
                className={`w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                  touched.agreement && errors.agreement
                    ? 'border-red-500 bg-red-50/20'
                    : agreedToUpdates
                    ? 'bg-[#C59B27] border-[#C59B27] text-[#18181B]'
                    : 'bg-white border-[#D9D6CE] group-hover:border-[#18181B]'
                }`}
              >
                {agreedToUpdates && <Check className="w-3.5 h-3.5 stroke-[3] text-[#18181B]" />}
              </div>
              <span className="text-sm text-[#18181B] leading-snug">
                I agree to receive event updates about my children.
              </span>
            </label>

            {touched.agreement && errors.agreement && (
              <p className="text-xs text-red-600 font-medium mt-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errors.agreement}</span>
              </p>
            )}
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* Primary button */}
          <div className="pt-3">
            <Button
              type="submit"
              disabled={loading || !(
                formData.fullName.trim() !== '' && !errors.fullName &&
                formData.email.trim() !== '' && !errors.email &&
                formData.phone.trim() !== '' && !errors.phone &&
                formData.password.trim() !== '' && !errors.password &&
                formData.confirmPassword.trim() !== '' && !errors.confirmPassword &&
                agreedToUpdates
              )}
              fullWidth
              size="lg"
            >
              {loading ? 'Creating account...' : 'Continue'}
            </Button>
          </div>

          {/* Secondary text */}
          <div className="pt-2 text-center">
            <span className="text-sm text-[#71717A]">Already have an account? </span>
            <button
              type="button"
              onClick={() => onNavigate('/parent/sign-in')}
              className="text-sm font-medium text-[#18181B] hover:underline cursor-pointer focus:outline-none"
            >
              Sign in
            </button>
          </div>
        </form>

        {/* Small reassurance note */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[#71717A] max-w-xs mx-auto leading-relaxed">
            Your details are used for event updates, entry checks, and pickup confirmation.
          </p>
        </div>
      </main>
    </div>
  );
};


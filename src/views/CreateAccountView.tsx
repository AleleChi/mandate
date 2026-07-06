import React, { useState } from 'react';
import { ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { AppRoute } from '../types';
import { AuthFormField } from '../components/common/AuthFormField';
import { authValidation } from '../utils/authValidation';
import { api } from '../services/api';

interface CreateAccountViewProps {
  onNavigate: (route: AppRoute) => void;
  onSetParentEmail: (email: string) => void;
  onUpdateProfile?: (profile: any) => void;
}

export const CreateAccountView: React.FC<CreateAccountViewProps> = ({
  onNavigate,
  onSetParentEmail,
  onUpdateProfile
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    whatsapp: '',
    password: '',
    confirmPassword: ''
  });

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

  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
        await api.auth.createAccount({
          email: formData.email.trim(),
          password: formData.password,
          fullName: formData.fullName.trim(),
          phone: formData.phone.trim(),
          whatsapp: formData.whatsapp.trim() || formData.phone.trim()
        });
        onSetParentEmail(formData.email.trim());
        if (onUpdateProfile) {
          onUpdateProfile({
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
        onNavigate('/parent/check-email');
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to create account');
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
          <AuthFormField
            id="password"
            label="Password"
            type="password"
            placeholder="Create password"
            value={formData.password}
            onChange={(e) => handleChange('password', e.target.value)}
            onBlur={() => handleBlur('password')}
            error={errors.password}
            isValid={!errors.password}
            isTouched={touched.password}
          />

          {/* Confirm password */}
          <AuthFormField
            id="confirmPassword"
            label="Confirm password"
            type="password"
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
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-medium text-base shadow-sm transition-all text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40 disabled:opacity-60"
            >
              {loading ? 'Creating account...' : 'Continue'}
            </button>
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


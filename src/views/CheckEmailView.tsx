import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Info, AlertCircle, Check } from 'lucide-react';
import { AppRoute } from '../types';

interface CheckEmailViewProps {
  onNavigate: (route: AppRoute) => void;
  parentEmail: string;
}

export const CheckEmailView: React.FC<CheckEmailViewProps> = ({
  onNavigate,
  parentEmail
}) => {
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [isTouched, setIsTouched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first digit input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const validateCode = (codeArray: string[]): string | null => {
    const fullCode = codeArray.join('');
    if (!fullCode || fullCode.length < 6 || !/^\d{6}$/.test(fullCode)) {
      return 'Enter the 6-digit code sent to your email.';
    }
    return null;
  };

  const handleChange = (index: number, value: string) => {
    // Only accept numeric digits
    const cleanValue = value.replace(/\D/g, '');
    if (!cleanValue && value !== '') return;

    const newCode = [...code];
    // Take only the last digit if multiple characters are typed
    const digit = cleanValue ? cleanValue.slice(-1) : '';
    newCode[index] = digit;
    setCode(newCode);

    if (isTouched) {
      setErrorMessage(validateCode(newCode));
    }

    // Auto-advance focus to next input if digit entered
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!code[index] && index > 0) {
        // If current box is empty and user presses backspace, move to previous input
        const newCode = [...code];
        newCode[index - 1] = '';
        setCode(newCode);
        if (isTouched) {
          setErrorMessage(validateCode(newCode));
        }
        inputRefs.current[index - 1]?.focus();
      } else {
        const newCode = [...code];
        newCode[index] = '';
        setCode(newCode);
        if (isTouched) {
          setErrorMessage(validateCode(newCode));
        }
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newCode = [...code];
    for (let i = 0; i < 6; i++) {
      newCode[i] = pastedData[i] || '';
    }
    setCode(newCode);

    if (isTouched) {
      setErrorMessage(validateCode(newCode));
    }

    // Focus the box after the pasted digits, or the last box
    const focusIdx = Math.min(pastedData.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setIsTouched(true);

    const error = validateCode(code);
    if (error) {
      setErrorMessage(error);
      return;
    }

    // On valid submit navigate to profile setup
    onNavigate('/parent/profile-setup');
  };

  const handleResend = () => {
    setResendStatus('A new code has been sent.');
    setTimeout(() => setResendStatus(null), 5000);
  };

  const displayEmail = parentEmail || 'sarah@example.com';

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#18181B] flex flex-col justify-between font-sans selection:bg-[#C59B27]/20 pb-12">
      {/* Top Header */}
      <header className="w-full pt-4 pb-3 px-6">
        <div className="max-w-[440px] mx-auto flex items-center justify-between">
          <button
            onClick={() => onNavigate('/parent/create-account')}
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

      {/* Main Container: Centered Column (max-w 440px on Desktop, px-6 on Mobile) */}
      <main className="flex-1 max-w-[440px] w-full mx-auto px-6 pt-6 pb-8 flex flex-col justify-center">
        {/* Title & Helper Text */}
        <div className="text-center mb-8">
          <h1 className="font-serif-koinonia font-bold text-3xl sm:text-[34px] text-[#18181B] leading-tight tracking-tight mb-3">
            Check your email
          </h1>
          <p className="text-sm text-[#3F3F46] leading-relaxed max-w-[320px] mx-auto">
            We sent a confirmation code to{' '}
            <span className="font-semibold text-[#18181B] block sm:inline mt-0.5 sm:mt-0 break-all">
              {displayEmail}
            </span>.
          </p>
        </div>

        {/* Resend status notice */}
        {resendStatus && (
          <div
            role="status"
            className="mb-6 p-3 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-xs font-medium flex items-center justify-center gap-2 animate-fadeIn"
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>{resendStatus}</span>
          </div>
        )}

        <form onSubmit={handleContinue} noValidate className="space-y-6">
          {/* 6 Code Input Boxes */}
          <div>
            <div
              className="flex justify-between items-center gap-2 sm:gap-3 py-1"
              role="group"
              aria-label="Confirmation code"
            >
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { inputRefs.current[idx] = el; }}
                  id={`code-box-${idx}`}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={1}
                  value={digit}
                  aria-label={`Digit ${idx + 1} of confirmation code`}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={idx === 0 ? handlePaste : undefined}
                  className={`w-11 h-13 sm:w-13 sm:h-14 rounded-xl border bg-white text-center font-semibold text-lg sm:text-xl text-[#18181B] transition-all focus:outline-none focus:ring-2 ${
                    errorMessage
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20 bg-red-50/10'
                      : digit
                      ? 'border-[#C59B27] bg-[#FAF9F6] focus:border-[#C59B27] focus:ring-[#C59B27]/30'
                      : 'border-[#D9D6CE] focus:border-[#C59B27] focus:ring-[#C59B27]/30'
                  }`}
                />
              ))}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <p
                role="alert"
                className="text-xs text-red-600 font-medium mt-3 flex items-center justify-center gap-1.5 leading-snug"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </p>
            )}
          </div>

          {/* Primary & Secondary Buttons */}
          <div className="space-y-3 pt-2">
            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-xl bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-[#18181B] font-medium text-base shadow-sm transition-all text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40"
            >
              Continue
            </button>

            <button
              type="button"
              onClick={handleResend}
              className="w-full py-3.5 px-6 rounded-xl bg-white hover:bg-[#F4F1EA] active:bg-[#EAE6DD] border border-[#D9D6CE] text-[#18181B] font-medium text-base shadow-2xs transition-all text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D9D6CE]"
            >
              Resend code
            </button>
          </div>

          {/* Text link: Change email address */}
          <div className="pt-3 text-center">
            <button
              type="button"
              onClick={() => onNavigate('/parent/create-account')}
              className="text-xs font-semibold tracking-widest text-[#18181B] underline underline-offset-4 hover:text-[#C59B27] uppercase transition-colors cursor-pointer focus:outline-none"
            >
              Change email address
            </button>
          </div>
        </form>

        {/* Small Note Card */}
        <div className="mt-10 p-4 rounded-2xl bg-[#F3EFE6] border border-[#E5D5AE]/70 flex items-start gap-3.5 text-left shadow-2xs">
          <Info className="w-5 h-5 text-[#9A7326] shrink-0 mt-0.5 stroke-[2]" aria-hidden="true" />
          <p className="text-xs sm:text-sm text-[#3F3F46] leading-relaxed">
            After your email is confirmed, you can set up your parent profile and add your children.
          </p>
        </div>
      </main>
    </div>
  );
};


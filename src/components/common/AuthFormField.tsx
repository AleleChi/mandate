import React, { useState } from 'react';
import { Check, Eye, EyeOff, AlertCircle } from 'lucide-react';

export interface AuthFormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  helperText?: string;
  error?: string;
  isValid?: boolean;
  isTouched?: boolean;
  suggestion?: string;
  onApplySuggestion?: () => void;
  loading?: boolean;
}

/**
 * Reusable Form Field for Parent Access & Auth screens
 * Guarantees mobile-first vertical alignment, consistent sizing, and unified feedback styles.
 */
export const AuthFormField: React.FC<AuthFormFieldProps> = ({
  label,
  id,
  type = 'text',
  helperText,
  error,
  isValid = false,
  isTouched = false,
  suggestion,
  onApplySuggestion,
  className = '',
  loading,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  const showError = isTouched && !!error;
  const showSuccess = isTouched && isValid && !error;

  return (
    <div className="w-full flex flex-col text-left">
      <label
        htmlFor={id}
        className="text-sm font-medium text-[#18181B] mb-2 select-none"
      >
        {label}
      </label>

      <div className="relative w-full">
        <input
          id={id}
          type={inputType}
          className={`w-full h-12 rounded-xl bg-white text-sm text-[#18181B] placeholder-[#71717A]/60 px-4 transition-all duration-200 focus:outline-none ${
            showError
              ? 'border border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 bg-red-50/10'
              : showSuccess
              ? 'border border-[#059669]/60 focus:border-[#C59B27] focus:ring-2 focus:ring-[#C59B27]/20'
              : 'border border-[#D9D6CE] focus:border-[#C59B27] focus:ring-2 focus:ring-[#C59B27]/20'
          } ${isPassword || showSuccess ? 'pr-11' : ''} ${className}`}
          {...props}
        />

        {/* Right action icons (Password toggle or Valid checkmark) */}
        <div className="absolute right-0 inset-y-0 pr-3.5 flex items-center gap-1.5">
          {showSuccess && !isPassword && (
            <Check className="w-4 h-4 text-[#059669]" aria-hidden="true" />
          )}

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-[#71717A] hover:text-[#18181B] p-1 rounded-md focus:outline-none transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Helper Text or Error Message directly beneath input */}
      {showError ? (
        <p className="text-xs text-red-600 font-medium mt-1.5 flex items-center gap-1.5 leading-snug">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-xs text-[#71717A] mt-1.5 leading-snug">
          {helperText}
        </p>
      ) : null}

      {/* Interactive Suggestion Banner */}
      {suggestion && onApplySuggestion && (
        <div className="mt-1.5 text-xs text-[#B89047] font-semibold bg-[#FAF6EC] border border-[#EBE3D3] p-2 px-3 rounded-xl flex items-center justify-between">
          <span>Did you mean <strong>{suggestion}</strong>?</span>
          <button
            type="button"
            onClick={onApplySuggestion}
            className="ml-2 bg-[#B89047] hover:bg-[#A37E3A] text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition-colors cursor-pointer focus:outline-none shrink-0"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
};

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  icon,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full flex flex-col space-y-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-[#262626]">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6B7280]">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={`w-full bg-white border rounded-xl py-3 text-[#262626] placeholder-[#9CA3AF] text-sm font-normal focus:outline-none focus:ring-2 focus:ring-[#C59B27]/40 focus:border-[#C59B27] transition-colors ${
            icon ? 'pl-10 pr-4' : 'px-4'
          } ${
            error ? 'border-red-500 bg-red-50/30' : 'border-[#D9D6CE]'
          } ${className}`}
          {...props}
        />
      </div>
      {helperText && !error && (
        <p className="text-xs text-[#6B7280]">{helperText}</p>
      )}
      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}
    </div>
  );
};

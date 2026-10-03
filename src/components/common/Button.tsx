import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'charcoal' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}) => {
  const baseStyle = 'inline-flex items-center justify-center font-medium transition-all duration-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27] focus:ring-offset-2';
  
  const disabledStyle = 'bg-[#E5DFD3] text-[#52525B] opacity-60 cursor-not-allowed shadow-none border-0';

  const isButtonDisabled = disabled || isLoading || loading;

  const variantStyles = {
    primary: isButtonDisabled
      ? disabledStyle
      : 'bg-gradient-to-r from-[#B89047] to-[#C59B27] text-white shadow-sm hover:from-[#A67C2E] hover:to-[#B89047] active:scale-[0.99]',
    secondary: isButtonDisabled
      ? 'bg-transparent border-2 border-[#E5DFD3] text-[#A1A1AA] opacity-60 cursor-not-allowed shadow-none'
      : 'bg-white border-2 border-[#C59B27] text-[#9A7326] hover:bg-[#FDFBF7] active:scale-[0.99]',
    charcoal: isButtonDisabled
      ? disabledStyle
      : 'bg-[#18181B] text-white hover:bg-[#262626] active:scale-[0.99]',
    ghost: isButtonDisabled
      ? 'text-[#A1A1AA] opacity-60 cursor-not-allowed bg-transparent'
      : 'text-[#6B7280] hover:text-[#262626] hover:bg-black/5',
    outline: isButtonDisabled
      ? 'bg-transparent border border-[#EAE8E1] text-[#A1A1AA] opacity-60 cursor-not-allowed shadow-none'
      : 'bg-white border border-[#EAE8E1] text-[#3F3F46] hover:bg-zinc-50 active:scale-[0.99]'
  };

  const sizeStyles = {
    sm: 'px-3.5 py-2 text-sm',
    md: 'px-5 py-3 text-sm tracking-wide',
    lg: 'px-7 py-4 text-base font-semibold tracking-wide'
  };

  const isActuallyLoading = isLoading || loading;

  return (
    <button
      className={`${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={isButtonDisabled}
      aria-disabled={isButtonDisabled ? "true" : undefined}
      {...props}
    >
      {isActuallyLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </button>
  );
};

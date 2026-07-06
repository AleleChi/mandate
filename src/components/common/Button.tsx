import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'charcoal' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}) => {
  const baseStyle = 'inline-flex items-center justify-center font-medium transition-all duration-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27] focus:ring-offset-2';
  
  const disabledStyle = 'bg-[#E5DFD3] text-[#52525B] opacity-60 cursor-not-allowed shadow-none border-0';

  const variantStyles = {
    primary: props.disabled
      ? disabledStyle
      : 'bg-gradient-to-r from-[#B89047] to-[#C59B27] text-white shadow-sm hover:from-[#A67C2E] hover:to-[#B89047] active:scale-[0.99]',
    secondary: props.disabled
      ? 'bg-transparent border-2 border-[#E5DFD3] text-[#A1A1AA] opacity-60 cursor-not-allowed shadow-none'
      : 'bg-white border-2 border-[#C59B27] text-[#9A7326] hover:bg-[#FDFBF7] active:scale-[0.99]',
    charcoal: props.disabled
      ? disabledStyle
      : 'bg-[#18181B] text-white hover:bg-[#262626] active:scale-[0.99]',
    ghost: props.disabled
      ? 'text-[#A1A1AA] opacity-60 cursor-not-allowed bg-transparent'
      : 'text-[#6B7280] hover:text-[#262626] hover:bg-black/5'
  };

  const sizeStyles = {
    sm: 'px-3.5 py-2 text-sm',
    md: 'px-5 py-3 text-sm tracking-wide',
    lg: 'px-7 py-4 text-base font-semibold tracking-wide'
  };

  return (
    <button
      className={`${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      aria-disabled={props.disabled ? "true" : undefined}
      {...props}
    >
      {children}
    </button>
  );
};

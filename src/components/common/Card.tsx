import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  onClick,
  hoverEffect = false
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-[#E5E2DA]/80 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] p-5 transition-all duration-200 ${
        hoverEffect ? 'hover:shadow-md hover:border-[#C59B27]/40 cursor-pointer' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};

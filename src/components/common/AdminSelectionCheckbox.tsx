import React, { useEffect, useRef } from 'react';

interface AdminSelectionCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export const AdminSelectionCheckbox: React.FC<AdminSelectionCheckboxProps> = ({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel,
  id,
  disabled = false,
  className = ''
}) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = Boolean(indeterminate);
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      id={id}
      aria-label={ariaLabel}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className={`w-4 h-4 rounded border-[#D4D2C9] text-[#C59B27] focus:ring-1 focus:ring-[#C59B27] focus:ring-offset-0 transition-colors accent-[#C59B27] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  );
};

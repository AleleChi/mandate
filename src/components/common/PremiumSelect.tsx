import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type SelectOption = string | { label: string; value: string; disabled?: boolean };

export interface PremiumSelectProps {
  label?: string;
  id?: string;
  value: string;
  placeholder?: string;
  options: SelectOption[];
  error?: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
  helperText?: string;
  className?: string;
  /**
   * Visual variant matching approved Koinonia form layouts:
   * - 'underline': clean bottom border (used in Step 1)
   * - 'bordered': rounded 8px box (used in Step 2)
   */
  variant?: 'underline' | 'bordered';
}

/**
 * Reusable Premium Select Component for Koinonia Children & Teens Access
 * Guarantees mobile-friendly touch targets (min 48px trigger, min 44px options),
 * full keyboard navigation, ARIA accessibility, and warm antique gold styling.
 */
export const PremiumSelect: React.FC<PremiumSelectProps> = ({
  label,
  id,
  value,
  placeholder = 'Select option',
  options,
  error,
  disabled = false,
  required = false,
  onChange,
  helperText,
  className = '',
  variant = 'underline'
}) => {
  const generatedId = useId();
  const triggerId = id || `premium-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down');

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  // Normalize options list
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === 'string') {
      return { label: opt, value: opt, disabled: false };
    }
    return {
      label: opt.label,
      value: opt.value,
      disabled: Boolean(opt.disabled)
    };
  });

  // Find currently selected option index
  const selectedIndex = normalizedOptions.findIndex((opt) => opt.value === value);
  const selectedOption = selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null;

  // Handle outside click and touch outside
  useEffect(() => {
    const handleOutsidePointer = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsidePointer);
      document.addEventListener('touchstart', handleOutsidePointer);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
      document.removeEventListener('touchstart', handleOutsidePointer);
    };
  }, [isOpen]);

  // Determine opening direction on mobile/viewport overflow prevention
  const updateDirection = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // If less than 240px below and more space above, open upwards
      if (spaceBelow < 240 && spaceAbove > spaceBelow) {
        setOpenDirection('up');
      } else {
        setOpenDirection('down');
      }
    }
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updateDirection();
      // Highlight selected index or first non-disabled option
      const initialHighlight = selectedIndex >= 0 ? selectedIndex : normalizedOptions.findIndex((opt) => !opt.disabled);
      setHighlightedIndex(initialHighlight >= 0 ? initialHighlight : 0);
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleSelectOption = (index: number) => {
    const target = normalizedOptions[index];
    if (!target || target.disabled) return;
    onChange(target.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen) {
          updateDirection();
          const initialHighlight = selectedIndex >= 0 ? selectedIndex : normalizedOptions.findIndex((opt) => !opt.disabled);
          setHighlightedIndex(initialHighlight >= 0 ? initialHighlight : 0);
          setIsOpen(true);
        } else if (highlightedIndex >= 0 && highlightedIndex < normalizedOptions.length) {
          handleSelectOption(highlightedIndex);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          updateDirection();
          setIsOpen(true);
          const nextIdx = normalizedOptions.findIndex((opt) => !opt.disabled);
          setHighlightedIndex(nextIdx >= 0 ? nextIdx : 0);
        } else {
          let next = highlightedIndex + 1;
          while (next < normalizedOptions.length && normalizedOptions[next].disabled) {
            next++;
          }
          if (next < normalizedOptions.length) {
            setHighlightedIndex(next);
          }
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          updateDirection();
          setIsOpen(true);
          let prevIdx = normalizedOptions.length - 1;
          while (prevIdx >= 0 && normalizedOptions[prevIdx].disabled) {
            prevIdx--;
          }
          setHighlightedIndex(prevIdx >= 0 ? prevIdx : 0);
        } else {
          let prev = highlightedIndex - 1;
          while (prev >= 0 && normalizedOptions[prev].disabled) {
            prev--;
          }
          if (prev >= 0) {
            setHighlightedIndex(prev);
          }
        }
        break;

      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
        break;

      case 'Tab':
        if (isOpen) {
          setIsOpen(false);
        }
        break;
    }
  };

  // Scroll highlighted option into view when moving via keyboard
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
      const optionElements = listboxRef.current.children;
      const targetEl = optionElements[highlightedIndex] as HTMLElement;
      if (targetEl && typeof targetEl.scrollIntoView === 'function') {
        targetEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Styling helpers
  const getTriggerClasses = () => {
    const base = 'w-full min-h-[48px] flex items-center justify-between text-left transition-all duration-150 cursor-pointer select-none focus:outline-none';
    const stateColor = error
      ? 'text-[#C53030]'
      : selectedOption
      ? 'text-[#18181B]'
      : 'text-[#9CA3AF]';

    if (variant === 'underline') {
      const borderStyle = error
        ? 'border-b-2 border-[#C53030]'
        : isOpen
        ? 'border-b-2 border-[#C59B27] bg-[#FDFBF7]'
        : 'border-b border-[#D9D6CE] hover:border-[#B89047] bg-transparent';
      return `${base} py-2.5 px-0 text-sm ${stateColor} ${borderStyle} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`;
    } else {
      // bordered variant (max 8px rounded-lg)
      const borderStyle = error
        ? 'border border-[#C53030] bg-white ring-1 ring-[#C53030]/20'
        : isOpen
        ? 'border border-[#C59B27] bg-[#FDFBF7] ring-1 ring-[#C59B27]/30'
        : 'border border-[#D9D6CE] bg-white hover:border-[#B89047] shadow-2xs';
      return `${base} py-2.5 px-3.5 rounded-lg text-sm ${stateColor} ${borderStyle} ${disabled ? 'opacity-60 cursor-not-allowed bg-[#FAF8F4]' : ''}`;
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full text-left ${className}`}>
      {label && (
        <label
          htmlFor={triggerId}
          className="text-xs font-semibold text-[#18181B] block mb-1.5 select-none"
        >
          {label}
          {required && <span className="text-[#C53030] ml-0.5">*</span>}
        </label>
      )}

      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-invalid={!!error}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={getTriggerClasses()}
      >
        <span className="truncate pr-3">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#9A7326]' : 'text-[#6B7280]'
          }`}
        />
      </button>

      {/* Helper Text */}
      {!error && helperText && (
        <p className="text-xs text-[#6B7280] mt-1 font-normal leading-relaxed">
          {helperText}
        </p>
      )}

      {/* Human Error Message */}
      {error && (
        <p className="text-xs text-[#C53030] mt-1 font-medium leading-normal">
          {error}
        </p>
      )}

      {/* Opened Dropdown Panel */}
      {isOpen && !disabled && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={label || placeholder}
          className={`absolute z-50 left-0 right-0 w-full bg-white border border-[#E5D5AE] rounded-lg shadow-lg shadow-[#18181B]/5 py-1.5 max-h-60 overflow-y-auto focus:outline-none transition-all duration-150 ease-out ${
            openDirection === 'up'
              ? 'bottom-full mb-1.5 origin-bottom'
              : 'top-full mt-1.5 origin-top'
          }`}
        >
          {normalizedOptions.map((opt, index) => {
            const isSelected = opt.value === value;
            const isHighlighted = index === highlightedIndex;

            return (
              <li
                key={`${opt.value}-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                onClick={() => handleSelectOption(index)}
                onMouseEnter={() => !opt.disabled && setHighlightedIndex(index)}
                className={`min-h-[44px] px-3.5 py-2.5 flex items-center justify-between text-sm transition-colors duration-100 cursor-pointer select-none ${
                  opt.disabled
                    ? 'text-[#9CA3AF] opacity-60 cursor-not-allowed bg-transparent'
                    : isSelected
                    ? 'bg-[#FAF6EB] text-[#9A7326] font-semibold'
                    : isHighlighted
                    ? 'bg-[#FAF8F4] text-[#18181B]'
                    : 'text-[#18181B] hover:bg-[#FAF8F4] active:bg-[#F3EFE6]'
                }`}
              >
                <span className="truncate pr-2">{opt.label}</span>
                {isSelected && (
                  <Check className="w-4 h-4 text-[#9A7326] shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

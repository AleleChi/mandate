import React, { useState, useRef, useEffect, useId, useMemo } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import {
  getInternationalCountries,
  getCountryByIso,
  searchInternationalCountries,
  resolveConsistentCountryIso,
  supportsFlagEmoji,
  InternationalCountry
} from '../../utils/countries';
import { normalizePhone, validatePhoneNumber } from '../../utils/validation';

export interface InternationalPhoneFieldProps {
  countryIso?: string | null;
  value?: string;
  onCountryChange: (countryIso: string) => void;
  onChange: (rawValue: string) => void;
  onE164Change?: (e164: string | null) => void;
  error?: string | null;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  helperText?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Shared International Phone Input
 *
 * Dedicated phone input without WhatsApp-specific messaging or consent semantics.
 * - Collapsed trigger displays native flag + dial code (or dial code only if flag emoji unsupported).
 * - Never shows raw ISO alpha-2 text (e.g. "NG +234").
 * - Supports 245+ countries derived from libphonenumber-js and native Intl.DisplayNames.
 * - Single restrained field shell matching Koinonia design aesthetic.
 * - Normalizes to canonical +E.164.
 */
export const InternationalPhoneField: React.FC<InternationalPhoneFieldProps> = ({
  countryIso,
  value = '',
  onCountryChange,
  onChange,
  onE164Change,
  error,
  disabled = false,
  required = false,
  label,
  helperText,
  id,
  name = 'phone_number',
  placeholder,
  className = '',
  autoFocus = false
}) => {
  const generatedId = useId();
  const inputId = id || `phone-input-${generatedId}`;
  const searchInputId = `country-search-${generatedId}`;

  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Platform flag emoji support detection (falls back gracefully on Windows to avoid raw ISO text)
  const [hasFlagSupport, setHasFlagSupport] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return supportsFlagEmoji();
    }
    return true;
  });

  useEffect(() => {
    setHasFlagSupport(supportsFlagEmoji());
  }, []);

  // Retrieve full countries list and active country record
  const allCountries = useMemo(() => getInternationalCountries(), []);

  const activeIso = (countryIso || 'NG').trim().toUpperCase();
  const selectedCountry: InternationalCountry = useMemo(() => {
    return (
      getCountryByIso(activeIso) ||
      getCountryByIso('NG') || {
        iso: 'NG' as const,
        name: 'Nigeria',
        callingCode: '234',
        dialCode: '+234',
        flag: '🇳🇬'
      }
    );
  }, [activeIso]);

  // Compute canonical E.164 and notify parent
  const currentE164 = useMemo(() => {
    if (!value || !value.trim()) return null;
    const isValid = validatePhoneNumber(value, activeIso) === undefined;
    if (!isValid) return null;
    return normalizePhone(value, activeIso) || null;
  }, [value, activeIso]);

  useEffect(() => {
    if (onE164Change) {
      onE164Change(currentE164);
    }
  }, [currentE164, onE164Change]);

  // Filtered country list
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) {
      return allCountries;
    }
    return searchInternationalCountries(searchQuery, allCountries);
  }, [searchQuery, allCountries]);

  // Focus management when selector opens
  useEffect(() => {
    if (isSelectorOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery('');
    }
  }, [isSelectorOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSelectorOpen) {
        setIsSelectorOpen(false);
        inputRef.current?.focus();
      }
    };
    if (isSelectorOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isSelectorOpen]);

  const handleSelectCountry = (iso: string) => {
    onCountryChange(iso);
    setIsSelectorOpen(false);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    onChange(raw);
    if (raw && raw.trim().startsWith('+')) {
      const consistentIso = resolveConsistentCountryIso(activeIso, raw);
      if (consistentIso && consistentIso !== activeIso) {
        onCountryChange(consistentIso);
      }
    }
  };

  // Selector modal element
  const selectorModal = isSelectorOpen && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => setIsSelectorOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${generatedId}-dialog-title`}
    >
      <div
        className="w-full max-w-[360px] sm:max-w-[400px] rounded-2xl bg-white dark:bg-[#21211E] border border-[#DED8CA] dark:border-[#302E29] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[520px] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#EFECE6] dark:border-[#2E2C28]">
          <h3
            id={`${generatedId}-dialog-title`}
            className="text-sm sm:text-base font-semibold text-[#18181B] dark:text-[#F0EBE3]"
          >
            Select country
          </h3>
          <button
            type="button"
            onClick={() => setIsSelectorOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#71717A] dark:text-[#B8B0A5] hover:bg-[#F5F2EA] dark:hover:bg-[#2A2926] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-3 border-b border-[#EFECE6] dark:border-[#2E2C28] bg-[#FAF8F5] dark:bg-[#1E1D1A]">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[#8B867D] dark:text-[#7A7570] absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              id={searchInputId}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search country or code"
              className="w-full h-10 pl-9 pr-8 rounded-lg bg-white dark:bg-[#262520] border border-[#DED8CA] dark:border-[#3A3835] text-sm text-[#18181B] dark:text-[#F0EBE3] placeholder-[#8B867D]/70 dark:placeholder-[#7A7570] focus:outline-none focus:border-[#C59B27] focus:ring-2 focus:ring-[#C59B27]/20"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 p-1 text-[#8B867D] hover:text-[#18181B] dark:hover:text-[#F0EBE3] cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Countries Scroll Area */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#F5F2EA] dark:divide-[#2A2926] p-1">
          {filteredCountries.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#8B867D] dark:text-[#7A7570]">
              No countries found for "{searchQuery}"
            </div>
          ) : (
            filteredCountries.map((c) => {
              const isSelected = c.iso === selectedCountry.iso;
              return (
                <button
                  key={c.iso}
                  type="button"
                  onClick={() => handleSelectCountry(c.iso)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#FAF6EB] dark:bg-[#2A2720] text-[#18181B] dark:text-[#F0EBE3] font-medium'
                      : 'hover:bg-[#FAF8F5] dark:hover:bg-[#262520] text-[#27272A] dark:text-[#D4CFCA]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {hasFlagSupport && c.flag ? (
                      <span className="text-lg leading-none shrink-0" role="img" aria-label={c.name}>
                        {c.flag}
                      </span>
                    ) : null}
                    <span className="text-sm truncate">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-[#8B867D] dark:text-[#7A7570] tabular-nums font-mono">
                      {c.dialCode}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-[#C59B27] shrink-0" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`w-full flex flex-col text-left font-sans ${className}`}>
      {/* Label */}
      {label && (
        <label
          htmlFor={inputId}
          className="text-[11px] font-bold tracking-wider uppercase text-[#715D3A] dark:text-[#C59B27] block mb-1.5 select-none"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Field Shell */}
      <div className="relative w-full">
        <div
          className={`group w-full flex items-stretch rounded-xl bg-white dark:bg-[#21211E] transition-all duration-200 ${
            error
              ? 'border border-red-500 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/20'
              : 'border border-[#D9D6CE] dark:border-[#3A3835] focus-within:border-[#C59B27] dark:focus-within:border-[#C59B27] focus-within:ring-2 focus-within:ring-[#C59B27]/20 dark:focus-within:ring-[#C59B27]/20 hover:border-[#C5BBA5] dark:hover:border-[#4E4A43]'
          } ${disabled ? 'opacity-60 cursor-not-allowed bg-[#F5F3ED] dark:bg-[#1A1917]' : ''}`}
        >
          {/* Left: Country Trigger */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setIsSelectorOpen((prev) => !prev)}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2.5 rounded-l-xl hover:bg-[#F5F2EA] dark:hover:bg-[#2A2926] active:bg-[#ECE8DD] dark:active:bg-[#32302C] focus:outline-none transition-colors border-r border-[#D9D6CE] dark:border-[#3A3835] shrink-0 select-none cursor-pointer"
            aria-label={`Select country. Current country is ${selectedCountry.name}, dial code ${selectedCountry.dialCode}`}
            aria-expanded={isSelectorOpen}
            aria-haspopup="dialog"
          >
            {hasFlagSupport && selectedCountry.flag ? (
              <span className="text-base sm:text-lg leading-none shrink-0" role="img" aria-label={selectedCountry.name}>
                {selectedCountry.flag}
              </span>
            ) : null}
            <span className="text-[13px] sm:text-sm font-medium text-[#18181B] dark:text-[#F0EBE3] tracking-tight">
              {selectedCountry.dialCode}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#8B867D] dark:text-[#7A7570] transition-transform duration-200 shrink-0 ${
                isSelectorOpen ? 'rotate-180 text-[#C59B27]' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {/* Right: Phone Input */}
          <input
            ref={inputRef}
            id={inputId}
            name={name}
            type="tel"
            disabled={disabled}
            value={value}
            placeholder={placeholder || (selectedCountry.iso === 'NG' ? '803 123 4567' : 'Phone number')}
            onChange={handleInputChange}
            autoFocus={autoFocus}
            className="flex-1 min-w-0 px-3.5 py-2.5 bg-transparent text-sm text-[#18181B] dark:text-[#F0EBE3] placeholder:text-[#9CA3AF] dark:placeholder:text-[#7A7570] focus:outline-none"
          />
        </div>
      </div>

      {/* Helper text or Error */}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400 font-medium mt-1">
          {error}
        </p>
      ) : helperText ? (
        <p className="text-[11px] text-[#8B867D] dark:text-[#7A7570] mt-1">
          {helperText}
        </p>
      ) : null}

      {/* Country selection modal */}
      {selectorModal}
    </div>
  );
};

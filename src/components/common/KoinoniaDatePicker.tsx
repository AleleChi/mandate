import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface KoinoniaDatePickerProps {
  label?: string;
  value: string; // ISO format "YYYY-MM-DD"
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string; // ISO format "YYYY-MM-DD"
  maxDate?: string; // ISO format "YYYY-MM-DD"
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export const KoinoniaDatePicker: React.FC<KoinoniaDatePickerProps> = ({
  label,
  value,
  onChange,
  placeholder = 'mm/dd/yyyy',
  minDate,
  maxDate,
  error,
  helperText,
  disabled = false,
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calendar current view state (defaults to today or selected date)
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  // Track size/viewport to handle mobile bottom sheet vs desktop popover
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync internal view date with incoming value when it opens
  useEffect(() => {
    if (isOpen && value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setViewDate(d);
      }
    }
  }, [isOpen, value]);

  // Close calendar when clicking outside (desktop popover behavior)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!isMobile && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isMobile]);

  // Format YYYY-MM-DD to "12 May 2017"
  const formatToReadable = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = date.getDate();
    const monthName = MONTHS[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${monthName} ${year}`;
  };

  const handlePrevMonth = () => {
    setViewDate(prev => {
      const year = prev.getFullYear();
      const month = prev.getMonth();
      return new Date(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, 1);
    });
  };

  const handleNextMonth = () => {
    setViewDate(prev => {
      const year = prev.getFullYear();
      const month = prev.getMonth();
      return new Date(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, 1);
    });
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = parseInt(e.target.value, 10);
    setViewDate(prev => new Date(prev.getFullYear(), m, 1));
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const y = parseInt(e.target.value, 10);
    setViewDate(prev => new Date(y, prev.getMonth(), 1));
  };

  const handleDateSelect = (day: number) => {
    const selected = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    
    // Check min/max bounds
    if (minDate) {
      const min = new Date(minDate);
      min.setHours(0, 0, 0, 0);
      if (selected < min) return;
    }
    if (maxDate) {
      const max = new Date(maxDate);
      max.setHours(23, 59, 59, 999);
      if (selected > max) return;
    }

    // Format ISO YYYY-MM-DD (local time-safe)
    const yyyy = selected.getFullYear();
    const mm = String(selected.getMonth() + 1).padStart(2, '0');
    const dd = String(selected.getDate()).padStart(2, '0');
    const formatted = `${yyyy}-${mm}-${dd}`;

    onChange(formatted);
    
    if (!isMobile) {
      setIsOpen(false);
    }
  };

  // Days calculations
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // First day of current month (adjusted: MON=0, TUE=1, ..., SUN=6)
  const firstDayIndex = (() => {
    const day = new Date(year, month, 1).getDay();
    return (day + 6) % 7;
  })();

  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Selected date components
  const selectedDateObj = value ? new Date(value) : null;
  const isSelectedDate = (dayNum: number) => {
    if (!selectedDateObj) return false;
    return (
      selectedDateObj.getDate() === dayNum &&
      selectedDateObj.getMonth() === month &&
      selectedDateObj.getFullYear() === year
    );
  };

  // Today's date components
  const todayObj = new Date();
  const isToday = (dayNum: number) => {
    return (
      todayObj.getDate() === dayNum &&
      todayObj.getMonth() === month &&
      todayObj.getFullYear() === year
    );
  };

  // Bound check for individual days
  const isDateDisabled = (dayNum: number) => {
    const checkDate = new Date(year, month, dayNum);
    if (minDate) {
      const min = new Date(minDate);
      min.setHours(0, 0, 0, 0);
      if (checkDate < min) return true;
    }
    if (maxDate) {
      const max = new Date(maxDate);
      max.setHours(0, 0, 0, 0);
      
      const checkMidnight = new Date(year, month, dayNum);
      checkMidnight.setHours(0, 0, 0, 0);
      if (checkMidnight > max) return true;
    }
    return false;
  };

  // Dropdown list generation
  const currentYearNum = new Date().getFullYear();
  const yearOptions = Array.from({ length: 101 }, (_, i) => currentYearNum - i); // last 100 years

  // Keyboard navigation for trigger field
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!disabled) setIsOpen(true);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleCalendarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <label className="text-xs font-semibold text-[#18181B] block mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Trigger Field */}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="grid"
        aria-controls="koinonia-datepicker-dialog"
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`w-full py-2 px-0 bg-transparent border-0 border-b ${
          error ? 'border-red-600' : 'border-[#D9D6CE] focus-within:border-[#C59B27]'
        } text-sm flex items-center justify-between cursor-pointer transition-colors focus:outline-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${!value ? 'text-[#9CA3AF]' : 'text-[#18181B]'}`}
      >
        <span className="font-medium select-none">
          {value ? formatToReadable(value) : placeholder}
        </span>
        <Calendar className="w-4 h-4 text-[#715D3A] shrink-0 pointer-events-none" />
      </div>

      {error && <p className="text-xs text-red-600 mt-1 font-medium">{error}</p>}
      {!error && helperText && <p className="text-xs text-[#6B7280] mt-1">{helperText}</p>}

      {/* Overlays / Panels */}
      {isOpen && (
        <>
          {/* Mobile Bottom Sheet Modal Overlay */}
          {isMobile ? (
            <div className="fixed inset-0 bg-black/50 z-50 flex flex-col justify-end">
              {/* Tap backdrop to close */}
              <div className="absolute inset-0" onClick={() => setIsOpen(false)} />
              
              <div
                id="koinonia-datepicker-dialog"
                role="dialog"
                aria-modal="true"
                onKeyDown={handleCalendarKeyDown}
                className="bg-[#FAF8F4] w-full max-w-[390px] mx-auto rounded-t-2xl p-4 shadow-xl z-10 border-t border-[#EAE8E1] transition-transform duration-300 transform translate-y-0"
              >
                {/* Drag Handle / Header */}
                <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-3 mb-3">
                  <span className="text-sm font-bold text-[#18181B]">Select Date</span>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1 text-[#715D3A] hover:text-[#18181B]"
                    aria-label="Close date picker"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Calendar Panel Content */}
                <div className="space-y-4">
                  {renderCalendarGrid()}

                  {/* Actions for Mobile */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="flex-1 py-2.5 border border-[#D9D6CE] hover:bg-[#FAF8F4] active:bg-[#F3EFE6] text-sm text-[#3F3F46] font-semibold rounded-xl transition-all cursor-pointer text-center"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="flex-1 py-2.5 bg-[#C59B27] hover:bg-[#B58E33] active:bg-[#A8822B] text-sm text-[#18181B] font-semibold rounded-xl transition-all cursor-pointer text-center"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop Popover Panel */
            <div
              id="koinonia-datepicker-dialog"
              role="dialog"
              aria-modal="false"
              onKeyDown={handleCalendarKeyDown}
              className="absolute left-0 mt-2 bg-[#FAF8F4] border border-[#EAE8E1] rounded-xl p-4 shadow-lg z-50 w-[320px] transition-all duration-150 origin-top"
            >
              {renderCalendarGrid()}
            </div>
          )}
        </>
      )}
    </div>
  );

  function renderCalendarGrid() {
    // Generate day cells
    const dayCells: React.ReactNode[] = [];

    // 1. Previous Month's Trailing Days (Muted)
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      dayCells.push(
        <div
          key={`prev-${dayNum}`}
          className="w-10 h-10 flex items-center justify-center text-xs text-[#D9D6CE] font-medium opacity-40 select-none cursor-not-allowed"
        >
          {dayNum}
        </div>
      );
    }

    // 2. Current Month's Days
    for (let d = 1; d <= daysInMonth; d++) {
      const disabledDay = isDateDisabled(d);
      const isSelected = isSelectedDate(d);
      const isCurrentToday = isToday(d);

      let dayClasses = 'w-10 h-10 flex items-center justify-center text-xs font-semibold rounded-full transition-all relative cursor-pointer select-none';
      
      if (disabledDay) {
        dayClasses += ' text-[#D9D6CE] opacity-30 cursor-not-allowed';
      } else if (isSelected) {
        dayClasses += ' bg-[#C59B27] text-[#18181B] shadow-2xs font-bold ring-2 ring-[#C59B27]/20';
      } else {
        dayClasses += ' text-[#18181B] hover:bg-[#F3EFE6] active:bg-[#FAF8F4]';
        if (isCurrentToday) {
          dayClasses += ' border-2 border-[#C59B27]';
        }
      }

      dayCells.push(
        <button
          key={`curr-${d}`}
          type="button"
          disabled={disabledDay}
          onClick={() => handleDateSelect(d)}
          className={dayClasses}
          style={{ minWidth: '40px', minHeight: '40px' }}
          aria-label={`${d} ${MONTHS[month]} ${year}${isCurrentToday ? ', today' : ''}${isSelected ? ', selected' : ''}`}
        >
          {d}
        </button>
      );
    }

    // 3. Next Month's Leading Days to maintain 6-week grid
    const totalCells = 42; // standard 6-week block to keep layout height locked
    const nextDaysNeeded = totalCells - dayCells.length;
    for (let d = 1; d <= nextDaysNeeded; d++) {
      dayCells.push(
        <div
          key={`next-${d}`}
          className="w-10 h-10 flex items-center justify-center text-xs text-[#D9D6CE] font-medium opacity-40 select-none cursor-not-allowed"
        >
          {d}
        </div>
      );
    }

    return (
      <div className="space-y-3.5">
        {/* Month & Year Selection Header */}
        <div className="flex items-center justify-between gap-1.5 pb-1">
          {/* Navigation Controls */}
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded-full hover:bg-[#F3EFE6] text-[#715D3A] active:scale-95 transition-all focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
          </button>

          {/* Quick Dropdown Picker Box */}
          <div className="flex items-center gap-1">
            {/* Month Select */}
            <div className="relative">
              <select
                value={month}
                onChange={handleMonthChange}
                className="appearance-none bg-transparent hover:bg-[#F3EFE6] pl-2 pr-5 py-1 text-xs font-bold text-[#18181B] rounded-lg border-0 focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
                aria-label="Select month"
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx} className="bg-[#FAF8F4]">
                    {m.substring(0, 3)}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-[#715D3A]">
                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>

            {/* Year Select */}
            <div className="relative">
              <select
                value={year}
                onChange={handleYearChange}
                className="appearance-none bg-transparent hover:bg-[#F3EFE6] pl-2 pr-5 py-1 text-xs font-bold text-[#18181B] rounded-lg border-0 focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
                aria-label="Select year"
              >
                {yearOptions.map(y => (
                  <option key={y} value={y} className="bg-[#FAF8F4]">
                    {y}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-[#715D3A]">
                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-full hover:bg-[#F3EFE6] text-[#715D3A] active:scale-95 transition-all focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-y-1.5 text-center justify-items-center">
          {/* Weekday Labels */}
          {WEEKDAYS.map(day => (
            <div key={day} className="text-[10px] font-bold text-[#715D3A] select-none tracking-wider w-10">
              {day.substring(0, 1)}
            </div>
          ))}

          {/* Day Grid Cells */}
          {dayCells}
        </div>
      </div>
    );
  }
};

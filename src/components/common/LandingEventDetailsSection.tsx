import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export interface LandingEventDetailsSectionProps {
  event?: {
    id?: string;
    title?: string;
    section_name?: string | null;
    theme?: string | null;
    scripture?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    daily_start_time?: string | null;
    daily_end_time?: string | null;
    location?: string | null;
    timezone?: string | null;
    parents_can_create_account?: number | boolean | null;
    parent_access_opens_at?: string | null;
    parent_access_closes_at?: string | null;
  } | null;
  regStatus?: {
    eventName?: string;
    parent?: {
      isOpen?: boolean;
      state?: 'open' | 'not_open_yet' | 'closed' | 'disabled';
      opensAtFormatted?: string | null;
      closesAtFormatted?: string | null;
    };
  } | null;
  className?: string;
}

/**
 * Parses event dates into visual elements for the editorial date composition.
 * Example: days: "18—22", month: "NOVEMBER", year: "2026"
 */
function parseEventDateDisplay(startsAt?: string | null, endsAt?: string | null): {
  days: string;
  month: string;
  year: string;
  fullText: string;
} | null {
  if (!startsAt || startsAt.trim() === '') {
    return null;
  }

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const sDate = new Date(startsAt);
  if (isNaN(sDate.getTime())) {
    return {
      days: startsAt.trim(),
      month: '',
      year: '',
      fullText: startsAt.trim()
    };
  }

  const sDay = sDate.getDate();
  const sMonth = months[sDate.getMonth()];
  const sYear = sDate.getFullYear();

  if (!endsAt || endsAt.trim() === '') {
    return {
      days: String(sDay),
      month: sMonth.toUpperCase(),
      year: String(sYear),
      fullText: `${sDay} ${sMonth} ${sYear}`
    };
  }

  const eDate = new Date(endsAt);
  if (isNaN(eDate.getTime())) {
    return {
      days: String(sDay),
      month: sMonth.toUpperCase(),
      year: String(sYear),
      fullText: `${sDay} ${sMonth} ${sYear}`
    };
  }

  const eDay = eDate.getDate();
  const eMonth = months[eDate.getMonth()];
  const eYear = eDate.getFullYear();

  if (sYear === eYear && sMonth === eMonth) {
    return {
      days: sDay === eDay ? String(sDay) : `${sDay}—${eDay}`,
      month: sMonth.toUpperCase(),
      year: String(sYear),
      fullText: sDay === eDay ? `${sDay} ${sMonth} ${sYear}` : `${sDay}–${eDay} ${sMonth} ${sYear}`
    };
  }

  if (sYear === eYear) {
    return {
      days: `${sDay} ${sMonth.slice(0, 3)} — ${eDay} ${eMonth.slice(0, 3)}`,
      month: `${sMonth.toUpperCase()} / ${eMonth.toUpperCase()}`,
      year: String(sYear),
      fullText: `${sDay} ${sMonth} – ${eDay} ${eMonth} ${sYear}`
    };
  }

  return {
    days: `${sDay} ${sMonth.slice(0, 3)} — ${eDay} ${eMonth.slice(0, 3)}`,
    month: `${sMonth.toUpperCase()} / ${eMonth.toUpperCase()}`,
    year: `${sYear} / ${eYear}`,
    fullText: `${sDay} ${sMonth} ${sYear} – ${eDay} ${eMonth} ${eYear}`
  };
}

/**
 * Formats daily operational times cleanly.
 * Example: "9:00 AM – 7:00 PM"
 */
function formatDailyTime(startTime?: string | null, endTime?: string | null): string | null {
  const hasStart = Boolean(startTime && startTime.trim());
  const hasEnd = Boolean(endTime && endTime.trim());

  if (hasStart && hasEnd) {
    return `${startTime!.trim()} – ${endTime!.trim()}`;
  }
  if (hasStart) {
    return startTime!.trim();
  }
  if (hasEnd) {
    return `Until ${endTime!.trim()}`;
  }
  return null;
}

export const LandingEventDetailsSection: React.FC<LandingEventDetailsSectionProps> = ({
  event,
  regStatus,
  className = ''
}) => {
  const systemReducedMotion = useReducedMotion();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, []);

  const shouldReduceMotion = Boolean(systemReducedMotion || prefersReducedMotion);

  const eventTitle = event?.title?.trim() || regStatus?.eventName?.trim() || null;
  const sectionSubtitle = event?.section_name?.trim() || null;
  const locationText = event?.location?.trim() || null;

  const dateDisplay = parseEventDateDisplay(event?.starts_at, event?.ends_at);
  const timeText = formatDailyTime(event?.daily_start_time, event?.daily_end_time);
  const cleanTimezone = event?.timezone ? event.timezone.replace('_', ' ') : null;
  const themeText = event?.theme?.trim() || null;
  const scriptureText = event?.scripture?.trim() || null;

  // Derive Access rule strictly from current event configuration
  let accessInfo: { label: string; value: string } | null = null;
  if (event?.parents_can_create_account === 1 || event?.parents_can_create_account === true) {
    if (regStatus?.parent?.state === 'not_open_yet') {
      accessInfo = {
        label: 'Parent Access',
        value: regStatus.parent.opensAtFormatted ? `Opens ${regStatus.parent.opensAtFormatted}` : 'Registration opening soon'
      };
    } else if (regStatus?.parent?.state === 'closed') {
      accessInfo = {
        label: 'Parent Access',
        value: 'Registration closed (Sign in available)'
      };
    } else {
      accessInfo = {
        label: 'Parent Access',
        value: 'Parent account required for child registration'
      };
    }
  } else if (event?.parents_can_create_account === 0 || event?.parents_can_create_account === false) {
    accessInfo = {
      label: 'Parent Access',
      value: 'Registration by invitation only'
    };
  }

  // Derive Pass rule strictly from current event review & pass policy
  let passInfo: { label: string; value: string } | null = null;
  if (event) {
    passInfo = {
      label: 'Event Pass',
      value: 'Digital QR pass issued upon application review'
    };
  }

  // If no event title and no date or schedule exists, hide section entirely
  if (!eventTitle && !dateDisplay && !timeText && !themeText) {
    return null;
  }

  const hasSchedule = Boolean(timeText);
  const hasTheme = Boolean(themeText);
  const hasMetadata = Boolean(accessInfo || passInfo);

  return (
    <section
      id="event-details"
      aria-label="Event Details"
      className={`py-12 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full ${className}`}
    >
      {/* Connected Editorial Event Canvas */}
      <motion.div
        initial={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[#FAF8F3] dark:bg-[#1C1B18] border-t-2 border-t-[#C59B27] border-x border-b border-[#EAE8E1]/80 dark:border-[#2E2D29] rounded-2xl sm:rounded-3xl p-7 sm:p-10 lg:p-14 text-left relative overflow-hidden"
      >
        {/* Top Block: Event Identity on Left, Large Date Composition on Right */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8 lg:gap-12 pb-8 sm:pb-10 border-b border-[#EAE8E1]/80 dark:border-[#2E2D29]">
          {/* Left: Event Identity & Venue */}
          <div className="space-y-2 max-w-2xl">
            <span className="text-[10.5px] sm:text-[11px] font-bold tracking-widest text-[#9A7326] dark:text-[#D4AF37] uppercase font-sans block">
              {sectionSubtitle || 'CHILDREN & TEENS'}
            </span>
            {eventTitle && (
              <h2 className="text-3xl sm:text-4xl lg:text-[50px] font-serif-koinonia font-bold text-[#18181B] dark:text-[#F7F4ED] tracking-tight leading-[1.05]">
                {eventTitle}
              </h2>
            )}
            {locationText && (
              <p className="text-sm sm:text-base text-[#52525B] dark:text-[#C8C2B6] pt-1 leading-relaxed font-sans font-normal">
                {locationText}
              </p>
            )}
          </div>

          {/* Right: Large Date Composition (Plus Jakarta Sans) */}
          {dateDisplay && (
            <div className="flex flex-col items-start lg:items-end justify-start shrink-0 lg:pt-1">
              <div className="text-2xl sm:text-3xl lg:text-[48px] font-sans font-bold text-[#18181B] dark:text-[#F7F4ED] tracking-tight leading-none">
                {dateDisplay.days}
              </div>
              <div className="text-xs sm:text-[13px] font-sans font-bold text-[#9A7326] dark:text-[#D4AF37] tracking-[0.2em] uppercase mt-2">
                {dateDisplay.month}
              </div>
              <div className="text-xs sm:text-[15px] font-sans font-medium text-[#71717A] dark:text-[#A19D95] tracking-normal mt-0.5">
                {dateDisplay.year}
              </div>
            </div>
          )}
        </div>

        {/* Middle Block: Daily Schedule and Ministry Theme */}
        {(hasSchedule || hasTheme) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 items-start py-8 sm:py-10">
            {/* Schedule Block */}
            {hasSchedule && (
              <div className="space-y-1.5">
                <span className="text-[10.5px] sm:text-[11px] font-bold tracking-widest text-[#9A7326] dark:text-[#D4AF37] uppercase font-sans block">
                  DAILY SCHEDULE
                </span>
                {timeText && (
                  <div className="text-xl sm:text-2xl font-bold text-[#18181B] dark:text-[#F7F4ED] font-sans leading-snug">
                    {timeText}
                  </div>
                )}
                {cleanTimezone && (
                  <div className="text-xs sm:text-sm font-medium text-[#71717A] dark:text-[#A19D95] font-sans mt-1">
                    {cleanTimezone}
                  </div>
                )}
              </div>
            )}

            {/* Theme Block */}
            {hasTheme && (
              <div className="space-y-1.5">
                <span className="text-[10.5px] sm:text-[11px] font-bold tracking-widest text-[#9A7326] dark:text-[#D4AF37] uppercase font-sans block">
                  MINISTRY THEME
                </span>
                <div className="text-2xl sm:text-3xl lg:text-[32px] font-semibold text-[#18181B] dark:text-[#F7F4ED] font-serif-koinonia leading-snug">
                  &ldquo;{themeText}&rdquo;
                </div>
                {scriptureText && (
                  <div className="text-xs sm:text-sm font-semibold text-[#9A7326] dark:text-[#D4AF37] tracking-wide font-sans mt-1">
                    {scriptureText}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom Utility Rail: Parent Access & Event Pass */}
        {hasMetadata && (
          <div className="pt-6 sm:pt-8 border-t border-[#EAE8E1]/80 dark:border-[#2E2D29] grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-start text-xs sm:text-sm">
            {accessInfo && (
              <div className="space-y-1">
                <span className="font-bold text-[#9A7326] dark:text-[#D4AF37] tracking-widest uppercase text-[10.5px] sm:text-[11px] font-sans block">
                  PARENT ACCESS
                </span>
                <p className="text-[#52525B] dark:text-[#C8C2B6] font-normal leading-relaxed font-sans">
                  {accessInfo.value}
                </p>
              </div>
            )}
            {passInfo && (
              <div className="space-y-1 md:border-l md:border-[#EAE8E1]/80 dark:md:border-[#2E2D29] md:pl-10">
                <span className="font-bold text-[#9A7326] dark:text-[#D4AF37] tracking-widest uppercase text-[10.5px] sm:text-[11px] font-sans block">
                  EVENT PASS
                </span>
                <p className="text-[#52525B] dark:text-[#C8C2B6] font-normal leading-relaxed font-sans">
                  {passInfo.value}
                </p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </section>
  );
};

import React from 'react';

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
 * Formats event date range into an elegant editorial string.
 * Example: "18–22 November 2026" or "18 November 2026"
 * If no start date is provided, returns null cleanly (no fake placeholder).
 */
function formatEventDateRange(startsAt?: string | null, endsAt?: string | null): string | null {
  if (!startsAt || startsAt.trim() === '') {
    return null;
  }

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const sDate = new Date(startsAt);
  if (isNaN(sDate.getTime())) {
    return startsAt.trim();
  }

  const sDay = sDate.getDate();
  const sMonth = months[sDate.getMonth()];
  const sYear = sDate.getFullYear();

  if (!endsAt || endsAt.trim() === '') {
    return `${sDay} ${sMonth} ${sYear}`;
  }

  const eDate = new Date(endsAt);
  if (isNaN(eDate.getTime())) {
    return `${sDay} ${sMonth} ${sYear}`;
  }

  const eDay = eDate.getDate();
  const eMonth = months[eDate.getMonth()];
  const eYear = eDate.getFullYear();

  if (sYear === eYear && sMonth === eMonth) {
    if (sDay === eDay) {
      return `${sDay} ${sMonth} ${sYear}`;
    }
    return `${sDay}–${eDay} ${sMonth} ${sYear}`;
  }

  if (sYear === eYear) {
    return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${sYear}`;
  }

  return `${sDay} ${sMonth} ${sYear} – ${eDay} ${eMonth} ${eYear}`;
}

/**
 * Formats daily operational times cleanly.
 * Example: "9:00 AM – 7:00 PM" or "9:00 AM"
 * If no start time is provided, returns null cleanly.
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
  const eventTitle = event?.title?.trim() || regStatus?.eventName?.trim() || null;
  const sectionSubtitle = event?.section_name?.trim() || null;
  const locationText = event?.location?.trim() || null;

  const dateText = formatEventDateRange(event?.starts_at, event?.ends_at);
  const timeText = formatDailyTime(event?.daily_start_time, event?.daily_end_time);
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
      label: 'Entry Pass',
      value: 'Digital QR pass issued upon application review'
    };
  }

  // If no event title and no date or schedule exists, hide section entirely
  if (!eventTitle && !dateText && !timeText && !themeText) {
    return null;
  }

  const hasSchedule = Boolean(dateText || timeText);
  const hasTheme = Boolean(themeText);
  const hasMetadata = Boolean(accessInfo || passInfo);

  return (
    <section
      id="event-details"
      aria-label="Event Details"
      className={`py-8 sm:py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full ${className}`}
    >
      <div className="bg-[#FAF8F3] border border-[#E5D5AE]/90 rounded-3xl sm:rounded-[32px] p-6 sm:p-10 lg:p-14 shadow-2xs">
        {/* Editorial Header */}
        <div className="space-y-1.5 max-w-3xl">
          {sectionSubtitle && (
            <span className="text-[11px] sm:text-xs font-semibold tracking-widest text-[#9A7326] uppercase font-sans block">
              {sectionSubtitle}
            </span>
          )}
          {eventTitle && (
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif-koinonia font-bold text-[#18181B] tracking-tight leading-tight">
              {eventTitle}
            </h2>
          )}
          {locationText && (
            <p className="text-xs sm:text-sm text-[#71717A] pt-1 leading-relaxed">
              {locationText}
            </p>
          )}
        </div>

        {/* Divider if schedule or theme follows */}
        {(hasSchedule || hasTheme) && (
          <div className="my-6 sm:my-8 border-t border-[#EAE8E1]/90" />
        )}

        {/* Primary Information: Schedule and Theme in a Refined Editorial Hierarchy */}
        {(hasSchedule || hasTheme) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 items-start">
            {/* Schedule Block */}
            {hasSchedule && (
              <div className="space-y-2">
                <span className="text-[10px] sm:text-[11px] font-semibold tracking-widest text-[#9A7326] uppercase block">
                  Date & Daily Schedule
                </span>
                {dateText && (
                  <div className="text-lg sm:text-xl lg:text-2xl font-bold text-[#18181B] font-serif-koinonia leading-snug">
                    {dateText}
                  </div>
                )}
                {timeText && (
                  <div className="text-sm sm:text-base text-[#52525B] font-medium">
                    {timeText}
                    {event?.timezone ? ` (${event.timezone.replace('_', ' ')})` : ''}
                  </div>
                )}
              </div>
            )}

            {/* Theme Block */}
            {hasTheme && (
              <div className="space-y-2">
                <span className="text-[10px] sm:text-[11px] font-semibold tracking-widest text-[#9A7326] uppercase block">
                  Ministry Theme
                </span>
                <div className="text-lg sm:text-xl lg:text-2xl font-bold text-[#18181B] font-serif-koinonia leading-snug">
                  &ldquo;{themeText}&rdquo;
                </div>
                {scriptureText && (
                  <div className="text-xs sm:text-sm font-semibold text-[#9A7326] tracking-wide">
                    {scriptureText}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Supporting Metadata: Access & Pass */}
        {hasMetadata && (
          <div className="mt-8 pt-6 border-t border-[#EAE8E1]/90 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 text-xs sm:text-sm">
            {accessInfo && (
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                <span className="font-semibold text-[#18181B] tracking-wide uppercase text-[10px] sm:text-[11px] text-[#9A7326]">
                  {accessInfo.label}:
                </span>
                <span className="text-[#3F3F46] font-medium">
                  {accessInfo.value}
                </span>
              </div>
            )}
            {passInfo && (
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                <span className="font-semibold text-[#18181B] tracking-wide uppercase text-[10px] sm:text-[11px] text-[#9A7326]">
                  {passInfo.label}:
                </span>
                <span className="text-[#3F3F46] font-medium">
                  {passInfo.value}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

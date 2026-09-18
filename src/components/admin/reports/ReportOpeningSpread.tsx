import React from 'react';
import { ReportDocumentModel } from '../../../server/reports/reportDocumentModel';
import { formatEditorialDate, formatEditorialNumber } from './reportEditorialTheme';

interface ReportOpeningSpreadProps {
  model: ReportDocumentModel;
}

export const ReportOpeningSpread: React.FC<ReportOpeningSpreadProps> = ({ model }) => {
  const event = model.eventContext;

  // Extract first narrative (executive summary) if available
  const narrativeSection = model.sections.find(s => s.type === 'narrative');

  // Key event dates
  const startDateStr = formatEditorialDate(event.startsAt);
  const endDateStr = event.endsAt ? formatEditorialDate(event.endsAt) : null;
  const dateRangeStr = endDateStr && endDateStr !== startDateStr
    ? `${startDateStr} – ${endDateStr}`
    : startDateStr;

  return (
    <div className="w-full bg-[#FAF9F5] text-stone-900 p-8 sm:p-14 rounded-xl border border-stone-200/90 shadow-xs space-y-12 print:shadow-none print:rounded-none">
      {/* Header Band */}
      <div className="border-b border-stone-200 pb-6 flex items-baseline justify-between gap-4">
        <div>
          <span className="text-[11px] font-sans font-semibold tracking-[0.2em] uppercase text-[#C59B27] block">
            {event.eventTitle || 'The General Assembly'}
          </span>
          <h2 className="text-2xl sm:text-3xl font-serif font-medium text-stone-900 tracking-tight mt-1">
            Operational Overview &amp; Executive Summary
          </h2>
        </div>
        <div className="text-right hidden sm:block">
          <span className="text-[10px] font-sans uppercase tracking-widest text-stone-400 block">
            Publication Section
          </span>
          <span className="text-xs font-serif italic text-stone-600">
            Opening Profile
          </span>
        </div>
      </div>

      {/* Editorial Grid: Event Context Metadata & Narrative */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Column: Institutional Event Context Block */}
        <div className="lg:col-span-4 bg-white/70 border-l-2 border-[#C59B27] p-5 rounded-r-lg space-y-4 font-sans text-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 block">
            Event Profile
          </span>

          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-stone-400 block">Dates</span>
            <p className="font-medium text-stone-900">{dateRangeStr}</p>
          </div>

          {event.venue && (
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-stone-400 block">Venue</span>
              <p className="font-medium text-stone-900">{event.venue}</p>
            </div>
          )}

          {event.theme && (
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-stone-400 block">Theme</span>
              <p className="font-serif italic text-stone-900 text-sm">"{event.theme}"</p>
            </div>
          )}

          {event.scripture && (
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-stone-400 block">Scripture</span>
              <p className="font-medium text-[#C59B27]">{event.scripture}</p>
            </div>
          )}

          {event.registrationStatus && (
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-stone-400 block">Registration</span>
              <p className="font-medium text-stone-900 capitalize">{event.registrationStatus.replace('_', ' ')}</p>
            </div>
          )}
        </div>

        {/* Right Column: Executive Narrative */}
        <div className="lg:col-span-8 space-y-4">
          <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-stone-500 block">
            Operational Summary
          </span>
          <div className="text-sm sm:text-base text-stone-700 leading-relaxed font-sans font-normal space-y-3">
            {narrativeSection ? (
              <p className="leading-relaxed">{narrativeSection.content?.text}</p>
            ) : (
              <p className="leading-relaxed">
                This report provides an authoritative operational record of event registration, participant attendance, 
                supervisory duty coverage, pass issuance, and child safeguarding care for {event.eventTitle || 'the event'}.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Large Data Moments (Section 6 of prompt): Big figures without heavy bordered card boxes */}
      {model.kpis && model.kpis.length > 0 && (
        <div className="pt-8 border-t border-stone-200/90 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-sans font-semibold uppercase tracking-[0.15em] text-stone-500">
              Key Operational Indicators
            </span>
            <span className="text-[11px] font-sans text-stone-400 italic">
              Authoritative database figures
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 py-2">
            {model.kpis.map((kpi, idx) => (
              <div key={idx} className="space-y-1.5 border-l border-stone-200/80 pl-3">
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-stone-500 block">
                  {kpi.label}
                </span>
                <span className="text-3xl sm:text-4xl font-serif font-normal text-stone-900 block tabular-nums tracking-tight">
                  {formatEditorialNumber(kpi.value)}
                </span>
                {kpi.sublabel && (
                  <span className="text-[11px] font-sans text-stone-500 block leading-snug font-normal">
                    {kpi.sublabel}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

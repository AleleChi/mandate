import React from 'react';
import { ReportDocumentModel } from '../../../server/reports/reportDocumentModel';
import { formatEditorialDate } from './reportEditorialTheme';

interface ReportCoverProps {
  model: ReportDocumentModel;
}

export const ReportCover: React.FC<ReportCoverProps> = ({ model }) => {
  const isDark = model.coverStyle === 'charcoal' || !model.coverStyle;
  const event = model.eventContext;

  const bgClasses = isDark 
    ? 'bg-[#18181B] text-white' 
    : 'bg-[#FAF9F5] text-stone-900 border border-stone-200';

  const goldAccentClass = isDark ? 'text-[#D4AF37]' : 'text-[#C59B27]';
  const subtitleClass = isDark ? 'text-zinc-400' : 'text-stone-600';
  const metaLabelClass = isDark ? 'text-zinc-500' : 'text-stone-400';
  const metaValueClass = isDark ? 'text-zinc-200' : 'text-stone-800';
  const lineBorderClass = isDark ? 'border-[#C59B27]/40' : 'border-[#C59B27]/50';

  // Format date range cleanly
  const startDateStr = formatEditorialDate(event.startsAt);
  const endDateStr = event.endsAt ? formatEditorialDate(event.endsAt) : null;
  const dateRangeStr = endDateStr && endDateStr !== startDateStr
    ? `${startDateStr} – ${endDateStr}`
    : startDateStr;

  const generatedDateStr = formatEditorialDate(
    model.reportingPeriod?.end || model.informationConfirmedUpTo || new Date().toISOString()
  );

  return (
    <div className={`w-full min-h-[960px] md:min-h-[1080px] p-10 sm:p-16 flex flex-col justify-between relative overflow-hidden rounded-xl shadow-lg print:shadow-none print:rounded-none ${bgClasses}`}>
      {/* Subtle editorial watermark / grid lines */}
      <div className="absolute top-0 right-0 w-96 h-96 pointer-events-none opacity-5">
        <svg viewBox="0 0 100 100" className="w-full h-full fill-current">
          <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="1" fill="none" />
          <circle cx="50" cy="50" r="32" stroke="currentColor" strokeWidth="0.5" fill="none" />
          <circle cx="50" cy="50" r="16" stroke="currentColor" strokeWidth="0.5" fill="none" />
        </svg>
      </div>

      {/* Top Bar: Ministry Brand & Classification */}
      <div className="space-y-6 relative z-10">
        <div className="flex items-center justify-between border-b pb-4 border-stone-200/20">
          <div className="space-y-1">
            <span className="text-xs font-semibold tracking-[0.25em] uppercase block font-sans">
              KOINONIA CHILDREN &amp; TEENS
            </span>
            <span className={`text-[11px] uppercase tracking-widest block font-sans ${subtitleClass}`}>
              Official Ministry Publication
            </span>
          </div>

          {model.branding?.logoUrl || model.branding?.logoBase64 ? (
            <img 
              src={model.branding.logoUrl || model.branding.logoBase64} 
              alt="Official Logo" 
              className="h-10 w-auto object-contain brightness-95" 
            />
          ) : (
            <div className={`px-3 py-1 border text-xs font-serif tracking-widest uppercase rounded ${lineBorderClass} ${goldAccentClass}`}>
              KOINONIA
            </div>
          )}
        </div>
      </div>

      {/* Center: Major Publication Title & Hierarchy */}
      <div className="my-auto py-12 space-y-8 relative z-10">
        <div className="space-y-3">
          <div className={`w-16 h-0.5 bg-[#C59B27] mb-6`}></div>
          <span className={`text-xs sm:text-sm font-semibold tracking-[0.2em] uppercase block font-sans ${goldAccentClass}`}>
            {event.eventTitle || 'The General Assembly'}
          </span>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-serif font-normal tracking-tight leading-[1.05] max-w-2xl">
            {model.reportTitle.includes('—') ? model.reportTitle.split('—')[1].trim() : model.reportTitle}
          </h1>
          {model.reportDescription && (
            <p className={`text-sm sm:text-base max-w-xl leading-relaxed pt-2 font-sans font-normal ${subtitleClass}`}>
              {model.reportDescription}
            </p>
          )}
        </div>

        {/* Event Theme & Scripture Vignette (Editorial typography) */}
        {(event.theme || event.scripture) && (
          <div className="pt-4 border-t border-stone-200/20 max-w-md space-y-1">
            {event.theme && (
              <p className="text-base sm:text-lg font-serif italic text-zinc-100">
                "{event.theme}"
              </p>
            )}
            {event.scripture && (
              <p className={`text-xs uppercase tracking-widest font-sans font-medium ${goldAccentClass}`}>
                {event.scripture}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bottom Metadata Band: Dates, Prepared info, Confidentiality */}
      <div className="pt-8 border-t border-stone-200/20 grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10 text-xs font-sans">
        <div className="space-y-1">
          <span className={`text-[10px] uppercase tracking-wider block ${metaLabelClass}`}>
            Event Schedule
          </span>
          <span className={`font-medium block ${metaValueClass}`}>
            {dateRangeStr}
          </span>
          {event.venue && (
            <span className={`text-[11px] block truncate ${subtitleClass}`}>
              {event.venue}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <span className={`text-[10px] uppercase tracking-wider block ${metaLabelClass}`}>
            Provenance
          </span>
          <span className={`font-medium block ${metaValueClass}`}>
            Verified event records
          </span>
          <span className={`text-[11px] block ${subtitleClass}`}>
            Compiled {generatedDateStr}
          </span>
        </div>

        <div className="space-y-1 sm:text-right">
          <span className={`text-[10px] uppercase tracking-wider block ${metaLabelClass}`}>
            Classification
          </span>
          <span className={`font-medium block ${goldAccentClass}`}>
            {model.privacyClassification || 'Internal operational'}
          </span>
          <span className={`text-[11px] block ${subtitleClass}`}>
            {model.intendedAudience || 'Ministry Leadership'}
          </span>
        </div>
      </div>
    </div>
  );
};

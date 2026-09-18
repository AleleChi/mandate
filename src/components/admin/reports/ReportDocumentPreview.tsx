import React from 'react';
import { ReportDocumentModel } from '../../../server/reports/reportDocumentModel';
import { ReportCover } from './ReportCover';
import { ReportOpeningSpread } from './ReportOpeningSpread';
import { ReportSectionRenderer } from './ReportSectionRenderer';
import { ReportBackCover } from './ReportBackCover';

interface ReportDocumentPreviewProps {
  model: ReportDocumentModel;
}

export const ReportDocumentPreview: React.FC<ReportDocumentPreviewProps> = ({ model }) => {
  const event = model.eventContext;

  // Render a clean publication footer on content pages
  const renderPublicationFooter = (pageLabel?: string) => (
    <div className="pt-8 mt-12 border-t border-stone-200/80 flex items-center justify-between text-[11px] font-sans text-stone-400">
      <span>KOINONIA CHILDREN &amp; TEENS · {event.eventTitle || 'The General Assembly'}</span>
      <span>{pageLabel || 'Official Publication'}</span>
    </div>
  );

  return (
    <div className="max-w-[880px] mx-auto space-y-12 my-6 font-sans text-stone-900 print:space-y-0 print:my-0">
      {/* PAGE 1: PUBLICATION COVER */}
      <div id="section-cover" data-report-section="cover" className="scroll-mt-6">
        <ReportCover model={model} />
      </div>

      {/* PAGE 2: OPENING SPREAD (Profile, Narrative, Large Data Moments) */}
      <div id="section-kpis" data-report-section="kpis" className="scroll-mt-6">
        <ReportOpeningSpread model={model} />
      </div>

      {/* INTERIOR SECTIONS (Grouped by operational meaning) */}
      {model.sections && model.sections.length > 0 && (
        <div className="bg-[#FAF9F5] p-8 sm:p-14 rounded-xl border border-stone-200/90 shadow-xs space-y-8 print:shadow-none print:rounded-none">
          <div className="border-b border-stone-200 pb-4 flex items-baseline justify-between">
            <h2 className="text-xs font-sans font-semibold uppercase tracking-[0.2em] text-[#C59B27]">
              Detailed Operational Analysis
            </h2>
            <span className="text-[11px] text-stone-400 font-sans">
              Sections &amp; Records
            </span>
          </div>

          <div className="divide-y divide-stone-200/80">
            {model.sections.map((section, idx) => (
              <div
                key={section.id || idx}
                id={`section-${section.id || idx}`}
                data-report-section={section.id || idx}
                className="scroll-mt-6"
              >
                <ReportSectionRenderer section={section} />
              </div>
            ))}
          </div>

          {/* Key Observations & Findings Callout (Section 18: Factual only) */}
          {model.findings && model.findings.length > 0 && (
            <div id="section-findings" data-report-section="findings" className="pt-8 border-t-2 border-stone-800 space-y-4 scroll-mt-6">
              <span className="text-xs font-sans font-semibold uppercase tracking-[0.2em] text-[#C59B27] block">
                Key Operational Observations
              </span>
              <div className="space-y-2">
                {model.findings.map((f, idx) => (
                  <div key={f.id || idx} className="text-sm sm:text-base text-stone-800 flex items-start gap-3">
                    <span className="text-[#C59B27] font-bold mt-0.5">•</span>
                    <span className="leading-relaxed">{f.observation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items Requiring Attention (Clean editorial list, no red badges everywhere) */}
          {model.managementAttention && model.managementAttention.length > 0 && (
            <div id="section-attention" data-report-section="attention" className="pt-8 border-t border-stone-200 space-y-4 scroll-mt-6">
              <span className="text-xs font-sans font-semibold uppercase tracking-[0.2em] text-stone-600 block">
                Administrative Attention Items
              </span>
              <div className="space-y-2">
                {model.managementAttention.map((item, idx) => (
                  <div key={idx} className="text-sm text-stone-700 flex items-start gap-3">
                    <span className="text-stone-400 mt-0.5 font-bold">→</span>
                    <span className="leading-relaxed">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Points / Recommendations */}
          {model.recommendations && model.recommendations.length > 0 && (
            <div id="section-recommendations" data-report-section="recommendations" className="pt-8 border-t border-stone-200 space-y-4 scroll-mt-6">
              <span className="text-xs font-sans font-semibold uppercase tracking-[0.2em] text-stone-600 block">
                Recommended Action Points
              </span>
              <div className="space-y-3">
                {model.recommendations.map((rec, idx) => (
                  <div key={rec.id || idx} className="border-l-2 border-stone-300 pl-4 py-1 space-y-1">
                    <p className="text-sm font-medium text-stone-900">{rec.action}</p>
                    {rec.rationale && (
                      <p className="text-xs text-stone-500 leading-relaxed">{rec.rationale}</p>
                    )}
                    {rec.responsibility && (
                      <span className="text-[11px] text-stone-400 font-sans block">
                        Assigned to: {rec.responsibility}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data Quality & Methodology (Restrained, small footnotes) */}
          {(model.dataQuality || (model.methodology && model.methodology.length > 0)) && (
            <div id="section-quality-methodology" data-report-section="quality" className="pt-8 border-t border-stone-200/80 space-y-2 text-xs text-stone-500 scroll-mt-6">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 block">
                Data Notes &amp; Methodology
              </span>
              {model.dataQuality?.notes && <p className="italic">{model.dataQuality.notes}</p>}
              {model.methodology && model.methodology.length > 0 && (
                <ul className="space-y-1 text-[11px] text-stone-400 pl-4 list-disc">
                  {model.methodology.map((m, idx) => (
                    <li key={idx}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {renderPublicationFooter('Operational Records')}
        </div>
      )}

      {/* FINAL PAGE: BACK COVER */}
      <div id="section-back-cover" data-report-section="back-cover" className="scroll-mt-6">
        <ReportBackCover model={model} />
      </div>
    </div>
  );
};

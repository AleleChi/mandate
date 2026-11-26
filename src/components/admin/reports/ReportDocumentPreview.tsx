import React, { useMemo, useState } from 'react';
import { ReportDocumentModel } from '../../../types/reports';
import { ReportCover } from './ReportCover';
import { ReportOpeningSpread } from './ReportOpeningSpread';
import { ReportSectionRenderer } from './ReportSectionRenderer';
import { ReportBackCover } from './ReportBackCover';

interface ReportDocumentPreviewProps {
  model: ReportDocumentModel;
}

export const ReportDocumentPreview: React.FC<ReportDocumentPreviewProps> = ({ model }) => {
  const event = model.eventContext;
  const [appendixSearch, setAppendixSearch] = useState<string>('');
  const [appendixPage, setAppendixPage] = useState<number>(1);
  const [appendixPageSize, setAppendixPageSize] = useState<number>(50);

  const filteredAppendices = useMemo(() => {
    if (!model.appendix || model.appendix.length === 0) return [];
    const term = appendixSearch.trim().toLowerCase();
    return model.appendix.map((app) => {
      const rows = term
        ? (app.rows || []).filter((r) => r.some((cell) => String(cell || '').toLowerCase().includes(term)))
        : (app.rows || []);
      return { ...app, filteredRows: rows };
    });
  }, [model.appendix, appendixSearch]);

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
          {(model.dataQuality || (model.methodology && model.methodology.length > 0) || (model.limitations && model.limitations.length > 0)) && (
            <div id="section-quality-methodology" data-report-section="quality" className="pt-8 border-t border-stone-200/80 space-y-2 text-xs text-stone-500 scroll-mt-6">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 block">
                Data Notes and Limitations
              </span>
              {model.dataQuality?.notes && <p className="italic">{model.dataQuality.notes}</p>}
              {model.methodology && model.methodology.length > 0 && (
                <ul className="space-y-1 text-[11px] text-stone-400 pl-4 list-disc">
                  {model.methodology.map((m, idx) => (
                    <li key={idx}>{m}</li>
                  ))}
                </ul>
              )}
              {model.limitations && model.limitations.length > 0 && (
                <ul className="space-y-1 text-[11px] text-stone-400 pl-4 list-disc">
                  {model.limitations.map((lim, idx) => (
                    <li key={idx}>{lim}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {renderPublicationFooter('Operational Records')}
        </div>
      )}

      {/* RESTRICTED APPENDIX: DETAILED ATTENDANCE REGISTER */}
      {filteredAppendices.length > 0 && (
        <div
          id="section-appendix"
          data-report-section="appendix"
          className="bg-[#FAF9F5] p-8 sm:p-14 rounded-xl border border-stone-200/90 shadow-xs space-y-8 scroll-mt-6 print:shadow-none print:rounded-none"
        >
          <div className="border-b border-stone-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                Restricted Appendix — Authorised Administrators Only
              </span>
              <h2 className="text-xl font-serif font-medium text-stone-900 mt-1">
                Detailed Child Attendance Register
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <input
                type="text"
                value={appendixSearch}
                onChange={(e) => {
                  setAppendixSearch(e.target.value);
                  setAppendixPage(1);
                }}
                placeholder="Search child, desk, status…"
                className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              />
              <select
                value={appendixPageSize}
                onChange={(e) => {
                  setAppendixPageSize(Number(e.target.value));
                  setAppendixPage(1);
                }}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700"
              >
                <option value={50}>50 rows / page</option>
                <option value={100}>100 rows / page</option>
                <option value={250}>250 rows / page</option>
                <option value={5000}>Show all rows</option>
              </select>
            </div>
          </div>

          {filteredAppendices.map((app, appIdx) => {
            const totalRows = app.filteredRows.length;
            const totalPages = Math.max(1, Math.ceil(totalRows / appendixPageSize));
            const safePage = Math.min(appendixPage, totalPages);
            const startIdx = (safePage - 1) * appendixPageSize;
            const pageRows = app.filteredRows.slice(startIdx, startIdx + appendixPageSize);

            return (
              <div key={appIdx} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                  <span className="font-medium text-stone-800">{app.title}</span>
                  <span>
                    Showing {totalRows === 0 ? 0 : startIdx + 1}–{Math.min(startIdx + pageRows.length, totalRows)} of {totalRows.toLocaleString()} records
                  </span>
                </div>

                <div className="overflow-x-auto border border-stone-200/80 rounded-lg bg-white">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-stone-800 bg-stone-50 text-stone-900">
                        {app.headers.map((h, hIdx) => (
                          <th key={hIdx} className="py-2.5 px-2.5 font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200/70 text-stone-700">
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={app.headers.length} className="py-8 text-center text-stone-400">
                            No matching child entries in appendix.
                          </td>
                        </tr>
                      ) : (
                        pageRows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-stone-50/70">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="py-2 px-2.5 whitespace-nowrap">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between text-xs text-stone-600 pt-2 print:hidden">
                    <span>
                      Page {safePage} of {totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setAppendixPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1 rounded border border-stone-200 bg-white disabled:opacity-40 hover:bg-stone-50 cursor-pointer"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setAppendixPage((p) => Math.min(totalPages, p + 1))}
                        className="px-3 py-1 rounded border border-stone-200 bg-white disabled:opacity-40 hover:bg-stone-50 cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {renderPublicationFooter('Restricted Appendix')}
        </div>
      )}

      {/* FINAL PAGE: BACK COVER */}
      <div id="section-back-cover" data-report-section="back-cover" className="scroll-mt-6">
        <ReportBackCover model={model} />
      </div>
    </div>
  );
};

import React from 'react';
import { ReportDocumentModel } from '../../../server/reports/reportDocumentModel';
import { ReportSectionRenderer } from './ReportSectionRenderer';

interface ReportDocumentPreviewProps {
  model: ReportDocumentModel;
}

export const ReportDocumentPreview: React.FC<ReportDocumentPreviewProps> = ({ model }) => {
  const getKpiColor = (color: string) => {
    switch (color) {
      case 'gold': return 'border-[#C59B27] bg-[#FAF9F6]';
      case 'green': return 'border-emerald-600 bg-emerald-50/30';
      case 'amber': return 'border-amber-500 bg-amber-50/30';
      case 'red': return 'border-red-600 bg-red-50/30';
      default: return 'border-stone-800 bg-stone-50';
    }
  };

  return (
    <div className="max-w-[840px] mx-auto bg-white text-stone-900 font-sans shadow-md border border-stone-200 rounded-xl p-8 sm:p-12 space-y-8 my-4 print:shadow-none print:border-none print:p-0">
      {/* Cover/Document Header */}
      <div className="border-b-2 border-[#C59B27] pb-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-widest uppercase text-[#C59B27]">
                {model.branding?.organizationName || 'Koinonia Global'} · Official Report
              </span>
              <span className="text-[10px] font-medium bg-stone-100 text-stone-600 px-2.5 py-0.5 rounded-full border border-stone-200">
                Prepared for ministry leadership
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-serif font-medium text-stone-900 tracking-tight leading-tight">
              {model.reportTitle}
            </h1>

            <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-stone-600 font-normal pt-1">
              <span className="font-semibold text-stone-900">{model.eventContext?.eventTitle || 'The General Assembly'}</span>
              <span>·</span>
              <span>Period: {new Date(model.reportingPeriod?.start || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span>·</span>
              <span>Cutoff: {new Date(model.informationConfirmedUpTo || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>

          {/* Right Logo */}
          {(model.branding?.logoUrl || model.branding?.logoBase64) ? (
            <div className="shrink-0 flex items-center justify-end pl-2">
              <img 
                src={model.branding.logoUrl || model.branding.logoBase64} 
                alt="Official Koinonia Logo" 
                className="h-12 w-auto max-w-[160px] sm:max-w-[200px] object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="shrink-0 flex items-center justify-end pl-2">
              <div className="flex items-center gap-2 bg-[#FAF9F6] border border-[#C59B27]/30 px-3 py-1.5 rounded-lg">
                <div className="w-6 h-6 rounded bg-[#C59B27] text-white font-serif font-bold text-xs flex items-center justify-center">K</div>
                <span className="font-serif font-bold text-[#18181B] tracking-wider text-xs uppercase">KOINONIA</span>
              </div>
            </div>
          )}
        </div>

        {model.reportDescription && (
          <p className="text-xs text-stone-600 leading-relaxed pt-1 italic border-t border-stone-100 mt-2">
            {model.reportDescription}
          </p>
        )}
      </div>

      {/* KPI Cards */}
      {model.kpis && model.kpis.length > 0 && (
        <div id="section-kpis" data-report-section="kpis" className="space-y-3 scroll-mt-6">
          <h2 className="text-xs font-serif font-semibold text-stone-500 uppercase tracking-wider">
            Key attendance figures
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {model.kpis.map((kpi, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border-l-4 border border-stone-200/80 shadow-2xs space-y-1 ${getKpiColor(kpi.color)}`}
              >
                <span className="text-[11px] font-medium text-stone-600 block truncate">{kpi.label}</span>
                <span className="text-xl sm:text-2xl font-serif font-bold text-stone-900 block tracking-tight">
                  {kpi.value}
                </span>
                <span className="text-[10px] text-stone-500 block leading-tight">{kpi.sublabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Sections */}
      {model.sections && model.sections.length > 0 && (
        <div className="space-y-6">
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
      )}

      {/* Key Findings */}
      {model.findings && model.findings.length > 0 && (
        <div id="section-findings" data-report-section="findings" className="bg-stone-50/80 border border-stone-200 rounded-xl p-5 space-y-3 scroll-mt-6">
          <h2 className="text-xs font-serif font-semibold text-stone-900 uppercase tracking-wider border-b border-stone-200 pb-2">
            Key findings
          </h2>
          <div className="space-y-3">
            {model.findings.map((f, idx) => (
              <div key={f.id || idx} className="bg-white p-3.5 rounded-lg border border-stone-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-900">{f.title}</span>
                  {f.severity && f.severity !== 'info' && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                      f.severity === 'warning' || f.severity === 'critical' || f.severity === 'attention' || f.severity === 'follow-up required'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-stone-100 text-stone-700'
                    }`}>
                      {f.severity}
                    </span>
                  )}
                </div>
                <p className="text-stone-700 leading-relaxed">{f.observation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      {model.recommendations && model.recommendations.length > 0 && (
        <div id="section-recommendations" data-report-section="recommendations" className="bg-stone-50/80 border border-stone-200 rounded-xl p-5 space-y-3 scroll-mt-6">
          <h2 className="text-xs font-serif font-semibold text-stone-900 uppercase tracking-wider border-b border-stone-200 pb-2">
            Recommended actions
          </h2>
          <div className="space-y-3">
            {model.recommendations.map((r, idx) => (
              <div key={r.id || idx} className="bg-white p-3.5 rounded-lg border border-stone-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">{r.action}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                    r.priority === 'high' ? 'bg-red-100 text-red-800' : 'bg-stone-100 text-stone-700'
                  }`}>
                    {r.priority} Priority
                  </span>
                </div>
                {r.evidence && (
                  <p className="text-stone-600 leading-relaxed"><strong className="text-stone-700">Evidence:</strong> {r.evidence}</p>
                )}
                <p className="text-stone-600 leading-relaxed"><strong className="text-stone-700">Rationale:</strong> {r.rationale}</p>
                {r.responsibility && (
                  <p className="text-[11px] text-stone-500 font-medium">Assigned to: {r.responsibility}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Information Quality & Methodology */}
      <div id="section-quality-methodology" data-report-section="quality-methodology" className="border-t border-stone-200 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] text-stone-600 scroll-mt-6">
        <div className="space-y-2">
          <h3 className="font-serif font-semibold text-stone-900 uppercase text-[10px] tracking-wider">
            Information quality
          </h3>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-800">Quality Status:</span>
            <span className="bg-stone-100 px-2 py-0.5 rounded text-stone-800 font-medium">
              {model.dataQuality?.status || 'High confidence'} (Quality score: {model.dataQuality?.score || 100}%)
            </span>
          </div>
          {model.dataQuality?.notes && (
            <p className="text-stone-500 italic leading-relaxed">{model.dataQuality.notes}</p>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-serif font-semibold text-stone-900 uppercase text-[10px] tracking-wider">
            Methodology and limitations
          </h3>
          {model.methodology && model.methodology.length > 0 && (
            <ul className="list-disc list-inside space-y-0.5 text-stone-500">
              {model.methodology.map((m, idx) => (
                <li key={idx}>{m}</li>
              ))}
            </ul>
          )}
          {model.limitations && model.limitations.length > 0 && (
            <p className="text-stone-500 italic mt-1 leading-relaxed">
              Note: {model.limitations.join(' ')}
            </p>
          )}
        </div>
      </div>

      {/* Document Footer */}
      <div className="border-t border-stone-100 pt-4 flex justify-between items-center text-[10px] text-stone-400 font-mono">
        <span>Report ID: {model.reportId}</span>
        <span>Koinonia Children & Teens Safeguarding System</span>
      </div>
    </div>
  );
};


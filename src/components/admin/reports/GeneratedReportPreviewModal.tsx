import React, { useEffect, useState, useRef, useMemo } from 'react';
import { X, Download, FileText, ZoomIn, ZoomOut, AlertCircle, ChevronDown } from 'lucide-react';
import { ReportDocumentModel } from '../../../server/reports/reportDocumentModel';
import { ReportDocumentPreview } from './ReportDocumentPreview';
import { ReportPreviewSkeleton } from './ReportPreviewSkeleton';
import { api } from '../../../services/api';

interface GeneratedReportPreviewModalProps {
  reportId: string | null;
  reportTitle?: string;
  eventTitle?: string;
  onClose: () => void;
  onDownloadPdf?: (reportId: string) => void;
}

interface OutlineItem {
  id: string;
  title: string;
}

export const GeneratedReportPreviewModal: React.FC<GeneratedReportPreviewModalProps> = ({
  reportId,
  reportTitle,
  eventTitle,
  onClose,
  onDownloadPdf,
}) => {
  const [model, setModel] = useState<ReportDocumentModel | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [activeOutlineSection, setActiveOutlineSection] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reportId) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setModel(null);

    const fetchPreview = async () => {
      try {
        const response = await api.request<{
          success: boolean;
          report: any;
          documentModel: ReportDocumentModel;
        }>(`/api/admin/reports/${reportId}/preview`, { signal: controller.signal });

        if (
          response &&
          response.success === true &&
          response.documentModel &&
          (response.report?.status === 'ready' || response.report?.status === 'completed' || !response.report?.status)
        ) {
          setModel(response.documentModel);
        } else {
          setError('We could not open this report preview.');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Report preview fetch error:', err);
          setError('We could not open this report preview.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();

    return () => {
      controller.abort();
    };
  }, [reportId]);

  // Construct report outline dynamically from documentModel
  const outlineItems = useMemo<OutlineItem[]>(() => {
    if (!model) return [];
    const rawItems: OutlineItem[] = [];

    if (model.kpis && model.kpis.length > 0) {
      rawItems.push({ id: 'section-kpis', title: 'Key attendance figures' });
    }

    if (model.sections && model.sections.length > 0) {
      model.sections.forEach((sec, idx) => {
        rawItems.push({
          id: `section-${sec.id || idx}`,
          title: sec.title
        });
      });
    }

    if (model.findings && model.findings.length > 0) {
      rawItems.push({ id: 'section-findings', title: 'Key findings' });
    }

    if (model.recommendations && model.recommendations.length > 0) {
      rawItems.push({ id: 'section-recommendations', title: 'Recommended actions' });
    }

    if (
      model.dataQuality ||
      (model.methodology && model.methodology.length > 0) ||
      (model.limitations && model.limitations.length > 0)
    ) {
      rawItems.push({ id: 'section-quality-methodology', title: 'Information quality and limitations' });
    }

    // Deduplicate outline items by normalised title
    const seenTitles = new Set<string>();
    const items: OutlineItem[] = [];
    rawItems.forEach(item => {
      const key = item.title.toLowerCase().trim();
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        items.push(item);
      }
    });

    return items;
  }, [model]);

  // Set initial active outline item
  useEffect(() => {
    if (outlineItems.length > 0 && !activeOutlineSection) {
      setActiveOutlineSection(outlineItems[0].id);
    }
  }, [outlineItems, activeOutlineSection]);

  // Observe active sections on scroll using IntersectionObserver
  useEffect(() => {
    if (!model || !scrollContainerRef.current || outlineItems.length === 0) return;

    const container = scrollContainerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveOutlineSection(entry.target.id);
            break;
          }
        }
      },
      {
        root: container,
        rootMargin: '-10% 0px -65% 0px',
        threshold: 0.1
      }
    );

    outlineItems.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [model, outlineItems]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOutlineClick = (id: string) => {
    setActiveOutlineSection(id);
    setMobileMenuOpen(false);
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!reportId) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      <div
        ref={modalRef}
        data-preview-build="report-preview-v3-sequenced"
        data-component-version="generated-report-preview-v3-dynamic"
        className="bg-[#FAF9F6] border border-[#C59B27]/30 rounded-[24px] shadow-2xl w-full max-w-[1240px] max-h-[92dvh] flex flex-col overflow-hidden text-stone-900"
      >
        {/* Header Bar */}
        <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#FAF9F6] border border-[#C59B27]/30 flex items-center justify-center text-[#C59B27] shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="preview-modal-title" className="text-base font-serif font-medium text-stone-900 truncate">
                {model?.reportTitle || reportTitle || 'Generated Report Preview'}
              </h2>
              <p className="text-xs text-stone-500 truncate">
                {model?.eventContext?.eventTitle || eventTitle || 'Event Report'} · Generated report
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {onDownloadPdf && (
              <button
                onClick={() => onDownloadPdf(reportId)}
                className="bg-[#C59B27] hover:bg-[#b08920] text-white text-xs font-semibold py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Close Preview Dialog"
              className="w-9 h-9 flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Page Navigation */}
        <div className="bg-stone-50 border-b border-stone-200 px-6 py-2 flex flex-wrap items-center justify-between text-xs text-stone-600 gap-2 shrink-0">
          <div className="flex items-center gap-4">
            <span className="font-medium text-stone-800">
              {model?.privacyClassification || 'Internal operational'}
            </span>
            <span className="text-stone-300">•</span>
            <span>Version {model?.reportVersion || 1}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-0.5">
              <button
                onClick={() => setZoom(z => Math.max(z - 10, 70))}
                className="p-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono px-1.5 min-w-[3rem] text-center">{zoom}%</span>
              <button
                onClick={() => setZoom(z => Math.min(z + 10, 140))}
                className="p-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Report Contents Dropdown */}
        {outlineItems.length > 0 && (
          <div className="md:hidden bg-white border-b border-stone-200 px-4 py-2 shrink-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-full flex items-center justify-between text-xs font-medium text-stone-700 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-left"
            >
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-[10px] uppercase font-semibold text-stone-400 tracking-wider">Report contents</span>
                <span className="truncate text-xs font-medium text-stone-800">
                  {outlineItems.find(i => i.id === activeOutlineSection)?.title || 'Select section'}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-stone-400 shrink-0 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {mobileMenuOpen && (
              <div className="mt-2 space-y-1 bg-white border border-stone-200 rounded-lg p-2 max-h-48 overflow-y-auto">
                {outlineItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleOutlineClick(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                      activeOutlineSection === item.id
                        ? 'bg-[#C59B27]/10 text-[#8C6D23] font-semibold border-l-2 border-[#C59B27]'
                        : 'text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal Main Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Dynamic Outline Sidebar (Desktop) */}
          {outlineItems.length > 0 && (
            <div className="hidden md:block w-60 border-r border-stone-200 bg-[#FAF9F6] p-4 overflow-y-auto shrink-0 space-y-3">
              <h3 className="text-[12px] font-medium tracking-[0.04em] text-stone-500 uppercase">
                Report contents
              </h3>
              <nav className="space-y-1">
                {outlineItems.map((item) => {
                  const isActive = activeOutlineSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleOutlineClick(item.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-[14px] leading-5 font-normal transition-colors break-words ${
                        isActive
                          ? 'bg-[#C59B27]/10 text-[#8C6D23] font-medium border-l-2 border-[#C59B27]'
                          : 'text-stone-600 hover:bg-stone-100/80 hover:text-stone-900'
                      }`}
                    >
                      {item.title}
                    </button>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Report Viewer Area */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-stone-100/70 p-4 sm:p-8 flex justify-center">
            <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }} className="transition-transform duration-150 w-full">
              {loading && <ReportPreviewSkeleton />}

              {error && (
                <div className="max-w-md mx-auto my-12 bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
                  <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-serif font-semibold text-stone-900">Preview Unavailable</h3>
                    <p className="text-xs text-stone-500 mt-1 leading-relaxed">{error}</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="bg-stone-900 hover:bg-black text-white text-xs font-semibold py-2 px-5 rounded-xl transition-all"
                  >
                    Close Preview
                  </button>
                </div>
              )}

              {model && !loading && !error && (
                <ReportDocumentPreview model={model} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


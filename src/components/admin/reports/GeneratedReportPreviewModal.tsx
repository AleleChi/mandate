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
  onRegenerate?: (reportId: string) => void;
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
  const [activeOutlineSection, setActiveOutlineSection] = useState<string>('section-cover');
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

    rawItems.push({ id: 'section-cover', title: 'Cover' });
    rawItems.push({ id: 'section-kpis', title: 'Event overview' });

    if (model.sections && model.sections.length > 0) {
      model.sections.forEach((sec, idx) => {
        const lower = sec.title.toLowerCase();
        if (lower.includes('executive summary') || lower.includes('event summary') || lower.includes('what this report shows')) {
          return; // Already represented by Event overview
        }
        rawItems.push({
          id: `section-${sec.id || idx}`,
          title: sec.title
        });
      });
    }

    if (model.findings && model.findings.length > 0) {
      rawItems.push({ id: 'section-findings', title: 'Key observations' });
    }

    if (model.managementAttention && model.managementAttention.length > 0) {
      rawItems.push({ id: 'section-attention', title: 'Items requiring attention' });
    }

    if (model.recommendations && model.recommendations.length > 0) {
      rawItems.push({ id: 'section-recommendations', title: 'Action points' });
    }

    if (
      model.dataQuality ||
      (model.methodology && model.methodology.length > 0) ||
      (model.limitations && model.limitations.length > 0)
    ) {
      rawItems.push({ id: 'section-quality-methodology', title: 'Data notes and limitations' });
    }

    rawItems.push({ id: 'section-back-cover', title: 'Back cover' });

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
      className="fixed inset-0 z-50 bg-stone-900/60 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      <div
        ref={modalRef}
        data-preview-build="report-preview-v5-premium-canonical"
        data-component-version="generated-report-preview-v5-editorial"
        className="bg-[#FAF9F6] dark:bg-[#1D1D1A] border border-[#C59B27]/30 dark:border-[#302E29] rounded-[24px] shadow-2xl w-full max-w-[1240px] max-h-[92dvh] flex flex-col overflow-hidden text-stone-900 dark:text-[#F0EBE3]"
      >
        {/* Header Bar */}
        <div className="bg-white dark:bg-[#21211E] border-b border-stone-200 dark:border-[#302E29] px-6 py-4 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#FAF9F6] dark:bg-[#262520] border border-[#C59B27]/30 dark:border-amber-900/50 flex items-center justify-center text-[#C59B27] dark:text-amber-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="preview-modal-title" className="text-base font-serif font-medium text-stone-900 dark:text-[#F0EBE3] truncate">
                {model?.reportTitle || reportTitle || 'Official Report'}
              </h2>
              <p className="text-xs text-stone-500 dark:text-[#7A7570] truncate">
                {model?.eventContext?.eventTitle || eventTitle || 'The General Assembly'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {onDownloadPdf && (
              <button
                onClick={() => onDownloadPdf(reportId)}
                className="bg-[#C59B27] hover:bg-[#b08920] text-white text-xs font-semibold py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-xs cursor-pointer"
                title="Download report PDF"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Close Preview Dialog"
              className="w-9 h-9 flex items-center justify-center text-stone-400 dark:text-[#7A7570] hover:text-stone-700 dark:hover:text-[#F0EBE3] hover:bg-stone-100 dark:hover:bg-[#262520] rounded-full transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar with Zoom Controls (Technical metadata removed) */}
        <div className="bg-stone-50 dark:bg-[#1D1D1A] border-b border-stone-200 dark:border-[#302E29] px-6 py-2 flex flex-wrap items-center justify-between text-xs text-stone-600 dark:text-[#B8B0A5] gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-600 dark:text-[#B8B0A5]">Document view</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-white dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg p-0.5">
              <button
                onClick={() => setZoom(z => Math.max(z - 10, 70))}
                className="p-1 text-stone-500 dark:text-[#7A7570] hover:text-stone-900 dark:hover:text-[#F0EBE3] hover:bg-stone-100 dark:hover:bg-[#2A2926] rounded cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono px-1.5 min-w-[3rem] text-center text-stone-700 dark:text-[#F0EBE3]">{zoom}%</span>
              <button
                onClick={() => setZoom(z => Math.min(z + 10, 140))}
                className="p-1 text-stone-500 dark:text-[#7A7570] hover:text-stone-900 dark:hover:text-[#F0EBE3] hover:bg-stone-100 dark:hover:bg-[#2A2926] rounded cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Report Contents Dropdown */}
        {outlineItems.length > 0 && (
          <div className="md:hidden bg-white dark:bg-[#21211E] border-b border-stone-200 dark:border-[#302E29] px-4 py-2 shrink-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-full flex items-center justify-between text-xs font-medium text-stone-700 dark:text-[#F0EBE3] bg-stone-50 dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg px-3 py-2 text-left"
            >
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-[10px] uppercase font-semibold text-stone-400 dark:text-[#7A7570] tracking-wider">Report contents</span>
                <span className="truncate text-xs font-medium text-stone-800 dark:text-[#F0EBE3]">
                  {outlineItems.find(i => i.id === activeOutlineSection)?.title || 'Select section'}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-stone-400 dark:text-[#7A7570] shrink-0 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {mobileMenuOpen && (
              <div className="mt-2 space-y-1 bg-white dark:bg-[#21211E] border border-stone-200 dark:border-[#302E29] rounded-lg p-2 max-h-48 overflow-y-auto">
                {outlineItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleOutlineClick(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                      activeOutlineSection === item.id
                        ? 'bg-[#C59B27]/10 dark:bg-amber-950/30 text-[#8C6D23] dark:text-amber-400 font-semibold border-l-2 border-[#C59B27] dark:border-amber-400'
                        : 'text-stone-600 dark:text-[#B8B0A5] hover:bg-stone-50 dark:hover:bg-[#262520]'
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
            <div className="hidden md:block w-60 border-r border-stone-200 dark:border-[#302E29] bg-[#FAF9F6] dark:bg-[#21211E] p-4 overflow-y-auto shrink-0 space-y-3">
              <h3 className="text-[12px] font-medium tracking-[0.04em] text-stone-500 dark:text-[#7A7570] uppercase">
                Report contents
              </h3>
              <nav className="space-y-1">
                {outlineItems.map((item) => {
                  const isActive = activeOutlineSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleOutlineClick(item.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-[14px] leading-5 font-normal transition-colors break-words cursor-pointer ${
                        isActive
                          ? 'bg-[#C59B27]/10 dark:bg-amber-950/30 text-[#8C6D23] dark:text-amber-400 font-medium border-l-2 border-[#C59B27] dark:border-amber-400'
                          : 'text-stone-600 dark:text-[#B8B0A5] hover:bg-stone-100/80 dark:hover:bg-[#262520] hover:text-stone-900 dark:hover:text-[#F0EBE3]'
                      }`}
                    >
                      {item.title}
                    </button>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Premium React Editorial Document Viewer Area - Dark frame around light document */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-stone-100/70 dark:bg-[#141413] p-4 sm:p-8 flex justify-center">
            <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }} className="transition-transform duration-150 w-full">
              {loading && <ReportPreviewSkeleton />}

              {error && (
                <div className="max-w-md mx-auto my-12 bg-white dark:bg-[#21211E] border border-stone-200 dark:border-[#302E29] rounded-2xl p-8 text-center space-y-4 shadow-sm">
                  <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-serif font-semibold text-stone-900 dark:text-[#F0EBE3]">Preview Unavailable</h3>
                    <p className="text-xs text-stone-500 dark:text-[#7A7570] mt-1 leading-relaxed">{error}</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="bg-stone-900 hover:bg-black dark:bg-[#262520] dark:hover:bg-[#2A2926] text-white dark:text-[#F0EBE3] border dark:border-[#3A3835] text-xs font-semibold py-2 px-5 rounded-xl transition-all cursor-pointer"
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

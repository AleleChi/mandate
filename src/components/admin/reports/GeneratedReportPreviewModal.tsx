import React, { useEffect, useState, useRef, useMemo } from 'react';
import { X, Download, FileText, ZoomIn, ZoomOut, AlertCircle, ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { ReportDocumentModel } from '../../../server/reports/reportDocumentModel';
import { ReportPreviewSkeleton } from './ReportPreviewSkeleton';
import { api } from '../../../services/api';
import { buildApiUrl } from '../../../utils/urlHelper';

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
  onRegenerate,
}) => {
  const [model, setModel] = useState<ReportDocumentModel | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [activeOutlineSection, setActiveOutlineSection] = useState<string>('section-cover');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reportId) return;

    let activeBlobUrl: string | null = null;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setIsExpired(false);
    setModel(null);
    setPdfBlobUrl(null);
    setCurrentPage(1);

    const loadArtifactAndMetadata = async () => {
      try {
        const token = api.getToken();
        if (!token) {
          setError('You are currently logged out.');
          setLoading(false);
          return;
        }

        // 1. Fetch metadata & document model
        const previewPromise = api.request<{
          success: boolean;
          report: any;
          documentModel: ReportDocumentModel;
          sectionPageMap?: Record<string, number>;
        }>(`/api/admin/reports/${reportId}/preview`, { signal: controller.signal });

        // 2. Fetch the exact canonical generated PDF artifact
        const downloadEndpoint = buildApiUrl(`/api/admin/reports/${reportId}/download?inline=true`);
        const downloadPromise = fetch(downloadEndpoint, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          signal: controller.signal
        });

        const [previewResponse, downloadResponse] = await Promise.all([previewPromise, downloadPromise]);

        // Check if download has expired
        if (downloadResponse.status === 410) {
          setIsExpired(true);
          setError('This report copy is no longer available.');
          setLoading(false);
          return;
        }

        if (!downloadResponse.ok) {
          let isExp = false;
          try {
            const errData = await downloadResponse.json();
            if (errData?.code === 'DOWNLOAD_EXPIRED' || errData?.error?.includes('expired')) {
              isExp = true;
            }
          } catch (_) {}

          if (isExp) {
            setIsExpired(true);
            setError('This report copy is no longer available.');
          } else {
            setError('We could not open this report document.');
          }
          setLoading(false);
          return;
        }

        // Create memory Object URL for the exact PDF bytes
        const blob = await downloadResponse.blob();
        activeBlobUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(activeBlobUrl);

        // Resolve filename from Content-Disposition header
        const disp = downloadResponse.headers.get('content-disposition');
        if (disp && disp.includes('filename=')) {
          const match = disp.match(/filename="?([^";]+)"?/);
          if (match && match[1]) {
            setDownloadFilename(match[1]);
          }
        }

        // Apply document model
        if (previewResponse?.success && previewResponse?.documentModel) {
          const docModel = previewResponse.documentModel;
          if (previewResponse.sectionPageMap && !docModel.sectionPageMap) {
            docModel.sectionPageMap = previewResponse.sectionPageMap;
          }
          setModel(docModel);

          // Determine total pages from sectionPageMap or back-cover
          const backPage = docModel.sectionPageMap?.['section-back-cover'] || docModel.sectionPageMap?.['back-cover'];
          if (backPage && typeof backPage === 'number') {
            setTotalPages(backPage);
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Report artifact loading error:', err);
          setError('We could not open this report document.');
        }
      } finally {
        setLoading(false);
      }
    };

    loadArtifactAndMetadata();

    return () => {
      controller.abort();
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
      }
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

  // Sync active outline item with current page
  useEffect(() => {
    if (!model?.sectionPageMap || outlineItems.length === 0) return;
    const pageMap = model.sectionPageMap;

    let matchedId = outlineItems[0]?.id || 'section-cover';
    for (const item of outlineItems) {
      const page = pageMap[item.id] || pageMap[item.id.replace('section-', '')];
      if (page && page <= currentPage) {
        matchedId = item.id;
      }
    }
    setActiveOutlineSection(matchedId);
  }, [currentPage, model, outlineItems]);

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
    const pageMap = model?.sectionPageMap || {};
    const targetPage = pageMap[id] || pageMap[id.replace('section-', '')] || 1;
    setCurrentPage(targetPage);
  };

  const handlePrevPage = () => {
    setCurrentPage(p => Math.max(1, p - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(p => Math.min(totalPages, p + 1));
  };

  const handleDownloadExactArtifact = () => {
    if (pdfBlobUrl) {
      const a = document.createElement('a');
      a.href = pdfBlobUrl;
      a.download = downloadFilename || `${model?.reportTitle || reportTitle || 'Report'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (onDownloadPdf && reportId) {
      onDownloadPdf(reportId);
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
        data-preview-build="report-preview-v4-canonical-artifact"
        data-component-version="generated-report-pdf-viewer"
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
                {model?.reportTitle || reportTitle || 'Official Report'}
              </h2>
              <p className="text-xs text-stone-500 truncate">
                {model?.eventContext?.eventTitle || eventTitle || 'Event Report'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleDownloadExactArtifact}
              className="bg-[#C59B27] hover:bg-[#b08920] text-white text-xs font-semibold py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              title="Download exact PDF document"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>

            <button
              onClick={onClose}
              aria-label="Close Preview Dialog"
              className="w-9 h-9 flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-all cursor-pointer"
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
          </div>

          {/* Page Indicator & Next/Prev Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                disabled={currentPage <= 1}
                className="p-1 text-stone-500 hover:text-stone-900 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-stone-700 tabular-nums">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={handleNextPage}
                disabled={currentPage >= totalPages}
                className="p-1 text-stone-500 hover:text-stone-900 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-0.5">
              <button
                onClick={() => setZoom(z => Math.max(z - 10, 70))}
                className="p-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono px-1.5 min-w-[3rem] text-center">{zoom}%</span>
              <button
                onClick={() => setZoom(z => Math.min(z + 10, 140))}
                className="p-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded cursor-pointer"
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
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-[14px] leading-5 font-normal transition-colors break-words cursor-pointer ${
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

          {/* Canonical Document Artifact Viewer Area */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-[#E5E4E2]/50 p-4 sm:p-6 flex flex-col items-center justify-start min-h-0">
            {loading && <ReportPreviewSkeleton />}

            {isExpired && (
              <div className="max-w-md mx-auto my-16 bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-[#C59B27] flex items-center justify-center mx-auto">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-serif font-semibold text-stone-900">Report Unavailable</h3>
                  <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                    This report copy is no longer available.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    if (onRegenerate && reportId) {
                      onRegenerate(reportId);
                    }
                  }}
                  className="bg-[#C59B27] hover:bg-[#b08920] text-white text-xs font-semibold py-2.5 px-5 rounded-xl transition-all inline-flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Regenerate report →</span>
                </button>
              </div>
            )}

            {error && !isExpired && (
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
                  className="bg-stone-900 hover:bg-black text-white text-xs font-semibold py-2 px-5 rounded-xl transition-all cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            )}

            {pdfBlobUrl && !loading && !error && (
              <div
                style={{
                  width: `${Math.min(zoom, 140)}%`,
                  maxWidth: `${Math.round(960 * (zoom / 100))}px`,
                  transition: 'width 0.15s ease-out, max-width 0.15s ease-out'
                }}
                className="w-full flex-1 flex flex-col items-center justify-center shadow-xl rounded-xl overflow-hidden border border-stone-300 bg-white"
              >
                <iframe
                  key={`${pdfBlobUrl}#page=${currentPage}`}
                  src={`${pdfBlobUrl}#page=${currentPage}&zoom=${zoom}&toolbar=0&navpanes=0`}
                  className="w-full h-[820px] border-0 rounded-xl bg-white"
                  title={model?.reportTitle || reportTitle || 'Official Report PDF'}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

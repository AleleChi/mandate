import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  PackageCheck,
  Plus,
  Search,
  Upload,
  Printer,
  QrCode,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Tag,
  ArrowRight,
  Check,
  Layers,
  ArrowLeft,
  ChevronDown
} from 'lucide-react';
import { api } from '../../services/api';

interface WristbandInventoryWorkspaceProps {
  eventId?: string;
  adminUser?: any;
  onNavigate?: (route: any) => void;
  onSwitchToDesk?: () => void;
}

interface InventorySummary {
  total: number;
  prepared: number;
  available: number;
  active: number;
  lost: number;
  damaged: number;
  decommissioned: number;
}

interface WristbandItem {
  id: string;
  eventId: string;
  wristbandCode: string;
  nfcUid: string;
  status: 'prepared' | 'available' | 'active' | 'lost' | 'damaged' | 'decommissioned';
  createdAt: string;
  updatedAt: string;
  assignmentState: 'unassigned' | 'active';
  assignedChild?: {
    childEventEntryId: string;
    childName: string;
  } | null;
}

interface PrintItem {
  id: string;
  wristbandCode: string;
  qrValue: string;
  eventName: string;
  status: string;
  sequenceIndex?: number;
  totalInBatch?: number;
  qrDataUrl?: string;
}

export const WristbandInventoryWorkspace: React.FC<WristbandInventoryWorkspaceProps> = ({
  eventId: propEventId,
  adminUser,
  onNavigate,
  onSwitchToDesk
}) => {
  // Current Event Resolution
  const [resolvedEventId, setResolvedEventId] = useState<string>(propEventId || '');
  const [eventName, setEventName] = useState<string>('TGA 2026');

  // Inventory Table States
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<InventorySummary>({
    total: 0,
    prepared: 0,
    available: 0,
    active: 0,
    lost: 0,
    damaged: 0,
    decommissioned: 0
  });
  const [wristbands, setWristbands] = useState<WristbandItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(50);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Actions Dropdown Menu
  const [showPrepareMenu, setShowPrepareMenu] = useState<boolean>(false);
  const prepareMenuRef = useRef<HTMLDivElement>(null);

  // Workspace Modals / Views
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  // High-Speed Preparation States (Phase 4B1)
  const [showPrepareModal, setShowPrepareModal] = useState<boolean>(false);
  const [prepareUid, setPrepareUid] = useState<string>('');
  const [prepareLoading, setPrepareLoading] = useState<boolean>(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [lastPrepared, setLastPrepared] = useState<{
    wristbandCode: string;
    nfcUid: string;
    eventName: string;
    qrDataUrl?: string;
  } | null>(null);
  const [recentPrepared, setRecentPrepared] = useState<Array<{
    wristbandCode: string;
    nfcUid: string;
    time: string;
  }>>([]);
  const prepareInputRef = useRef<HTMLInputElement>(null);

  // Physical Verification States (Phase 4B1)
  const [showVerifyPhysicalModal, setShowVerifyPhysicalModal] = useState<boolean>(false);
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [verifyNfcUid, setVerifyNfcUid] = useState<string>('');
  const [verifyPhysicalLoading, setVerifyPhysicalLoading] = useState<boolean>(false);
  const [verifyPhysicalError, setVerifyPhysicalError] = useState<string | null>(null);
  const [verifyPhysicalSuccess, setVerifyPhysicalSuccess] = useState<{
    wristbandCode: string;
    nfcUid: string;
    message: string;
  } | null>(null);
  const verifyCodeInputRef = useRef<HTMLInputElement>(null);
  const verifyNfcInputRef = useRef<HTMLInputElement>(null);

  // Bulk Import States
  const [importCsvText, setImportCsvText] = useState<string>('');
  const [importPreviewLoading, setImportPreviewLoading] = useState<boolean>(false);
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [importExecuteLoading, setImportExecuteLoading] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [skipImportErrors, setSkipImportErrors] = useState<boolean>(true);

  // Print Batch States
  const [printMode, setPrintMode] = useState<'selected' | 'page' | 'all_prepared' | 'range'>('all_prepared');
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const [printItems, setPrintItems] = useState<PrintItem[]>([]);
  const [printLoading, setPrintLoading] = useState<boolean>(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [batchSummary, setBatchSummary] = useState<{
    totalCount: number;
    firstCode: string | null;
    lastCode: string | null;
    eventName: string;
  } | null>(null);
  const [isPrintPreviewActive, setIsPrintPreviewActive] = useState<boolean>(false);

  // Close prepare menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (prepareMenuRef.current && !prepareMenuRef.current.contains(event.target as Node)) {
        setShowPrepareMenu(false);
      }
    };
    if (showPrepareMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPrepareMenu]);

  // Initialize event ID if not passed via props
  useEffect(() => {
    if (!resolvedEventId) {
      api.admin.getEvents()
        .then((res: any) => {
          if (res?.success && Array.isArray(res.events)) {
            const current = res.events.find((e: any) => e.status === 'current') || res.events[0];
            if (current) {
              setResolvedEventId(current.id);
              setEventName(current.title || current.name || 'TGA 2026');
            }
          }
        })
        .catch(() => {});
    }
  }, [resolvedEventId]);

  // Fetch Inventory Data
  const loadInventory = useCallback(async () => {
    if (!resolvedEventId) return;
    setLoading(true);
    try {
      const res = await api.admin.getWristbandInventory(resolvedEventId, {
        page,
        limit,
        q: searchQuery,
        status: activeStatusFilter
      });
      if (res?.success) {
        setSummary(res.summary);
        setWristbands(res.wristbands || []);
        setTotalCount(res.pagination?.totalCount || 0);
        setTotalPages(res.pagination?.totalPages || 1);
      }
    } catch (err: any) {
      console.error('Failed to load wristband inventory:', err);
    } finally {
      setLoading(false);
    }
  }, [resolvedEventId, page, limit, searchQuery, activeStatusFilter]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  // Handle Search Input
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadInventory();
  };

  // Handle Row Selection
  const toggleSelectAll = () => {
    if (selectedIds.size === wristbands.length && wristbands.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(wristbands.map(w => w.id)));
    }
  };


  // ===========================================================================
  // BULK IMPORT WORKFLOW
  // ===========================================================================

  const handlePreviewImport = async () => {
    if (!importCsvText.trim()) {
      setImportError('Please provide CSV content or paste NFC UIDs.');
      return;
    }
    setImportPreviewLoading(true);
    setImportError(null);
    setImportPreview(null);
    setImportResult(null);

    try {
      const res = await api.admin.previewBulkImportWristbands(resolvedEventId, {
        csvText: importCsvText
      });
      if (res?.success) {
        setImportPreview(res.preview);
      } else {
        setImportError((res as any)?.error || 'Failed to parse import data.');
      }
    } catch (err: any) {
      setImportError(err.message || 'Error parsing wristband import.');
    } finally {
      setImportPreviewLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!importPreview || importPreview.summary.validCount === 0) return;
    setImportExecuteLoading(true);
    setImportError(null);

    try {
      const res = await api.admin.executeBulkImportWristbands(resolvedEventId, {
        csvText: importCsvText,
        skipErrors: skipImportErrors
      });
      if (res?.success) {
        setImportResult(res.result);
        loadInventory();
      } else {
        setImportError((res as any)?.error || 'Failed to complete import.');
      }
    } catch (err: any) {
      setImportError(err.message || 'Error provisioning wristbands.');
    } finally {
      setImportExecuteLoading(false);
    }
  };

  const handleResetImportModal = () => {
    setImportCsvText('');
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
    setShowImportModal(false);
  };

  // ===========================================================================
  // HIGH-SPEED PREPARATION WORKFLOW (PHASE 4B1)
  // ===========================================================================

  const handlePrepareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUid = prepareUid.trim();
    if (!cleanUid) return;

    setPrepareLoading(true);
    setPrepareError(null);

    try {
      const res = await api.admin.prepareWristband(resolvedEventId, cleanUid);
      if (res?.success && res.wristbandCode) {
        let qrDataUrl: string | undefined;
        try {
          qrDataUrl = await QRCode.toDataURL(res.wristbandCode, {
            margin: 1,
            width: 180,
            color: { dark: '#18181B', light: '#FFFFFF' },
            errorCorrectionLevel: 'M'
          });
        } catch (_) {}

        setLastPrepared({
          wristbandCode: res.wristbandCode,
          nfcUid: res.nfcUid || cleanUid,
          eventName: eventName || 'TGA 2026',
          qrDataUrl
        });

        setRecentPrepared((prev) => [
          {
            wristbandCode: res.wristbandCode,
            nfcUid: res.nfcUid || cleanUid,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          },
          ...prev.slice(0, 9)
        ]);

        setPrepareUid('');
        loadInventory();
      } else {
        setPrepareError((res as any)?.error || 'Failed to prepare wristband.');
      }
    } catch (err: any) {
      setPrepareError(err.message || 'Could not prepare wristband.');
    } finally {
      setPrepareLoading(false);
      setTimeout(() => {
        prepareInputRef.current?.focus();
      }, 50);
    }
  };

  // ===========================================================================
  // PHYSICAL WRISTBAND VERIFICATION WORKFLOW (PHASE 4B1)
  // ===========================================================================

  const handlePhysicalVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = verifyCode.trim();
    const cleanUid = verifyNfcUid.trim();

    if (!cleanCode) {
      setVerifyPhysicalError('Please enter or scan the printed wristband code.');
      verifyCodeInputRef.current?.focus();
      return;
    }
    if (!cleanUid) {
      setVerifyPhysicalError('Please tap or scan the physical NFC chip.');
      verifyNfcInputRef.current?.focus();
      return;
    }

    setVerifyPhysicalLoading(true);
    setVerifyPhysicalError(null);
    setVerifyPhysicalSuccess(null);

    try {
      const res = await api.admin.verifyPhysicalWristband({
        eventId: resolvedEventId,
        wristbandCode: cleanCode,
        nfcUid: cleanUid
      });

      if (res?.success && res.wristband) {
        setVerifyPhysicalSuccess({
          wristbandCode: res.wristband.wristband_code,
          nfcUid: res.wristband.nfc_uid,
          message: res.message || `Wristband ${res.wristband.wristband_code} verified successfully and is now available.`
        });
        setVerifyCode('');
        setVerifyNfcUid('');
        loadInventory();
        setTimeout(() => {
          verifyCodeInputRef.current?.focus();
        }, 50);
      } else {
        setVerifyPhysicalError((res as any)?.error || 'Verification failed.');
      }
    } catch (err: any) {
      setVerifyPhysicalError(err.message || 'Verification failed.');
    } finally {
      setVerifyPhysicalLoading(false);
    }
  };

  // ===========================================================================
  // PRINT BATCH & REPRINT WORKFLOW (PHASE 4B2)
  // ===========================================================================

  const toggleSelectRow = (id: string, status: string) => {
    if (status !== 'prepared') return; // Only prepared wristbands can be selected
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const pagePreparedWristbands = wristbands.filter(w => w.status === 'prepared');
  const allPreparedOnPageSelected = pagePreparedWristbands.length > 0 && pagePreparedWristbands.every(w => selectedIds.has(w.id));

  const toggleSelectAllOnPage = () => {
    const next = new Set(selectedIds);
    if (allPreparedOnPageSelected) {
      pagePreparedWristbands.forEach(w => next.delete(w.id));
    } else {
      pagePreparedWristbands.forEach(w => next.add(w.id));
    }
    setSelectedIds(next);
  };

  const handleSelectAllPrepared = async () => {
    try {
      setPrintLoading(true);
      const res = await api.admin.getWristbandInventory(resolvedEventId, { status: 'prepared', limit: 1000 });
      if (res?.success && Array.isArray(res.wristbands)) {
        const next = new Set<string>();
        res.wristbands.forEach((w: any) => next.add(w.id));
        setSelectedIds(next);
      }
    } catch {
      const next = new Set(selectedIds);
      pagePreparedWristbands.forEach(w => next.add(w.id));
      setSelectedIds(next);
    } finally {
      setPrintLoading(false);
    }
  };

  const handleReprintSingle = async (item: WristbandItem) => {
    try {
      setPrintLoading(true);
      setPrintError(null);
      const res = await api.admin.getWristbandsPrintBatch(resolvedEventId, {
        ids: [item.id],
        isReprint: true
      });
      if (res?.success && Array.isArray(res.items) && res.items.length > 0) {
        const itemsWithQRs: PrintItem[] = await Promise.all(
          res.items.map(async (pi: any) => {
            try {
              const dataUrl = await QRCode.toDataURL(pi.qrValue, {
                margin: 1,
                width: 240,
                color: { dark: '#000000', light: '#FFFFFF' },
                errorCorrectionLevel: 'M'
              });
              return { ...pi, qrDataUrl: dataUrl };
            } catch {
              return pi;
            }
          })
        );
        setPrintItems(itemsWithQRs);
        setIsPrintPreviewActive(true);
      }
    } catch (err: any) {
      console.error('Failed to prepare single wristband reprint:', err);
    } finally {
      setPrintLoading(false);
    }
  };

  const handleGeneratePrintBatch = async (): Promise<boolean> => {
    setPrintLoading(true);
    setPrintError(null);
    setBatchSummary(null);

    try {
      let params: any = {};
      if (printMode === 'selected') {
        if (selectedIds.size === 0) {
          setPrintError('Please select at least one prepared wristband to print.');
          setPrintLoading(false);
          return false;
        }
        params.ids = Array.from(selectedIds);
      } else if (printMode === 'page') {
        const pagePrepared = wristbands.filter(w => w.status === 'prepared').map(w => w.id);
        if (pagePrepared.length === 0) {
          setPrintError('No prepared wristbands found on the current page.');
          setPrintLoading(false);
          return false;
        }
        params.ids = pagePrepared;
      } else if (printMode === 'range') {
        if (!rangeStart.trim() || !rangeEnd.trim()) {
          setPrintError('Please provide both Start and End wristband codes.');
          setPrintLoading(false);
          return false;
        }
        params.rangeStart = rangeStart.trim().toUpperCase();
        params.rangeEnd = rangeEnd.trim().toUpperCase();
      } else if (printMode === 'all_prepared') {
        params.status = 'prepared';
      }

      const res = await api.admin.getWristbandsPrintBatch(resolvedEventId, params);
      if (res?.success && Array.isArray(res.items)) {
        if (res.items.length === 0) {
          setPrintError('No prepared wristbands matched the selected print criteria.');
          setPrintLoading(false);
          return false;
        }

        const itemsWithQRs: PrintItem[] = await Promise.all(
          res.items.map(async (item: any) => {
            try {
              const dataUrl = await QRCode.toDataURL(item.qrValue, {
                margin: 1,
                width: 240,
                color: { dark: '#000000', light: '#FFFFFF' },
                errorCorrectionLevel: 'M'
              });
              return { ...item, qrDataUrl: dataUrl };
            } catch {
              return item;
            }
          })
        );

        setPrintItems(itemsWithQRs);
        setBatchSummary({
          totalCount: res.totalCount || itemsWithQRs.length,
          firstCode: res.firstCode || itemsWithQRs[0]?.wristbandCode || null,
          lastCode: res.lastCode || itemsWithQRs[itemsWithQRs.length - 1]?.wristbandCode || null,
          eventName: res.eventName || eventName || 'TGA 2026'
        });
        return true;
      } else {
        setPrintError((res as any)?.error || 'Failed to prepare print batch.');
        return false;
      }
    } catch (err: any) {
      setPrintError(err.message || 'Error generating printable labels.');
      return false;
    } finally {
      setPrintLoading(false);
    }
  };

  const handlePreviewPrint = async () => {
    if (!batchSummary) {
      const ok = await handleGeneratePrintBatch();
      if (!ok) return;
    }
    setShowPrintModal(false);
    setIsPrintPreviewActive(true);
  };

  const handlePrintDirect = async () => {
    if (!batchSummary) {
      const ok = await handleGeneratePrintBatch();
      if (!ok) return;
    }
    setShowPrintModal(false);
    setIsPrintPreviewActive(true);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  const handleTriggerBrowserPrint = () => {
    window.print();
  };

  // Understated semantic status badges
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'prepared':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-medium bg-[#FAF6EB] text-[#8C6B1C] border border-[#E5D5AE]/80 dark:bg-[#26241D] dark:text-[#E0BC5C] dark:border-[#4A4328]/60">
            Prepared
          </span>
        );
      case 'available':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40">
            Available
          </span>
        );
      case 'active':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-medium bg-blue-50 text-blue-800 border border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40">
            Assigned
          </span>
        );
      case 'lost':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-medium bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40">
            Lost
          </span>
        );
      case 'damaged':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-medium bg-rose-50 text-rose-800 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40">
            Damaged
          </span>
        );
      case 'decommissioned':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-medium bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-[#21211E] dark:text-[#7A7570] dark:border-[#302E29]">
            Retired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#19191A] text-zinc-900 dark:text-[#F0EBE3] pb-16 font-sans">
      {/* Printable Area - Rendered and formatted for window.print() */}
      {isPrintPreviewActive && (
        <div className="fixed inset-0 z-50 bg-white text-black overflow-y-auto p-6 flex flex-col font-sans print:p-0 print:bg-white print:text-black">
          <style>{`
            @media print {
              html, body, [data-theme="dark"] {
                background: #FFFFFF !important;
                background-color: #FFFFFF !important;
                color: #000000 !important;
                color-scheme: light !important;
              }
              header, nav, aside, [data-component-version="admin-sidebar-approved-v1"], .admin-shell > aside, .admin-shell > header, .admin-shell > nav {
                display: none !important;
              }
              @page {
                margin: 10mm;
                size: auto;
              }
            }
          `}</style>
          {/* Print Toolbar (Hidden during actual print) */}
          <div className="print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-6 border-b border-zinc-200">
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setIsPrintPreviewActive(false)}
                className="p-2 text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="font-sans font-semibold text-lg text-zinc-900">
                  Print Batch Preview ({printItems.length} {printItems.length === 1 ? 'label' : 'labels'})
                </h2>
                <p className="text-xs font-sans text-zinc-600">
                  {eventName} • {printItems[0]?.wristbandCode} → {printItems[printItems.length - 1]?.wristbandCode}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setIsPrintPreviewActive(false)}
                className="px-4 py-2 text-xs font-medium text-zinc-700 hover:text-zinc-900 rounded-lg border border-zinc-200 hover:bg-zinc-50 cursor-pointer"
              >
                Back to Inventory
              </button>
              <button
                type="button"
                onClick={handleTriggerBrowserPrint}
                className="px-5 py-2 bg-[#C59B27] hover:bg-[#b0881e] text-white text-xs font-semibold rounded-lg shadow-3xs transition-colors flex items-center space-x-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print labels</span>
              </button>
            </div>
          </div>

          {/* Printable Label Grid / Sheet */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 print:grid-cols-3 print:gap-3 p-2 bg-white text-black">
            {printItems.map((item, index) => (
              <div
                key={item.id}
                className="border border-zinc-300 rounded-xl p-4 bg-white text-black flex flex-col items-center justify-between text-center page-break-inside-avoid print:border-zinc-400 print:p-3 shadow-none"
                style={{ minHeight: '180px' }}
              >
                {/* OPTIONAL SMALL: TGA 2026 & Sequence Position */}
                <div className="w-full flex justify-between items-center text-[10px] text-zinc-500 font-sans tracking-wide uppercase border-b border-zinc-200 pb-1 mb-2">
                  <span className="font-semibold">{item.eventName || 'TGA 2026'}</span>
                  <span className="font-mono text-[9px] text-zinc-400">
                    {item.sequenceIndex || index + 1} of {item.totalInBatch || printItems.length}
                  </span>
                </div>

                {/* MACHINE READABLE: QR code encoding exactly WB-XXXXXX */}
                {item.qrDataUrl ? (
                  <img
                    src={item.qrDataUrl}
                    alt={`QR Code for ${item.wristbandCode}`}
                    className="w-24 h-24 object-contain my-1"
                  />
                ) : (
                  <div className="w-24 h-24 bg-zinc-50 rounded flex items-center justify-center text-xs text-zinc-400">
                    QR Ready
                  </div>
                )}

                {/* PRIMARY: Human WB-XXXXXX Code */}
                <div className="w-full pt-2 border-t border-zinc-200 mt-2">
                  <div className="font-mono text-base font-bold tracking-wider text-black">
                    {item.wristbandCode}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Workspace Container */}
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6 ${isPrintPreviewActive ? 'print:hidden' : ''}`}>
        {/* Workspace Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-[#EAE8E1] dark:border-[#302E29]">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-zinc-500 dark:text-[#7A7570] text-xs font-sans">
              <span>Admin Operations</span>
              <span>/</span>
              <span>Event Readiness</span>
              <span>/</span>
              <span className="text-[#C59B27] font-medium">{eventName}</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-normal text-zinc-900 dark:text-[#F0EBE3] tracking-tight">
              Wristband Inventory
            </h1>
            <p className="font-sans text-xs sm:text-sm text-zinc-500 dark:text-[#B8B0A5] max-w-2xl leading-relaxed">
              Prepare and manage wristbands for this event.
            </p>
          </div>

          {/* Action Hierarchy: 'Verify wristband', 'Prepare wristbands', 'Bulk import', Secondary 'Assignment desk' */}
          <div className="flex items-center gap-2.5">
            {onSwitchToDesk && (
              <button
                type="button"
                onClick={onSwitchToDesk}
                className="px-3.5 py-2 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] hover:bg-zinc-50 dark:hover:bg-[#21211E] text-zinc-800 dark:text-[#F0EBE3] text-xs font-semibold rounded-xl shadow-3xs transition-colors flex items-center space-x-1.5 cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5 text-zinc-500 dark:text-[#B8B0A5]" />
                <span>Assignment desk</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setShowVerifyPhysicalModal(true);
                setVerifyPhysicalError(null);
                setVerifyPhysicalSuccess(null);
                setTimeout(() => verifyCodeInputRef.current?.focus(), 50);
              }}
              className="px-3.5 py-2 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] hover:bg-zinc-50 dark:hover:bg-[#21211E] text-zinc-800 dark:text-[#F0EBE3] text-xs font-semibold rounded-xl shadow-3xs transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>Verify wristband</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPrepareModal(true);
                setPrepareError(null);
                setTimeout(() => prepareInputRef.current?.focus(), 50);
              }}
              className="px-4 py-2 bg-[#C59B27] hover:bg-[#b0881e] text-white text-xs font-semibold rounded-xl shadow-3xs transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Prepare wristbands</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPrintModal(true);
                setPrintError(null);
                setBatchSummary(null);
                if (selectedIds.size > 0) {
                  setPrintMode('selected');
                } else {
                  setPrintMode('all_prepared');
                }
              }}
              className="px-3.5 py-2 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] hover:bg-zinc-50 dark:hover:bg-[#21211E] text-zinc-800 dark:text-[#F0EBE3] text-xs font-semibold rounded-xl shadow-3xs transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-zinc-500 dark:text-[#B8B0A5]" />
              <span>Print batch</span>
            </button>

            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="px-3.5 py-2 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] hover:bg-zinc-50 dark:hover:bg-[#21211E] text-zinc-700 dark:text-[#B8B0A5] text-xs font-medium rounded-xl shadow-3xs transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-zinc-400" />
              <span>Bulk import</span>
            </button>
          </div>
        </div>

        {/* Operational Inventory Summary Row */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl overflow-hidden shadow-3xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-[#EAE8E1] dark:divide-[#302E29]">
            <div className="p-3 sm:py-3.5 sm:px-4">
              <div className="text-[11px] font-sans font-medium text-zinc-500 dark:text-[#B8B0A5]">Total</div>
              <div className="text-xl font-sans font-semibold text-zinc-900 dark:text-[#F0EBE3] mt-0.5">
                {summary.total.toLocaleString()}
              </div>
            </div>

            <div className="p-3 sm:py-3.5 sm:px-4">
              <div className="text-[11px] font-sans font-medium text-[#8C6B1C] dark:text-[#E0BC5C]">Prepared</div>
              <div className="text-xl font-sans font-semibold text-[#8C6B1C] dark:text-[#E0BC5C] mt-0.5">
                {(summary.prepared || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-3 sm:py-3.5 sm:px-4">
              <div className="text-[11px] font-sans font-medium text-emerald-700 dark:text-emerald-400">Available</div>
              <div className="text-xl font-sans font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                {summary.available.toLocaleString()}
              </div>
            </div>

            <div className="p-3 sm:py-3.5 sm:px-4">
              <div className="text-[11px] font-sans font-medium text-zinc-600 dark:text-[#B8B0A5]">Assigned</div>
              <div className="text-xl font-sans font-semibold text-zinc-900 dark:text-[#F0EBE3] mt-0.5">
                {summary.active.toLocaleString()}
              </div>
            </div>

            <div className="p-3 sm:py-3.5 sm:px-4">
              <div className="text-[11px] font-sans font-medium text-amber-700 dark:text-amber-400">Lost</div>
              <div className="text-xl font-sans font-semibold text-amber-700 dark:text-amber-400 mt-0.5">
                {summary.lost.toLocaleString()}
              </div>
            </div>

            <div className="p-3 sm:py-3.5 sm:px-4">
              <div className="text-[11px] font-sans font-medium text-rose-700 dark:text-rose-400">Damaged</div>
              <div className="text-xl font-sans font-semibold text-rose-700 dark:text-rose-400 mt-0.5">
                {summary.damaged.toLocaleString()}
              </div>
            </div>

            <div className="p-3 sm:py-3.5 sm:px-4">
              <div className="text-[11px] font-sans font-medium text-zinc-400 dark:text-[#7A7570]">Retired</div>
              <div className="text-xl font-sans font-semibold text-zinc-500 dark:text-[#7A7570] mt-0.5">
                {summary.decommissioned.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Integrated Search & Filter Toolbar */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-3 shadow-3xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-[#7A7570]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search wristband code or NFC UID"
                className="w-full pl-9 pr-4 py-2 text-xs font-sans bg-[#FAF8F3] dark:bg-[#21211E] text-zinc-900 dark:text-[#F0EBE3] border border-[#EAE8E1] dark:border-[#302E29] rounded-lg outline-none focus:border-[#C59B27] focus:bg-white dark:focus:bg-[#1D1D1A] transition-colors"
              />
            </form>

            {/* Status Filters */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { key: 'all', label: 'All' },
                { key: 'prepared', label: 'Prepared' },
                { key: 'available', label: 'Available' },
                { key: 'active', label: 'Assigned' },
                { key: 'lost', label: 'Lost' },
                { key: 'damaged', label: 'Damaged' },
                { key: 'decommissioned', label: 'Retired' }
              ].map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => {
                    setActiveStatusFilter(filter.key);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    activeStatusFilter === filter.key
                      ? 'bg-zinc-900 text-white dark:bg-[#F0EBE3] dark:text-[#18181B] font-semibold'
                      : 'text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 dark:hover:bg-[#21211E]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Selection Banner for High-Volume Batch Operations */}
        {selectedIds.size > 0 && (
          <div className="bg-[#FAF8F3] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-3xs animate-fade-in">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-zinc-900 dark:text-[#F0EBE3]">
                {selectedIds.size} {selectedIds.size === 1 ? 'prepared wristband' : 'prepared wristbands'} selected
              </span>
              {summary.prepared > selectedIds.size && (
                <button
                  type="button"
                  onClick={handleSelectAllPrepared}
                  className="text-[#C59B27] hover:underline font-medium ml-2 cursor-pointer"
                >
                  Select all {summary.prepared} prepared
                </button>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 dark:hover:text-[#F0EBE3] cursor-pointer"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrintMode('selected');
                  setShowPrintModal(true);
                  setBatchSummary(null);
                  setPrintError(null);
                }}
                className="px-4 py-1.5 bg-[#C59B27] hover:bg-[#b0881e] text-white font-semibold rounded-lg shadow-3xs flex items-center space-x-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print selected ({selectedIds.size})</span>
              </button>
            </div>
          </div>
        )}

        {/* Scalable Inventory Table */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl overflow-hidden shadow-3xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#FAF8F3] dark:bg-[#21211E] border-b border-[#EAE8E1] dark:border-[#302E29] text-zinc-500 dark:text-[#7A7570] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all prepared wristbands on page"
                      checked={allPreparedOnPageSelected}
                      onChange={toggleSelectAllOnPage}
                      disabled={pagePreparedWristbands.length === 0}
                      className="rounded text-[#C59B27] focus:ring-[#C59B27] cursor-pointer disabled:opacity-30"
                    />
                  </th>
                  <th className="py-3 px-4 font-semibold">Wristband</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">NFC UID</th>
                  <th className="py-3 px-4 font-semibold">Prepared</th>
                  <th className="py-3 px-4 font-semibold">Assignment</th>
                  <th className="py-3 px-4 font-semibold text-right">Reprint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8E1] dark:divide-[#302E29]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-400">
                      <div className="inline-flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-[#C59B27] border-t-transparent rounded-full animate-spin"></div>
                        <span>Loading wristband inventory...</span>
                      </div>
                    </td>
                  </tr>
                ) : wristbands.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-zinc-500 dark:text-[#B8B0A5]">
                      <div className="max-w-xs mx-auto space-y-3">
                        <div className="w-10 h-10 mx-auto rounded-xl bg-[#FAF8F3] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-center text-zinc-400 dark:text-[#7A7570]">
                          <Tag className="w-5 h-5 stroke-[1.5]" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold text-sm text-zinc-900 dark:text-[#F0EBE3]">
                            No wristbands prepared yet
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-[#B8B0A5]">
                            {searchQuery || activeStatusFilter !== 'all'
                              ? 'Try clearing your search or status filter.'
                              : 'Add wristbands to prepare them for event assignment.'}
                          </p>
                        </div>
                        {!searchQuery && activeStatusFilter === 'all' && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => setShowImportModal(true)}
                              className="px-4 py-2 bg-[#C59B27] hover:bg-[#b0881e] text-white text-xs font-semibold rounded-xl shadow-3xs transition-colors cursor-pointer inline-flex items-center space-x-1.5"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>Bulk import</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  wristbands.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-[#FAF8F3]/60 dark:hover:bg-[#262520] transition-colors"
                    >
                      <td className="py-3 px-3 text-center">
                        {item.status === 'prepared' ? (
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.wristbandCode}`}
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelectRow(item.id, item.status)}
                            className="rounded text-[#C59B27] focus:ring-[#C59B27] cursor-pointer"
                          />
                        ) : (
                          <span className="text-zinc-300 dark:text-zinc-700 text-xs select-none">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-xs text-zinc-900 dark:text-[#F0EBE3]">
                        {item.wristbandCode}
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(item.status)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-zinc-400 dark:text-[#7A7570]">
                        {item.nfcUid}
                      </td>
                      <td className="py-3 px-4 text-xs text-zinc-500 dark:text-[#B8B0A5]">
                        {new Date(item.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {item.assignmentState === 'active' && item.assignedChild ? (
                          <div className="flex items-center space-x-1.5 text-zinc-800 dark:text-[#F0EBE3]">
                            <span className="font-medium">{item.assignedChild.childName}</span>
                          </div>
                        ) : item.status === 'prepared' ? (
                          <span className="text-[#8C6B1C] dark:text-[#E0BC5C] font-sans text-[11px] italic">
                            Awaiting physical verification
                          </span>
                        ) : (
                          <span className="text-zinc-400 dark:text-[#7A7570] font-sans">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {(item.status === 'prepared' || item.status === 'available') && (
                          <button
                            type="button"
                            onClick={() => handleReprintSingle(item)}
                            title={`Reprint label for ${item.wristbandCode}`}
                            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-[#F0EBE3] rounded-lg hover:bg-zinc-100 dark:hover:bg-[#21211E] transition-colors cursor-pointer inline-flex items-center space-x-1"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-medium hidden sm:inline">Reprint</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-3.5 border-t border-[#EAE8E1] dark:border-[#302E29] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-sans text-zinc-500 dark:text-[#B8B0A5]">
            <div>
              Showing <span className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">{wristbands.length}</span> of{' '}
              <span className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">{totalCount.toLocaleString()}</span> wristbands
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5">
                <span>Rows:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="border border-[#EAE8E1] dark:border-[#302E29] bg-white dark:bg-[#1D1D1A] text-zinc-800 dark:text-[#F0EBE3] rounded-lg px-2 py-1 text-xs outline-none cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded-lg border border-[#EAE8E1] dark:border-[#302E29] hover:bg-zinc-100 dark:hover:bg-[#21211E] disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1 rounded-lg border border-[#EAE8E1] dark:border-[#302E29] hover:bg-zinc-100 dark:hover:bg-[#21211E] disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          BULK IMPORT MODAL
      ===================================================================== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1] dark:border-[#302E29]">
              <div className="flex items-center space-x-2">
                <Upload className="w-5 h-5 text-[#C59B27]" />
                <h3 className="font-sans font-semibold text-lg text-zinc-900 dark:text-[#F0EBE3]">
                  Bulk import wristbands
                </h3>
              </div>
              <button
                type="button"
                onClick={handleResetImportModal}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-[#F0EBE3] cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Banner */}
            {importError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{importError}</span>
              </div>
            )}

            {/* Success State */}
            {importResult ? (
              <div className="p-6 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300 rounded-xl space-y-3 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <h4 className="font-sans font-semibold text-base">Import complete</h4>
                <p className="text-xs font-sans text-emerald-800 dark:text-emerald-300 max-w-md mx-auto">
                  Successfully imported <span className="font-bold">{importResult.importedCount}</span> wristband
                  {importResult.importedCount !== 1 ? 's' : ''} into inventory.
                  {importResult.skippedCount > 0 && ` (${importResult.skippedCount} invalid rows were safely skipped)`}
                </p>
                <button
                  type="button"
                  onClick={handleResetImportModal}
                  className="mt-2 px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                >
                  Done
                </button>
              </div>
            ) : importPreview ? (
              /* Step 2: Human Preview Screen */
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 bg-[#FAF8F3] dark:bg-[#21211E] rounded-xl border border-[#EAE8E1] dark:border-[#302E29]">
                    <div className="text-zinc-400 dark:text-[#7A7570] text-[10px] uppercase font-medium">Total Rows</div>
                    <div className="font-bold text-sm text-zinc-900 dark:text-[#F0EBE3] mt-0.5">{importPreview.summary.totalRows}</div>
                  </div>
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                    <div className="text-emerald-700 dark:text-emerald-400 text-[10px] uppercase font-medium">Valid</div>
                    <div className="font-bold text-sm text-emerald-700 dark:text-emerald-300 mt-0.5">{importPreview.summary.validCount}</div>
                  </div>
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/40">
                    <div className="text-amber-700 dark:text-amber-400 text-[10px] uppercase font-medium">Duplicates</div>
                    <div className="font-bold text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                      {importPreview.summary.duplicateInFileCount + importPreview.summary.alreadyExistingCount}
                    </div>
                  </div>
                  <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800/40">
                    <div className="text-rose-700 dark:text-rose-400 text-[10px] uppercase font-medium">Malformed</div>
                    <div className="font-bold text-sm text-rose-700 dark:text-rose-300 mt-0.5">{importPreview.summary.malformedCount}</div>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto border border-[#EAE8E1] dark:border-[#302E29] rounded-xl text-xs font-sans">
                  <table className="w-full text-left">
                    <thead className="bg-[#FAF8F3] dark:bg-[#21211E] sticky top-0 text-[10px] text-zinc-500 dark:text-[#7A7570] uppercase font-semibold">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">UID</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAE8E1] dark:divide-[#302E29]">
                      {importPreview.rows.slice(0, 100).map((r: any) => (
                        <tr key={r.rowNumber}>
                          <td className="py-1.5 px-3 text-zinc-400">{r.rowNumber}</td>
                          <td className="py-1.5 px-3 font-mono">{r.rawNfcUid || '—'}</td>
                          <td className="py-1.5 px-3">
                            {r.status === 'valid' ? (
                              <span className="text-emerald-700 dark:text-emerald-400 font-medium">Valid</span>
                            ) : (
                              <span className="text-rose-700 dark:text-rose-400 font-medium capitalize">{r.status.replace(/_/g, ' ')}</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-zinc-400 text-[11px] truncate max-w-[200px]">
                            {r.errorReason || (r.wristbandCode ? `Code: ${r.wristbandCode}` : 'Sequential code')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {importPreview.rows.length > 100 && (
                  <p className="text-[11px] text-zinc-400 text-center">
                    Showing first 100 of {importPreview.rows.length} rows previewed.
                  </p>
                )}

                <div className="p-3 bg-[#FAF8F3] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl text-xs text-zinc-600 dark:text-[#B8B0A5] space-y-1.5">
                  <p className="font-semibold text-zinc-900 dark:text-[#F0EBE3]">Safe Preview:</p>
                  <p className="text-[11px] leading-relaxed">
                    No database records have been modified yet. Consecutive wristband codes will be generated in an atomic transaction upon confirmation.
                  </p>
                  <label className="flex items-center space-x-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipImportErrors}
                      onChange={(e) => setSkipImportErrors(e.target.checked)}
                      className="rounded border-[#EAE8E1] text-[#C59B27] focus:ring-[#C59B27]"
                    />
                    <span className="text-[11px] text-zinc-700 dark:text-[#F0EBE3]">Skip duplicate and malformed rows, importing only valid tags</span>
                  </label>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setImportPreview(null)}
                    className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 dark:hover:text-[#F0EBE3] cursor-pointer"
                  >
                    Edit CSV
                  </button>
                  <button
                    type="button"
                    disabled={importExecuteLoading || importPreview.summary.validCount === 0}
                    onClick={handleExecuteImport}
                    className="px-5 py-2 bg-[#C59B27] hover:bg-[#b0881e] disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-3xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                  >
                    {importExecuteLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Importing...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Confirm & import ({importPreview.summary.validCount})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Step 1: Input Screen */
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs text-zinc-600 dark:text-[#B8B0A5]">
                    Paste a CSV or list of NFC UIDs to prepare multiple wristbands at once.
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-[#7A7570]">
                    Required: NFC UID · Optional: Wristband code
                  </p>
                </div>

                <textarea
                  rows={8}
                  value={importCsvText}
                  onChange={(e) => setImportCsvText(e.target.value)}
                  placeholder="nfc_uid&#10;04A1B2C3D4E5F6&#10;04A1B2C3D4E5F7"
                  className="w-full p-3 font-mono text-xs bg-[#FAF8F3] dark:bg-[#21211E] text-zinc-900 dark:text-[#F0EBE3] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl outline-none focus:border-[#C59B27] transition-colors"
                />

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-zinc-400 dark:text-[#7A7570]">
                    Preview does not modify the database.
                  </span>
                  <button
                    type="button"
                    disabled={importPreviewLoading || !importCsvText.trim()}
                    onClick={handlePreviewImport}
                    className="px-5 py-2 bg-[#C59B27] hover:bg-[#b0881e] disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-3xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                  >
                    {importPreviewLoading ? (
                      <span>Preparing preview...</span>
                    ) : (
                      <>
                        <span>Preview import</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          HIGH-SPEED PREPARATION MODAL (PHASE 4B1)
      ===================================================================== */}
      {showPrepareModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1] dark:border-[#302E29]">
              <div className="flex items-center space-x-2">
                <Plus className="w-5 h-5 text-[#C59B27]" />
                <h3 className="font-sans font-semibold text-lg text-zinc-900 dark:text-[#F0EBE3]">
                  Prepare wristbands
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPrepareModal(false);
                  setPrepareError(null);
                }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-[#F0EBE3] cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs font-sans text-zinc-600 dark:text-[#B8B0A5] leading-relaxed">
              Scan blank NFC wristbands consecutively to generate sequential Koinonia codes. Status is marked <strong className="text-[#8C6B1C] dark:text-[#E0BC5C]">Prepared</strong> until physical verification.
            </p>

            {/* Error Banner */}
            {prepareError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-medium">{prepareError}</span>
              </div>
            )}

            {/* Large Code Display of Last Prepared Band */}
            {lastPrepared && (
              <div className="p-4 bg-[#FAF6EB] dark:bg-[#242118] border border-[#E5D5AE]/80 dark:border-[#4A4328]/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-medium bg-white/80 dark:bg-[#1D1D1A] text-[#8C6B1C] dark:text-[#E0BC5C] border border-[#E5D5AE]/60">
                    Prepared
                  </span>
                  <span className="text-[11px] font-sans font-medium text-zinc-500 dark:text-[#B8B0A5]">
                    {lastPrepared.eventName}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-sans text-zinc-500 dark:text-[#7A7570] tracking-wider">
                      Generated Code
                    </div>
                    <div className="font-mono text-3xl font-extrabold tracking-wider text-zinc-900 dark:text-[#F0EBE3]">
                      {lastPrepared.wristbandCode}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-500 dark:text-[#B8B0A5]">
                      NFC UID: {lastPrepared.nfcUid}
                    </div>
                  </div>

                  {lastPrepared.qrDataUrl && (
                    <div className="shrink-0 bg-white p-1.5 rounded-lg border border-zinc-200 shadow-2xs">
                      <img
                        src={lastPrepared.qrDataUrl}
                        alt={`QR for ${lastPrepared.wristbandCode}`}
                        className="w-16 h-16 object-contain"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[#E5D5AE]/60 dark:border-[#4A4328]/40 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-zinc-500 dark:text-[#B8B0A5]">
                    Ready for physical verification
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintItems([
                        {
                          id: lastPrepared.wristbandCode,
                          wristbandCode: lastPrepared.wristbandCode,
                          qrValue: lastPrepared.wristbandCode,
                          eventName: lastPrepared.eventName,
                          status: 'prepared',
                          qrDataUrl: lastPrepared.qrDataUrl
                        }
                      ]);
                      setIsPrintPreviewActive(true);
                    }}
                    className="text-[11px] font-medium text-[#8C6B1C] hover:text-[#6c5112] dark:text-[#E0BC5C] flex items-center space-x-1 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print label</span>
                  </button>
                </div>
              </div>
            )}

            {/* Fast Scan Form */}
            <form onSubmit={handlePrepareSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-[#F0EBE3]">
                  Scan wristband (NFC UID)
                </label>
                <div className="relative">
                  <input
                    ref={prepareInputRef}
                    type="text"
                    value={prepareUid}
                    onChange={(e) => setPrepareUid(e.target.value)}
                    placeholder="Tap NFC wristband or enter UID..."
                    disabled={prepareLoading}
                    autoFocus
                    className="w-full pl-3.5 pr-20 py-2.5 font-mono text-sm bg-[#FAF8F3] dark:bg-[#21211E] text-zinc-900 dark:text-[#F0EBE3] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl outline-none focus:border-[#C59B27] transition-colors"
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 font-mono">
                    ↵ Enter
                  </div>
                </div>
              </div>

              {/* Recent Prepared Chips */}
              {recentPrepared.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase font-sans font-medium text-zinc-400 dark:text-[#7A7570]">
                    Recent ({recentPrepared.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {recentPrepared.map((p, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-mono bg-zinc-100 dark:bg-[#21211E] text-zinc-800 dark:text-[#F0EBE3] border border-zinc-200 dark:border-[#302E29]"
                      >
                        {p.wristbandCode}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-[#EAE8E1] dark:border-[#302E29]">
                <span className="text-[11px] text-zinc-400 dark:text-[#7A7570]">
                  Immediate focus maintained for next tap.
                </span>
                <button
                  type="button"
                  onClick={() => setShowPrepareModal(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          PHYSICAL WRISTBAND VERIFICATION MODAL (PHASE 4B1)
      ===================================================================== */}
      {showVerifyPhysicalModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1] dark:border-[#302E29]">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-[#C59B27]" />
                <h3 className="font-sans font-semibold text-lg text-zinc-900 dark:text-[#F0EBE3]">
                  Physical verification
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowVerifyPhysicalModal(false);
                  setVerifyPhysicalError(null);
                  setVerifyPhysicalSuccess(null);
                }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-[#F0EBE3] cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs font-sans text-zinc-600 dark:text-[#B8B0A5] leading-relaxed">
              Scan or enter the printed wristband code, then tap the physical NFC chip to verify matching pairing before making it available.
            </p>

            {/* Error Message */}
            {verifyPhysicalError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-medium">{verifyPhysicalError}</span>
              </div>
            )}

            {/* Success Confirmation */}
            {verifyPhysicalSuccess && (
              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300 rounded-xl space-y-2 text-xs">
                <div className="flex items-center space-x-2 text-emerald-800 dark:text-emerald-300 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Verified & Available</span>
                </div>
                <div className="pt-1">
                  <div className="font-mono text-base font-bold text-zinc-900 dark:text-[#F0EBE3]">
                    {verifyPhysicalSuccess.wristbandCode}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] font-mono">
                    NFC UID: {verifyPhysicalSuccess.nfcUid}
                  </div>
                </div>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  {verifyPhysicalSuccess.message}
                </p>
              </div>
            )}

            <form onSubmit={handlePhysicalVerifySubmit} className="space-y-4">
              {/* Step 1: Printed Code / QR */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-[#F0EBE3] flex items-center justify-between">
                  <span>Step 1: Printed WB Code or QR</span>
                  <span className="text-[10px] text-zinc-400 font-sans">e.g. WB-000428</span>
                </label>
                <input
                  ref={verifyCodeInputRef}
                  type="text"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (verifyCode.trim()) {
                        verifyNfcInputRef.current?.focus();
                      }
                    }
                  }}
                  placeholder="Enter or scan printed code..."
                  disabled={verifyPhysicalLoading}
                  autoFocus
                  className="w-full px-3.5 py-2 font-mono text-xs bg-[#FAF8F3] dark:bg-[#21211E] text-zinc-900 dark:text-[#F0EBE3] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              {/* Step 2: NFC Chip */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-[#F0EBE3] flex items-center justify-between">
                  <span>Step 2: Tap NFC Chip</span>
                  <span className="text-[10px] text-zinc-400 font-sans">Physical sensor</span>
                </label>
                <input
                  ref={verifyNfcInputRef}
                  type="text"
                  value={verifyNfcUid}
                  onChange={(e) => setVerifyNfcUid(e.target.value)}
                  placeholder="Tap physical wristband..."
                  disabled={verifyPhysicalLoading}
                  className="w-full px-3.5 py-2 font-mono text-xs bg-[#FAF8F3] dark:bg-[#21211E] text-zinc-900 dark:text-[#F0EBE3] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl outline-none focus:border-[#C59B27] transition-colors"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#EAE8E1] dark:border-[#302E29]">
                <button
                  type="button"
                  onClick={() => setShowVerifyPhysicalModal(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={verifyPhysicalLoading || !verifyCode.trim() || !verifyNfcUid.trim()}
                  className="px-5 py-2 bg-[#C59B27] hover:bg-[#b0881e] disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-3xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  {verifyPhysicalLoading ? (
                    <span>Verifying...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Verify match</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          PRINT BATCH MODAL (PHASE 4B2)
      ===================================================================== */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-fade-in font-sans">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1] dark:border-[#302E29]">
              <div className="flex items-center space-x-2">
                <Printer className="w-5 h-5 text-[#C59B27]" />
                <h3 className="font-sans font-semibold text-lg text-zinc-900 dark:text-[#F0EBE3]">
                  Print batch
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPrintModal(false);
                  setPrintError(null);
                  setBatchSummary(null);
                }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-[#F0EBE3] cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {printError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{printError}</span>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-xs font-semibold text-zinc-700 dark:text-[#F0EBE3]">
                Selection method
              </label>

              <div className="space-y-2">
                <label className="flex items-start space-x-3 p-3 border border-[#EAE8E1] dark:border-[#302E29] rounded-xl cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-[#21211E]">
                  <input
                    type="radio"
                    name="printMode"
                    value="selected"
                    checked={printMode === 'selected'}
                    onChange={() => {
                      setPrintMode('selected');
                      setBatchSummary(null);
                      setPrintError(null);
                    }}
                    className="mt-0.5 text-[#C59B27] focus:ring-[#C59B27]"
                  />
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3]">
                      Currently selected ({selectedIds.size})
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-[#B8B0A5]">
                      Print the individual prepared wristbands checked in the table.
                    </div>
                  </div>
                </label>

                <label className="flex items-start space-x-3 p-3 border border-[#EAE8E1] dark:border-[#302E29] rounded-xl cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-[#21211E]">
                  <input
                    type="radio"
                    name="printMode"
                    value="page"
                    checked={printMode === 'page'}
                    onChange={() => {
                      setPrintMode('page');
                      setBatchSummary(null);
                      setPrintError(null);
                    }}
                    className="mt-0.5 text-[#C59B27] focus:ring-[#C59B27]"
                  />
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3]">
                      Current page prepared ({pagePreparedWristbands.length})
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-[#B8B0A5]">
                      Print all prepared wristbands currently visible on page {page}.
                    </div>
                  </div>
                </label>

                <label className="flex items-start space-x-3 p-3 border border-[#EAE8E1] dark:border-[#302E29] rounded-xl cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-[#21211E]">
                  <input
                    type="radio"
                    name="printMode"
                    value="all_prepared"
                    checked={printMode === 'all_prepared'}
                    onChange={() => {
                      setPrintMode('all_prepared');
                      setBatchSummary(null);
                      setPrintError(null);
                    }}
                    className="mt-0.5 text-[#C59B27] focus:ring-[#C59B27]"
                  />
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3]">
                      All prepared wristbands ({(summary.prepared || 0).toLocaleString()})
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-[#B8B0A5]">
                      Print all prepared wristbands in {eventName}. Non-prepared records are safely excluded.
                    </div>
                  </div>
                </label>

                <label className="flex items-start space-x-3 p-3 border border-[#EAE8E1] dark:border-[#302E29] rounded-xl cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-[#21211E]">
                  <input
                    type="radio"
                    name="printMode"
                    value="range"
                    checked={printMode === 'range'}
                    onChange={() => {
                      setPrintMode('range');
                      setBatchSummary(null);
                      setPrintError(null);
                    }}
                    className="mt-0.5 text-[#C59B27] focus:ring-[#C59B27]"
                  />
                  <div className="w-full">
                    <div className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3]">
                      Code range
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] mb-2">
                      Print a sequence of consecutive codes (e.g. WB-000001 → WB-000250).
                    </div>

                    {printMode === 'range' && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="text-[10px] text-zinc-500 dark:text-[#7A7570]">Start code</label>
                          <input
                            type="text"
                            value={rangeStart}
                            onChange={(e) => {
                              setRangeStart(e.target.value.toUpperCase());
                              setBatchSummary(null);
                            }}
                            placeholder="WB-000001"
                            className="w-full p-2 font-mono text-xs bg-[#FAF8F3] dark:bg-[#21211E] text-zinc-900 dark:text-[#F0EBE3] border border-[#EAE8E1] dark:border-[#302E29] rounded-lg outline-none uppercase"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500 dark:text-[#7A7570]">End code</label>
                          <input
                            type="text"
                            value={rangeEnd}
                            onChange={(e) => {
                              setRangeEnd(e.target.value.toUpperCase());
                              setBatchSummary(null);
                            }}
                            placeholder="WB-000250"
                            className="w-full p-2 font-mono text-xs bg-[#FAF8F3] dark:bg-[#21211E] text-zinc-900 dark:text-[#F0EBE3] border border-[#EAE8E1] dark:border-[#302E29] rounded-lg outline-none uppercase"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Batch Preview Card (Section 6) */}
            {batchSummary ? (
              <div className="p-4 bg-[#FAF8F3] dark:bg-[#26241D] border border-[#E5D5AE] dark:border-[#4A4328]/60 rounded-xl space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-zinc-900 dark:text-[#F0EBE3]">
                    Print {batchSummary.totalCount} {batchSummary.totalCount === 1 ? 'wristband' : 'wristbands'}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-[#8C6B1C] dark:text-[#E0BC5C] bg-[#FAF6EB] dark:bg-[#2E2B22] px-2 py-0.5 rounded-full border border-[#E5D5AE]/80 dark:border-[#4A4328]/60">
                    Ready
                  </span>
                </div>
                <div className="text-xs text-zinc-600 dark:text-[#B8B0A5] space-y-1 pt-1 border-t border-[#EAE8E1] dark:border-[#302E29]">
                  <div className="font-medium text-[#C59B27]">{batchSummary.eventName}</div>
                  <div className="font-mono font-bold text-zinc-800 dark:text-[#F0EBE3] tracking-wide">
                    {batchSummary.firstCode} → {batchSummary.lastCode}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-[#7A7570]">
                    Number of labels: <span className="font-semibold text-zinc-700 dark:text-[#F0EBE3]">{batchSummary.totalCount}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-zinc-50 dark:bg-[#21211E] border border-dashed border-zinc-200 dark:border-[#302E29] rounded-xl flex items-center justify-between text-xs text-zinc-500 dark:text-[#B8B0A5]">
                <span>Batch preview not generated yet.</span>
                <button
                  type="button"
                  disabled={printLoading}
                  onClick={handleGeneratePrintBatch}
                  className="text-xs font-semibold text-[#C59B27] hover:underline cursor-pointer disabled:opacity-50"
                >
                  {printLoading ? 'Calculating...' : 'Calculate batch'}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-[#EAE8E1] dark:border-[#302E29]">
              <button
                type="button"
                onClick={() => {
                  setShowPrintModal(false);
                  setBatchSummary(null);
                }}
                className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={printLoading}
                  onClick={handlePreviewPrint}
                  className="px-4 py-2 bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] hover:bg-zinc-50 text-zinc-800 dark:text-[#F0EBE3] text-xs font-semibold rounded-xl shadow-3xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {printLoading ? (
                    <span>Loading...</span>
                  ) : (
                    <span>Preview print</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={printLoading}
                  onClick={handlePrintDirect}
                  className="px-5 py-2 bg-[#C59B27] hover:bg-[#b0881e] text-white text-xs font-semibold rounded-xl shadow-3xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

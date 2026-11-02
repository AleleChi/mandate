import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  CheckCircle,
  AlertCircle,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  X,
  Phone,
  Mail,
  Check,
  AlertTriangle,
  RefreshCw,
  Eye,
  MessageSquare,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import {
  api,
  extractApiError,
  SelectedParentAudienceChild,
  SelectedParentAudienceRow,
  SelectedParentsAudienceSummary,
  SelectedParentsSendDetail,
  SelectedParentsSendResponse
} from '../../../services/api';
import { useNotification } from '../../../context/NotificationContext';
import { AdminSelectionCheckbox } from '../../common/AdminSelectionCheckbox';
import { KoinoniaInlineLoader } from '../../common/KoinoniaInlineLoader';

interface SelectedParentsChannelTabProps {
  selectedEventId: string;
  adminUser?: any;
}

type SelectedParentRecord = SelectedParentAudienceRow;
type AudienceSummary = SelectedParentsAudienceSummary;
type SendResultDetail = SelectedParentsSendDetail;
type BulkSendSummaryData = SelectedParentsSendResponse;

export const SelectedParentsChannelTab: React.FC<SelectedParentsChannelTabProps> = ({
  selectedEventId,
  adminUser
}) => {
  const { showSuccess, showError } = useNotification();

  // Data fetching state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [parents, setParents] = useState<SelectedParentRecord[]>([]);
  const [summary, setSummary] = useState<AudienceSummary>({
    totalEligibleParents: 0,
    totalSelectedChildren: 0,
    invitationsNotSent: 0,
    invitationsSent: 0,
    invitationsFailed: 0,
    whatsappAvailable: 0,
    whatsappUnavailable: 0
  });
  const [eventTitle, setEventTitle] = useState('Current Event');
  const [templateConfigured, setTemplateConfigured] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Pagination state (default: 25 per page)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Template preview toggle
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_sent' | 'sent' | 'failed'>('all');
  const [whatsappFilter, setWhatsappFilter] = useState<'all' | 'available' | 'unavailable' | 'opted_out'>('all');
  const [selectedCountFilter, setSelectedCountFilter] = useState<'all' | '1' | '2_plus'>('all');
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>('all');

  // Controlled bulk selection (DEFAULT: 0 selected on load)
  const [selectedParentIds, setSelectedParentIds] = useState<string[]>([]);
  const [headerScopeMenuOpen, setHeaderScopeMenuOpen] = useState(false);
  const [toolbarScopeMenuOpen, setToolbarScopeMenuOpen] = useState(false);
  const [showCustomAmountModal, setShowCustomAmountModal] = useState(false);
  const [customAmountValue, setCustomAmountValue] = useState('');
  const [customAmountError, setCustomAmountError] = useState('');
  const [showConfirmLargeSelectModal, setShowConfirmLargeSelectModal] = useState(false);

  // Expandable family child details (inset rows)
  const [expandedParentIds, setExpandedParentIds] = useState<string[]>([]);

  // Modals & Action states
  const [singleSendTarget, setSingleSendTarget] = useState<SelectedParentRecord | null>(null);
  const [resendTarget, setResendTarget] = useState<SelectedParentRecord | null>(null);
  const [detailDrawerParent, setDetailDrawerParent] = useState<SelectedParentRecord | null>(null);
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState(false);
  const [bulkSkipAlreadySent, setBulkSkipAlreadySent] = useState(true);
  const [bulkResendConfirmed, setBulkResendConfirmed] = useState(false);
  const [bulkSendSummary, setBulkSendSummary] = useState<BulkSendSummaryData | null>(null);
  const [isSubmittingSend, setIsSubmittingSend] = useState(false);

  // Dropdown refs for click-outside
  const headerScopeMenuRef = useRef<HTMLDivElement>(null);
  const toolbarScopeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (headerScopeMenuRef.current && !headerScopeMenuRef.current.contains(event.target as Node)) {
        setHeaderScopeMenuOpen(false);
      }
      if (toolbarScopeMenuRef.current && !toolbarScopeMenuRef.current.contains(event.target as Node)) {
        setToolbarScopeMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch audience from backend with server-side pagination & filtering
  const fetchAudience = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setFetchError(null);

    try {
      const res = await api.getSelectedParentsAudience(selectedEventId, {
        search: searchQuery.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        whatsappStatus: whatsappFilter !== 'all' ? whatsappFilter : undefined,
        selectedCount: selectedCountFilter !== 'all' ? selectedCountFilter : undefined,
        ageGroup: ageGroupFilter !== 'all' ? ageGroupFilter : undefined,
        page: currentPage,
        pageSize
      });

      if (res && res.success) {
        setParents(res.parents || []);
        if (res.summary) {
          setSummary(res.summary);
        }
        setEventTitle(res.eventTitle || 'Current Event');
        setTemplateConfigured(Boolean(res.templateConfigured));
        if (res.pagination) {
          setTotalRecords(res.pagination.totalRecords);
          setTotalPages(res.pagination.totalPages);
        } else {
          setTotalRecords((res.parents || []).length);
          setTotalPages(1);
        }
      } else {
        throw new Error(res?.error || 'Failed to load selected parents audience');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      setFetchError(parsed.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Re-fetch when event, page, pageSize, or filters change
  useEffect(() => {
    fetchAudience();
  }, [selectedEventId, currentPage, pageSize, statusFilter, whatsappFilter, selectedCountFilter, ageGroupFilter, searchQuery]);

  // Reset to page 1 when filters or search change
  const handleFilterChange = (filterType: string, value: string) => {
    setCurrentPage(1);
    if (filterType === 'status') setStatusFilter(value as any);
    if (filterType === 'whatsapp') setWhatsappFilter(value as any);
    if (filterType === 'selectedCount') setSelectedCountFilter(value as any);
    if (filterType === 'ageGroup') setAgeGroupFilter(value);
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    statusFilter !== 'all' ||
    whatsappFilter !== 'all' ||
    selectedCountFilter !== 'all' ||
    ageGroupFilter !== 'all'
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setWhatsappFilter('all');
    setSelectedCountFilter('all');
    setAgeGroupFilter('all');
    setCurrentPage(1);
  };

  // Visible page parent IDs
  const visibleParentIds = useMemo(() => parents.map(p => p.parentId), [parents]);
  const isVisibleAllSelected = visibleParentIds.length > 0 && visibleParentIds.every(id => selectedParentIds.includes(id));
  const isIndeterminate = selectedParentIds.length > 0 && !isVisibleAllSelected;

  // Selected parents objects (from currently loaded list + preserving count)
  const selectedParentsList = useMemo(() => {
    return parents.filter(p => selectedParentIds.includes(p.parentId));
  }, [parents, selectedParentIds]);

  // Selection actions
  const handleToggleSelectParent = (id: string) => {
    setSelectedParentIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Header checkbox: selects ONLY currently visible page
  const handleToggleSelectVisible = () => {
    if (isVisibleAllSelected) {
      setSelectedParentIds(prev => prev.filter(id => !visibleParentIds.includes(id)));
    } else {
      setSelectedParentIds(prev => Array.from(new Set([...prev, ...visibleParentIds])));
    }
  };

  const handleSelectFirstN = (n: number) => {
    const subset = visibleParentIds.slice(0, n);
    setSelectedParentIds(subset);
    setHeaderScopeMenuOpen(false);
    setToolbarScopeMenuOpen(false);
  };

  const handleSelectAllFilteredConfirmed = async () => {
    try {
      setLoading(true);
      const res = await api.getSelectedParentsAudience(selectedEventId, {
        search: searchQuery.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        whatsappStatus: whatsappFilter !== 'all' ? whatsappFilter : undefined,
        selectedCount: selectedCountFilter !== 'all' ? selectedCountFilter : undefined,
        ageGroup: ageGroupFilter !== 'all' ? ageGroupFilter : undefined,
        page: 1,
        pageSize: 1000
      });
      if (res && res.parents) {
        setSelectedParentIds(res.parents.map(p => p.parentId));
      }
    } catch (e: any) {
      showError('Selection failed', e?.message || 'Could not select all parents');
    } finally {
      setLoading(false);
      setShowConfirmLargeSelectModal(false);
      setHeaderScopeMenuOpen(false);
      setToolbarScopeMenuOpen(false);
    }
  };

  const handleSelectAllFilteredClick = () => {
    if (totalRecords > 50) {
      setShowConfirmLargeSelectModal(true);
    } else {
      handleSelectAllFilteredConfirmed();
    }
  };

  const handleCustomAmountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(customAmountValue, 10);
    if (isNaN(count) || count <= 0) {
      setCustomAmountError('Please enter a valid positive number');
      return;
    }
    const safeCount = Math.min(count, visibleParentIds.length);
    setSelectedParentIds(visibleParentIds.slice(0, safeCount));
    setShowCustomAmountModal(false);
    setCustomAmountValue('');
    setCustomAmountError('');
    setHeaderScopeMenuOpen(false);
    setToolbarScopeMenuOpen(false);
  };

  const toggleExpandParent = (parentId: string) => {
    setExpandedParentIds(prev =>
      prev.includes(parentId) ? prev.filter(id => id !== parentId) : [...prev, parentId]
    );
  };

  // Individual dispatch execution
  const executeIndividualSend = async (target: SelectedParentRecord, isResend: boolean) => {
    if (!templateConfigured) {
      showError('Template unconfigured', 'Sending is unavailable until the approved Zoho template key is configured.');
      return;
    }

    setIsSubmittingSend(true);
    try {
      const res = await api.sendSelectedParentsChannelInvitations({
        eventId: selectedEventId,
        parentIds: [target.parentId],
        resend: isResend,
        skipAlreadySent: !isResend
      });

      if (res.success && res.sentCount > 0) {
        showSuccess('Invitation sent', `WhatsApp Channel invitation successfully dispatched to ${target.fullName}.`);
        setSingleSendTarget(null);
        setResendTarget(null);
        await fetchAudience(true);
      } else {
        const failure = res.details?.find(d => d.parentId === target.parentId);
        const reason = failure?.reason || res.error || 'Failed to dispatch invitation';
        showError('Send unsuccessful', reason);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Dispatch error', parsed.message);
    } finally {
      setIsSubmittingSend(false);
    }
  };

  // Bulk dispatch execution
  const executeBulkSend = async () => {
    if (!templateConfigured) {
      showError('Template unconfigured', 'Sending is unavailable until the approved Zoho template key is configured.');
      return;
    }

    if (selectedParentIds.length === 0) return;

    setIsSubmittingSend(true);
    try {
      const res = await api.sendSelectedParentsChannelInvitations({
        eventId: selectedEventId,
        parentIds: selectedParentIds,
        resend: !bulkSkipAlreadySent,
        skipAlreadySent: bulkSkipAlreadySent
      });

      setShowBulkConfirmModal(false);
      setBulkSendSummary(res);
      await fetchAudience(true);
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Bulk dispatch error', parsed.message);
    } finally {
      setIsSubmittingSend(false);
    }
  };

  // Helper date formatter
  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  // Bulk validation breakdown
  const bulkBreakdown = useMemo(() => {
    const list = selectedParentsList;
    const ready = list.filter(p => p.whatsappAvailability === 'available' && (p.whatsappSendCount || 0) === 0).length;
    const previouslySent = list.filter(p => (p.whatsappSendCount || 0) > 0).length;
    const optedOut = list.filter(p => p.whatsappAvailability === 'opted_out').length;
    const invalidNumber = list.filter(p => p.whatsappAvailability === 'invalid_number').length;
    const totalSelectedChildren = list.reduce((sum, p) => sum + p.selectedChildrenCount, 0);

    return {
      totalParents: selectedParentIds.length,
      totalSelectedChildren,
      ready,
      previouslySent,
      optedOut,
      invalidNumber
    };
  }, [selectedParentsList, selectedParentIds]);

  return (
    <div className="space-y-4 text-stone-900 font-sans">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 pb-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900">
            Selected Parents Channel
          </h1>
          <p className="text-sm text-stone-600 mt-0.5">
            Manage WhatsApp Channel invitations for parents and guardians of selected children.
          </p>
          <p className="text-xs text-stone-600 mt-1">
            The General Assembly · {eventTitle}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            id="selected-parents-preview-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:bg-stone-50 transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-stone-500" />
            Preview message
          </button>

          <button
            type="button"
            onClick={() => fetchAudience(true)}
            disabled={refreshing || loading}
            id="selected-parents-refresh-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:bg-stone-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-stone-500 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 2. TEMPLATE OPERATIONAL NOTICE */}
      {!templateConfigured ? (
        <div className="h-[48px] px-3.5 bg-amber-50/70 border border-amber-200/80 rounded-md flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="truncate">
              WhatsApp template not configured · Sending is unavailable until the approved Zoho template key is added to Render.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="text-amber-900 underline font-medium hover:text-amber-950 ml-3 shrink-0"
          >
            Template setup
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-stone-600 pb-0.5">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
          <span>WhatsApp template ready</span>
        </div>
      )}

      {/* 3. ONE FLAT SUMMARY STRIP */}
      <div className="bg-white border border-stone-200 rounded-md px-4 py-2.5 flex flex-wrap items-center text-xs divide-x divide-stone-200 text-stone-600">
        <div className="pr-4 py-0.5 flex items-baseline gap-1.5">
          <span className="font-semibold text-stone-900 text-sm">{summary.totalEligibleParents}</span>
          <span>eligible parents</span>
        </div>

        <div className="px-4 py-0.5 flex items-baseline gap-1.5">
          <span className="font-semibold text-stone-900 text-sm">{summary.totalSelectedChildren ?? 0}</span>
          <span>selected children</span>
        </div>

        <div className="px-4 py-0.5 flex items-baseline gap-1.5">
          <span className="font-semibold text-stone-900 text-sm">{summary.invitationsNotSent}</span>
          <span>not sent</span>
        </div>

        <div className="px-4 py-0.5 flex items-baseline gap-1.5">
          <span className="font-semibold text-stone-900 text-sm">{summary.invitationsSent}</span>
          <span>sent</span>
        </div>

        <div className="px-4 py-0.5 flex items-baseline gap-1.5">
          <span className={`font-semibold text-sm ${summary.invitationsFailed > 0 ? 'text-red-600' : 'text-stone-900'}`}>
            {summary.invitationsFailed}
          </span>
          <span>failed</span>
        </div>

        <div className="pl-4 py-0.5 flex items-baseline gap-1.5">
          <span className="font-semibold text-stone-900 text-sm">{summary.whatsappAvailable}</span>
          <span>WhatsApp ready</span>
        </div>
      </div>

      {/* 4. COMPACT FILTER TOOLBAR */}
      <div className="bg-white border border-stone-200 rounded-md p-2.5 flex flex-col md:flex-row items-stretch md:items-center gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-stone-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search parent, child, phone or email"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            id="selected-parents-search-input"
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-md text-stone-900 placeholder:text-stone-600 focus:outline-none focus:ring-1 focus:ring-stone-400 focus:bg-white transition-colors"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <select
            value={statusFilter}
            onChange={e => handleFilterChange('status', e.target.value)}
            id="selected-parents-status-filter"
            className="text-xs py-1.5 px-2 bg-white border border-stone-200 rounded-md text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
          >
            <option value="all">Invitation: All</option>
            <option value="not_sent">Not sent</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={whatsappFilter}
            onChange={e => handleFilterChange('whatsapp', e.target.value)}
            id="selected-parents-whatsapp-filter"
            className="text-xs py-1.5 px-2 bg-white border border-stone-200 rounded-md text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
          >
            <option value="all">WhatsApp: All</option>
            <option value="available">Ready</option>
            <option value="unavailable">Unavailable</option>
            <option value="opted_out">Opted out</option>
          </select>

          <select
            value={selectedCountFilter}
            onChange={e => handleFilterChange('selectedCount', e.target.value)}
            id="selected-parents-count-filter"
            className="text-xs py-1.5 px-2 bg-white border border-stone-200 rounded-md text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
          >
            <option value="all">Selected: All</option>
            <option value="1">1 child</option>
            <option value="2_plus">2+ children</option>
          </select>

          <select
            value={ageGroupFilter}
            onChange={e => handleFilterChange('ageGroup', e.target.value)}
            id="selected-parents-agegroup-filter"
            className="text-xs py-1.5 px-2 bg-white border border-stone-200 rounded-md text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400"
          >
            <option value="all">Age group: All</option>
            <option value="2–3">2–3</option>
            <option value="4–6">4–6</option>
            <option value="7–9">7–9</option>
            <option value="10–12">10–12</option>
            <option value="13–14">13–14</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              id="selected-parents-reset-filters-btn"
              className="text-xs text-stone-700 hover:text-stone-900 underline px-1 py-1 transition-colors"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* 5. BULK ACTION BAR (Appears ONLY after >= 1 selection) */}
      {selectedParentIds.length > 0 && (
        <div className="bg-[#FAF8F5] border border-stone-300 rounded-md px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-900">
              {selectedParentIds.length} {selectedParentIds.length === 1 ? 'parent' : 'parents'} selected
            </span>
            <span className="text-stone-400">·</span>
            <span className="text-stone-600">
              {bulkBreakdown.totalSelectedChildren} selected children
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative" ref={toolbarScopeMenuRef}>
              <button
                type="button"
                onClick={() => setToolbarScopeMenuOpen(!toolbarScopeMenuOpen)}
                id="selected-parents-change-selection-btn"
                className="px-2.5 py-1 text-xs text-stone-700 hover:text-stone-900 bg-white border border-stone-200 rounded hover:bg-stone-50 transition-colors inline-flex items-center gap-1"
              >
                Change selection
                <ChevronDown className="w-3 h-3 text-stone-500" />
              </button>

              {toolbarScopeMenuOpen && (
                <div className="absolute right-0 mt-1 w-52 bg-white border border-stone-200 rounded shadow-md z-30 py-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedParentIds(visibleParentIds);
                      setToolbarScopeMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                  >
                    Select visible ({visibleParentIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectFirstN(10)}
                    className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                  >
                    Select first 10
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectFirstN(25)}
                    className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                  >
                    Select first 25
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectFirstN(50)}
                    className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                  >
                    Select first 50
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectFirstN(100)}
                    className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                  >
                    Select first 100
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomAmountModal(true);
                      setToolbarScopeMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                  >
                    Select custom amount…
                  </button>
                  <div className="border-t border-stone-100 my-1"></div>
                  <button
                    type="button"
                    onClick={handleSelectAllFilteredClick}
                    className="w-full text-left px-3 py-1.5 font-medium text-stone-900 hover:bg-stone-50"
                  >
                    Select all filtered ({totalRecords})
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setBulkSkipAlreadySent(true);
                setBulkResendConfirmed(false);
                setShowBulkConfirmModal(true);
              }}
              disabled={!templateConfigured || isSubmittingSend}
              id="selected-parents-bulk-send-btn"
              className="px-3 py-1 text-xs font-semibold text-stone-950 bg-[#C5A572] hover:bg-[#b89560] active:bg-[#a68450] rounded transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              Send WhatsApp invitation
            </button>

            <button
              type="button"
              onClick={() => setSelectedParentIds([])}
              id="selected-parents-clear-selection-btn"
              className="text-xs text-stone-500 hover:text-stone-800 px-1 py-1 underline transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* 6. FLAT OPERATIONAL TABLE */}
      <div className="bg-white border border-stone-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <KoinoniaInlineLoader label="Loading selected parents audience..." />
          </div>
        ) : fetchError ? (
          <div className="py-12 px-4 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-stone-900">{fetchError}</p>
            <button
              type="button"
              onClick={() => fetchAudience(true)}
              className="mt-3 px-3 py-1.5 text-xs text-stone-700 bg-white border border-stone-200 rounded hover:bg-stone-50"
            >
              Try again
            </button>
          </div>
        ) : parents.length === 0 ? (
          <div className="py-12 px-4 text-center text-stone-500 text-xs">
            No parents matched the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="selected-parents-table">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-medium text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-10 text-center">
                    <div className="relative inline-flex items-center" ref={headerScopeMenuRef}>
                      <AdminSelectionCheckbox
                        checked={isVisibleAllSelected}
                        indeterminate={isIndeterminate}
                        onChange={handleToggleSelectVisible}
                        ariaLabel="Select visible rows"
                      />
                      <button
                        type="button"
                        onClick={() => setHeaderScopeMenuOpen(!headerScopeMenuOpen)}
                        id="selected-parents-header-scope-btn"
                        className="ml-1 text-stone-400 hover:text-stone-700 focus:outline-none"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>

                      {headerScopeMenuOpen && (
                        <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-stone-200 rounded shadow-md z-30 py-1 text-xs normal-case tracking-normal">
                          <button
                            type="button"
                            onClick={() => {
                              handleToggleSelectVisible();
                              setHeaderScopeMenuOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                          >
                            Select visible ({visibleParentIds.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectFirstN(10)}
                            className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                          >
                            Select first 10
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectFirstN(25)}
                            className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                          >
                            Select first 25
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectFirstN(50)}
                            className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                          >
                            Select first 50
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectFirstN(100)}
                            className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                          >
                            Select first 100
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowCustomAmountModal(true);
                              setHeaderScopeMenuOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-stone-50"
                          >
                            Select custom amount…
                          </button>
                          <div className="border-t border-stone-100 my-1"></div>
                          <button
                            type="button"
                            onClick={handleSelectAllFilteredClick}
                            className="w-full text-left px-3 py-1.5 font-medium text-stone-900 hover:bg-stone-50"
                          >
                            Select all filtered ({totalRecords})
                          </button>
                        </div>
                      )}
                    </div>
                  </th>

                  <th className="py-2.5 px-3 min-w-[200px]">Parent / Contact</th>
                  <th className="py-2.5 px-3 min-w-[120px]">Children</th>
                  <th className="py-2.5 px-3 min-w-[140px]">Selected</th>
                  <th className="py-2.5 px-3 min-w-[100px]">WhatsApp</th>
                  <th className="py-2.5 px-3 min-w-[120px]">Invitation</th>
                  <th className="py-2.5 px-3 text-center min-w-[60px]">Sends</th>
                  <th className="py-2.5 px-3 min-w-[120px]">Last sent</th>
                  <th className="py-2.5 px-3 text-right min-w-[140px]">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100 text-xs">
                {parents.map(parent => {
                  const isSelected = selectedParentIds.includes(parent.parentId);
                  const isExpanded = expandedParentIds.includes(parent.parentId);
                  const sendCount = parent.whatsappSendCount ?? 0;

                  return (
                    <React.Fragment key={parent.parentId}>
                      <tr
                        className={`hover:bg-stone-50/70 transition-colors h-[60px] ${isSelected ? 'bg-amber-50/30' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="py-2 px-3 text-center">
                          <AdminSelectionCheckbox
                            checked={isSelected}
                            onChange={() => handleToggleSelectParent(parent.parentId)}
                            ariaLabel={`Select ${parent.fullName}`}
                          />
                        </td>

                        {/* Parent / Contact */}
                        <td className="py-2 px-3">
                          <div className="font-semibold text-stone-900 leading-tight">
                            {parent.fullName}
                          </div>
                          <div className="text-[11px] text-stone-500 mt-0.5 truncate">
                            {parent.whatsappNumber || parent.phoneNumber || 'No phone'}
                            {parent.email ? ` · ${parent.email}` : ''}
                          </div>
                        </td>

                        {/* Children */}
                        <td className="py-2 px-3">
                          <div className="text-stone-700 leading-tight">
                            {parent.totalRegisteredChildren} registered
                          </div>
                          <div className="text-stone-500 text-[11px]">
                            {parent.selectedChildrenCount} selected
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleExpandParent(parent.parentId)}
                            className="text-[11px] text-stone-600 hover:text-stone-900 inline-flex items-center gap-0.5 mt-0.5 transition-colors"
                          >
                            <span>View children</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </td>

                        {/* Selected */}
                        <td className="py-2 px-3">
                          <div className="text-stone-900 font-medium">
                            {parent.selectedChildrenCount} of {parent.totalRegisteredChildren}
                          </div>
                          <div className="text-[11px] text-stone-600 mt-0.5 truncate max-w-[160px]" title={parent.selectedChildNames}>
                            {parent.selectedChildNames}
                          </div>
                        </td>

                        {/* WhatsApp */}
                        <td className="py-2 px-3">
                          {parent.whatsappAvailability === 'available' ? (
                            <span className="text-stone-700">Ready</span>
                          ) : parent.whatsappAvailability === 'opted_out' ? (
                            <span className="text-amber-800">Opted out</span>
                          ) : (
                            <span className="text-amber-800">Unavailable</span>
                          )}
                        </td>

                        {/* Invitation */}
                        <td className="py-2 px-3">
                          {parent.invitationStatus === 'sent' ? (
                            <div>
                              <span className="text-stone-900 font-medium">Sent</span>
                              {parent.sentAt && (
                                <div className="text-[10px] text-stone-500 mt-0.5">
                                  {formatDateTime(parent.sentAt)}
                                </div>
                              )}
                            </div>
                          ) : parent.invitationStatus === 'failed' ? (
                            <div>
                              <span className="text-red-600 font-medium">Failed</span>
                              <div
                                className="text-[10px] text-stone-500 underline cursor-pointer mt-0.5"
                                onClick={() => setDetailDrawerParent(parent)}
                              >
                                View reason
                              </div>
                            </div>
                          ) : (
                            <span className="text-stone-500">Not sent</span>
                          )}

                          {parent.emailChannelAccessSent && (
                            <div className="text-[10px] text-stone-400 mt-0.5">
                              Email sent
                            </div>
                          )}
                        </td>

                        {/* Sends */}
                        <td className="py-2 px-3 text-center font-medium text-stone-800">
                          {sendCount}
                        </td>

                        {/* Last sent */}
                        <td className="py-2 px-3 text-stone-600 text-[11px]">
                          {formatDateTime(parent.lastWhatsappSentAt || parent.sentAt)}
                        </td>

                        {/* Action */}
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!templateConfigured ? (
                              <button
                                type="button"
                                disabled
                                title="Configure the approved Zoho template in Render to enable WhatsApp sending."
                                className="px-2.5 py-1 text-xs text-stone-400 bg-stone-100 border border-stone-200 rounded cursor-not-allowed"
                              >
                                Sending unavailable
                              </button>
                            ) : sendCount === 0 ? (
                              <button
                                type="button"
                                onClick={() => setSingleSendTarget(parent)}
                                disabled={parent.whatsappAvailability !== 'available'}
                                className="px-2.5 py-1 text-xs font-semibold text-stone-950 bg-[#C5A572] hover:bg-[#b89560] rounded transition-colors disabled:opacity-40"
                              >
                                Send
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setResendTarget(parent)}
                                disabled={parent.whatsappAvailability !== 'available'}
                                className="px-2.5 py-1 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded transition-colors disabled:opacity-40"
                              >
                                Resend
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setDetailDrawerParent(parent)}
                              className="text-xs text-stone-500 hover:text-stone-800 underline transition-colors"
                            >
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* 10. EXPANDED INSET CHILD ROW */}
                      {isExpanded && (
                        <tr className="bg-stone-50/50">
                          <td colSpan={9} className="py-2.5 px-6 border-y border-stone-200">
                            <div className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1.5">
                              Children
                            </div>
                            <div className="divide-y divide-stone-200 max-w-2xl bg-white border border-stone-200 rounded">
                              {parent.children.map(child => {
                                const ageDisplay = child.calculatedAge !== null && child.calculatedAge !== undefined
                                  ? `${child.calculatedAge} yrs`
                                  : '';
                                const groupDisplay = child.ageGroup || '';
                                const ageGroupLine = [ageDisplay, groupDisplay].filter(Boolean).join(' · ');

                                return (
                                  <div
                                    key={child.id}
                                    className="py-1.5 px-3 flex items-center justify-between text-xs"
                                  >
                                    <div className="font-medium text-stone-900 min-w-[180px]">
                                      {child.fullName}
                                    </div>
                                    <div className="text-stone-500 text-[11px] min-w-[120px]">
                                      {ageGroupLine || '—'}
                                    </div>
                                    <div className="text-right">
                                      {child.isSelected ? (
                                        <span className="font-semibold text-[#a88242]">
                                          Selected
                                        </span>
                                      ) : (
                                        <span className="text-stone-500 capitalize">
                                          {child.status.replace(/_/g, ' ')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 7. PAGINATION FOOTER */}
        {!loading && parents.length > 0 && (
          <div className="border-t border-stone-200 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-600">
            <div>
              Showing {Math.min((currentPage - 1) * pageSize + 1, totalRecords)}–{Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} parents
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                id="selected-parents-prev-page-btn"
                className="px-2.5 py-1 text-xs text-stone-700 bg-white border border-stone-200 rounded hover:bg-stone-50 disabled:opacity-40 transition-colors"
              >
                Previous
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setCurrentPage(pageNumber)}
                  className={`w-7 h-7 text-xs rounded transition-colors ${
                    pageNumber === currentPage
                      ? 'bg-stone-900 text-white font-medium'
                      : 'text-stone-700 hover:bg-stone-100 bg-white border border-stone-200'
                  }`}
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                id="selected-parents-next-page-btn"
                className="px-2.5 py-1 text-xs text-stone-700 bg-white border border-stone-200 rounded hover:bg-stone-50 disabled:opacity-40 transition-colors"
              >
                Next
              </button>

              <div className="ml-3 pl-3 border-l border-stone-200 flex items-center gap-1">
                <span className="text-stone-500">Rows:</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-stone-200 rounded py-0.5 px-1.5 text-xs text-stone-700 focus:outline-none"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 8. SLIDE-OVER DETAILS DRAWER */}
      {detailDrawerParent && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 flex justify-end">
          <div className="w-full max-w-md bg-white shadow-xl h-full flex flex-col p-5 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h2 className="text-base font-bold text-stone-900">
                Parent Details
              </h2>
              <button
                type="button"
                onClick={() => setDetailDrawerParent(null)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-5 text-xs">
              {/* Parent Info */}
              <div>
                <h3 className="font-semibold text-stone-800 uppercase tracking-wider text-[11px] mb-2">
                  Parent
                </h3>
                <div className="bg-stone-50 border border-stone-200 rounded p-3 space-y-1.5">
                  <div className="text-sm font-semibold text-stone-900">
                    {detailDrawerParent.fullName}
                  </div>
                  <div className="text-stone-600 flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-stone-400" />
                    <span>{detailDrawerParent.whatsappNumber || detailDrawerParent.phoneNumber || 'None'}</span>
                  </div>
                  {detailDrawerParent.email && (
                    <div className="text-stone-600 flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-stone-400" />
                      <span>{detailDrawerParent.email}</span>
                    </div>
                  )}
                  <div className="text-stone-500 pt-1 text-[11px]">
                    WhatsApp Consent: <span className="font-medium capitalize text-stone-800">{detailDrawerParent.whatsappConsentStatus}</span>
                  </div>
                </div>
              </div>

              {/* Children List */}
              <div>
                <h3 className="font-semibold text-stone-800 uppercase tracking-wider text-[11px] mb-2">
                  Registered Children ({detailDrawerParent.children.length})
                </h3>
                <div className="border border-stone-200 rounded divide-y divide-stone-100">
                  {detailDrawerParent.children.map(c => (
                    <div key={c.id} className="py-2 px-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-stone-900">{c.fullName}</div>
                        <div className="text-[11px] text-stone-500">
                          {c.calculatedAge ? `${c.calculatedAge} yrs · ` : ''}{c.ageGroup || 'No group'}
                        </div>
                      </div>
                      <div>
                        {c.isSelected ? (
                          <span className="font-semibold text-[#a88242]">Selected</span>
                        ) : (
                          <span className="text-stone-500 capitalize">{c.status.replace(/_/g, ' ')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Communication Summary */}
              <div>
                <h3 className="font-semibold text-stone-800 uppercase tracking-wider text-[11px] mb-2">
                  Channel Invitation Summary
                </h3>
                <div className="bg-stone-50 border border-stone-200 rounded p-3 space-y-1 text-stone-600">
                  <div>
                    WhatsApp invitations sent:{' '}
                    <span className="font-semibold text-stone-900">
                      {detailDrawerParent.whatsappSendCount ?? (detailDrawerParent.invitationStatus === 'sent' ? 1 : 0)}
                    </span>
                  </div>
                  <div>
                    Last sent:{' '}
                    <span className="font-semibold text-stone-900">
                      {formatDateTime(detailDrawerParent.lastWhatsappSentAt || detailDrawerParent.sentAt)}
                    </span>
                  </div>
                  <div>
                    Email access sent:{' '}
                    <span className="font-semibold text-stone-900">
                      {detailDrawerParent.emailChannelAccessSent ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Chronological History Table */}
              <div>
                <h3 className="font-semibold text-stone-800 uppercase tracking-wider text-[11px] mb-2">
                  Channel Invitation History
                </h3>
                {(!detailDrawerParent.communicationHistory || detailDrawerParent.communicationHistory.length === 0) ? (
                  <div className="text-stone-500 italic p-3 bg-stone-50 border border-stone-200 rounded">
                    No communication attempts recorded yet.
                  </div>
                ) : (
                  <div className="border border-stone-200 rounded overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-stone-100 text-[10px] uppercase text-stone-500 font-semibold border-b border-stone-200">
                        <tr>
                          <th className="py-1.5 px-2.5">Date / time</th>
                          <th className="py-1.5 px-2.5">Channel</th>
                          <th className="py-1.5 px-2.5">Result</th>
                          <th className="py-1.5 px-2.5">Provider ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 text-[11px]">
                        {detailDrawerParent.communicationHistory.map((item, idx) => (
                          <tr key={item.id || idx}>
                            <td className="py-1.5 px-2.5 text-stone-600">
                              {formatDateTime(item.sentAt || item.attemptedAt)}
                            </td>
                            <td className="py-1.5 px-2.5 capitalize text-stone-800 font-medium">
                              {item.channel}
                            </td>
                            <td className="py-1.5 px-2.5">
                              {item.status === 'sent' ? (
                                <span className="text-emerald-700 font-medium">Sent</span>
                              ) : item.status === 'failed' ? (
                                <div>
                                  <span className="text-red-600 font-medium">Failed</span>
                                  {item.failureReason && (
                                    <div className="text-[10px] text-stone-500">{item.failureReason}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-stone-500 capitalize">{item.status}</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 text-stone-500 font-mono text-[10px] truncate max-w-[100px]">
                              {item.providerMessageId || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-stone-200 mt-auto">
              <button
                type="button"
                onClick={() => setDetailDrawerParent(null)}
                className="w-full py-1.5 text-xs text-stone-700 bg-stone-100 hover:bg-stone-200 rounded font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. INDIVIDUAL FIRST SEND CONFIRMATION MODAL */}
      {singleSendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-md shadow-lg max-w-sm w-full p-5 text-xs">
            <h3 className="text-sm font-bold text-stone-900 mb-2">
              Send Parents Channel invitation?
            </h3>
            <p className="text-stone-600 mb-3">
              Send WhatsApp Channel invitation to <strong className="text-stone-900">{singleSendTarget.fullName}</strong>?
            </p>

            <div className="bg-stone-50 border border-stone-200 rounded p-2.5 mb-4 space-y-1 text-stone-600">
              <div>WhatsApp: <strong className="text-stone-900">{singleSendTarget.whatsappNumber || singleSendTarget.phoneNumber}</strong></div>
              <div>Selected children: <strong className="text-stone-900">{singleSendTarget.selectedChildNames}</strong></div>
              <div>Previous sends: <strong className="text-stone-900">{singleSendTarget.whatsappSendCount ?? 0}</strong></div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSingleSendTarget(null)}
                disabled={isSubmittingSend}
                className="px-3 py-1.5 text-xs text-stone-700 bg-white border border-stone-200 rounded hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeIndividualSend(singleSendTarget, false)}
                disabled={isSubmittingSend}
                className="px-3 py-1.5 text-xs font-semibold text-stone-950 bg-[#C5A572] hover:bg-[#b89560] rounded disabled:opacity-50"
              >
                {isSubmittingSend ? 'Sending...' : 'Send invitation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. INDIVIDUAL RESEND CONFIRMATION MODAL */}
      {resendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-md shadow-lg max-w-sm w-full p-5 text-xs">
            <h3 className="text-sm font-bold text-stone-900 mb-2">
              Send again?
            </h3>
            <p className="text-stone-600 mb-3">
              This parent has already received the Parents Channel invitation{' '}
              <strong className="text-stone-900">
                {resendTarget.whatsappSendCount || 1} {resendTarget.whatsappSendCount === 1 ? 'time' : 'times'}
              </strong>.
            </p>

            <div className="bg-stone-50 border border-stone-200 rounded p-2.5 mb-4 space-y-1 text-stone-600">
              <div>Parent: <strong className="text-stone-900">{resendTarget.fullName}</strong></div>
              <div>Last sent: <strong className="text-stone-900">{formatDateTime(resendTarget.lastWhatsappSentAt || resendTarget.sentAt)}</strong></div>
              <div>Selected children: <strong className="text-stone-900">{resendTarget.selectedChildNames}</strong></div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setResendTarget(null)}
                disabled={isSubmittingSend}
                className="px-3 py-1.5 text-xs text-stone-700 bg-white border border-stone-200 rounded hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeIndividualSend(resendTarget, true)}
                disabled={isSubmittingSend}
                className="px-3 py-1.5 text-xs font-semibold text-stone-950 bg-[#C5A572] hover:bg-[#b89560] rounded disabled:opacity-50"
              >
                {isSubmittingSend ? 'Sending...' : 'Send again'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. BULK VALIDATION SCREEN & SAFETY MODAL */}
      {showBulkConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-md shadow-lg max-w-md w-full p-5 text-xs">
            <h3 className="text-sm font-bold text-stone-900 mb-1">
              Send Parents Channel invitation
            </h3>
            <p className="text-stone-500 mb-3">
              {bulkBreakdown.totalParents} parents selected
            </p>

            <div className="bg-stone-50 border border-stone-200 rounded p-3 mb-4 space-y-1.5">
              <div className="flex justify-between">
                <span>Ready to send:</span>
                <strong className="text-stone-900">{bulkBreakdown.ready}</strong>
              </div>
              <div className="flex justify-between">
                <span>Previously sent:</span>
                <strong className="text-stone-900">{bulkBreakdown.previouslySent}</strong>
              </div>
              <div className="flex justify-between">
                <span>Opted out:</span>
                <strong className="text-amber-800">{bulkBreakdown.optedOut}</strong>
              </div>
              <div className="flex justify-between">
                <span>Invalid number:</span>
                <strong className="text-amber-800">{bulkBreakdown.invalidNumber}</strong>
              </div>
            </div>

            {/* Skip previously sent option */}
            <div className="border border-stone-200 rounded p-2.5 mb-4">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkSkipAlreadySent}
                  onChange={e => {
                    setBulkSkipAlreadySent(e.target.checked);
                    setBulkResendConfirmed(false);
                  }}
                  className="mt-0.5 rounded border-stone-300 text-stone-900 focus:ring-0"
                />
                <div>
                  <div className="font-semibold text-stone-900">
                    Skip parents already sent
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Recommended. Protects against duplicate messages.
                  </div>
                </div>
              </label>

              {/* Warning if unchecked */}
              {!bulkSkipAlreadySent && bulkBreakdown.previouslySent > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-stone-200 text-amber-900">
                  <div className="font-medium">
                    {bulkBreakdown.previouslySent} {bulkBreakdown.previouslySent === 1 ? 'parent' : 'parents'} will receive the invitation again.
                  </div>
                  <label className="flex items-center gap-1.5 mt-1.5 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkResendConfirmed}
                      onChange={e => setBulkResendConfirmed(e.target.checked)}
                      className="rounded border-stone-300 text-stone-900 focus:ring-0"
                    />
                    <span>I confirm I deliberately want to resend to these parents.</span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkConfirmModal(false)}
                disabled={isSubmittingSend}
                className="px-3 py-1.5 text-xs text-stone-700 bg-white border border-stone-200 rounded hover:bg-stone-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={executeBulkSend}
                disabled={
                  isSubmittingSend ||
                  (!bulkSkipAlreadySent && bulkBreakdown.previouslySent > 0 && !bulkResendConfirmed)
                }
                className="px-3.5 py-1.5 text-xs font-semibold text-stone-950 bg-[#C5A572] hover:bg-[#b89560] rounded disabled:opacity-50 transition-colors"
              >
                {isSubmittingSend ? 'Sending...' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 12. SEND OUTCOME DIALOG */}
      {bulkSendSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-md shadow-lg max-w-md w-full p-5 text-xs">
            <h3 className="text-sm font-bold text-stone-900 mb-2">
              WhatsApp invitations complete
            </h3>

            <div className="bg-stone-50 border border-stone-200 rounded p-3 mb-4 space-y-1">
              <div className="flex justify-between">
                <span>Sent:</span>
                <strong className="text-emerald-700">{bulkSendSummary.sentCount}</strong>
              </div>
              <div className="flex justify-between">
                <span>Skipped:</span>
                <strong className="text-stone-700">{bulkSendSummary.skippedCount}</strong>
              </div>
              <div className="flex justify-between">
                <span>Failed:</span>
                <strong className={bulkSendSummary.failedCount > 0 ? 'text-red-600' : 'text-stone-700'}>
                  {bulkSendSummary.failedCount}
                </strong>
              </div>
            </div>

            {/* Exceptions only */}
            {bulkSendSummary.details.filter(d => d.status !== 'sent').length > 0 && (
              <div className="mb-4">
                <div className="font-semibold text-stone-800 uppercase tracking-wider text-[11px] mb-1.5">
                  Exceptions ({bulkSendSummary.details.filter(d => d.status !== 'sent').length})
                </div>
                <div className="border border-stone-200 rounded max-h-48 overflow-y-auto divide-y divide-stone-100 text-[11px]">
                  {bulkSendSummary.details
                    .filter(d => d.status !== 'sent')
                    .map((item, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between">
                        <span className="font-medium text-stone-900">{item.parentName}</span>
                        <span className="text-stone-500">{item.reason || item.status}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setBulkSendSummary(null);
                  setSelectedParentIds([]);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-stone-900 bg-stone-100 hover:bg-stone-200 rounded transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 13. TEMPLATE PREVIEW MODAL */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-md shadow-lg max-w-lg w-full p-5 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200 mb-3">
              <h3 className="text-sm font-bold text-stone-900">
                WhatsApp Template Preview
              </h3>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-stone-50 border border-stone-200 rounded p-3 text-stone-700 leading-relaxed font-sans text-xs">
                <p>Hi <span className="font-semibold text-stone-900 bg-stone-200/60 px-1 py-0.5 rounded">{'{{parent_first_name}}'}</span>,</p>
                <p className="mt-2">
                  Selection has been confirmed for <span className="font-semibold text-stone-900 bg-stone-200/60 px-1 py-0.5 rounded">{'{{selected_child_names}}'}</span> for the Koinonia General Assembly Children's Session 2026.
                </p>
                <p className="mt-2">
                  Please follow the official Parents Channel for important Children's Session updates, including arrival, check-in and pickup information:
                </p>
                <p className="mt-2 text-blue-600 font-mono text-[11px] break-all">
                  https://whatsapp.com/channel/0029VbE5UslCHDykcFlf3y0U
                </p>
                <p className="mt-2 text-stone-500 text-[11px]">
                  This channel is for registered parents and guardians of selected children only. Please do not share this link with others.
                </p>
              </div>

              <div className="text-[11px] text-stone-500">
                <div><strong>Template Alias:</strong> <code className="text-stone-800">koinonia_selected_parent_channel_v2</code></div>
                <div><strong>Merge Fields:</strong> <code className="text-stone-800">parent_first_name</code>, <code className="text-stone-800">selected_child_names</code></div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-3 py-1.5 text-xs text-stone-700 bg-stone-100 hover:bg-stone-200 rounded font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 14. CUSTOM AMOUNT MODAL */}
      {showCustomAmountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleCustomAmountSubmit} className="bg-white rounded-md shadow-lg max-w-xs w-full p-4 text-xs">
            <h3 className="text-sm font-bold text-stone-900 mb-2">
              Select Custom Amount
            </h3>
            <p className="text-stone-600 mb-3">
              Enter number of parents to select from visible rows:
            </p>
            <input
              type="number"
              min={1}
              max={visibleParentIds.length}
              value={customAmountValue}
              onChange={e => setCustomAmountValue(e.target.value)}
              placeholder={`1 to ${visibleParentIds.length}`}
              className="w-full border border-stone-200 rounded px-2.5 py-1.5 text-xs mb-1"
              autoFocus
            />
            {customAmountError && (
              <div className="text-red-600 text-[11px] mb-2">{customAmountError}</div>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => setShowCustomAmountModal(false)}
                className="px-2.5 py-1 text-xs text-stone-600 bg-stone-100 hover:bg-stone-200 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 text-xs font-semibold text-stone-950 bg-[#C5A572] hover:bg-[#b89560] rounded"
              >
                Select
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 15. CONFIRM LARGE SELECTION MODAL (>50) */}
      {showConfirmLargeSelectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-md shadow-lg max-w-sm w-full p-4 text-xs">
            <h3 className="text-sm font-bold text-stone-900 mb-2">
              Select all {totalRecords} filtered parents?
            </h3>
            <p className="text-stone-600 mb-4">
              This will select all {totalRecords} parents across all pages matching your active filters.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmLargeSelectModal(false)}
                className="px-3 py-1.5 text-xs text-stone-600 bg-stone-100 hover:bg-stone-200 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSelectAllFilteredConfirmed}
                className="px-3 py-1.5 text-xs font-semibold text-stone-950 bg-[#C5A572] hover:bg-[#b89560] rounded"
              >
                Select all {totalRecords}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Download,
  Mail,
  ChevronDown,
  X,
  Eye,
  Check,
  Send,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import {
  api,
  extractApiError,
  SelectedParentEmailDeliveryRow,
  SelectedParentsEmailCampaign,
  SelectedParentsEmailSummary
} from '../../../services/api';
import { useNotification } from '../../../context/NotificationContext';
import { AdminSelectionCheckbox } from '../../common/AdminSelectionCheckbox';
import { KoinoniaInlineLoader } from '../../common/KoinoniaInlineLoader';

interface SelectedParentsEmailDeliveryTabProps {
  selectedEventId: string;
  adminUser?: any;
}

export const SelectedParentsEmailDeliveryTab: React.FC<SelectedParentsEmailDeliveryTabProps> = ({
  selectedEventId,
  adminUser
}) => {
  const { showSuccess, showError } = useNotification();

  // Loading & State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [parents, setParents] = useState<SelectedParentEmailDeliveryRow[]>([]);
  const [campaigns, setCampaigns] = useState<SelectedParentsEmailCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [summary, setSummary] = useState<SelectedParentsEmailSummary>({
    totalEligibleParents: 0,
    acceptedCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    pendingCount: 0,
    notSentCount: 0
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'failed' | 'sent' | 'delivered' | 'accepted' | 'pending' | 'not_sent'>('all');

  // Controlled Selection
  const [selectedParentIds, setSelectedParentIds] = useState<string[]>([]);
  const [selectionScopeMenuOpen, setSelectionScopeMenuOpen] = useState(false);
  const [allEligibleParentIds, setAllEligibleParentIds] = useState<string[]>([]);
  const [allFailedParentIds, setAllFailedParentIds] = useState<string[]>([]);
  const [campaignOriginalSubject, setCampaignOriginalSubject] = useState<string>('');
  const [campaignOriginalBody, setCampaignOriginalBody] = useState<string>('');

  // Modals & Drawers
  const [detailDrawerParent, setDetailDrawerParent] = useState<SelectedParentEmailDeliveryRow | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalData, setConfirmModalData] = useState<{
    targetScope: 'selected' | 'failed_remaining' | 'all_eligible';
    targetCount: number;
    alreadyAcceptedCount: number;
    toSendCount: number;
    parentIds?: string[];
    title: string;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Active Background Progress
  const [activeProgress, setActiveProgress] = useState<{
    isActive: boolean;
    total: number;
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
  } | null>(null);

  // Fetch Delivery Data
  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.getSelectedParentsEmailDelivery(selectedEventId, {
        campaignId: selectedCampaignId || undefined,
        search: searchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page: currentPage,
        pageSize
      });

      if (res.success) {
        setParents(res.parents || []);
        setSummary(res.summary);
        setCampaigns(res.campaigns || []);
        if (res.allEligibleParentIds) setAllEligibleParentIds(res.allEligibleParentIds);
        if (res.allFailedParentIds) setAllFailedParentIds(res.allFailedParentIds);
        if (res.campaignOriginalSubject) setCampaignOriginalSubject(res.campaignOriginalSubject);
        if (res.campaignOriginalBody) setCampaignOriginalBody(res.campaignOriginalBody);
        if (!selectedCampaignId && res.activeCampaignId) {
          setSelectedCampaignId(res.activeCampaignId);
        }
        if (res.pagination) {
          setTotalRecords(res.pagination.totalRecords);
          setTotalPages(res.pagination.totalPages);
        }
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError(apiErr.message || 'Failed to load email delivery status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedEventId, selectedCampaignId, currentPage, pageSize, statusFilter]);

  // Handle Search submit / debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Polling for active background progress
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const checkProgress = async () => {
      try {
        const res = await api.getSelectedParentsEmailProgress(selectedCampaignId);
        if (res.success && res.isActive) {
          setActiveProgress({
            isActive: true,
            total: res.progress.total,
            processed: res.progress.processed,
            sent: res.progress.sent,
            failed: res.progress.failed,
            skipped: res.progress.skipped
          });
        } else if (activeProgress?.isActive) {
          // Finished
          setActiveProgress(null);
          showSuccess('Background email delivery completed.');
          fetchData(true);
        }
      } catch {
        // silent poll failure
      }
    };

    checkProgress();
    interval = setInterval(checkProgress, 3500);
    return () => clearInterval(interval);
  }, [selectedCampaignId, activeProgress?.isActive]);

  // Selection helpers
  const handleToggleParent = (parentId: string) => {
    setSelectedParentIds((prev) =>
      prev.includes(parentId) ? prev.filter((id) => id !== parentId) : [...prev, parentId]
    );
  };

  const handleSelectPage = () => {
    const pageIds = parents.map((p) => p.parentId);
    setSelectedParentIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    setSelectionScopeMenuOpen(false);
  };

  const handleSelectAllEligible = () => {
    if (allEligibleParentIds.length > 0) {
      setSelectedParentIds(allEligibleParentIds);
    } else {
      const pageIds = parents.map((p) => p.parentId);
      setSelectedParentIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
    setSelectionScopeMenuOpen(false);
  };

  const handleSelectAllFailed = () => {
    if (allFailedParentIds.length > 0) {
      setSelectedParentIds(allFailedParentIds);
    } else {
      const failedPageIds = parents.filter((p) => p.campaignStatus === 'failed').map((p) => p.parentId);
      setSelectedParentIds(failedPageIds);
    }
    setSelectionScopeMenuOpen(false);
  };

  const handleClearSelection = () => {
    setSelectedParentIds([]);
    setSelectionScopeMenuOpen(false);
  };

  // Open Confirmation Modal for "Try sending again"
  const handleOpenRetryFailedModal = () => {
    const toSend = Math.max(0, summary.totalEligibleParents - (summary.acceptedCount + summary.deliveredCount));
    setConfirmModalData({
      targetScope: 'failed_remaining',
      targetCount: summary.totalEligibleParents,
      alreadyAcceptedCount: summary.acceptedCount + summary.deliveredCount,
      toSendCount: toSend,
      title: "Try sending again to parents who haven't received it"
    });
    setShowConfirmModal(true);
  };

  // Open Confirmation Modal for "Send to Selected"
  const handleOpenSendSelectedModal = () => {
    if (selectedParentIds.length === 0) return;
    const selectedRows = parents.filter((p) => selectedParentIds.includes(p.parentId));
    const alreadyAccepted = selectedRows.filter((p) => p.campaignStatus === 'sent' || p.campaignStatus === 'delivered').length;
    const toSend = selectedParentIds.length - alreadyAccepted;

    setConfirmModalData({
      targetScope: 'selected',
      targetCount: selectedParentIds.length,
      alreadyAcceptedCount: alreadyAccepted,
      toSendCount: Math.max(0, toSend),
      parentIds: selectedParentIds,
      title: `Send Announcement to ${selectedParentIds.length} Selected Parents`
    });
    setShowConfirmModal(true);
  };

  // Open Confirmation Modal for single parent retry
  const handleOpenSingleSendModal = (parent: SelectedParentEmailDeliveryRow) => {
    const isAccepted = parent.campaignStatus === 'sent' || parent.campaignStatus === 'delivered';
    setConfirmModalData({
      targetScope: 'selected',
      targetCount: 1,
      alreadyAcceptedCount: isAccepted ? 1 : 0,
      toSendCount: isAccepted ? 0 : 1,
      parentIds: [parent.parentId],
      title: `Send Announcement to ${parent.fullName}`
    });
    setShowConfirmModal(true);
  };

  // Execute Confirmed Send
  const handleExecuteSend = async () => {
    if (!confirmModalData) return;
    setIsSending(true);

    try {
      const res = await api.sendSelectedParentsEmail({
        eventId: selectedEventId,
        campaignId: selectedCampaignId,
        targetScope: confirmModalData.targetScope,
        parentIds: confirmModalData.parentIds
      });

      if (res.success) {
        showSuccess(res.message || 'Paced email delivery initiated.');
        setShowConfirmModal(false);
        setConfirmModalData(null);
        setSelectedParentIds([]);
        // Trigger background progress checking
        setActiveProgress({
          isActive: true,
          total: res.queuedCount,
          processed: 0,
          sent: 0,
          failed: 0,
          skipped: res.skippedCount
        });
        fetchData(true);
      } else {
        showError(res.error || 'Failed to dispatch emails.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError(apiErr.message || 'Dispatch request failed');
    } finally {
      setIsSending(false);
    }
  };

  // CSV Export
  const handleExportCsv = async () => {
    try {
      await api.downloadSelectedParentsEmailExport(selectedEventId, selectedCampaignId);
      showSuccess('Email delivery status exported successfully.');
    } catch (err: any) {
      showError('Failed to export CSV.');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP METRIC TILES */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {/* Selected Parents */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-[#7A7570] uppercase tracking-wider">
            Selected Parents
          </div>
          <div className="text-xl font-bold text-[#18181B] dark:text-[#F0EBE3] mt-1">
            {summary.totalEligibleParents}
          </div>
          <div className="text-[10px] text-zinc-400 dark:text-[#7A7570] mt-0.5">
            Unique selected families
          </div>
        </div>

        {/* Sent */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-emerald-200/70 dark:border-emerald-900/40 rounded-xl p-3.5 shadow-2xs bg-emerald-50/20 dark:bg-emerald-950/10">
          <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Sent</span>
          </div>
          <div className="text-xl font-bold text-emerald-900 dark:text-emerald-300 mt-1">
            {summary.acceptedCount}
          </div>
          <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
            Accepted by provider
          </div>
        </div>

        {/* Delivered */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-teal-600 dark:text-teal-400" />
            <span>Delivered</span>
          </div>
          <div className="text-xl font-bold text-teal-800 dark:text-teal-300 mt-1">
            {summary.deliveredCount}
          </div>
          <div className="text-[10px] text-zinc-400 dark:text-[#7A7570] mt-0.5">
            Confirmed delivered
          </div>
        </div>

        {/* Couldn't Send */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-rose-200/80 dark:border-rose-900/40 rounded-xl p-3.5 shadow-2xs bg-rose-50/20 dark:bg-rose-950/10">
          <div className="text-[11px] font-semibold text-rose-800 dark:text-red-400 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-red-400" />
            <span>Couldn't Send</span>
          </div>
          <div className="text-xl font-bold text-rose-900 dark:text-red-300 mt-1">
            {summary.failedCount}
          </div>
          <div className="text-[10px] text-rose-700/80 dark:text-red-400/80 mt-0.5">
            Rate limit (429) or error
          </div>
        </div>

        {/* Sending */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>Sending</span>
          </div>
          <div className="text-xl font-bold text-amber-800 dark:text-amber-300 mt-1">
            {summary.pendingCount}
          </div>
          <div className="text-[10px] text-zinc-400 dark:text-[#7A7570] mt-0.5">
            Queued or in progress
          </div>
        </div>

        {/* Not Sent */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-[#7A7570] uppercase tracking-wider">
            Not Sent
          </div>
          <div className="text-xl font-bold text-zinc-700 dark:text-zinc-300 mt-1">
            {summary.notSentCount}
          </div>
          <div className="text-[10px] text-zinc-400 dark:text-[#7A7570] mt-0.5">
            No attempt recorded
          </div>
        </div>
      </div>

      {/* ACTIVE BACKGROUND PROGRESS BANNER */}
      {activeProgress && activeProgress.isActive && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300/80 dark:border-amber-800/50 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
              Sending emails...
            </span>
            <span className="font-bold text-amber-900 dark:text-amber-200">
              {activeProgress.processed} / {activeProgress.total} processed
            </span>
          </div>
          <div className="w-full bg-amber-200/60 dark:bg-amber-900/40 rounded-full h-2 overflow-hidden">
            <div
              className="bg-[#C59B27] h-2 transition-all duration-300 rounded-full"
              style={{
                width: `${activeProgress.total > 0 ? (activeProgress.processed / activeProgress.total) * 100 : 0}%`
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-amber-800 dark:text-amber-300">
            <span>Sent: {activeProgress.sent} &bull; Couldn't send: {activeProgress.failed} &bull; Skipped: {activeProgress.skipped}</span>
            <span>Rate-limit safe pacing active</span>
          </div>
        </div>
      )}

      {/* 2. ANNOUNCEMENT SELECTOR & CONTROLS CARD */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-4 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#EAE8E1] dark:border-[#302E29]">
          {/* Announcement Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-zinc-500 dark:text-[#7A7570] shrink-0">Announcement:</span>
            <select
              value={selectedCampaignId}
              onChange={(e) => {
                setSelectedCampaignId(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-3 py-1.5 text-xs font-medium text-[#18181B] dark:text-[#F0EBE3] focus:outline-none focus:border-[#C59B27] cursor-pointer max-w-md truncate"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.subject || c.id}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Try sending again (Primary Action) */}
            {(() => {
              const unsentCount = Math.max(0, summary.totalEligibleParents - (summary.acceptedCount + summary.deliveredCount));
              return (
                <button
                  type="button"
                  onClick={handleOpenRetryFailedModal}
                  disabled={unsentCount === 0 || isSending}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer ${
                    unsentCount > 0 && !isSending
                      ? 'bg-[#C59B27] hover:bg-[#B38A22] text-[#18181B]'
                      : 'bg-zinc-100 dark:bg-[#262520] text-zinc-400 dark:text-[#7A7570] cursor-not-allowed'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Try sending again ({unsentCount})</span>
                </button>
              );
            })()}

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 bg-zinc-50 dark:bg-[#21211E] hover:bg-zinc-100 dark:hover:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] text-[#18181B] dark:text-[#F0EBE3] rounded-xl text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-zinc-500 dark:text-[#7A7570]" />
              <span>Export CSV</span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="p-1.5 bg-zinc-50 dark:bg-[#21211E] hover:bg-zinc-100 dark:hover:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] text-zinc-600 dark:text-[#B8B0A5] rounded-xl transition-all cursor-pointer"
              title="Refresh status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 3. SEARCH & STATUS FILTERS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-zinc-400 dark:text-[#7A7570] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search parent, child name, or email..."
              className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl pl-9 pr-8 py-1.5 text-xs text-[#18181B] dark:text-[#F0EBE3] placeholder-zinc-400 dark:placeholder-[#7A7570] focus:outline-none focus:border-[#C59B27]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] text-zinc-400 dark:text-[#7A7570] mr-1">Status:</span>
            {[
              { id: 'all', label: 'All' },
              { id: 'failed', label: `Couldn't Send (${summary.failedCount})` },
              { id: 'sent', label: `Sent (${summary.acceptedCount})` },
              { id: 'delivered', label: `Delivered (${summary.deliveredCount})` },
              { id: 'not_sent', label: 'Not Sent' }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setStatusFilter(f.id as any);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-[#18181B] dark:bg-[#F0EBE3] text-white dark:text-[#18181B]'
                    : 'bg-[#FAF9F6] dark:bg-[#262520] text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 dark:hover:bg-[#2F2E2A] border border-[#EAE8E1] dark:border-[#3A3835]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. SELECTION CONTROLS BAR */}
        <div className="flex flex-wrap items-center justify-between pt-3 border-t border-[#EAE8E1] dark:border-[#302E29] gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setSelectionScopeMenuOpen((v) => !v)}
                className="bg-zinc-50 dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl px-2.5 py-1 text-xs text-zinc-700 dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3] flex items-center space-x-1 cursor-pointer"
              >
                <span>Select</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {selectionScopeMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-52 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl shadow-lg z-20 py-1 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectPage}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-[#262520] cursor-pointer"
                  >
                    Select page ({parents.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllEligible}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-[#262520] cursor-pointer font-medium"
                  >
                    Select all {summary.totalEligibleParents} parents
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllFailed}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-[#262520] cursor-pointer text-rose-600 dark:text-rose-400"
                  >
                    Select couldn't send ({summary.failedCount})
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-[#262520] text-zinc-500 hover:text-zinc-700 dark:hover:text-[#B8B0A5] cursor-pointer border-t border-[#EAE8E1] dark:border-[#302E29]"
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </div>

            <span className="text-zinc-500 dark:text-[#7A7570]">
              {selectedParentIds.length} of {totalRecords} selected
            </span>
          </div>

          {selectedParentIds.length > 0 && (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleOpenSendSelectedModal}
                disabled={isSending}
                className="px-3 py-1 bg-[#C59B27] hover:bg-[#B38A22] text-[#18181B] rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send to Selected ({selectedParentIds.length})</span>
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs text-zinc-400 dark:text-[#7A7570] hover:underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. PARENT EMAIL DELIVERY TABLE */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-3">
            <KoinoniaInlineLoader />
            <p className="text-xs text-zinc-500 dark:text-[#7A7570]">Loading email delivery statuses...</p>
          </div>
        ) : parents.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Mail className="w-8 h-8 text-zinc-300 dark:text-[#52504B] mx-auto" />
            <h3 className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3]">No parents found</h3>
            <p className="text-xs text-zinc-400 dark:text-[#7A7570] max-w-sm mx-auto">
              No parent records match your search or filter criteria for this campaign.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF9F6] dark:bg-[#262520] border-b border-[#EAE8E1] dark:border-[#302E29] text-zinc-500 dark:text-[#7A7570]">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={parents.length > 0 && parents.every((p) => selectedParentIds.includes(p.parentId))}
                      onChange={(e) => {
                        if (e.target.checked) handleSelectPage();
                        else handleClearSelection();
                      }}
                      className="rounded border-[#EAE8E1] dark:border-[#3A3835] text-[#C59B27] focus:ring-[#C59B27] cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Parent & Family</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Email Address</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Status</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Last Attempt</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8E1] dark:divide-[#302E29]">
                {parents.map((parent) => {
                  const isSelected = selectedParentIds.includes(parent.parentId);
                  const isSent = parent.campaignStatus === 'sent';
                  const isDelivered = parent.campaignStatus === 'delivered';
                  const isFailed = parent.campaignStatus === 'failed';
                  const isPending = parent.campaignStatus === 'queued' || parent.campaignStatus === 'sending';

                  return (
                    <tr
                      key={parent.parentId}
                      className={`hover:bg-zinc-50/60 dark:hover:bg-[#21211E]/60 transition-colors ${
                        isSelected ? 'bg-[#C59B27]/5 dark:bg-[#C59B27]/10' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleParent(parent.parentId)}
                          className="rounded border-[#EAE8E1] dark:border-[#3A3835] text-[#C59B27] focus:ring-[#C59B27] cursor-pointer"
                        />
                      </td>

                      {/* Parent Name & Children */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#18181B] dark:text-[#F0EBE3]">
                          {parent.fullName}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-[#7A7570] flex items-center gap-1.5 mt-0.5">
                          <span className="bg-zinc-100 dark:bg-[#262520] px-1.5 py-0.2 rounded text-[10px] font-medium text-zinc-700 dark:text-[#B8B0A5]">
                            {parent.selectedRatioText}
                          </span>
                          <span className="truncate max-w-xs">{parent.selectedChildNames}</span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3 px-4">
                        <div className="text-zinc-800 dark:text-[#F0EBE3] font-mono text-[11px] truncate max-w-xs">
                          {parent.email || <span className="text-zinc-400 italic">No email on file</span>}
                        </div>
                        {parent.phoneNumber && (
                          <div className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-mono mt-0.5">
                            {parent.phoneNumber}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {isDelivered ? (
                          <span className="inline-flex items-center gap-1 bg-teal-50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-400 border border-teal-200 dark:border-teal-900/50 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                            <CheckCircle2 className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                            Delivered
                          </span>
                        ) : isSent ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 px-2 py-0.5 rounded-full text-[11px] font-semibold" title={parent.providerMessageId || 'Sent'}>
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            Sent
                          </span>
                        ) : isFailed ? (
                          <span
                            className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            title={parent.errorMessage || "Couldn't send — please try again"}
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                            Couldn't send
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            Sending...
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-[#262520] text-zinc-600 dark:text-[#7A7570] border border-zinc-200 dark:border-[#3A3835] px-2 py-0.5 rounded-full text-[11px] font-medium">
                            Not sent
                          </span>
                        )}
                        {parent.errorMessage && (
                          <div className="text-[10px] text-rose-600 dark:text-rose-400 truncate max-w-xs mt-0.5" title={parent.errorMessage}>
                            {parent.errorMessage.toLowerCase().includes('429') || parent.errorMessage.toLowerCase().includes('rate limit')
                              ? "Couldn't send — please try again"
                              : parent.errorMessage}
                          </div>
                        )}
                      </td>

                      {/* Last Attempt */}
                      <td className="py-3 px-4 text-zinc-500 dark:text-[#7A7570] text-[11px] whitespace-nowrap">
                        {parent.lastAttemptAt ? (
                          new Date(parent.lastAttemptAt).toLocaleTimeString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Row Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Details Button */}
                          <button
                            type="button"
                            onClick={() => setDetailDrawerParent(parent)}
                            className="p-1.5 bg-zinc-50 dark:bg-[#21211E] hover:bg-zinc-100 dark:hover:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] text-zinc-600 dark:text-[#B8B0A5] rounded-lg transition-all cursor-pointer"
                            title="View delivery details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Retry / Send Single */}
                          <button
                            type="button"
                            onClick={() => handleOpenSingleSendModal(parent)}
                            disabled={isSending}
                            className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center space-x-1 cursor-pointer ${
                              isSent || isDelivered
                                ? 'bg-zinc-100 dark:bg-[#262520] text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600'
                                : 'bg-[#C59B27]/10 dark:bg-[#C59B27]/20 text-[#8C6D1F] dark:text-[#C59B27] hover:bg-[#C59B27]/20 border border-[#C59B27]/30'
                            }`}
                          >
                            <span>{isFailed ? 'Try again' : isSent || isDelivered ? 'Sent' : 'Send'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 6. PAGINATION FOOTER */}
        {totalPages > 1 && (
          <div className="p-3.5 bg-[#FAF9F6] dark:bg-[#262520] border-t border-[#EAE8E1] dark:border-[#302E29] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="text-zinc-500 dark:text-[#7A7570]">
              Showing {totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} parents
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-lg text-zinc-700 dark:text-[#F0EBE3] disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-zinc-600 dark:text-[#B8B0A5] px-1 font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-lg text-zinc-700 dark:text-[#F0EBE3] disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 7. CONFIRMATION MODAL */}
      {showConfirmModal && confirmModalData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#C59B27]/10 dark:bg-[#C59B27]/20 flex items-center justify-center text-[#C59B27]">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#18181B] dark:text-[#F0EBE3]">
                    {confirmModalData.title}
                  </h3>
                  <p className="text-xs text-zinc-400 dark:text-[#7A7570]">
                    Review recipient counts before sending
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-[#F0EBE3] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Announcement Message Preview */}
            <div className="bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-[#7A7570] uppercase tracking-wider">
                  Announcement Preview
                </span>
                {campaignOriginalBody ? (
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                    Verified Approved Content
                  </span>
                ) : (
                  <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                    Unverified Content
                  </span>
                )}
              </div>
              {campaignOriginalBody ? (
                <>
                  <div className="font-semibold text-[#18181B] dark:text-[#F0EBE3] pb-1 border-b border-[#EAE8E1] dark:border-[#3A3835]">
                    {campaignOriginalSubject || 'Announcement'}
                  </div>
                  <div className="max-h-36 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] text-zinc-600 dark:text-[#B8B0A5] leading-relaxed p-2.5 bg-white dark:bg-[#1D1D1A] rounded-lg border border-[#EAE8E1] dark:border-[#302E29]">
                    {campaignOriginalBody}
                  </div>
                </>
              ) : (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-lg text-rose-800 dark:text-rose-300 text-xs">
                  Original approved announcement content could not be verified for this campaign. Retry sending is blocked until content is verified.
                </div>
              )}
            </div>

            {/* Reconciliation breakdown */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-[#EAE8E1] dark:border-[#302E29]">
                <span className="text-zinc-600 dark:text-[#B8B0A5]">Selected parents:</span>
                <span className="font-bold text-[#18181B] dark:text-[#F0EBE3]">{confirmModalData.targetCount}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#EAE8E1] dark:border-[#302E29]">
                <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Already sent (Protected from duplicates):
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {confirmModalData.alreadyAcceptedCount}
                </span>
              </div>
              {confirmModalData.targetScope === 'failed_remaining' && (
                <div className="flex items-center justify-between py-1 border-b border-[#EAE8E1] dark:border-[#302E29] text-[11px] text-zinc-500 dark:text-[#7A7570]">
                  <span>Previous attempt couldn't send: {summary.failedCount} &bull; Not yet attempted: {summary.notSentCount}</span>
                  <span className="text-zinc-400">Total remaining: {confirmModalData.toSendCount}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-1.5 pt-2 font-semibold">
                <span className="text-[#18181B] dark:text-[#F0EBE3]">Emails to send:</span>
                <span className="text-base font-bold text-[#C59B27]">{confirmModalData.toSendCount}</span>
              </div>
            </div>

            {/* Safety Guarantee Callout */}
            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-3 text-[11px] text-emerald-900 dark:text-emerald-300 leading-relaxed space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Delivery & Duplicate Protection</span>
              </div>
              <div>
                Emails will be delivered safely in the background with duplicate protection. Parents who have already received this announcement will not be emailed again.
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSending}
                className="px-4 py-2 border border-[#EAE8E1] dark:border-[#3A3835] text-zinc-700 dark:text-[#B8B0A5] hover:bg-zinc-50 dark:hover:bg-[#262520] rounded-xl text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSend}
                disabled={isSending || confirmModalData.toSendCount === 0 || !campaignOriginalBody}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer ${
                  confirmModalData.toSendCount > 0 && !isSending && Boolean(campaignOriginalBody)
                    ? 'bg-[#C59B27] hover:bg-[#B38A22] text-[#18181B] shadow-2xs'
                    : 'bg-zinc-100 dark:bg-[#262520] text-zinc-400 dark:text-[#7A7570] cursor-not-allowed'
                }`}
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Preparing to send...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send {confirmModalData.toSendCount} Emails</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. PARENT DETAILS DRAWER */}
      {detailDrawerParent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex justify-end z-50 animate-fade-in">
          <div className="bg-white dark:bg-[#1D1D1A] border-l border-[#EAE8E1] dark:border-[#302E29] w-full max-w-md h-full p-6 overflow-y-auto space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EAE8E1] dark:border-[#302E29]">
              <div>
                <h3 className="text-sm font-bold text-[#18181B] dark:text-[#F0EBE3]">
                  {detailDrawerParent.fullName}
                </h3>
                <p className="text-xs text-zinc-400 dark:text-[#7A7570]">
                  Delivery Log & Recipient Details
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailDrawerParent(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-[#F0EBE3] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status overview */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-[#7A7570] uppercase tracking-wider">
                Current Campaign Delivery Status
              </div>
              <div className="bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-[#7A7570]">Status:</span>
                  <span className="font-bold uppercase tracking-wider">{detailDrawerParent.campaignStatus}</span>
                </div>
                {detailDrawerParent.providerMessageId && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-[#7A7570]">Provider Message ID:</span>
                    <span className="font-mono text-[11px] text-zinc-800 dark:text-[#F0EBE3]">
                      {detailDrawerParent.providerMessageId}
                    </span>
                  </div>
                )}
                {detailDrawerParent.lastAttemptAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-[#7A7570]">Last Attempt:</span>
                    <span>{new Date(detailDrawerParent.lastAttemptAt).toLocaleString()}</span>
                  </div>
                )}
                {detailDrawerParent.sentAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-[#7A7570]">Sent At:</span>
                    <span>{new Date(detailDrawerParent.sentAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Error Message if Failed */}
            {detailDrawerParent.errorMessage && (
              <div className="bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl p-3.5 space-y-1 text-xs">
                <div className="font-semibold text-rose-800 dark:text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>Provider Error Recorded</span>
                </div>
                <div className="text-rose-700 dark:text-rose-300 font-mono text-[11px] break-all">
                  {detailDrawerParent.errorMessage}
                </div>
              </div>
            )}

            {/* Contact Details */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-[#7A7570] uppercase tracking-wider">
                Contact Information
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-[#EAE8E1] dark:border-[#302E29]">
                  <span className="text-zinc-500 dark:text-[#7A7570]">Email:</span>
                  <span className="font-mono font-medium text-zinc-800 dark:text-[#F0EBE3]">
                    {detailDrawerParent.email || 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-[#EAE8E1] dark:border-[#302E29]">
                  <span className="text-zinc-500 dark:text-[#7A7570]">Phone:</span>
                  <span className="font-mono text-zinc-800 dark:text-[#F0EBE3]">
                    {detailDrawerParent.phoneNumber || 'None'}
                  </span>
                </div>
              </div>
            </div>

            {/* Registered Children */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-[#7A7570] uppercase tracking-wider">
                Selected Children ({detailDrawerParent.selectedChildrenCount})
              </div>
              <div className="space-y-2">
                {detailDrawerParent.children.map((child) => (
                  <div
                    key={child.id}
                    className="p-3 bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-[#18181B] dark:text-[#F0EBE3]">
                        {child.fullName}
                      </div>
                      <div className="text-[11px] text-zinc-400 dark:text-[#7A7570]">
                        {child.ageGroup || 'General'}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                        child.isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40'
                          : 'bg-zinc-100 dark:bg-[#262520] text-zinc-500'
                      }`}
                    >
                      {child.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Drawer Actions */}
            <div className="pt-4 border-t border-[#EAE8E1] dark:border-[#302E29]">
              <button
                type="button"
                onClick={() => {
                  const target = detailDrawerParent;
                  setDetailDrawerParent(null);
                  handleOpenSingleSendModal(target);
                }}
                className="w-full py-2 bg-[#C59B27] hover:bg-[#B38A22] text-[#18181B] rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {detailDrawerParent.campaignStatus === 'failed'
                    ? 'Retry Email to This Parent'
                    : 'Dispatch Email to This Parent'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

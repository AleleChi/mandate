import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Search,
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
  Send,
  RotateCcw,
  ChevronDown,
  Info,
  X,
  Phone,
  Mail,
  Check,
  AlertTriangle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { api, extractApiError } from '../../../services/api';
import { useNotification } from '../../../context/NotificationContext';
import { AdminSelectionCheckbox } from '../../common/AdminSelectionCheckbox';
import { Button } from '../../common/Button';
import { KoinoniaInlineLoader } from '../../common/KoinoniaInlineLoader';

interface SelectedParentsChannelTabProps {
  selectedEventId: string;
  adminUser?: any;
}

interface AudienceChildDetail {
  id: string;
  fullName: string;
  firstName: string;
  status: string;
  ageGroup: string | null;
  isSelected: boolean;
}

interface SelectedParentRecord {
  parentId: string;
  userId: string;
  fullName: string;
  firstName: string;
  phoneNumber: string | null;
  whatsappNumber: string | null;
  email: string | null;
  whatsappConsentStatus: 'opted_in' | 'opted_out' | 'unknown';
  whatsappAvailability: 'available' | 'opted_out' | 'invalid_number';
  normalizedWhatsAppNumber: string | null;
  totalRegisteredChildren: number;
  selectedChildrenCount: number;
  selectedRatioText: string;
  selectedChildNames: string;
  children: AudienceChildDetail[];
  invitationStatus: 'not_sent' | 'sent' | 'failed';
  sentAt: string | null;
  attemptedAt: string | null;
  failureReason: string | null;
  providerMessageId: string | null;
}

interface AudienceSummary {
  totalEligibleParents: number;
  invitationsNotSent: number;
  invitationsSent: number;
  invitationsFailed: number;
  whatsappAvailable: number;
  whatsappUnavailable: number;
}

interface SendResultDetail {
  parentId: string;
  parentName: string;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
  messageId?: string;
}

interface BulkSendSummaryData {
  success: boolean;
  templateConfigured: boolean;
  totalRequested: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  details: SendResultDetail[];
  error?: string;
}

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
    invitationsNotSent: 0,
    invitationsSent: 0,
    invitationsFailed: 0,
    whatsappAvailable: 0,
    whatsappUnavailable: 0
  });
  const [eventTitle, setEventTitle] = useState('Current Event');
  const [templateConfigured, setTemplateConfigured] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_sent' | 'sent' | 'failed'>('all');
  const [whatsappFilter, setWhatsappFilter] = useState<'all' | 'available' | 'unavailable'>('all');

  // Controlled bulk selection
  const [selectedParentIds, setSelectedParentIds] = useState<string[]>([]);
  const [headerScopeMenuOpen, setHeaderScopeMenuOpen] = useState(false);
  const [toolbarScopeMenuOpen, setToolbarScopeMenuOpen] = useState(false);
  const [showCustomAmountModal, setShowCustomAmountModal] = useState(false);
  const [customAmountValue, setCustomAmountValue] = useState('');
  const [customAmountError, setCustomAmountError] = useState('');

  // Modals & Action states
  const [resendTargetParent, setResendTargetParent] = useState<SelectedParentRecord | null>(null);
  const [detailParent, setDetailParent] = useState<SelectedParentRecord | null>(null);
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

  // Fetch audience whenever selectedEventId changes
  const fetchAudience = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setFetchError(null);

    try {
      const res = await api.getSelectedParentsAudience(selectedEventId, {
        search: searchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        whatsappStatus: whatsappFilter !== 'all' ? whatsappFilter : undefined
      });

      if (res && res.success) {
        setParents(res.parents || []);
        setSummary(res.summary || {
          totalEligibleParents: 0,
          invitationsNotSent: 0,
          invitationsSent: 0,
          invitationsFailed: 0,
          whatsappAvailable: 0,
          whatsappUnavailable: 0
        });
        setEventTitle(res.eventTitle || 'Current Event');
        setTemplateConfigured(Boolean(res.templateConfigured));
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

  useEffect(() => {
    fetchAudience();
    setSelectedParentIds([]);
  }, [selectedEventId, statusFilter, whatsappFilter]);

  // Handle client-side search debounce / immediate filtering
  const displayParents = useMemo(() => {
    if (!searchQuery.trim()) return parents;
    const q = searchQuery.trim().toLowerCase();
    return parents.filter(p =>
      p.fullName.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.phoneNumber && p.phoneNumber.toLowerCase().includes(q)) ||
      (p.whatsappNumber && p.whatsappNumber.toLowerCase().includes(q)) ||
      p.selectedChildNames.toLowerCase().includes(q) ||
      p.children.some(c => c.fullName.toLowerCase().includes(q))
    );
  }, [parents, searchQuery]);

  // Bulk selection calculations
  const displayParentIds = useMemo(() => displayParents.map(p => p.parentId), [displayParents]);
  const isAllVisibleSelected = displayParentIds.length > 0 && displayParentIds.every(id => selectedParentIds.includes(id));
  const isIndeterminate = selectedParentIds.length > 0 && !isAllVisibleSelected;

  const handleToggleSelectParent = (id: string) => {
    setSelectedParentIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectVisible = () => {
    if (isAllVisibleSelected) {
      // Deselect all visible
      setSelectedParentIds(prev => prev.filter(id => !displayParentIds.includes(id)));
    } else {
      // Select all visible
      setSelectedParentIds(prev => Array.from(new Set([...prev, ...displayParentIds])));
    }
  };

  const handleSelectFirstN = (n: number) => {
    const subset = displayParentIds.slice(0, n);
    setSelectedParentIds(subset);
  };

  const handleSelectAllFiltered = () => {
    setSelectedParentIds(displayParentIds);
  };

  const handleCustomAmountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(customAmountValue, 10);
    if (isNaN(count) || count <= 0) {
      setCustomAmountError('Please enter a valid positive number');
      return;
    }
    const safeCount = Math.min(count, displayParentIds.length);
    setSelectedParentIds(displayParentIds.slice(0, safeCount));
    setShowCustomAmountModal(false);
    setCustomAmountValue('');
    setCustomAmountError('');
  };

  // Dispatch channel invitation
  const executeSendInvitations = async (targetParentIds: string[], resend: boolean = false) => {
    if (!templateConfigured) {
      showError('Template pending', 'WhatsApp template pending approval. Invitations cannot be dispatched yet.');
      return;
    }

    if (targetParentIds.length === 0) return;

    setIsSubmittingSend(true);
    try {
      const res = await api.sendSelectedParentsChannelInvitations({
        eventId: selectedEventId,
        parentIds: targetParentIds,
        resend
      });

      if (res.success) {
        setBulkSendSummary(res);
        if (res.sentCount > 0) {
          showSuccess(
            'Channel invitations sent',
            `${res.sentCount} invitation(s) sent successfully${res.skippedCount > 0 ? `, ${res.skippedCount} skipped` : ''}${res.failedCount > 0 ? `, ${res.failedCount} failed` : ''}.`
          );
        } else if (res.skippedCount > 0) {
          showSuccess('Processing complete', `All ${res.skippedCount} requested recipient(s) were safely skipped.`);
        }
        // Deselect and refresh
        setSelectedParentIds(prev => prev.filter(id => !targetParentIds.includes(id)));
        fetchAudience();
      } else {
        throw new Error(res.error || 'Failed to dispatch channel invitations');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Dispatch error', parsed.message);
    } finally {
      setIsSubmittingSend(false);
      setResendTargetParent(null);
    }
  };

  const renderSelectionScopeDropdown = (
    onClose: () => void,
    positionClass: string = "left-0 top-full mt-1.5"
  ) => (
    <div
      className={`absolute ${positionClass} w-56 bg-white dark:bg-[#1E1E1C] border border-[#EAE8E1] dark:border-[#2E2C28] rounded-lg shadow-xl z-50 py-1 text-xs text-left animate-scale-in`}
    >
      <div className="px-3 py-1.5 border-b border-[#EAE8E1] dark:border-[#2E2C28] text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        Selection Scope
      </div>

      <button
        type="button"
        onClick={() => {
          onClose();
          setSelectedParentIds(displayParentIds);
        }}
        className="w-full px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 hover:bg-[#FAF9F6] dark:hover:bg-[#262522] hover:text-neutral-900 dark:hover:text-white flex items-center justify-between transition-colors cursor-pointer"
      >
        <span>Select visible</span>
        <span className="text-[10px] text-neutral-400 font-medium">{displayParents.length}</span>
      </button>

      {[10, 25, 50, 100].map(count => {
        const isAvailable = displayParents.length >= count;
        return (
          <button
            key={count}
            type="button"
            disabled={!isAvailable}
            onClick={() => {
              onClose();
              handleSelectFirstN(count);
            }}
            className="w-full px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 hover:bg-[#FAF9F6] dark:hover:bg-[#262522] hover:text-neutral-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between transition-colors cursor-pointer"
          >
            <span>Select first {count}</span>
            {!isAvailable && (
              <span className="text-[10px] text-neutral-400 font-normal">({displayParents.length} available)</span>
            )}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => {
          onClose();
          setCustomAmountValue(String(Math.min(50, displayParents.length || 1)));
          setCustomAmountError('');
          setShowCustomAmountModal(true);
        }}
        className="w-full px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 hover:bg-[#FAF9F6] dark:hover:bg-[#262522] hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        Select custom amount…
      </button>

      <div className="my-1 border-t border-[#EAE8E1] dark:border-[#2E2C28]" />

      <button
        type="button"
        onClick={() => {
          onClose();
          handleSelectAllFiltered();
        }}
        className="w-full px-3 py-2 text-left text-neutral-800 dark:text-neutral-200 hover:bg-[#FAF9F6] dark:hover:bg-[#262522] hover:text-neutral-950 dark:hover:text-white flex items-center justify-between transition-colors cursor-pointer font-medium"
      >
        <span>Select all filtered</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-semibold">
          {displayParents.length}
        </span>
      </button>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in text-[#18181B] dark:text-[#F0EBE3]">
      {/* 1. Header Banner & Guidance */}
      <div className="bg-[#FAF9F6] dark:bg-[#1C1B18] border border-[#EAE8E1] dark:border-[#2D2B27] rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#C59B27]">Communication Workflow</span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">·</span>
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{eventTitle}</span>
          </div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white tracking-tight">
            Selected Parents WhatsApp Channel Invitations
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-3xl leading-relaxed">
            Parents whose children have been approved or selected for the current event. Name the confirmed child or children and send them the official Koinonia Parents Channel link before event day.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchAudience(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5"
            title="Refresh audience list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* 2. Pending Template Approval Notice (if not configured) */}
      {!templateConfigured && (
        <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg p-3.5 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 text-xs">
            <p className="font-semibold text-amber-900 dark:text-amber-300">
              WhatsApp template pending approval
            </p>
            <p className="text-amber-800 dark:text-amber-400 leading-relaxed">
              The dedicated template <code className="bg-amber-100/70 dark:bg-amber-900/40 px-1 py-0.5 rounded font-mono text-[11px]">koinonia_selected_parent_channel</code> is pending Meta approval or the template key is not yet configured. The audience, registered child counts, and selected names remain visible and operational below; send dispatches will become active once configured.
            </p>
          </div>
        </div>
      )}

      {/* 3. Summary Operational Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-md p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Eligible Parents</div>
          <div className="text-lg font-bold text-neutral-900 dark:text-white mt-0.5">{summary.totalEligibleParents}</div>
        </div>

        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-md p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Not Sent</div>
          <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">{summary.invitationsNotSent}</div>
        </div>

        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-md p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Sent</div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{summary.invitationsSent}</div>
        </div>

        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-md p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Failed</div>
          <div className="text-lg font-bold text-red-600 dark:text-red-400 mt-0.5">{summary.invitationsFailed}</div>
        </div>

        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-md p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">WA Available</div>
          <div className="text-lg font-bold text-neutral-700 dark:text-neutral-300 mt-0.5">{summary.whatsappAvailable}</div>
        </div>

        <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-md p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">WA Unavailable</div>
          <div className="text-lg font-bold text-neutral-400 dark:text-neutral-500 mt-0.5">{summary.whatsappUnavailable}</div>
        </div>
      </div>

      {/* 4. Search & Filter Bar */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search parent name, child name, phone or email..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAF9F6] dark:bg-[#242320] border border-[#EAE8E1] dark:border-[#383632] rounded focus:outline-none focus:border-[#C59B27] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-neutral-400 text-[11px] font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs bg-[#FAF9F6] dark:bg-[#242320] border border-[#EAE8E1] dark:border-[#383632] rounded px-2.5 py-1.5 focus:outline-none focus:border-[#C59B27]"
            >
              <option value="all">All selected parents</option>
              <option value="not_sent">Invitation not sent</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-neutral-400 text-[11px] font-medium">WhatsApp:</span>
            <select
              value={whatsappFilter}
              onChange={(e) => setWhatsappFilter(e.target.value as any)}
              className="text-xs bg-[#FAF9F6] dark:bg-[#242320] border border-[#EAE8E1] dark:border-[#383632] rounded px-2.5 py-1.5 focus:outline-none focus:border-[#C59B27]"
            >
              <option value="all">All</option>
              <option value="available">WhatsApp available</option>
              <option value="unavailable">WhatsApp unavailable</option>
            </select>
          </div>

          {(statusFilter !== 'all' || whatsappFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setWhatsappFilter('all');
                setSearchQuery('');
              }}
              className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 px-2 py-1 transition-colors cursor-pointer underline text-[11px]"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* 5. Controlled Bulk Selection Floating / Contextual Toolbar */}
      {selectedParentIds.length > 0 && (
        <div className="bg-[#FAF8F2] dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#2A2926] rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs animate-fade-in">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-[#C59B27]" />
            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              {selectedParentIds.length} {selectedParentIds.length === 1 ? 'parent selected' : 'parents selected'}
            </span>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 hidden sm:inline">
              ({selectedParentIds.length} of {displayParents.length} eligible parents selected)
            </span>
          </div>

          <div className="flex items-center gap-2 relative flex-wrap">
            {/* Change selection dropdown */}
            <div className="relative" ref={toolbarScopeMenuRef}>
              <button
                type="button"
                id="selected-parents-change-selection-btn"
                onClick={() => setToolbarScopeMenuOpen(!toolbarScopeMenuOpen)}
                className="px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-white dark:bg-[#282724] border border-[#EAE8E1] dark:border-[#383632] rounded hover:border-neutral-300 transition-colors flex items-center gap-1 cursor-pointer focus:outline-none"
              >
                <span>Change selection</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${toolbarScopeMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {toolbarScopeMenuOpen && renderSelectionScopeDropdown(() => setToolbarScopeMenuOpen(false), "left-0 sm:right-0 sm:left-auto top-full mt-1.5")}
            </div>

            {/* Send Channel Invitation Action Button */}
            <button
              type="button"
              id="selected-parents-bulk-send-btn"
              disabled={isSubmittingSend || !templateConfigured}
              onClick={() => executeSendInvitations(selectedParentIds, false)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#C59B27] hover:bg-[#B08921] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs focus:outline-none"
              title={!templateConfigured ? 'WhatsApp template pending approval' : 'Send Parents Channel invitation'}
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {!templateConfigured
                  ? 'WhatsApp template pending approval'
                  : isSubmittingSend
                    ? 'Sending...'
                    : 'Send Channel Invitation'}
              </span>
            </button>

            <button
              onClick={() => setSelectedParentIds([])}
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 px-2 py-1.5 transition-colors cursor-pointer"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* 6. Main Selected Parents Table */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12">
            <KoinoniaInlineLoader
              variant="skeleton"
              size="lg"
              label="Loading selected parents communication audience..."
              centered
            />
          </div>
        ) : fetchError ? (
          <div className="p-8 text-center space-y-2">
            <AlertCircle className="w-6 h-6 text-red-500 mx-auto" />
            <p className="text-xs font-medium text-red-600 dark:text-red-400">{fetchError}</p>
            <Button variant="secondary" size="sm" onClick={() => fetchAudience(true)} className="text-xs">
              Try again
            </Button>
          </div>
        ) : displayParents.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Users className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto" />
            <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              No selected parents found
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
              Parents automatically appear here once at least one registered child has been approved or selected for this event.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#FAF9F6] dark:bg-[#20201E] border-b border-[#EAE8E1] dark:border-[#2A2926] text-neutral-500 dark:text-neutral-400">
                  <th className="py-3 px-3 pl-4 w-12 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <AdminSelectionCheckbox
                        checked={isAllVisibleSelected}
                        indeterminate={isIndeterminate}
                        onChange={handleToggleSelectVisible}
                        ariaLabel="Select visible parents"
                      />
                      <div className="relative" ref={headerScopeMenuRef}>
                        <button
                          type="button"
                          id="selected-parents-header-scope-btn"
                          onClick={() => setHeaderScopeMenuOpen(!headerScopeMenuOpen)}
                          className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded transition-colors focus:outline-none cursor-pointer"
                          title="Selection options"
                          aria-label="Selection options"
                          aria-expanded={headerScopeMenuOpen}
                        >
                          <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${headerScopeMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {headerScopeMenuOpen && renderSelectionScopeDropdown(() => setHeaderScopeMenuOpen(false), "left-0 top-full mt-1.5")}
                      </div>
                    </div>
                  </th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Parent</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Children</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Selected</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">WhatsApp</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Channel Invitation</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Sent At</th>
                  <th className="py-3 px-4 pr-6 text-right text-[11px] font-semibold tracking-wider uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8E1] dark:divide-[#2A2926]">
                {displayParents.map((p) => {
                  const isSelected = selectedParentIds.includes(p.parentId);

                  return (
                    <tr
                      key={p.parentId}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-[#FAF8F2] dark:bg-[#20201E]'
                          : 'hover:bg-neutral-50/70 dark:hover:bg-[#22211E]'
                      }`}
                    >
                      {/* Select Checkbox */}
                      <td className="py-3 px-3 pl-4 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                        <AdminSelectionCheckbox
                          checked={isSelected}
                          onChange={() => handleToggleSelectParent(p.parentId)}
                          ariaLabel={`Select ${p.fullName}`}
                        />
                      </td>

                      {/* Parent details */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {p.fullName}
                        </div>
                        <div className="flex flex-col gap-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                          {p.whatsappNumber || p.phoneNumber ? (
                            <span className="flex items-center gap-1 font-mono text-[10.5px]">
                              {p.whatsappNumber || p.phoneNumber}
                            </span>
                          ) : null}
                          {p.email && (
                            <span className="truncate max-w-[180px]">{p.email}</span>
                          )}
                        </div>
                      </td>

                      {/* Registered Children */}
                      <td className="py-3 px-4 whitespace-nowrap text-neutral-600 dark:text-neutral-300">
                        <span className="font-medium">{p.totalRegisteredChildren}</span>
                        <span className="text-neutral-400 dark:text-neutral-500 ml-1">
                          {p.totalRegisteredChildren === 1 ? 'registered' : 'registered'}
                        </span>
                      </td>

                      {/* Selected Children Ratio & Names */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {p.selectedRatioText}
                        </div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-snug">
                          {p.selectedChildNames}
                        </div>
                      </td>

                      {/* WhatsApp Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {p.whatsappAvailability === 'available' ? (
                          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>Available</span>
                          </div>
                        ) : p.whatsappAvailability === 'opted_out' ? (
                          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-[11px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>Not opted in</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500 text-[11px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                            <span>Invalid number</span>
                          </div>
                        )}
                      </td>

                      {/* Channel Invitation Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {p.invitationStatus === 'sent' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium">
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Sent</span>
                          </span>
                        ) : p.invitationStatus === 'failed' ? (
                          <span
                            className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-[11px] font-medium cursor-help"
                            title={p.failureReason || 'Failed to dispatch'}
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Failed</span>
                          </span>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-500 text-[11px]">
                            Not sent
                          </span>
                        )}
                      </td>

                      {/* Sent At */}
                      <td className="py-3 px-4 whitespace-nowrap text-[11px] text-neutral-500 dark:text-neutral-400">
                        {p.sentAt ? (
                          new Date(p.sentAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        ) : (
                          <span className="text-neutral-300 dark:text-neutral-600">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 pr-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {p.invitationStatus === 'sent' ? (
                            <button
                              type="button"
                              onClick={() => setResendTargetParent(p)}
                              disabled={isSubmittingSend || !templateConfigured}
                              className="px-2 py-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
                              title={!templateConfigured ? 'WhatsApp template pending approval' : 'Resend channel invitation'}
                            >
                              Resend
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => executeSendInvitations([p.parentId], false)}
                              disabled={isSubmittingSend || !templateConfigured || p.whatsappAvailability !== 'available'}
                              className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#C59B27] hover:bg-[#B08921] disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors cursor-pointer shadow-2xs"
                              title={
                                !templateConfigured
                                  ? 'WhatsApp template pending approval'
                                  : p.whatsappAvailability !== 'available'
                                    ? 'WhatsApp not available for this parent'
                                    : 'Send Parents Channel invitation'
                              }
                            >
                              Send
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setDetailParent(p)}
                            className="px-2 py-1 text-[11px] text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                          >
                            Details
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
      </div>

      {/* MODAL 1: Deliberate Resend Confirmation Modal */}
      {resendTargetParent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-[#1E1E1C] border border-[#EAE8E1] dark:border-[#2E2C28] rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-in text-left">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-amber-50 dark:bg-amber-950/40 text-[#C59B27] shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Resend Channel Invitation?
                </h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  Send the official Parents Channel invitation to <strong className="text-neutral-900 dark:text-white">{resendTargetParent.fullName}</strong> again?
                </p>
                <div className="bg-[#FAF9F6] dark:bg-[#262522] border border-[#EAE8E1] dark:border-[#383632] rounded p-2 text-[11px] text-neutral-500 dark:text-neutral-400 mt-2">
                  <div><strong>Selected Children:</strong> {resendTargetParent.selectedChildNames}</div>
                  <div><strong>WhatsApp Destination:</strong> {resendTargetParent.normalizedWhatsAppNumber || resendTargetParent.whatsappNumber || resendTargetParent.phoneNumber}</div>
                  {resendTargetParent.sentAt && (
                    <div><strong>Previously sent:</strong> {new Date(resendTargetParent.sentAt).toLocaleString()}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2E2C28]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setResendTargetParent(null)}
                disabled={isSubmittingSend}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => executeSendInvitations([resendTargetParent.parentId], true)}
                disabled={isSubmittingSend}
                className="text-xs bg-[#C59B27] hover:bg-[#B08921] text-white"
              >
                {isSubmittingSend ? 'Sending...' : 'Confirm Resend'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Parent Communication Context / Detail Modal */}
      {detailParent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-[#1E1E1C] border border-[#EAE8E1] dark:border-[#2E2C28] rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scale-in text-left">
            <div className="flex items-center justify-between border-b border-[#EAE8E1] dark:border-[#2E2C28] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Parent Communication Context
                </h3>
                <p className="text-[11px] text-neutral-400">
                  {detailParent.fullName}
                </p>
              </div>
              <button
                onClick={() => setDetailParent(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Parent contact information */}
            <div className="space-y-1.5 text-xs">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Contact Details</div>
              <div className="grid grid-cols-2 gap-2 bg-[#FAF9F6] dark:bg-[#242320] p-3 rounded border border-[#EAE8E1] dark:border-[#383632]">
                <div>
                  <span className="text-neutral-400 text-[10px] block">Phone / WhatsApp:</span>
                  <span className="font-mono text-neutral-800 dark:text-neutral-200">{detailParent.whatsappNumber || detailParent.phoneNumber || 'None'}</span>
                </div>
                <div>
                  <span className="text-neutral-400 text-[10px] block">Email:</span>
                  <span className="text-neutral-800 dark:text-neutral-200 truncate block">{detailParent.email || 'None'}</span>
                </div>
                <div>
                  <span className="text-neutral-400 text-[10px] block">WhatsApp Availability:</span>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200 capitalize">{detailParent.whatsappAvailability.replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="text-neutral-400 text-[10px] block">Opt-in Consent:</span>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200 capitalize">{detailParent.whatsappConsentStatus}</span>
                </div>
              </div>
            </div>

            {/* Connected children list */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                <span>Connected Children ({detailParent.totalRegisteredChildren})</span>
                <span className="text-[#C59B27] font-bold">{detailParent.selectedRatioText}</span>
              </div>
              <div className="space-y-1.5">
                {detailParent.children.map(c => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between p-2.5 rounded border text-xs ${
                      c.isSelected
                        ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/40'
                        : 'bg-neutral-50/50 dark:bg-neutral-900/40 border-[#EAE8E1] dark:border-[#302F2C]'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">{c.fullName}</div>
                      <div className="text-[10px] text-neutral-400">{c.ageGroup || 'Unspecified Age Group'}</div>
                    </div>
                    <div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        c.isSelected
                          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                          : 'bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                      }`}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Normalized Selected Names */}
            <div className="space-y-1 text-xs">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Template Value: selected_child_names
              </div>
              <div className="bg-[#FAF9F6] dark:bg-[#242320] border border-[#EAE8E1] dark:border-[#383632] rounded p-2.5 font-medium text-neutral-900 dark:text-neutral-100">
                {detailParent.selectedChildNames}
              </div>
            </div>

            {/* Channel invitation history */}
            <div className="space-y-1 text-xs">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Channel Invitation Status
              </div>
              <div className="bg-[#FAF9F6] dark:bg-[#242320] border border-[#EAE8E1] dark:border-[#383632] rounded p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <span className={`font-semibold capitalize ${
                    detailParent.invitationStatus === 'sent'
                      ? 'text-emerald-600'
                      : detailParent.invitationStatus === 'failed'
                        ? 'text-red-600'
                        : 'text-neutral-400'
                  }`}>
                    {detailParent.invitationStatus.replace('_', ' ')}
                  </span>
                </div>
                {detailParent.sentAt && (
                  <div className="flex items-center justify-between text-neutral-500">
                    <span>Sent At:</span>
                    <span>{new Date(detailParent.sentAt).toLocaleString()}</span>
                  </div>
                )}
                {detailParent.failureReason && (
                  <div className="flex items-center justify-between text-red-600">
                    <span>Failure Reason:</span>
                    <span>{detailParent.failureReason}</span>
                  </div>
                )}
                {detailParent.providerMessageId && (
                  <div className="flex items-center justify-between text-neutral-400 text-[10.5px]">
                    <span>Message ID:</span>
                    <span className="font-mono">{detailParent.providerMessageId}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2E2C28]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDetailParent(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Custom Amount Selection Modal */}
      {showCustomAmountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <form
            onSubmit={handleCustomAmountSubmit}
            className="bg-white dark:bg-[#1E1E1C] border border-[#EAE8E1] dark:border-[#2E2C28] rounded-xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-scale-in text-left"
          >
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Select Custom Amount
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Choose how many parents from the filtered set ({displayParents.length} available) you want to select.
              </p>
            </div>

            <div className="space-y-1.5">
              <input
                type="number"
                min="1"
                max={displayParents.length}
                value={customAmountValue}
                onChange={(e) => {
                  setCustomAmountValue(e.target.value);
                  setCustomAmountError('');
                }}
                className="w-full px-3 py-2 text-xs bg-[#FAF9F6] dark:bg-[#242320] border border-[#EAE8E1] dark:border-[#383632] rounded focus:outline-none focus:border-[#C59B27]"
                placeholder={`1 to ${displayParents.length}`}
                autoFocus
              />
              {customAmountError && (
                <p className="text-[11px] text-red-600 dark:text-red-400">{customAmountError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2E2C28]">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowCustomAmountModal(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs bg-[#C59B27] hover:bg-[#B08921] text-white"
              >
                Apply Selection
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: Bulk Send Result Summary Modal */}
      {bulkSendSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-[#1E1E1C] border border-[#EAE8E1] dark:border-[#2E2C28] rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-scale-in text-left">
            <div className="flex items-center justify-between border-b border-[#EAE8E1] dark:border-[#2E2C28] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Channel Invitations Dispatch Summary
                </h3>
                <p className="text-[11px] text-neutral-400">
                  {bulkSendSummary.totalRequested} recipient(s) evaluated
                </p>
              </div>
              <button
                onClick={() => setBulkSendSummary(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Counts breakdown row */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded p-2.5">
                <div className="text-base font-bold text-emerald-700 dark:text-emerald-400">{bulkSendSummary.sentCount}</div>
                <div className="text-[10px] text-emerald-800 dark:text-emerald-400 font-medium uppercase tracking-wider">Sent</div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded p-2.5">
                <div className="text-base font-bold text-amber-700 dark:text-amber-400">{bulkSendSummary.skippedCount}</div>
                <div className="text-[10px] text-amber-800 dark:text-amber-400 font-medium uppercase tracking-wider">Skipped</div>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded p-2.5">
                <div className="text-base font-bold text-red-700 dark:text-red-400">{bulkSendSummary.failedCount}</div>
                <div className="text-[10px] text-red-800 dark:text-red-400 font-medium uppercase tracking-wider">Failed</div>
              </div>
            </div>

            {/* Itemized details list */}
            {bulkSendSummary.details && bulkSendSummary.details.length > 0 && (
              <div className="space-y-1.5 text-xs max-h-56 overflow-y-auto pr-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Recipient Details</div>
                <div className="space-y-1">
                  {bulkSendSummary.details.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded bg-[#FAF9F6] dark:bg-[#242320] border border-[#EAE8E1] dark:border-[#383632] text-[11px]"
                    >
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">{d.parentName}</span>
                      <div className="flex items-center gap-2">
                        {d.reason && (
                          <span className="text-[10px] text-neutral-400">{d.reason}</span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          d.status === 'sent'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : d.status === 'skipped'
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                              : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                        }`}>
                          {d.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2E2C28]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setBulkSendSummary(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

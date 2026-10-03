import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  UserCheck,
  Copy,
  Search,
  Filter,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  Info,
  X,
  Loader2,
  ExternalLink,
  Users,
  MapPin,
  Calendar,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { api, extractApiError } from '../../../services/api';
import { useNotification } from '../../../context/NotificationContext';

export interface UrgentAlertTriageWorkspaceProps {
  alerts: any[];
  onRefresh: () => Promise<void> | void;
  onOpenAlertDetail: (alert: any) => void;
  adminUser?: any;
  onNavigateToOperations?: () => void;
  onViewAll?: () => void;
}

export type TriageFilter =
  | 'all'
  | 'critical'
  | 'unacknowledged'
  | 'assigned'
  | 'escalated'
  | 'stale'
  | 'duplicates';

export type TriageSort = 'severity' | 'newest' | 'oldest' | 'updated';

const PAGE_SIZE = 25;
const OVERVIEW_MAX_ROWS = 5;
const STORAGE_KEY = 'koinonia-admin-alert-triage-collapsed';

export const UrgentAlertTriageWorkspace: React.FC<UrgentAlertTriageWorkspaceProps> = ({
  alerts,
  onRefresh,
  onOpenAlertDetail,
  adminUser,
  onNavigateToOperations,
  onViewAll
}) => {
  const { showSuccess, showError, showInfo } = useNotification();

  // Full workspace modal dialog state
  const [isFullWorkspaceModalOpen, setIsFullWorkspaceModalOpen] = useState(false);

  // Collapsible workspace state & preference persistence
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        return stored === 'true';
      }
    } catch (e) {
      // localStorage error fallback
    }
    // Default on first entry: expanded (false)
    return false;
  });

  // Active filters & search & sort
  const [activeFilter, setActiveFilter] = useState<TriageFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<TriageSort>('severity');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'list' | 'groups'>('list');

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk resolution modal state
  const [isBulkResolveOpen, setIsBulkResolveOpen] = useState(false);
  const [resolutionOutcome, setResolutionOutcome] = useState('resolved_on_site');
  const [resolutionNote, setResolutionNote] = useState('');
  const [distinctWarningConfirmed, setDistinctWarningConfirmed] = useState(false);
  const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);

  // Operations assistant drafted note / summary
  const [assistantSummary, setAssistantSummary] = useState<string | null>(null);
  const [isDraftingNote, setIsDraftingNote] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Quick single actions
  const [processingActionId, setProcessingActionId] = useState<string | null>(null);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());

  // Track known urgent unacknowledged alert IDs so we only auto-expand for brand NEW immediate alerts
  const knownUrgentUnackAlertIdsRef = React.useRef<Set<string> | null>(null);

  // 1. Filter out resolved alerts for the active queue
  const unresolvedAlerts = useMemo(() => {
    return alerts.filter((a: any) => a.status !== 'resolved');
  }, [alerts]);

  // 2. Deterministic duplicate grouping algorithm
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, any[]>();

    unresolvedAlerts.forEach((alert) => {
      const normCat = (alert.category || 'general').trim().toLowerCase();
      const normTitle = (alert.title || '').trim().toLowerCase().replace(/^\[escalated\]\s*/i, '');
      const normMsg = (alert.message || '').trim().toLowerCase();
      // Deterministic signature based on normalized category, title, message snippet
      const key = `${normCat}||${normTitle}||${normMsg.slice(0, 50)}`;

      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(alert);
    });

    const groups: Array<{
      key: string;
      category: string;
      title: string;
      sampleMessage: string;
      alerts: any[];
      count: number;
      reporters: string[];
      locations: string[];
      firstRaised: string;
      latestRaised: string;
    }> = [];

    map.forEach((items, key) => {
      if (items.length > 1) {
        // Sort items by created_at
        items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const reporters = Array.from(new Set(items.map((i) => i.raised_by_name || 'Volunteer').filter(Boolean))) as string[];
        const locations = Array.from(new Set(items.map((i) => i.location_label).filter(Boolean))) as string[];

        groups.push({
          key,
          category: items[0].category || 'general',
          title: items[0].title || 'Safety Concern',
          sampleMessage: items[0].message || '',
          alerts: items,
          count: items.length,
          reporters,
          locations,
          firstRaised: items[0].created_at,
          latestRaised: items[items.length - 1].created_at
        });
      }
    });

    // Sort groups by count descending
    return groups.sort((a, b) => b.count - a.count);
  }, [unresolvedAlerts]);

  // Set of all alert IDs that belong to a duplicate group
  const duplicateAlertIdSet = useMemo(() => {
    const set = new Set<string>();
    duplicateGroups.forEach((g) => {
      g.alerts.forEach((a) => set.add(a.id));
    });
    return set;
  }, [duplicateGroups]);

  // 3. Triage Summary metrics
  const summaryMetrics = useMemo(() => {
    const now = Date.now();
    const critical = unresolvedAlerts.filter((a) => a.severity === 'urgent').length;
    const needsAck = unresolvedAlerts.filter((a) => a.status === 'open' && !a.acknowledged_at).length;
    const assigned = unresolvedAlerts.filter((a) => Boolean(a.owner_user_id || a.acknowledged_by)).length;
    const escalated = unresolvedAlerts.filter((a) => (a.title && a.title.includes('[ESCALATED]')) || a.severity === 'urgent').length;
    const stale = unresolvedAlerts.filter((a) => {
      const ageMs = now - new Date(a.created_at).getTime();
      return ageMs > 24 * 60 * 60 * 1000;
    }).length;
    const duplicates = duplicateAlertIdSet.size;

    return {
      total: unresolvedAlerts.length,
      critical,
      needsAck,
      assigned,
      escalated,
      stale,
      duplicates
    };
  }, [unresolvedAlerts, duplicateAlertIdSet]);

  // 4. Filter and search alerts
  const filteredAlerts = useMemo(() => {
    let list = [...unresolvedAlerts];
    const now = Date.now();

    // Apply active filter
    switch (activeFilter) {
      case 'critical':
        list = list.filter((a) => a.severity === 'urgent');
        break;
      case 'unacknowledged':
        list = list.filter((a) => a.status === 'open' && !a.acknowledged_at);
        break;
      case 'assigned':
        list = list.filter((a) => Boolean(a.owner_user_id || a.acknowledged_by));
        break;
      case 'escalated':
        list = list.filter((a) => (a.title && a.title.includes('[ESCALATED]')) || a.severity === 'urgent');
        break;
      case 'stale':
        list = list.filter((a) => {
          const ageMs = now - new Date(a.created_at).getTime();
          return ageMs > 24 * 60 * 60 * 1000;
        });
        break;
      case 'duplicates':
        list = list.filter((a) => duplicateAlertIdSet.has(a.id));
        break;
      case 'all':
      default:
        break;
    }

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((a) => {
        const title = (a.title || '').toLowerCase();
        const msg = (a.message || '').toLowerCase();
        const reporter = (a.raised_by_name || '').toLowerCase();
        const loc = (a.location_label || '').toLowerCase();
        const child = (a.child_name || '').toLowerCase();
        const cat = (a.category || '').toLowerCase();
        return (
          title.includes(q) ||
          msg.includes(q) ||
          reporter.includes(q) ||
          loc.includes(q) ||
          child.includes(q) ||
          cat.includes(q)
        );
      });
    }

    // Apply sorting
    list.sort((a, b) => {
      if (sortOrder === 'severity') {
        const sevOrder: Record<string, number> = { urgent: 1, important: 2, info: 3 };
        const diff = (sevOrder[a.severity] || 9) - (sevOrder[b.severity] || 9);
        if (diff !== 0) return diff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortOrder === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortOrder === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortOrder === 'updated') {
        return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
      }
      return 0;
    });

    return list;
  }, [unresolvedAlerts, activeFilter, searchQuery, sortOrder, duplicateAlertIdSet]);

  // Overview preview CTA count & visibility semantics
  const isFilterOrSearchActive = activeFilter !== 'all' || Boolean(searchQuery.trim());
  const showOverviewCta = isFilterOrSearchActive
    ? filteredAlerts.length > OVERVIEW_MAX_ROWS
    : unresolvedAlerts.length > OVERVIEW_MAX_ROWS;
  const overviewCtaCount = isFilterOrSearchActive
    ? filteredAlerts.length
    : unresolvedAlerts.length;

  // 5. Pagination
  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / PAGE_SIZE));
  const currentPageAlerts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAlerts.slice(start, start + PAGE_SIZE);
  }, [filteredAlerts, currentPage]);

  // Selection helpers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectPage = () => {
    const pageIds = currentPageAlerts.map((a) => a.id);
    const allPageSelected = pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleSelectGroup = (groupAlerts: any[]) => {
    const groupIds = groupAlerts.map((a) => a.id);
    const allSelected = groupIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        groupIds.forEach((id) => next.delete(id));
      } else {
        groupIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Selected alert objects for modal review
  const selectedAlertsList = useMemo(() => {
    return unresolvedAlerts.filter((a) => selectedIds.has(a.id));
  }, [unresolvedAlerts, selectedIds]);

  // Distinct critical alert protection check (Section 9)
  const distinctCriticalCheck = useMemo(() => {
    if (selectedAlertsList.length <= 1) return { isDiverse: false, reasons: [] };

    const distinctChildren = new Set(selectedAlertsList.map((a) => a.child_id).filter(Boolean));
    const distinctCategories = new Set(selectedAlertsList.map((a) => a.category).filter(Boolean));
    const distinctLocations = new Set(selectedAlertsList.map((a) => a.location_label).filter(Boolean));
    const hasUrgent = selectedAlertsList.some((a) => a.severity === 'urgent');

    const reasons: string[] = [];
    if (distinctChildren.size > 1) {
      reasons.push(`${distinctChildren.size} different children referenced`);
    }
    if (distinctCategories.size > 1) {
      reasons.push(`Multiple different incident categories (${Array.from(distinctCategories).join(', ')})`);
    }
    if (distinctLocations.size > 2) {
      reasons.push(`Spread across ${distinctLocations.size} distinct physical locations`);
    }

    const isDiverse = hasUrgent && reasons.length > 0;
    return { isDiverse, reasons };
  }, [selectedAlertsList]);

  // Format relative timestamp helper
  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // Single alert actions
  const handleAcknowledgeSingle = async (alertId: string) => {
    setProcessingActionId(alertId);
    try {
      const res = await api.admin.acknowledgeSafetyAlert(alertId);
      if (res && res.success) {
        showSuccess('Acknowledged', 'Alert acknowledged.');
        await onRefresh();
      } else {
        showError('Action Failed', 'Could not acknowledge alert.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Action Failed', apiErr.message || 'Error acknowledging alert.');
    } finally {
      setProcessingActionId(null);
    }
  };

  // Bulk actions
  const handleBulkAcknowledge = async () => {
    if (selectedIds.size === 0) return;
    setIsSubmittingResolve(true);
    try {
      const res = await api.admin.bulkAcknowledgeSafetyAlerts(Array.from(selectedIds));
      if (res && res.success) {
        showSuccess('Bulk Acknowledged', res.message || `${res.acknowledgedCount} alerts acknowledged.`);
        setSelectedIds(new Set());
        await onRefresh();
      } else {
        showError('Bulk Action Failed', 'Could not acknowledge selected alerts.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Bulk Action Failed', apiErr.message || 'Error processing bulk acknowledgement.');
    } finally {
      setIsSubmittingResolve(false);
    }
  };

  const handleOpenBulkResolveModal = (preselected?: any[]) => {
    if (preselected && preselected.length > 0) {
      setSelectedIds(new Set(preselected.map((a) => a.id)));
    }
    setResolutionNote('');
    setResolutionOutcome('resolved_on_site');
    setAssistantSummary(null);
    setDistinctWarningConfirmed(false);
    setIsBulkResolveOpen(true);
  };

  // Operations Assistant: Summarise selected alerts (Section 7)
  const handleSummariseSelected = () => {
    setIsSummarizing(true);
    try {
      const count = selectedAlertsList.length;
      if (count === 0) return;

      const categories = Array.from(new Set(selectedAlertsList.map((a) => a.category || 'General')));
      const reporters = Array.from(new Set(selectedAlertsList.map((a) => a.raised_by_name || 'Volunteer')));
      const locations = Array.from(new Set(selectedAlertsList.map((a) => a.location_label).filter(Boolean)));
      const titles = Array.from(new Set(selectedAlertsList.map((a) => a.title).filter(Boolean)));

      const oldestTime = new Date(
        Math.min(...selectedAlertsList.map((a) => new Date(a.created_at).getTime()))
      ).toLocaleDateString();
      const newestTime = new Date(
        Math.max(...selectedAlertsList.map((a) => new Date(a.created_at).getTime()))
      ).toLocaleDateString();

      let summaryText = `• ${count} alert records selected spanning ${oldestTime} to ${newestTime}.\n`;
      summaryText += `• Primary categories: ${categories.join(', ')}.\n`;
      summaryText += `• Reported by: ${reporters.slice(0, 3).join(', ')}${reporters.length > 3 ? ` (+${reporters.length - 3} others)` : ''}.\n`;
      if (locations.length > 0) {
        summaryText += `• Noted locations: ${locations.slice(0, 3).join(', ')}${locations.length > 3 ? ` (+${locations.length - 3} others)` : ''}.\n`;
      }
      summaryText += `• Recurring patterns: ${titles.slice(0, 2).map((t) => `"${t}"`).join(', ')}.\n`;
      summaryText += `• Recommendation: Verify responder actions and physical care status before final sign-off.`;

      setAssistantSummary(summaryText);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Operations Assistant: Draft resolution note (Section 8)
  const handleDraftResolutionNote = () => {
    setIsDraftingNote(true);
    try {
      const count = selectedAlertsList.length;
      const oldestDate = new Date(
        Math.min(...selectedAlertsList.map((a) => new Date(a.created_at).getTime()))
      ).toLocaleDateString();
      const newestDate = new Date(
        Math.max(...selectedAlertsList.map((a) => new Date(a.created_at).getTime()))
      ).toLocaleDateString();

      const categories = Array.from(new Set(selectedAlertsList.map((a) => a.category || 'concern')));
      const catLabel = categories.join(' and ');

      const outcomeLabels: Record<string, string> = {
        resolved_on_site: 'resolved on-site by the care and security lead',
        duplicate_entry: 'duplicate notification closed after verification',
        false_alarm: 'non-critical notification with all children verified safe',
        handed_over_parent: 'safely concluded upon handover to parent or guardian',
        medical_treated: 'medical support rendered and volunteer assistance completed',
        drill_test_completed: 'concluded as routine system testing drill',
        other: 'administrative review and resolution'
      };

      const outcomeDesc = outcomeLabels[resolutionOutcome] || 'resolved';
      const draft = `Reviewed ${count} related alert(s) logged between ${oldestDate} and ${newestDate}. These reports concern repeated ${catLabel} notifications. Event response and volunteer logs were reviewed and the selected records are formally closed as ${outcomeDesc}.`;

      setResolutionNote(draft);
    } finally {
      setIsDraftingNote(false);
    }
  };

  // Submit bulk resolution
  const handleConfirmBulkResolve = async () => {
    if (selectedAlertsList.length === 0) return;
    if (!resolutionNote.trim()) {
      showError('Note Required', 'Please provide or confirm a resolution note.');
      return;
    }

    if (distinctCriticalCheck.isDiverse && !distinctWarningConfirmed) {
      showError('Review Confirmation Required', 'Please confirm that the differing incidents were reviewed together.');
      return;
    }

    setIsSubmittingResolve(true);
    try {
      const res = await api.admin.bulkResolveSafetyAlerts(
        Array.from(selectedIds),
        resolutionNote.trim(),
        resolutionOutcome
      );

      if (res && res.success) {
        showSuccess('Resolved', res.message || `${res.resolvedCount} alert(s) resolved successfully.`);
        setIsBulkResolveOpen(false);
        setSelectedIds(new Set());
        setResolutionNote('');
        await onRefresh();
      } else {
        showError('Resolution Failed', 'Could not resolve selected alerts.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Resolution Failed', apiErr.message || 'Error executing bulk resolution.');
    } finally {
      setIsSubmittingResolve(false);
    }
  };

  // Safety behavior: auto-expand if a brand new immediate/unacknowledged critical alert arrives
  React.useEffect(() => {
    const currentUrgentUnackAlerts = unresolvedAlerts.filter(
      (a) => a.severity === 'urgent' && a.status === 'open' && !a.acknowledged_at
    );
    const currentIds = new Set(currentUrgentUnackAlerts.map((a) => a.id));

    if (knownUrgentUnackAlertIdsRef.current === null) {
      // First load: initialize the ref with current unacknowledged urgent IDs
      knownUrgentUnackAlertIdsRef.current = currentIds;
    } else {
      // Check if any alert is newly added to this urgent unacknowledged set
      let hasNewUrgentUnackAlert = false;
      currentIds.forEach((id) => {
        if (!knownUrgentUnackAlertIdsRef.current!.has(id)) {
          hasNewUrgentUnackAlert = true;
        }
      });

      if (hasNewUrgentUnackAlert) {
        // Re-open workspace automatically if a new genuinely immediate/unacknowledged critical alert arrives
        setIsCollapsed(false);
        try {
          localStorage.setItem(STORAGE_KEY, 'false');
        } catch (e) { }
      }

      // Update ref to track current IDs
      knownUrgentUnackAlertIdsRef.current = currentIds;
    }
  }, [unresolvedAlerts]);

  // Shared alert row renderer for Overview preview and Full Workspace modal
  const renderAlertRow = (alert: any) => {
    const isSelected = selectedIds.has(alert.id);
    const isStale = Date.now() - new Date(alert.created_at).getTime() > 24 * 60 * 60 * 1000;
    const isUrgent = alert.severity === 'urgent';
    const isAck = alert.status === 'acknowledged';

    return (
      <div
        key={alert.id}
        className={`px-3.5 py-3 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
          isSelected
            ? 'bg-red-50/40 dark:bg-red-950/20 border-red-300 dark:border-red-900/60'
            : 'bg-white dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
        }`}
      >
        <div className="flex items-start gap-2.5 overflow-hidden">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => handleToggleSelect(alert.id)}
            className="rounded border-zinc-300 text-red-600 focus:ring-red-500 cursor-pointer mt-1"
          />

          <div className="space-y-1 overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {/* Title */}
              <span className="font-bold text-zinc-900 dark:text-[#F7F4ED] truncate">
                {alert.title || 'Safety Alert'}
              </span>

              {/* Category badge */}
              <span className="text-[10px] font-semibold px-2 py-0.2 rounded-md bg-zinc-100 dark:bg-[#2A2926] text-zinc-600 dark:text-[#938C81] uppercase tracking-wider">
                {alert.category || 'care'}
              </span>

              {/* Status badge */}
              <span
                className={`text-[10px] font-bold px-2 py-0.2 rounded-md uppercase tracking-wider ${
                  isAck
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                    : 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                }`}
              >
                {isAck ? 'Acknowledged' : 'Needs Response'}
              </span>

              {/* Stale badge */}
              {isStale && (
                <span className="text-[10px] font-bold px-2 py-0.2 rounded-md bg-zinc-200/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  Stale &gt;24h
                </span>
              )}

              {/* Duplicate indicator */}
              {duplicateAlertIdSet.has(alert.id) && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  Possible Dup
                </span>
              )}
            </div>

            {/* Snippet */}
            {alert.message && (
              <p className="text-[11px] text-zinc-600 dark:text-[#938C81] line-clamp-1 italic">
                "{alert.message}"
              </p>
            )}

            {/* Reporter / Location / Age */}
            <div className="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-[#938C81] flex-wrap">
              <span>
                Reporter: <strong className="text-zinc-700 dark:text-zinc-300">{alert.raised_by_name || 'Volunteer'}</strong>
              </span>
              {alert.location_label && (
                <span>
                  Location: <strong className="text-zinc-700 dark:text-zinc-300">{alert.location_label}</strong>
                </span>
              )}
              {alert.child_name && (
                <span>
                  Child: <strong className="text-zinc-700 dark:text-zinc-300">{alert.child_name}</strong>
                </span>
              )}
              <span>· {formatTimeAgo(alert.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
          {!isAck && (
            <button
              type="button"
              onClick={() => handleAcknowledgeSingle(alert.id)}
              disabled={processingActionId === alert.id}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40 transition-colors cursor-pointer"
            >
              {processingActionId === alert.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                'Acknowledge'
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenAlertDetail(alert)}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-[#20201E] hover:bg-zinc-50 dark:hover:bg-[#2A2926] text-zinc-700 dark:text-[#F7F4ED] border border-zinc-200 dark:border-[#2A2926] transition-colors cursor-pointer"
          >
            Open
          </button>

          <button
            type="button"
            onClick={() => handleOpenBulkResolveModal([alert])}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer shadow-2xs"
          >
            Resolve
          </button>
        </div>
      </div>
    );
  };

  // Presentation toggle handler: persists admin preference locally
  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch (e) { }
      return next;
    });
  };

  if (unresolvedAlerts.length === 0) {
    return null;
  }

  return (
    <section
      data-view-version="urgent-alert-triage-workspace-v1"
      className="bg-white dark:bg-[#181817] border border-[#EAE8E1] dark:border-[#2A2926] rounded-2xl shadow-sm font-sans transition-all duration-200 motion-reduce:transition-none overflow-hidden"
    >
      {/* 1. HEADER SECTION (Collapsed summary strip OR Expanded header) */}
      {isCollapsed ? (
        /* COLLAPSED SUMMARY STRIP (Single compact dashboard row, responsive on mobile) */
        <div className="p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Icon + Title + Unresolved count + Mobile toggle */}
          <div className="flex items-center justify-between lg:justify-start gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl border border-red-200/80 dark:border-red-900/50 shrink-0">
                <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-[#F7F4ED]">
                  Urgent Attention
                </h2>
                <span className="bg-zinc-100 dark:bg-[#20201E] text-zinc-800 dark:text-[#F7F4ED] text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-zinc-200 dark:border-[#2A2926]">
                  {summaryMetrics.total} unresolved {summaryMetrics.total === 1 ? 'alert' : 'alerts'}
                </span>
              </div>
            </div>

            {/* Mobile Expand Button */}
            <div className="lg:hidden">
              <button
                type="button"
                aria-expanded={false}
                aria-controls="urgent-triage-workspace-body"
                aria-label="View urgent alerts"
                onClick={handleToggleCollapse}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-[#F7F4ED] dark:hover:bg-zinc-200 text-white dark:text-zinc-900 transition-colors shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
              >
                <span>View urgent alerts</span>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Center: Compact Summary Metrics */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Critical */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-zinc-100 dark:bg-[#20201E] border border-zinc-200/80 dark:border-[#2A2926] text-zinc-700 dark:text-[#C8C2B6]">
              <span>Critical</span>
              <strong className="font-bold text-red-600 dark:text-red-400">
                {summaryMetrics.critical}
              </strong>
            </div>

            {/* Needs response */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border ${summaryMetrics.needsAck > 0
                  ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60 font-semibold'
                  : 'bg-zinc-100 dark:bg-[#20201E] border-zinc-200/80 dark:border-[#2A2926] text-zinc-700 dark:text-[#C8C2B6]'
                }`}
            >
              {summaryMetrics.needsAck > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse shrink-0" aria-hidden="true" />
              )}
              <span>Needs response</span>
              <strong className={summaryMetrics.needsAck > 0 ? 'font-bold text-red-600 dark:text-red-400' : 'font-bold text-zinc-900 dark:text-[#F7F4ED]'}>
                {summaryMetrics.needsAck}
              </strong>
            </div>

            {/* Older >24h */}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-zinc-100 dark:bg-[#20201E] border border-zinc-200/80 dark:border-[#2A2926] text-zinc-700 dark:text-[#C8C2B6]">
              <span>Older &gt;24h</span>
              <strong className="font-bold text-zinc-900 dark:text-[#F7F4ED]">
                {summaryMetrics.stale}
              </strong>
            </div>

            {/* Possible duplicates */}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-zinc-100 dark:bg-[#20201E] border border-zinc-200/80 dark:border-[#2A2926] text-zinc-700 dark:text-[#C8C2B6]">
              <span>Possible duplicates</span>
              <strong className="font-bold text-zinc-900 dark:text-[#F7F4ED]">
                {summaryMetrics.duplicates}
              </strong>
            </div>
          </div>

          {/* Right: Desktop Expand Button */}
          <div className="hidden lg:block">
            <button
              type="button"
              aria-expanded={false}
              aria-controls="urgent-triage-workspace-body"
              aria-label="View urgent alerts"
              onClick={handleToggleCollapse}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-[#F7F4ED] dark:hover:bg-zinc-200 text-white dark:text-zinc-900 transition-colors shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
            >
              <span>View urgent alerts</span>
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        /* EXPANDED HEADER */
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl border border-red-200/80 dark:border-red-900/50 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-zinc-900 dark:text-[#F7F4ED]">
                  Urgent Attention
                </h2>
                <span className="bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-red-200/60 dark:border-red-900/60">
                  {summaryMetrics.total} unresolved {summaryMetrics.total === 1 ? 'alert' : 'alerts'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-[#938C81] mt-0.5">
                Structured safety alert queue and response triage workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto flex-wrap">
            {/* Duplicate Groups shortcut */}
            {duplicateGroups.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setViewMode('groups');
                  setIsFullWorkspaceModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-amber-600" />
                <span>Duplicate Groups</span>
                <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold rounded-full">
                  {duplicateGroups.length}
                </span>
              </button>
            )}

            {/* Hide urgent alerts button */}
            <button
              type="button"
              aria-expanded={true}
              aria-controls="urgent-triage-workspace-body"
              aria-label="Hide urgent alerts"
              onClick={handleToggleCollapse}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-[#F7F4ED] dark:hover:bg-zinc-200 text-white dark:text-zinc-900 transition-colors shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
            >
              <span>Hide urgent alerts</span>
              <ChevronDown className="w-3.5 h-3.5 rotate-180 transition-transform duration-200 motion-reduce:transition-none" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* 2. COLLAPSIBLE WORKSPACE BODY */}
      <div
        id="urgent-triage-workspace-body"
        role="region"
        aria-label="Urgent alert triage workspace details"
        aria-hidden={isCollapsed}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out motion-reduce:transition-none ${isCollapsed
            ? 'grid-rows-[0fr] opacity-0 invisible pointer-events-none'
            : 'grid-rows-[1fr] opacity-100 visible pointer-events-auto'
          }`}
      >
        <div className="overflow-hidden">
          <div className="p-4 sm:p-5 pt-3 space-y-6 border-t border-[#EAE8E1] dark:border-[#2A2926]">
            {/* COMPACT TRIAGE SUMMARY METRIC CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Critical */}
              <button
                type="button"
                onClick={() => setActiveFilter('critical')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${activeFilter === 'critical'
                    ? 'bg-red-50/80 dark:bg-red-950/30 border-red-300 dark:border-red-900/80 ring-1 ring-red-500/30'
                    : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
              >
                <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                  Critical
                </div>
                <div className="text-lg font-bold text-red-600 dark:text-red-400 mt-0.5">
                  {summaryMetrics.critical}
                </div>
              </button>

              {/* Needs Acknowledgement */}
              <button
                type="button"
                onClick={() => setActiveFilter('unacknowledged')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${activeFilter === 'unacknowledged'
                    ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900/80 ring-1 ring-amber-500/30'
                    : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
              >
                <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                  Needs Ack
                </div>
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                  {summaryMetrics.needsAck}
                </div>
              </button>

              {/* Responder Assigned */}
              <button
                type="button"
                onClick={() => setActiveFilter('assigned')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${activeFilter === 'assigned'
                    ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-300 dark:border-blue-900/80 ring-1 ring-blue-500/30'
                    : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
              >
                <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                  Assigned
                </div>
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  {summaryMetrics.assigned}
                </div>
              </button>

              {/* Escalated */}
              <button
                type="button"
                onClick={() => setActiveFilter('escalated')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${activeFilter === 'escalated'
                    ? 'bg-purple-50/80 dark:bg-purple-950/30 border-purple-300 dark:border-purple-900/80 ring-1 ring-purple-500/30'
                    : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
              >
                <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                  Escalated
                </div>
                <div className="text-lg font-bold text-purple-600 dark:text-purple-400 mt-0.5">
                  {summaryMetrics.escalated}
                </div>
              </button>

              {/* Older than 24h (Stale) */}
              <button
                type="button"
                onClick={() => setActiveFilter('stale')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${activeFilter === 'stale'
                    ? 'bg-zinc-200/80 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-600 ring-1 ring-zinc-400/30'
                    : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
              >
                <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                  Older &gt;24h
                </div>
                <div className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mt-0.5">
                  {summaryMetrics.stale}
                </div>
              </button>

              {/* Possible duplicates */}
              <button
                type="button"
                onClick={() => {
                  setActiveFilter('duplicates');
                  setViewMode('groups');
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${activeFilter === 'duplicates'
                    ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900/80 ring-1 ring-amber-500/30'
                    : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
              >
                <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                  Duplicates
                </div>
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                  {summaryMetrics.duplicates}
                </div>
              </button>
            </div>

            {/* 3. FILTERS, SEARCH, SORT CONTROLS */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search alert, reporter, location, child, category..."
                    className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-[#20201E] border border-zinc-200 dark:border-[#2A2926] rounded-xl text-xs text-zinc-900 dark:text-[#F7F4ED] placeholder-zinc-400 focus:outline-none focus:border-red-500 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Sort */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-[#938C81]">
                    Sort:
                  </span>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as TriageSort)}
                    className="text-xs py-2 px-3 bg-zinc-50 dark:bg-[#20201E] border border-zinc-200 dark:border-[#2A2926] rounded-xl text-zinc-800 dark:text-[#F7F4ED] focus:outline-none cursor-pointer"
                  >
                    <option value="severity">Severity (Urgent first)</option>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="updated">Recently updated</option>
                  </select>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {[
                  { id: 'all', label: 'All', count: summaryMetrics.total },
                  { id: 'critical', label: 'Critical', count: summaryMetrics.critical },
                  { id: 'unacknowledged', label: 'Unacknowledged', count: summaryMetrics.needsAck },
                  { id: 'assigned', label: 'Assigned', count: summaryMetrics.assigned },
                  { id: 'escalated', label: 'Escalated', count: summaryMetrics.escalated },
                  { id: 'stale', label: 'Older >24h', count: summaryMetrics.stale },
                  { id: 'duplicates', label: 'Possible Duplicates', count: summaryMetrics.duplicates }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveFilter(item.id as TriageFilter);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${activeFilter === item.id
                        ? 'bg-zinc-900 dark:bg-[#F7F4ED] text-white dark:text-zinc-900 font-semibold'
                        : 'bg-zinc-100 dark:bg-[#20201E] text-zinc-600 dark:text-[#938C81] hover:bg-zinc-200 dark:hover:bg-[#2A2926]'
                      }`}
                  >
                    <span>{item.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeFilter === item.id
                          ? 'bg-white/20 dark:bg-black/20 text-white dark:text-zinc-900'
                          : 'bg-zinc-200 dark:bg-[#2A2926] text-zinc-700 dark:text-zinc-300'
                        }`}
                    >
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. OVERVIEW ALERT PREVIEW (Maximum 5 rows, NO nested scrollbar) */}
            <div className="space-y-2 pt-2">
              {filteredAlerts.length === 0 ? (
                <div className="p-8 text-center bg-zinc-50 dark:bg-[#20201E] rounded-xl border border-dashed border-zinc-200 dark:border-[#2A2926] text-xs text-zinc-500 dark:text-[#938C81]">
                  No alerts match your current filter or search criteria.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredAlerts.slice(0, OVERVIEW_MAX_ROWS).map(renderAlertRow)}
                </div>
              )}

              {/* View all urgent alerts action */}
              {showOverviewCta && (
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#EAE8E1] dark:border-[#2A2926]">
                  <p className="text-xs text-zinc-500 dark:text-[#938C81]">
                    Showing top {Math.min(OVERVIEW_MAX_ROWS, filteredAlerts.length)} of {filteredAlerts.length} {filteredAlerts.length === 1 ? 'alert' : 'alerts'} on Overview
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (onViewAll) {
                        onViewAll();
                      } else {
                        setIsFullWorkspaceModalOpen(true);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer shadow-xs"
                  >
                    <span>View all {overviewCtaCount} urgent alerts →</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 5. PERSISTENT BULK ACTION BAR */}
      {selectedIds.size > 0 && (!isCollapsed || isFullWorkspaceModalOpen) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-zinc-900/95 dark:bg-[#181817]/95 backdrop-blur-md text-white border border-zinc-700/80 dark:border-[#2A2926] rounded-2xl px-5 py-3.5 shadow-2xl flex items-center gap-4 animate-fade-in max-w-xl w-[90vw]">
          <div className="flex items-center gap-2 font-semibold text-xs shrink-0">
            <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-[11px] font-bold">
              {selectedIds.size}
            </span>
            <span>selected</span>
          </div>

          <div className="h-4 w-px bg-zinc-700 shrink-0" />

          <div className="flex items-center gap-2 flex-1 justify-end flex-wrap text-xs">
            <button
              type="button"
              onClick={handleBulkAcknowledge}
              disabled={isSubmittingResolve}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors cursor-pointer"
            >
              Acknowledge
            </button>

            <button
              type="button"
              onClick={() => handleOpenBulkResolveModal()}
              className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-colors cursor-pointer shadow-sm"
            >
              Resolve selected ({selectedIds.size})
            </button>

            <button
              type="button"
              onClick={handleClearSelection}
              className="text-zinc-400 hover:text-white text-xs underline ml-1 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* 6. FULL WORKSPACE MODAL DIALOG */}
      {isFullWorkspaceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#181817] border border-[#EAE8E1] dark:border-[#2A2926] rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl animate-fade-in overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#EAE8E1] dark:border-[#2A2926] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 bg-zinc-50/50 dark:bg-[#1C1C1A]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl border border-red-200/80 dark:border-red-900/50 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-base font-bold text-zinc-900 dark:text-[#F7F4ED]">
                      Urgent Attention — Full Triage Workspace
                    </h2>
                    <span className="bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-red-200/60 dark:border-red-900/60">
                      {summaryMetrics.total} unresolved {summaryMetrics.total === 1 ? 'alert' : 'alerts'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-[#938C81] mt-0.5">
                    Complete safety alert queue, duplicate grouping, and bulk response workflows
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 self-end sm:self-auto flex-wrap">
                {/* View mode toggle */}
                <div className="inline-flex rounded-xl p-0.5 bg-zinc-100 dark:bg-[#20201E] border border-zinc-200 dark:border-[#2A2926] text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-white dark:bg-[#2A2926] text-zinc-900 dark:text-[#F7F4ED] shadow-2xs font-semibold'
                        : 'text-zinc-600 dark:text-[#938C81] hover:text-zinc-900 dark:hover:text-[#F7F4ED]'
                    }`}
                  >
                    List View
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('groups')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                      viewMode === 'groups'
                        ? 'bg-white dark:bg-[#2A2926] text-zinc-900 dark:text-[#F7F4ED] shadow-2xs font-semibold'
                        : 'text-zinc-600 dark:text-[#938C81] hover:text-zinc-900 dark:hover:text-[#F7F4ED]'
                    }`}
                  >
                    <span>Duplicate Groups</span>
                    {duplicateGroups.length > 0 && (
                      <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold rounded-full">
                        {duplicateGroups.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Optional: Go to Event Operations Dashboard */}
                {onNavigateToOperations && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsFullWorkspaceModalOpen(false);
                      onNavigateToOperations();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-[#20201E] dark:hover:bg-[#2A2926] text-zinc-700 dark:text-[#F7F4ED] border border-zinc-200 dark:border-[#2A2926] transition-colors cursor-pointer"
                  >
                    <span>Event Operations</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Close Modal Button */}
                <button
                  type="button"
                  onClick={() => setIsFullWorkspaceModalOpen(false)}
                  aria-label="Close full triage workspace"
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-[#20201E] transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1">
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveFilter('critical')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    activeFilter === 'critical'
                      ? 'bg-red-50/80 dark:bg-red-950/30 border-red-300 dark:border-red-900/80 ring-1 ring-red-500/30'
                      : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                    Critical
                  </div>
                  <div className="text-lg font-bold text-red-600 dark:text-red-400 mt-0.5">
                    {summaryMetrics.critical}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilter('unacknowledged')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    activeFilter === 'unacknowledged'
                      ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900/80 ring-1 ring-amber-500/30'
                      : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                    Needs Ack
                  </div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {summaryMetrics.needsAck}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilter('assigned')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    activeFilter === 'assigned'
                      ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-300 dark:border-blue-900/80 ring-1 ring-blue-500/30'
                      : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                    Assigned
                  </div>
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                    {summaryMetrics.assigned}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilter('escalated')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    activeFilter === 'escalated'
                      ? 'bg-purple-50/80 dark:bg-purple-950/30 border-purple-300 dark:border-purple-900/80 ring-1 ring-purple-500/30'
                      : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                    Escalated
                  </div>
                  <div className="text-lg font-bold text-purple-600 dark:text-purple-400 mt-0.5">
                    {summaryMetrics.escalated}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilter('stale')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    activeFilter === 'stale'
                      ? 'bg-zinc-200/80 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-600 ring-1 ring-zinc-400/30'
                      : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                    Older &gt;24h
                  </div>
                  <div className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mt-0.5">
                    {summaryMetrics.stale}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveFilter('duplicates');
                    setViewMode('groups');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    activeFilter === 'duplicates'
                      ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900/80 ring-1 ring-amber-500/30'
                      : 'bg-zinc-50/70 dark:bg-[#1E1E1C] border-[#EAE8E1] dark:border-[#2A2926] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="text-[10px] font-semibold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider">
                    Duplicates
                  </div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {summaryMetrics.duplicates}
                  </div>
                </button>
              </div>

              {/* Filters, Search, Sort Controls */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Search alert, reporter, location, child, category..."
                      className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-[#20201E] border border-zinc-200 dark:border-[#2A2926] rounded-xl text-xs text-zinc-900 dark:text-[#F7F4ED] placeholder-zinc-400 focus:outline-none focus:border-red-500 transition-colors"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-[#938C81]">
                      Sort:
                    </span>
                    <select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value as TriageSort)}
                      className="text-xs py-2 px-3 bg-zinc-50 dark:bg-[#20201E] border border-zinc-200 dark:border-[#2A2926] rounded-xl text-zinc-800 dark:text-[#F7F4ED] focus:outline-none cursor-pointer"
                    >
                      <option value="severity">Severity (Urgent first)</option>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="updated">Recently updated</option>
                    </select>
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  {[
                    { id: 'all', label: 'All', count: summaryMetrics.total },
                    { id: 'critical', label: 'Critical', count: summaryMetrics.critical },
                    { id: 'unacknowledged', label: 'Unacknowledged', count: summaryMetrics.needsAck },
                    { id: 'assigned', label: 'Assigned', count: summaryMetrics.assigned },
                    { id: 'escalated', label: 'Escalated', count: summaryMetrics.escalated },
                    { id: 'stale', label: 'Older >24h', count: summaryMetrics.stale },
                    { id: 'duplicates', label: 'Possible Duplicates', count: summaryMetrics.duplicates }
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveFilter(item.id as TriageFilter);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                        activeFilter === item.id
                          ? 'bg-zinc-900 dark:bg-[#F7F4ED] text-white dark:text-zinc-900 font-semibold'
                          : 'bg-zinc-100 dark:bg-[#20201E] text-zinc-600 dark:text-[#938C81] hover:bg-zinc-200 dark:hover:bg-[#2A2926]'
                      }`}
                    >
                      <span>{item.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          activeFilter === item.id
                            ? 'bg-white/20 dark:bg-black/20 text-white dark:text-zinc-900'
                            : 'bg-zinc-200 dark:bg-[#2A2926] text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {item.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* View Mode: Groups */}
              {viewMode === 'groups' && duplicateGroups.length > 0 && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-zinc-700 dark:text-[#F7F4ED] uppercase tracking-wider flex items-center gap-1.5">
                      <Copy className="w-3.5 h-3.5 text-amber-600" />
                      <span>Deterministic Grouping Suggestions ({duplicateGroups.length} groups)</span>
                    </h3>
                    <span className="text-[11px] text-zinc-400">
                      Human review required before resolving
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {duplicateGroups.map((group) => {
                      const isAllGroupSelected = group.alerts.every((a) => selectedIds.has(a.id));
                      const isSomeGroupSelected = group.alerts.some((a) => selectedIds.has(a.id));
                      const isExpanded = expandedGroupKeys.has(group.key);

                      return (
                        <div
                          key={group.key}
                          className="bg-zinc-50/70 dark:bg-[#1E1E1C] border border-amber-200/80 dark:border-amber-900/40 rounded-xl p-4 space-y-3 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isAllGroupSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = !isAllGroupSelected && isSomeGroupSelected;
                                }}
                                onChange={() => handleSelectGroup(group.alerts)}
                                className="rounded border-zinc-300 text-red-600 focus:ring-red-500 cursor-pointer"
                              />
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                                  Possible duplicate group
                                </span>
                                <h4 className="text-xs font-bold text-zinc-900 dark:text-[#F7F4ED] mt-1">
                                  "{group.title}"
                                </h4>
                              </div>
                            </div>
                            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-[#20201E] px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-[#2A2926] shrink-0">
                              {group.count} alerts
                            </span>
                          </div>

                          {group.sampleMessage && (
                            <p className="text-[11px] text-zinc-600 dark:text-[#938C81] italic line-clamp-2 bg-white/60 dark:bg-[#20201E]/60 p-2 rounded-lg border border-zinc-200/60 dark:border-[#2A2926]">
                              "{group.sampleMessage}"
                            </p>
                          )}

                          <div className="space-y-1 text-[11px] text-zinc-500 dark:text-[#938C81]">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-zinc-400" />
                              <span>
                                First: {formatTimeAgo(group.firstRaised)} · Latest: {formatTimeAgo(group.latestRaised)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3 h-3 text-zinc-400" />
                              <span>Reporters: {group.reporters.join(', ') || 'Volunteers'}</span>
                            </div>
                            {group.locations.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3 h-3 text-zinc-400" />
                                <span>Locations: {group.locations.join(', ')}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-zinc-200/60 dark:border-[#2A2926] text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedGroupKeys((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(group.key)) next.delete(group.key);
                                  else next.add(group.key);
                                  return next;
                                });
                              }}
                              className="text-zinc-600 dark:text-[#938C81] hover:text-zinc-900 dark:hover:text-[#F7F4ED] font-medium flex items-center gap-1 cursor-pointer"
                            >
                              {isExpanded ? 'Hide items' : `Review items (${group.count})`}
                              <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenBulkResolveModal(group.alerts)}
                              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-[#F7F4ED] dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              Resolve group ({group.count})
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="pt-2 space-y-1.5 border-t border-zinc-200/40 dark:border-[#2A2926]">
                              {group.alerts.map((a) => (
                                <div
                                  key={a.id}
                                  className="p-2 bg-white dark:bg-[#20201E] rounded-lg border border-zinc-200/70 dark:border-[#2A2926] flex items-center justify-between text-xs"
                                >
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <input
                                      type="checkbox"
                                      checked={selectedIds.has(a.id)}
                                      onChange={() => handleToggleSelect(a.id)}
                                      className="rounded border-zinc-300 text-red-600 focus:ring-red-500 cursor-pointer"
                                    />
                                    <div className="truncate">
                                      <span className="font-semibold text-zinc-900 dark:text-[#F7F4ED]">
                                        {a.title}
                                      </span>
                                      <span className="text-[10px] text-zinc-400 ml-1.5">
                                        {formatTimeAgo(a.created_at)}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => onOpenAlertDetail(a)}
                                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline shrink-0 cursor-pointer ml-2"
                                  >
                                    Details
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* View Mode: List (Full paginated alert queue) */}
              {viewMode === 'list' && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-100/70 dark:bg-[#20201E] rounded-xl text-[11px] font-semibold text-zinc-500 dark:text-[#938C81]">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={
                          currentPageAlerts.length > 0 &&
                          currentPageAlerts.every((a) => selectedIds.has(a.id))
                        }
                        onChange={handleSelectPage}
                        className="rounded border-zinc-300 text-red-600 focus:ring-red-500 cursor-pointer"
                      />
                      <span>Select page ({currentPageAlerts.length})</span>
                    </div>

                    <div className="flex items-center gap-4">
                      <span>
                        Showing {filteredAlerts.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}-
                        {Math.min(currentPage * PAGE_SIZE, filteredAlerts.length)} of {filteredAlerts.length}
                      </span>
                    </div>
                  </div>

                  {filteredAlerts.length === 0 ? (
                    <div className="p-8 text-center bg-zinc-50 dark:bg-[#20201E] rounded-xl border border-dashed border-zinc-200 dark:border-[#2A2926] text-xs text-zinc-500 dark:text-[#938C81]">
                      No alerts match your current filter or search criteria.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {currentPageAlerts.map(renderAlertRow)}
                    </div>
                  )}

                  {/* Pagination Navigation */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-3 text-xs text-zinc-600 dark:text-[#938C81]">
                      <button
                        type="button"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-[#2A2926] bg-white dark:bg-[#20201E] hover:bg-zinc-50 dark:hover:bg-[#2A2926] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Previous</span>
                      </button>

                      <span className="font-medium">
                        Page {currentPage} of {totalPages}
                      </span>

                      <button
                        type="button"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-[#2A2926] bg-white dark:bg-[#20201E] hover:bg-zinc-50 dark:hover:bg-[#2A2926] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. BULK RESOLUTION REVIEW MODAL (Sections 6, 7, 8, 9) */}
      {isBulkResolveOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#181817] border border-[#EAE8E1] dark:border-[#2A2926] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#EAE8E1] dark:border-[#2A2926] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-[#F7F4ED]">
                    Resolve {selectedAlertsList.length} {selectedAlertsList.length === 1 ? 'Alert' : 'Alerts'}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-[#938C81]">
                    Review selected records and record formal resolution notes
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkResolveOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* DISTINCT CRITICAL ALERT PROTECTION WARNING (Section 9) */}
              {distinctCriticalCheck.isDiverse && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500 rounded-xl space-y-2.5">
                  <div className="flex items-start gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>Multiple Disparate Incidents Detected</span>
                  </div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                    These selected alerts appear to represent different incidents:
                  </p>
                  <ul className="text-[11px] list-disc list-inside text-amber-800 dark:text-amber-300 space-y-0.5">
                    {distinctCriticalCheck.reasons.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={distinctWarningConfirmed}
                      onChange={(e) => setDistinctWarningConfirmed(e.target.checked)}
                      className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-amber-950 dark:text-amber-200">
                      I have verified these differing incidents and confirm they can safely be resolved with this collective note.
                    </span>
                  </label>
                </div>
              )}

              {/* Compact Selected Alerts List */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-500 dark:text-[#938C81] uppercase tracking-wider block">
                  Selected Alert Records ({selectedAlertsList.length})
                </label>
                <div className="max-h-36 overflow-y-auto border border-zinc-200 dark:border-[#2A2926] rounded-xl divide-y divide-zinc-200/60 dark:divide-[#2A2926] bg-zinc-50/50 dark:bg-[#20201E]">
                  {selectedAlertsList.map((a) => (
                    <div key={a.id} className="p-2.5 text-xs flex items-center justify-between gap-3">
                      <div className="truncate">
                        <span className="font-semibold text-zinc-900 dark:text-[#F7F4ED]">
                          {a.title}
                        </span>
                        <span className="text-zinc-500 dark:text-[#938C81] ml-2 text-[11px]">
                          ({a.category || 'care'}) · Reporter: {a.raised_by_name || 'Volunteer'}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400 shrink-0">
                        {formatTimeAgo(a.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* OPERATIONS ASSISTANT TOOLBAR (Sections 7 & 8) */}
              <div className="p-3.5 bg-[#FAF9F5] dark:bg-[#1E1E1C] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-800 dark:text-[#F7F4ED]">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Operations Assistant</span>
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    Factual verification &amp; drafting
                  </span>
                </div>

                <div className="flex gap-2 flex-wrap text-xs">
                  <button
                    type="button"
                    onClick={handleSummariseSelected}
                    disabled={isSummarizing}
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#2A2926] border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 text-zinc-800 dark:text-[#F7F4ED] font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Info className="w-3.5 h-3.5 text-blue-500" />
                    <span>Summarise selected alerts</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDraftResolutionNote}
                    disabled={isDraftingNote}
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#2A2926] border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 text-zinc-800 dark:text-[#F7F4ED] font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Draft resolution note</span>
                  </button>
                </div>

                {assistantSummary && (
                  <div className="mt-2 p-3 bg-white dark:bg-[#20201E] border border-zinc-200 dark:border-[#2A2926] rounded-lg text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
                    <p className="font-bold text-zinc-900 dark:text-[#F7F4ED] mb-1">
                      Assistant Summary:
                    </p>
                    {assistantSummary}
                  </div>
                )}
              </div>

              {/* Resolution Outcome Dropdown */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-700 dark:text-[#F7F4ED] block">
                  Resolution Outcome
                </label>
                <select
                  value={resolutionOutcome}
                  onChange={(e) => setResolutionOutcome(e.target.value)}
                  className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-[#20201E] border border-zinc-200 dark:border-[#2A2926] rounded-xl text-zinc-900 dark:text-[#F7F4ED] focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="resolved_on_site">Resolved on-site by team</option>
                  <option value="duplicate_entry">Duplicate notification closed</option>
                  <option value="false_alarm">Non-critical / false alarm</option>
                  <option value="handed_over_parent">Handed over to parent / guardian</option>
                  <option value="medical_treated">First aid / medical care rendered</option>
                  <option value="drill_test_completed">Training drill / system test record</option>
                  <option value="other">Other administrative resolution</option>
                </select>
              </div>

              {/* Resolution Note Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-zinc-700 dark:text-[#F7F4ED] block">
                    Resolution Note (Required)
                  </label>
                  {resolutionNote && (
                    <span className="text-[10px] text-zinc-400">
                      Editable before submission
                    </span>
                  )}
                </div>
                <textarea
                  rows={3}
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Detail the actions taken or operational reason for resolving these alert records..."
                  className="w-full text-xs p-3 bg-zinc-50 dark:bg-[#20201E] border border-zinc-200 dark:border-[#2A2926] rounded-xl text-zinc-900 dark:text-[#F7F4ED] focus:outline-none focus:border-red-500 placeholder-zinc-400"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-zinc-50 dark:bg-[#20201E] border-t border-[#EAE8E1] dark:border-[#2A2926] flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsBulkResolveOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-[#2A2926] border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-[#F7F4ED] hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmBulkResolve}
                disabled={
                  isSubmittingResolve ||
                  !resolutionNote.trim() ||
                  (distinctCriticalCheck.isDiverse && !distinctWarningConfirmed)
                }
                className="px-4 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                {isSubmittingResolve ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Resolving...</span>
                  </>
                ) : (
                  <span>Resolve {selectedAlertsList.length} alerts</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

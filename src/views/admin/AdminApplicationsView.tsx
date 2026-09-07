import React, { useEffect, useState, useMemo } from 'react';
import { 
  Users, 
  Search, 
  MessageSquare, 
  Check, 
  X, 
  ShieldAlert, 
  Loader2, 
  ChevronLeft,
  ChevronRight, 
  AlertCircle,
  RefreshCw,
  ChevronDown,
  RotateCcw,
  Trash2,
  QrCode,
  Clock,
  ArrowRight
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AdminSelectionCheckbox } from '../../components/common/AdminSelectionCheckbox';
import { AdminReviewChildView } from './AdminReviewChildView';

interface AdminApplicationsViewProps {
  onBackToOverview?: () => void;
  adminUser?: any;
  isSuperAdmin?: boolean;
}

export const AdminApplicationsView: React.FC<AdminApplicationsViewProps> = ({
  onBackToOverview,
  adminUser,
  isSuperAdmin = false
}) => {
  const { showError, showSuccess } = useNotification();
  const effectiveSuperAdmin = Boolean(isSuperAdmin || adminUser?.role === 'super_admin');

  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tab Filters matching human workflow
  const [activeTab, setActiveTab] = useState<'under_review' | 'selected' | 'waiting_list' | 'not_selected' | 'needs_attention' | 'removed'>('under_review');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Dynamic stats loaded from backend
  const [stats, setStats] = useState({
    sentReview: 0,
    selected: 0,
    waitingList: 0,
    notSelected: 0,
    removed: 0
  });

  // Selection & bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Modals for bulk actions
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkLoadingAction, setBulkLoadingAction] = useState<string | null>(null);
  const [modalBulkSelectOpen, setModalBulkSelectOpen] = useState(false);
  const [modalBulkWaitlistOpen, setModalBulkWaitlistOpen] = useState(false);
  const [modalBulkNotSelectedOpen, setModalBulkNotSelectedOpen] = useState(false);
  const [notSelectedReason, setNotSelectedReason] = useState('');
  const [modalBulkReopenOpen, setModalBulkReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [modalBulkRevokeOpen, setModalBulkRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [modalBulkResetOpen, setModalBulkResetOpen] = useState(false);
  const [resetMode, setResetMode] = useState<'review' | 'attendance'>('review');
  const [modalBulkResetAndRemoveOpen, setModalBulkResetAndRemoveOpen] = useState(false);
  const [resetAndRemoveReason, setResetAndRemoveReason] = useState('');
  const [modalBulkRemoveOpen, setModalBulkRemoveOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [modalBulkRestoreOpen, setModalBulkRestoreOpen] = useState(false);
  const [modalBulkDeleteOpen, setModalBulkDeleteOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');

  // Drilldown to Child Review Detail Page
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  const fetchApplications = async (pageToFetch = currentPage, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.admin.getApplications({
        page: pageToFetch,
        limit,
        q: searchQuery,
        status: activeTab
      });
      if (res.success) {
        setApplications(res.applications || []);
        if (res.stats) {
          setStats({
            sentReview: res.stats.sentReview || 0,
            selected: res.stats.selected || 0,
            waitingList: res.stats.waitingList || 0,
            notSelected: res.stats.notSelected || 0,
            removed: res.stats.removed || 0
          });
        }
        if (res.pagination) {
          setCurrentPage(res.pagination.page);
          setTotalPages(res.pagination.pages || 1);
          setTotalCount(res.pagination.total || 0);
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Fetch Failed', parsed.message || 'Could not load administrative registrations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchApplications(currentPage);
  }, [activeTab, currentPage]);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchApplications(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const handleTabChange = (tab: any) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSelectedIds([]);
  };

  // Helper: check if a child is currently in attendance
  const isAttending = (app: any) => {
    if (!app) return false;
    if (['checked_in', 'inside'].includes(app.status)) return true;
    if (app.checkedInAt != null && app.pickedUpAt == null) return true;
    return false;
  };

  // Selected applications objects
  const selectedApps = useMemo(() => {
    return applications.filter((a) => selectedIds.includes(a.id));
  }, [applications, selectedIds]);

  // Eligibility calculations for bulk actions
  const eligibleSelectApps = useMemo(() => {
    return selectedApps.filter(a => 
      !['selected', 'pass_ready'].includes(a.status) &&
      !isAttending(a) &&
      !a.isDeleted &&
      a.status !== 'removed'
    );
  }, [selectedApps]);

  const eligibleWaitlistApps = useMemo(() => {
    return selectedApps.filter(a => 
      a.status !== 'waiting_list' &&
      !isAttending(a) &&
      !a.isDeleted &&
      a.status !== 'removed'
    );
  }, [selectedApps]);

  const eligibleNotSelectedApps = useMemo(() => {
    return selectedApps.filter(a => 
      a.status !== 'not_selected' &&
      !isAttending(a) &&
      !a.isDeleted &&
      a.status !== 'removed'
    );
  }, [selectedApps]);

  const eligibleReopenApps = useMemo(() => {
    return selectedApps.filter(a => 
      a.status !== 'under_review' &&
      !isAttending(a) &&
      !a.isDeleted &&
      a.status !== 'removed'
    );
  }, [selectedApps]);

  const eligibleRevokeApps = useMemo(() => {
    return selectedApps.filter(a => 
      ((a.hasPass && a.passStatus === 'active') || a.status === 'pass_ready') &&
      !isAttending(a) &&
      !a.isDeleted &&
      a.status !== 'removed'
    );
  }, [selectedApps]);

  const eligibleResetApps = useMemo(() => {
    return selectedApps.filter(a => 
      !a.isDeleted &&
      a.status !== 'removed' &&
      (isAttending(a) || a.checkedInAt != null || a.pickedUpAt != null || a.hasPass || a.status !== 'under_review')
    );
  }, [selectedApps]);

  const eligibleResetAndRemoveApps = useMemo(() => {
    return selectedApps.filter(a => 
      !a.isDeleted &&
      a.status !== 'removed'
    );
  }, [selectedApps]);

  const eligibleRemoveApps = useMemo(() => {
    return selectedApps.filter(a => 
      !a.isDeleted &&
      a.status !== 'removed' &&
      !isAttending(a)
    );
  }, [selectedApps]);

  const eligibleRestoreApps = useMemo(() => {
    return selectedApps.filter(a => a.isDeleted || a.status === 'removed');
  }, [selectedApps]);

  const eligiblePurgeApps = useMemo(() => {
    return selectedApps.filter(a => (a.isDeleted || a.status === 'removed') && !isAttending(a));
  }, [selectedApps]);

  // Master checkbox helpers
  const allVisibleSelected = applications.length > 0 && applications.every(a => selectedIds.includes(a.id));
  const someVisibleSelected = applications.some(a => selectedIds.includes(a.id)) && !allVisibleSelected;

  const handleToggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(applications.map(a => a.id));
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Bulk action handlers
  const handleConfirmBulkSelect = async () => {
    const ids = eligibleSelectApps.map(a => a.id);
    if (ids.length === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await api.admin.bulkReviewApplications({
        applicationIds: ids,
        decision: 'selected',
        note: 'Selected for event in bulk review.'
      });
      if (res.success) {
        showSuccess('Bulk Selection Complete', `${ids.length} ${ids.length === 1 ? 'child was' : 'children were'} selected for the event.`);
        setModalBulkSelectOpen(false);
        setSelectedIds([]);
        await fetchApplications(currentPage, true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Bulk Selection Failed', parsed.message || 'Could not select children.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleConfirmBulkWaitlist = async () => {
    const ids = eligibleWaitlistApps.map(a => a.id);
    if (ids.length === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await api.admin.bulkReviewApplications({
        applicationIds: ids,
        decision: 'waiting_list',
        note: 'Moved to waiting list in bulk review.'
      });
      if (res.success) {
        showSuccess('Bulk Waitlist Complete', `${ids.length} ${ids.length === 1 ? 'child was' : 'children were'} moved to the waiting list.`);
        setModalBulkWaitlistOpen(false);
        setSelectedIds([]);
        await fetchApplications(currentPage, true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Bulk Waitlist Failed', parsed.message || 'Could not move children to waiting list.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleConfirmBulkNotSelected = async () => {
    const ids = eligibleNotSelectedApps.map(a => a.id);
    if (ids.length === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await api.admin.bulkReviewApplications({
        applicationIds: ids,
        decision: 'not_selected',
        note: notSelectedReason.trim() || 'Marked not selected in bulk review.'
      });
      if (res.success) {
        showSuccess('Bulk Update Complete', `${ids.length} ${ids.length === 1 ? 'child was' : 'children were'} marked as not selected.`);
        setModalBulkNotSelectedOpen(false);
        setNotSelectedReason('');
        setSelectedIds([]);
        await fetchApplications(currentPage, true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Bulk Update Failed', parsed.message || 'Could not update status.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleConfirmBulkReopen = async () => {
    const ids = eligibleReopenApps.map(a => a.id);
    if (ids.length === 0) return;
    setBulkActionLoading(true);
    try {
      let successCount = 0;
      for (const id of ids) {
        const res = await api.admin.reopenApplicationReview(id, reopenReason.trim() || 'Reopened during administrative bulk review.');
        if (res.success) successCount++;
      }
      showSuccess('Reviews Reopened', `${successCount} ${successCount === 1 ? 'review was' : 'reviews were'} reopened successfully.`);
      setModalBulkReopenOpen(false);
      setReopenReason('');
      setSelectedIds([]);
      await fetchApplications(currentPage, true);
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Reopen Failed', parsed.message || 'Could not reopen reviews.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleConfirmBulkRevoke = async () => {
    const ids = eligibleRevokeApps.map(a => a.id);
    if (ids.length === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await api.admin.bulkRevokePasses(ids, revokeReason.trim() || 'Administrative bulk revocation.');
      if (res.success) {
        showSuccess('Passes Revoked', `${res.revokedCount || ids.length} digital event passes were revoked.`);
        setModalBulkRevokeOpen(false);
        setRevokeReason('');
        setSelectedIds([]);
        await fetchApplications(currentPage, true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Revocation Failed', parsed.message || 'Could not revoke passes.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleConfirmBulkReset = async () => {
    const ids = eligibleResetApps.map(a => a.id);
    if (ids.length === 0) return;
    setBulkActionLoading(true);
    setBulkLoadingAction('reset');
    try {
      const res = await api.admin.bulkResetEventProgress({
        applicationIds: ids,
        mode: resetMode
      });
      if (res.success) {
        showSuccess('Event Progress Reset', `${res.resetCount || ids.length} children's event progress was reset.`);
        setModalBulkResetOpen(false);
        setSelectedIds([]);
        await fetchApplications(currentPage, true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Reset Failed', parsed.message || "We couldn't reset event progress. Nothing was changed.");
    } finally {
      setBulkActionLoading(false);
      setBulkLoadingAction(null);
    }
  };

  const handleConfirmBulkResetAndRemove = async () => {
    const ids = eligibleResetAndRemoveApps.map(a => a.id);
    if (ids.length === 0) return;
    setBulkActionLoading(true);
    setBulkLoadingAction('reset_and_remove');
    try {
      const res = await api.admin.bulkResetAndRemove({
        applicationIds: ids,
        reason: resetAndRemoveReason.trim() || 'Reset and removed by Super Admin'
      });
      if (res.success) {
        // 1. Remove processed rows from current tab immediately
        setApplications(prev => prev.filter(a => !ids.includes(a.id)));
        // 2. Update summary counts
        const count = res.processedCount || ids.length;
        setStats(prev => ({
          ...prev,
          removed: prev.removed + count,
          sentReview: activeTab === 'under_review' ? Math.max(0, prev.sentReview - count) : prev.sentReview,
          selected: activeTab === 'selected' ? Math.max(0, prev.selected - count) : prev.selected,
          waitingList: activeTab === 'waiting_list' ? Math.max(0, prev.waitingList - count) : prev.waitingList,
          notSelected: activeTab === 'not_selected' ? Math.max(0, prev.notSelected - count) : prev.notSelected
        }));
        // 3. Clear checkbox selection
        setSelectedIds([]);
        setModalBulkResetAndRemoveOpen(false);
        setResetAndRemoveReason('');
        // 4. Show restrained success toast
        showSuccess(
          `${ids.length} ${ids.length === 1 ? 'registration' : 'registrations'} moved to Removed.`,
          'Their current event progress was cleared.'
        );
        // 5. Refresh application data
        await fetchApplications(currentPage, true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Operation Failed', parsed.message || "We couldn't reset and remove these registrations. Nothing was changed.");
    } finally {
      setBulkActionLoading(false);
      setBulkLoadingAction(null);
    }
  };

  const handleConfirmBulkRemove = async () => {
    const ids = eligibleRemoveApps.map(a => a.id);
    if (ids.length === 0) return;
    setBulkActionLoading(true);
    setBulkLoadingAction('remove');
    try {
      const res = await api.admin.bulkRemoveChildren(ids, removeReason.trim() || 'Bulk administrative removal');
      if (res.success) {
        setApplications(prev => prev.filter(a => !ids.includes(a.id)));
        const count = res.removedCount || ids.length;
        setStats(prev => ({
          ...prev,
          removed: prev.removed + count,
          sentReview: activeTab === 'under_review' ? Math.max(0, prev.sentReview - count) : prev.sentReview,
          selected: activeTab === 'selected' ? Math.max(0, prev.selected - count) : prev.selected,
          waitingList: activeTab === 'waiting_list' ? Math.max(0, prev.waitingList - count) : prev.waitingList,
          notSelected: activeTab === 'not_selected' ? Math.max(0, prev.notSelected - count) : prev.notSelected
        }));
        showSuccess('Applications Removed', `${count} ${count === 1 ? 'application was' : 'applications were'} moved to Removed.`);
        setModalBulkRemoveOpen(false);
        setRemoveReason('');
        setSelectedIds([]);
        await fetchApplications(currentPage, true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Removal Failed', parsed.message || 'Could not remove applications.');
    } finally {
      setBulkActionLoading(false);
      setBulkLoadingAction(null);
    }
  };

  const handleConfirmBulkRestore = async () => {
    const ids = eligibleRestoreApps.map(a => a.id);
    if (ids.length === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await api.admin.bulkRestoreChildren(ids, 'Bulk restored by administrator');
      if (res.success) {
        showSuccess('Applications Restored', `${res.restoredCount || ids.length} ${ids.length === 1 ? 'application was' : 'applications were'} restored to active roster.`);
        setModalBulkRestoreOpen(false);
        setSelectedIds([]);
        await fetchApplications(currentPage, true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Restore Failed', parsed.message || 'Could not restore applications.');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (deleteConfirmationText !== 'DELETE') {
      showError('Confirmation Required', 'Please type DELETE exactly to confirm permanent deletion.');
      return;
    }
    const ids = eligiblePurgeApps.map(a => a.id);
    if (ids.length === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await api.admin.bulkPurgeChildren(ids, 'Bulk permanent deletion by Super Admin', 'DELETE');
      if (res.success) {
        showSuccess('Permanently Deleted', `${res.deletedCount || ids.length} records were permanently deleted.`);
        setModalBulkDeleteOpen(false);
        setDeleteConfirmationText('');
        setSelectedIds([]);
        await fetchApplications(currentPage, true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Deletion Blocked', parsed.message || "We couldn't permanently delete these children. Nothing was changed.");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const getEmptyMessage = () => {
    if (searchQuery) return 'No registrations match your search.';
    switch (activeTab) {
      case 'under_review':
        return 'No registrations are waiting for review.';
      case 'selected':
        return 'No registrations have been selected yet.';
      case 'waiting_list':
        return 'No children are currently on the waiting list.';
      case 'not_selected':
        return 'No registrations have been marked as not selected.';
      case 'needs_attention':
        return 'No registrations currently require attention.';
      case 'removed':
        return 'No registrations have been removed.';
      default:
        return 'No registrations found.';
    }
  };

  // Drilldown to Child Review Detail Page
  if (selectedApplicationId) {
    return (
      <AdminReviewChildView
        applicationId={selectedApplicationId}
        adminUser={adminUser}
        isSuperAdmin={effectiveSuperAdmin}
        onBack={() => setSelectedApplicationId(null)}
        onSave={() => {
          setSelectedApplicationId(null);
          fetchApplications(currentPage, true);
        }}
      />
    );
  }

  // Format Presentation Helpers
  const renderReviewStatusBadge = (app: any) => {
    if (app.isDeleted || app.status === 'removed') {
      return (
        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
          Removed
        </span>
      );
    }
    if (app.status === 'under_review' || app.status === 'review_reopened') {
      return (
        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-50 text-stone-700 border border-stone-200">
          Under review
        </span>
      );
    }
    if (app.status === 'selected' || app.status === 'pass_ready' || ['checked_in', 'inside', 'picked_up'].includes(app.status)) {
      return (
        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/60">
          Selected
        </span>
      );
    }
    if (app.status === 'waiting_list') {
      return (
        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200/60">
          Waiting list
        </span>
      );
    }
    if (app.status === 'not_selected') {
      return (
        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
          Not selected
        </span>
      );
    }
    return (
      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
        {app.status}
      </span>
    );
  };

  const renderAttendanceStatus = (app: any) => {
    if (app.status === 'inside') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/60">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          Inside
        </span>
      );
    }
    if (app.status === 'checked_in' || (app.checkedInAt && !app.pickedUpAt)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/60">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          Checked in
        </span>
      );
    }
    if (app.status === 'picked_up' || app.pickedUpAt) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-stone-50 text-stone-700 border border-stone-200">
          Picked up
        </span>
      );
    }
    return <span className="text-xs text-zinc-400">Not arrived</span>;
  };

  const renderEventAccessStatus = (app: any) => {
    if (app.hasPass) {
      if (app.passStatus === 'revoked') {
        return (
          <span className="inline-flex items-center gap-1 text-xs text-rose-700 font-medium">
            Pass revoked
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
          <QrCode className="w-3 h-3 text-emerald-600" />
          Pass ready
        </span>
      );
    }
    if (app.status === 'pass_ready') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
          <QrCode className="w-3 h-3 text-emerald-600" />
          Pass ready
        </span>
      );
    }
    return <span className="text-xs text-zinc-400">No pass</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in text-[#18181B]">
      
      {/* 1. HEADER ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif text-[#18181B] tracking-tight">
            Children sent for review
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Review registrations and decide who can attend this event.
          </p>
        </div>
        
        <div className="flex items-center space-x-2.5">
          <Button
            type="button"
            onClick={() => fetchApplications(currentPage, true)}
            disabled={refreshing}
            className="text-xs bg-white hover:bg-zinc-50 text-[#18181B] border border-[#EAE8E1] rounded-xl font-medium cursor-pointer"
          >
            {refreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5 text-zinc-400" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
            )}
            Refresh
          </Button>
          
          {onBackToOverview && (
            <Button
              type="button"
              onClick={onBackToOverview}
              className="text-xs bg-white text-zinc-600 hover:text-zinc-900 border border-[#EAE8E1] rounded-xl font-medium hover:bg-zinc-50 cursor-pointer"
            >
              Overview
            </Button>
          )}
        </div>
      </div>

      {/* 2. COMPACT SUMMARY NUMBERS STRIP */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-none">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-0 md:divide-x divide-[#EAE8E1]">
          <div className="md:px-4 first:md:pl-0">
            <span className="text-xs text-zinc-500 font-medium block">Under review</span>
            <span className="text-xl sm:text-2xl font-semibold text-[#18181B] mt-1 block">{stats.sentReview}</span>
          </div>
          <div className="md:px-4">
            <span className="text-xs text-zinc-500 font-medium block">Selected</span>
            <span className="text-xl sm:text-2xl font-semibold text-[#18181B] mt-1 block">{stats.selected}</span>
          </div>
          <div className="md:px-4">
            <span className="text-xs text-zinc-500 font-medium block">Waiting list</span>
            <span className="text-xl sm:text-2xl font-semibold text-[#18181B] mt-1 block">{stats.waitingList}</span>
          </div>
          <div className="md:px-4">
            <span className="text-xs text-zinc-500 font-medium block">Not selected</span>
            <span className="text-xl sm:text-2xl font-semibold text-[#18181B] mt-1 block">{stats.notSelected}</span>
          </div>
          <div className="md:px-4 last:md:pr-0">
            <span className="text-xs text-zinc-500 font-medium block">Removed</span>
            <span className="text-xl sm:text-2xl font-semibold text-zinc-400 mt-1 block">{stats.removed}</span>
          </div>
        </div>
      </div>

      {/* 3. TABS AND SEARCH */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-3">
        {/* Tab Filters */}
        <div className="flex items-center gap-5 overflow-x-auto">
          {[
            { id: 'under_review', label: 'Under review', count: stats.sentReview },
            { id: 'selected', label: 'Selected', count: stats.selected },
            { id: 'waiting_list', label: 'Waiting list', count: stats.waitingList },
            { id: 'not_selected', label: 'Not selected', count: stats.notSelected },
            { id: 'needs_attention', label: 'Needs attention', count: null },
            { id: 'removed', label: 'Removed', count: stats.removed },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id as any)}
              className={`pb-2.5 text-xs whitespace-nowrap transition-colors relative cursor-pointer flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'text-[#18181B] font-semibold'
                  : 'text-zinc-500 hover:text-[#18181B] font-medium'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                  activeTab === tab.id ? 'bg-zinc-100 text-zinc-900 font-semibold' : 'text-zinc-400'
                }`}>
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C59B27]" />
              )}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by child, parent or phone..."
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all placeholder:text-zinc-400"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 p-0.5 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. CONTEXTUAL BULK TOOLBAR (When rows are selected) */}
      {selectedIds.length > 0 && (
        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-none animate-slide-down">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[#18181B]">
              {selectedIds.length} {selectedIds.length === 1 ? 'selected' : 'selected'}
            </span>
            <span className="text-zinc-300">|</span>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-zinc-500 hover:text-zinc-900 font-medium cursor-pointer underline underline-offset-2"
            >
              Clear selection
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab !== 'removed' ? (
              <>
                {/* Primary: Select for event */}
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setModalBulkSelectOpen(true)}
                  disabled={eligibleSelectApps.length === 0}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl cursor-pointer"
                >
                  Select for event ({eligibleSelectApps.length})
                </Button>

                {/* Secondary: Waiting list */}
                <Button
                  type="button"
                  onClick={() => setModalBulkWaitlistOpen(true)}
                  disabled={eligibleWaitlistApps.length === 0}
                  className="text-xs font-medium px-3 py-1.5 bg-white text-zinc-700 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl cursor-pointer"
                >
                  Waiting list ({eligibleWaitlistApps.length})
                </Button>

                {/* Secondary: Not selected */}
                <Button
                  type="button"
                  onClick={() => setModalBulkNotSelectedOpen(true)}
                  disabled={eligibleNotSelectedApps.length === 0}
                  className="text-xs font-medium px-3 py-1.5 bg-white text-zinc-700 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl cursor-pointer"
                >
                  Not selected ({eligibleNotSelectedApps.length})
                </Button>

                {/* Secondary: Reopen review */}
                <Button
                  type="button"
                  onClick={() => setModalBulkReopenOpen(true)}
                  disabled={eligibleReopenApps.length === 0}
                  className="text-xs font-medium px-3 py-1.5 bg-white text-zinc-700 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl cursor-pointer"
                >
                  Reopen review ({eligibleReopenApps.length})
                </Button>

                {/* More ▾ Menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                    className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 bg-white text-zinc-700 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl cursor-pointer"
                  >
                    <span>More</span>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                  </button>

                  {isMoreMenuOpen && (
                    <div className="absolute right-0 mt-1.5 w-56 bg-white border border-[#EAE8E1] rounded-xl shadow-lg p-1.5 z-20 space-y-1 animate-scale-in">
                      {/* Revoke passes */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          setModalBulkRevokeOpen(true);
                        }}
                        disabled={eligibleRevokeApps.length === 0}
                        className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 rounded-lg flex items-center justify-between disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                      >
                        <span>Revoke passes</span>
                        <span className="text-[11px] text-zinc-400 font-medium">({eligibleRevokeApps.length})</span>
                      </button>

                      {/* Super Admin: Reset event progress */}
                      {effectiveSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsMoreMenuOpen(false);
                            setModalBulkResetOpen(true);
                          }}
                          disabled={eligibleResetApps.length === 0}
                          className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 rounded-lg flex items-center justify-between disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                        >
                          <span className="font-medium">Reset event progress</span>
                          <span className="text-[11px] text-zinc-500 font-semibold">({eligibleResetApps.length})</span>
                        </button>
                      )}

                      {/* Super Admin: Reset & remove */}
                      {effectiveSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsMoreMenuOpen(false);
                            setModalBulkResetAndRemoveOpen(true);
                          }}
                          disabled={eligibleResetAndRemoveApps.length === 0}
                          className="w-full text-left px-3 py-2 text-xs text-amber-800 hover:bg-amber-50/60 rounded-lg flex items-center justify-between disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                        >
                          <span className="font-medium">Reset & remove</span>
                          <span className="text-[11px] text-amber-700 font-semibold">({eligibleResetAndRemoveApps.length})</span>
                        </button>
                      )}

                      <div className="border-t border-[#EAE8E1] my-1" />

                      {/* Remove applications (Muted danger) */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          setModalBulkRemoveOpen(true);
                        }}
                        disabled={eligibleRemoveApps.length === 0}
                        className="w-full text-left px-3 py-2 text-xs text-red-600/90 hover:bg-red-50/60 rounded-lg flex items-center justify-between disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                      >
                        <span>Remove applications</span>
                        <span className="text-[11px] text-red-500 font-medium">({eligibleRemoveApps.length})</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* IN REMOVED TAB */
              <>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setModalBulkRestoreOpen(true)}
                  disabled={eligibleRestoreApps.length === 0}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl cursor-pointer"
                >
                  Restore ({eligibleRestoreApps.length})
                </Button>

                {effectiveSuperAdmin && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                      className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 bg-white text-zinc-700 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl cursor-pointer"
                    >
                      <span>More</span>
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                    </button>

                    {isMoreMenuOpen && (
                      <div className="absolute right-0 mt-1.5 w-56 bg-white border border-[#EAE8E1] rounded-xl shadow-lg p-1.5 z-20 space-y-1 animate-scale-in">
                        <button
                          type="button"
                          onClick={() => {
                            setIsMoreMenuOpen(false);
                            setModalBulkDeleteOpen(true);
                          }}
                          disabled={eligiblePurgeApps.length === 0}
                          className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50/60 rounded-lg flex items-center justify-between disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                        >
                          <span>Delete permanently</span>
                          <span className="text-[11px] text-red-500 font-medium">({eligiblePurgeApps.length})</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 5. DATA TABLE */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl overflow-hidden shadow-none">
        {loading ? (
          <div className="p-10">
            <KoinoniaInlineLoader
              variant="skeleton"
              size="lg"
              label="Loading registrations..."
              centered
            />
          </div>
        ) : applications.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center justify-center space-y-2">
            <Users className="w-9 h-9 text-zinc-300" />
            <h3 className="font-medium text-[#18181B] text-sm">{getEmptyMessage()}</h3>
            <p className="text-xs text-zinc-400 max-w-sm">
              {searchQuery ? 'Try adjusting your search terms or clearing the search box.' : 'When registrations arrive or are updated, they will appear here.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1] text-xs font-semibold text-zinc-500">
                    <th className="py-3 px-4 w-10 text-center">
                      <AdminSelectionCheckbox
                        checked={allVisibleSelected}
                        indeterminate={someVisibleSelected}
                        onChange={handleToggleSelectAll}
                        ariaLabel="Select all visible registrations"
                      />
                    </th>
                    <th className="py-3 px-4 font-medium">Child</th>
                    <th className="py-3 px-4 font-medium">Parent / guardian</th>
                    <th className="py-3 px-4 font-medium">Care information</th>
                    <th className="py-3 px-4 font-medium">Review status</th>
                    <th className="py-3 px-4 font-medium">Attendance</th>
                    <th className="py-3 px-4 font-medium">Event access</th>
                    <th className="py-3 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE8E1] text-xs">
                  {applications.map((app) => {
                    const isSelected = selectedIds.includes(app.id);
                    return (
                      <tr 
                        key={app.id} 
                        className={`transition-colors ${
                          isSelected ? 'bg-[#FAF8F3]/70 hover:bg-[#FAF8F3]' : 'hover:bg-[#FAF9F6]/60'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-4 w-10 text-center">
                          <AdminSelectionCheckbox
                            checked={isSelected}
                            onChange={() => handleToggleRow(app.id)}
                            ariaLabel={`Select ${app.child?.fullName || 'child'}`}
                          />
                        </td>

                        {/* Child info */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-3">
                            {app.child?.photoUrl ? (
                              <img 
                                referrerPolicy="no-referrer"
                                src={app.child.photoUrl} 
                                alt={app.child.fullName} 
                                className="w-9 h-9 rounded-full object-cover border border-[#EAE8E1]"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-[#C59B27]/5 border border-[#C59B27]/15 flex items-center justify-center text-[#C59B27] font-semibold text-xs">
                                {app.child?.fullName?.charAt(0) || 'C'}
                              </div>
                            )}
                            <div className="space-y-0.5">
                              <span className="font-semibold text-[#18181B] block">{app.child?.fullName}</span>
                              <div className="flex items-center space-x-1.5 text-xs text-zinc-500">
                                <span>{app.child?.gender ? app.child.gender.charAt(0).toUpperCase() + app.child.gender.slice(1).toLowerCase() : ''}</span>
                                {app.child?.gender && <span>·</span>}
                                <span>{app.child?.ageGroup ? app.child.ageGroup.replace('to', '–') : (app.child?.age ? `Age ${app.child.age}` : '')}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Parent / guardian */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span className="font-medium text-[#18181B] block">{app.parent?.fullName}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-zinc-500">{app.parent?.phone}</span>
                              {app.parent?.whatsapp && (
                                <a 
                                  href={`https://wa.me/${app.parent.whatsapp.replace(/\D/g, '')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 hover:text-emerald-700"
                                  title="Chat on WhatsApp"
                                  aria-label="Chat on WhatsApp"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                            {app.parent?.isWorker && (
                              <span className="inline-block bg-zinc-100 text-zinc-600 text-[10px] font-medium px-1.5 py-0.5 rounded border border-zinc-200">
                                Worker: {app.parent.department || 'General'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Care information */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {app.hasMedicalNotes && (
                              <span className="inline-flex items-center bg-rose-50 border border-rose-200/60 text-rose-700 text-xs font-medium px-2 py-0.5 rounded-md">
                                Medical
                              </span>
                            )}
                            {app.needsExtraSupport && (
                              <span className="inline-flex items-center bg-rose-50 border border-rose-200/60 text-rose-700 text-xs font-medium px-2 py-0.5 rounded-md">
                                Special support
                              </span>
                            )}
                            {app.child?.needsAgeReview && (
                              <span className="inline-flex items-center bg-amber-50 border border-amber-200/60 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-md">
                                Age review
                              </span>
                            )}
                            {!app.hasMedicalNotes && !app.needsExtraSupport && !app.child?.needsAgeReview && (
                              <span className="text-xs text-zinc-400">None</span>
                            )}
                          </div>
                        </td>

                        {/* Review status */}
                        <td className="py-3.5 px-4">
                          {renderReviewStatusBadge(app)}
                        </td>

                        {/* Attendance status */}
                        <td className="py-3.5 px-4">
                          {renderAttendanceStatus(app)}
                        </td>

                        {/* Event access */}
                        <td className="py-3.5 px-4">
                          {renderEventAccessStatus(app)}
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedApplicationId(app.id)}
                            className="text-xs font-semibold text-[#C59B27] hover:text-[#B08921] transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Review details</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* PAGINATION CONTROLS */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[#EAE8E1] px-4 py-3.5 sm:px-6 bg-white rounded-b-2xl">
                <div className="flex flex-1 justify-between sm:hidden">
                  <Button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1 || loading}
                    className="text-xs bg-white text-zinc-700 hover:bg-zinc-50 border border-[#EAE8E1]"
                  >
                    Previous
                  </Button>
                  <Button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || loading}
                    className="text-xs bg-white text-zinc-700 hover:bg-zinc-50 border border-[#EAE8E1]"
                  >
                    Next
                  </Button>
                </div>
                <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs text-zinc-500">
                      Showing <span className="font-semibold text-zinc-800">{((currentPage - 1) * limit) + 1}</span> to{' '}
                      <span className="font-semibold text-zinc-800">
                        {Math.min(currentPage * limit, totalCount)}
                      </span>{' '}
                      of <span className="font-semibold text-zinc-800">{totalCount}</span> registrations
                    </p>
                  </div>
                  <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-xs" aria-label="Pagination">
                      <button
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1 || loading}
                        className="relative inline-flex items-center rounded-l-md px-2 py-2 text-zinc-400 ring-1 ring-inset ring-[#EAE8E1] hover:bg-zinc-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="sr-only">Previous</span>
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`relative inline-flex items-center px-4 py-2 text-xs font-semibold focus:z-20 cursor-pointer ${
                            currentPage === p
                              ? 'z-10 bg-[#C59B27] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C59B27]'
                              : 'text-zinc-600 ring-1 ring-inset ring-[#EAE8E1] hover:bg-zinc-50 focus:outline-offset-0'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || loading}
                        className="relative inline-flex items-center rounded-r-md px-2 py-2 text-zinc-400 ring-1 ring-inset ring-[#EAE8E1] hover:bg-zinc-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 cursor-pointer"
                      >
                        <span className="sr-only">Next</span>
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================================
          BULK CONFIRMATION MODALS
          ======================================================== */}

      {/* BULK SELECT MODAL */}
      {modalBulkSelectOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-[#C59B27]">
              <Check className="w-6 h-6 shrink-0 text-[#C59B27]" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">
                  Select {eligibleSelectApps.length} {eligibleSelectApps.length === 1 ? 'child' : 'children'} for event?
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  These children will be selected to attend the event. Their parents can then receive confirmation updates.
                </p>
              </div>
            </div>

            {selectedApps.length > eligibleSelectApps.length && (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-700 leading-relaxed">
                <span className="font-semibold">{selectedApps.length - eligibleSelectApps.length}</span> selected {selectedApps.length - eligibleSelectApps.length === 1 ? 'record is' : 'records are'} already selected or attending and will remain unchanged.
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => setModalBulkSelectOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionLoading || eligibleSelectApps.length === 0}
                onClick={handleConfirmBulkSelect}
                className="px-4 py-2 bg-[#C59B27] hover:bg-[#B08921] text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center gap-1.5 cursor-pointer"
              >
                {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Select for event</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK WAITLIST MODAL */}
      {modalBulkWaitlistOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-amber-700">
              <Clock className="w-6 h-6 shrink-0 text-amber-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">
                  Move {eligibleWaitlistApps.length} {eligibleWaitlistApps.length === 1 ? 'child' : 'children'} to waiting list?
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  These registrations will move to the waiting list. If they had active event passes, those will be withdrawn.
                </p>
              </div>
            </div>

            {selectedApps.length > eligibleWaitlistApps.length && (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-700 leading-relaxed">
                <span className="font-semibold">{selectedApps.length - eligibleWaitlistApps.length}</span> selected {selectedApps.length - eligibleWaitlistApps.length === 1 ? 'record is' : 'records are'} already on the waiting list or attending and will not be changed.
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => setModalBulkWaitlistOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionLoading || eligibleWaitlistApps.length === 0}
                onClick={handleConfirmBulkWaitlist}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center gap-1.5 cursor-pointer"
              >
                {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Confirm waiting list</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK NOT SELECTED MODAL */}
      {modalBulkNotSelectedOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-red-700">
              <AlertCircle className="w-6 h-6 shrink-0 text-red-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">
                  Mark {eligibleNotSelectedApps.length} {eligibleNotSelectedApps.length === 1 ? 'child' : 'children'} as not selected?
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  These registrations will be marked as not selected for the current event.
                </p>
              </div>
            </div>

            {selectedApps.length > eligibleNotSelectedApps.length && (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-700 leading-relaxed">
                <span className="font-semibold">{selectedApps.length - eligibleNotSelectedApps.length}</span> selected {selectedApps.length - eligibleNotSelectedApps.length === 1 ? 'record is' : 'records are'} already not selected or attending and will not be changed.
              </div>
            )}

            <div className="space-y-1 text-left">
              <label className="text-xs font-medium text-zinc-600 block">Reason for decision</label>
              <textarea
                rows={2}
                value={notSelectedReason}
                onChange={(e) => setNotSelectedReason(e.target.value)}
                placeholder="e.g. Age group capacity reached, duplicate submission..."
                className="w-full p-2.5 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all bg-zinc-50"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => setModalBulkNotSelectedOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionLoading || eligibleNotSelectedApps.length === 0}
                onClick={handleConfirmBulkNotSelected}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center gap-1.5 cursor-pointer"
              >
                {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Mark not selected</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK REOPEN REVIEW MODAL */}
      {modalBulkReopenOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-stone-700">
              <RotateCcw className="w-6 h-6 shrink-0 text-stone-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">
                  Reopen review for {eligibleReopenApps.length} {eligibleReopenApps.length === 1 ? 'child' : 'children'}?
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  These registrations will return to Under review for fresh decision making. Any active digital passes will be revoked.
                </p>
              </div>
            </div>

            {selectedApps.length > eligibleReopenApps.length && (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-700 leading-relaxed">
                <span className="font-semibold">{selectedApps.length - eligibleReopenApps.length}</span> selected {selectedApps.length - eligibleReopenApps.length === 1 ? 'record is' : 'records are'} already under review or attending and will not be changed.
              </div>
            )}

            <div className="space-y-1 text-left">
              <label className="text-xs font-medium text-zinc-600 block">Reason for reopening</label>
              <textarea
                rows={2}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Specify reason for reopening review..."
                className="w-full p-2.5 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => setModalBulkReopenOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionLoading || eligibleReopenApps.length === 0}
                onClick={handleConfirmBulkReopen}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center gap-1.5 cursor-pointer"
              >
                {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Reopen review</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK REVOKE PASSES MODAL */}
      {modalBulkRevokeOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-red-700">
              <QrCode className="w-6 h-6 shrink-0 text-red-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">
                  Revoke passes for {eligibleRevokeApps.length} {eligibleRevokeApps.length === 1 ? 'child' : 'children'}?
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  These digital event passes will be deactivated immediately and will no longer scan at physical gate terminals.
                </p>
              </div>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-xs font-medium text-zinc-600 block">Reason for revocation</label>
              <textarea
                rows={2}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Specify revocation reason..."
                className="w-full p-2.5 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all bg-zinc-50"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => setModalBulkRevokeOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionLoading || eligibleRevokeApps.length === 0}
                onClick={handleConfirmBulkRevoke}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center gap-1.5 cursor-pointer"
              >
                {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Revoke passes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK RESET EVENT PROGRESS MODAL (SUPER ADMIN ONLY) */}
      {modalBulkResetOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-amber-800">
              <RotateCcw className="w-6 h-6 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-1 text-left">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-zinc-900">
                    Reset event progress for {eligibleResetApps.length} {eligibleResetApps.length === 1 ? 'child' : 'children'}?
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 uppercase tracking-wide">
                    Super Admin
                  </span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  This will clear their current event progress. Passes and attendance states for this event will be reset. Historical safety and audit records will remain.
                </p>
              </div>
            </div>

            {/* Mode selection radio boxes */}
            <div className="space-y-3 text-left">
              <label className="text-xs font-semibold text-zinc-700 block">Select reset mode:</label>
              
              <div 
                onClick={() => setResetMode('review')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  resetMode === 'review' ? 'border-[#C59B27] bg-[#FAF8F3]' : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="resetMode"
                    checked={resetMode === 'review'}
                    onChange={() => setResetMode('review')}
                    className="mt-0.5 text-[#C59B27] focus:ring-[#C59B27]"
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 block">RESET TO REVIEW</span>
                    <ul className="text-xs text-zinc-600 list-disc pl-4 mt-1 space-y-0.5">
                      <li>Revoke active passes</li>
                      <li>Clear attendance, check-in and pickup timestamps</li>
                      <li>Set registration back to Under review</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div 
                onClick={() => setResetMode('attendance')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  resetMode === 'attendance' ? 'border-[#C59B27] bg-[#FAF8F3]' : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="resetMode"
                    checked={resetMode === 'attendance'}
                    onChange={() => setResetMode('attendance')}
                    className="mt-0.5 text-[#C59B27] focus:ring-[#C59B27]"
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 block">RESET ATTENDANCE ONLY</span>
                    <ul className="text-xs text-zinc-600 list-disc pl-4 mt-1 space-y-0.5">
                      <li>Keep current review decision and Selected status</li>
                      <li>Keep active pass valid for re-testing check-in</li>
                      <li>Clear check-in, inside, and pickup operational records</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => setModalBulkResetOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionLoading || eligibleResetApps.length === 0}
                onClick={handleConfirmBulkReset}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center gap-1.5 cursor-pointer"
              >
                {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{bulkLoadingAction === 'reset' ? 'Resetting…' : 'Reset progress'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK RESET AND REMOVE MODAL (SUPER ADMIN ONLY) */}
      {modalBulkResetAndRemoveOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-amber-800">
              <RotateCcw className="w-6 h-6 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-1 text-left">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-zinc-900">
                    Reset and remove {eligibleResetAndRemoveApps.length} {eligibleResetAndRemoveApps.length === 1 ? 'registration' : 'registrations'}?
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 uppercase tracking-wide">
                    Super Admin
                  </span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Some selected children have current event activity. Their event progress will be cleared first, then the registrations will be moved to Removed.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/60 border border-amber-200/60 rounded-xl space-y-2 text-left">
              <span className="text-xs font-semibold text-amber-900 block">This action will:</span>
              <ul className="text-xs text-amber-800 list-disc pl-4 space-y-1">
                <li>End active attendance and clear check-in / pickup states</li>
                <li>Deactivate digital event passes</li>
                <li>Move registrations to Removed (can be restored later)</li>
                <li>Preserve child profiles, family details, and safety audit history</li>
              </ul>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-xs font-medium text-zinc-600 block">Reason (optional)</label>
              <textarea
                rows={2}
                value={resetAndRemoveReason}
                onChange={(e) => setResetAndRemoveReason(e.target.value)}
                placeholder="Reset and removed test records..."
                className="w-full p-2.5 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all bg-zinc-50"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => {
                  setModalBulkResetAndRemoveOpen(false);
                  setResetAndRemoveReason('');
                }}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionLoading || eligibleResetAndRemoveApps.length === 0}
                onClick={handleConfirmBulkResetAndRemove}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center gap-1.5 cursor-pointer"
              >
                {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{bulkLoadingAction === 'reset_and_remove' ? 'Resetting & removing…' : `Reset & remove ${eligibleResetAndRemoveApps.length}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK REMOVE MODAL */}
      {modalBulkRemoveOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-red-700">
              <Trash2 className="w-6 h-6 shrink-0 text-red-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">
                  Remove {eligibleRemoveApps.length} {eligibleRemoveApps.length === 1 ? 'application' : 'applications'}?
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  They will move to Removed and can be restored later. Active passes will be revoked.
                </p>
              </div>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-xs font-medium text-zinc-600 block">Reason for removal</label>
              <textarea
                rows={2}
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                placeholder="Specify reason for archiving..."
                className="w-full p-2.5 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all bg-zinc-50"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => setModalBulkRemoveOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionLoading || eligibleRemoveApps.length === 0}
                onClick={handleConfirmBulkRemove}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center gap-1.5 cursor-pointer"
              >
                {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{bulkLoadingAction === 'remove' ? 'Removing…' : 'Remove applications'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK RESTORE MODAL */}
      {modalBulkRestoreOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-emerald-700">
              <RotateCcw className="w-6 h-6 shrink-0 text-emerald-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">
                  Restore {eligibleRestoreApps.length} {eligibleRestoreApps.length === 1 ? 'application' : 'applications'}?
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  They will be reactivated and returned to Under review on the active event roster.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => setModalBulkRestoreOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionLoading || eligibleRestoreApps.length === 0}
                onClick={handleConfirmBulkRestore}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center gap-1.5 cursor-pointer"
              >
                {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Restore applications</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK PERMANENT DELETE MODAL (SUPER ADMIN ONLY) */}
      {modalBulkDeleteOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-red-700">
              <ShieldAlert className="w-6 h-6 shrink-0 text-red-600 mt-0.5" />
              <div className="space-y-1 text-left">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-zinc-900">
                    Delete {eligiblePurgeApps.length} {eligiblePurgeApps.length === 1 ? 'child' : 'children'} permanently?
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800 uppercase tracking-wide">
                    Super Admin
                  </span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  These profiles and their associated personal information will be permanently removed and cannot be restored. Safeguarding records will be anonymized for compliance.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-left bg-red-50/60 border border-red-200/60 p-3.5 rounded-xl">
              <label className="text-xs font-semibold text-red-900 block">
                Type DELETE to continue:
              </label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="DELETE"
                className="w-full p-2 text-xs rounded-lg border border-red-300 focus:outline-none focus:ring-1 focus:ring-red-600 font-mono tracking-wider text-center"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => {
                  setModalBulkDeleteOpen(false);
                  setDeleteConfirmationText('');
                }}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionLoading || deleteConfirmationText !== 'DELETE' || eligiblePurgeApps.length === 0}
                onClick={handleConfirmBulkDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
              >
                {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Delete permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  X, 
  Plus, 
  Calendar, 
  RefreshCw, 
  AlertTriangle,
  FileText,
  Check,
  ChevronRight,
  Clock,
  UserCheck
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { IncidentEditModal } from '../../components/common/IncidentEditModal';
import { TableSkeleton } from '../../components/common/KoinoniaSkeletons';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';

interface AdminIncidentRecordsCentreProps {
  onBackToOverview?: () => void;
  adminUser: { id: string; role: string; email: string };
}

export const AdminIncidentRecordsCentre: React.FC<AdminIncidentRecordsCentreProps> = ({
  onBackToOverview,
  adminUser
}) => {
  const { showSuccess, showError } = useNotification();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalCount: 0,
    draftCount: 0,
    submittedCount: 0,
    needsRevisionCount: 0,
    closedCount: 0,
    voidedCount: 0,
    activeFollowUpCount: 0,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [selectedIncidentDetail, setSelectedIncidentDetail] = useState<any | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // New standalone incident creation modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    category: 'behavioral',
    description: '',
    location: '',
    parentContact: '',
    firstAid: '',
    security: '',
    status: 'submitted' as 'draft' | 'submitted'
  });
  const [creatingIncident, setCreatingIncident] = useState<boolean>(false);

  // Confirmation modal for closing an incident
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState<boolean>(false);

  // Admin Change Request form state
  const [showRevisionForm, setShowRevisionForm] = useState<boolean>(false);
  const [revisionNotes, setRevisionNotes] = useState<string>('');
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  // Admin Reopen / Void form state
  const [showReasonForm, setShowReasonForm] = useState<'reopen' | 'void' | null>(null);
  const [administrativeReason, setAdministrativeReason] = useState<string>('');

  // Follow-up submittal form state
  const [followUpTitle, setFollowUpTitle] = useState<string>('');
  const [followUpAssignee, setFollowUpAssignee] = useState<string>('');
  const [eligibleVolunteers, setEligibleVolunteers] = useState<any[]>([]);

  // Follow-up completion state
  const [completingFollowUpId, setCompletingFollowUpId] = useState<string | null>(null);
  const [followUpCompletionNote, setFollowUpCompletionNote] = useState<string>('');

  // Closure Checklist checkboxes
  const [chkParentNotified, setChkParentNotified] = useState<boolean>(false);
  const [chkSafeguardingReview, setChkSafeguardingReview] = useState<boolean>(false);
  const [chkFollowUpsClosed, setChkFollowUpsClosed] = useState<boolean>(false);
  const [chkSignedOff, setChkSignedOff] = useState<boolean>(false);

  // Trigger editing a selected draft or incident
  const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null);
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const res = await api.incidents.stats();
      if (res && res.success) {
        setStats(res.stats || {
          totalCount: 0,
          draftCount: 0,
          submittedCount: 0,
          needsRevisionCount: 0,
          closedCount: 0,
          voidedCount: 0,
          activeFollowUpCount: 0,
        });
      }
    } catch (err) {
      console.error('Error fetching incident stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchIncidents = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.incidents.list({
        status: statusFilter === 'all' ? undefined : statusFilter,
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        page,
        limit: 10,
      });
      if (res && res.success) {
        setIncidents(res.incidents || []);
        if (res.pagination) {
          setTotalPages(res.pagination.pages || 1);
        }
      }
    } catch (err) {
      console.error('Error fetching incidents list:', err);
      showError('Fetch Failed', 'Could not load incidents. Please refresh and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefreshAll = () => {
    setRefreshing(true);
    fetchStats();
    fetchIncidents(true);
    if (selectedIncident?.id) {
      handleSelectIncident(selectedIncident);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [statusFilter, categoryFilter, page]);

  // Load volunteers list for follow-up assignment
  useEffect(() => {
    const loadVolunteers = async () => {
      try {
        const vols = await api.safetyAlerts.searchEligibleResponders('admin', '');
        setEligibleVolunteers(vols || []);
      } catch (err) {
        console.error('Error loading volunteers:', err);
      }
    };
    loadVolunteers();
  }, []);

  const handleSelectIncident = async (incident: any) => {
    setSelectedIncident(incident);
    setSelectedIncidentDetail(null);
    setHistoryLogs([]);
    setShowRevisionForm(false);
    setShowReasonForm(null);
    setAdministrativeReason('');
    setRevisionNotes('');
    
    // Reset Checklist UI
    setChkParentNotified(false);
    setChkSafeguardingReview(false);
    setChkFollowUpsClosed(false);
    setChkSignedOff(false);

    try {
      setLoadingDetail(true);
      const [resDetail, resHistory] = await Promise.all([
        api.incidents.get(incident.id),
        api.incidents.history(incident.id)
      ]);

      if (resDetail && resDetail.success) {
        const detail = resDetail.incident;
        setSelectedIncidentDetail(detail);
        
        // Initialize Checklist UI checkboxes
        const chk = detail.closureChecklist || {};
        setChkParentNotified(!!chk.parentNotified);
        setChkSafeguardingReview(!!chk.safeguardingReviewCompleted);
        setChkFollowUpsClosed(!!chk.followUpsClosed);
        setChkSignedOff(!!chk.signedOffByAdmin);
      }

      if (resHistory && resHistory.success) {
        setHistoryLogs(resHistory.history || []);
      }
    } catch (err) {
      console.error('Error fetching incident detail:', err);
      showError('Error', 'Unable to load incident details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      showError('Title Required', 'Please provide a clear title of what happened.');
      return;
    }
    setCreatingIncident(true);
    try {
      const res = await api.incidents.create({
        title: createForm.title.trim(),
        category: createForm.category,
        description: createForm.description.trim() || 'No detailed narrative provided.',
        structuredData: createForm.location ? { location: createForm.location } : {},
        parentContact: createForm.parentContact.trim() || undefined,
        firstAid: createForm.firstAid.trim() || undefined,
        security: createForm.security.trim() || undefined,
        status: createForm.status
      });

      if (res && res.success) {
        showSuccess('Incident Recorded', 'The matter has been logged successfully.');
        setShowCreateModal(false);
        setCreateForm({
          title: '',
          category: 'behavioral',
          description: '',
          location: '',
          parentContact: '',
          firstAid: '',
          security: '',
          status: 'submitted'
        });
        fetchIncidents();
        fetchStats();
        if (res.incident) {
          handleSelectIncident(res.incident);
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Recording Failed', parsed.message || 'Could not record incident.');
    } finally {
      setCreatingIncident(false);
    }
  };

  const handleSaveChecklist = async () => {
    if (!selectedIncidentDetail) return;
    setSubmittingAction(true);
    try {
      const payload = {
        expectedVersion: selectedIncidentDetail.version,
        checklist: {
          parentNotified: chkParentNotified,
          safeguardingReviewCompleted: chkSafeguardingReview,
          followUpsClosed: chkFollowUpsClosed,
          signedOffByAdmin: chkSignedOff,
        }
      };

      const res = await api.incidents.updateClosureChecklist(selectedIncidentDetail.id, payload);
      if (res && res.success) {
        showSuccess('Checklist Saved', 'Closure checklist updated successfully.');
        setSelectedIncidentDetail(res.incident);
        fetchIncidents(true);
        fetchStats();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Checklist Update Failed', parsed.message || 'Could not save checklist.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCloseIncident = async () => {
    if (!selectedIncidentDetail) return;
    setSubmittingAction(true);
    try {
      const res = await api.incidents.close(selectedIncidentDetail.id, {
        expectedVersion: selectedIncidentDetail.version
      });
      if (res && res.success) {
        showSuccess('Incident Closed', 'The incident has been closed.');
        setShowCloseConfirmModal(false);
        setSelectedIncidentDetail(res.incident);
        fetchIncidents(true);
        fetchStats();
        // Reload history
        const resHist = await api.incidents.history(selectedIncidentDetail.id);
        if (resHist && resHist.success) setHistoryLogs(resHist.history);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Cannot Close Incident', parsed.message || 'Please ensure all follow-ups are completed and checklist items are signed off.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleReopenIncident = async () => {
    if (!selectedIncidentDetail || !administrativeReason.trim()) {
      showError('Reason Required', 'Please provide a reason for reopening this record.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.incidents.reopen(selectedIncidentDetail.id, {
        expectedVersion: selectedIncidentDetail.version,
        reason: administrativeReason,
      });
      if (res && res.success) {
        showSuccess('Incident Reopened', 'The incident status has been reopened for follow-up.');
        setSelectedIncidentDetail(res.incident);
        setShowReasonForm(null);
        setAdministrativeReason('');
        fetchIncidents(true);
        fetchStats();
        const resHist = await api.incidents.history(selectedIncidentDetail.id);
        if (resHist && resHist.success) setHistoryLogs(resHist.history);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Reopen Failed', parsed.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleVoidIncident = async () => {
    if (!selectedIncidentDetail || !administrativeReason.trim()) {
      showError('Reason Required', 'Please provide a reason for voiding this record.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.incidents.void(selectedIncidentDetail.id, {
        expectedVersion: selectedIncidentDetail.version,
        reason: administrativeReason,
      });
      if (res && res.success) {
        showSuccess('Incident Voided', 'This record has been marked as void.');
        setSelectedIncidentDetail(res.incident);
        setShowReasonForm(null);
        setAdministrativeReason('');
        fetchIncidents(true);
        fetchStats();
        const resHist = await api.incidents.history(selectedIncidentDetail.id);
        if (resHist && resHist.success) setHistoryLogs(resHist.history);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Void Failed', parsed.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAddChangeRequest = async () => {
    if (!selectedIncidentDetail || !revisionNotes.trim()) {
      showError('Notes Required', 'Please specify what follow-up or amendment is needed.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.incidents.submitChangeRequest(selectedIncidentDetail.id, {
        expectedVersion: selectedIncidentDetail.version,
        notes: revisionNotes,
      });
      if (res && res.success) {
        showSuccess('Revision Requested', 'Follow-up request recorded.');
        setSelectedIncidentDetail(res.incident);
        setShowRevisionForm(false);
        setRevisionNotes('');
        fetchIncidents(true);
        fetchStats();
        const resHist = await api.incidents.history(selectedIncidentDetail.id);
        if (resHist && resHist.success) setHistoryLogs(resHist.history);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Request Failed', parsed.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAddFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentDetail || !followUpTitle.trim()) return;
    setSubmittingAction(true);
    try {
      const res = await api.incidents.addFollowUpAction(selectedIncidentDetail.id, {
        expectedVersion: selectedIncidentDetail.version,
        title: followUpTitle.trim(),
        assignedToUserId: followUpAssignee || undefined,
      });
      if (res && res.success) {
        showSuccess('Follow-up Added', 'Follow-up task added successfully.');
        setSelectedIncidentDetail(res.incident);
        setFollowUpTitle('');
        setFollowUpAssignee('');
        fetchIncidents(true);
        fetchStats();
        const resHist = await api.incidents.history(selectedIncidentDetail.id);
        if (resHist && resHist.success) setHistoryLogs(resHist.history);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action Failed', parsed.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCompleteFollowUp = async (actionId: string) => {
    if (!selectedIncidentDetail) return;
    setSubmittingAction(true);
    try {
      const res = await api.incidents.completeFollowUpAction(selectedIncidentDetail.id, actionId, {
        expectedVersion: selectedIncidentDetail.version,
        completed: true,
        completedNote: followUpCompletionNote,
      });
      if (res && res.success) {
        showSuccess('Follow-up Completed', 'Task marked as completed.');
        setSelectedIncidentDetail(res.incident);
        setCompletingFollowUpId(null);
        setFollowUpCompletionNote('');
        fetchIncidents(true);
        fetchStats();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Completion Failed', parsed.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const getHumanCategory = (cat: string) => {
    switch (cat) {
      case 'medical':
        return 'Medical';
      case 'behavioral':
        return 'Child care';
      case 'missing_child':
        return 'Missing child';
      case 'security':
        return 'Security';
      default:
        return 'Other';
    }
  };

  const getHumanStatus = (stat: string) => {
    switch (stat) {
      case 'draft':
        return 'New';
      case 'submitted':
        return 'Being reviewed';
      case 'needs_revision':
        return 'Follow-up needed';
      case 'closed':
        return 'Resolved';
      case 'voided':
        return 'Voided';
      default:
        return stat;
    }
  };

  // Filtered incidents by local text search
  const filteredIncidents = incidents.filter(inc => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (inc.title || '').toLowerCase().includes(q) ||
      (inc.id || '').toLowerCase().includes(q) ||
      (inc.category || '').toLowerCase().includes(q) ||
      (inc.description || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-stone-900 bg-[#FAF9F5]" id="incidents-view">
      
      {/* 1. Page Header (Prompt Section 4, 5, 21) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-stone-900 tracking-tight">
            Incidents
          </h1>
          <p className="text-xs text-stone-600 max-w-2xl leading-relaxed">
            Record and follow up on matters that need attention during the event.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <button
            onClick={handleRefreshAll}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl text-xs font-medium text-stone-700 transition-colors cursor-pointer min-h-[38px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-stone-500' : 'text-stone-500'}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#9E7D3B] hover:bg-[#8A6D33] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer min-h-[38px]"
          >
            <Plus className="w-4 h-4" />
            <span>Record incident</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary Strip (Prompt Section 6: One quiet summary strip, subtle dividers, no colored icons) */}
      <div className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-stone-200">
          
          <div className="p-4 md:p-5 text-left">
            <span className="text-[11px] font-medium text-stone-500 block">All incidents</span>
            <span className="text-xl md:text-2xl font-bold text-stone-900 tabular-nums mt-1 block">
              {loadingStats ? '—' : stats.totalCount}
            </span>
          </div>

          <div className="p-4 md:p-5 text-left">
            <span className="text-[11px] font-medium text-stone-500 block">Awaiting review</span>
            <span className={`text-xl md:text-2xl font-bold tabular-nums mt-1 block ${(stats.submittedCount + stats.draftCount) > 0 ? 'text-amber-800' : 'text-stone-900'}`}>
              {loadingStats ? '—' : (stats.submittedCount + stats.draftCount)}
            </span>
          </div>

          <div className="p-4 md:p-5 text-left">
            <span className="text-[11px] font-medium text-stone-500 block">Follow-up needed</span>
            <span className={`text-xl md:text-2xl font-bold tabular-nums mt-1 block ${(stats.activeFollowUpCount + stats.needsRevisionCount) > 0 ? 'text-amber-800' : 'text-stone-900'}`}>
              {loadingStats ? '—' : (stats.activeFollowUpCount + stats.needsRevisionCount)}
            </span>
          </div>

          <div className="p-4 md:p-5 text-left">
            <span className="text-[11px] font-medium text-stone-500 block">Closed</span>
            <span className="text-xl md:text-2xl font-bold text-stone-900 tabular-nums mt-1 block">
              {loadingStats ? '—' : stats.closedCount}
            </span>
          </div>

        </div>
      </div>

      {/* 3. Global Zero Incidents State (Prompt Section 10: One wide calm empty state when 0 incidents exist) */}
      {!loading && stats.totalCount === 0 && incidents.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center space-y-4 max-w-xl mx-auto my-8">
          <div className="mx-auto w-12 h-12 bg-stone-50 rounded-full flex items-center justify-center text-stone-400 border border-stone-100">
            <FileText className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-stone-900">No incidents recorded</h3>
            <p className="text-xs text-stone-500 leading-relaxed max-w-sm mx-auto">
              Incidents reported during this event will appear here.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#9E7D3B] hover:bg-[#8A6D33] text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record incident</span>
          </button>
        </div>
      ) : (
        /* 4. Main Two-Column Master / Detail Layout (Prompt Section 40) */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* Left Side: Incident List Panel */}
          <div className="xl:col-span-6 space-y-4">
            <div className="bg-white border border-stone-200 p-4 md:p-5 rounded-xl space-y-4 shadow-xs">
              
              {/* Filters Bar */}
              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:border-[#9E7D3B]"
                  >
                    <option value="all">All statuses</option>
                    <option value="draft">New</option>
                    <option value="submitted">Being reviewed</option>
                    <option value="needs_revision">Follow-up needed</option>
                    <option value="closed">Resolved</option>
                    <option value="voided">Voided</option>
                  </select>

                  <select
                    value={categoryFilter}
                    onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                    className="bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:border-[#9E7D3B]"
                  >
                    <option value="all">All categories</option>
                    <option value="behavioral">Child care</option>
                    <option value="medical">Medical</option>
                    <option value="missing_child">Missing child</option>
                    <option value="security">Security</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search incidents"
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-stone-800 placeholder-stone-400 outline-none focus:border-[#9E7D3B]"
                  />
                </div>
              </div>

              {/* List Rows */}
              {loading ? (
                <TableSkeleton rows={4} cols={3} />
              ) : filteredIncidents.length === 0 ? (
                <div className="p-8 text-center space-y-1">
                  <h4 className="text-xs font-semibold text-stone-700">No matching incidents</h4>
                  <p className="text-xs text-stone-400">Try changing your filters or search.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredIncidents.map((inc) => {
                    const isSelected = selectedIncident?.id === inc.id;
                    return (
                      <div
                        key={inc.id}
                        onClick={() => handleSelectIncident(inc)}
                        className={`p-3.5 rounded-lg border transition-all cursor-pointer text-left ${
                          isSelected 
                            ? 'border-[#9E7D3B] bg-[#FBF9F4]' 
                            : 'border-stone-200 hover:border-stone-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded">
                                {getHumanCategory(inc.category)}
                              </span>
                              <span className="text-[10px] font-medium text-stone-500">
                                ·
                              </span>
                              <span className="text-[10px] font-medium text-stone-600">
                                {getHumanStatus(inc.status)}
                              </span>
                            </div>

                            <h4 className="text-xs font-semibold text-stone-900 truncate">
                              {inc.title || 'Untitled Incident'}
                            </h4>

                            <div className="flex items-center gap-3 text-[11px] text-stone-500">
                              <span>
                                {new Date(inc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                              <span>·</span>
                              <span>
                                {new Date(inc.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>

                          <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'text-[#9E7D3B] translate-x-0.5' : 'text-stone-300'}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-stone-100 text-xs text-stone-600">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-stone-200 disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="text-[11px] text-stone-500 tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-stone-200 disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* Right Side: Incident Details Panel */}
          <div className="xl:col-span-6">
            {selectedIncident ? (
              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xs flex flex-col min-h-[500px]">
                
                {/* Header */}
                <div className="p-4 md:p-5 border-b border-stone-100 bg-[#FAF9F6] flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-medium text-stone-700 bg-stone-100 px-2 py-0.5 rounded">
                        {getHumanCategory(selectedIncident.category)}
                      </span>
                      <span className="text-[10px] font-medium text-stone-600">
                        {getHumanStatus(selectedIncidentDetail?.status || selectedIncident.status)}
                      </span>
                    </div>
                    <h3 className="text-sm md:text-base font-semibold text-stone-900 leading-snug">
                      {selectedIncident.title}
                    </h3>
                  </div>
                  <button 
                    onClick={() => setSelectedIncident(null)}
                    className="text-stone-400 hover:text-stone-600 p-1 cursor-pointer"
                    title="Close details"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {loadingDetail ? (
                  <div className="p-12 flex flex-col items-center justify-center flex-1">
                    <KoinoniaInlineLoader label="Loading incident details..." size="sm" />
                  </div>
                ) : selectedIncidentDetail ? (
                  <div className="p-5 space-y-6 flex-1 overflow-y-auto max-h-[75vh] text-left">
                    
                    {/* Summary Section */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-stone-700">What happened</h4>
                      <p className="text-xs text-stone-700 bg-stone-50 border border-stone-200/70 rounded-lg p-3.5 leading-relaxed">
                        {selectedIncidentDetail.description || 'No detailed narrative provided.'}
                      </p>
                    </div>

                    {/* Immediate Actions / Sensitive Notes */}
                    {(selectedIncidentDetail.firstAid || selectedIncidentDetail.parentContact || selectedIncidentDetail.security) && (
                      <div className="space-y-2 pt-2 border-t border-stone-100">
                        <h4 className="text-xs font-semibold text-stone-700">Immediate action taken</h4>
                        <div className="space-y-2 text-xs">
                          {selectedIncidentDetail.firstAid && (
                            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
                              <span className="text-[10px] font-semibold text-stone-600 block">First aid care</span>
                              <p className="text-stone-700 mt-0.5">{selectedIncidentDetail.firstAid}</p>
                            </div>
                          )}
                          {selectedIncidentDetail.parentContact && (
                            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
                              <span className="text-[10px] font-semibold text-stone-600 block">Parent communication</span>
                              <p className="text-stone-700 mt-0.5">{selectedIncidentDetail.parentContact}</p>
                            </div>
                          )}
                          {selectedIncidentDetail.security && (
                            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70">
                              <span className="text-[10px] font-semibold text-stone-600 block">Security action</span>
                              <p className="text-stone-700 mt-0.5">{selectedIncidentDetail.security}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Follow-up Section (Prompt Section 15) */}
                    <div className="space-y-3 pt-2 border-t border-stone-100">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-semibold text-stone-700">Follow-up needed</h4>
                        <span className="text-[11px] text-stone-500 tabular-nums">
                          {selectedIncidentDetail.followUpActions?.filter((f: any) => f.status === 'pending').length || 0} remaining
                        </span>
                      </div>

                      <div className="space-y-2">
                        {selectedIncidentDetail.followUpActions?.map((act: any) => (
                          <div key={act.id} className="p-3 bg-stone-50 border border-stone-200/70 rounded-lg text-xs space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5">
                                <span className="font-medium text-stone-900 block">{act.title}</span>
                                {act.assignedToUserId && (
                                  <span className="text-[10px] text-stone-500 block">
                                    Assigned to staff
                                  </span>
                                )}
                              </div>
                              {act.status === 'pending' ? (
                                <button
                                  onClick={() => setCompletingFollowUpId(act.id)}
                                  className="px-2 py-1 bg-stone-800 hover:bg-stone-900 text-white rounded text-[10px] font-medium cursor-pointer"
                                >
                                  Mark complete
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                                  <Check className="w-3 h-3" />
                                  Done
                                </span>
                              )}
                            </div>

                            {completingFollowUpId === act.id && (
                              <div className="p-2.5 bg-white border border-stone-200 rounded-lg space-y-2 mt-2">
                                <textarea
                                  value={followUpCompletionNote}
                                  onChange={(e) => setFollowUpCompletionNote(e.target.value)}
                                  placeholder="Note what was done (e.g. spoken with parent)..."
                                  className="w-full border border-stone-200 rounded p-2 text-xs outline-none focus:border-[#9E7D3B]"
                                  rows={2}
                                />
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={() => setCompletingFollowUpId(null)}
                                    className="px-2 py-1 border border-stone-200 rounded text-[10px] text-stone-600"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleCompleteFollowUp(act.id)}
                                    className="px-2.5 py-1 bg-emerald-700 text-white font-medium rounded text-[10px]"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            )}

                            {act.status === 'completed' && act.completedNote && (
                              <p className="text-[10px] text-stone-600 italic bg-white p-2 rounded border border-stone-100">
                                {act.completedNote}
                              </p>
                            )}
                          </div>
                        ))}

                        {/* Add Follow-Up Form */}
                        <form onSubmit={handleAddFollowUp} className="bg-stone-50 border border-stone-200/70 rounded-lg p-3 space-y-2">
                          <span className="text-[11px] font-medium text-stone-700 block">Add follow-up</span>
                          <input
                            type="text"
                            required
                            value={followUpTitle}
                            onChange={(e) => setFollowUpTitle(e.target.value)}
                            placeholder="e.g. Call parent to check how the child is doing..."
                            className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs outline-none focus:border-[#9E7D3B]"
                          />
                          <div className="flex gap-2">
                            <select
                              value={followUpAssignee}
                              onChange={(e) => setFollowUpAssignee(e.target.value)}
                              className="bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-stone-700 flex-1 outline-none"
                            >
                              <option value="">Assign to team member (optional)</option>
                              {eligibleVolunteers.map(v => (
                                <option key={v.id} value={v.userId}>{v.fullName}</option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              disabled={submittingAction || !followUpTitle.trim()}
                              className="bg-stone-800 hover:bg-stone-900 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>

                    {/* Closure Checklist (Prompt Section 16) */}
                    {selectedIncidentDetail.status !== 'closed' && selectedIncidentDetail.status !== 'voided' && (
                      <div className="space-y-3 pt-2 border-t border-stone-100">
                        <h4 className="text-xs font-semibold text-stone-700">Closure checklist</h4>
                        
                        <div className="space-y-2 bg-stone-50 border border-stone-200/70 rounded-lg p-3.5">
                          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-stone-700">
                            <input
                              type="checkbox"
                              checked={chkParentNotified}
                              onChange={(e) => setChkParentNotified(e.target.checked)}
                              className="rounded border-stone-300 text-[#9E7D3B] focus:ring-[#9E7D3B]"
                            />
                            Parents / guardians notified
                          </label>

                          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-stone-700">
                            <input
                              type="checkbox"
                              checked={chkSafeguardingReview}
                              onChange={(e) => setChkSafeguardingReview(e.target.checked)}
                              className="rounded border-stone-300 text-[#9E7D3B] focus:ring-[#9E7D3B]"
                            />
                            Safeguarding review completed
                          </label>

                          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-stone-700">
                            <input
                              type="checkbox"
                              checked={chkFollowUpsClosed}
                              onChange={(e) => setChkFollowUpsClosed(e.target.checked)}
                              className="rounded border-stone-300 text-[#9E7D3B] focus:ring-[#9E7D3B]"
                            />
                            All required follow-up actions completed
                          </label>

                          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-stone-700">
                            <input
                              type="checkbox"
                              checked={chkSignedOff}
                              onChange={(e) => setChkSignedOff(e.target.checked)}
                              className="rounded border-stone-300 text-[#9E7D3B] focus:ring-[#9E7D3B]"
                            />
                            Admin sign-off confirmed
                          </label>

                          <div className="flex gap-2.5 pt-2 border-t border-stone-200/60 mt-2">
                            <button
                              onClick={handleSaveChecklist}
                              disabled={submittingAction}
                              className="bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-medium py-1.5 px-3 rounded-lg text-xs cursor-pointer flex-1"
                            >
                              Save checklist
                            </button>
                            <button
                              onClick={() => setShowCloseConfirmModal(true)}
                              disabled={submittingAction}
                              className="bg-stone-900 hover:bg-stone-800 text-white font-medium py-1.5 px-3 rounded-lg text-xs cursor-pointer flex-1"
                            >
                              Close incident
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Other Operational Actions */}
                    <div className="pt-2 border-t border-stone-100 flex gap-2 flex-wrap text-xs">
                      {selectedIncidentDetail.status === 'submitted' && !showRevisionForm && (
                        <button
                          onClick={() => setShowRevisionForm(true)}
                          className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 font-medium"
                        >
                          Request follow-up
                        </button>
                      )}

                      {selectedIncidentDetail.status !== 'closed' && selectedIncidentDetail.status !== 'voided' && !showReasonForm && (
                        <button
                          onClick={() => setShowReasonForm('void')}
                          className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:text-red-700 hover:border-red-200 font-medium"
                        >
                          Void incident
                        </button>
                      )}

                      {selectedIncidentDetail.status === 'closed' && !showReasonForm && (
                        <button
                          onClick={() => setShowReasonForm('reopen')}
                          className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 font-medium"
                        >
                          Reopen incident
                        </button>
                      )}

                      {selectedIncidentDetail.status === 'draft' && (
                        <button
                          onClick={() => {
                            setEditingIncidentId(selectedIncidentDetail.id);
                            setEditingAlertId(selectedIncidentDetail.alert_id);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 font-medium"
                        >
                          Edit draft
                        </button>
                      )}
                    </div>

                    {showRevisionForm && (
                      <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg space-y-2">
                        <span className="text-[11px] font-medium text-stone-700 block">Follow-up request note</span>
                        <textarea
                          value={revisionNotes}
                          onChange={(e) => setRevisionNotes(e.target.value)}
                          placeholder="Describe what additional details or actions are needed..."
                          className="w-full bg-white border border-stone-200 rounded-lg p-2.5 text-xs text-stone-800 outline-none"
                          rows={2}
                        />
                        <div className="flex gap-2 justify-end">
                          <button 
                            onClick={() => setShowRevisionForm(false)}
                            className="px-2.5 py-1 rounded border border-stone-200 text-xs text-stone-600 bg-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleAddChangeRequest}
                            className="bg-stone-800 text-white px-3 py-1 rounded text-xs font-medium"
                          >
                            Send request
                          </button>
                        </div>
                      </div>
                    )}

                    {showReasonForm && (
                      <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg space-y-2">
                        <span className="text-[11px] font-medium text-stone-700 block">
                          Reason to {showReasonForm === 'reopen' ? 'reopen' : 'void'} this incident
                        </span>
                        <textarea
                          value={administrativeReason}
                          onChange={(e) => setAdministrativeReason(e.target.value)}
                          placeholder="Provide a reason..."
                          className="w-full bg-white border border-stone-200 rounded-lg p-2.5 text-xs text-stone-800 outline-none"
                          rows={2}
                        />
                        <div className="flex gap-2 justify-end">
                          <button 
                            onClick={() => setShowReasonForm(null)}
                            className="px-2.5 py-1 rounded border border-stone-200 text-xs text-stone-600 bg-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={showReasonForm === 'reopen' ? handleReopenIncident : handleVoidIncident}
                            className="bg-stone-800 text-white px-3 py-1 rounded text-xs font-medium"
                          >
                            Confirm
                          </button>
                        </div>
                      </div>
                    )}

                    {/* History Section (Prompt Section 17) */}
                    <div className="space-y-3 pt-2 border-t border-stone-100">
                      <h4 className="text-xs font-semibold text-stone-700">History</h4>
                      {historyLogs.length === 0 ? (
                        <p className="text-xs text-stone-400">No history recorded yet.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {historyLogs.map((log, index) => (
                            <div key={log.id || index} className="text-xs space-y-0.5 border-l-2 border-stone-200 pl-3 py-0.5">
                              <div className="flex items-center gap-2 text-stone-500 text-[11px]">
                                <span className="tabular-nums">
                                  {new Date(log.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span>·</span>
                                <span className="font-medium text-stone-800 capitalize">
                                  {(log.action_type || 'update').replace(/_/g, ' ')}
                                </span>
                              </div>
                              {log.notes && (
                                <p className="text-stone-600 text-xs mt-0.5">{log.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                ) : null}

              </div>
            ) : (
              /* Quiet Empty Selection State (Prompt Section 9: Remove "Audit Desk Ready") */
              <div className="bg-white border border-stone-200 rounded-xl p-10 text-center space-y-2 shadow-xs">
                <h4 className="text-xs font-semibold text-stone-700">Select an incident</h4>
                <p className="text-xs text-stone-400 max-w-xs mx-auto leading-relaxed">
                  Choose an incident to review the details and follow-up.
                </p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Record Incident Modal (Prompt Section 11) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl text-left max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-semibold text-stone-900">Record incident</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-stone-700">What happened? *</label>
                <input
                  type="text"
                  required
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. Scraped knee during outdoor play"
                  className="w-full border border-stone-200 rounded-lg p-2.5 text-xs text-stone-800 outline-none focus:border-[#9E7D3B]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-stone-700">Category</label>
                  <select
                    value={createForm.category}
                    onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                    className="w-full border border-stone-200 rounded-lg p-2 text-xs text-stone-700 outline-none bg-white"
                  >
                    <option value="behavioral">Child care</option>
                    <option value="medical">Medical</option>
                    <option value="missing_child">Missing child</option>
                    <option value="security">Security</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-stone-700">Location</label>
                  <input
                    type="text"
                    value={createForm.location}
                    onChange={(e) => setCreateForm({ ...createForm, location: e.target.value })}
                    placeholder="e.g. Main Hall / Toddlers Room"
                    className="w-full border border-stone-200 rounded-lg p-2 text-xs text-stone-800 outline-none focus:border-[#9E7D3B]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-stone-700">Details</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Describe the incident objectively..."
                  className="w-full border border-stone-200 rounded-lg p-2.5 text-xs text-stone-800 outline-none focus:border-[#9E7D3B]"
                  rows={3}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-stone-700">Immediate action taken</label>
                <textarea
                  value={createForm.firstAid}
                  onChange={(e) => setCreateForm({ ...createForm, firstAid: e.target.value })}
                  placeholder="Any immediate care, first aid or steps taken..."
                  className="w-full border border-stone-200 rounded-lg p-2 text-xs text-stone-800 outline-none focus:border-[#9E7D3B]"
                  rows={2}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-stone-700">Parent communication</label>
                <input
                  type="text"
                  value={createForm.parentContact}
                  onChange={(e) => setCreateForm({ ...createForm, parentContact: e.target.value })}
                  placeholder="e.g. Mother notified at collection"
                  className="w-full border border-stone-200 rounded-lg p-2 text-xs text-stone-800 outline-none focus:border-[#9E7D3B]"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 border border-stone-200 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingIncident}
                  onClick={() => setCreateForm({ ...createForm, status: 'submitted' })}
                  className="px-4 py-2 bg-[#9E7D3B] hover:bg-[#8A6D33] text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {creatingIncident ? 'Saving...' : 'Record incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Incident Confirmation Modal (Prompt Section 16) */}
      {showCloseConfirmModal && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl text-left">
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-stone-900">Close this incident?</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Use this when the required follow-up has been completed.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCloseConfirmModal(false)}
                className="px-3.5 py-2 border border-stone-200 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCloseIncident}
                disabled={submittingAction}
                className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {submittingAction ? 'Closing...' : 'Close incident'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incident Editing Modal overlay */}
      {editingIncidentId && editingAlertId && (
        <IncidentEditModal
          alertId={editingAlertId}
          incidentId={editingIncidentId}
          currentUser={adminUser}
          onClose={() => {
            setEditingIncidentId(null);
            setEditingAlertId(null);
            fetchIncidents(true);
            fetchStats();
            if (selectedIncident?.id) {
              handleSelectIncident(selectedIncident);
            }
          }}
        />
      )}

    </div>
  );
};

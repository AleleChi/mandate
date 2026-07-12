import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle, 
  X, 
  Plus, 
  User, 
  Calendar, 
  TrendingUp, 
  ShieldAlert, 
  History, 
  CheckSquare, 
  RotateCcw, 
  Trash2, 
  AlertTriangle,
  Loader2,
  FileText,
  Check
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { IncidentEditModal } from '../../components/common/IncidentEditModal';

// Proof: data-component-version="admin-incident-records-centre-v1"

interface AdminIncidentRecordsCentreProps {
  onBackToOverview?: () => void;
  adminUser: { id: string; role: string; email: string };
}

export const AdminIncidentRecordsCentre: React.FC<AdminIncidentRecordsCentreProps> = ({
  onBackToOverview,
  adminUser
}) => {
  const { showSuccess, showError, showInfo } = useNotification();
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

  const fetchIncidents = async () => {
    try {
      setLoading(true);
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
      showError('Fetch Failed', 'Could not fetch incident list from records database.');
    } finally {
      setLoading(false);
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
      showError('Detail Loading Error', 'Unable to inspect full incident schema logs.');
    } finally {
      setLoadingDetail(false);
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
        showSuccess('Checklist Updated', 'Closure checklist parameters stored successfully.');
        setSelectedIncidentDetail(res.incident);
        fetchIncidents();
        fetchStats();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Checklist Update Failed', parsed.message || 'Check version or database locks.');
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
        showSuccess('Incident Closed', 'Formal report completed and archived successfully.');
        setSelectedIncidentDetail(res.incident);
        fetchIncidents();
        fetchStats();
        // Reload history
        const resHist = await api.incidents.history(selectedIncidentDetail.id);
        if (resHist && resHist.success) setHistoryLogs(resHist.history);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Closure Rejected', parsed.message || 'Please satisfy all closure checklist parameters.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleReopenIncident = async () => {
    if (!selectedIncidentDetail || !administrativeReason.trim()) {
      showError('Reason Required', 'Please provide a formal reason for reopening.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.incidents.reopen(selectedIncidentDetail.id, {
        expectedVersion: selectedIncidentDetail.version,
        reason: administrativeReason,
      });
      if (res && res.success) {
        showSuccess('Incident Reopened', 'Report status reset to submitted under revision.');
        setSelectedIncidentDetail(res.incident);
        setShowReasonForm(null);
        setAdministrativeReason('');
        fetchIncidents();
        fetchStats();
        const resHist = await api.incidents.history(selectedIncidentDetail.id);
        if (resHist && resHist.success) setHistoryLogs(resHist.history);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action Rejected', parsed.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleVoidIncident = async () => {
    if (!selectedIncidentDetail || !administrativeReason.trim()) {
      showError('Reason Required', 'Please provide a justification for voiding this report.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.incidents.void(selectedIncidentDetail.id, {
        expectedVersion: selectedIncidentDetail.version,
        reason: administrativeReason,
      });
      if (res && res.success) {
        showSuccess('Incident Voided', 'Report permanently voided as raised in error.');
        setSelectedIncidentDetail(res.incident);
        setShowReasonForm(null);
        setAdministrativeReason('');
        fetchIncidents();
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

  const handleAddChangeRequest = async () => {
    if (!selectedIncidentDetail || !revisionNotes.trim()) {
      showError('Notes Required', 'Please specify what amendments or logs are required.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.incidents.submitChangeRequest(selectedIncidentDetail.id, {
        expectedVersion: selectedIncidentDetail.version,
        notes: revisionNotes,
      });
      if (res && res.success) {
        showSuccess('Revision Dispatched', 'Volunteer notified of required incident amendments.');
        setSelectedIncidentDetail(res.incident);
        setShowRevisionForm(false);
        setRevisionNotes('');
        fetchIncidents();
        fetchStats();
        const resHist = await api.incidents.history(selectedIncidentDetail.id);
        if (resHist && resHist.success) setHistoryLogs(resHist.history);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Dispatch Failed', parsed.message);
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
        title: followUpTitle,
        assignedToUserId: followUpAssignee || undefined,
      });
      if (res && res.success) {
        showSuccess('Action Created', 'New follow-up action listed successfully.');
        setSelectedIncidentDetail(res.incident);
        setFollowUpTitle('');
        setFollowUpAssignee('');
        fetchIncidents();
        fetchStats();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Creation Failed', parsed.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCompleteFollowUp = async (actionId: string) => {
    if (!selectedIncidentDetail || !followUpCompletionNote.trim()) {
      showError('Note Required', 'Please state the outcome of this follow-up call/visit.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await api.incidents.completeFollowUpAction(selectedIncidentDetail.id, actionId, {
        expectedVersion: selectedIncidentDetail.version,
        completed: true,
        completedNote: followUpCompletionNote,
      });
      if (res && res.success) {
        showSuccess('Action Completed', 'Follow-up item resolved and archived.');
        setSelectedIncidentDetail(res.incident);
        setCompletingFollowUpId(null);
        setFollowUpCompletionNote('');
        fetchIncidents();
        fetchStats();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Completion Failed', parsed.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'medical':
        return <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-emerald-100">Medical</span>;
      case 'behavioral':
        return <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-amber-100">Behavioral</span>;
      case 'missing_child':
        return <span className="bg-red-50 text-red-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-red-100">Missing Child</span>;
      case 'security':
        return <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-indigo-100">Security</span>;
      default:
        return <span className="bg-zinc-50 text-zinc-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-zinc-100">Other</span>;
    }
  };

  const getStatusBadge = (stat: string) => {
    switch (stat) {
      case 'draft':
        return <span className="bg-zinc-100 text-zinc-600 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">Draft</span>;
      case 'submitted':
        return <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider border border-blue-100">Submitted</span>;
      case 'needs_revision':
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">Needs Revision</span>;
      case 'closed':
        return <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider border border-emerald-100">Closed</span>;
      case 'voided':
        return <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider border border-rose-100">Voided</span>;
      default:
        return <span className="bg-zinc-100 text-zinc-600 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">{stat}</span>;
    }
  };

  // Filtered incidents by local text search
  const filteredIncidents = incidents.filter(inc => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (inc.title || '').toLowerCase().includes(q) ||
      (inc.id || '').toLowerCase().includes(q) ||
      (inc.category || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6" data-view-version="admin-incidents-panel-v1">
      
      {/* Upper Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#EAE8E1] p-4 rounded-2xl flex items-center gap-3.5">
          <div className="p-3 bg-zinc-50 rounded-xl text-zinc-500">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Total Records</span>
            <span className="text-xl font-bold text-zinc-800">{loadingStats ? '...' : stats.totalCount}</span>
          </div>
        </div>

        <div className="bg-white border border-[#EAE8E1] p-4 rounded-2xl flex items-center gap-3.5">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-500">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 block">Pending Review</span>
            <span className="text-xl font-bold text-blue-800">{loadingStats ? '...' : stats.submittedCount}</span>
          </div>
        </div>

        <div className="bg-white border border-[#EAE8E1] p-4 rounded-2xl flex items-center gap-3.5">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-500">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">Active Follow-ups</span>
            <span className="text-xl font-bold text-amber-800">{loadingStats ? '...' : stats.activeFollowUpCount}</span>
          </div>
        </div>

        <div className="bg-white border border-[#EAE8E1] p-4 rounded-2xl flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-500">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">Formally Closed</span>
            <span className="text-xl font-bold text-emerald-800">{loadingStats ? '...' : stats.closedCount}</span>
          </div>
        </div>
      </div>

      {/* Main Split Pane */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Incident List */}
        <div className="xl:col-span-7 space-y-4">
          <div className="bg-white border border-[#EAE8E1] p-5 rounded-3xl space-y-4">
            
            {/* Filter bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b border-zinc-100 pb-4">
              <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
                <div>
                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-zinc-700"
                  >
                    <option value="all">All Statuses</option>
                    <option value="draft">Drafts</option>
                    <option value="submitted">Submitted</option>
                    <option value="needs_revision">Needs Revision</option>
                    <option value="closed">Closed</option>
                    <option value="voided">Voided</option>
                  </select>
                </div>
                <div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                    className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl px-3 py-2 text-xs text-zinc-700"
                  >
                    <option value="all">All Categories</option>
                    <option value="medical">Medical</option>
                    <option value="behavioral">Behavioral</option>
                    <option value="missing_child">Missing Child</option>
                    <option value="security">Security</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Text search */}
              <div className="relative w-full md:w-64">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search title, ID..."
                  className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-[#C59B27]"
                />
              </div>
            </div>

            {/* List */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-2">
                <Loader2 className="w-8 h-8 text-[#C59B27] animate-spin" />
                <span className="text-xs text-zinc-400">Querying incident logs...</span>
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
                <ShieldAlert className="w-10 h-10 text-zinc-300" />
                <span className="text-xs text-zinc-500 font-bold">No incident records matched selection</span>
                <p className="text-[10px] text-zinc-400 max-w-xs">Use filters or search bar to change filters.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredIncidents.map((inc) => {
                  const isSelected = selectedIncident?.id === inc.id;
                  return (
                    <div
                      key={inc.id}
                      onClick={() => handleSelectIncident(inc)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected 
                          ? 'border-[#C59B27] bg-[#FAF9F6] ring-1 ring-[#C59B27]/20' 
                          : 'border-zinc-100 hover:border-zinc-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getCategoryBadge(inc.category)}
                            {getStatusBadge(inc.status)}
                          </div>
                          <h4 className="font-serif font-bold text-xs text-[#18181B] leading-snug">
                            {inc.title || 'Untitled Incident'}
                          </h4>
                          <div className="flex items-center gap-3 text-[10px] text-zinc-400 font-mono">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              By: {inc.creatorName || inc.created_by_user_id?.substring(0, 8)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(inc.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded-sm border border-zinc-100">
                          v{inc.version}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 text-xs text-zinc-600 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 text-xs text-zinc-600 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Right Side: Detailed Inspection Panel */}
        <div className="xl:col-span-5">
          {selectedIncident ? (
            <div className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden shadow-sm flex flex-col min-h-[500px]">
              
              {/* Detailed Header */}
              <div className="p-5 border-b border-zinc-100 bg-[#FAF9F6] flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 font-mono block">INCIDENT ID: {selectedIncident.id}</span>
                  <h3 className="font-serif font-bold text-sm text-zinc-800">{selectedIncident.title}</h3>
                  <div className="flex items-center gap-2 pt-1.5">
                    {getCategoryBadge(selectedIncident.category)}
                    {getStatusBadge(selectedIncidentDetail?.status || selectedIncident.status)}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedIncident(null)}
                  className="text-zinc-400 hover:text-zinc-600 bg-transparent border-none cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {loadingDetail ? (
                <div className="p-12 flex flex-col items-center justify-center space-y-2 flex-1">
                  <Loader2 className="w-6 h-6 text-[#C59B27] animate-spin" />
                  <span className="text-xs text-zinc-400">Inspecting database audit log...</span>
                </div>
              ) : selectedIncidentDetail ? (
                <div className="p-5 space-y-6 flex-1 overflow-y-auto max-h-[80vh]">
                  
                  {/* Detailed Description */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Incident Narrative Summary</span>
                    <p className="text-xs text-zinc-700 bg-zinc-50 border border-zinc-100 rounded-2xl p-4.5 italic leading-relaxed">
                      {selectedIncidentDetail.description || 'No detailed narrative provided yet.'}
                    </p>
                  </div>

                  {/* Category Specific Block */}
                  {selectedIncidentDetail.structuredData && (
                    <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4.5 space-y-3">
                      <h4 className="text-[10px] text-[#C59B27] font-bold uppercase tracking-wider border-b border-[#EAE8E1] pb-1">
                        Structured Category Logs
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {Object.entries(selectedIncidentDetail.structuredData).map(([k, v]) => (
                          <div key={k} className="space-y-0.5">
                            <span className="text-[10px] text-zinc-400 font-medium capitalize block">{k.replace(/([A-Z])/g, ' $1')}</span>
                            <span className="font-semibold text-zinc-700">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Parent & First Aid Secure Logs */}
                  {(selectedIncidentDetail.parentContact || selectedIncidentDetail.firstAid || selectedIncidentDetail.security) && (
                    <div className="space-y-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Secure Restricted Logs</span>
                      <div className="space-y-2 text-xs">
                        {selectedIncidentDetail.parentContact && (
                          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                            <span className="text-[9px] text-[#C59B27] font-bold block uppercase">Parent Contact Log</span>
                            <p className="text-zinc-600 mt-0.5">{selectedIncidentDetail.parentContact}</p>
                          </div>
                        )}
                        {selectedIncidentDetail.firstAid && (
                          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                            <span className="text-[9px] text-emerald-600 font-bold block uppercase">First Aid Administered</span>
                            <p className="text-zinc-600 mt-0.5">{selectedIncidentDetail.firstAid}</p>
                          </div>
                        )}
                        {selectedIncidentDetail.security && (
                          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                            <span className="text-[9px] text-indigo-600 font-bold block uppercase">Security Protocol Actions</span>
                            <p className="text-zinc-600 mt-0.5">{selectedIncidentDetail.security}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Follow-up actions log */}
                  <div className="space-y-3.5 border-t border-zinc-100 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Required Follow-up Actions</span>
                      <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-bold">
                        {selectedIncidentDetail.followUpActions?.filter((f: any) => f.status === 'pending').length || 0} Pending
                      </span>
                    </div>

                    <div className="space-y-2">
                      {selectedIncidentDetail.followUpActions?.map((act: any) => (
                        <div key={act.id} className="p-3.5 bg-zinc-50 border border-zinc-100 rounded-2xl text-xs space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="font-semibold text-zinc-700 block">{act.title}</span>
                              <span className="text-[10px] text-zinc-400 block">
                                Assigned To: {act.assignedToUserId?.substring(0, 10) || 'None'}
                              </span>
                            </div>
                            {act.status === 'pending' ? (
                              <button
                                onClick={() => setCompletingFollowUpId(act.id)}
                                className="bg-[#C59B27] hover:bg-[#B08621] text-white font-bold px-2.5 py-1 rounded-lg text-[10px] border-none cursor-pointer"
                              >
                                Mark Done
                              </button>
                            ) : (
                              <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                Completed
                              </span>
                            )}
                          </div>

                          {/* Completion box */}
                          {completingFollowUpId === act.id && (
                            <div className="p-3 bg-white border border-[#EAE8E1] rounded-xl space-y-2 mt-2">
                              <textarea
                                value={followUpCompletionNote}
                                onChange={(e) => setFollowUpCompletionNote(e.target.value)}
                                placeholder="Enter parent callback note or recovery status..."
                                className="w-full border border-[#EAE8E1] rounded-lg p-2 text-xs"
                              />
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => setCompletingFollowUpId(null)}
                                  className="px-2.5 py-1 rounded bg-transparent border border-zinc-200 text-[10px]"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleCompleteFollowUp(act.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded text-[10px]"
                                >
                                  Submit Resolution
                                </button>
                              </div>
                            </div>
                          )}

                          {act.status === 'completed' && (
                            <p className="text-[10px] text-emerald-600 italic mt-1 font-medium bg-white p-2 rounded-lg border border-emerald-100">
                              Resolved: {act.completedNote}
                            </p>
                          )}
                        </div>
                      ))}

                      {/* Add new follow-up form */}
                      <form onSubmit={handleAddFollowUp} className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-3.5 space-y-2.5">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Add Follow-up Obligation</span>
                        <input
                          type="text"
                          required
                          value={followUpTitle}
                          onChange={(e) => setFollowUpTitle(e.target.value)}
                          placeholder="e.g. Call father on Sunday morning to confirm recovery..."
                          className="w-full border border-[#EAE8E1] rounded-xl p-2.5 text-xs focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <select
                            value={followUpAssignee}
                            onChange={(e) => setFollowUpAssignee(e.target.value)}
                            className="bg-white border border-[#EAE8E1] rounded-xl px-2.5 py-2 text-xs text-zinc-600 flex-1"
                          >
                            <option value="">Assignee (Optional)</option>
                            {eligibleVolunteers.map(v => (
                              <option key={v.id} value={v.userId}>{v.fullName}</option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="bg-[#C59B27] text-white px-4 py-2 rounded-xl text-xs font-bold"
                          >
                            Add Action
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>

                  {/* Review / Closure Checklists */}
                  {selectedIncidentDetail.status !== 'closed' && selectedIncidentDetail.status !== 'voided' && (
                    <div className="space-y-4 border-t border-zinc-100 pt-4 bg-[#FAF9F6] border border-[#EAE8E1] rounded-3xl p-5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#C59B27] block">Administrative Closure Checklist</span>
                      
                      <div className="space-y-2.5">
                        <label className="flex items-center gap-3 cursor-pointer text-xs text-zinc-700 font-medium">
                          <input
                            type="checkbox"
                            checked={chkParentNotified}
                            onChange={(e) => setChkParentNotified(e.target.checked)}
                            className="w-4 h-4 text-[#C59B27]"
                          />
                          Parents / Guardians formally notified of event
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer text-xs text-zinc-700 font-medium">
                          <input
                            type="checkbox"
                            checked={chkSafeguardingReview}
                            onChange={(e) => setChkSafeguardingReview(e.target.checked)}
                            className="w-4 h-4 text-[#C59B27]"
                          />
                          Safeguarding Review fully completed
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer text-xs text-zinc-700 font-medium">
                          <input
                            type="checkbox"
                            checked={chkFollowUpsClosed}
                            onChange={(e) => setChkFollowUpsClosed(e.target.checked)}
                            className="w-4 h-4 text-[#C59B27]"
                          />
                          All follow-up obligations closed / satisfied
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer text-xs text-zinc-700 font-medium">
                          <input
                            type="checkbox"
                            checked={chkSignedOff}
                            onChange={(e) => setChkSignedOff(e.target.checked)}
                            className="w-4 h-4 text-[#C59B27]"
                          />
                          Formal admin sign-off authorized
                        </label>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={handleSaveChecklist}
                          disabled={submittingAction}
                          className="bg-white border border-zinc-200 text-zinc-700 font-semibold py-2 px-4 rounded-xl text-xs cursor-pointer flex-1"
                        >
                          Save Checklist
                        </button>
                        <button
                          onClick={handleCloseIncident}
                          disabled={submittingAction}
                          className="bg-emerald-600 hover:bg-emerald-700 border-none text-white font-bold py-2 px-4 rounded-xl text-xs cursor-pointer flex-1"
                        >
                          Complete Close
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Administrative Action buttons (Needs Revision, Void, Reopen) */}
                  <div className="pt-4 border-t border-zinc-100 flex gap-2 flex-wrap">
                    {/* Needs Revision button */}
                    {selectedIncidentDetail.status === 'submitted' && !showRevisionForm && (
                      <button
                        onClick={() => setShowRevisionForm(true)}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-2 rounded-xl text-xs font-bold flex-1 cursor-pointer"
                      >
                        Request Revision
                      </button>
                    )}

                    {/* Void button */}
                    {selectedIncidentDetail.status !== 'closed' && selectedIncidentDetail.status !== 'voided' && !showReasonForm && (
                      <button
                        onClick={() => setShowReasonForm('void')}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-2 rounded-xl text-xs font-bold flex-1 cursor-pointer"
                      >
                        Void Record
                      </button>
                    )}

                    {/* Reopen button */}
                    {selectedIncidentDetail.status === 'closed' && !showReasonForm && (
                      <button
                        onClick={() => setShowReasonForm('reopen')}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-2 rounded-xl text-xs font-bold flex-1 cursor-pointer"
                      >
                        Reopen Record
                      </button>
                    )}

                    {/* Allow edit drafts directly */}
                    {selectedIncidentDetail.status === 'draft' && (
                      <button
                        onClick={() => {
                          setEditingIncidentId(selectedIncidentDetail.id);
                          setEditingAlertId(selectedIncidentDetail.alert_id);
                        }}
                        className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 px-3 py-2 rounded-xl text-xs font-bold flex-1 cursor-pointer"
                      >
                        Edit Draft Form
                      </button>
                    )}
                  </div>

                  {/* Change request form note input */}
                  {showRevisionForm && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
                      <span className="text-[10px] text-amber-700 font-bold uppercase block">Revision Change Request Notes</span>
                      <textarea
                        value={revisionNotes}
                        onChange={(e) => setRevisionNotes(e.target.value)}
                        placeholder="Detail specific observations, symptoms, or logs that need correction..."
                        className="w-full bg-white border border-amber-200 rounded-xl p-3 text-xs text-zinc-800 h-20 resize-none focus:outline-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button 
                          onClick={() => setShowRevisionForm(false)}
                          className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs bg-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddChangeRequest}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs"
                        >
                          Dispatch Notes
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Administrative Reason prompt */}
                  {showReasonForm && (
                    <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase block">
                        Reason to {showReasonForm.toUpperCase()} report record
                      </span>
                      <textarea
                        value={administrativeReason}
                        onChange={(e) => setAdministrativeReason(e.target.value)}
                        placeholder="State clear reason for this administrative history action..."
                        className="w-full bg-white border border-zinc-200 rounded-xl p-3 text-xs text-zinc-800 h-16 resize-none focus:outline-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button 
                          onClick={() => setShowReasonForm(null)}
                          className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs bg-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={showReasonForm === 'reopen' ? handleReopenIncident : handleVoidIncident}
                          className="bg-zinc-800 hover:bg-zinc-900 text-white font-bold px-4 py-1.5 rounded-lg text-xs"
                        >
                          Confirm Action
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Audit logs timeline */}
                  <div className="space-y-4 border-t border-zinc-100 pt-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Immutable Security Audit Trail</span>
                    <div className="space-y-3">
                      {historyLogs.map((log, index) => (
                        <div key={log.id || index} className="flex gap-3 text-xs relative">
                          <div className="flex flex-col items-center">
                            <div className="p-1.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-full text-[#C59B27] z-10">
                              <History className="w-3.5 h-3.5" />
                            </div>
                            {index < historyLogs.length - 1 && <div className="w-0.5 bg-[#EAE8E1] flex-1 my-1" />}
                          </div>
                          <div className="space-y-1 pb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-zinc-700">{log.action_type?.toUpperCase()}</span>
                              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md">
                                {log.state_snapshot?.status}
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-400 block font-mono">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                            {log.notes && (
                              <p className="text-[10px] text-zinc-500 font-mono bg-[#FAF9F6] border border-[#EAE8E1] p-2 rounded-lg">
                                Note: {log.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              ) : null}

            </div>
          ) : (
            <div className="bg-white border border-[#EAE8E1] border-dashed rounded-3xl p-12 text-center space-y-3">
              <Shield className="w-10 h-10 text-zinc-300 mx-auto" />
              <h4 className="font-serif font-bold text-sm text-zinc-700">Audit Desk Ready</h4>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                Select an incident record on the left pane to audit historical logs, add follow-ups, satisfy checklists, and sign off closure.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Incident Editing Modal overlay */}
      {editingIncidentId && editingAlertId && (
        <IncidentEditModal
          alertId={editingAlertId}
          incidentId={editingIncidentId}
          currentUser={adminUser}
          onClose={() => {
            setEditingIncidentId(null);
            setEditingAlertId(null);
            fetchIncidents();
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

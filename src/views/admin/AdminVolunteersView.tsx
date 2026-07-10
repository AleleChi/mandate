import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Search, 
  UserCheck, 
  Clock, 
  X, 
  ShieldCheck, 
  Briefcase, 
  Phone, 
  MessageSquare, 
  CheckSquare, 
  ChevronRight,
  Filter,
  Check,
  AlertTriangle,
  FileText,
  RotateCcw,
  AlertCircle,
  ChevronDown,
  MoreVertical,
  Mail,
  Trash2
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';

interface AdminVolunteersViewProps {
  onBackToOverview: () => void;
}

export const AdminVolunteersView: React.FC<AdminVolunteersViewProps> = ({ onBackToOverview }) => {
  const { showError, showSuccess } = useNotification();
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  
  // Selected volunteer for detail review modal
  const [selectedVol, setSelectedVol] = useState<any | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [assignedTeam, setAssignedTeam] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  // Soft Delete and Tabs state
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'declined' | 'removed'>('active');
  const [volToRemove, setVolToRemove] = useState<any | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [submittingRemove, setSubmittingRemove] = useState(false);

  const [volToRestore, setVolToRestore] = useState<any | null>(null);
  const [submittingRestore, setSubmittingRestore] = useState(false);

  // Volunteer permanent delete states
  const [volToDelete, setVolToDelete] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Backend stats state
  const [stats, setStats] = useState<any>({
    totalVolunteers: 0,
    pendingReview: 0,
    approvedVolunteers: 0,
    assignedTeams: 0,
    removedVolunteers: 0
  });

  const teamOptions = [
    { value: 'Teens leaders', label: 'Teens Leaders' },
    { value: 'Teens support', label: 'Teens Support' },
    { value: 'Kids age 10-12', label: 'Kids age 10-12' },
    { value: 'Kids age 7-9', label: 'Kids age 7-9' },
    { value: 'Kids age 4-6', label: 'Kids age 4-6' },
    { value: 'Toddlers (1-3 yrs)', label: 'Toddlers (1-3 yrs)' },
    { value: 'Babies (under 1)', label: 'Babies (under 1)' },
    { value: 'General assistance', label: 'General Assistance' },
    { value: 'Hospitality', label: 'Hospitality Team' },
    { value: 'Media', label: 'Media Team' }
  ];

  const fetchVolunteers = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getVolunteers({
        q: searchQuery,
        status: statusFilter || activeTab,
        team: teamFilter
      });
      if (res.success) {
        setVolunteers(res.volunteers || []);
        if (res.stats) {
          setStats(res.stats);
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Sync Failed', parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVolunteers();
  }, [searchQuery, statusFilter, teamFilter, activeTab]);

  const handleRemoveVolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!volToRemove) return;
    setSubmittingRemove(true);
    try {
      const res = await api.admin.removeVolunteer(volToRemove.id, removeReason);
      if (res.success) {
        showSuccess('Volunteer Removed', `The volunteer profile has been archived.`);
        setVolToRemove(null);
        setRemoveReason('');
        await fetchVolunteers();
        if (selectedVol && selectedVol.id === volToRemove.id) {
          handleCloseReview();
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Archiving Failed', parsed.message);
    } finally {
      setSubmittingRemove(false);
    }
  };

  const handleRestoreVolSubmit = async () => {
    if (!volToRestore) return;
    setSubmittingRestore(true);
    try {
      const res = await api.admin.restoreVolunteer(volToRestore.id);
      if (res.success) {
        showSuccess('Volunteer Restored', `The volunteer profile has been restored.`);
        setVolToRestore(null);
        await fetchVolunteers();
        if (selectedVol && selectedVol.id === volToRestore.id) {
          handleCloseReview();
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Restoration Failed', parsed.message);
    } finally {
      setSubmittingRestore(false);
    }
  };

  const handlePermanentDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!volToDelete) return;
    if (deleteConfirmationText !== 'DELETE') {
      showError('Validation Error', 'Please type DELETE to confirm.');
      return;
    }
    if (!deleteReason.trim()) {
      showError('Validation Error', 'Please specify a reason for deletion.');
      return;
    }
    setSubmittingDelete(true);
    try {
      const res = await api.admin.permanentlyDeleteVolunteer(volToDelete.id, {
        reason: deleteReason,
        confirmation: deleteConfirmationText
      });
      if (res.success) {
        showSuccess('Deleted Permanently', `The volunteer profile has been anonymized, and their user login has been disabled.`);
        setVolToDelete(null);
        setDeleteReason('');
        setDeleteConfirmationText('');
        await fetchVolunteers();
        if (selectedVol && selectedVol.id === volToDelete.id) {
          handleCloseReview();
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Deletion Failed', parsed.message);
    } finally {
      setSubmittingDelete(false);
    }
  };

  const handleResendEmail = async () => {
    if (!selectedVol) return;
    setResendingEmail(true);
    setShowMoreActions(false);
    try {
      const res = await api.admin.resendVolunteerApprovalEmail(selectedVol.id);
      if (res.success) {
        showSuccess('Welcome email sent.', `A welcome email has been sent to ${selectedVol.email}.`);
      }
    } catch (err: any) {
      showError('Email Error', 'We could not send the email. Please try again.');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleUpdateAssignment = async () => {
    if (!selectedVol) return;
    setSubmittingAssignment(true);
    try {
      const res = await api.admin.updateVolunteerAssignment(selectedVol.id, assignedTeam);
      if (res.success) {
        showSuccess('Assignment Updated', `${selectedVol.fullName} has been assigned to the ${assignedTeam} team.`);
        handleCloseReview();
        fetchVolunteers();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Update Failed', parsed.message);
    } finally {
      setSubmittingAssignment(false);
    }
  };

  const handleOpenReview = (vol: any) => {
    setSelectedVol(vol);
    setAssignedTeam(vol.preferredTeam || 'General assistance');
    setReviewNote(vol.note || '');
    setShowMoreActions(false);
  };

  const handleCloseReview = () => {
    setSelectedVol(null);
    setReviewNote('');
    setSubmittingReview(false);
    setShowMoreActions(false);
  };

  const submitDecision = async (decision: 'approved' | 'rejected') => {
    if (!selectedVol) return;
    setSubmittingReview(true);
    try {
      const res = await api.admin.reviewVolunteer(selectedVol.id, {
        status: decision,
        team: assignedTeam,
        note: reviewNote
      });
      if (res.success) {
        showSuccess(
          decision === 'approved' ? 'Volunteer Approved' : 'Application Update', 
          decision === 'approved' 
            ? `${selectedVol.fullName} is now an active volunteer on the ${assignedTeam} team.`
            : 'Application status updated to rejected.'
        );
        handleCloseReview();
        fetchVolunteers();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action Failed', parsed.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Status metrics
  const pendingCount = volunteers.filter(v => v.status === 'pending_review').length;
  const approvedCount = volunteers.filter(v => v.status === 'approved').length;

  return (
    <div 
      className="space-y-6 animate-fade-in" 
      data-view-version="admin-volunteers-v4-full-overhaul"
      id="admin-volunteers-module-root"
    >
      {/* 1. Header & Quick stats */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-[#EAE8E1]">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[#18181B] tracking-tight">Volunteer Team</h2>
          <p className="text-xs text-zinc-500 mt-1">Review profiles, manage team assignments, and approve service roles.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            onClick={onBackToOverview} 
            variant="secondary" 
            className="text-xs px-4 py-2"
          >
            Back to Overview
          </Button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-[#C59B27] font-bold uppercase tracking-wider">Total Volunteers</span>
          <span className="text-2xl font-serif font-bold text-[#18181B] mt-2">{stats.totalVolunteers}</span>
        </div>

        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-amber-600 font-bold uppercase tracking-wider">Pending Review</span>
          <span className="text-2xl font-serif font-bold text-amber-600 mt-2">{stats.pendingReview}</span>
        </div>

        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">Active Volunteers</span>
          <span className="text-2xl font-serif font-bold text-emerald-600 mt-2">{stats.approvedVolunteers}</span>
        </div>

        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase tracking-wider">Assigned Teams</span>
          <span className="text-2xl font-serif font-bold text-zinc-700 mt-2">{stats.assignedTeams}</span>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex flex-wrap border-b border-[#EAE8E1]" id="volunteers-list-tabs">
        <button
          onClick={() => {
            setActiveTab('active');
            setStatusFilter('');
          }}
          className={`px-4 py-2.5 text-xs font-serif font-bold transition-all border-b-2 cursor-pointer focus:outline-none ${
            activeTab === 'active'
              ? 'border-[#C59B27] text-[#C59B27]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
          id="tab-active-volunteers"
        >
          Active Volunteers
        </button>
        <button
          onClick={() => {
            setActiveTab('pending');
            setStatusFilter('');
          }}
          className={`px-4 py-2.5 text-xs font-serif font-bold transition-all border-b-2 cursor-pointer focus:outline-none ${
            activeTab === 'pending'
              ? 'border-[#C59B27] text-[#C59B27]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
          id="tab-pending-volunteers"
        >
          Pending Review
        </button>
        <button
          onClick={() => {
            setActiveTab('declined');
            setStatusFilter('');
          }}
          className={`px-4 py-2.5 text-xs font-serif font-bold transition-all border-b-2 cursor-pointer focus:outline-none ${
            activeTab === 'declined'
              ? 'border-[#C59B27] text-[#C59B27]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
          id="tab-declined-volunteers"
        >
          Declined
        </button>
        <button
          onClick={() => {
            setActiveTab('removed');
            setStatusFilter('');
          }}
          className={`px-4 py-2.5 text-xs font-serif font-bold transition-all border-b-2 cursor-pointer focus:outline-none ${
            activeTab === 'removed'
              ? 'border-[#C59B27] text-[#C59B27]'
              : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
          id="tab-removed-volunteers"
        >
          Removed Volunteers
        </button>
      </div>

      {/* 2. Filters & Search */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center">
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search volunteers by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all bg-zinc-50/50"
          />
        </div>

        <div className="flex flex-wrap w-full md:w-auto items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px] font-semibold text-zinc-500">Filters:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6] text-zinc-700 min-w-32 cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="pending_review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6] text-zinc-700 min-w-36 cursor-pointer"
          >
            <option value="">All Preferred Teams</option>
            {teamOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {(searchQuery || statusFilter || teamFilter) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('');
                setTeamFilter('');
              }}
              className="text-xs font-semibold text-red-600 hover:underline shrink-0 ml-1 cursor-pointer focus:outline-none"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* 3. Volunteers List Table */}
      <div className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8">
            <KoinoniaInlineLoader
              variant="skeleton"
              size="lg"
              label="Loading volunteer profiles..."
              centered
            />
          </div>
        ) : volunteers.length === 0 ? (
          <div className="text-center py-20 text-zinc-400 space-y-2">
            <Users className="w-8 h-8 stroke-[1.2] mx-auto text-zinc-300" />
            <h3 className="font-serif font-bold text-zinc-700 text-sm">No Volunteers Found</h3>
            <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">There are no volunteer applications matching your query in the current records.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1] text-[#18181B] font-serif font-semibold">
                  <th className="p-4 pl-6">Volunteer Profile</th>
                  <th className="p-4">Contact Info</th>
                  <th className="p-4">Koinonia Worker</th>
                  <th className="p-4">Assigned Team</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8E1]">
                {volunteers.map((vol) => {
                  const statusLabel = 
                    (vol.status === 'approved' || vol.status === 'active') ? 'Active' :
                    (vol.status === 'pending_review' || vol.status === 'pending') ? 'Pending Review' : 
                    (vol.status === 'rejected' || vol.status === 'declined') ? 'Declined' : vol.status;
                    
                  const statusClass = 
                    (vol.status === 'approved' || vol.status === 'active') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                    (vol.status === 'pending_review' || vol.status === 'pending') ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-red-50 text-red-700 border-red-100';

                  const teamLabel = teamOptions.find(o => o.value === vol.preferredTeam)?.label || vol.preferredTeam || 'Not Assigned';

                  return (
                    <tr 
                      key={vol.id} 
                      className="hover:bg-zinc-50/50 transition-colors"
                      data-volunteer-card-v2={vol.id}
                      data-volunteer-row-id={vol.id}
                    >
                      <td className="p-4 pl-6">
                        <div className="flex items-center space-x-3.5">
                          {vol.photoUrl ? (
                            <img
                              src={vol.photoUrl}
                              alt={vol.fullName}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-xl object-cover border border-zinc-200 shadow-2xs shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-[#FAF9F6] border border-[#EAE8E1] flex items-center justify-center text-zinc-400 font-bold shrink-0 text-sm uppercase">
                              {vol.fullName.substring(0, 2)}
                            </div>
                          )}

                          <div className="min-w-0">
                            <span className="font-serif font-bold text-[#18181B] block text-sm tracking-tight">{vol.fullName}</span>
                            <span className="text-[10px] text-zinc-400 block truncate">{vol.email}</span>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 space-y-1">
                        <span className="block font-semibold text-zinc-700">{vol.phone || 'N/A'}</span>
                        {vol.whatsapp && (
                          <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-medium">
                            <MessageSquare className="w-3 h-3 text-emerald-500" /> WhatsApp active
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        {vol.isKoinoniaWorker ? (
                          <div className="space-y-0.5">
                            <span className="px-2 py-0.5 rounded bg-[#FAF6EC] border border-[#C59B27]/20 text-[#C59B27] font-semibold text-[10px] uppercase">
                              Worker
                            </span>
                            <span className="block text-[10px] text-zinc-400 truncate max-w-32">{vol.department}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-400">Regular</span>
                        )}
                      </td>

                      <td className="p-4" data-volunteer-team-v2={vol.preferredTeam}>
                        {vol.status === 'approved' || vol.status === 'active' ? (
                          <select
                            value={vol.preferredTeam || 'General assistance'}
                            onChange={async (e) => {
                              const newTeam = e.target.value;
                              try {
                                const res = await api.admin.updateVolunteerAssignment(vol.id, newTeam);
                                if (res.success) {
                                  showSuccess('Assignment Updated', `${vol.fullName} is now assigned to the ${newTeam} team.`);
                                  fetchVolunteers();
                                }
                              } catch (err: any) {
                                const parsed = extractApiError(err);
                                showError('Update Failed', parsed.message);
                              }
                            }}
                            className="px-2 py-1 text-xs rounded-lg border border-[#EAE8E1] bg-[#FAF9F6] text-zinc-800 font-normal cursor-pointer focus:outline-none focus:border-[#C59B27]"
                            data-volunteer-reassign-action-v2={vol.id}
                          >
                            {teamOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-zinc-500 font-normal italic">{teamLabel}</span>
                        )}
                      </td>

                      <td className="p-4">
                        <span 
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusClass}`}
                          data-volunteer-status-v2={vol.status}
                        >
                          {statusLabel}
                        </span>
                      </td>

                      <td className="p-4 pr-6 text-right space-x-2">
                        <button
                          onClick={() => handleOpenReview(vol)}
                          className="px-3.5 py-1.5 text-xs font-serif text-[#C59B27] font-bold hover:bg-[#C59B27]/5 border border-[#C59B27]/10 hover:border-[#C59B27] rounded-xl transition-all cursor-pointer focus:outline-none inline-block align-middle"
                          data-volunteer-review-action-v2={vol.id}
                        >
                          Review Profiles
                        </button>
                        {vol.isDeleted || activeTab === 'removed' ? (
                          <div className="inline-flex gap-2 align-middle">
                            <button
                              onClick={() => setVolToRestore(vol)}
                              className="px-3.5 py-1.5 text-xs font-serif text-emerald-600 font-bold hover:text-white bg-white hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 rounded-xl transition-all cursor-pointer focus:outline-none inline-flex items-center gap-1"
                              id={`restore-volunteer-btn-${vol.id}`}
                              data-volunteer-restore-action-v2={vol.id}
                            >
                              <RotateCcw className="w-3 h-3" /> Restore
                            </button>
                            <button
                              onClick={() => setVolToDelete(vol)}
                              className="px-3.5 py-1.5 text-xs font-semibold text-red-600 hover:text-white bg-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-xl transition-all cursor-pointer focus:outline-none inline-flex items-center gap-1"
                              id={`delete-volunteer-permanent-btn-${vol.id}`}
                              data-volunteer-delete-permanent-action-v2={vol.id}
                              data-component-version="admin-volunteer-permanent-delete-action-v1"
                            >
                              <Trash2 className="w-3 h-3" /> Delete permanently
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setVolToRemove(vol)}
                            className="px-3.5 py-1.5 text-xs font-semibold text-zinc-500 hover:text-red-600 bg-white hover:bg-red-50 border border-zinc-200 hover:border-red-200 rounded-xl transition-all cursor-pointer focus:outline-none inline-block align-middle"
                            id={`remove-volunteer-btn-${vol.id}`}
                            data-volunteer-remove-action-v2={vol.id}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Rich Application Review Modal (Phase 4) */}
      {selectedVol && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          id="volunteer-review-modal"
          data-testid="volunteer-review-modal"
          data-view-version="admin-volunteer-profile-modal-v3-premium"
        >
          <div 
            onClick={handleCloseReview}
            className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity" 
          />
          
          <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-xl shadow-2xl animate-fade-in flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div 
              className="h-16 px-6 border-b border-[#EAE8E1] flex items-center justify-between bg-white"
              data-component-version="admin-volunteer-profile-header-v2"
            >
              <div className="flex flex-col">
                <h3 className="font-serif font-bold text-base text-[#18181B] leading-tight">
                  Volunteer profile
                </h3>
                <p className="text-[10px] text-zinc-500 font-normal">
                  Review details and manage team assignment.
                </p>
              </div>
              <button 
                onClick={handleCloseReview}
                className="text-zinc-400 hover:text-[#18181B] p-1.5 rounded-xl hover:bg-zinc-50 transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scroll Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {selectedVol.isDeleted && (
                <div className="bg-red-50/70 border border-red-200/60 text-red-800 rounded-2xl p-4 space-y-2 text-xs" id="volunteer-archive-warning">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span>Archived Profile Warning</span>
                  </div>
                  <p>
                    This volunteer profile was archived on{' '}
                    <strong>{selectedVol.deletedAt ? new Date(selectedVol.deletedAt).toLocaleDateString() : 'N/A'}</strong>
                    {selectedVol.deletedByEmail && <> by <strong>{selectedVol.deletedByEmail}</strong></>}.
                  </p>
                  {selectedVol.deleteReason && (
                    <p className="bg-white/85 border border-red-100/50 p-2.5 rounded-xl italic text-red-900 mt-1">
                      Reason: "{selectedVol.deleteReason}"
                    </p>
                  )}
                </div>
              )}

              {/* Profile Headshot and Name summary */}
              <div 
                className="flex flex-col sm:flex-row gap-4 items-center sm:items-start bg-white border border-[#EAE8E1] p-5 rounded-2xl"
                data-component-version="admin-volunteer-profile-summary-v2"
              >
                {selectedVol.photoUrl ? (
                  <img
                    src={selectedVol.photoUrl}
                    alt={selectedVol.fullName}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-2xl object-cover border border-[#EAE8E1] shadow-xs shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-[#FAF9F6] flex items-center justify-center text-[#C59B27] font-serif font-bold shrink-0 text-xl border border-[#EAE8E1] uppercase">
                    {selectedVol.fullName.substring(0, 2)}
                  </div>
                )}

                <div className="text-center sm:text-left space-y-1.5 min-w-0">
                  <h4 className="font-serif font-bold text-lg text-[#18181B] leading-snug">{selectedVol.fullName}</h4>
                  <p className="text-xs text-zinc-500 font-normal">{selectedVol.email}</p>
                  
                  <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start pt-1.5">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wide border uppercase ${
                      (selectedVol.status === 'approved' || selectedVol.status === 'active') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      (selectedVol.status === 'pending_review' || selectedVol.status === 'pending') ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-red-50 text-red-700 border-red-100'
                    }`}>
                      {(selectedVol.status === 'approved' || selectedVol.status === 'active') ? 'Active Volunteer' : 
                       (selectedVol.status === 'pending_review' || selectedVol.status === 'pending') ? 'Pending Review' : 'Declined'}
                    </span>
                    
                    {selectedVol.isKoinoniaWorker && (
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wide bg-[#FFFDF5] text-amber-800 border border-[#F5E6BE] uppercase">
                        Koinonia Staff Worker
                      </span>
                    )}

                    {selectedVol.preferredTeam && (
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-mono bg-zinc-100 text-zinc-600 border border-zinc-200">
                        {teamOptions.find(o => o.value === selectedVol.preferredTeam)?.label || selectedVol.preferredTeam}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact details */}
              <div 
                className="space-y-3"
                data-component-version="admin-volunteer-contact-details-v2"
              >
                <h4 className="font-serif font-bold text-sm text-[#18181B]">Contact details</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1 bg-white p-3.5 rounded-2xl border border-[#EAE8E1]">
                    <span className="text-zinc-400 font-medium block text-[10px] uppercase tracking-wider">Phone</span>
                    <span className="font-semibold text-zinc-800 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-zinc-400" /> {selectedVol.phone || 'None'}
                    </span>
                  </div>

                  <div className="space-y-1 bg-white p-3.5 rounded-2xl border border-[#EAE8E1]">
                    <span className="text-zinc-400 font-medium block text-[10px] uppercase tracking-wider">WhatsApp</span>
                    <span className="font-semibold text-zinc-800 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-zinc-400" /> {selectedVol.whatsapp || 'None'}
                    </span>
                  </div>

                  <div className="space-y-1 bg-white p-3.5 rounded-2xl border border-[#EAE8E1]">
                    <span className="text-zinc-400 font-medium block text-[10px] uppercase tracking-wider">Koinonia worker status</span>
                    <span className="font-semibold text-zinc-800">
                      {selectedVol.isKoinoniaWorker ? 'Staff Worker' : 'Regular Member'}
                    </span>
                  </div>

                  {selectedVol.isKoinoniaWorker && selectedVol.department && (
                    <div className="space-y-1 bg-white p-3.5 rounded-2xl border border-[#EAE8E1]">
                      <span className="text-zinc-400 font-medium block text-[10px] uppercase tracking-wider">Department</span>
                      <span className="font-semibold text-zinc-800 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-zinc-400" /> {selectedVol.department}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Serving experience / notes */}
              <div 
                className="space-y-3"
                data-component-version="admin-volunteer-experience-v2"
              >
                <h4 className="font-serif font-bold text-sm text-[#18181B]">Serving experience</h4>
                <div className="bg-white p-4 rounded-2xl border border-[#EAE8E1] space-y-3">
                  <div className="text-xs">
                    <span className="text-zinc-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Experience notes</span>
                    <p className="text-zinc-700 leading-relaxed text-xs whitespace-pre-line bg-[#FAF9F6]/50 p-3 rounded-xl border border-[#EAE8E1] italic">
                      {selectedVol.servingExperience && selectedVol.servingExperience.trim() ? selectedVol.servingExperience : "No serving experience was provided."}
                    </p>
                  </div>

                  <div className="text-xs">
                    <span className="text-zinc-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Additional note</span>
                    <p className="text-zinc-700 leading-relaxed text-xs whitespace-pre-line bg-[#FAF9F6]/50 p-3 rounded-xl border border-[#EAE8E1]">
                      {selectedVol.note && selectedVol.note.trim() ? selectedVol.note : "No additional note was provided."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Team assignment */}
              <div 
                className="space-y-3 pt-2 border-t border-[#EAE8E1]"
                data-component-version="admin-volunteer-team-assignment-v2"
              >
                <div className="flex flex-col">
                  <h4 className="font-serif font-bold text-sm text-[#18181B]">Team assignment</h4>
                  <p className="text-[10px] text-zinc-500 font-normal mt-0.5">
                    Choose where this volunteer will serve during the event.
                  </p>
                </div>
                
                <div className="space-y-4 bg-white p-4 rounded-2xl border border-[#EAE8E1]">
                  <div>
                    <label className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider block mb-1.5">
                      Assigned team
                    </label>
                    <select
                      value={assignedTeam}
                      onChange={(e) => setAssignedTeam(e.target.value)}
                      disabled={selectedVol.isDeleted}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6] text-[#18181B] font-medium disabled:opacity-60 cursor-pointer"
                    >
                      {teamOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider block mb-1.5">
                      Decision memo / Internal notes
                    </label>
                    <textarea
                      placeholder="Add an internal review note regarding this volunteer profile..."
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      disabled={selectedVol.isDeleted}
                      rows={2}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all bg-[#FAF9F6]/30 resize-none text-zinc-700 disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Decisions */}
            <div 
              className="h-20 border-t border-[#EAE8E1] bg-white px-6 rounded-b-3xl flex items-center justify-between relative"
              data-component-version="admin-volunteer-profile-footer-v2"
            >
              {selectedVol.isDeleted ? (
                <>
                  <span className="text-xs text-red-600 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Archived profile
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleCloseReview}
                      variant="secondary"
                      className="px-4 py-2 text-xs"
                    >
                      Close
                    </Button>
                    <Button
                      onClick={() => setVolToRestore(selectedVol)}
                      variant="primary"
                      className="px-5 py-2 text-xs flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" /> Restore
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Left Side: More actions dropdown button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowMoreActions(!showMoreActions)}
                      className="px-3 py-2 text-xs font-semibold text-zinc-600 bg-zinc-50 border border-[#EAE8E1] hover:bg-zinc-100 rounded-xl flex items-center gap-1.5 transition-all focus:outline-none"
                    >
                      <span>More actions</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${showMoreActions ? 'rotate-180' : ''}`} />
                    </button>

                    {showMoreActions && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setShowMoreActions(false)} 
                        />
                        <div className="absolute bottom-12 left-0 z-50 bg-white border border-[#EAE8E1] rounded-2xl shadow-xl p-1.5 min-w-[200px] flex flex-col gap-1 text-left animate-fade-in">
                          {(selectedVol.status === 'approved' || selectedVol.status === 'active') && (
                            <button
                              type="button"
                              disabled={resendingEmail}
                              onClick={handleResendEmail}
                              className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 rounded-xl transition-colors flex items-center gap-2 font-medium disabled:opacity-50 text-zinc-700 font-normal"
                              data-component-version="admin-volunteer-resend-email-action-v2"
                            >
                              <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <span>{resendingEmail ? 'Sending...' : 'Resend Welcome Email'}</span>
                            </button>
                          )}
                          
                          {(selectedVol.status === 'pending_review' || selectedVol.status === 'pending') && (
                            <button
                              type="button"
                              disabled={submittingReview}
                              onClick={() => {
                                setShowMoreActions(false);
                                submitDecision('rejected');
                              }}
                              className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2 font-medium disabled:opacity-50 font-normal"
                            >
                              <X className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              <span>Reject Application</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setShowMoreActions(false);
                              setVolToRemove(selectedVol);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2 font-medium font-normal"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right Side: Cancel & Primary action */}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleCloseReview}
                      variant="secondary"
                      className="px-4 py-2 text-xs"
                    >
                      Cancel
                    </Button>
                    
                    {(selectedVol.status === 'approved' || selectedVol.status === 'active') ? (
                      <Button
                        onClick={handleUpdateAssignment}
                        loading={submittingAssignment}
                        disabled={submittingAssignment}
                        variant="primary"
                        className="px-5 py-2 text-xs flex items-center gap-1 bg-[#C59B27] hover:bg-[#B89047] text-white rounded-xl"
                      >
                        <Check className="w-3.5 h-3.5 shrink-0" /> Save assignment
                      </Button>
                    ) : (
                      <Button
                        onClick={() => submitDecision('approved')}
                        loading={submittingReview}
                        disabled={submittingReview}
                        variant="primary"
                        className="px-5 py-2 text-xs flex items-center gap-1 bg-[#C59B27] hover:bg-[#B89047] text-white rounded-xl"
                      >
                        <Check className="w-3.5 h-3.5 shrink-0" /> Approve Application
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Remove Confirmation Modal */}
      {volToRemove && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          id="remove-volunteer-modal"
          data-component-version="admin-volunteer-remove-confirm-v2"
        >
          <div 
            onClick={() => setVolToRemove(null)}
            className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity" 
          />
          <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md shadow-2xl p-6">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="font-serif font-bold text-lg text-[#18181B]">Remove volunteer?</h4>
            </div>
            
            <p className="text-xs text-zinc-600 mb-4">
              This will remove the volunteer from active event access. Their application and event history will be kept.
            </p>

            <form onSubmit={handleRemoveVolSubmit} className="space-y-4">
              <div>
                <label className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
                  Reason for removal
                </label>
                <textarea
                  placeholder="Please state the reason for archiving this volunteer profile..."
                  required
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 transition-all bg-zinc-50/50 resize-none text-zinc-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
                <Button
                  type="button"
                  onClick={() => setVolToRemove(null)}
                  variant="secondary"
                  className="px-4 py-2 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={submittingRemove}
                  disabled={submittingRemove || !removeReason.trim()}
                  className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 text-xs font-semibold rounded-xl focus:outline-none"
                >
                  Remove volunteer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Restore Confirmation Modal */}
      {volToRestore && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          id="restore-volunteer-modal"
        >
          <div 
            onClick={() => setVolToRestore(null)}
            className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity" 
          />
          <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md shadow-2xl p-6">
            <div className="flex items-center gap-3 text-emerald-600 mb-4">
              <RotateCcw className="w-6 h-6 shrink-0" />
              <h4 className="font-serif font-bold text-lg text-[#18181B]">Restore Volunteer Profile?</h4>
            </div>
            
            <p className="text-xs text-zinc-600 mb-6">
              Are you sure you want to restore the volunteer profile for <strong>{volToRestore.fullName}</strong>? This will make them active and available for ministry team assignments again.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
              <Button
                onClick={() => setVolToRestore(null)}
                variant="secondary"
                className="px-4 py-2 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRestoreVolSubmit}
                loading={submittingRestore}
                disabled={submittingRestore}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-semibold rounded-xl focus:outline-none"
              >
                Restore Volunteer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Volunteer Deletion Confirmation Modal */}
      {volToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" 
          id="confirm-delete-volunteer-modal"
          data-component-version="admin-volunteer-permanent-delete-modal-v1"
        >
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs" onClick={() => setVolToDelete(null)} />
          <div className="relative bg-[#FFFDF9] border border-red-200 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-red-600">
              <Trash2 className="w-5 h-5 shrink-0 animate-pulse" />
              <h3 className="font-serif font-bold text-lg text-[#18181B]">Delete volunteer permanently</h3>
            </div>
            
            <p className="text-xs text-zinc-600 leading-relaxed">
              You are about to permanently delete and anonymize the volunteer profile for <strong>{volToDelete.fullName}</strong>.
            </p>
            <div className="text-xs bg-red-50 text-red-700 p-3.5 rounded-xl border border-red-100 space-y-1.5">
              <span className="font-bold block">🚨 Danger: This action is irreversible</span>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-red-600/95">
                <li>This will permanently remove contact details (email, phone, WhatsApp).</li>
                <li>This will permanently revoke and disable login credentials.</li>
                <li>Historical check-in logs and reports will be safely preserved as <em className="font-semibold">Deleted volunteer</em>.</li>
              </ul>
            </div>

            <form onSubmit={handlePermanentDeleteSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">Delete Reason (Required)</label>
                <textarea
                  required
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Explain why this volunteer profile is being permanently deleted..."
                  className="w-full h-16 px-3 py-2 text-xs border border-red-100 bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/10 focus:border-red-400 transition-all resize-none placeholder-zinc-400 text-zinc-700"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider block">
                  Confirm by typing <span className="text-red-600 font-bold font-mono">DELETE</span>
                </label>
                <input
                  required
                  type="text"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3 py-2 text-xs font-mono border border-red-100 bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/10 focus:border-red-400 transition-all placeholder-zinc-300 text-zinc-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
                <Button
                  type="button"
                  onClick={() => setVolToDelete(null)}
                  variant="secondary"
                  className="px-4 py-2 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={submittingDelete}
                  disabled={submittingDelete || deleteConfirmationText !== 'DELETE' || !deleteReason.trim()}
                  className="px-5 py-2 text-xs bg-red-600 hover:bg-red-700 hover:text-white border-none text-white font-serif font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  id="confirm-delete-volunteer-permanent-btn"
                >
                  Confirm Delete
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

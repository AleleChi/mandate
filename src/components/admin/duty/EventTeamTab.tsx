import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  RefreshCw, 
  Search, 
  X, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  Clock,
  Smartphone,
  Eye,
  Edit3,
  Trash2,
  Check
} from 'lucide-react';
import { safeStorage } from '../../../utils/storage';
import { buildApiUrl } from '../../../utils/urlHelper';
import { 
  EventDutyAssignmentItem, 
  formatRoleLabel, 
  formatServingGroup, 
  formatShiftWindow
} from './EventTeamAssignmentCard';

const formatResponsibilityDisplay = (r: string) => {
  if (r === 'Room Operator') return 'Room support';
  return r;
};

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface EventTeamTabProps {
  eventId?: string;
}

function getInitials(name?: string): string {
  if (!name) return 'TM';
  const clean = name.replace(/[^a-zA-Z\s]/g, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'TM';
}

function formatDutyStatus(status?: string): { label: string; textClass: string; dotClass: string } {
  switch (status) {
    case 'on_duty':
    case 'active':
      return { label: 'On duty', textClass: 'text-emerald-700', dotClass: 'bg-emerald-500' };
    case 'temporarily_unavailable':
    case 'on_break':
      return { label: 'On break', textClass: 'text-amber-700', dotClass: 'bg-amber-500' };
    case 'scheduled':
    case 'upcoming':
      return { label: 'Scheduled', textClass: 'text-zinc-600', dotClass: 'bg-zinc-400' };
    case 'ended':
    case 'unavailable':
      return { label: 'Unavailable', textClass: 'text-zinc-500', dotClass: 'bg-zinc-400' };
    default:
      return { label: 'Scheduled', textClass: 'text-zinc-600', dotClass: 'bg-zinc-400' };
  }
}

export default function EventTeamTab({ eventId = 'event-ga-2026' }: EventTeamTabProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<EventDutyAssignmentItem[]>([]);
  const [assignmentPagination, setAssignmentPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false
  });

  // Search & Filters
  const [teamSearch, setTeamSearch] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Modals state
  const [showAddAssignModal, setShowAddAssignModal] = useState<boolean>(false);
  const [editingAssignment, setEditingAssignment] = useState<EventDutyAssignmentItem | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<EventDutyAssignmentItem | null>(null);
  const [detailAssignment, setDetailAssignment] = useState<EventDutyAssignmentItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Eligible members for assign modal
  const [eligibleMembers, setEligibleMembers] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Event Locations
  const [eventLocations, setEventLocations] = useState<any[]>([]);

  // Form fields
  const [formResponsibility, setFormResponsibility] = useState<string>('Room Operator');
  const [formStatus, setFormStatus] = useState<string>('scheduled');
  const [formLocationId, setFormLocationId] = useState<string>('');
  const [formStartsAt, setFormStartsAt] = useState<string>('');
  const [formEndsAt, setFormEndsAt] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');

  const responsibilities = [
    'Room Operator',
    'Care Lead',
    'Security Lead',
    'First Aid Team',
    'Gate/Check-in Lead',
    'Pickup Lead',
    'Room/Group Lead',
    'General Response',
    'Event Admin',
    'Super Admin'
  ];

  const hasActiveFilters = Boolean(teamSearch || filterRole || filterStatus);

  const fetchAssignments = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(assignmentPagination.limit),
        responsibility: filterRole,
        status: filterStatus,
        query: teamSearch
      });

      const res = await fetch(buildApiUrl(`/api/admin/duty/events/${eventId}/duty-assignments?${queryParams.toString()}`), { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAssignments(data.assignments || data.items || []);
          setAssignmentPagination(data.pagination || {
            page: 1,
            limit: 25,
            total: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false
          });
        } else {
          setError(data.error || 'We couldn’t load the assignments. Try again');
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          setError('Permission Denied: Administrator access required.');
        } else {
          setError('We couldn’t load the assignments. Try again');
        }
      }
    } catch (err) {
      console.error('Failed fetching assignments:', err);
      setError('We couldn’t load the assignments. Try again');
    } finally {
      setLoading(false);
    }
  };

  const fetchEligibleMembers = async () => {
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const queryParams = new URLSearchParams({
        query: memberSearch,
        limit: '50'
      });

      const res = await fetch(buildApiUrl(`/api/admin/duty/events/${eventId}/eligible-team-members?${queryParams.toString()}`), { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEligibleMembers(data.items || []);
        }
      }
    } catch (err) {
      console.error('Error fetching eligible members:', err);
    }
  };

  const fetchLocations = async () => {
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(buildApiUrl(`/api/admin/duty/events/${eventId}/locations`), { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEventLocations(data.items || []);
        }
      }
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  };

  useEffect(() => {
    fetchAssignments(1);
    fetchLocations();
  }, [eventId, filterRole, filterStatus, teamSearch]);

  useEffect(() => {
    if (showAddAssignModal) {
      fetchEligibleMembers();
    }
  }, [showAddAssignModal, memberSearch, eventId]);

  const openAddModal = () => {
    setEditingAssignment(null);
    setSelectedUserId('');
    setFormResponsibility('Room Operator');
    setFormStatus('scheduled');
    setFormLocationId('');

    const now = new Date();
    const future = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const toLocalISO = (d: Date) => {
      const pad = (n: number) => (n < 10 ? '0' + n : n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setFormStartsAt(toLocalISO(now));
    setFormEndsAt(toLocalISO(future));
    setFormNote('');
    setFormError(null);
    setShowAddAssignModal(true);
  };

  const openEditModal = (assignment: EventDutyAssignmentItem) => {
    setEditingAssignment(assignment);
    setSelectedUserId(assignment.user_id);
    setFormResponsibility(assignment.responsibility_key || 'Room Operator');
    setFormStatus(assignment.status || 'scheduled');
    setFormLocationId(assignment.assigned_location_id || '');

    const toLocalISO = (dString?: string) => {
      if (!dString) return '';
      const d = new Date(dString);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => (n < 10 ? '0' + n : n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setFormStartsAt(toLocalISO(assignment.starts_at));
    setFormEndsAt(toLocalISO(assignment.ends_at));
    setFormNote(assignment.note || '');
    setFormError(null);
    setShowAddAssignModal(true);
  };

  // Prevent background page scrolling when modal is open and handle Escape key
  useEffect(() => {
    if (showAddAssignModal || detailAssignment || deletingAssignment) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (showAddAssignModal) setShowAddAssignModal(false);
          if (detailAssignment) setDetailAssignment(null);
          if (deletingAssignment) setDeletingAssignment(null);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showAddAssignModal, detailAssignment, deletingAssignment]);

  const handleSaveAssignment = async () => {
    setFormError(null);

    if (!editingAssignment && !selectedUserId) {
      setFormError('Choose a team member.');
      return;
    }
    if (!formStartsAt || !formEndsAt) {
      setFormError('Choose start and end times.');
      return;
    }

    const startDate = new Date(formStartsAt);
    const endDate = new Date(formEndsAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setFormError('Enter valid shift times.');
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setFormError('End time must be after start time.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const payload = {
        userId: selectedUserId,
        responsibilityKey: formResponsibility,
        teamKey: 'general_response',
        assignmentLevel: 'primary',
        status: formStatus,
        assignedLocationId: formLocationId || null,
        startsAt: new Date(formStartsAt).toISOString(),
        endsAt: new Date(formEndsAt).toISOString(),
        note: formNote
      };

      const url = editingAssignment
        ? `/api/admin/duty/events/${eventId}/duty-assignments/${editingAssignment.id}`
        : `/api/admin/duty/events/${eventId}/duty-assignments`;

      const method = editingAssignment ? 'PATCH' : 'POST';

      const res = await fetch(buildApiUrl(url), {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(editingAssignment ? 'Assignment updated.' : 'Team member assigned.');
        setTimeout(() => setSuccess(null), 3000);
        setShowAddAssignModal(false);
        setEditingAssignment(null);
        fetchAssignments(assignmentPagination.page);
      } else {
        setFormError(data.error || 'We couldn’t save this assignment. Try again');
      }
    } catch (err) {
      console.error('Failed saving assignment:', err);
      setFormError('We couldn’t save this assignment. Try again');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRemoveAssignment = async () => {
    if (!deletingAssignment) return;
    setIsSubmitting(true);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(buildApiUrl(`/api/admin/duty/events/${eventId}/duty-assignments/${deletingAssignment.id}`), {
        method: 'DELETE',
        headers
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess('Assignment removed.');
        setTimeout(() => setSuccess(null), 3000);
        setDeletingAssignment(null);
        fetchAssignments(assignmentPagination.page);
      } else {
        setError(data.error || 'We couldn’t remove this assignment. Try again');
      }
    } catch (err) {
      console.error('Failed deleting assignment:', err);
      setError('We couldn’t remove this assignment. Try again');
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearFilters = () => {
    setTeamSearch('');
    setFilterRole('');
    setFilterStatus('');
  };

  return (
    <div className="space-y-5 animate-fade-in" data-view-version="admin-duty-team-v5">
      {/* Toast Notifications */}
      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-xl flex items-center justify-between space-x-2 text-xs font-medium animate-fade-in shadow-2xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-950 rounded-xl flex items-center justify-between space-x-2 text-xs font-medium animate-fade-in shadow-2xs">
          <div className="flex items-center space-x-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 cursor-pointer p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAE8E1] pb-4">
        <div>
          <h2 className="text-xl font-bold text-[#18181B] tracking-tight">
            Team Assignments
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5 font-normal">
            Assign approved team members to the areas and roles they will cover during the event.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-xs text-zinc-500 font-medium">
            {assignments.length} {assignments.length === 1 ? 'assignment' : 'assignments'}
          </span>
          <button
            onClick={() => fetchAssignments(1)}
            disabled={loading}
            aria-label="Refresh assignments"
            className="flex items-center space-x-2 px-3 py-1.5 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-xs font-medium text-[#18181B] rounded-lg transition-all shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#C59B27] hover:bg-[#A8821B] text-white text-xs font-medium rounded-lg transition-all shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Assign team member</span>
          </button>
        </div>
      </div>

      {/* 2. Filter / Search Bar */}
      <div className="p-3 bg-white border border-[#EAE8E1] rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shadow-2xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search team members, roles or areas…"
            value={teamSearch}
            onChange={(e) => setTeamSearch(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-900 placeholder:text-zinc-400 font-normal"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            aria-label="Filter by role"
            className="text-xs px-2.5 py-1.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-700 font-medium cursor-pointer"
          >
            <option value="">All roles</option>
            {responsibilities.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Filter by duty status"
            className="text-xs px-2.5 py-1.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-700 font-medium cursor-pointer"
          >
            <option value="">All statuses</option>
            <option value="on_duty">On duty</option>
            <option value="scheduled">Scheduled</option>
            <option value="temporarily_unavailable">On break</option>
            <option value="ended">Unavailable</option>
          </select>
        </div>
      </div>

      {/* 3. Main Content: Table / List */}
      {loading && assignments.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#C59B27]" />
          <span>Loading assignments…</span>
        </div>
      ) : error && assignments.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-rose-200 rounded-2xl space-y-3 shadow-2xs">
          <AlertTriangle className="w-6 h-6 mx-auto text-rose-500" />
          <div>
            <h3 className="font-semibold text-zinc-800 text-sm">{error}</h3>
            <p className="text-zinc-500 text-xs mt-0.5">Please check your connection or try loading assignments again.</p>
          </div>
          <div className="pt-1">
            <button
              onClick={() => fetchAssignments(assignmentPagination.page)}
              className="px-3.5 py-1.5 bg-white border border-[#EAE8E1] text-zinc-700 text-xs font-medium rounded-xl hover:bg-zinc-50 cursor-pointer shadow-2xs"
            >
              Try again
            </button>
          </div>
        </div>
      ) : assignments.length === 0 ? (
        hasActiveFilters ? (
          <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl space-y-2">
            <Users className="w-6 h-6 mx-auto text-zinc-400" />
            <h3 className="font-semibold text-zinc-800 text-sm">No matching assignments</h3>
            <p className="text-zinc-500 text-xs">Try changing your filters or search.</p>
            <div className="pt-2">
              <button
                onClick={clearFilters}
                className="px-3.5 py-1.5 bg-white border border-[#EAE8E1] rounded-xl text-zinc-700 text-xs font-medium hover:bg-zinc-50 cursor-pointer"
              >
                Clear filters
              </button>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl space-y-3">
            <Users className="w-6 h-6 mx-auto text-zinc-400" />
            <div>
              <h3 className="font-semibold text-zinc-800 text-sm">No team assignments yet</h3>
              <p className="text-zinc-500 text-xs mt-0.5">
                Assign approved team members to roles and areas for this event.
              </p>
            </div>
            <div className="pt-1">
              <button
                onClick={openAddModal}
                className="px-3.5 py-1.5 bg-[#C59B27] text-white text-xs font-medium rounded-xl hover:bg-[#A8821B] cursor-pointer"
              >
                Assign team member
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="bg-white border border-[#EAE8E1] rounded-xl overflow-hidden shadow-2xs">
          {/* Desktop & Tablet Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF9F5] border-b border-[#EAE8E1] text-zinc-500 font-medium text-[11px]">
                  <th className="p-3.5 pl-4 font-medium w-[220px]">Team member</th>
                  <th className="p-3.5 font-medium w-[150px]">Role</th>
                  <th className="p-3.5 font-medium min-w-[180px]">Assigned area</th>
                  <th className="p-3.5 font-medium w-[120px]">Duty status</th>
                  <th className="p-3.5 font-medium w-[140px]">Shift</th>
                  <th className="p-3.5 pr-4 font-medium text-right w-[150px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {assignments.map((as) => {
                  const statusInfo = formatDutyStatus(as.status);
                  const personName = as.user_name || 'Administrator';
                  const areaName = as.assigned_location_name || 'Central Command';

                  return (
                    <tr key={as.id} className="hover:bg-zinc-50/60 transition-colors">
                      {/* Team Member */}
                      <td className="p-3.5 pl-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 flex items-center justify-center font-medium text-xs shrink-0">
                            {getInitials(personName)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-zinc-900 text-xs truncate">
                              {personName}
                            </div>
                            {as.user_email && (
                              <div className="text-[11px] text-zinc-400 truncate">
                                {as.user_email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="p-3.5 font-medium text-zinc-800">
                        {as.responsibility_key || formatRoleLabel(as.user_role)}
                      </td>

                      {/* Assigned Area */}
                      <td className="p-3.5 text-zinc-700">
                        <span className="font-medium text-zinc-800">{areaName}</span>
                      </td>

                      {/* Duty Status */}
                      <td className="p-3.5">
                        <div className="flex items-center space-x-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                          <span className={`text-xs font-medium ${statusInfo.textClass}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                      </td>

                      {/* Shift Time */}
                      <td className="p-3.5 text-[11px] text-zinc-500 font-normal">
                        {formatShiftWindow(as.starts_at, as.ends_at)}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 pr-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => setDetailAssignment(as)}
                            className="text-xs text-zinc-600 hover:text-zinc-900 font-medium cursor-pointer"
                          >
                            View
                          </button>
                          <span className="text-zinc-300">•</span>
                          <button
                            onClick={() => openEditModal(as)}
                            className="text-xs text-[#C59B27] hover:text-[#A8821B] font-medium cursor-pointer"
                          >
                            Edit
                          </button>
                          <span className="text-zinc-300">•</span>
                          <button
                            onClick={() => setDeletingAssignment(as)}
                            className="text-xs text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="block md:hidden divide-y divide-zinc-100">
            {assignments.map((as) => {
              const statusInfo = formatDutyStatus(as.status);
              const personName = as.user_name || 'Administrator';
              const areaName = as.assigned_location_name || 'Central Command';

              return (
                <div key={as.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 flex items-center justify-center font-medium text-xs shrink-0">
                        {getInitials(personName)}
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-900 text-xs">{personName}</div>
                        <div className="text-[11px] text-zinc-500">{as.responsibility_key}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                      <span className={`text-xs font-medium ${statusInfo.textClass}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Area</span>
                      <span className="font-medium text-zinc-900">{areaName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Shift</span>
                      <span className="text-zinc-600">{formatShiftWindow(as.starts_at, as.ends_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-1 text-xs">
                    <button
                      onClick={() => setDetailAssignment(as)}
                      className="text-zinc-600 font-medium hover:underline cursor-pointer"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openEditModal(as)}
                      className="text-[#C59B27] font-medium hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingAssignment(as)}
                      className="text-rose-600 font-medium hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Assign Team Member Modal (Create & Edit) */}
      {showAddAssignModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-modal-title"
        >
          <div className="bg-white border border-[#EAE8E1] rounded-2xl w-full max-w-xl max-h-[90vh] shadow-xl flex flex-col overflow-hidden font-sans">
            <div className="flex items-start justify-between border-b border-[#EAE8E1] px-6 py-4 shrink-0">
              <div>
                <h3 id="assign-modal-title" className="text-base font-bold text-[#18181B]">
                  {editingAssignment ? 'Edit assignment' : 'Assign team member'}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Choose who is serving, what they are responsible for, and where they will serve.
                </p>
              </div>
              <button
                onClick={() => setShowAddAssignModal(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-950 rounded-xl text-xs font-medium flex items-center space-x-2">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Member Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-800">Team member</label>
                {editingAssignment ? (
                  <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-medium text-xs text-zinc-900">
                    {editingAssignment.user_name || 'Administrator'} ({editingAssignment.user_email})
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search team members"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="w-full text-xs min-h-[44px] pl-9 pr-3 py-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white text-zinc-900 transition-colors"
                      />
                    </div>
                    <div className="max-h-36 overflow-y-auto border border-[#EAE8E1] rounded-xl divide-y divide-[#EAE8E1] bg-white">
                      {eligibleMembers.length === 0 ? (
                        <div className="p-3 text-center text-zinc-400 text-xs">
                          No team members found.
                        </div>
                      ) : (
                        eligibleMembers.map((m) => {
                          const isSelected = selectedUserId === m.user_id;
                          return (
                            <button
                              key={m.user_id}
                              type="button"
                              onClick={() => setSelectedUserId(m.user_id)}
                              className={`w-full text-left p-2.5 flex items-center justify-between hover:bg-zinc-50 cursor-pointer transition-colors ${
                                isSelected ? 'bg-[#FAF9F5] border-l-3 border-l-[#C59B27]' : ''
                              }`}
                            >
                              <div>
                                <div className="font-semibold text-zinc-900 text-xs flex items-center space-x-1.5">
                                  <span>{m.full_name || m.email}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-[#C59B27]" />}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  {m.email}{m.user_role === 'volunteer' ? ' • Volunteer' : ''}
                                </div>
                              </div>
                              <span className="text-[11px] text-zinc-400 font-normal">
                                {m.active_assignments_count > 0 ? `${m.active_assignments_count} active duty` : 'Available'}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Assignment: Responsibility & Area */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-800">Responsibility</label>
                  <select
                    value={formResponsibility}
                    onChange={(e) => setFormResponsibility(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white cursor-pointer"
                  >
                    {responsibilities.map((r) => (
                      <option key={r} value={r}>{formatResponsibilityDisplay(r)}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-800">Area</label>
                  <select
                    value={formLocationId}
                    onChange={(e) => setFormLocationId(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white cursor-pointer"
                  >
                    <option value="">Central Command / General</option>
                    {eventLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.type ? `(${loc.type})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Duty Status */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-800">Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white cursor-pointer"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="on_duty">On duty</option>
                  <option value="temporarily_unavailable">On break</option>
                  <option value="ended">Unavailable</option>
                </select>
              </div>

              {/* Shift times */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-800">Starts</label>
                  <input
                    type="datetime-local"
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-800">Ends</label>
                  <input
                    type="datetime-local"
                    value={formEndsAt}
                    onChange={(e) => setFormEndsAt(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-zinc-800">Notes</label>
                  <span className="text-[11px] text-zinc-400">Optional</span>
                </div>
                <textarea
                  rows={2}
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Add any shift instructions or notes…"
                  className="w-full p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs font-normal text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-[#EAE8E1] bg-white shrink-0">
              <button
                type="button"
                onClick={() => setShowAddAssignModal(false)}
                disabled={isSubmitting}
                className="min-h-[44px] px-4 py-2 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-zinc-700 font-medium text-xs rounded-xl cursor-pointer disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAssignment}
                disabled={isSubmitting}
                className="min-h-[44px] px-5 py-2 bg-[#C59B27] hover:bg-[#A8821B] text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (editingAssignment ? 'Saving…' : 'Assigning…') : editingAssignment ? 'Save changes' : 'Assign member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. View Details Modal */}
      {detailAssignment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 relative">
            <div className="flex items-start justify-between border-b border-[#EAE8E1] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#18181B]">Assignment Details</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {detailAssignment.user_name || 'Administrator'}
                </p>
              </div>
              <button
                onClick={() => setDetailAssignment(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <span className="text-zinc-500">Responsibility</span>
                <span className="font-semibold text-zinc-900">{formatResponsibilityDisplay(detailAssignment.responsibility_key || '')}</span>
              </div>

              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <span className="text-zinc-500">Area</span>
                <span className="font-semibold text-zinc-900">{detailAssignment.assigned_location_name || 'Central Command'}</span>
              </div>

              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <span className="text-zinc-500">Status</span>
                <span className={`font-semibold ${formatDutyStatus(detailAssignment.status).textClass}`}>
                  {formatDutyStatus(detailAssignment.status).label}
                </span>
              </div>

              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <span className="text-zinc-500">Shift</span>
                <span className="font-medium text-zinc-800">{formatShiftWindow(detailAssignment.starts_at, detailAssignment.ends_at)}</span>
              </div>

              {detailAssignment.note && (
                <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl space-y-1">
                  <span className="text-zinc-500 block">Note</span>
                  <p className="text-zinc-700 italic">"{detailAssignment.note}"</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#EAE8E1]">
              <button
                onClick={() => setDetailAssignment(null)}
                className="px-3.5 py-2 bg-white hover:bg-zinc-100 border border-[#EAE8E1] text-zinc-700 font-medium text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const target = detailAssignment;
                  setDetailAssignment(null);
                  openEditModal(target);
                }}
                className="px-3.5 py-2 bg-[#C59B27] hover:bg-[#A8821B] text-white font-medium text-xs rounded-xl cursor-pointer"
              >
                Change assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Remove Assignment Confirmation Modal */}
      {deletingAssignment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-9 h-9 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="space-y-0.5 pr-4">
                <h3 className="text-base font-bold text-[#18181B]">Remove this assignment?</h3>
                <p className="text-xs text-zinc-500">
                  This team member will no longer be assigned to this area.
                </p>
              </div>
              <button
                onClick={() => setDeletingAssignment(null)}
                disabled={isSubmitting}
                className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Team member</span>
                <span className="font-semibold text-zinc-900">{deletingAssignment.user_name || 'Administrator'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Role</span>
                <span className="font-semibold text-zinc-900">{deletingAssignment.responsibility_key}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Area</span>
                <span className="font-semibold text-zinc-900">{deletingAssignment.assigned_location_name || 'Central Command'}</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-[#EAE8E1]">
              <button
                type="button"
                onClick={() => setDeletingAssignment(null)}
                disabled={isSubmitting}
                className="px-3.5 py-2 bg-white hover:bg-zinc-100 border border-[#EAE8E1] text-zinc-700 font-medium text-xs rounded-xl cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveAssignment}
                disabled={isSubmitting}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Removing…' : 'Remove assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

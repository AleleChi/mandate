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
  MapPin,
  Clock,
  ShieldCheck,
  Smartphone,
  Calendar,
  Filter,
  ArrowRight
} from 'lucide-react';
import { safeStorage } from '../../../utils/storage';
import EventTeamAssignmentCard, { 
  EventDutyAssignmentItem, 
  formatRoleLabel, 
  formatServingGroup, 
  formatShiftWindow,
  formatStatusInfo 
} from './EventTeamAssignmentCard';

const REAL_EVENT_ID = 'event-ga-2026';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export default function EventTeamTab() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [eventUnavailable, setEventUnavailable] = useState<boolean>(false);

  const [assignments, setAssignments] = useState<EventDutyAssignmentItem[]>([]);
  const [assignmentPagination, setAssignmentPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false
  });

  // Filters & search
  const [teamSearch, setTeamSearch] = useState<string>('');
  const [filterResponsibility, setFilterResponsibility] = useState<string>('');
  const [filterAssignStatus, setFilterAssignStatus] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('');

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
  const [formTeamKey, setFormTeamKey] = useState<string>('general_response');
  const [formLevel, setFormLevel] = useState<string>('primary');
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

  const fetchAssignments = async (page = 1) => {
    setLoading(true);
    setError(null);
    setEventUnavailable(false);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Check events first
      const eventsRes = await fetch('/api/admin/events', { headers });
      if (!eventsRes.ok) {
        if (eventsRes.status === 401 || eventsRes.status === 403) {
          setError('Permission Denied: Admin access required');
        } else {
          setError('Failed to fetch assignments from server');
        }
        return;
      }
      const eventsData = await eventsRes.json();
      const activeEvent = eventsData.events?.find((e: any) => e.status === 'current' || e.status === 'open');
      if (!activeEvent) {
        setEventUnavailable(true);
        return;
      }

      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(assignmentPagination.limit),
        responsibility: filterResponsibility,
        status: filterAssignStatus,
        level: filterLevel,
        query: teamSearch
      });
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/duty-assignments?${queryParams.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAssignments(data.items || []);
          setAssignmentPagination(data.pagination || {
            page: 1,
            limit: 25,
            total: (data.items || []).length,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false
          });
        } else {
          setError(data.error || 'Failed to fetch duty assignments');
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          setError('Permission Denied: Admin access required');
        } else {
          setError('Failed to fetch assignments from server');
        }
      }
    } catch (err) {
      console.error('Error fetching assignments:', err);
      setError('An error occurred while loading assignments');
    } finally {
      setLoading(false);
    }
  };

  const fetchEligibleMembers = async (page = 1) => {
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: '20',
        query: memberSearch
      });
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/eligible-team-members?${queryParams.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEligibleMembers(data.items || []);
        }
      }
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  };

  const fetchLocations = async () => {
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/locations`, { headers });
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
  }, [filterResponsibility, filterAssignStatus, filterLevel, teamSearch]);

  useEffect(() => {
    if (showAddAssignModal) {
      fetchEligibleMembers(1);
    }
  }, [showAddAssignModal, memberSearch]);

  const openAddModal = () => {
    setEditingAssignment(null);
    setSelectedUserId('');
    setFormResponsibility('Room Operator');
    setFormTeamKey('general_response');
    setFormLevel('primary');
    setFormStatus('scheduled');
    setFormLocationId('');
    
    // Default shift window: now to +2 hours
    const now = new Date();
    const future = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    
    // Format to local ISO string YYYY-MM-DDTHH:mm
    const toLocalISO = (d: Date) => {
      const pad = (n: number) => n < 10 ? '0' + n : n;
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
    setFormTeamKey(assignment.team_key || 'general_response');
    setFormLevel(assignment.assignment_level || 'primary');
    setFormStatus(assignment.status || 'scheduled');
    setFormLocationId(assignment.assigned_location_id || '');

    const toLocalISO = (dString?: string) => {
      if (!dString) return '';
      const d = new Date(dString);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => n < 10 ? '0' + n : n;
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setFormStartsAt(toLocalISO(assignment.starts_at));
    setFormEndsAt(toLocalISO(assignment.ends_at));
    setFormNote(assignment.note || '');
    setFormError(null);
    setShowAddAssignModal(true);
  };

  const handleSaveAssignment = async () => {
    setFormError(null);

    if (!editingAssignment && !selectedUserId) {
      setFormError('Please select a team member.');
      return;
    }
    if (!formStartsAt || !formEndsAt) {
      setFormError('Please specify both shift start and shift end times.');
      return;
    }

    const startDate = new Date(formStartsAt);
    const endDate = new Date(formEndsAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setFormError('Invalid shift dates provided.');
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setFormError('Shift end time must be strictly later than start time.');
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
        teamKey: formTeamKey,
        assignmentLevel: formLevel,
        status: formStatus,
        assignedLocationId: formLocationId || null,
        startsAt: new Date(formStartsAt).toISOString(),
        endsAt: new Date(formEndsAt).toISOString(),
        note: formNote
      };

      const url = editingAssignment
        ? `/api/admin/duty/events/${REAL_EVENT_ID}/duty-assignments/${editingAssignment.id}`
        : `/api/admin/duty/events/${REAL_EVENT_ID}/duty-assignments`;

      const method = editingAssignment ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(editingAssignment ? 'Assignment updated.' : 'Assignment created successfully.');
        setTimeout(() => setSuccess(null), 3000);
        setShowAddAssignModal(false);
        setEditingAssignment(null);
        fetchAssignments(assignmentPagination.page);
      } else {
        setFormError(data.error || 'Failed to save assignment. Please check input parameters.');
      }
    } catch (err) {
      console.error('Failed saving assignment:', err);
      setFormError('A network error occurred while saving the assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAssignmentStatus = async (assignId: string, newStatus: string) => {
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/duty-assignments/${assignId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setSuccess('Assignment status updated.');
        setTimeout(() => setSuccess(null), 3000);
        fetchAssignments(assignmentPagination.page);
      }
    } catch (err) {
      console.error('Failed to update assignment status:', err);
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
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/duty-assignments/${deletingAssignment.id}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        setSuccess('Assignment removed.');
        setTimeout(() => setSuccess(null), 3000);
        setDeletingAssignment(null);
        fetchAssignments(assignmentPagination.page);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to remove assignment');
      }
    } catch (err) {
      console.error('Failed removing assignment:', err);
      setError('Network error while removing assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearFilters = () => {
    setTeamSearch('');
    setFilterResponsibility('');
    setFilterAssignStatus('');
    setFilterLevel('');
  };

  const hasActiveFilters = Boolean(teamSearch || filterResponsibility || filterAssignStatus || filterLevel);

  return (
    <div className="space-y-6 animate-fade-in" data-view-version="admin-event-team-v2-premium">
      {/* Notifications */}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl flex items-center justify-between text-xs font-semibold animate-fade-in shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-700 hover:text-emerald-950">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-950 rounded-2xl flex items-center justify-between text-xs font-semibold animate-fade-in shadow-xs">
          <div className="flex items-center space-x-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-950">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900 font-sans tracking-tight">On-Duty Event Team & Assignments</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Configure role responsibilities, active shifts, levels, and track readiness across the team.
          </p>
        </div>
        <div className="flex items-center space-x-2.5 shrink-0">
          <button
            onClick={() => fetchAssignments(assignmentPagination.page)}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-2 bg-white hover:bg-stone-50 border border-[#EAE8E1] text-xs font-semibold text-stone-800 rounded-xl transition-all shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Assignments</span>
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center space-x-1.5 px-4 py-2 bg-[#C59B27] hover:bg-[#A8821B] text-white text-xs font-semibold rounded-xl transition-all shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Assignment</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="p-4 bg-white border border-[#EAE8E1] rounded-2xl shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search team members, roles, or locations..."
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              className="w-full text-xs pl-10 pr-4 py-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-medium text-stone-900 placeholder:text-stone-400"
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <select
                value={filterResponsibility}
                onChange={(e) => setFilterResponsibility(e.target.value)}
                className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-medium text-stone-800 cursor-pointer"
              >
                <option value="">All Roles</option>
                {responsibilities.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={filterAssignStatus}
                onChange={(e) => setFilterAssignStatus(e.target.value)}
                className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-medium text-stone-800 cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="on_duty">Active / On Duty</option>
                <option value="scheduled">Upcoming / Scheduled</option>
                <option value="temporarily_unavailable">Paused / On Break</option>
                <option value="ended">Completed / Ended</option>
              </select>
            </div>

            <div>
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-medium text-stone-800 cursor-pointer"
              >
                <option value="">All Serving Groups</option>
                <option value="primary">Primary</option>
                <option value="backup">Backup</option>
                <option value="pre_primary">Pre-primary</option>
                <option value="teens">Teens</option>
                <option value="under_4">Under 4</option>
              </select>
            </div>
          </div>
        </div>

        {/* Result summary row */}
        <div className="flex items-center justify-between text-xs text-stone-500 pt-2 border-t border-stone-100">
          <span className="font-medium text-stone-700">
            {assignments.length} {assignments.length === 1 ? 'assignment' : 'assignments'} found
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-[#C59B27] hover:underline font-medium cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Main Grid Content */}
      {eventUnavailable ? (
        <div className="p-12 text-center text-xs text-stone-500 bg-white border border-[#EAE8E1] rounded-2xl shadow-2xs">
          <Users className="w-8 h-8 mx-auto mb-3 text-[#C59B27] opacity-60" />
          <span className="font-semibold text-stone-800 text-sm block mb-1">No active event is available</span>
          <span>Please create or open an event in the event dashboard to review team assignments.</span>
        </div>
      ) : loading && assignments.length === 0 ? (
        /* Loading Skeletons */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4 animate-pulse">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 bg-stone-100 rounded-2xl" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-stone-100 rounded w-2/3" />
                  <div className="h-3 bg-stone-100 rounded w-1/3" />
                </div>
              </div>
              <div className="h-4 bg-stone-100 rounded w-1/2" />
              <div className="h-16 bg-stone-50 rounded-xl" />
              <div className="h-8 bg-stone-100 rounded-xl w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-12 text-center text-xs text-stone-500 bg-white border border-[#EAE8E1] rounded-2xl shadow-2xs">
          <XCircle className="w-8 h-8 mx-auto mb-3 text-rose-600" />
          <span className="font-semibold text-stone-800 text-sm block mb-1">We could not load the Event Duty assignments</span>
          <span className="block mb-4">{error}</span>
          <button
            onClick={() => fetchAssignments(1)}
            className="px-4 py-2 bg-[#C59B27] text-white text-xs font-semibold rounded-xl hover:bg-[#A8821B]"
          >
            Try again
          </button>
        </div>
      ) : assignments.length === 0 ? (
        <div className="p-12 text-center text-xs text-stone-500 bg-white border border-[#EAE8E1] rounded-2xl shadow-2xs space-y-3">
          <Users className="w-8 h-8 mx-auto text-stone-300" />
          <div>
            <h4 className="font-semibold text-stone-800 text-sm">No team assignments found</h4>
            <p className="mt-1 text-stone-500">Try changing the filters or add a new assignment for this event.</p>
          </div>
          <div className="flex items-center justify-center space-x-3 pt-2">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 border border-[#EAE8E1] text-stone-700 rounded-xl font-semibold hover:bg-stone-50 cursor-pointer"
              >
                Clear filters
              </button>
            )}
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-[#C59B27] text-white rounded-xl font-semibold hover:bg-[#A8821B] cursor-pointer"
            >
              Add assignment
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {assignments.map((as) => (
            <EventTeamAssignmentCard
              key={as.id}
              assignment={as}
              onEdit={openEditModal}
              onDeleteRequest={setDeletingAssignment}
              onUpdateStatus={handleUpdateAssignmentStatus}
              onViewDetails={setDetailAssignment}
            />
          ))}
        </div>
      )}

      {/* BRANDED REMOVE ASSIGNMENT CONFIRMATION MODAL */}
      {deletingAssignment && (
        <div className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 relative">
            <button
              onClick={() => setDeletingAssignment(null)}
              className="absolute top-4 right-4 p-1.5 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-md font-serif font-medium text-stone-950">Remove assignment?</h3>
                <p className="text-xs text-stone-500">Confirm Event Duty team adjustment</p>
              </div>
            </div>

            <div className="bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">Person</span>
                <span className="font-semibold text-stone-900">{deletingAssignment.user_name || 'Administrator'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Responsibility</span>
                <span className="font-semibold text-stone-900">{deletingAssignment.responsibility_key}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Location</span>
                <span className="font-semibold text-stone-900">{deletingAssignment.assigned_location_name || 'Location not assigned'}</span>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              This person will no longer appear as part of the active Event Duty team for this assignment. Historical log records will be preserved for reporting.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setDeletingAssignment(null)}
                disabled={isSubmitting}
                className="px-4 py-2 border border-[#EAE8E1] rounded-xl text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveAssignment}
                disabled={isSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isSubmitting ? 'Removing...' : 'Remove assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {detailAssignment && (
        <div className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setDetailAssignment(null)}
              className="absolute top-4 right-4 p-1.5 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b border-stone-100 pb-3">
              <span className="text-[11px] font-mono text-[#C59B27] font-semibold uppercase tracking-wider">Assignment Details</span>
              <h3 className="text-lg font-serif font-medium text-stone-950 mt-1">
                {detailAssignment.user_name || 'Administrator'}
              </h3>
              <p className="text-xs text-stone-500">
                {formatRoleLabel(detailAssignment.user_role)} • {detailAssignment.user_email}
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-[#FAF9F5] p-3.5 rounded-xl border border-[#EAE8E1]">
                <div>
                  <span className="text-stone-500 block">Responsibility</span>
                  <span className="font-semibold text-stone-900 block mt-0.5">{detailAssignment.responsibility_key}</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Assigned Location</span>
                  <span className="font-semibold text-stone-900 block mt-0.5">{detailAssignment.assigned_location_name || 'Location not assigned'}</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Serving group</span>
                  <span className="font-semibold text-stone-900 block mt-0.5">{formatServingGroup(detailAssignment.assignment_level, detailAssignment.team_key)}</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Status</span>
                  <span className="font-semibold text-stone-900 block mt-0.5">{formatStatusInfo(detailAssignment.status).label}</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-stone-100 pt-3">
                <div className="flex items-center space-x-2 text-stone-700 font-semibold">
                  <Clock className="w-4 h-4 text-[#C59B27]" />
                  <span>Shift Window</span>
                </div>
                <p className="text-stone-600 pl-6">
                  {formatShiftWindow(detailAssignment.starts_at, detailAssignment.ends_at)}
                </p>
              </div>

              <div className="space-y-2 border-t border-stone-100 pt-3">
                <div className="flex items-center space-x-2 text-stone-700 font-semibold">
                  <Smartphone className="w-4 h-4 text-[#C59B27]" />
                  <span>Device Readiness</span>
                </div>
                <p className="text-stone-600 pl-6">
                  {detailAssignment.ready_devices && detailAssignment.ready_devices > 0 
                    ? `${detailAssignment.ready_devices} registered device(s) ready` 
                    : 'No device registered or readiness check pending'}
                </p>
              </div>

              {detailAssignment.note && (
                <div className="space-y-1 border-t border-stone-100 pt-3">
                  <span className="font-semibold text-stone-700">Private Shift Note</span>
                  <p className="text-stone-600 italic bg-stone-50 p-3 rounded-xl border border-stone-100">
                    "{detailAssignment.note}"
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-stone-100">
              <button
                onClick={() => {
                  const toEdit = detailAssignment;
                  setDetailAssignment(null);
                  openEditModal(toEdit);
                }}
                className="px-4 py-2 bg-[#FAF9F5] border border-[#EAE8E1] hover:bg-stone-100 text-stone-800 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Edit assignment
              </button>
              <button
                onClick={() => setDetailAssignment(null)}
                className="px-4 py-2 bg-[#C59B27] text-white rounded-xl text-xs font-semibold hover:bg-[#A8821B] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT ASSIGNMENT MODAL */}
      {showAddAssignModal && (
        <div className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 relative">
            <button
              onClick={() => setShowAddAssignModal(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="border-b border-stone-100 pb-3">
              <h3 className="text-md font-serif font-medium text-stone-950">
                {editingAssignment ? 'Edit Duty Assignment' : 'New Event Duty Assignment'}
              </h3>
              <p className="text-xs text-stone-500">
                {editingAssignment ? `Updating assignment for ${editingAssignment.user_name || 'team member'}` : 'Schedule a volunteer or leader for event duty'}
              </p>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            
            <div className="space-y-4">
              {/* Member Selection (only for new assignment) */}
              {!editingAssignment ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700">Select Team Member *</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Filter members by name or email..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-4 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-medium focus:ring-1 focus:ring-[#C59B27]"
                    />
                  </div>
                  
                  <div className="border border-[#EAE8E1] rounded-xl max-h-[140px] overflow-y-auto divide-y divide-stone-100 bg-[#FAF9F5]/40 mt-1">
                    {eligibleMembers.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => setSelectedUserId(member.id)}
                        className={`w-full text-left p-2.5 text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
                          selectedUserId === member.id ? 'bg-[#C59B27]/10 text-[#C59B27]' : 'hover:bg-stone-50 text-stone-800'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-stone-900">{member.full_name}</div>
                          <div className="text-[11px] text-stone-500 font-mono">{formatRoleLabel(member.role)} • {member.email}</div>
                        </div>
                        {selectedUserId === member.id && <CheckCircle2 className="w-4 h-4 text-[#C59B27]" />}
                      </button>
                    ))}
                    {eligibleMembers.length === 0 && (
                      <div className="p-4 text-center text-stone-400 text-xs">No eligible members found.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs space-y-1">
                  <span className="text-stone-500 font-medium">Assigned Person</span>
                  <div className="font-semibold text-stone-900 text-sm">{editingAssignment.user_name || 'Administrator'}</div>
                  <div className="text-stone-500 font-mono text-[11px]">{editingAssignment.user_email}</div>
                </div>
              )}

              {/* Responsibility & Serving Group */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Responsibility *</label>
                  <select
                    value={formResponsibility}
                    onChange={(e) => setFormResponsibility(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-medium text-stone-800 focus:ring-1 focus:ring-[#C59B27]"
                  >
                    {responsibilities.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Serving group</label>
                  <select
                    value={formLevel}
                    onChange={(e) => setFormLevel(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-medium text-stone-800 focus:ring-1 focus:ring-[#C59B27]"
                  >
                    <option value="primary">Primary Responder</option>
                    <option value="backup">Backup / Secondary</option>
                    <option value="pre_primary">Pre-primary</option>
                    <option value="teens">Teens</option>
                    <option value="under_4">Under 4</option>
                  </select>
                </div>
              </div>

              {/* Assigned Location & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Assigned Location</label>
                  <select
                    value={formLocationId}
                    onChange={(e) => setFormLocationId(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-medium text-stone-800 focus:ring-1 focus:ring-[#C59B27]"
                  >
                    <option value="">Location not assigned</option>
                    {eventLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.location_type ? `(${loc.location_type})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Assignment Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-medium text-stone-800 focus:ring-1 focus:ring-[#C59B27]"
                  >
                    <option value="scheduled">Scheduled / Upcoming</option>
                    <option value="on_duty">Active / On Duty</option>
                    <option value="temporarily_unavailable">Paused / On Break</option>
                    <option value="ended">Completed / Ended</option>
                  </select>
                </div>
              </div>

              {/* Shift Start & End */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Shift Starts *</label>
                  <input
                    type="datetime-local"
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-medium text-stone-800 focus:ring-1 focus:ring-[#C59B27]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700">Shift Ends *</label>
                  <input
                    type="datetime-local"
                    value={formEndsAt}
                    onChange={(e) => setFormEndsAt(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-medium text-stone-800 focus:ring-1 focus:ring-[#C59B27]"
                  />
                </div>
              </div>

              {/* Private Shift Note */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">Private Shift Note</label>
                <textarea
                  placeholder="e.g. Assigned to Grace Hall entrance and radio channel 2"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-medium text-stone-800 h-16 focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end space-x-2.5 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowAddAssignModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-[#EAE8E1] rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAssignment}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#C59B27] hover:bg-[#A8821B] text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingAssignment ? 'Save Changes' : 'Assign Team Member'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

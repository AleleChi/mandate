import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  RefreshCw, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  X, 
  CheckCircle2, 
  XCircle 
} from 'lucide-react';

const REAL_EVENT_ID = 'the-general-assembly-2026';

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

  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentPagination, setAssignmentPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false
  });
  const [teamSearch, setTeamSearch] = useState<string>('');
  const [filterResponsibility, setFilterResponsibility] = useState<string>('');
  const [filterAssignStatus, setFilterAssignStatus] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('');

  const [showAddAssignModal, setShowAddAssignModal] = useState<boolean>(false);
  const [eligibleMembers, setEligibleMembers] = useState<any[]>([]);
  const [eligiblePagination, setEligiblePagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false
  });
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  
  // New assignment form fields
  const [formResponsibility, setFormResponsibility] = useState<string>('Care Lead');
  const [formTeamKey, setFormTeamKey] = useState<string>('general_response');
  const [formLevel, setFormLevel] = useState<string>('primary');
  const [formStatus, setFormStatus] = useState<string>('scheduled');
  const [formStartsAt, setFormStartsAt] = useState<string>('');
  const [formEndsAt, setFormEndsAt] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');

  const fetchAssignments = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(assignmentPagination.limit),
        responsibility: filterResponsibility,
        status: filterAssignStatus,
        level: filterLevel,
        query: teamSearch
      });
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/duty-assignments?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAssignments(data.items || []);
          setAssignmentPagination(data.pagination || {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false
          });
        } else {
          setError(data.error || 'Failed to fetch duty assignments');
        }
      } else {
        setError('Failed to fetch assignments from server');
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
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: '10',
        query: memberSearch
      });
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/eligible-team-members?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEligibleMembers(data.items || []);
          setEligiblePagination(data.pagination || {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false
          });
        }
      }
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  };

  const handleCreateAssignment = async () => {
    if (!selectedUserId || !formStartsAt || !formEndsAt) {
      alert('Please select a user and provide start and end times.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/duty-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          responsibilityKey: formResponsibility,
          teamKey: formTeamKey,
          assignmentLevel: formLevel,
          status: formStatus,
          startsAt: formStartsAt,
          endsAt: formEndsAt,
          note: formNote
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSuccess('Duty assignment created successfully.');
          setTimeout(() => setSuccess(null), 3000);
          setShowAddAssignModal(false);
          // reset form
          setSelectedUserId('');
          setFormStartsAt('');
          setFormEndsAt('');
          setFormNote('');
          fetchAssignments(1);
        } else {
          alert(data.error || 'Failed to create assignment');
        }
      }
    } catch (err) {
      console.error('Failed creating assignment:', err);
    }
  };

  const handleUpdateAssignmentStatus = async (assignId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/duty-assignments/${assignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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

  const handleCancelAssignment = async (assignId: string) => {
    if (!window.confirm('Are you sure you want to cancel this assignment?')) return;
    try {
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/duty-assignments/${assignId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSuccess('Assignment cancelled.');
        setTimeout(() => setSuccess(null), 3000);
        fetchAssignments(assignmentPagination.page);
      }
    } catch (err) {
      console.error('Failed cancelling assignment:', err);
    }
  };

  useEffect(() => {
    fetchAssignments(1);
  }, [filterResponsibility, filterAssignStatus, filterLevel, teamSearch]);

  useEffect(() => {
    if (showAddAssignModal) {
      fetchEligibleMembers(1);
    }
  }, [showAddAssignModal, memberSearch]);

  const responsibilities = [
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

  return (
    <div className="space-y-6 animate-fade-in" data-view-version="admin-event-team-v1-premium">
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl flex items-center space-x-2 text-xs font-semibold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-950 rounded-2xl flex items-center space-x-2 text-xs font-semibold animate-fade-in">
          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 font-sans tracking-tight">On-Duty Event Team & Assignments</h2>
          <p className="text-xs text-zinc-500">Configure role responsibilities, active shifts, levels, and track readiness across the team.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchAssignments(assignmentPagination.page)}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-2 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Assignments</span>
          </button>
          <button
            onClick={() => {
              setShowAddAssignModal(true);
              fetchEligibleMembers(1);
            }}
            className="flex items-center space-x-1.5 px-4 py-2 bg-[#C59B27] hover:bg-[#A8821B] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Assignment</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Assignment Bar */}
      <div className="p-4 bg-white border border-[#EAE8E1] rounded-2xl flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search team members..."
            value={teamSearch}
            onChange={(e) => setTeamSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-semibold"
          />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={filterResponsibility}
            onChange={(e) => setFilterResponsibility(e.target.value)}
            className="text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-semibold"
          >
            <option value="">All Roles</option>
            {responsibilities.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select
            value={filterAssignStatus}
            onChange={(e) => setFilterAssignStatus(e.target.value)}
            className="text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-semibold"
          >
            <option value="">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="on_duty">On Duty</option>
            <option value="temporarily_unavailable">Temporarily Unavailable</option>
            <option value="ended">Ended</option>
          </select>

          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-semibold"
          >
            <option value="">All Tiers</option>
            <option value="primary">Primary Responder</option>
            <option value="backup">Backup Responder</option>
          </select>
        </div>
      </div>

      {/* Assignments list */}
      {assignments.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-3xl">
          <span>No active duty assignments defined for this event. Click "Add Assignment" to schedule.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignments.map((as) => {
            const isUnavailable = as.status === 'temporarily_unavailable';
            const isOnDuty = as.status === 'on_duty';
            const isScheduled = as.status === 'scheduled';
            const isEnded = as.status === 'ended';

            return (
              <div key={as.id} className="bg-white border border-[#EAE8E1] rounded-2xl p-5 hover:border-[#C59B27] transition-all relative group flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-zinc-900">{as.user_name}</h4>
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">{as.user_role}</span>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                      isOnDuty 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : isUnavailable 
                        ? 'bg-amber-50 text-amber-700 border-amber-200' 
                        : isEnded 
                        ? 'bg-zinc-100 text-zinc-500 border-zinc-200' 
                        : 'bg-[#FAF9F5] text-zinc-600 border-[#EAE8E1]'
                    }`}>
                      {as.status.toUpperCase().replace('_', ' ')}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-zinc-50 pt-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400 font-semibold">Responsibility</span>
                      <span className="text-zinc-800 font-bold">{as.responsibility_key}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400 font-semibold">Serving Tier</span>
                      <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${as.assignment_level === 'primary' ? 'bg-[#C59B27]/10 text-[#C59B27]' : 'bg-blue-50 text-blue-700'}`}>
                        {as.assignment_level}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400 font-semibold">Shift Window</span>
                      <span className="text-zinc-600 font-bold font-mono text-[10px]">
                        {new Date(as.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(as.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs items-center">
                      <span className="text-zinc-400 font-semibold">Ready Device</span>
                      <span className="flex items-center space-x-1">
                        <span className={`w-2 h-2 rounded-full ${as.ready_devices > 0 ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                        <span className="text-[10px] text-zinc-500 font-bold">{as.ready_devices > 0 ? `${as.ready_devices} registered` : 'No ready device'}</span>
                      </span>
                    </div>
                    {as.note && (
                      <div className="text-[10px] text-zinc-400 italic bg-[#FAF9F5] p-2 rounded-lg mt-2 font-semibold">
                        "{as.note}"
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-1">
                    {isScheduled && (
                      <button
                        onClick={() => handleUpdateAssignmentStatus(as.id, 'on_duty')}
                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold rounded-lg cursor-pointer"
                      >
                        Set On Duty
                      </button>
                    )}
                    {isOnDuty && (
                      <button
                        onClick={() => handleUpdateAssignmentStatus(as.id, 'temporarily_unavailable')}
                        className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold rounded-lg cursor-pointer"
                      >
                        Go on Break
                      </button>
                    )}
                    {isUnavailable && (
                      <button
                        onClick={() => handleUpdateAssignmentStatus(as.id, 'on_duty')}
                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold rounded-lg cursor-pointer"
                      >
                        Return
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleCancelAssignment(as.id)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer transition-all"
                    title="Cancel assignment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Assignment Modal Overlay */}
      {showAddAssignModal && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 max-w-xl w-full max-h-[85vh] overflow-y-auto shadow-2xl space-y-4 animate-fade-in relative">
            <button
              onClick={() => setShowAddAssignModal(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-100 rounded-full cursor-pointer text-zinc-400"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-md font-bold text-zinc-900 border-b border-zinc-100 pb-2">New Event Duty Assignment</h3>
            
            <div className="space-y-3">
              {/* Member search and select */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Select Team Member</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Filter members by name..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-4 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-semibold"
                  />
                </div>
                
                <div className="border border-[#EAE8E1] rounded-xl max-h-[150px] overflow-y-auto divide-y divide-zinc-50 mt-1">
                  {eligibleMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => setSelectedUserId(member.id)}
                      className={`w-full text-left p-2.5 text-xs font-semibold transition-all flex items-center justify-between ${selectedUserId === member.id ? 'bg-[#C59B27]/10 text-[#C59B27]' : 'hover:bg-zinc-50'}`}
                    >
                      <div>
                        <div className="font-bold">{member.full_name}</div>
                        <div className="text-[10px] text-zinc-400 font-mono uppercase">{member.role} • {member.email}</div>
                      </div>
                      {selectedUserId === member.id && <span className="text-xs font-bold">✓</span>}
                    </button>
                  ))}
                  {eligibleMembers.length === 0 && (
                    <div className="p-4 text-center text-zinc-400 text-xs font-medium">No eligible volunteers found.</div>
                  )}
                </div>
              </div>

              {/* Form Options */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Responsibility</label>
                  <select
                    value={formResponsibility}
                    onChange={(e) => setFormResponsibility(e.target.value)}
                    className="w-full text-xs p-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-semibold"
                  >
                    {responsibilities.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Level Tier</label>
                  <select
                    value={formLevel}
                    onChange={(e) => setFormLevel(e.target.value)}
                    className="w-full text-xs p-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-semibold"
                  >
                    <option value="primary">Primary Responder</option>
                    <option value="backup">Backup Responder</option>
                  </select>
                </div>
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Starts At</label>
                  <input
                    type="datetime-local"
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="w-full text-xs p-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Ends At</label>
                  <input
                    type="datetime-local"
                    value={formEndsAt}
                    onChange={(e) => setFormEndsAt(e.target.value)}
                    className="w-full text-xs p-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-semibold"
                  />
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Private Shift Note</label>
                <textarea
                  placeholder="e.g. Assigned to Main Hallway first aid bag"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  className="w-full text-xs p-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-semibold h-16"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-50">
                <button
                  onClick={() => setShowAddAssignModal(false)}
                  className="px-4 py-2 border border-[#EAE8E1] rounded-xl text-xs font-bold text-zinc-500 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAssignment}
                  className="px-4 py-2 bg-[#C59B27] hover:bg-[#A8821B] text-white rounded-xl text-xs font-bold"
                >
                  Assign Volunteer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

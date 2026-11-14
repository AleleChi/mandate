import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  MapPin, 
  X, 
  CheckCircle2, 
  Search, 
  Clock, 
  RefreshCw, 
  AlertTriangle,
  Check
} from 'lucide-react';
import { safeStorage } from '../../../utils/storage';
import { buildApiUrl } from '../../../utils/urlHelper';

export const CANONICAL_AGE_GROUPS = [
  { key: '2–3', label: 'Ages 2–3' },
  { key: '4–6', label: 'Ages 4–6' },
  { key: '7–9', label: 'Ages 7–9' },
  { key: '10–12', label: 'Ages 10–12' },
  { key: '13–14', label: 'Ages 13–14' }
];

export const CANONICAL_RESPONSIBILITIES = [
  'Room Operator',
  'General Response',
  'Care Lead',
  'Security Lead',
  'Safety Marshal',
  'First Aid Team',
  'Gate/Check-in Lead',
  'Pickup Lead',
  'Room/Group Lead',
  'Event Admin',
  'Super Admin'
];

interface EligibleMember {
  id?: string;
  user_id?: string;
  full_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  preferred_team?: string;
  is_koinonia_worker?: boolean | number;
  user_role?: string;
}

export interface VolunteerDutyAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  eventId?: string;
  locations?: any[];
  prefilledLocationId?: string | null;
  editingAssignment?: any | null;
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

export default function VolunteerDutyAssignmentModal({
  isOpen,
  onClose,
  onSaved,
  eventId = 'event-ga-2026',
  locations = [],
  prefilledLocationId = null,
  editingAssignment = null
}: VolunteerDutyAssignmentModalProps) {
  // Selection states
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [eligibleMembers, setEligibleMembers] = useState<EligibleMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states
  const [formLocationId, setFormLocationId] = useState<string>('');
  const [formResponsibility, setFormResponsibility] = useState<string>('General Response');
  const [formStatus, setFormStatus] = useState<string>('scheduled');
  const [formStartsAt, setFormStartsAt] = useState<string>('');
  const [formEndsAt, setFormEndsAt] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');
  const [formAssignedAgeGroups, setFormAssignedAgeGroups] = useState<string[]>([]);

  const isEditing = Boolean(editingAssignment);

  // Find prefilled location details
  const prefilledLocation = useMemo(() => {
    if (!prefilledLocationId) return null;
    return locations.find(l => l.id === prefilledLocationId) || null;
  }, [prefilledLocationId, locations]);

  // Fetch eligible volunteers for assignment
  const fetchEligibleMembers = async (search = '') => {
    setLoadingMembers(true);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({ limit: '500' });
      if (search.trim()) params.set('search', search.trim());
      // In edit mode, allow the assigned volunteer to be retrieved
      if (isEditing) params.set('includeAssigned', 'true');

      const res = await fetch(buildApiUrl(`/api/admin/duty/events/${eventId}/eligible-team-members?${params.toString()}`), { headers });
      if (res.ok) {
        const data = await res.json();
        const list = data.items || data.members || [];
        setEligibleMembers(list);
      }
    } catch (err) {
      console.error('Failed fetching eligible team members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  // Helper date formatter
  const toLocalISO = (d: Date) => {
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Initialize modal state on open or change
  useEffect(() => {
    if (!isOpen) return;

    setFormError(null);
    setSuccessMessage(null);
    setMemberSearch('');

    if (editingAssignment) {
      // Edit mode
      const uid = editingAssignment.userId || editingAssignment.user_id;
      setSelectedUserIds(uid ? [uid] : []);
      setFormResponsibility(editingAssignment.responsibilityKey || editingAssignment.responsibility_key || 'General Response');
      setFormStatus(editingAssignment.status || 'scheduled');
      setFormLocationId(editingAssignment.assignedLocationId || editingAssignment.assigned_location_id || prefilledLocationId || '');
      setFormNote(editingAssignment.note || '');

      const rawGroups = editingAssignment.assignedAgeGroups || editingAssignment.assigned_age_groups;
      let parsed: string[] = [];
      if (Array.isArray(rawGroups)) {
        parsed = rawGroups;
      } else if (typeof rawGroups === 'string') {
        try {
          const p = JSON.parse(rawGroups);
          if (Array.isArray(p)) parsed = p;
          else parsed = [rawGroups];
        } catch {
          parsed = rawGroups.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      setFormAssignedAgeGroups(parsed);

      if (editingAssignment.startsAt || editingAssignment.starts_at) {
        const s = new Date(editingAssignment.startsAt || editingAssignment.starts_at);
        if (!isNaN(s.getTime())) setFormStartsAt(toLocalISO(s));
      } else {
        setFormStartsAt(toLocalISO(new Date()));
      }

      if (editingAssignment.endsAt || editingAssignment.ends_at) {
        const e = new Date(editingAssignment.endsAt || editingAssignment.ends_at);
        if (!isNaN(e.getTime())) setFormEndsAt(toLocalISO(e));
      } else {
        const future = new Date(Date.now() + 3 * 60 * 60 * 1000);
        setFormEndsAt(toLocalISO(future));
      }
    } else {
      // Create mode
      setSelectedUserIds([]);
      setFormResponsibility('General Response');
      setFormStatus('scheduled');
      setFormLocationId(prefilledLocationId || '');
      setFormNote('');

      const now = new Date();
      const future = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      setFormStartsAt(toLocalISO(now));
      setFormEndsAt(toLocalISO(future));

      // Age group preselection from location context (Section 9)
      if (prefilledLocation && prefilledLocation.ageGroupKey && prefilledLocation.ageGroupKey !== 'All Ages') {
        const rawKey = prefilledLocation.ageGroupKey.toLowerCase();
        let matched: string | null = null;
        if (rawKey.includes('13') || rawKey.includes('14') || rawKey.includes('teen')) matched = 'Ages 13–14';
        else if (rawKey.includes('10') || rawKey.includes('12')) matched = 'Ages 10–12';
        else if (rawKey.includes('7') || rawKey.includes('9')) matched = 'Ages 7–9';
        else if (rawKey.includes('4') || rawKey.includes('6')) matched = 'Ages 4–6';
        else if (rawKey.includes('2') || rawKey.includes('3') || rawKey.includes('1')) matched = 'Ages 2–3';

        setFormAssignedAgeGroups(matched ? [matched] : []);
      } else {
        // If All Ages or no location, require deliberate choice
        setFormAssignedAgeGroups([]);
      }
    }

    fetchEligibleMembers('');
  }, [isOpen, editingAssignment, prefilledLocationId]);

  // Debounced search
  useEffect(() => {
    if (!isOpen || isEditing) return;
    const timer = setTimeout(() => {
      fetchEligibleMembers(memberSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [memberSearch, isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filter eligible members client-side as well
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return eligibleMembers;
    const q = memberSearch.toLowerCase().trim();
    return eligibleMembers.filter(m => {
      const name = (m.full_name || m.name || '').toLowerCase();
      const email = (m.email || '').toLowerCase();
      const phone = (m.phone || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [eligibleMembers, memberSearch]);

  const handleToggleMember = (userId: string) => {
    if (isEditing) return;
    setSelectedUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (isEditing) return;
    const allIds = filteredMembers.map(m => m.id || m.user_id).filter((id): id is string => Boolean(id));
    setSelectedUserIds(prev => Array.from(new Set([...prev, ...allIds])));
  };

  const handleClearSelection = () => {
    if (isEditing) return;
    setSelectedUserIds([]);
  };

  const handleToggleAgeGroup = (groupLabel: string, groupKey: string) => {
    const cleanKey = groupKey.replace(/^Ages\s+/, '').trim().replace('–', '-');
    const isChecked = formAssignedAgeGroups.some(g => {
      const cleanG = g.replace(/^Ages\s+/, '').trim().replace('–', '-');
      return cleanG === cleanKey;
    });

    if (isChecked) {
      setFormAssignedAgeGroups(prev => prev.filter(g => {
        const cleanG = g.replace(/^Ages\s+/, '').trim().replace('–', '-');
        return cleanG !== cleanKey;
      }));
    } else {
      setFormAssignedAgeGroups(prev => [...prev, groupLabel]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const targetLocationId = formLocationId || prefilledLocationId || null;

    if (selectedUserIds.length === 0) {
      setFormError('Please select at least one volunteer to assign.');
      return;
    }

    if (formAssignedAgeGroups.length === 0) {
      setFormError('Please choose at least one age group for this duty assignment.');
      return;
    }

    if (!formStartsAt || !formEndsAt) {
      setFormError('Please specify start and end times for the duty shift.');
      return;
    }

    if (new Date(formEndsAt).getTime() <= new Date(formStartsAt).getTime()) {
      setFormError('Shift end time must be later than start time.');
      return;
    }

    setIsSubmitting(true);

    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      if (isEditing && editingAssignment) {
        // Edit existing assignment
        const payload = {
          userId: selectedUserIds[0],
          responsibilityKey: formResponsibility,
          teamKey: 'general_response',
          assignmentLevel: 'primary',
          status: formStatus,
          assignedLocationId: targetLocationId,
          assignedAgeGroups: formAssignedAgeGroups,
          startsAt: new Date(formStartsAt).toISOString(),
          endsAt: new Date(formEndsAt).toISOString(),
          note: formNote
        };

        const res = await fetch(
          buildApiUrl(`/api/admin/duty/events/${eventId}/duty-assignments/${editingAssignment.id}`),
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify(payload)
          }
        );

        const data = await res.json();
        if (res.ok && data.success) {
          setSuccessMessage('Assignment updated successfully.');
          setTimeout(() => {
            onSaved();
            onClose();
          }, 400);
        } else {
          setFormError(data?.error || "We couldn't update the assignment. Please try again.");
        }
      } else {
        // Create single or bulk assignment
        const payload = {
          userIds: selectedUserIds,
          responsibilityKey: formResponsibility,
          teamKey: 'general_response',
          assignmentLevel: 'primary',
          status: formStatus,
          assignedLocationId: targetLocationId,
          assignedAgeGroups: formAssignedAgeGroups,
          startsAt: new Date(formStartsAt).toISOString(),
          endsAt: new Date(formEndsAt).toISOString(),
          note: formNote
        };

        const res = await fetch(
          buildApiUrl(`/api/admin/duty/events/${eventId}/duty-assignments`),
          {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          }
        );

        const data = await res.json();
        if (res.ok && data.success) {
          const count = data.count || selectedUserIds.length;
          setSuccessMessage(count === 1 ? '1 volunteer assigned successfully.' : `${count} volunteers assigned successfully.`);
          setTimeout(() => {
            onSaved();
            onClose();
          }, 400);
        } else {
          setFormError(data?.error || "We couldn't assign the selected volunteers. Please try again.");
        }
      }
    } catch (err: any) {
      console.error('Assignment submission error:', err);
      setFormError('Network error while saving duty assignment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-[#1D1D1A] rounded-2xl sm:rounded-3xl shadow-2xl border border-[#EAE8E1] dark:border-[#302E29] flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-modal-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-between bg-zinc-50/50 dark:bg-[#21211E]/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-[#C59B27] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 id="assignment-modal-title" className="text-base sm:text-lg font-serif font-bold text-zinc-900 dark:text-[#F0EBE3]">
                {isEditing ? 'Edit Duty Assignment' : (prefilledLocation ? `Assign Volunteers to ${prefilledLocation.name}` : 'Assign Team Member')}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-[#7A7570] font-sans">
                {isEditing 
                  ? 'Update location, age permissions, duty role, and shift hours.'
                  : 'Configure location, canonical age groups, role, and shift window.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-[#262520] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {formError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl flex items-center space-x-2 text-rose-700 dark:text-rose-400 text-xs font-sans">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-xl flex items-center space-x-2 text-emerald-700 dark:text-emerald-400 text-xs font-sans">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* STEP 1: SELECT VOLUNTEERS */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-800 dark:text-[#F0EBE3] uppercase tracking-wider flex items-center gap-1.5">
                <span>1. Select Volunteers</span>
                <span className="text-zinc-400 text-[11px] font-normal lowercase">
                  ({selectedUserIds.length} selected)
                </span>
              </label>

              {!isEditing && filteredMembers.length > 0 && (
                <div className="flex items-center space-x-2 text-[11px] font-sans">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[#C59B27] hover:text-[#A47E1F] font-medium cursor-pointer"
                  >
                    Select visible
                  </button>
                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="text-zinc-500 hover:text-zinc-700 font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl flex items-center justify-between text-xs font-sans">
                <div className="flex items-center space-x-3">
                  <div className="w-7 h-7 rounded-full bg-[#C59B27]/20 text-[#C59B27] font-bold flex items-center justify-center text-[11px]">
                    {getInitials(editingAssignment.fullName || editingAssignment.user_name)}
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">
                      {editingAssignment.fullName || editingAssignment.user_name || 'Assigned Volunteer'}
                    </div>
                    <div className="text-zinc-400 text-[11px]">
                      {editingAssignment.email || editingAssignment.user_email || ''}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-zinc-400 bg-zinc-100 dark:bg-[#1D1D1A] px-2 py-0.5 rounded-full">
                  Locked in edit
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search by name, email, or phone number…"
                    className="w-full pl-9 pr-3 py-2 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs text-zinc-800 dark:text-[#F0EBE3] placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white dark:focus:bg-[#262520]"
                  />
                  {loadingMembers && (
                    <RefreshCw className="w-3.5 h-3.5 absolute right-3 top-3.5 text-zinc-400 animate-spin" />
                  )}
                </div>

                <div className="border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl max-h-48 overflow-y-auto divide-y divide-[#EAE8E1] dark:divide-[#3A3835] bg-white dark:bg-[#1D1D1A]">
                  {loadingMembers && filteredMembers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-400">Loading active volunteers…</div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-500 italic">
                      No active unassigned volunteers found.
                    </div>
                  ) : (
                    filteredMembers.map((m) => {
                      const uId = m.id || m.user_id || '';
                      const isChecked = selectedUserIds.includes(uId);
                      const isStaff = m.is_koinonia_worker === 1 || m.is_koinonia_worker === true;
                      return (
                        <div
                          key={uId}
                          onClick={() => handleToggleMember(uId)}
                          className={`p-2.5 flex items-center justify-between text-xs font-sans cursor-pointer transition-colors ${
                            isChecked 
                              ? 'bg-amber-50/60 dark:bg-amber-950/20' 
                              : 'hover:bg-zinc-50 dark:hover:bg-[#262520]'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleMember(uId)}
                              className="w-3.5 h-3.5 text-[#C59B27] rounded focus:ring-[#C59B27] border-zinc-300 dark:border-zinc-600 accent-[#C59B27] cursor-pointer"
                            />
                            <div>
                              <div className="font-semibold text-zinc-800 dark:text-[#F0EBE3] flex items-center space-x-1.5">
                                <span>{m.full_name || m.name || 'Volunteer'}</span>
                                {isStaff && (
                                  <span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-1.5 py-0.2 rounded font-medium">
                                    Staff
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-400 flex items-center space-x-1.5">
                                <span>{m.email}</span>
                                {m.phone && (
                                  <>
                                    <span>·</span>
                                    <span>{m.phone}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: LOCATION */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-800 dark:text-[#F0EBE3] uppercase tracking-wider block">
              2. Duty Location / Area
            </label>
            {prefilledLocation ? (
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl flex items-center justify-between text-xs font-sans">
                <div className="flex items-center space-x-2 text-zinc-800 dark:text-[#F0EBE3] font-semibold">
                  <MapPin className="w-4 h-4 text-[#C59B27]" />
                  <span>{prefilledLocation.name}</span>
                </div>
                {prefilledLocation.ageGroupKey && (
                  <span className="text-[11px] text-[#A47E1F] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 rounded-full font-medium">
                    Room scope: {prefilledLocation.ageGroupKey}
                  </span>
                )}
              </div>
            ) : (
              <select
                value={formLocationId}
                onChange={(e) => setFormLocationId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs font-medium text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
              >
                <option value="">Central Command / General</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} {loc.ageGroupKey ? `(${loc.ageGroupKey})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* STEP 3: AGE GROUPS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-800 dark:text-[#F0EBE3] uppercase tracking-wider block">
                3. Assigned Age Groups
              </label>
              <span className="text-[11px] text-zinc-400">
                {formAssignedAgeGroups.length > 0 ? `${formAssignedAgeGroups.length} selected` : 'Select at least one'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl">
              {CANONICAL_AGE_GROUPS.map((group) => {
                const cleanKey = group.key.replace(/^Ages\s+/, '').trim().replace('–', '-');
                const isChecked = formAssignedAgeGroups.some(g => {
                  const cleanG = g.replace(/^Ages\s+/, '').trim().replace('–', '-');
                  return cleanG === cleanKey;
                });

                return (
                  <label
                    key={group.key}
                    className={`flex items-center space-x-2 text-xs font-sans p-2 rounded-lg cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-amber-100/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-semibold'
                        : 'hover:bg-zinc-100 dark:hover:bg-[#2F2E2A] text-zinc-700 dark:text-[#B8B0A5]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleAgeGroup(group.label, group.key)}
                      className="w-3.5 h-3.5 text-[#C59B27] rounded focus:ring-[#C59B27] border-zinc-300 dark:border-zinc-600 accent-[#C59B27] cursor-pointer"
                    />
                    <span>{group.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* STEP 4: DUTY ROLE & STATUS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-800 dark:text-[#F0EBE3] uppercase tracking-wider block">
                4. Duty Role
              </label>
              <select
                value={formResponsibility}
                onChange={(e) => setFormResponsibility(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs font-medium text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
              >
                {CANONICAL_RESPONSIBILITIES.map((resp) => (
                  <option key={resp} value={resp}>
                    {resp}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-800 dark:text-[#F0EBE3] uppercase tracking-wider block">
                Duty Status
              </label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs font-medium text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
              >
                <option value="scheduled">Scheduled</option>
                <option value="on_duty">On Duty</option>
                <option value="available">Available / Backup</option>
                <option value="temporarily_unavailable">Temporarily Unavailable</option>
              </select>
            </div>
          </div>

          {/* STEP 5: SHIFT WINDOW */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-800 dark:text-[#F0EBE3] uppercase tracking-wider block">
                Shift Starts At
              </label>
              <input
                type="datetime-local"
                value={formStartsAt}
                onChange={(e) => setFormStartsAt(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs font-medium text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-800 dark:text-[#F0EBE3] uppercase tracking-wider block">
                Shift Ends At
              </label>
              <input
                type="datetime-local"
                value={formEndsAt}
                onChange={(e) => setFormEndsAt(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs font-medium text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              />
            </div>
          </div>

          {/* NOTES (OPTIONAL) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-800 dark:text-[#F0EBE3] uppercase tracking-wider block">
              Assignment Note (Optional)
            </label>
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="e.g. Assigned to upper level gate or nursery coordinator"
              className="w-full px-3 py-2 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs text-zinc-800 dark:text-[#F0EBE3] placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
            />
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-end space-x-3 bg-zinc-50/50 dark:bg-[#21211E]/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] text-xs font-sans font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#262520] transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-[#C59B27] hover:bg-[#A47E1F] text-white text-xs font-sans font-semibold shadow-xs transition-all cursor-pointer flex items-center space-x-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving assignment…</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>
                  {isEditing 
                    ? 'Save Changes' 
                    : selectedUserIds.length > 1 
                      ? `Assign ${selectedUserIds.length} Volunteers` 
                      : 'Assign Volunteer'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


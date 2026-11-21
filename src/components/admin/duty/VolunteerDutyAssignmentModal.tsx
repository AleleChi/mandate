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
  preselectedVolunteer?: {
    userId?: string;
    id?: string;
    fullName: string;
    email?: string;
    phone?: string;
    assignedAgeGroups?: string[];
  } | null;
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
  editingAssignment = null,
  preselectedVolunteer = null
}: VolunteerDutyAssignmentModalProps) {
  // Selection states
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [eligibleMembers, setEligibleMembers] = useState<EligibleMember[]>([]);
  const [excludedMembers, setExcludedMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active editing state (can switch dynamically from search)
  const [activeEditingAssignment, setActiveEditingAssignment] = useState<any | null>(editingAssignment);

  // Locations state (self-fetching fallback if locations prop is empty)
  const [internalLocations, setInternalLocations] = useState<any[]>([]);
  const [locationSearch, setLocationSearch] = useState<string>('');

  // Form states
  const [formLocationId, setFormLocationId] = useState<string>('');
  const [formResponsibility, setFormResponsibility] = useState<string>('General Response');
  const [formStatus, setFormStatus] = useState<string>('scheduled');
  const [formStartsAt, setFormStartsAt] = useState<string>('');
  const [formEndsAt, setFormEndsAt] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');
  const [formAssignedAgeGroups, setFormAssignedAgeGroups] = useState<string[]>([]);

  const isEditing = Boolean(activeEditingAssignment);

  // Fetch locations if not passed via props
  useEffect(() => {
    if (!isOpen) return;
    if (locations && locations.length > 0) return;

    const fetchLocs = async () => {
      try {
        const token = safeStorage.getItem('koinonia_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let res = await fetch(buildApiUrl(`/api/admin/events/${eventId}/locations`), { headers });
        if (!res.ok) {
          res = await fetch(buildApiUrl(`/api/admin/locations`), { headers });
        }
        if (res.ok) {
          const data = await res.json();
          const list = data.locations || data.items || [];
          setInternalLocations(list);
        }
      } catch (err) {
        console.error('Failed fetching event locations for modal:', err);
      }
    };
    fetchLocs();
  }, [isOpen, eventId, locations]);

  const availableLocations = useMemo(() => {
    return locations && locations.length > 0 ? locations : internalLocations;
  }, [locations, internalLocations]);

  // Find prefilled location details
  const prefilledLocation = useMemo(() => {
    if (!prefilledLocationId) return null;
    return availableLocations.find(l => l.id === prefilledLocationId) || null;
  }, [prefilledLocationId, availableLocations]);

  // Filter locations by location search query
  const filteredLocations = useMemo(() => {
    if (!locationSearch.trim()) return availableLocations;
    const q = locationSearch.toLowerCase().trim();
    return availableLocations.filter(l => {
      const name = (l.name || '').toLowerCase();
      const type = (l.type || l.location_type || '').toLowerCase();
      const ageGroup = (l.ageGroupKey || l.age_group_key || '').toLowerCase();
      const team = (l.teamKey || l.team_key || '').toLowerCase();
      const desc = (l.description || '').toLowerCase();
      return name.includes(q) || type.includes(q) || ageGroup.includes(q) || team.includes(q) || desc.includes(q);
    });
  }, [availableLocations, locationSearch]);

  // Fetch eligible volunteers for assignment
  const fetchEligibleMembers = async (search = '') => {
    setLoadingMembers(true);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({ limit: '1000' });
      if (search.trim()) {
        params.set('query', search.trim());
        params.set('search', search.trim());
      }
      // In edit mode, allow the assigned volunteer to be retrieved
      if (isEditing) params.set('includeAssigned', 'true');

      const res = await fetch(buildApiUrl(`/api/admin/duty/events/${eventId}/eligible-team-members?${params.toString()}`), { headers });
      if (res.ok) {
        const data = await res.json();
        const list = data.items || data.members || [];
        setEligibleMembers(list);
        setExcludedMembers(data.excluded || []);
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

  // Switch dynamically to edit existing assignment
  const handleSwitchToEditAssignment = (assignment: any) => {
    setActiveEditingAssignment(assignment);
    const uid = assignment.userId || assignment.user_id;
    setSelectedUserIds(uid ? [uid] : []);
    setFormResponsibility(assignment.responsibilityKey || assignment.responsibility_key || 'General Response');
    setFormStatus(assignment.status || 'scheduled');
    setFormLocationId(assignment.assignedLocationId || assignment.assigned_location_id || assignment.locationId || '');
    setFormNote(assignment.note || '');

    const rawGroups = assignment.assignedAgeGroups || assignment.assigned_age_groups;
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

    if (assignment.startsAt || assignment.starts_at) {
      const s = new Date(assignment.startsAt || assignment.starts_at);
      if (!isNaN(s.getTime())) setFormStartsAt(toLocalISO(s));
    }
    if (assignment.endsAt || assignment.ends_at) {
      const e = new Date(assignment.endsAt || assignment.ends_at);
      if (!isNaN(e.getTime())) setFormEndsAt(toLocalISO(e));
    }
  };

  // Initialize modal state on open or change
  useEffect(() => {
    if (!isOpen) return;

    setFormError(null);
    setSuccessMessage(null);
    setMemberSearch('');
    setLocationSearch('');
    setActiveEditingAssignment(editingAssignment);

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
      if (preselectedVolunteer) {
        const uid = preselectedVolunteer.userId || preselectedVolunteer.id;
        setSelectedUserIds(uid ? [uid] : []);
        if (preselectedVolunteer.assignedAgeGroups && preselectedVolunteer.assignedAgeGroups.length > 0) {
          setFormAssignedAgeGroups(preselectedVolunteer.assignedAgeGroups);
        } else {
          setFormAssignedAgeGroups([]);
        }
      } else {
        setSelectedUserIds([]);
        setFormAssignedAgeGroups([]);
      }

      setFormResponsibility('General Response');
      setFormStatus('scheduled');
      setFormLocationId(prefilledLocationId || '');
      setFormNote('');

      const now = new Date();
      const future = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      setFormStartsAt(toLocalISO(now));
      setFormEndsAt(toLocalISO(future));

      // Age group preselection from location context if not already set
      if (prefilledLocation && prefilledLocation.ageGroupKey && prefilledLocation.ageGroupKey !== 'All Ages' && (!preselectedVolunteer || !preselectedVolunteer.assignedAgeGroups || preselectedVolunteer.assignedAgeGroups.length === 0)) {
        const rawKey = prefilledLocation.ageGroupKey.toLowerCase();
        let matched: string | null = null;
        if (rawKey.includes('13') || rawKey.includes('14') || rawKey.includes('teen')) matched = 'Ages 13–14';
        else if (rawKey.includes('10') || rawKey.includes('12')) matched = 'Ages 10–12';
        else if (rawKey.includes('7') || rawKey.includes('9')) matched = 'Ages 7–9';
        else if (rawKey.includes('4') || rawKey.includes('6')) matched = 'Ages 4–6';
        else if (rawKey.includes('2') || rawKey.includes('3') || rawKey.includes('1')) matched = 'Ages 2–3';

        if (matched) setFormAssignedAgeGroups([matched]);
      }
    }

    fetchEligibleMembers('');
  }, [isOpen, editingAssignment, prefilledLocationId, preselectedVolunteer]);

  // Debounced search
  useEffect(() => {
    if (!isOpen || isEditing) return;
    const timer = setTimeout(() => {
      fetchEligibleMembers(memberSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [memberSearch, isOpen, isEditing]);

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

      if (isEditing && activeEditingAssignment) {
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
          buildApiUrl(`/api/admin/duty/events/${eventId}/duty-assignments/${activeEditingAssignment.id || activeEditingAssignment.assignmentId}`),
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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
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
                {isEditing ? 'Edit Duty Assignment' : (prefilledLocation ? `Assign Volunteers to ${prefilledLocation.name}` : (preselectedVolunteer ? `Assign ${preselectedVolunteer.fullName} to Location` : 'Assign Team Member'))}
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
                <span>1. Select Volunteer(s)</span>
                <span className="text-zinc-400 text-[11px] font-normal lowercase">
                  ({selectedUserIds.length} selected)
                </span>
              </label>

              {!isEditing && !preselectedVolunteer && filteredMembers.length > 0 && (
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
                    {getInitials(activeEditingAssignment?.fullName || activeEditingAssignment?.user_name || activeEditingAssignment?.userName)}
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">
                      {activeEditingAssignment?.fullName || activeEditingAssignment?.user_name || activeEditingAssignment?.userName || 'Assigned Volunteer'}
                    </div>
                    <div className="text-zinc-400 text-[11px]">
                      {activeEditingAssignment?.email || activeEditingAssignment?.user_email || ''}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 rounded-full border border-amber-200/60 dark:border-amber-900/40">
                  Editing duty assignment
                </span>
              </div>
            ) : preselectedVolunteer ? (
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl flex items-center justify-between text-xs font-sans">
                <div className="flex items-center space-x-3">
                  <div className="w-7 h-7 rounded-full bg-[#C59B27]/20 text-[#C59B27] font-bold flex items-center justify-center text-[11px]">
                    {getInitials(preselectedVolunteer.fullName)}
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">
                      {preselectedVolunteer.fullName}
                    </div>
                    <div className="text-zinc-400 text-[11px]">
                      {preselectedVolunteer.email} {preselectedVolunteer.phone ? `· ${preselectedVolunteer.phone}` : ''}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full border border-emerald-200/60 dark:border-emerald-900/40">
                  Preselected volunteer
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
                    placeholder="Search volunteers by name, email, or phone…"
                    className="w-full pl-9 pr-3 py-2 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs text-zinc-800 dark:text-[#F0EBE3] placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white dark:focus:bg-[#262520]"
                  />
                  {loadingMembers && (
                    <RefreshCw className="w-3.5 h-3.5 absolute right-3 top-3.5 text-zinc-400 animate-spin" />
                  )}
                </div>

                <div className="border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl max-h-48 overflow-y-auto divide-y divide-[#EAE8E1] dark:divide-[#3A3835] bg-white dark:bg-[#1D1D1A]">
                  {loadingMembers && filteredMembers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-400">Loading active volunteers…</div>
                  ) : filteredMembers.length === 0 && (!memberSearch.trim() || excludedMembers.length === 0) ? (
                    <div className="p-4 text-center text-xs text-zinc-500 italic">
                      {memberSearch.trim() ? `No eligible volunteers matching "${memberSearch}".` : 'No active unassigned volunteers found.'}
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

                {/* Excluded Matching Volunteers (Section 2 & 4: Diagnostic status + direct Edit assignment action) */}
                {memberSearch.trim() && excludedMembers.length > 0 && (
                  <div className="space-y-1.5 pt-1.5">
                    <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                      <span>Matching volunteers with status ({excludedMembers.length})</span>
                    </div>
                    <div className="border border-amber-200/70 dark:border-amber-900/50 rounded-xl divide-y divide-amber-100 dark:divide-amber-900/30 bg-amber-50/30 dark:bg-amber-950/20 overflow-hidden">
                      {excludedMembers.map((m) => (
                        <div key={m.id} className="p-2.5 flex items-center justify-between text-xs font-sans gap-3">
                          <div className="min-w-0 space-y-0.5">
                            <div className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">
                              {m.full_name || m.name || 'Volunteer'}
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              {m.email} {m.phone ? `· ${m.phone}` : ''}
                            </div>
                            <div className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                              {m.message}
                            </div>
                          </div>
                          {m.reason === 'already_assigned' && m.existingAssignment && (
                            <button
                              type="button"
                              onClick={() => handleSwitchToEditAssignment(m.existingAssignment)}
                              className="px-3 py-1.5 text-xs font-semibold bg-[#C59B27] hover:bg-[#A47E1F] text-white rounded-lg transition-colors cursor-pointer shrink-0 shadow-2xs"
                            >
                              Edit assignment
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STEP 2: LOCATION */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-800 dark:text-[#F0EBE3] uppercase tracking-wider block">
                2. Duty Location / Area
              </label>
              <span className="text-[11px] text-zinc-400">
                {formLocationId ? 'Specific location chosen' : 'Central Command selected'}
              </span>
            </div>

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
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    placeholder="Search locations by name, type, or room scope…"
                    className="w-full pl-9 pr-3 py-2 bg-[#FAF9F5] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs text-zinc-800 dark:text-[#F0EBE3] placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                  />
                  {locationSearch && (
                    <button
                      type="button"
                      onClick={() => setLocationSearch('')}
                      className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl max-h-44 overflow-y-auto divide-y divide-[#EAE8E1] dark:divide-[#3A3835] bg-white dark:bg-[#1D1D1A]">
                  <div
                    onClick={() => setFormLocationId('')}
                    className={`p-2.5 flex items-center justify-between text-xs font-sans cursor-pointer transition-colors ${
                      formLocationId === ''
                        ? 'bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-semibold'
                        : 'hover:bg-zinc-50 dark:hover:bg-[#262520] text-zinc-700 dark:text-[#F0EBE3]'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Central Command / General Response</span>
                    </div>
                    {formLocationId === '' && <Check className="w-3.5 h-3.5 text-[#C59B27]" />}
                  </div>

                  {filteredLocations.length === 0 ? (
                    <div className="p-3 text-center text-xs text-zinc-500 italic">
                      No locations match "{locationSearch}"
                    </div>
                  ) : (
                    filteredLocations.map((loc) => {
                      const isSelected = formLocationId === loc.id;
                      return (
                        <div
                          key={loc.id}
                          onClick={() => {
                            setFormLocationId(loc.id);
                            // If age groups not yet set, suggest location scope
                            if (formAssignedAgeGroups.length === 0 && loc.ageGroupKey && loc.ageGroupKey !== 'All Ages') {
                              const rawKey = loc.ageGroupKey.toLowerCase();
                              let matched: string | null = null;
                              if (rawKey.includes('13') || rawKey.includes('14') || rawKey.includes('teen')) matched = 'Ages 13–14';
                              else if (rawKey.includes('10') || rawKey.includes('12')) matched = 'Ages 10–12';
                              else if (rawKey.includes('7') || rawKey.includes('9')) matched = 'Ages 7–9';
                              else if (rawKey.includes('4') || rawKey.includes('6')) matched = 'Ages 4–6';
                              else if (rawKey.includes('2') || rawKey.includes('3') || rawKey.includes('1')) matched = 'Ages 2–3';
                              if (matched) setFormAssignedAgeGroups([matched]);
                            }
                          }}
                          className={`p-2.5 flex items-center justify-between text-xs font-sans cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-semibold'
                              : 'hover:bg-zinc-50 dark:hover:bg-[#262520] text-zinc-700 dark:text-[#F0EBE3]'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-2">
                              <MapPin className={`w-3.5 h-3.5 ${isSelected ? 'text-[#C59B27]' : 'text-zinc-400'}`} />
                              <span className="font-medium text-zinc-900 dark:text-[#F0EBE3]">{loc.name}</span>
                              <span className="text-[10px] bg-zinc-100 dark:bg-[#262520] text-zinc-500 dark:text-zinc-400 px-1.5 py-0.2 rounded uppercase">
                                {loc.type || loc.location_type || 'room'}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400 pl-5">
                              {loc.ageGroupKey ? `Scope: ${loc.ageGroupKey}` : 'All ages'}
                              {loc.volunteerCapacity ? ` · Cap: ${loc.volunteerCapacity} duty staff` : ''}
                            </div>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#C59B27]" />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
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


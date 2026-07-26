import React, { useState, useRef, useEffect } from 'react';
import { 
  MoreVertical, 
  MapPin, 
  Edit3, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  PauseCircle, 
  PlayCircle, 
  Eye, 
  Smartphone,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

export interface EventDutyAssignmentItem {
  id: string;
  event_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_role?: string;
  responsibility_key: string;
  team_key?: string | null;
  assignment_level?: string;
  status: string;
  starts_at: string;
  ends_at: string;
  note?: string | null;
  ready_devices?: number;
  total_devices?: number;
  assigned_location_id?: string | null;
  assigned_location_name?: string | null;
  assigned_location_type?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface Props {
  assignment: EventDutyAssignmentItem;
  onEdit: (assignment: EventDutyAssignmentItem) => void;
  onDeleteRequest: (assignment: EventDutyAssignmentItem) => void;
  onUpdateStatus: (assignmentId: string, newStatus: string) => void;
  onViewDetails: (assignment: EventDutyAssignmentItem) => void;
}

export function formatRoleLabel(role?: string): string {
  if (!role) return 'Volunteer';
  const normalized = role.toLowerCase().replace(/_/g, ' ');
  switch (normalized) {
    case 'super admin':
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Administrator';
    case 'safeguarding lead':
    case 'safeguarding_lead':
      return 'Safeguarding Lead';
    case 'attendance lead':
    case 'attendance_lead':
      return 'Attendance Lead';
    case 'pickup lead':
    case 'pickup_lead':
      return 'Pickup Lead';
    case 'volunteer lead':
    case 'volunteer_lead':
      return 'Volunteer Lead';
    case 'location lead':
    case 'location_lead':
      return 'Location Lead';
    case 'care lead':
      return 'Care Lead';
    case 'security lead':
      return 'Security Lead';
    case 'first aid team':
      return 'First Aid Team';
    case 'gate check-in lead':
    case 'gate/check-in lead':
      return 'Gate & Check-in Lead';
    case 'room/group lead':
    case 'room operator':
      return 'Room Operator';
    case 'general response':
      return 'General Response';
    case 'volunteer':
      return 'Volunteer';
    default:
      return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
}

export function formatServingGroup(level?: string, teamKey?: string | null): string {
  if (level === 'primary') return 'Primary';
  if (level === 'backup' || level === 'secondary') return 'Backup';
  if (level === 'pre_primary') return 'Pre-primary';
  if (level === 'under_4') return 'Under 4';
  if (level === 'teens') return 'Teens';
  if (level === 'all') return 'All groups';
  if (teamKey) {
    return teamKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  return level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Primary';
}

export function formatShiftWindow(startsAt?: string, endsAt?: string): string {
  if (!startsAt) return 'Shift time not set';
  const startDate = new Date(startsAt);
  if (isNaN(startDate.getTime())) return 'Invalid Date';

  const startTimeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!endsAt) {
    return `${startTimeStr} (End time not set)`;
  }

  const endDate = new Date(endsAt);
  if (isNaN(endDate.getTime())) {
    return `${startTimeStr} (End time not set)`;
  }

  if (endDate.getTime() <= startDate.getTime()) {
    return `${startTimeStr} (End time not set)`;
  }

  const endTimeStr = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isSameDay = startDate.toDateString() === endDate.toDateString();

  return isSameDay ? `${startTimeStr} – ${endTimeStr}` : `${startTimeStr} – ${endTimeStr} (+1d)`;
}

export function formatStatusInfo(status?: string) {
  switch (status) {
    case 'on_duty':
    case 'active':
      return {
        label: 'Active',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
        dotColor: 'bg-emerald-500'
      };
    case 'scheduled':
    case 'available':
      return {
        label: 'Upcoming',
        className: 'bg-[#FAF9F5] text-amber-900 border-[#EAE8E1]',
        dotColor: 'bg-amber-500'
      };
    case 'temporarily_unavailable':
      return {
        label: 'Paused',
        className: 'bg-amber-50 text-amber-800 border-amber-200/80',
        dotColor: 'bg-amber-500'
      };
    case 'ended':
      return {
        label: 'Completed',
        className: 'bg-stone-100 text-stone-600 border-stone-200',
        dotColor: 'bg-stone-400'
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        className: 'bg-rose-50 text-rose-800 border-rose-200/80',
        dotColor: 'bg-rose-500'
      };
    default:
      return {
        label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Active',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
        dotColor: 'bg-emerald-500'
      };
  }
}

export function formatDeviceSummary(readyCount: number = 0, totalCount?: number) {
  if (readyCount > 0) {
    return {
      text: `${readyCount} device ready`,
      bulletColor: 'bg-emerald-500'
    };
  }
  if (totalCount !== undefined && totalCount === 0) {
    return {
      text: 'No device assigned',
      bulletColor: 'bg-stone-400'
    };
  }
  return {
    text: '1 device needs attention',
    bulletColor: 'bg-amber-500'
  };
}

export function getInitials(name?: string): string {
  if (!name) return 'ED';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

export default function EventTeamAssignmentCard({
  assignment,
  onEdit,
  onDeleteRequest,
  onUpdateStatus,
  onViewDetails
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const statusInfo = formatStatusInfo(assignment.status);
  const deviceSummary = formatDeviceSummary(assignment.ready_devices || 0, assignment.total_devices);
  const humanRole = formatRoleLabel(assignment.user_role);
  const servingGroup = formatServingGroup(assignment.assignment_level, assignment.team_key);
  const shiftText = formatShiftWindow(assignment.starts_at, assignment.ends_at);
  const initials = getInitials(assignment.user_name || assignment.user_email);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const locationLabel = assignment.assigned_location_name || 'Location not assigned';

  return (
    <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 md:p-6 hover:border-[#C59B27]/50 transition-all duration-200 flex flex-col justify-between shadow-xs hover:shadow-md relative group">
      <div>
        {/* HEADER */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-stone-100">
          <div className="flex items-start space-x-3 min-w-0">
            <div className="w-11 h-11 bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
              {initials}
            </div>
            <div className="min-w-0">
              <h3 className="font-serif text-[18px] font-medium leading-6 text-stone-950 truncate">
                {assignment.user_name || 'Administrator'}
              </h3>
              <p className="text-[12px] font-normal text-stone-500 truncate mt-0.5">
                {humanRole}
              </p>
              {assignment.user_email && (
                <p className="text-[11px] font-normal text-stone-400 font-mono truncate max-w-[210px] mt-0.5">
                  {assignment.user_email}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${statusInfo.className}`}>
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${statusInfo.dotColor}`} />
              {statusInfo.label}
            </span>

            {/* More Actions Dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                ref={buttonRef}
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label={`Actions for ${assignment.user_name || 'team member'}`}
                aria-expanded={menuOpen}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[#C59B27] cursor-pointer"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-9 w-48 bg-white border border-[#EAE8E1] rounded-2xl shadow-xl z-30 py-1.5 text-xs font-medium text-stone-800 animate-fade-in divide-y divide-stone-100">
                  <div className="py-1">
                    <button
                      onClick={() => { setMenuOpen(false); onViewDetails(assignment); }}
                      className="w-full text-left px-3.5 py-2 hover:bg-stone-50 flex items-center space-x-2 text-stone-700 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-stone-400" />
                      <span>View details</span>
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); onEdit(assignment); }}
                      className="w-full text-left px-3.5 py-2 hover:bg-stone-50 flex items-center space-x-2 text-stone-700 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-stone-400" />
                      <span>Edit assignment</span>
                    </button>
                  </div>

                  <div className="py-1">
                    {assignment.status !== 'on_duty' && (
                      <button
                        onClick={() => { setMenuOpen(false); onUpdateStatus(assignment.id, 'on_duty'); }}
                        className="w-full text-left px-3.5 py-2 hover:bg-emerald-50 flex items-center space-x-2 text-emerald-800 cursor-pointer"
                      >
                        <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Set On Duty</span>
                      </button>
                    )}
                    {assignment.status === 'on_duty' && (
                      <button
                        onClick={() => { setMenuOpen(false); onUpdateStatus(assignment.id, 'temporarily_unavailable'); }}
                        className="w-full text-left px-3.5 py-2 hover:bg-amber-50 flex items-center space-x-2 text-amber-800 cursor-pointer"
                      >
                        <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Go on Break</span>
                      </button>
                    )}
                    {assignment.status === 'temporarily_unavailable' && (
                      <button
                        onClick={() => { setMenuOpen(false); onUpdateStatus(assignment.id, 'on_duty'); }}
                        className="w-full text-left px-3.5 py-2 hover:bg-emerald-50 flex items-center space-x-2 text-emerald-800 cursor-pointer"
                      >
                        <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Return to Duty</span>
                      </button>
                    )}
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => { setMenuOpen(false); onDeleteRequest(assignment); }}
                      className="w-full text-left px-3.5 py-2 hover:bg-rose-50 flex items-center space-x-2 text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      <span>Remove assignment</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PRIMARY ASSIGNMENT */}
        <div className="pt-4 pb-2">
          <div className="text-[15px] font-medium text-stone-900 leading-tight">
            {assignment.responsibility_key || 'Room Operator'}
          </div>
          <div className="flex items-center text-[13px] font-normal text-stone-600 mt-1 space-x-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#C59B27] shrink-0" />
            <span className={assignment.assigned_location_name ? 'text-stone-800 font-medium' : 'text-stone-400 italic'}>
              {locationLabel}
            </span>
          </div>
        </div>

        {/* DETAIL GRID */}
        <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 py-3.5 my-3 border-y border-stone-100 bg-[#FAF9F5]/60 rounded-xl px-3.5">
          <div>
            <span className="block text-[12px] font-normal text-stone-500">Serving group</span>
            <span className="block text-[13px] font-medium text-stone-800 mt-0.5">{servingGroup}</span>
          </div>
          <div>
            <span className="block text-[12px] font-normal text-stone-500">Shift</span>
            <span className="block text-[13px] font-medium text-stone-800 mt-0.5">{shiftText}</span>
          </div>
          <div>
            <span className="block text-[12px] font-normal text-stone-500">Device</span>
            <span className="flex items-center text-[13px] font-medium text-stone-800 mt-0.5 space-x-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${deviceSummary.bulletColor}`} />
              <span className="truncate">{deviceSummary.text}</span>
            </span>
          </div>
          <div>
            <span className="block text-[12px] font-normal text-stone-500">Coverage</span>
            <span className="block text-[13px] font-medium text-stone-800 mt-0.5">
              {assignment.status === 'on_duty' ? 'On duty' : assignment.status === 'temporarily_unavailable' ? 'On break' : assignment.status === 'ended' ? 'Completed' : 'Scheduled'}
            </span>
          </div>
        </div>

        {assignment.note && (
          <p className="text-[12px] font-normal text-stone-600 italic bg-stone-50 p-2.5 rounded-xl border border-stone-100 mb-3">
            "{assignment.note}"
          </p>
        )}
      </div>

      {/* CARD FOOTER */}
      <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center space-x-1.5 text-[12px] font-normal text-stone-500">
          <ShieldCheck className="w-3.5 h-3.5 text-[#C59B27]" />
          <span>{assignment.ready_devices && assignment.ready_devices > 0 ? 'Verified ready' : 'Readiness pending'}</span>
        </div>

        <button
          onClick={() => onViewDetails(assignment)}
          className="px-3.5 py-1.5 bg-[#FAF9F5] hover:bg-[#C59B27]/10 text-stone-800 hover:text-[#C59B27] border border-[#EAE8E1] rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs"
        >
          View details
        </button>
      </div>
    </div>
  );
}

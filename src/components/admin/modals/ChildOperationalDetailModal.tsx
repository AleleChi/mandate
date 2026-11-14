import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  User,
  Phone,
  Mail,
  Calendar,
  HeartPulse,
  ShieldCheck,
  Clock,
  QrCode,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Briefcase,
  Users
} from 'lucide-react';
import { api, extractApiError } from '../../../services/api';
import { resolveMediaUrl } from '../../../utils/mediaUrl';
import { normalizeVolunteerAgeGroup } from '../../../utils/ageGroup';

export interface ChildOperationalDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  childId: string;
  applicationId?: string | null;
  childSummary?: any;
  parentProfile?: any;
  activeEvent?: any;
}

export const ChildOperationalDetailModal: React.FC<ChildOperationalDetailModalProps> = ({
  isOpen,
  onClose,
  childId,
  applicationId,
  childSummary,
  parentProfile,
  activeEvent
}) => {
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const [photoError, setPhotoError] = useState(false);

  // Keyboard accessibility: Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load detailed child application records when modal opens or childId changes
  useEffect(() => {
    if (!isOpen || !childId) return;

    let isMounted = true;
    setPhotoError(false);
    setDetails(null);
    setLoadingDetails(true);

    const loadData = async () => {
      try {
        const targetLookupId = applicationId || childId;
        const res = await api.admin.getApplicationDetails(targetLookupId);
        if (isMounted && res.success && res.application) {
          setDetails(res.application);
        }
      } catch (err) {
        // Silently fallback to childSummary & parentProfile
        console.warn('[ChildOperationalDetailModal] Could not fetch detailed application, using summary fallback:', err);
      } finally {
        if (isMounted) {
          setLoadingDetails(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, childId, applicationId, activeEvent?.id]);

  if (!isOpen) return null;

  // Resolve merged fields with preference for detailed API response then summary props
  const fullName = details?.child?.fullName || childSummary?.fullName || 'Child Profile';
  const gender = details?.child?.gender || childSummary?.gender || null;
  
  // Date of Birth & Age resolution
  const rawDob = details?.dateOfBirth || details?.child?.dob || childSummary?.dateOfBirth || childSummary?.dob || null;
  const formattedDob = rawDob && !isNaN(new Date(rawDob).getTime())
    ? new Date(rawDob).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const calculatedAge = details?.child?.age ?? childSummary?.age ?? childSummary?.calculatedAge ?? null;
  const rawAgeGroup = details?.child?.ageGroup || childSummary?.ageGroup || null;
  const canonicalAgeGroup = rawAgeGroup ? normalizeVolunteerAgeGroup(rawAgeGroup) || rawAgeGroup : null;

  // Photo resolution
  const rawPhotoUrl = details?.child?.photoUrl || childSummary?.photoUrl || childSummary?.photo_url || null;
  const resolvedPhotoUrl = rawPhotoUrl ? resolveMediaUrl(rawPhotoUrl) : null;

  // Parent resolution
  const parentName = details?.parent?.fullName || parentProfile?.fullName || 'Not provided';
  const parentPhone = details?.parent?.phone || parentProfile?.phone || parentProfile?.phoneNumber || null;
  const parentEmail = details?.parent?.email || parentProfile?.email || null;
  const parentIsWorker = details?.parent?.isWorker ?? parentProfile?.isKoinoniaWorker ?? false;
  const parentDepartment = details?.parent?.department || parentProfile?.department || null;

  // Event & Status resolution
  const currentEventName = activeEvent?.name || 'Koinonia General Assembly 2026';
  const rawStatus = details?.status || childSummary?.entryStatus || 'not_registered';
  const hasEventEntry = details ? details.hasEntry !== false && rawStatus !== 'not_registered' : Boolean(childSummary?.entryStatus && childSummary?.entryStatus !== 'not_registered');

  // Status badge styling & text
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pass_ready':
        return { label: 'Pass Ready', bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' };
      case 'selected':
        return { label: 'Selected for Event', bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' };
      case 'checked_in':
      case 'inside':
        return { label: 'Checked In', bg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800' };
      case 'picked_up':
      case 'checked_out':
        return { label: 'Picked Up', bg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' };
      case 'under_review':
      case 'review_reopened':
        return { label: 'Awaiting Review', bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' };
      case 'waiting_list':
        return { label: 'Waiting List', bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' };
      case 'withdrawn':
        return { label: 'Withdrawn', bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800' };
      default:
        return { label: 'No Entry for this Event', bg: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700' };
    }
  };

  const statusBadge = getStatusBadge(rawStatus);

  // Pass information (IMMUTABLE & READ ONLY)
  const passReference = details?.passReference || childSummary?.passReference || null;
  const passStatus = details?.passStatus || (passReference ? 'active' : null);

  // Attendance timestamps
  const checkedInAt = details?.checkedInAt || childSummary?.checkedInAt || null;
  const pickedUpAt = details?.pickedUpAt || childSummary?.pickedUpAt || null;

  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return null;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formattedCheckedIn = formatTimestamp(checkedInAt);
  const formattedPickedUp = formatTimestamp(pickedUpAt);

  // Safety & Medical notes
  const hasMedical = details?.hasMedicalNotes || childSummary?.hasMedicalNotes;
  const medicalNotes = details?.medicalNotes || childSummary?.medicalNotes || null;
  const needsSupport = details?.needsExtraSupport || childSummary?.needsExtraSupport;
  const supportNotes = details?.supportNotes || childSummary?.supportNotes || null;

  // Pickups list
  const pickupPeople: any[] = details?.pickupPeople || [];

  const modalContent = (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-2xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="child-operational-modal-title"
    >
      {/* Click outside backdrop */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        className="relative bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-neutral-900 dark:text-neutral-100 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#EAE8E1] dark:border-[#2A2926] flex items-center justify-between gap-3 bg-white dark:bg-[#1D1D1A] shrink-0">
          <div className="min-w-0">
            <h2 id="child-operational-modal-title" className="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 truncate">
              Child Operational Details
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate flex items-center gap-1.5">
              <span>Event Context:</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{currentEventName}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Close details (Esc)"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-left">
          {/* Identity Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-neutral-50/60 dark:bg-[#252420]/50 p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800">
            {resolvedPhotoUrl && !photoError ? (
              <img
                src={resolvedPhotoUrl}
                alt={fullName}
                onError={() => setPhotoError(true)}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shrink-0 border-2 border-white dark:border-[#1D1D1A] shadow-sm"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 flex items-center justify-center font-bold text-xl shrink-0 border-2 border-white dark:border-[#1D1D1A] shadow-sm">
                {fullName.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || <User className="w-8 h-8" />}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                  {fullName}
                </h3>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge.bg}`}>
                  {statusBadge.label}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                <div>
                  <span className="text-neutral-400 block text-[11px]">Age</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {calculatedAge !== null && calculatedAge !== undefined ? `${calculatedAge} yrs` : 'Not calculated'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[11px]">Age Group</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {canonicalAgeGroup ? `Ages ${canonicalAgeGroup}` : 'Unassigned'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[11px]">Gender</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200 capitalize">
                    {gender || 'Not specified'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[11px]">Date of Birth</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {formattedDob || 'Not provided'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Operational Pass Section (FROZEN & IMMUTABLE) */}
          <div className="bg-white dark:bg-[#1D1D1A] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2.5 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-[#C59B27]" />
                Event Pass & Accreditation
              </span>
              <span className="text-[11px] text-neutral-400">Read-Only</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-neutral-500 dark:text-neutral-400 block mb-1">Official Pass Code:</span>
                {passReference ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded bg-[#C59B27]/10 text-[#C59B27] dark:text-[#E5B83A] font-mono font-bold text-xs tracking-wider border border-[#C59B27]/30">
                    {passReference}
                  </span>
                ) : (
                  <span className="text-neutral-400 italic">Pass code not issued yet</span>
                )}
              </div>

              <div>
                <span className="text-neutral-500 dark:text-neutral-400 block mb-1">Accreditation Status:</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  {passStatus === 'active' || (passReference && !details?.passStatus) ? (
                    <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Active & Operational
                    </span>
                  ) : passStatus === 'revoked' ? (
                    <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Revoked
                    </span>
                  ) : (
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {hasEventEntry ? 'Pending Pass Generation' : 'No Entry for Event'}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Attendance State Machine Logs */}
          <div className="bg-white dark:bg-[#1D1D1A] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-3 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-sky-500" />
              Attendance & Handover Status
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-neutral-50 dark:bg-[#252420] p-3 rounded-lg border border-neutral-200/60 dark:border-neutral-800">
                <span className="text-neutral-400 block text-[11px] mb-1">Check-in at Entrance</span>
                {formattedCheckedIn ? (
                  <div className="space-y-0.5">
                    <span className="text-sky-700 dark:text-sky-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Checked In
                    </span>
                    <p className="text-neutral-600 dark:text-neutral-300 font-mono text-[11px]">{formattedCheckedIn}</p>
                  </div>
                ) : (
                  <span className="text-neutral-500 dark:text-neutral-400">Not checked in</span>
                )}
              </div>

              <div className="bg-neutral-50 dark:bg-[#252420] p-3 rounded-lg border border-neutral-200/60 dark:border-neutral-800">
                <span className="text-neutral-400 block text-[11px] mb-1">Pickup & Handover</span>
                {formattedPickedUp ? (
                  <div className="space-y-0.5">
                    <span className="text-purple-700 dark:text-purple-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Released / Picked Up
                    </span>
                    <p className="text-neutral-600 dark:text-neutral-300 font-mono text-[11px]">{formattedPickedUp}</p>
                  </div>
                ) : (
                  <span className="text-neutral-500 dark:text-neutral-400">Not picked up</span>
                )}
              </div>
            </div>
          </div>

          {/* Parent / Guardian Information */}
          <div className="bg-white dark:bg-[#1D1D1A] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-3 flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-emerald-600" />
              Parent / Guardian Context
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-neutral-400 block text-[11px]">Primary Parent</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200 text-sm">
                  {parentName}
                </span>
                {parentIsWorker && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium text-[10px] border border-emerald-200 dark:border-emerald-800">
                    Koinonia Worker{parentDepartment ? ` · ${parentDepartment}` : ''}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {parentPhone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <a
                      href={`tel:${parentPhone}`}
                      className="text-neutral-700 dark:text-neutral-200 hover:text-[#C59B27] font-medium transition-colors"
                      title="Call primary parent"
                    >
                      {parentPhone}
                    </a>
                  </div>
                )}
                {parentEmail && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <a
                      href={`mailto:${parentEmail}`}
                      className="text-neutral-700 dark:text-neutral-200 hover:text-[#C59B27] truncate transition-colors"
                      title="Email primary parent"
                    >
                      {parentEmail}
                    </a>
                  </div>
                )}
                {!parentPhone && !parentEmail && (
                  <span className="text-neutral-400">No contact details registered</span>
                )}
              </div>
            </div>
          </div>

          {/* Child Safety & Medical Information */}
          <div className="bg-white dark:bg-[#1D1D1A] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-3 flex items-center gap-1.5">
              <HeartPulse className="w-4 h-4 text-rose-500" />
              Safety & Operational Notes
            </span>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                  Medical Notes & Allergies:
                </span>
                {medicalNotes || hasMedical ? (
                  <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 whitespace-pre-wrap leading-relaxed">
                    {medicalNotes || 'Medical condition reported during registration.'}
                  </div>
                ) : (
                  <span className="text-neutral-400">None reported</span>
                )}
              </div>

              <div>
                <span className="font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                  Special Support & Accommodations:
                </span>
                {supportNotes || needsSupport ? (
                  <div className="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/40 text-sky-900 dark:text-sky-200 whitespace-pre-wrap leading-relaxed">
                    {supportNotes || 'Additional support requested during registration.'}
                  </div>
                ) : (
                  <span className="text-neutral-400">No additional support requested</span>
                )}
              </div>
            </div>
          </div>

          {/* Authorized Pickup People */}
          <div className="bg-white dark:bg-[#1D1D1A] border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              Authorised Pickup Individuals ({pickupPeople.length})
            </span>

            {pickupPeople.length > 0 ? (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {pickupPeople.map((person: any, idx: number) => {
                  const pPhoto = person.photoUrl || person.photo_url ? resolveMediaUrl(person.photoUrl || person.photo_url) : null;
                  return (
                    <div key={person.id || idx} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {pPhoto ? (
                          <img
                            src={pPhoto}
                            alt={person.fullName || person.full_name}
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-neutral-200 dark:border-neutral-700"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex items-center justify-center font-bold text-xs shrink-0">
                            {(person.fullName || person.full_name || 'P')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                            {person.fullName || person.full_name}
                          </p>
                          <p className="text-[11px] text-neutral-400 truncate">
                            {person.relationship || person.relationship_to_child || 'Authorised Adult'}
                            {(person.phone || person.phone_number) ? ` · ${person.phone || person.phone_number}` : ''}
                          </p>
                        </div>
                      </div>

                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
                        Authorised
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-neutral-400 py-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-neutral-400" />
                <span>Primary parent is default authorized pickup adult. No secondary persons registered.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#EAE8E1] dark:border-[#2A2926] flex items-center justify-between gap-3 bg-neutral-50/70 dark:bg-[#252420]/70 shrink-0">
          <div className="text-[11px] text-neutral-400 truncate">
            {loadingDetails ? 'Syncing detailed records...' : 'Viewing in-place operational record'}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer focus:outline-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

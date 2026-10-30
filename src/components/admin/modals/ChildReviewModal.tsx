import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Check, 
  AlertCircle, 
  AlertTriangle, 
  Phone, 
  Mail, 
  MessageSquare, 
  User, 
  HeartPulse, 
  ShieldCheck, 
  Calendar, 
  Loader2, 
  ExternalLink,
  RotateCcw,
  Clock,
  ChevronRight
} from 'lucide-react';
import { api, extractApiError } from '../../../services/api';
import { useNotification } from '../../../context/NotificationContext';
import { Button } from '../../common/Button';
import { KoinoniaInlineLoader } from '../../common/KoinoniaInlineLoader';

export interface ChildReviewModalProps {
  applicationId: string;
  childId?: string;
  childName?: string;
  activeEvent?: any;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated?: (newStatus: string, newApplicationId?: string, updatedApplication?: any) => void;
  onNavigateToChild?: (childId: string) => void;
  adminUser?: any;
  isSuperAdmin?: boolean;
}

export const ChildReviewModal: React.FC<ChildReviewModalProps> = ({
  applicationId,
  childId,
  childName,
  activeEvent,
  isOpen,
  onClose,
  onStatusUpdated,
  onNavigateToChild,
  adminUser,
  isSuperAdmin = false
}) => {
  const { showError, showSuccess } = useNotification();
  const [isDomReady, setIsDomReady] = useState(false);

  // Data states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'return' | 'waitlist' | 'not_selected' | null>(null);
  const [app, setApp] = useState<any>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form & action inputs
  const [noteToTeam, setNoteToTeam] = useState('');
  const [sendNotification, setSendNotification] = useState(true);
  const [ageVerified, setAgeVerified] = useState(false);

  // Inline action prompt steps
  const [activeInlineAction, setActiveInlineAction] = useState<'return' | 'waitlist' | 'not_selected' | null>(null);
  const [actionReason, setActionReason] = useState('');

  useEffect(() => {
    setIsDomReady(true);
  }, []);

  // Fetch application details when opened
  const fetchDetails = async () => {
    const targetId = applicationId || childId;
    if (!targetId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.admin.getApplicationDetails(targetId);
      if (res.success && res.application) {
        setApp(res.application);
        setNoteToTeam(res.application.noteToTeam || '');
        setAgeVerified(!res.application.child?.needsAgeReview);
      } else {
        setFetchError(res.error || 'Could not locate child registration details.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      setFetchError(parsed.message || 'An error occurred while loading application details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveInlineAction(null);
      setActionReason('');
      fetchDetails();
    }
  }, [isOpen, applicationId, childId]);

  // Handle ESC key to close modal if not saving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, onClose]);

  if (!isOpen || !isDomReady) return null;

  // Actions
  const handleApprove = async () => {
    if (!app) return;
    if (app.child?.needsAgeReview && !ageVerified) {
      showError('Age Verification Required', 'Please confirm age review verification for this child before approving.');
      return;
    }

    setSaving(true);
    setActionType('approve');
    try {
      const targetId = app.id || applicationId || childId;
      const res = await api.admin.reviewApplication(targetId, {
        status: 'selected',
        noteToTeam: noteToTeam || 'Approved during parent workflow review.',
        sendNotification,
        eventId: activeEvent?.id || app.eventId
      });

      if (res.success) {
        const finalStatus = res.status || (res.pass ? 'pass_ready' : 'selected');
        const finalAppId = res.applicationId || res.pass?.child_event_entry_id || res.application?.id || targetId;
        showSuccess(
          'Application Approved', 
          `${app.child?.fullName || childName || 'Child'} has been approved for ${activeEvent?.title || activeEvent?.name || 'the event'}.`
        );
        if (onStatusUpdated) {
          onStatusUpdated(finalStatus, finalAppId, res.application || app);
        }
        onClose();
      } else {
        showError('Approval Failed', res.error || 'Could not approve application.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Approval Failed', parsed.message || 'Could not approve application.');
    } finally {
      setSaving(false);
      setActionType(null);
    }
  };

  const handleConfirmReturn = async () => {
    if (!app) return;
    if (!actionReason.trim()) {
      showError('Reason Required', 'Please provide a clear reason for returning this application to the parent.');
      return;
    }

    setSaving(true);
    setActionType('return');
    try {
      const targetId = app.id || applicationId || childId;
      let returnSucceeded = false;

      // 1. Primary: return-to-draft endpoint
      try {
        const res = await api.admin.returnApplicationToDraft(targetId, {
          reason: actionReason,
          customMessage: noteToTeam || undefined,
          notifyEmail: sendNotification,
          notifyWhatsApp: sendNotification
        });
        if (res.success) {
          returnSucceeded = true;
        }
      } catch (draftErr: any) {
        // Fallback to reopen-review if return-to-draft endpoint is unavailable
      }

      // 2. Fallback: reopen-review endpoint
      if (!returnSucceeded) {
        const reopenRes = await api.admin.reopenApplicationReview(targetId, actionReason);
        if (reopenRes.success) {
          returnSucceeded = true;
        } else {
          showError('Return Failed', reopenRes.error || 'Could not return application.');
          return;
        }
      }

      showSuccess(
        'Application Returned', 
        `The application for ${app.child?.fullName || childName || 'the child'} has been returned to the parent for corrections.`
      );
      if (onStatusUpdated) {
        onStatusUpdated('draft', targetId, { ...app, status: 'draft' });
      }
      onClose();
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Return Failed', parsed.message || 'Could not return application.');
    } finally {
      setSaving(false);
      setActionType(null);
    }
  };

  const handleConfirmWaitlist = async () => {
    if (!app) return;
    setSaving(true);
    setActionType('waitlist');
    try {
      const targetId = app.id || applicationId || childId;
      const res = await api.admin.reviewApplication(targetId, {
        status: 'waiting_list',
        noteToTeam: actionReason || noteToTeam || 'Moved to waiting list.',
        sendNotification,
        eventId: activeEvent?.id || app.eventId
      });

      if (res.success) {
        showSuccess(
          'Moved to Waiting List',
          `${app.child?.fullName || childName || 'Child'} was placed on the waiting list.`
        );
        if (onStatusUpdated) {
          onStatusUpdated('waiting_list', targetId, res.application || app);
        }
        onClose();
      } else {
        showError('Waitlist Failed', res.error || 'Could not move child to waiting list.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Waitlist Failed', parsed.message || 'Could not waitlist application.');
    } finally {
      setSaving(false);
      setActionType(null);
    }
  };

  const handleConfirmNotSelected = async () => {
    if (!app) return;
    setSaving(true);
    setActionType('not_selected');
    try {
      const targetId = app.id || applicationId || childId;
      const res = await api.admin.reviewApplication(targetId, {
        status: 'not_selected',
        noteToTeam: actionReason || noteToTeam || 'Marked as not selected.',
        sendNotification,
        eventId: activeEvent?.id || app.eventId
      });

      if (res.success) {
        showSuccess(
          'Marked Not Selected',
          `${app.child?.fullName || childName || 'Child'} was marked as not selected.`
        );
        if (onStatusUpdated) {
          onStatusUpdated('not_selected', targetId, res.application || app);
        }
        onClose();
      } else {
        showError('Update Failed', res.error || 'Could not mark application as not selected.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Update Failed', parsed.message || 'Could not mark application as not selected.');
    } finally {
      setSaving(false);
      setActionType(null);
    }
  };

  // Status badge styling helper
  const renderStatusBadge = (status: string) => {
    let label = 'Awaiting Review';
    let cls = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50';

    if (status === 'selected' || status === 'pass_ready') {
      label = status === 'pass_ready' ? 'Pass Ready' : 'Selected';
      cls = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50';
    } else if (status === 'waiting_list') {
      label = 'Waiting List';
      cls = 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50';
    } else if (status === 'not_selected') {
      label = 'Not Selected';
      cls = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700';
    } else if (status === 'checked_in' || status === 'inside') {
      label = 'Checked In';
      cls = 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-900/50';
    } else if (status === 'picked_up' || status === 'checked_out') {
      label = 'Picked Up';
      cls = 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-900/50';
    } else if (status === 'withdrawn') {
      label = 'Withdrawn';
      cls = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/50';
    }

    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
        {label}
      </span>
    );
  };

  const childRecord = app?.child;
  const parentRecord = app?.parent;
  const pickupPeople: any[] = app?.pickupPeople || [];

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div 
        className="fixed inset-0 -z-10" 
        onClick={() => { if (!saving) onClose(); }} 
      />

      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-between gap-3 bg-white dark:bg-[#21211E] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base text-[#18181B] dark:text-[#F0EBE3] truncate">
                  Review Application: {childRecord?.fullName || childName || 'Child Details'}
                </h3>
                {app?.status && renderStatusBadge(app.status)}
              </div>
              <p className="text-xs text-zinc-500 dark:text-[#8E877D] mt-0.5">
                Event: <span className="font-medium text-zinc-800 dark:text-[#F0EBE3]">{activeEvent?.title || activeEvent?.name || 'Current Event'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {childRecord?.id && onNavigateToChild && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToChild(childRecord.id);
                }}
                className="px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-[#B8B0A5] hover:text-[#C59B27] dark:hover:text-[#DEB23F] bg-zinc-100 dark:bg-[#262520] hover:bg-zinc-200 dark:hover:bg-[#302E29] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                title="Open standalone child profile"
              >
                <span>Full profile</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-[#F0EBE3] hover:bg-zinc-100 dark:hover:bg-[#262520] transition-colors cursor-pointer disabled:opacity-50"
              aria-label="Close review modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL CONTENT BODY */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6 text-left">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <KoinoniaInlineLoader />
              <p className="text-xs text-zinc-500 dark:text-[#7A7570]">Loading application review details...</p>
            </div>
          ) : fetchError ? (
            <div className="p-4 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="text-xs font-semibold">{fetchError}</p>
              </div>
              <Button onClick={fetchDetails} variant="secondary" className="text-xs px-3 py-1.5">
                Retry loading
              </Button>
            </div>
          ) : !app ? (
            <div className="text-center py-12 text-zinc-400 text-xs">No registration data available.</div>
          ) : (
            <>
              {/* AGE REVIEW ALERT BANNER */}
              {childRecord?.needsAgeReview && (
                <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200 flex-1">
                    <p className="font-semibold">Age verification required</p>
                    <p className="text-amber-700 dark:text-amber-300/90 text-[11px] leading-relaxed">
                      This child was flagged for age-group review based on their date of birth ({childRecord?.dob || 'unspecified'}). 
                      Please verify that they qualify for the designated room cohort before approval.
                    </p>
                    <label className="flex items-center gap-2 pt-1.5 cursor-pointer font-medium text-xs select-none">
                      <input
                        type="checkbox"
                        checked={ageVerified}
                        onChange={(e) => setAgeVerified(e.target.checked)}
                        className="rounded border-amber-400 text-[#C59B27] focus:ring-[#C59B27] w-4 h-4"
                      />
                      <span>I confirm I have verified this child's age eligibility</span>
                    </label>
                  </div>
                </div>
              )}

              {/* SECTION 1: CHILD IDENTITY & BASIC INFO */}
              <div className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between pb-2.5 border-b border-[#EAE8E1]/70 dark:border-[#302E29]">
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3] uppercase tracking-wider flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-[#C59B27]" />
                    <span>Child Identity</span>
                  </h4>
                  <span className="text-[11px] text-zinc-400">ID: {childRecord?.id}</span>
                </div>

                <div className="flex flex-col sm:flex-row items-start gap-4">
                  {childRecord?.photoUrl ? (
                    <img 
                      src={childRecord.photoUrl} 
                      alt={childRecord.fullName} 
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-xl object-cover border border-[#EAE8E1] dark:border-[#3A3835] shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-zinc-100 dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] flex items-center justify-center text-zinc-500 font-bold text-sm shrink-0">
                      {childRecord?.fullName ? childRecord.fullName.substring(0, 2).toUpperCase() : 'CH'}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs flex-1">
                    <div>
                      <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">Full Name</span>
                      <span className="font-semibold text-zinc-900 dark:text-[#F0EBE3] block mt-0.5">{childRecord?.fullName || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">Gender</span>
                      <span className="text-zinc-800 dark:text-[#B8B0A5] block mt-0.5">{childRecord?.gender || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">Date of Birth</span>
                      <span className="text-zinc-800 dark:text-[#B8B0A5] block mt-0.5">
                        {childRecord?.dob ? new Date(childRecord.dob).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">Age & Cohort</span>
                      <span className="font-semibold text-zinc-800 dark:text-[#F0EBE3] block mt-0.5">
                        {childRecord?.calculatedAge !== undefined ? `${childRecord.calculatedAge} yrs` : '—'} {childRecord?.ageGroup ? `(${childRecord.ageGroup})` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">School Name</span>
                      <span className="text-zinc-800 dark:text-[#B8B0A5] block mt-0.5">{app?.schoolName || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">School Class</span>
                      <span className="text-zinc-800 dark:text-[#B8B0A5] block mt-0.5">{app?.schoolClass || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">Previous Program</span>
                      <span className="text-zinc-800 dark:text-[#B8B0A5] block mt-0.5">{app?.previousProgramme || 'No'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">Submitted On</span>
                      <span className="text-zinc-800 dark:text-[#B8B0A5] block mt-0.5">
                        {app?.submittedAt ? new Date(app.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Draft'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: PARENT / GUARDIAN INFORMATION */}
              <div className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-[#EAE8E1]/70 dark:border-[#302E29]">
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3] uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#C59B27]" />
                    <span>Parent / Guardian</span>
                  </h4>
                  {parentRecord?.isWorker && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#FAF4E6] dark:bg-[#2A2415] text-[#93721C] dark:text-[#DEB23F] border border-[#E4D5AA] dark:border-[#4E3E1A]">
                      Koinonia Worker {parentRecord.department ? `(${parentRecord.department})` : ''}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">Parent Name</span>
                    <span className="font-semibold text-zinc-900 dark:text-[#F0EBE3] block mt-0.5">{parentRecord?.fullName || '—'}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">Phone</span>
                    {parentRecord?.phone ? (
                      <a href={`tel:${parentRecord.phone}`} className="inline-flex items-center gap-1 text-[#C59B27] hover:underline font-medium mt-0.5">
                        <Phone className="w-3 h-3" />
                        <span>{parentRecord.phone}</span>
                      </a>
                    ) : (
                      <span className="text-zinc-400 mt-0.5 block">—</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">Email</span>
                    {parentRecord?.email ? (
                      <a href={`mailto:${parentRecord.email}`} className="inline-flex items-center gap-1 text-[#C59B27] hover:underline font-medium mt-0.5 truncate">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate">{parentRecord.email}</span>
                      </a>
                    ) : (
                      <span className="text-zinc-400 mt-0.5 block">—</span>
                    )}
                  </div>

                  <div className="sm:col-span-3">
                    <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block uppercase tracking-wider">Residential Address</span>
                    <span className="text-zinc-800 dark:text-[#B8B0A5] block mt-0.5">
                      {[parentRecord?.address, parentRecord?.city, parentRecord?.stateRegion, parentRecord?.country].filter(Boolean).join(', ') || 'No address provided'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 3: MEDICAL & SPECIAL CARE */}
              <div className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-[#EAE8E1]/70 dark:border-[#302E29]">
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3] uppercase tracking-wider flex items-center gap-2">
                    <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
                    <span>Medical, Care & Support</span>
                  </h4>
                  {app?.hasMedicalNotes || app?.needsExtraSupport ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40">
                      Attention Required
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40">
                      No known medical conditions
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-zinc-50 dark:bg-[#262520] rounded-lg border border-zinc-200/70 dark:border-[#3A3835]">
                    <span className="text-[10px] font-semibold text-zinc-500 dark:text-[#7A7570] block uppercase tracking-wider">
                      Allergies & Medical Notes
                    </span>
                    <p className="text-zinc-800 dark:text-[#F0EBE3] mt-1 text-xs leading-relaxed">
                      {app?.medicalNotes ? app.medicalNotes : 'None reported by parent.'}
                    </p>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-[#262520] rounded-lg border border-zinc-200/70 dark:border-[#3A3835]">
                    <span className="text-[10px] font-semibold text-zinc-500 dark:text-[#7A7570] block uppercase tracking-wider">
                      Special Needs / Extra Support
                    </span>
                    <p className="text-zinc-800 dark:text-[#F0EBE3] mt-1 text-xs leading-relaxed">
                      {app?.supportNotes ? app.supportNotes : 'No special physical or educational support requested.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 4: AUTHORIZED PICKUP PEOPLE */}
              <div className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-[#EAE8E1]/70 dark:border-[#302E29]">
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3] uppercase tracking-wider flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-[#C59B27]" />
                    <span>Authorized Pickup Contacts ({pickupPeople.length})</span>
                  </h4>
                </div>

                {pickupPeople.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No designated pickup person specified beyond the registered parent.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pickupPeople.map((person, idx) => (
                      <div key={person.id || idx} className="p-3 bg-zinc-50 dark:bg-[#262520] rounded-lg border border-zinc-200/70 dark:border-[#3A3835] flex items-start gap-3">
                        {person.photoUrl ? (
                          <img 
                            src={person.photoUrl} 
                            alt={person.fullName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-lg object-cover border border-[#EAE8E1] dark:border-[#3A3835] shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#3A3835] flex items-center justify-center text-xs font-semibold text-zinc-500 shrink-0">
                            {person.fullName ? person.fullName.substring(0, 2).toUpperCase() : 'PU'}
                          </div>
                        )}
                        <div className="min-w-0 text-xs flex-1">
                          <p className="font-semibold text-zinc-900 dark:text-[#F0EBE3] truncate">{person.fullName}</p>
                          <p className="text-[11px] text-zinc-500 dark:text-[#8E877D] mt-0.5">
                            Relationship: <span className="font-medium text-zinc-700 dark:text-zinc-300">{person.relationship || 'Authorized'}</span>
                          </p>
                          {person.phone && (
                            <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1 text-[#C59B27] text-[11px] hover:underline mt-1">
                              <Phone className="w-2.5 h-2.5" />
                              <span>{person.phone}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 5: INTERNAL DECISION NOTE & NOTIFICATION */}
              <div className="bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3] uppercase tracking-wider">
                  Review Notes & Notification
                </h4>

                <div className="space-y-2">
                  <textarea
                    value={noteToTeam}
                    onChange={(e) => setNoteToTeam(e.target.value)}
                    placeholder="Add an internal note or rationale regarding this application decision..."
                    rows={2}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#EAE8E1] dark:border-[#302E29] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6]/50 dark:bg-[#1D1D1A] text-zinc-800 dark:text-[#F0EBE3] resize-none"
                  />
                  <div className="flex items-center justify-between text-xs pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-700 dark:text-[#B8B0A5]">
                      <input
                        type="checkbox"
                        checked={sendNotification}
                        onChange={(e) => setSendNotification(e.target.checked)}
                        className="rounded border-zinc-300 text-[#C59B27] focus:ring-[#C59B27] w-3.5 h-3.5"
                      />
                      <span>Notify parent via email and WhatsApp upon review decision</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* INLINE ACTION STEP: RETURN / WAITLIST / NOT SELECTED PROMPT */}
              {activeInlineAction && (
                <div className="p-4 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 rounded-xl space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <h5 className="font-semibold text-xs">
                        {activeInlineAction === 'return' ? 'Return Application to Parent for Correction' :
                         activeInlineAction === 'waitlist' ? 'Move Child to Waiting List' :
                         'Mark Child as Not Selected'}
                      </h5>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveInlineAction(null)}
                      className="text-amber-700 hover:text-amber-900 dark:text-amber-300 text-xs cursor-pointer font-medium"
                    >
                      Cancel action
                    </button>
                  </div>

                  <p className="text-xs text-amber-800 dark:text-amber-300/90">
                    {activeInlineAction === 'return' 
                      ? 'Please specify what needs correction (e.g. child photo is unclear, date of birth verification, medical notes clarification). The parent will receive an update to review their submission.'
                      : activeInlineAction === 'waitlist'
                      ? 'The child will be placed on the event waiting list. A seat can be assigned later if capacity permits.'
                      : 'Please specify the reason for marking this registration as not selected for this event cohort.'}
                  </p>

                  <textarea
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder={
                      activeInlineAction === 'return' 
                        ? 'e.g., Please upload a clearer portrait photo of the child and confirm DOB.'
                        : 'Reason or internal note...'
                    }
                    rows={2}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-amber-300 dark:border-amber-800 focus:outline-none focus:border-[#C59B27] bg-white dark:bg-[#1D1D1A] text-zinc-900 dark:text-[#F0EBE3] resize-none"
                    autoFocus
                  />

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setActiveInlineAction(null)}
                      disabled={saving}
                      className="text-xs px-3 py-1.5"
                    >
                      Cancel
                    </Button>
                    <button
                      type="button"
                      disabled={saving || (activeInlineAction === 'return' && !actionReason.trim())}
                      onClick={() => {
                        if (activeInlineAction === 'return') handleConfirmReturn();
                        else if (activeInlineAction === 'waitlist') handleConfirmWaitlist();
                        else handleConfirmNotSelected();
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      <span>
                        {activeInlineAction === 'return' ? 'Confirm Return to Parent' :
                         activeInlineAction === 'waitlist' ? 'Confirm Move to Waitlist' :
                         'Confirm Not Selected'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* MODAL FOOTER WITH ACTION HIERARCHY */}
        <div className="px-6 py-3.5 border-t border-[#EAE8E1] dark:border-[#302E29] bg-white dark:bg-[#21211E] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          {/* Left: Secondary/Destructive Operational Choices */}
          <div className="flex items-center gap-2">
            {!activeInlineAction && app && !loading && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setActionReason('');
                    setActiveInlineAction('waitlist');
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-[#B8B0A5] hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-[#262520] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  Waitlist
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setActionReason('');
                    setActiveInlineAction('not_selected');
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium text-zinc-500 dark:text-[#7A7570] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-[#262520] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  Not selected
                </button>
              </>
            )}
          </div>

          {/* Right: Primary and Operational Decisions */}
          <div className="flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving}
              className="text-xs px-4 py-2"
            >
              Close
            </Button>

            {!activeInlineAction && app && !loading && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setActionReason('');
                    setActiveInlineAction('return');
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/60 border border-amber-200 dark:border-amber-900/50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  title="Unlock and return application to parent for updates"
                >
                  Return to Parent
                </button>

                <button
                  type="button"
                  disabled={saving || (childRecord?.needsAgeReview && !ageVerified)}
                  onClick={handleApprove}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#C59B27] hover:bg-[#B08921] disabled:opacity-60 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  {saving && actionType === 'approve' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Approving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Approve</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

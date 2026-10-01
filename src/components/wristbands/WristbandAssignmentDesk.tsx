import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  QrCode,
  Tag,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  User,
  ArrowRight,
  RefreshCw,
  X,
  ChevronLeft,
  Check,
  Info,
  Clock,
  Layers
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';

export interface WristbandAssignmentDeskProps {
  eventId?: string;
  actorRole?: 'admin' | 'volunteer';
  adminUser?: any;
  volunteerProfile?: any;
  dutyAssignment?: any;
  initialChild?: any;
  onBack?: () => void;
  onContinueToCheckIn?: (child: any) => void;
  onNavigate?: (route: string) => void;
}

export interface ResolvedChild {
  id: string;
  fullName: string;
  photoUrl?: string;
  ageGroup?: string;
  dateOfBirth?: string;
  gender?: string;
  schoolClass?: string;
  hasMedicalNotes?: boolean;
  needsExtraSupport?: boolean;
  entryId: string;
  entryStatus: string;
  passReference?: string;
  activeWristband?: {
    id: string;
    wristbandCode: string;
    status: string;
    assignedAt?: string;
  } | null;
}

export interface VerifiedWristband {
  id: string;
  eventId: string;
  wristbandCode: string;
  nfcUid: string;
  status: 'available' | 'active' | 'lost' | 'damaged' | 'decommissioned';
  isAssigned: boolean;
  assignedChildEventEntryId: string | null;
  assignedAt: string | null;
}

const CANONICAL_BINDABLE_STATUSES = ['selected', 'pass_ready', 'checked_in'];

export const WristbandAssignmentDesk: React.FC<WristbandAssignmentDeskProps> = ({
  eventId,
  actorRole = 'volunteer',
  adminUser,
  volunteerProfile,
  dutyAssignment,
  initialChild,
  onBack,
  onContinueToCheckIn,
  onNavigate
}) => {
  const { showSuccess, showError } = useNotification();

  // Resolved event ID
  const [currentEventId, setCurrentEventId] = useState<string>(eventId || '');
  const [loadingEvent, setLoadingEvent] = useState(!eventId);

  // Workflow states
  const [childSearchQuery, setChildSearchQuery] = useState('');
  const [isSearchingChild, setIsSearchingChild] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedChild, setSelectedChild] = useState<ResolvedChild | null>(null);
  const [childLookupError, setChildLookupError] = useState<string | null>(null);

  // Wristband states
  const [wristbandUidInput, setWristbandUidInput] = useState('');
  const [isLookingUpWristband, setIsLookingUpWristband] = useState(false);
  const [verifiedWristband, setVerifiedWristband] = useState<VerifiedWristband | null>(null);
  const [wristbandError, setWristbandError] = useState<string | null>(null);

  // Binding states
  const [isSubmittingBinding, setIsSubmittingBinding] = useState(false);
  const [assignmentSuccess, setAssignmentSuccess] = useState<{
    childName: string;
    wristbandCode: string;
    assignedAt: string;
  } | null>(null);

  // View wristband details modal state
  const [showExistingWristbandDetails, setShowExistingWristbandDetails] = useState(false);

  // Refs for auto-focusing inputs
  const childInputRef = useRef<HTMLInputElement>(null);
  const wristbandInputRef = useRef<HTMLInputElement>(null);

  // 1. Resolve event context if not provided
  useEffect(() => {
    if (eventId) {
      setCurrentEventId(eventId);
      setLoadingEvent(false);
      return;
    }

    let isMounted = true;
    const fetchCurrentEvent = async () => {
      try {
        const homeRes = await api.volunteer.getEventHome();
        if (isMounted && homeRes?.event?.id) {
          setCurrentEventId(homeRes.event.id);
        }
      } catch (err) {
        console.warn('[WristbandDesk] Could not fetch current event automatically:', err);
      } finally {
        if (isMounted) setLoadingEvent(false);
      }
    };
    fetchCurrentEvent();

    return () => {
      isMounted = false;
    };
  }, [eventId]);

  // 2. Handle initial child passed in from props
  useEffect(() => {
    if (initialChild) {
      const resolved: ResolvedChild = {
        id: initialChild.id || initialChild.childId,
        fullName: initialChild.fullName || initialChild.childName || 'Registered Child',
        photoUrl: initialChild.photoUrl || '',
        ageGroup: initialChild.ageGroup || initialChild.classGroup || '',
        dateOfBirth: initialChild.dateOfBirth,
        gender: initialChild.gender,
        entryId: initialChild.entryId || initialChild.childEventEntryId || initialChild.id,
        entryStatus: initialChild.entryStatus || initialChild.status || 'pass_ready',
        passReference: initialChild.passReference || initialChild.passCode,
        hasMedicalNotes: initialChild.hasMedicalNotes,
        needsExtraSupport: initialChild.needsExtraSupport,
        activeWristband: initialChild.activeWristband || null
      };
      setSelectedChild(resolved);
    }
  }, [initialChild]);

  // 3. Focus management
  useEffect(() => {
    if (!selectedChild && !assignmentSuccess) {
      childInputRef.current?.focus();
    } else if (selectedChild && !verifiedWristband && !assignmentSuccess) {
      wristbandInputRef.current?.focus();
    }
  }, [selectedChild, verifiedWristband, assignmentSuccess]);

  // Authorization check
  const isAuthorized = React.useMemo(() => {
    if (actorRole === 'admin' || (adminUser && ['admin', 'super_admin'].includes(adminUser.role))) {
      return true;
    }
    if (volunteerProfile && volunteerProfile.status === 'approved') {
      // Check duty assignment if provided
      if (dutyAssignment) {
        const key = (dutyAssignment.responsibility_key || '').toLowerCase();
        const team = (dutyAssignment.team_key || '').toLowerCase();
        return (
          key.includes('check') ||
          key.includes('gate') ||
          key.includes('arrival') ||
          key.includes('registration') ||
          team.includes('check_in') ||
          team.includes('gate')
        );
      }
      return true;
    }
    return false;
  }, [actorRole, adminUser, volunteerProfile, dutyAssignment]);

  // Helper to translate backend error codes to human-centric guidance
  const translateWristbandError = (err: any): string => {
    const code = err?.code || '';
    const message = err?.message || err?.error || '';

    switch (code) {
      case 'WRISTBAND_NOT_FOUND':
        return 'This wristband is not registered for this event.';
      case 'WRISTBAND_ALREADY_ASSIGNED':
        return 'This wristband is already assigned.';
      case 'CHILD_ALREADY_HAS_WRISTBAND':
        return 'This child already has an active wristband.';
      case 'WRISTBAND_NOT_AVAILABLE':
        return 'This wristband is marked as unavailable, lost, or damaged.';
      case 'EVENT_MISMATCH':
        return 'This wristband does not belong to the current event.';
      case 'FORBIDDEN':
        return 'You do not have permission to assign wristbands.';
      case 'IDEMPOTENCY_CONFLICT':
        return 'A conflicting operation was recently submitted. Please try again.';
      case 'INVALID_NFC_UID':
        return 'Invalid NFC UID format. Please check the scan.';
      default:
        return message || 'Failed to verify wristband. Please try again.';
    }
  };

  // Perform Child Lookup (Pass Reference or Direct Search)
  const handleChildSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = childSearchQuery.trim();
    if (!query) return;

    setChildLookupError(null);
    setIsSearchingChild(true);
    setSearchResults([]);

    try {
      // If it looks like a pass reference (e.g. contains uppercase prefix or length matches reference), try pass lookup
      const isPassRefCandidate =
        query.toUpperCase().startsWith('KOI-') ||
        query.toUpperCase().startsWith('PASS-') ||
        query.toUpperCase().startsWith('KCT:') ||
        (!query.includes(' ') && query.length >= 5 && query.length <= 20);

      if (isPassRefCandidate) {
        const passRes = await api.volunteer.lookupPass({ passReference: query });
        if (passRes && passRes.success && passRes.child) {
          setSelectedChild(passRes.child);
          setChildSearchQuery('');
          setIsSearchingChild(false);
          return;
        }
      }

      // Fallback: search by name
      const searchRes = await api.volunteer.searchChildren(query);
      if (Array.isArray(searchRes) && searchRes.length > 0) {
        if (searchRes.length === 1) {
          // Exactly 1 match -> automatically resolve full details
          const first = searchRes[0];
          const fullRes = await api.volunteer.lookupPass({
            childId: first.childId,
            childEventEntryId: first.entryId
          });
          if (fullRes?.success && fullRes.child) {
            setSelectedChild(fullRes.child);
            setChildSearchQuery('');
          } else {
            setSearchResults(searchRes);
          }
        } else {
          setSearchResults(searchRes);
        }
      } else {
        setChildLookupError(`No registered child found matching "${query}".`);
      }
    } catch (err: any) {
      setChildLookupError(err?.message || 'Could not find child record for this pass or name.');
    } finally {
      setIsSearchingChild(false);
    }
  };

  // Select child from multi-result list
  const handleSelectSearchResult = async (item: any) => {
    setIsSearchingChild(true);
    setChildLookupError(null);
    try {
      const fullRes = await api.volunteer.lookupPass({
        childId: item.childId,
        childEventEntryId: item.entryId
      });
      if (fullRes?.success && fullRes.child) {
        setSelectedChild(fullRes.child);
        setSearchResults([]);
        setChildSearchQuery('');
      } else {
        setChildLookupError('Failed to load complete child event record.');
      }
    } catch (err: any) {
      setChildLookupError(err?.message || 'Failed to select child.');
    } finally {
      setIsSearchingChild(false);
    }
  };

  // Reset Child Selection
  const handleClearSelectedChild = () => {
    setSelectedChild(null);
    setVerifiedWristband(null);
    setWristbandUidInput('');
    setWristbandError(null);
    setChildLookupError(null);
    setSearchResults([]);
    setTimeout(() => childInputRef.current?.focus(), 50);
  };

  // Perform Wristband Verification (Hardware Wedge or Manual Entry)
  const handleWristbandLookupSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const rawUid = wristbandUidInput.trim();
    if (!rawUid) return;

    if (!currentEventId) {
      setWristbandError('No event context active. Please reload.');
      return;
    }

    setWristbandError(null);
    setIsLookingUpWristband(true);

    try {
      const res = await api.wristbands.lookup(
        { eventId: currentEventId, nfcUid: rawUid },
        actorRole
      );

      if (res?.success && res.wristband) {
        const wb = res.wristband;
        if (wb.status !== 'available') {
          if (wb.status === 'active') {
            setWristbandError('This wristband is already assigned to a child.');
          } else if (wb.status === 'lost') {
            setWristbandError('This wristband is marked as lost and cannot be assigned.');
          } else if (wb.status === 'damaged') {
            setWristbandError('This wristband is marked as damaged and cannot be assigned.');
          } else if (wb.status === 'decommissioned') {
            setWristbandError('This wristband has been decommissioned and cannot be assigned.');
          } else {
            setWristbandError(`This wristband is not available (status: ${wb.status}).`);
          }
          setVerifiedWristband(null);
          return;
        }

        setVerifiedWristband(wb);
        setWristbandError(null);
      } else {
        setWristbandError('Wristband could not be verified in event inventory.');
      }
    } catch (err: any) {
      setWristbandError(translateWristbandError(err));
      setVerifiedWristband(null);
    } finally {
      setIsLookingUpWristband(false);
    }
  };

  // Clear Verified Wristband to Scan Another
  const handleClearWristband = () => {
    setVerifiedWristband(null);
    setWristbandUidInput('');
    setWristbandError(null);
    setTimeout(() => wristbandInputRef.current?.focus(), 50);
  };

  // Execute Wristband Binding Mutation
  const handleConfirmBinding = async () => {
    if (!selectedChild || !verifiedWristband || !currentEventId) return;
    if (isSubmittingBinding) return;

    setIsSubmittingBinding(true);
    setWristbandError(null);

    const idempotencyKey = `idem-bind-${selectedChild.entryId}-${verifiedWristband.id}-${Date.now()}`;

    try {
      const res = await api.wristbands.bind(
        {
          eventId: currentEventId,
          childEventEntryId: selectedChild.entryId,
          wristbandId: verifiedWristband.id,
          idempotencyKey
        },
        actorRole
      );

      if (res && res.success) {
        setAssignmentSuccess({
          childName: selectedChild.fullName,
          wristbandCode: verifiedWristband.wristbandCode,
          assignedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        showSuccess('Wristband assigned', `${verifiedWristband.wristbandCode} linked to ${selectedChild.fullName}`);
      } else {
        setWristbandError('Failed to complete wristband assignment.');
      }
    } catch (err: any) {
      setWristbandError(translateWristbandError(err));
    } finally {
      setIsSubmittingBinding(false);
    }
  };

  // Reset entire desk for next child
  const handleAssignAnotherWristband = () => {
    setSelectedChild(null);
    setVerifiedWristband(null);
    setWristbandUidInput('');
    setChildSearchQuery('');
    setWristbandError(null);
    setChildLookupError(null);
    setSearchResults([]);
    setAssignmentSuccess(null);
    setTimeout(() => childInputRef.current?.focus(), 50);
  };

  // Check Eligibility of Current Selected Child
  const isChildBindable = selectedChild
    ? CANONICAL_BINDABLE_STATUSES.includes(selectedChild.entryStatus)
    : false;

  const childHasActiveWristband = !!selectedChild?.activeWristband;

  // Render Access Denied state if clearly unauthorized
  if (!isAuthorized) {
    return (
      <div className="max-w-xl mx-auto p-6 sm:p-8 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl shadow-3xs text-center space-y-4 my-8">
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center text-amber-700 dark:text-amber-400">
          <ShieldAlert className="w-7 h-7 stroke-[1.8]" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold font-sans text-zinc-900 dark:text-[#F0EBE3]">
            Check-In Duty Required
          </h2>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-[#B8B0A5] leading-relaxed max-w-md mx-auto">
            Wristband assignment is restricted to authorized check-in and gate personnel. If you are scheduled for arrival duty, please confirm your duty station.
          </p>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-[#21211E] dark:hover:bg-[#262520] text-zinc-800 dark:text-[#F0EBE3] font-medium text-xs rounded-xl transition-colors cursor-pointer"
          >
            Back to Dashboard
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="w-full space-y-6 text-left font-sans animate-fade-in"
      data-view-version="wristband-assignment-desk-refined-v2"
    >
      {/* 1. Operational Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE8E1] dark:border-[#302E29] pb-5">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1 -ml-1 text-zinc-400 hover:text-[#18181B] dark:text-[#7A7570] dark:hover:text-[#F0EBE3] rounded-lg transition-colors cursor-pointer"
                title="Return"
                aria-label="Return to previous screen"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="type-h1-app text-[#18181B] dark:text-[#F0EBE3] tracking-tight">
              Wristband Assignment Desk
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-[#B8B0A5] font-normal">
            Assign event wristbands quickly and safely.
          </p>
        </div>

        {/* Actions header */}
        <div className="flex items-center gap-2.5">
          {actorRole === 'admin' && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('/admin/wristbands/inventory')}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-xl border border-[#EAE8E1] dark:border-[#302E29] text-zinc-700 dark:text-[#B8B0A5] hover:bg-zinc-50 dark:hover:bg-[#21211E] transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 mr-1" />
              <span>Inventory</span>
            </button>
          )}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-xl border border-[#EAE8E1] dark:border-[#302E29] text-zinc-700 dark:text-[#B8B0A5] hover:bg-zinc-50 dark:hover:bg-[#21211E] transition-colors cursor-pointer"
            >
              Return
            </button>
          )}
        </div>
      </header>

      {/* 2. Step Presentation / Workflow Progress */}
      {!assignmentSuccess && (
        <nav aria-label="Workflow progress" className="flex items-center gap-2 text-xs font-medium text-zinc-400 dark:text-[#7A7570]">
          <div className={`flex items-center gap-1.5 ${selectedChild ? 'text-[#C59B27] dark:text-[#D4AF37] font-semibold' : 'text-[#18181B] dark:text-[#F0EBE3] font-semibold'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedChild ? 'bg-[#C59B27]/10 text-[#C59B27] dark:bg-[#C59B27]/20 dark:text-[#D4AF37]' : 'bg-[#18181B] text-white dark:bg-white dark:text-[#18181B]'}`}>
              {selectedChild ? '✓' : '1'}
            </span>
            <span>Child</span>
          </div>
          <span className="text-zinc-300 dark:text-[#3A3835]">/</span>
          <div className={`flex items-center gap-1.5 ${verifiedWristband ? 'text-[#C59B27] dark:text-[#D4AF37] font-semibold' : selectedChild && isChildBindable && !childHasActiveWristband ? 'text-[#18181B] dark:text-[#F0EBE3] font-semibold' : 'text-zinc-400 dark:text-[#7A7570]'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${verifiedWristband ? 'bg-[#C59B27]/10 text-[#C59B27] dark:bg-[#C59B27]/20 dark:text-[#D4AF37]' : selectedChild && isChildBindable && !childHasActiveWristband ? 'bg-[#18181B] text-white dark:bg-white dark:text-[#18181B]' : 'bg-zinc-100 text-zinc-400 dark:bg-[#21211E] dark:text-[#7A7570]'}`}>
              {verifiedWristband ? '✓' : '2'}
            </span>
            <span>Wristband</span>
          </div>
          <span className="text-zinc-300 dark:text-[#3A3835]">/</span>
          <div className={`flex items-center gap-1.5 ${verifiedWristband && selectedChild && isChildBindable ? 'text-[#18181B] dark:text-[#F0EBE3] font-semibold' : 'text-zinc-400 dark:text-[#7A7570]'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${verifiedWristband && selectedChild && isChildBindable ? 'bg-[#18181B] text-white dark:bg-white dark:text-[#18181B]' : 'bg-zinc-100 text-zinc-400 dark:bg-[#21211E] dark:text-[#7A7570]'}`}>
              3
            </span>
            <span>Confirm</span>
          </div>
        </nav>
      )}

      {/* 3. Main Operational Content */}
      {assignmentSuccess ? (
        <div className="max-w-xl mx-auto w-full py-4 space-y-6">
          <section
            role="status"
            aria-live="polite"
            className="bg-white dark:bg-[#1D1D1A] border border-emerald-200/80 dark:border-emerald-800/40 rounded-2xl p-6 sm:p-8 text-center space-y-6 shadow-3xs animate-scale-in"
            data-component-version="wristband-assignment-success-card"
          >
            <div className="w-14 h-14 mx-auto bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 block">
                Assignment Complete
              </span>
              <h2 className="text-2xl font-bold font-sans text-zinc-900 dark:text-[#F0EBE3]">
                Wristband Assigned
              </h2>
            </div>

            {/* Child & Wristband Badge Details */}
            <div className="bg-[#FAF8F3] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-4 sm:p-5 shadow-3xs max-w-md mx-auto grid grid-cols-2 gap-4 text-left">
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-[#7A7570]">
                  CHILD
                </span>
                <p className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-[#F0EBE3] truncate">
                  {assignmentSuccess.childName}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-[#7A7570]">
                  WRISTBAND ID
                </span>
                <p className="font-mono font-bold text-xs sm:text-sm text-[#C59B27] truncate">
                  {assignmentSuccess.wristbandCode}
                </p>
              </div>
            </div>

            {/* Operational Next Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 max-w-md mx-auto">
              {onContinueToCheckIn && selectedChild && (
                <button
                  type="button"
                  onClick={() => onContinueToCheckIn(selectedChild)}
                  className="w-full sm:w-auto flex-1 py-3 px-4 bg-[#C59B27] hover:bg-[#B89047] text-white font-semibold text-xs rounded-xl shadow-3xs transition-all uppercase tracking-wider cursor-pointer flex items-center justify-center space-x-2"
                >
                  <span>Continue to check-in</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={handleAssignAnotherWristband}
                className="w-full sm:w-auto flex-1 py-3 px-4 bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] hover:bg-zinc-50 dark:hover:bg-[#262520] text-zinc-900 dark:text-[#F0EBE3] font-semibold text-xs rounded-xl shadow-3xs transition-all uppercase tracking-wider cursor-pointer text-center"
              >
                Assign another wristband
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT PANEL: Step 1 Child Lookup & Confirmed Record (lg:col-span-5) */}
          <div className="lg:col-span-5 space-y-6">
            <section
              aria-labelledby="step-1-heading"
              className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-5 sm:p-6 shadow-3xs space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#EAE8E1] dark:border-[#302E29] pb-3.5">
                <div className="space-y-0.5">
                  <h2 id="step-1-heading" className="text-sm font-semibold text-zinc-900 dark:text-[#F0EBE3]">
                    Find child
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-[#B8B0A5]">
                    Scan a pass, enter a pass reference, or search by name.
                  </p>
                </div>
                {selectedChild && (
                  <button
                    type="button"
                    onClick={handleClearSelectedChild}
                    className="text-xs font-semibold text-[#C59B27] hover:text-[#B89047] transition-colors cursor-pointer shrink-0"
                  >
                    Change child
                  </button>
                )}
              </div>

              {!selectedChild ? (
                /* Search Form */
                <div className="space-y-3">
                  <form onSubmit={handleChildSearchSubmit} className="space-y-3">
                    <label
                      htmlFor="child-search-input"
                      className="sr-only"
                    >
                      Find child
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400 dark:text-[#7A7570]">
                        <Search className="w-4 h-4" />
                      </span>
                      <input
                        id="child-search-input"
                        ref={childInputRef}
                        type="text"
                        value={childSearchQuery}
                        onChange={(e) => setChildSearchQuery(e.target.value)}
                        placeholder="Pass ref (e.g. KOI-2026-...) or child name"
                        className="w-full pl-10 pr-24 py-2.5 text-xs sm:text-sm rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-[#FAF9F6] dark:bg-[#21211E] text-zinc-900 dark:text-[#F0EBE3] placeholder:text-zinc-400 dark:placeholder:text-[#7A7570] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/20 focus:border-[#C59B27] dark:focus:border-[#C59B27] transition-all font-sans"
                        disabled={isSearchingChild}
                      />
                      <div className="absolute inset-y-0 right-1.5 flex items-center">
                        <button
                          type="submit"
                          disabled={isSearchingChild || !childSearchQuery.trim()}
                          className="py-1.5 px-3.5 bg-[#C59B27] hover:bg-[#B89047] disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center space-x-1 shadow-3xs"
                        >
                          {isSearchingChild ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <span>Find</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </form>

                  {childLookupError && (
                    <div
                      role="alert"
                      className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-700 dark:text-rose-400 flex items-start space-x-2"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{childLookupError}</span>
                    </div>
                  )}

                  {/* Multi-result suggestions list */}
                  {searchResults.length > 0 && (
                    <div className="border border-[#EAE8E1] dark:border-[#302E29] rounded-xl overflow-hidden divide-y divide-[#EAE8E1] dark:divide-[#302E29]">
                      <div className="bg-[#FAF8F3] dark:bg-[#21211E] px-3.5 py-2 text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-[#7A7570]">
                        Select matching child ({searchResults.length})
                      </div>
                      {searchResults.map((item, idx) => (
                        <button
                          key={item.childId || idx}
                          type="button"
                          onClick={() => handleSelectSearchResult(item)}
                          className="w-full text-left p-3 hover:bg-zinc-50 dark:hover:bg-[#262520] transition-colors flex items-center justify-between cursor-pointer"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-semibold text-xs text-zinc-900 dark:text-[#F0EBE3] truncate">
                              {item.childName}
                            </p>
                            <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5]">
                              {item.ageGroup || 'General Group'} • Pass: {item.passReference || 'Pending'}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-zinc-400 dark:text-[#7A7570] shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Confirmed Child Card */
                <div className="space-y-4" data-component-version="wristband-confirmed-child-card">
                  <div className="flex items-start space-x-3.5 p-3.5 bg-[#FAF8F3] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl">
                    {/* Photo / Avatar */}
                    <div className="w-14 h-14 rounded-xl bg-zinc-100 dark:bg-[#262520] border border-zinc-200 dark:border-[#3A3835] overflow-hidden shrink-0 flex items-center justify-center">
                      {selectedChild.photoUrl ? (
                        <img
                          src={selectedChild.photoUrl}
                          alt={selectedChild.fullName}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <User className="w-7 h-7 text-zinc-400 dark:text-[#7A7570] stroke-[1.5]" />
                      )}
                    </div>

                    {/* Identity metadata */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-bold font-sans text-zinc-900 dark:text-[#F0EBE3] truncate">
                          {selectedChild.fullName}
                        </h3>
                        {/* Persisted canonical registration status */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 ${
                            selectedChild.entryStatus === 'pass_ready'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40'
                              : selectedChild.entryStatus === 'selected'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40'
                              : selectedChild.entryStatus === 'checked_in'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                          }`}
                        >
                          {selectedChild.entryStatus.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 text-xs text-zinc-500 dark:text-[#B8B0A5]">
                        {selectedChild.ageGroup && (
                          <span>{selectedChild.ageGroup}</span>
                        )}
                        {selectedChild.passReference && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[11px] font-semibold text-zinc-700 dark:text-[#C8C2B6]">
                              Ref: {selectedChild.passReference}
                            </span>
                          </>
                        )}
                      </div>

                      {(selectedChild.hasMedicalNotes || selectedChild.needsExtraSupport) && (
                        <div className="pt-1 flex items-center space-x-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          <Info className="w-3.5 h-3.5" />
                          <span>Care notes on file</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Eligibility Warning */}
                  {!isChildBindable && (
                    <div
                      role="alert"
                      className="p-4 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/40 rounded-xl space-y-2 text-xs text-amber-900 dark:text-amber-300"
                    >
                      <div className="flex items-center space-x-2 font-semibold">
                        <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                        <span>Wristband cannot be assigned</span>
                      </div>
                      <p className="leading-relaxed">
                        {selectedChild.entryStatus === 'under_review'
                          ? 'This child is still under review.'
                          : 'This child was not selected for this event.'}
                      </p>
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={handleClearSelectedChild}
                          className="font-medium underline hover:text-amber-950 dark:hover:text-white cursor-pointer"
                        >
                          Search another child
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Existing Wristband Notification */}
                  {childHasActiveWristband && selectedChild.activeWristband && (
                    <div
                      role="alert"
                      className="p-4 bg-[#FAF8F3] dark:bg-[#21211E] border border-[#E5D5AE] dark:border-[#5A4515] rounded-xl space-y-2.5 text-xs text-[#18181B] dark:text-[#F0EBE3]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <CheckCircle2 className="w-4 h-4 text-[#C59B27]" />
                          <span className="font-semibold text-zinc-900 dark:text-[#F0EBE3]">
                            Wristband already assigned
                          </span>
                        </div>
                        <span className="font-mono font-bold text-xs bg-white dark:bg-[#1D1D1A] px-2.5 py-1 rounded-lg border border-[#E5D5AE] dark:border-[#5A4515] text-[#C59B27]">
                          {selectedChild.activeWristband.wristbandCode}
                        </span>
                      </div>
                      <p className="text-zinc-600 dark:text-[#B8B0A5] leading-relaxed">
                        This child already has an active wristband. Only one active wristband can be assigned per child.
                      </p>
                      <div className="pt-1 flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => setShowExistingWristbandDetails(true)}
                          className="font-semibold text-[#9A7326] dark:text-[#E5B842] hover:underline cursor-pointer"
                        >
                          View wristband
                        </button>
                        <span className="text-zinc-300 dark:text-zinc-600">•</span>
                        <button
                          type="button"
                          onClick={handleClearSelectedChild}
                          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white underline cursor-pointer"
                        >
                          Search another child
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT PANEL: Step 2 Wristband Scan & Step 3 Review (lg:col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            {!selectedChild ? (
              /* Calm station ready state */
              <div className="bg-white dark:bg-[#1D1D1A] border border-dashed border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-8 sm:p-12 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-xl bg-[#FAF8F3] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] flex items-center justify-center text-zinc-400 dark:text-[#7A7570]">
                  <Tag className="w-6 h-6 stroke-[1.5]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-[#F0EBE3]">
                    Ready for assignment
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-[#B8B0A5] max-w-sm mx-auto leading-relaxed">
                    Select or find a child pass on the left to proceed with wristband assignment.
                  </p>
                </div>
              </div>
            ) : isChildBindable && !childHasActiveWristband ? (
              <>
                {/* STEP 2: Wristband Scan & Availability Check */}
                <section
                  aria-labelledby="step-2-heading"
                  className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-5 sm:p-6 shadow-3xs space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-[#EAE8E1] dark:border-[#302E29] pb-3.5">
                    <div className="space-y-0.5">
                      <h2 id="step-2-heading" className="text-sm font-semibold text-zinc-900 dark:text-[#F0EBE3]">
                        Scan wristband
                      </h2>
                      <p className="text-xs text-zinc-500 dark:text-[#B8B0A5]">
                        Tap the wristband or enter the code manually.
                      </p>
                    </div>
                    {verifiedWristband && (
                      <button
                        type="button"
                        onClick={handleClearWristband}
                        className="text-xs font-semibold text-[#C59B27] hover:text-[#B89047] transition-colors cursor-pointer shrink-0"
                      >
                        Scan different wristband
                      </button>
                    )}
                  </div>

                  {!verifiedWristband ? (
                    /* Scanning Input */
                    <form onSubmit={handleWristbandLookupSubmit} className="space-y-3">
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400 dark:text-[#7A7570]">
                          <QrCode className="w-4 h-4" />
                        </span>
                        <input
                          id="wristband-scan-input"
                          ref={wristbandInputRef}
                          type="text"
                          value={wristbandUidInput}
                          onChange={(e) => setWristbandUidInput(e.target.value)}
                          placeholder="e.g. 04:A1:B2:C3 or 04A1B2C3"
                          className="w-full pl-10 pr-24 py-2.5 font-mono text-xs sm:text-sm rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-[#FAF9F6] dark:bg-[#21211E] text-zinc-900 dark:text-[#F0EBE3] placeholder:text-zinc-400 dark:placeholder:text-[#7A7570] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/20 focus:border-[#C59B27] dark:focus:border-[#C59B27] transition-all uppercase"
                          disabled={isLookingUpWristband}
                        />
                        <div className="absolute inset-y-0 right-1.5 flex items-center">
                          <button
                            type="submit"
                            disabled={isLookingUpWristband || !wristbandUidInput.trim()}
                            className="py-1.5 px-3.5 bg-[#C59B27] hover:bg-[#B89047] disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center space-x-1 shadow-3xs"
                          >
                            {isLookingUpWristband ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <span>Check</span>
                            )}
                          </button>
                        </div>
                      </div>

                      {wristbandError && (
                        <div
                          role="alert"
                          className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-700 dark:text-rose-400 flex items-start space-x-2"
                        >
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{wristbandError}</span>
                        </div>
                      )}
                    </form>
                  ) : (
                    /* Verified Wristband Card */
                    <div
                      className="bg-[#FAF8F3] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-4 flex items-center justify-between"
                      data-component-version="wristband-verified-card"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-lg font-bold text-zinc-900 dark:text-[#F0EBE3]">
                            {verifiedWristband.wristbandCode}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40">
                            Available
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-zinc-500 dark:text-[#7A7570]">
                          UID: {verifiedWristband.nfcUid}
                        </p>
                      </div>

                      <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <Check className="w-5 h-5 stroke-[2.5]" />
                      </div>
                    </div>
                  )}
                </section>

                {/* STEP 3: Review Before Bind */}
                {verifiedWristband && (
                  <section
                    aria-labelledby="step-3-heading"
                    className="bg-white dark:bg-[#1D1D1A] border border-[#C59B27]/40 dark:border-[#C59B27]/30 rounded-2xl p-5 sm:p-6 shadow-3xs space-y-4 animate-fade-in"
                    data-component-version="wristband-review-panel"
                  >
                    <div className="border-b border-[#EAE8E1] dark:border-[#302E29] pb-3">
                      <h2 id="step-3-heading" className="text-sm font-semibold text-zinc-900 dark:text-[#F0EBE3]">
                        Review & confirm assignment
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="p-3.5 bg-[#FAF8F3] dark:bg-[#21211E] rounded-xl border border-[#EAE8E1] dark:border-[#302E29] space-y-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-[#7A7570] block">
                          CHILD
                        </span>
                        <p className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-[#F0EBE3] truncate">
                          {selectedChild.fullName}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5]">
                          Pass Ref: {selectedChild.passReference || 'Verified'}
                        </p>
                      </div>

                      <div className="p-3.5 bg-[#FAF8F3] dark:bg-[#21211E] rounded-xl border border-[#EAE8E1] dark:border-[#302E29] space-y-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-[#7A7570] block">
                          WRISTBAND
                        </span>
                        <p className="font-mono font-bold text-xs sm:text-sm text-[#C59B27] truncate">
                          {verifiedWristband.wristbandCode}
                        </p>
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                          Verified Available
                        </p>
                      </div>
                    </div>

                    {wristbandError && (
                      <div
                        role="alert"
                        className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-700 dark:text-rose-400 flex items-start space-x-2"
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{wristbandError}</span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleConfirmBinding}
                        disabled={isSubmittingBinding}
                        className="w-full sm:flex-1 py-3 px-4 bg-[#C59B27] hover:bg-[#B89047] disabled:opacity-50 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-3xs transition-all uppercase tracking-wider cursor-pointer flex items-center justify-center space-x-2"
                      >
                        {isSubmittingBinding ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Assigning wristband...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>Assign wristband</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleClearWristband}
                        disabled={isSubmittingBinding}
                        className="w-full sm:w-auto py-3 px-4 bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] hover:bg-zinc-50 dark:hover:bg-[#262520] text-zinc-700 dark:text-[#B8B0A5] font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                      >
                        Scan different wristband
                      </button>
                    </div>
                  </section>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Existing Wristband Details Modal */}
      {showExistingWristbandDetails && selectedChild?.activeWristband && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
        >
          <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-6 shadow-xl max-w-sm w-full space-y-4 animate-scale-in text-left">
            <div className="flex items-center justify-between border-b border-[#EAE8E1] dark:border-[#302E29] pb-3">
              <h3 className="font-bold text-base font-sans text-zinc-900 dark:text-[#F0EBE3]">
                Wristband Details
              </h3>
              <button
                type="button"
                onClick={() => setShowExistingWristbandDetails(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-[#302E29]">
                <span className="text-zinc-500 dark:text-[#7A7570]">Wristband ID</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-[#F0EBE3]">
                  {selectedChild.activeWristband.wristbandCode}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-[#302E29]">
                <span className="text-zinc-500 dark:text-[#7A7570]">Child</span>
                <span className="font-medium text-zinc-900 dark:text-[#F0EBE3]">
                  {selectedChild.fullName}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-[#302E29]">
                <span className="text-zinc-500 dark:text-[#7A7570]">Status</span>
                <span className="font-mono uppercase font-bold text-emerald-700 dark:text-emerald-400">
                  {selectedChild.activeWristband.status || 'Active'}
                </span>
              </div>
              {selectedChild.activeWristband.assignedAt && (
                <div className="flex justify-between py-1">
                  <span className="text-zinc-500 dark:text-[#7A7570]">Assigned</span>
                  <span className="text-zinc-700 dark:text-[#C8C2B6]">
                    {new Date(selectedChild.activeWristband.assignedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowExistingWristbandDetails(false)}
              className="w-full py-2.5 bg-[#18181B] dark:bg-zinc-100 text-white dark:text-[#18181B] text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

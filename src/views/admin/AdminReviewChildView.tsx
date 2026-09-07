import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  AlertCircle, 
  ShieldAlert, 
  Phone, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  Mail, 
  MessageSquare, 
  Loader2,
  Check,
  Hourglass,
  Edit,
  X,
  XCircle,
  ChevronDown,
  QrCode,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { EventPassPreviewCard } from '../../components/common/EventPassPreviewCard';
import { SafeImage } from '../../components/common/SafeImage';

interface AdminReviewChildViewProps {
  applicationId: string;
  onBack: () => void;
  onSave: () => void;
  backLabel?: string;
  adminUser?: any;
  isSuperAdmin?: boolean;
}

export const AdminReviewChildView: React.FC<AdminReviewChildViewProps> = ({
  applicationId,
  onBack,
  onSave,
  backLabel,
  adminUser,
  isSuperAdmin = false
}) => {
  const { showError, showSuccess } = useNotification();
  const effectiveSuperAdmin = Boolean(isSuperAdmin || adminUser?.role === 'super_admin');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [app, setApp] = useState<any>(null);

  // Form states for review
  const [decision, setDecision] = useState<'selected' | 'waiting_list' | 'under_review' | 'not_selected'>('selected');
  const [noteToTeam, setNoteToTeam] = useState('');
  const [sendNotification, setSendNotification] = useState(true);
  
  // Interactive confirmation checkbox
  const [ageChecked, setAgeChecked] = useState(false);

  // Reopen review states
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  // Edit child details modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    gender: 'Male',
    dateOfBirth: '',
    schoolClass: '',
    schoolName: '',
    hasMedicalNotes: false,
    medicalNotes: '',
    needsExtraSupport: false,
    supportNotes: '',
    parentFullName: '',
    parentPhone: '',
    parentWhatsApp: '',
    parentHomeAddress: '',
    pickupPersonName: '',
    pickupPersonRelationship: '',
    pickupPersonPhone: ''
  });

  // Remove child state
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);

  // Restore child state
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Revoke pass state
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);

  // State-dependent confirmation modals
  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [isNotSelectedModalOpen, setIsNotSelectedModalOpen] = useState(false);
  const [notSelectedReason, setNotSelectedReason] = useState('');
  const [isGeneratePassModalOpen, setIsGeneratePassModalOpen] = useState(false);

  // Super Admin: Reset Event Progress
  const [isResetProgressModalOpen, setIsResetProgressModalOpen] = useState(false);
  const [resetMode, setResetMode] = useState<'review' | 'attendance'>('review');
  const [resettingProgress, setResettingProgress] = useState(false);

  // Super Admin: Prepare Delete & Permanent Delete
  const [isPrepareDeleteModalOpen, setIsPrepareDeleteModalOpen] = useState(false);
  const [preparingDelete, setPreparingDelete] = useState(false);
  const [isPermanentDeleteModalOpen, setIsPermanentDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [permanentDeleting, setPermanentDeleting] = useState(false);

  // Dropdown More menu in Decision panel
  const [isDecisionMoreOpen, setIsDecisionMoreOpen] = useState(false);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getApplicationDetails(applicationId);
      if (res.success && res.application) {
        setApp(res.application);
        setNoteToTeam(res.application.noteToTeam || '');
        
        // Set ageChecked default to true if the child doesn't need age review
        setAgeChecked(!res.application.child.needsAgeReview);

        const firstPickup = res.application.pickupPeople && res.application.pickupPeople.length > 0 
          ? res.application.pickupPeople[0] 
          : null;

        // Populate edit form
        setEditForm({
          fullName: res.application.child.fullName || '',
          gender: res.application.child.gender || 'Male',
          dateOfBirth: res.application.child.dob || '',
          schoolClass: res.application.schoolClass || '',
          schoolName: res.application.schoolName || '',
          hasMedicalNotes: !!res.application.hasMedicalNotes,
          medicalNotes: res.application.medicalNotes || '',
          needsExtraSupport: !!res.application.needsExtraSupport,
          supportNotes: res.application.supportNotes || '',
          parentFullName: res.application.parent?.fullName || '',
          parentPhone: res.application.parent?.phone || '',
          parentWhatsApp: res.application.parent?.whatsapp || '',
          parentHomeAddress: res.application.parent?.address || '',
          pickupPersonName: firstPickup?.fullName || '',
          pickupPersonRelationship: firstPickup?.relationship || '',
          pickupPersonPhone: firstPickup?.phone || ''
        });
        
        // Set initial decision based on current status
        const currentStatus = res.application.status;
        if (['selected', 'pass_ready', 'checked_in', 'inside', 'picked_up'].includes(currentStatus)) {
          setDecision('selected');
        } else if (currentStatus === 'waiting_list') {
          setDecision('waiting_list');
        } else if (currentStatus === 'not_selected') {
          setDecision('not_selected');
        } else {
          setDecision('under_review');
        }
      } else {
        showError('Not Found', 'Could not locate child registration details.');
        onBack();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Fetch Failed', parsed.message || 'An error occurred while loading application details.');
      onBack();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [applicationId]);

  // Decision Confirmations
  const handleConfirmSelect = async () => {
    setSaving(true);
    try {
      const res = await api.admin.reviewApplication(applicationId, {
        status: 'selected',
        noteToTeam: noteToTeam || 'Selected for event.',
        sendNotification
      });
      if (res.success) {
        showSuccess('Child Selected', `${app?.child?.fullName || 'Child'} has been selected for the event.`);
        setIsSelectModalOpen(false);
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Selection Failed', parsed.message || 'Could not select child.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmWaitlist = async () => {
    setSaving(true);
    try {
      const res = await api.admin.reviewApplication(applicationId, {
        status: 'waiting_list',
        noteToTeam: noteToTeam || 'Moved to waiting list.',
        sendNotification
      });
      if (res.success) {
        showSuccess('Added to Waiting List', `${app?.child?.fullName || 'Child'} was moved to the waiting list.`);
        setIsWaitlistModalOpen(false);
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Waitlist Failed', parsed.message || 'Could not waitlist child.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmNotSelected = async () => {
    setSaving(true);
    try {
      const res = await api.admin.reviewApplication(applicationId, {
        status: 'not_selected',
        noteToTeam: notSelectedReason || noteToTeam || 'Marked not selected.',
        sendNotification
      });
      if (res.success) {
        showSuccess('Marked Not Selected', `${app?.child?.fullName || 'Child'} was marked as not selected.`);
        setIsNotSelectedModalOpen(false);
        setNotSelectedReason('');
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Operation Failed', parsed.message || 'Could not update status.');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePass = async () => {
    if (!app?.childId) return;
    setSaving(true);
    try {
      const res = await api.admin.generateChildPass(app.childId);
      if (res.success) {
        showSuccess(
          'Pass Issued',
          `The digital event pass for ${app?.child?.fullName || 'the child'} has been generated successfully.`
        );
        setIsGeneratePassModalOpen(false);
        await fetchDetails();
        onSave();
      } else {
        showError('Generation Failed', res.error || 'Could not generate pass.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Generation Failed', parsed.message || 'An error occurred while generating the pass.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmRevokePass = async () => {
    setRevoking(true);
    try {
      const res = await api.admin.revokeChildPass(app.childId, revokeReason || 'Administrative pass revocation');
      if (res.success) {
        showSuccess('Pass Revoked', 'Digital event pass has been revoked.');
        setIsRevokeModalOpen(false);
        setRevokeReason('');
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Revocation Failed', parsed.message || 'Could not revoke event pass.');
    } finally {
      setRevoking(false);
    }
  };

  const handleConfirmReopen = async () => {
    setReopening(true);
    try {
      const res = await api.admin.reopenApplicationReview(applicationId, reopenReason || 'Administrative reopen');
      if (res.success) {
        showSuccess(
          'Review Reopened',
          `The registration review for ${app?.child?.fullName || 'the child'} has been reopened successfully.`
        );
        setIsReopenModalOpen(false);
        setReopenReason('');
        await fetchDetails();
        onSave();
      } else {
        showError('Reopen Failed', res.error || 'Could not reopen registration review.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Reopen Failed', parsed.message || 'An error occurred while reopening the review.');
    } finally {
      setReopening(false);
    }
  };

  const handleConfirmRemove = async () => {
    setRemoving(true);
    try {
      const res = await api.admin.removeChild(applicationId, removeReason || 'Administrative removal');
      if (res.success) {
        showSuccess('Registration Removed', 'Registration has been removed from this event.');
        setIsRemoveModalOpen(false);
        setRemoveReason('');
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Removal Failed', parsed.message || 'Could not remove registration.');
    } finally {
      setRemoving(false);
    }
  };

  const handleConfirmRestore = async () => {
    setRestoring(true);
    try {
      const res = await api.admin.restoreChild(applicationId);
      if (res.success) {
        showSuccess('Registration Restored', 'Registration has been restored to this event.');
        setIsRestoreModalOpen(false);
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Restore Failed', parsed.message || 'Could not restore registration.');
    } finally {
      setRestoring(false);
    }
  };

  // Super Admin: Reset Event Progress
  const handleConfirmResetProgress = async () => {
    setResettingProgress(true);
    try {
      const res = await api.admin.resetEventProgress(applicationId, resetMode);
      if (res.success) {
        showSuccess('Progress Reset', res.message || `${app?.child?.fullName || 'Child'}'s event progress was reset.`);
        setIsResetProgressModalOpen(false);
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Reset Failed', parsed.message || "We couldn't reset this child's event progress. Nothing was changed.");
    } finally {
      setResettingProgress(false);
    }
  };

  // Super Admin: Prepare for Permanent Deletion
  const handleConfirmPrepareDelete = async () => {
    setPreparingDelete(true);
    try {
      const res = await api.admin.prepareForPermanentDelete(applicationId);
      if (res.success) {
        showSuccess('Prepared for Deletion', res.message || 'Record operational state cleared. Ready for permanent deletion.');
        setIsPrepareDeleteModalOpen(false);
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Preparation Failed', parsed.message || "We couldn't prepare this record for deletion. Nothing was changed.");
    } finally {
      setPreparingDelete(false);
    }
  };

  // Super Admin: Permanent Delete
  const handleConfirmPermanentDelete = async () => {
    if (deleteConfirmationText !== 'DELETE') {
      showError('Confirmation Required', 'Please type DELETE exactly to confirm permanent deletion.');
      return;
    }
    setPermanentDeleting(true);
    try {
      const res = await api.admin.permanentlyDeleteChild(applicationId, 'Permanently deleted by Super Admin', 'DELETE');
      if (res.success) {
        showSuccess('Permanently Deleted', `${app?.child?.fullName || 'Child'} was permanently deleted.`);
        setIsPermanentDeleteModalOpen(false);
        onSave();
        onBack();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Deletion Blocked', parsed.message || "We couldn't permanently delete this child. Nothing was changed.");
    } finally {
      setPermanentDeleting(false);
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      const res = await api.admin.updateApplicationStatus(applicationId, app.status, noteToTeam);
      if (res.success) {
        showSuccess('Notes Saved', 'Internal notes updated successfully.');
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Save Failed', parsed.message || 'Could not save internal notes.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.admin.updateApplicationDetails(applicationId, {
        fullName: editForm.fullName,
        gender: editForm.gender,
        dateOfBirth: editForm.dateOfBirth,
        schoolClass: editForm.schoolClass,
        schoolName: editForm.schoolName,
        hasMedicalNotes: editForm.hasMedicalNotes,
        medicalNotes: editForm.medicalNotes,
        needsExtraSupport: editForm.needsExtraSupport,
        supportNotes: editForm.supportNotes,
        parentFullName: editForm.parentFullName,
        parentPhone: editForm.parentPhone,
        parentWhatsApp: editForm.parentWhatsApp,
        parentHomeAddress: editForm.parentHomeAddress,
        pickupPersonName: editForm.pickupPersonName,
        pickupPersonRelationship: editForm.pickupPersonRelationship,
        pickupPersonPhone: editForm.pickupPersonPhone
      });

      if (res.success) {
        showSuccess('Details Saved', 'Child details updated successfully.');
        setIsEditModalOpen(false);
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Save Failed', parsed.message || 'Could not update child details.');
    } finally {
      setSaving(false);
    }
  };

  // Parent notification preview
  const getNotificationPreview = () => {
    if (!app) return '';
    const parentFullName = app.parent?.fullName || 'Parent';
    const childFullName = app.child?.fullName || 'Child';
    const parentFirstName = parentFullName.split(' ')[0] || parentFullName;
    const childFirstName = childFullName.split(' ')[0] || childFullName;

    switch (decision) {
      case 'selected':
        return `Hello ${parentFirstName},\n\nWe’re happy to let you know that ${childFirstName} has been selected for The General Assembly Children and Teens.\n\nWarm regards,\nKoinonia Children and Teens Team`;
      case 'waiting_list':
        return `Hello ${parentFirstName},\n\n${childFirstName} has been added to the waiting list. We’ll contact you if a space opens.\n\nWarm regards,\nKoinonia Children and Teens Team`;
      case 'not_selected':
        return `Hello ${parentFirstName},\n\nThank you for submitting ${childFirstName}’s details. We’re unable to select this registration for the current event.\n\nWarm regards,\nKoinonia Children and Teens Team`;
      case 'under_review':
        return `Hello ${parentFirstName},\n\nWe need one more update before completing ${childFirstName}’s review. Please open Parent Access and update the requested details.\n\nWarm regards,\nKoinonia Children and Teens Team`;
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-[#FAF9F6] p-6 w-full">
        <KoinoniaInlineLoader
          variant="logo"
          size="lg"
          label="Loading child review details..."
          centered
        />
      </div>
    );
  }

  if (!app) return null;

  const isRemoved = Boolean(app.isDeleted || app.status === 'removed');
  const isAttendingChild = ['checked_in', 'inside', 'picked_up'].includes(app.status) || (Boolean(app.checkedInAt) && !app.pickedUpAt);

  // Status Presentation Strings
  const getReviewStatusLabel = () => {
    if (isRemoved) return 'Removed';
    if (app.status === 'under_review' || app.status === 'review_reopened') return 'Under review';
    if (app.status === 'selected' || app.status === 'pass_ready' || ['checked_in', 'inside', 'picked_up'].includes(app.status)) return 'Selected';
    if (app.status === 'waiting_list') return 'Waiting list';
    if (app.status === 'not_selected') return 'Not selected';
    return app.status;
  };

  const getEventAccessLabel = () => {
    if (app.hasPass) {
      if (app.passStatus === 'revoked') return 'Pass revoked';
      return 'Pass ready';
    }
    if (app.status === 'pass_ready') return 'Pass ready';
    return 'No pass';
  };

  const getAttendanceLabel = () => {
    if (app.status === 'inside') return 'Inside';
    if (app.status === 'checked_in' || (app.checkedInAt && !app.pickedUpAt)) return 'Checked in';
    if (app.status === 'picked_up' || app.pickedUpAt) return 'Picked up';
    return 'Not arrived';
  };

  const getAgeText = () => {
    const age = app.child.age;
    if (age === 0) return 'Under 1 year';
    return `${age} ${age === 1 ? 'year' : 'years'}`;
  };

  const getSuggestedGroup = () => {
    const age = app.child.age;
    if (age < 1) return 'Below 1';
    if (age < 3) return 'Ages 1 to 2';
    if (age < 6) return 'Ages 3 to 5';
    if (age < 10) return 'Ages 6 to 9';
    return 'Teens (Ages 10+)';
  };

  return (
    <div className="space-y-6 pb-24 text-zinc-800 animate-fade-in bg-[#FAF9F6]">
      
      {/* 1. HEADER BREADCRUMB ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE8E1]/80 pb-4">
        <div className="flex items-center space-x-3">
          <button 
            onClick={onBack}
            className="flex items-center space-x-1.5 text-xs font-semibold text-[#C59B27] hover:text-[#A37E1C] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{backLabel || 'Back to review'}</span>
          </button>
          <span className="text-zinc-300">/</span>
          <span className="text-xs text-zinc-500 font-medium">Registration review</span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-1.5 flex items-center space-x-2 text-xs text-zinc-700 shadow-none">
            <span className="text-xs text-zinc-400 font-medium">Event</span>
            <span className="font-semibold text-zinc-800">The General Assembly 2026</span>
          </div>
        </div>
      </div>

      {/* 2. REMOVED NOTICE BANNER */}
      {isRemoved && (
        <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-5 flex items-start gap-3.5">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <h4 className="text-xs font-semibold text-amber-900">Registration removed from event</h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              This registration has been removed and archived from active event rosters. 
              {app.deleteReason && <> Reason: <strong>{app.deleteReason}</strong></>}
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => setIsRestoreModalOpen(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-xl transition-all shadow-none cursor-pointer"
              >
                Restore registration
              </Button>
              {effectiveSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setIsPermanentDeleteModalOpen(true)}
                  className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-all shadow-none cursor-pointer"
                >
                  Delete permanently
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. TWO COLUMN GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: IDENTITY, DETAILS, CARE, CONTACTS, HISTORY (7 COLUMNS) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* CHILD SUMMARY */}
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4 shadow-none">
            <h2 className="text-sm font-semibold text-[#18181B] pb-3 border-b border-[#EAE8E1]/60">
              Child summary
            </h2>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <div className="shrink-0">
                <SafeImage
                  src={app.child.photoUrl}
                  alt={app.child.fullName}
                  className="w-20 h-24 rounded-xl object-cover border border-[#EAE8E1]"
                  containerClassName="w-20 h-24 rounded-xl"
                  fallbackComponent={
                    <div className="w-20 h-24 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 font-semibold text-xl">
                      <span>{app.child.fullName?.charAt(0) || 'C'}</span>
                    </div>
                  }
                />
              </div>

              <div className="flex-1 text-center sm:text-left space-y-2">
                <h1 className="text-2xl sm:text-3xl font-semibold text-[#18181B] tracking-tight">
                  {app.child.fullName}
                </h1>
                
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
                  <span className="text-xs text-zinc-500 font-medium">
                    {getAgeText()} · {app.child.gender} · {app.child.ageGroup ? app.child.ageGroup.replace('to', '–') : 'Section'}
                  </span>

                  <span className="text-zinc-300">·</span>

                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border border-zinc-200 bg-zinc-50 text-zinc-700">
                    {getReviewStatusLabel()}
                  </span>

                  {app.child.needsAgeReview && (
                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200/60 px-2 py-0.5 rounded-md text-xs font-medium">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                      <span>Age check required</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CHILD DETAILS */}
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-5 shadow-none">
            <div className="flex items-center justify-between border-b border-[#EAE8E1]/60 pb-3">
              <h2 className="text-sm font-semibold text-[#18181B]">
                Child details
              </h2>
              {!isRemoved && (
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="text-xs font-medium text-[#C59B27] hover:text-[#A37E1C] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Edit className="w-3 h-3" />
                  <span>Edit details</span>
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-zinc-500 font-medium block">Date of birth</span>
                <span className="font-medium text-zinc-900 mt-1 block">{app.child.dob || 'Not stated'}</span>
              </div>
              <div>
                <span className="text-zinc-500 font-medium block">Relationship to child</span>
                <span className="font-medium text-zinc-900 mt-1 block">{app.child.relationship || 'Child'}</span>
              </div>
              <div>
                <span className="text-zinc-500 font-medium block">School</span>
                <span className="font-medium text-zinc-900 mt-1 block">
                  {app.schoolClass ? `${app.schoolClass} (${app.schoolName || 'N/A'})` : (app.schoolName || 'Not stated')}
                </span>
              </div>
            </div>

            {/* Age Verification Section */}
            <div className="border-t border-[#EAE8E1]/60 pt-4">
              {app.child.needsAgeReview ? (
                <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-semibold text-xs">Age check required</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500 font-medium block">Suggested group</span>
                      <span className="font-semibold text-amber-900 mt-0.5 block">{getSuggestedGroup()}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 font-medium block">Event target group</span>
                      <span className="font-medium text-zinc-700 mt-0.5 block">{app.child.ageGroup}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-xs text-zinc-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">Age group confirmed</span>
                </div>
              )}
            </div>
          </div>

          {/* CARE INFORMATION */}
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-5 shadow-none">
            <h2 className="text-sm font-semibold text-[#18181B] pb-3 border-b border-[#EAE8E1]/60">
              Care information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
              {/* Medical Information */}
              <div className="space-y-1.5">
                <span className="text-xs text-zinc-500 font-medium block">Medical information</span>
                {app.hasMedicalNotes ? (
                  <div className="p-3 bg-rose-50/70 border border-rose-200/60 rounded-xl text-rose-800 leading-relaxed font-medium">
                    {app.medicalNotes}
                  </div>
                ) : (
                  <div className="text-zinc-500 font-normal pt-0.5">
                    No medical information provided
                  </div>
                )}
              </div>

              {/* Additional Support */}
              <div className="space-y-1.5">
                <span className="text-xs text-zinc-500 font-medium block">Additional support</span>
                {app.needsExtraSupport ? (
                  <div className="p-3 bg-rose-50/70 border border-rose-200/60 rounded-xl text-rose-800 leading-relaxed font-medium">
                    {app.supportNotes || 'Requires extra support attention'}
                  </div>
                ) : (
                  <div className="text-zinc-500 font-normal pt-0.5">
                    No additional support noted
                  </div>
                )}
              </div>

              {/* Consent */}
              <div className="space-y-1.5">
                <span className="text-xs text-zinc-500 font-medium block">Consent</span>
                {(() => {
                  const isConsentConfirmed = app.detailsConfirmed || app.informationConfirmed || app.child?.detailsConfirmed || app.child?.informationConfirmed || (app.status && app.status !== 'incomplete');
                  return isConsentConfirmed ? (
                    <div className="flex items-center space-x-2 py-0.5 text-zinc-700 font-normal">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Consent confirmed</span>
                    </div>
                  ) : (
                    <div className="text-zinc-500 font-normal pt-0.5">
                      Consent not recorded
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* CONTACTS: PARENT / GUARDIAN & AUTHORISED PICKUP */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* PARENT / GUARDIAN CARD */}
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 flex flex-col justify-between shadow-none">
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-[#18181B] pb-3 border-b border-[#EAE8E1]/60">
                  Parent / guardian
                </h2>

                <div className="flex items-start space-x-3.5">
                  <SafeImage
                    src={app.parent?.photoUrl}
                    alt={app.parent?.fullName || 'Parent'}
                    className="w-14 h-14 rounded-xl object-cover border border-[#EAE8E1] shrink-0"
                    containerClassName="w-14 h-14 rounded-xl"
                    fallbackComponent={
                      <div className="w-14 h-14 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 font-semibold text-lg shrink-0">
                        <span>{app.parent?.fullName?.charAt(0) || 'P'}</span>
                      </div>
                    }
                  />
                  <div className="space-y-1 flex-1 min-w-0">
                    <span className="font-semibold text-zinc-900 text-sm block truncate">{app.parent?.fullName}</span>
                    <span className="text-xs text-zinc-500 block">Parent / guardian</span>
                    {app.parent?.isWorker && (
                      <span className="inline-block bg-zinc-100 text-zinc-600 text-[10px] font-medium px-2 py-0.5 rounded border border-zinc-200">
                        Worker: {app.parent.department || 'General'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-xs text-zinc-600 pt-3 border-t border-[#EAE8E1]/40">
                  <div className="flex items-center space-x-2">
                    <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="font-medium text-zinc-800">{app.parent?.phone}</span>
                  </div>
                  {app.parent?.email && (
                    <div className="flex items-center space-x-2">
                      <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="font-medium text-zinc-800 truncate">{app.parent.email}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 flex flex-wrap gap-2 border-t border-[#EAE8E1]/40 mt-4">
                {app.parent?.whatsapp && (
                  <a 
                    href={`https://wa.me/${app.parent.whatsapp.replace(/\D/g, '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-emerald-700 text-xs font-medium rounded-xl transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>
                )}
                {app.parent?.email && (
                  <a 
                    href={`mailto:${app.parent.email}`}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 text-xs font-medium rounded-xl transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email</span>
                  </a>
                )}
              </div>
            </div>

            {/* AUTHORISED PICKUP CARD */}
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 flex flex-col justify-between shadow-none">
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-[#18181B] pb-3 border-b border-[#EAE8E1]/60">
                  Authorised pickup
                </h2>

                {app.pickupPeople && app.pickupPeople.length > 0 ? (
                  app.pickupPeople.slice(0, 1).map((person: any) => (
                    <div key={person.id} className="space-y-3.5">
                      <div className="flex items-start space-x-3.5">
                        <SafeImage
                          src={person.photoUrl}
                          alt={person.fullName}
                          className="w-14 h-14 rounded-xl object-cover border border-[#EAE8E1] shrink-0"
                          containerClassName="w-14 h-14 rounded-xl"
                          fallbackComponent={
                            <div className="w-14 h-14 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 font-semibold text-lg shrink-0">
                              <span>{person.fullName?.charAt(0) || 'P'}</span>
                            </div>
                          }
                        />
                        <div className="space-y-1 flex-1 min-w-0">
                          <span className="font-semibold text-zinc-900 text-sm block truncate">{person.fullName}</span>
                          <span className="text-xs text-zinc-500 block">
                            {person.relationship || 'Pickup person'}
                          </span>
                          <div className="pt-0.5">
                            {person.approved ? (
                              <div className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200/60 rounded text-[11px] font-medium text-emerald-800">
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>ID verified</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center space-x-1 px-2 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-[11px] font-medium text-zinc-700">
                                <span>Approved by parent</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs text-zinc-600 pt-3 border-t border-[#EAE8E1]/40">
                        <div className="flex items-center space-x-2">
                          <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="font-medium text-zinc-800">{person.phone}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-xs text-zinc-400">
                    No authorised pickup person assigned.
                  </div>
                )}
              </div>

              {app.pickupPeople && app.pickupPeople.length > 0 && (
                <div className="pt-4 flex flex-wrap gap-2 border-t border-[#EAE8E1]/40 mt-4">
                  {app.pickupPeople[0].whatsapp && (
                    <a 
                      href={`https://wa.me/${app.pickupPeople[0].whatsapp.replace(/\D/g, '')}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-emerald-700 text-xs font-medium rounded-xl transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  )}
                  <a 
                    href={`tel:${app.pickupPeople[0].phone}`}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 text-xs font-medium rounded-xl transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* REVIEW HISTORY */}
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4 shadow-none">
            <h2 className="text-sm font-semibold text-[#18181B] pb-3 border-b border-[#EAE8E1]/60">
              Review history
            </h2>

            {app.history && app.history.length > 0 ? (
              <div className="divide-y divide-[#EAE8E1]/60 space-y-3">
                {app.history.map((hist: any, index: number) => (
                  <div key={hist.id || index} className="pt-3 first:pt-0 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-zinc-900">
                        {hist.action === 'Application submitted' ? 'Registration submitted' : hist.action}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {new Date(hist.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    <p className="text-zinc-500 text-xs">
                      {hist.action === 'Application submitted' ? 'Submitted by' : 'By'} {hist.by}
                    </p>

                    {hist.note && (
                      <div className="mt-1 p-2.5 bg-zinc-50 border border-zinc-200/60 rounded-lg text-xs text-zinc-600 text-left">
                        "{hist.note}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400">No review history logs recorded.</p>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: DECISION PANEL (5 COLUMNS, STICKY ON DESKTOP) */}
        <div className="lg:col-span-5 space-y-6 bg-white border border-[#EAE8E1] rounded-2xl p-6 lg:sticky lg:top-6 shadow-none">
          
          <div className="space-y-1 pb-4 border-b border-[#EAE8E1]/60">
            <h2 className="text-base font-semibold text-[#18181B]">Decision</h2>
            <p className="text-xs text-zinc-500">
              Choose an outcome for this registration.
            </p>
          </div>

          {/* STATUS STRIP (CURRENT STATUS, EVENT ACCESS, ATTENDANCE) */}
          <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3.5 text-xs grid grid-cols-3 gap-2 text-center divide-x divide-[#EAE8E1]">
            <div className="pr-1">
              <span className="text-zinc-400 text-[11px] font-medium block">Current status</span>
              <span className="font-semibold text-zinc-900 mt-1 block truncate">{getReviewStatusLabel()}</span>
            </div>
            <div className="px-1">
              <span className="text-zinc-400 text-[11px] font-medium block">Event access</span>
              <span className="font-semibold text-zinc-900 mt-1 block truncate">{getEventAccessLabel()}</span>
            </div>
            <div className="pl-1">
              <span className="text-zinc-400 text-[11px] font-medium block">Attendance</span>
              <span className="font-semibold text-zinc-900 mt-1 block truncate">{getAttendanceLabel()}</span>
            </div>
          </div>

          {/* ACTION WORKSPACE PER CURRENT STATE */}
          <div className="space-y-4">
            
            {/* 1. ARCHIVED / REMOVED STATE */}
            {isRemoved && (
              <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-amber-900">Registration archived</h3>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      This registration is removed from active event rosters. You can restore it to review, or Super Admin can prepare it for permanent deletion.
                    </p>
                  </div>
                </div>
                <div className="space-y-2 pt-1">
                  <Button
                    type="button"
                    onClick={() => setIsRestoreModalOpen(true)}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Restore registration
                  </Button>
                  
                  {effectiveSuperAdmin && (
                    <div className="flex gap-2">
                      {isAttendingChild && (
                        <button
                          type="button"
                          onClick={() => setIsPrepareDeleteModalOpen(true)}
                          className="flex-1 py-2 bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 font-medium rounded-xl text-xs transition-all cursor-pointer"
                        >
                          Prepare for deletion
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsPermanentDeleteModalOpen(true)}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl text-xs transition-all cursor-pointer"
                      >
                        Delete permanently
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. ATTENDING CHILD STATE (TERMINAL OPERATIONAL STATE WITH SUPER ADMIN RECOVERY) */}
            {!isRemoved && isAttendingChild && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-[#C59B27] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-zinc-800">Child in attendance</h3>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      This child is currently checked in or picked up at the event. Review decisions cannot be reopened or revoked while active.
                    </p>
                  </div>
                </div>

                {effectiveSuperAdmin && (
                  <div className="pt-2 border-t border-zinc-200 space-y-1.5">
                    <span className="text-[11px] text-zinc-500 font-medium block">
                      Super Admin recovery: Use Reset event progress to restart workflow for test records.
                    </span>
                    <Button
                      type="button"
                      onClick={() => {
                        setResetMode('review');
                        setIsResetProgressModalOpen(true);
                      }}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset event progress</span>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* 3. UNDER REVIEW / REOPENED REVIEW */}
            {!isRemoved && !isAttendingChild && ['under_review', 'review_reopened'].includes(app.status) && (
              <div className="space-y-4">
                <div className="bg-[#FAF8F3] border border-[#E5D5AE]/40 rounded-xl p-3.5 text-xs text-[#715D3A] leading-relaxed space-y-1">
                  <p className="font-semibold text-xs text-[#8C6D23]">Awaiting decision</p>
                  <p>Choose an outcome when you have finished reviewing the registration.</p>
                </div>
                
                {app.child.needsAgeReview && (
                  <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center space-x-2 text-amber-800 font-semibold text-xs">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Attention required</span>
                    </div>
                    <div className="flex items-center space-x-2.5 pt-1">
                      <input
                        type="checkbox"
                        id="ageConfirm"
                        checked={ageChecked}
                        onChange={(e) => setAgeChecked(e.target.checked)}
                        className="w-4 h-4 rounded text-[#C59B27] border-amber-300 focus:ring-[#C59B27]"
                      />
                      <label htmlFor="ageConfirm" className="text-xs text-zinc-700 font-medium cursor-pointer select-none">
                        Age group checked & confirmed
                      </label>
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
                  <Button
                    type="button"
                    onClick={() => {
                      if (app.child.needsAgeReview && !ageChecked) {
                        showError('Action Blocked', 'Please confirm that you have checked the child\'s age group first.');
                        return;
                      }
                      setDecision('selected');
                      setIsSelectModalOpen(true);
                    }}
                    variant="primary"
                    className="w-full p-3 text-left rounded-xl flex items-center justify-between font-semibold text-xs cursor-pointer"
                  >
                    <span>Select for event</span>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      setDecision('waiting_list');
                      setIsWaitlistModalOpen(true);
                    }}
                    className="w-full p-3 text-left rounded-xl border border-[#EAE8E1] hover:border-zinc-300 bg-white text-zinc-800 flex items-center justify-between font-medium text-xs cursor-pointer"
                  >
                    <span>Move to waiting list</span>
                    <Hourglass className="w-4 h-4 text-zinc-500" />
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setDecision('not_selected');
                      setIsNotSelectedModalOpen(true);
                    }}
                    className="w-full p-3 text-left rounded-xl border border-transparent hover:border-red-200 bg-transparent text-red-600 hover:bg-red-50/50 flex items-center justify-between font-medium text-xs cursor-pointer transition-colors"
                  >
                    <span>Mark as not selected</span>
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            )}

            {/* 4. SELECTED STATUS (PENDING EVENT PASS GENERATION) */}
            {!isRemoved && !isAttendingChild && app.status === 'selected' && (
              <div className="space-y-4">
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3.5 text-xs text-emerald-800 leading-relaxed space-y-1">
                  <p className="font-semibold text-xs">Selected for event</p>
                  <p>This child has been selected. You can now generate their digital event pass.</p>
                </div>

                <div className="space-y-2.5">
                  <Button
                    type="button"
                    onClick={() => setIsGeneratePassModalOpen(true)}
                    variant="primary"
                    className="w-full p-3 text-left rounded-xl flex items-center justify-between font-semibold text-xs cursor-pointer"
                  >
                    <span>Issue digital event pass</span>
                    <QrCode className="w-4 h-4 text-white" />
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      setDecision('waiting_list');
                      setIsWaitlistModalOpen(true);
                    }}
                    className="w-full p-3 text-left rounded-xl border border-[#EAE8E1] hover:border-zinc-300 bg-white text-zinc-800 flex items-center justify-between font-medium text-xs cursor-pointer"
                  >
                    <span>Move to waiting list</span>
                    <Hourglass className="w-4 h-4 text-zinc-500" />
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setDecision('not_selected');
                      setIsNotSelectedModalOpen(true);
                    }}
                    className="w-full p-3 text-left rounded-xl border border-transparent hover:border-red-200 bg-transparent text-red-600 hover:bg-red-50/50 flex items-center justify-between font-medium text-xs cursor-pointer transition-colors"
                  >
                    <span>Mark as not selected</span>
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            )}

            {/* 5. PASS READY STATUS */}
            {!isRemoved && !isAttendingChild && app.status === 'pass_ready' && (
              <div className="space-y-4">
                <div className="bg-emerald-50/80 border border-emerald-100 rounded-xl p-3.5 text-xs text-emerald-800 leading-relaxed space-y-1">
                  <p className="font-semibold text-xs">Event pass issued</p>
                  <p>The digital event pass is active and available to the parent.</p>
                </div>

                <div className="max-w-[300px] mx-auto py-1">
                  <EventPassPreviewCard
                    childName={app.child.fullName}
                    ageGroup={app.child.ageGroup || 'Section'}
                    status="Pass ready"
                    photoUrl={app.child.photoUrl || undefined}
                    passReference={app.passReference}
                  />
                </div>

                <div className="pt-2 border-t border-[#EAE8E1]/60 flex gap-2">
                  <Button
                    type="button"
                    onClick={() => setIsRevokeModalOpen(true)}
                    className="flex-1 py-2.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-medium rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Revoke pass</span>
                  </Button>

                  <Button
                    type="button"
                    onClick={() => setIsReopenModalOpen(true)}
                    className="flex-1 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-medium rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Reopen review</span>
                  </Button>
                </div>
              </div>
            )}

            {/* 6. WAITING LIST STATUS */}
            {!isRemoved && !isAttendingChild && app.status === 'waiting_list' && (
              <div className="space-y-4">
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-xs text-zinc-700 leading-relaxed space-y-1">
                  <p className="font-semibold text-xs">Waiting list</p>
                  <p>This child is currently on the waiting list. You can choose to admit them if space opens up.</p>
                </div>

                <div className="space-y-2.5">
                  <Button
                    type="button"
                    onClick={() => {
                      setDecision('selected');
                      setIsSelectModalOpen(true);
                    }}
                    variant="primary"
                    className="w-full p-3 text-left rounded-xl flex items-center justify-between font-semibold text-xs cursor-pointer"
                  >
                    <span>Admit & select child</span>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setDecision('not_selected');
                      setIsNotSelectedModalOpen(true);
                    }}
                    className="w-full p-3 text-left rounded-xl border border-transparent hover:border-red-200 bg-transparent text-red-600 hover:bg-red-50/50 flex items-center justify-between font-medium text-xs cursor-pointer transition-colors"
                  >
                    <span>Mark as not selected</span>
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            )}

            {/* 7. NOT SELECTED STATUS */}
            {!isRemoved && !isAttendingChild && app.status === 'not_selected' && (
              <div className="space-y-4">
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-xs text-zinc-700 leading-relaxed space-y-1">
                  <p className="font-semibold text-xs">Not selected</p>
                  <p>This registration is marked as not selected. You can reopen review to reconsider.</p>
                </div>

                <Button
                  type="button"
                  onClick={() => setIsReopenModalOpen(true)}
                  className="w-full p-3 text-left rounded-xl border border-[#EAE8E1] hover:border-zinc-300 bg-white text-zinc-800 flex items-center justify-between font-medium text-xs cursor-pointer"
                >
                  <span>Reopen review for reconsideration</span>
                  <Clock className="w-4 h-4 text-zinc-500" />
                </Button>
              </div>
            )}

            {/* MORE ▾ ACTIONS MENU (FOR ALL NON-REMOVED STATES) */}
            {!isRemoved && (
              <div className="pt-3 border-t border-[#EAE8E1]/60 flex items-center justify-between relative">
                <span className="text-xs text-zinc-400 font-medium">Additional actions</span>
                
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsDecisionMoreOpen(!isDecisionMoreOpen)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 px-2.5 py-1 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
                  >
                    <span>More</span>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                  </button>

                  {isDecisionMoreOpen && (
                    <div className="absolute right-0 mt-1.5 w-52 bg-white border border-[#EAE8E1] rounded-xl shadow-lg p-1.5 z-20 space-y-1 animate-scale-in text-left">
                      {/* Revoke pass if active */}
                      {(app.status === 'pass_ready' || app.hasPass) && !isAttendingChild && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDecisionMoreOpen(false);
                            setIsRevokeModalOpen(true);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 rounded-lg cursor-pointer"
                        >
                          Revoke event pass
                        </button>
                      )}

                      {/* Reopen review if already decided */}
                      {!['under_review', 'review_reopened'].includes(app.status) && !isAttendingChild && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDecisionMoreOpen(false);
                            setIsReopenModalOpen(true);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 rounded-lg cursor-pointer"
                        >
                          Reopen review
                        </button>
                      )}

                      {/* Super Admin Reset */}
                      {effectiveSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDecisionMoreOpen(false);
                            setIsResetProgressModalOpen(true);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-amber-800 hover:bg-amber-50/60 rounded-lg font-medium cursor-pointer"
                        >
                          Reset event progress
                        </button>
                      )}

                      <div className="border-t border-[#EAE8E1] my-1" />

                      {/* Remove application */}
                      {!isAttendingChild && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDecisionMoreOpen(false);
                            setIsRemoveModalOpen(true);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50/60 rounded-lg cursor-pointer"
                        >
                          Remove from this event
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* INTERNAL NOTES */}
          <div className="space-y-2 pt-4 border-t border-[#EAE8E1]/60">
            <div>
              <span className="text-xs text-zinc-700 font-semibold block">
                Internal notes
              </span>
              <span className="text-[11px] text-zinc-400 block mt-0.5">
                Visible to the event team only.
              </span>
            </div>
            <textarea
              value={noteToTeam}
              onChange={(e) => setNoteToTeam(e.target.value)}
              placeholder="Add internal notes for other reviewers..."
              rows={3}
              className="w-full p-3 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all placeholder:text-zinc-400 text-zinc-800 font-medium"
            />
            <div className="flex justify-end pt-1">
              <Button
                type="button"
                onClick={handleSaveNotes}
                disabled={saving}
                className="px-4 py-2 bg-white hover:bg-zinc-50 text-zinc-800 border border-[#EAE8E1] rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                {saving ? 'Saving notes...' : 'Save notes'}
              </Button>
            </div>
          </div>

          {/* MESSAGE TO PARENT */}
          <div className="space-y-2.5 pt-4 border-t border-[#EAE8E1]/60">
            <span className="text-xs text-zinc-700 font-semibold block">
              Message to parent
            </span>
            
            <div className="p-3.5 bg-zinc-50 border border-[#EAE8E1] rounded-xl text-xs text-zinc-700 leading-relaxed font-normal whitespace-pre-wrap">
              {getNotificationPreview() || "Select an action above to preview the message."}
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="sendNotification"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
                className="w-4 h-4 rounded text-[#C59B27] border-[#EAE8E1] focus:ring-[#C59B27]"
              />
              <label htmlFor="sendNotification" className="text-xs text-zinc-700 font-medium cursor-pointer select-none">
                Notify parent
              </label>
            </div>
          </div>

        </div>

      </div>

      {/* 4. FOOTER ACTIONS BAR */}
      <div className="border-t border-[#EAE8E1] pt-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-white border border-[#EAE8E1] rounded-xl hover:bg-zinc-50 text-zinc-700 text-xs font-medium transition-colors cursor-pointer"
        >
          {backLabel || 'Back to review'}
        </button>
      </div>

      {/* ========================================================
          CONFIRMATION MODALS
          ======================================================== */}

      {/* REOPEN REVIEW MODAL */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-amber-700">
              <AlertCircle className="w-6 h-6 shrink-0 text-amber-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">Reopen review?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to reopen the review for <strong>{app.child.fullName}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3.5 text-xs text-amber-800 leading-relaxed space-y-1.5 text-left">
              <p className="font-semibold">Important consequences:</p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>The child's status will revert to <strong>Under review</strong> immediately.</li>
                <li>The digital event pass will be <strong>revoked</strong> and no longer valid for check-in.</li>
                <li>The parent will be notified to check their dashboard.</li>
              </ul>
            </div>

            <div className="space-y-2 text-left">
              <label htmlFor="reopenReason" className="text-xs font-semibold text-zinc-700 block">
                Reason for reopening
              </label>
              <textarea
                id="reopenReason"
                rows={3}
                placeholder="e.g. Discrepancy in medical notes, parent requested update, age limit check required..."
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                className="w-full p-3 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50 text-zinc-800 font-medium"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={reopening}
                onClick={() => {
                  setIsReopenModalOpen(false);
                  setReopenReason('');
                }}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reopening}
                onClick={handleConfirmReopen}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white border border-amber-600 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center space-x-1.5 shadow-none cursor-pointer"
              >
                {reopening ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Reopening...</span>
                  </>
                ) : (
                  <span>Reopen review</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELECT CONFIRMATION MODAL */}
      {isSelectModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-[#C59B27]">
              <CheckCircle2 className="w-6 h-6 shrink-0 text-[#C59B27]" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">Select child for event?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to select <strong>{app.child.fullName}</strong> for <strong>{app.child.ageGroup || 'Section'}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3.5 text-xs text-emerald-800 leading-relaxed space-y-1.5 text-left">
              <p className="font-semibold text-xs">Consequences:</p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>Child's status will update to <strong>Selected</strong> instantly.</li>
                <li>You can subsequently generate their digital QR Event Pass.</li>
                <li>The parent will be notified to view their selection status online.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsSelectModalOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSelect}
                className="px-4 py-2 bg-[#C59B27] hover:bg-[#B08921] text-white rounded-xl text-xs font-semibold transition-all shadow-none cursor-pointer"
              >
                Confirm selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WAITLIST CONFIRMATION MODAL */}
      {isWaitlistModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-zinc-700">
              <Hourglass className="w-6 h-6 shrink-0 text-zinc-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">Move child to waiting list?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to move <strong>{app.child.fullName}</strong> to the event waiting list?
                </p>
              </div>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-xs text-zinc-700 leading-relaxed space-y-1.5 text-left">
              <p className="font-semibold text-xs">Consequences:</p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>Child's status will transition to <strong>Waiting list</strong>.</li>
                <li>If the child previously had an active event pass, it will be <strong>revoked</strong>.</li>
                <li>The parent will be informed that they are on the waiting list pending open slots.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsWaitlistModalOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWaitlist}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none cursor-pointer"
              >
                Confirm waiting list
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOT SELECTED CONFIRMATION MODAL */}
      {isNotSelectedModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-red-700">
              <XCircle className="w-6 h-6 shrink-0 text-red-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">Mark as not selected?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to mark the registration for <strong>{app.child.fullName}</strong> as not selected?
                </p>
              </div>
            </div>

            <div className="bg-red-50/50 border border-red-100 rounded-xl p-3.5 text-xs text-red-800 leading-relaxed space-y-1.5 text-left">
              <p className="font-semibold text-xs">Consequences:</p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>Child's status transitions to <strong>Not selected</strong> immediately.</li>
                <li>Active digital event passes are instantly revoked.</li>
                <li>Parent receives an update advising of selection outcomes.</li>
              </ul>
            </div>

            <div className="space-y-2 text-left">
              <label htmlFor="notSelectedReason" className="text-xs font-semibold text-zinc-700 block">
                Reason for decision
              </label>
              <textarea
                id="notSelectedReason"
                rows={3}
                placeholder="e.g. Over maximum capacity in this age group, registered in wrong event pool..."
                value={notSelectedReason}
                onChange={(e) => setNotSelectedReason(e.target.value)}
                className="w-full p-3 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all bg-zinc-50 text-zinc-800 font-medium"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsNotSelectedModalOpen(false);
                  setNotSelectedReason('');
                }}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNotSelected}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white border border-red-600 rounded-xl text-xs font-semibold transition-all shadow-none cursor-pointer"
              >
                Confirm not selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GENERATE EVENT PASS MODAL */}
      {isGeneratePassModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-emerald-700">
              <QrCode className="w-6 h-6 shrink-0 text-emerald-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">Issue digital event pass?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to generate and issue the secure digital Event Pass for <strong>{app.child.fullName}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3.5 text-xs text-emerald-800 leading-relaxed space-y-1.5 text-left">
              <p className="font-semibold text-xs">Consequences:</p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>A secure cryptographic check-in token is created.</li>
                <li>A premium printable & scannable QR Pass is activated on the parent dashboard.</li>
                <li>Child registration enters <strong>Pass ready</strong> status, ready for physical gate scanning.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsGeneratePassModalOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGeneratePass}
                className="px-4 py-2 bg-[#C59B27] hover:bg-[#B08921] text-white rounded-xl text-xs font-semibold transition-all shadow-none cursor-pointer"
              >
                Issue pass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVOKE PASS MODAL */}
      {isRevokeModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-red-700">
              <AlertCircle className="w-6 h-6 shrink-0 text-red-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">Revoke event pass?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to revoke the digital event pass for <strong>{app.child.fullName}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-red-50/50 border border-red-100 rounded-xl p-3.5 text-xs text-red-800 leading-relaxed space-y-1 text-left">
              <p className="font-semibold">Important notice:</p>
              <p className="text-xs text-red-700">
                This digital pass reference will be disabled. It will no longer scan validly at check-in terminals, and parents will see that the pass has been withdrawn.
              </p>
            </div>

            <div className="space-y-2 text-left">
              <label htmlFor="revokeReason" className="text-xs font-semibold text-zinc-700 block">
                Reason for revocation
              </label>
              <textarea
                id="revokeReason"
                rows={3}
                placeholder="Specify the reason for revoking this digital event pass..."
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="w-full p-3 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all bg-zinc-50 text-zinc-800 font-medium"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={revoking}
                onClick={() => {
                  setIsRevokeModalOpen(false);
                  setRevokeReason('');
                }}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={revoking}
                onClick={handleConfirmRevokePass}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white border border-red-600 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center space-x-1.5 shadow-none cursor-pointer"
              >
                {revoking ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Revoking...</span>
                  </>
                ) : (
                  <span>Revoke pass</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPER ADMIN: RESET EVENT PROGRESS MODAL */}
      {isResetProgressModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-amber-800">
              <RotateCcw className="w-6 h-6 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-1 text-left">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-zinc-900">
                    Reset {app.child.fullName}'s event progress?
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 uppercase tracking-wide">
                    Super Admin
                  </span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  This will clear this child's current event progress so the registration can be tested or reviewed again. Historical safety and audit records will remain.
                </p>
              </div>
            </div>

            {/* Mode selection radio boxes */}
            <div className="space-y-3 text-left">
              <label className="text-xs font-semibold text-zinc-700 block">Select reset mode:</label>
              
              <div 
                onClick={() => setResetMode('review')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  resetMode === 'review' ? 'border-[#C59B27] bg-[#FAF8F3]' : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="singleResetMode"
                    checked={resetMode === 'review'}
                    onChange={() => setResetMode('review')}
                    className="mt-0.5 text-[#C59B27] focus:ring-[#C59B27]"
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 block">RESET TO REVIEW</span>
                    <ul className="text-xs text-zinc-600 list-disc pl-4 mt-1 space-y-0.5">
                      <li>Revoke pass</li>
                      <li>Clear attendance, check-in and pickup timestamps</li>
                      <li>Set registration back to Under review</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div 
                onClick={() => setResetMode('attendance')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  resetMode === 'attendance' ? 'border-[#C59B27] bg-[#FAF8F3]' : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="singleResetMode"
                    checked={resetMode === 'attendance'}
                    onChange={() => setResetMode('attendance')}
                    className="mt-0.5 text-[#C59B27] focus:ring-[#C59B27]"
                  />
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 block">RESET ATTENDANCE ONLY</span>
                    <ul className="text-xs text-zinc-600 list-disc pl-4 mt-1 space-y-0.5">
                      <li>Keep current review decision and Selected status</li>
                      <li>Keep active pass valid for re-testing check-in</li>
                      <li>Clear check-in, inside, and pickup operational records</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={resettingProgress}
                onClick={() => setIsResetProgressModalOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resettingProgress}
                onClick={handleConfirmResetProgress}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center gap-1.5 cursor-pointer"
              >
                {resettingProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Reset progress</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPER ADMIN: PREPARE FOR PERMANENT DELETION MODAL */}
      {isPrepareDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-amber-700">
              <RotateCcw className="w-6 h-6 shrink-0 text-amber-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">Prepare for permanent deletion?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  This will clear event-specific operational records and passes for <strong>{app.child.fullName}</strong> so that this removed test record can be safely purged.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={preparingDelete}
                onClick={() => setIsPrepareDeleteModalOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={preparingDelete}
                onClick={handleConfirmPrepareDelete}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center gap-1.5 cursor-pointer"
              >
                {preparingDelete ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Prepare for deletion</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPER ADMIN: PERMANENT DELETE MODAL */}
      {isPermanentDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-[#18181B]">
            <div className="flex items-start gap-3 text-red-700">
              <ShieldAlert className="w-6 h-6 shrink-0 text-red-600 mt-0.5" />
              <div className="space-y-1 text-left">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-zinc-900">
                    Delete {app.child.fullName} permanently?
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800 uppercase tracking-wide">
                    Super Admin
                  </span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  This child profile and associated personal information will be permanently removed and cannot be restored.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-left bg-red-50/60 border border-red-200/60 p-3.5 rounded-xl">
              <label className="text-xs font-semibold text-red-900 block">
                Type DELETE to continue:
              </label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="DELETE"
                className="w-full p-2 text-xs rounded-lg border border-red-300 focus:outline-none focus:ring-1 focus:ring-red-600 font-mono tracking-wider text-center"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={permanentDeleting}
                onClick={() => {
                  setIsPermanentDeleteModalOpen(false);
                  setDeleteConfirmationText('');
                }}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={permanentDeleting || deleteConfirmationText !== 'DELETE'}
                onClick={handleConfirmPermanentDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all shadow-none disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
              >
                {permanentDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Delete permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REMOVE APPLICATION MODAL */}
      {isRemoveModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-zinc-800">
            <div className="flex items-start gap-3 text-red-700">
              <AlertCircle className="w-6 h-6 shrink-0 text-red-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">
                  Remove {app.child.fullName} from this event?
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  The registration will move to Removed and can be restored later.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-left">
              <label htmlFor="removeReason" className="text-xs font-semibold text-zinc-700 block">
                Reason for removal
              </label>
              <textarea
                id="removeReason"
                rows={3}
                placeholder="Specify the reason for archiving this registration..."
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                className="w-full p-3 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all bg-zinc-50 text-zinc-800 font-medium"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={removing}
                onClick={() => {
                  setIsRemoveModalOpen(false);
                  setRemoveReason('');
                }}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={handleConfirmRemove}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white border border-red-600 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center space-x-1.5 shadow-none cursor-pointer"
              >
                {removing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>Remove application</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESTORE REGISTRATION MODAL */}
      {isRestoreModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-zinc-800">
            <div className="flex items-start gap-3 text-emerald-700">
              <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">Restore registration?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to restore the registration for <strong>{app.child.fullName}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3.5 text-xs text-emerald-800 leading-relaxed space-y-1 text-left">
              <p className="font-semibold">Effect of restoration:</p>
              <p className="text-xs text-emerald-700">
                The registration is reactivated and restored to event rosters. Its status will reset to <strong>Under review</strong> so you can make the appropriate decision.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={restoring}
                onClick={() => setIsRestoreModalOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={restoring}
                onClick={handleConfirmRestore}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 shadow-none cursor-pointer"
              >
                {restoring ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <span>Restore registration</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT CHILD DETAILS MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-5 max-h-[90vh] overflow-y-auto animate-scale-in text-zinc-800">
            <div className="flex items-start justify-between border-b border-[#EAE8E1]/80 pb-3">
              <h3 className="text-base font-semibold text-zinc-900">Edit child details</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-zinc-600 block">Full name</label>
                  <input
                    type="text"
                    required
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-600 block">Gender</label>
                  <select
                    value={editForm.gender}
                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white font-medium"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-600 block">Date of birth</label>
                  <input
                    type="date"
                    required
                    value={editForm.dateOfBirth}
                    onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-600 block">School class / grade</label>
                  <input
                    type="text"
                    placeholder="e.g. Primary 2"
                    value={editForm.schoolClass}
                    onChange={(e) => setEditForm({ ...editForm, schoolClass: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-600 block">School name</label>
                  <input
                    type="text"
                    placeholder="e.g. Koinonia Academy"
                    value={editForm.schoolName}
                    onChange={(e) => setEditForm({ ...editForm, schoolName: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white"
                  />
                </div>
              </div>

              <div className="border-t border-[#EAE8E1]/60 pt-3 space-y-3">
                <div className="flex items-center space-x-2.5">
                  <input
                    type="checkbox"
                    id="hasMedicalNotes"
                    checked={editForm.hasMedicalNotes}
                    onChange={(e) => setEditForm({ ...editForm, hasMedicalNotes: e.target.checked })}
                    className="w-4 h-4 rounded text-[#C59B27] border-zinc-300 focus:ring-[#C59B27]"
                  />
                  <label htmlFor="hasMedicalNotes" className="font-medium text-zinc-700 cursor-pointer select-none">
                    Child has medical conditions or allergies
                  </label>
                </div>

                {editForm.hasMedicalNotes && (
                  <div className="space-y-1 pl-6.5">
                    <label className="text-xs font-medium text-zinc-600 block">Medical details</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="List details of any allergies, asthma, medication or chronic conditions..."
                      value={editForm.medicalNotes}
                      onChange={(e) => setEditForm({ ...editForm, medicalNotes: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white"
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-[#EAE8E1]/60 pt-3 space-y-3">
                <div className="flex items-center space-x-2.5">
                  <input
                    type="checkbox"
                    id="needsExtraSupport"
                    checked={editForm.needsExtraSupport}
                    onChange={(e) => setEditForm({ ...editForm, needsExtraSupport: e.target.checked })}
                    className="w-4 h-4 rounded text-[#C59B27] border-zinc-300 focus:ring-[#C59B27]"
                  />
                  <label htmlFor="needsExtraSupport" className="font-medium text-zinc-700 cursor-pointer select-none">
                    Child requires special support or assistance
                  </label>
                </div>

                {editForm.needsExtraSupport && (
                  <div className="space-y-1 pl-6.5">
                    <label className="text-xs font-medium text-zinc-600 block">Support details</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Specify support, learning, behavioral or developmental accommodations required..."
                      value={editForm.supportNotes}
                      onChange={(e) => setEditForm({ ...editForm, supportNotes: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Parent Profile section */}
              <div className="border-t border-[#EAE8E1]/60 pt-4 space-y-3">
                <h4 className="text-xs font-semibold text-zinc-800">Parent / guardian details</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium text-zinc-600 block">Parent full name</label>
                    <input
                      type="text"
                      required
                      value={editForm.parentFullName}
                      onChange={(e) => setEditForm({ ...editForm, parentFullName: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-600 block">Parent phone</label>
                    <input
                      type="text"
                      required
                      value={editForm.parentPhone}
                      onChange={(e) => setEditForm({ ...editForm, parentPhone: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-600 block">Parent WhatsApp</label>
                    <input
                      type="text"
                      value={editForm.parentWhatsApp}
                      onChange={(e) => setEditForm({ ...editForm, parentWhatsApp: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white font-medium"
                    />
                  </div>

                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium text-zinc-600 block">Home address</label>
                    <textarea
                      rows={2}
                      value={editForm.parentHomeAddress}
                      onChange={(e) => setEditForm({ ...editForm, parentHomeAddress: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Authorized Pickup section */}
              <div className="border-t border-[#EAE8E1]/60 pt-4 space-y-3">
                <h4 className="text-xs font-semibold text-zinc-800">Authorised pickup</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium text-zinc-600 block">Pickup person full name</label>
                    <input
                      type="text"
                      value={editForm.pickupPersonName}
                      onChange={(e) => setEditForm({ ...editForm, pickupPersonName: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-600 block">Relationship to child</label>
                    <input
                      type="text"
                      placeholder="e.g. Uncle, Aunt, Driver..."
                      value={editForm.pickupPersonRelationship}
                      onChange={(e) => setEditForm({ ...editForm, pickupPersonRelationship: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-600 block">Pickup phone number</label>
                    <input
                      type="text"
                      value={editForm.pickupPersonPhone}
                      onChange={(e) => setEditForm({ ...editForm, pickupPersonPhone: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-white font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-[#EAE8E1]/60">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#C59B27] hover:bg-[#B08921] text-white rounded-xl text-xs font-semibold transition-all shadow-none flex items-center space-x-1.5 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save details</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

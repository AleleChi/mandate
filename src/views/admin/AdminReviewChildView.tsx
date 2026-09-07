import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  AlertCircle, 
  User, 
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
  MapPin,
  ChevronDown,
  QrCode
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
}

export const AdminReviewChildView: React.FC<AdminReviewChildViewProps> = ({
  applicationId,
  onBack,
  onSave,
  backLabel
}) => {
  const { showError, showSuccess } = useNotification();
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

  const handleConfirmSelect = async () => {
    setSaving(true);
    try {
      const res = await api.admin.reviewApplication(applicationId, {
        status: 'selected',
        noteToTeam: 'Selected for event.',
        sendNotification: true
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
        noteToTeam: 'Added to waiting list.',
        sendNotification: true
      });
      if (res.success) {
        showSuccess('Added to Waiting List', `${app?.child?.fullName || 'Child'} added to waiting list.`);
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
    if (!notSelectedReason.trim()) {
      showError('Reason Required', 'Please provide a reason.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.admin.reviewApplication(applicationId, {
        status: 'not_selected',
        noteToTeam: notSelectedReason,
        sendNotification: true
      });
      if (res.success) {
        showSuccess('Marked Not Selected', `${app?.child?.fullName || 'Child'} marked as not selected.`);
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

  const handleConfirmGeneratePass = async () => {
    setIsGeneratePassModalOpen(false);
    await handleGeneratePass();
  };

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
        if (['selected', 'pass_ready', 'checked_in', 'picked_up'].includes(currentStatus)) {
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

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (decision === 'under_review' && !noteToTeam.trim()) {
      showError('Note Required', 'Please add a note for review to clarify what needs revision.');
      return;
    }

    setSaving(true);
    try {
      const res = await api.admin.reviewApplication(applicationId, {
        status: decision,
        noteToTeam,
        sendNotification
      });

      if (res.success) {
        showSuccess(
          'Decision Saved', 
          `Registration status for ${app.child.fullName} is now updated.`
        );
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Submission Failed', parsed.message || 'Could not save decision.');
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

  const handleConfirmRemove = async () => {
    if (!removeReason.trim()) return;
    setRemoving(true);
    try {
      const res = await api.admin.removeChild(applicationId, removeReason);
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

  const handleConfirmRevokePass = async () => {
    if (!revokeReason.trim()) return;
    setRevoking(true);
    try {
      const res = await api.admin.revokeChildPass(app.childId, revokeReason);
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
    if (!reopenReason.trim()) return;
    setReopening(true);
    try {
      const res = await api.admin.reopenApplicationReview(applicationId, reopenReason);
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

  // Generate real-time preview of parent message
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

  const statusColors: Record<string, string> = {
    under_review: 'bg-stone-50 text-stone-700 border-stone-200',
    review_reopened: 'bg-amber-50 text-amber-800 border-amber-200/60',
    selected: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
    pass_ready: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
    waiting_list: 'bg-amber-50 text-amber-800 border-amber-200/60',
    not_selected: 'bg-zinc-50 text-zinc-600 border-zinc-200',
    checked_in: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
    picked_up: 'bg-stone-50 text-stone-600 border-stone-200'
  };

  const statusLabels: Record<string, string> = {
    under_review: 'Awaiting review',
    review_reopened: 'Review reopened',
    selected: 'Selected',
    pass_ready: 'Pass ready',
    waiting_list: 'Waiting list',
    not_selected: 'Not selected',
    checked_in: 'Checked in',
    picked_up: 'Picked up'
  };

  // Derive age display text format
  const getAgeText = () => {
    const age = app.child.age;
    if (age === 0) {
      return 'Under 1 year';
    }
    return `${age} ${age === 1 ? 'year' : 'years'}`;
  };

  // Determine a suggested group if discrepancy exists
  const getSuggestedGroup = () => {
    const age = app.child.age;
    if (age < 1) return 'Below 1';
    if (age < 3) return 'Ages 1 to 2';
    if (age < 6) return 'Ages 3 to 5';
    if (age < 10) return 'Ages 6 to 9';
    return 'Teens (Ages 10+)';
  };

  return (
    <div 
      className="space-y-6 pb-24 text-zinc-800 animate-fade-in bg-[#FAF9F6]" 
      data-view-version="admin-review-child-v5-refined"
    >
      
      {/* HEADER BREADCRUMB ROW */}
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

        {/* Event selector indicator */}
        <div className="flex items-center space-x-2">
          <div className="bg-white border border-[#EAE8E1] rounded-xl px-3.5 py-1.5 flex items-center space-x-2 text-xs text-zinc-700 shadow-none">
            <span className="text-xs text-zinc-400 font-medium">Event</span>
            <span className="font-semibold text-zinc-800">The General Assembly 2026</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </div>
        </div>
      </div>

      {/* SOFT DELETED/REMOVED WARNING BANNER */}
      {app.isDeleted && (
        <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-5 flex items-start gap-3.5">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <h4 className="text-xs font-semibold text-amber-900">Registration removed from event</h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              This registration has been removed and archived from active event rosters. 
              {app.deleteReason && <> Reason: <strong>{app.deleteReason}</strong></>}
            </p>
            <div className="pt-2">
              <Button
                type="button"
                onClick={() => setIsRestoreModalOpen(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-xl transition-all shadow-none cursor-pointer"
              >
                Restore registration
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TWO COLUMN GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: CHILD IDENTITY & CARE INFORMATION (7 COLUMNS) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* 1. CHILD IDENTITY PROFILE HEADER */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4 shadow-none"
            data-component-version="admin-review-child-identity-v6-refined"
          >
            <h2 className="text-sm font-semibold text-[#18181B] pb-3 border-b border-[#EAE8E1]/60">
              Child summary
            </h2>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Child Photo */}
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

            {/* Title Block & Primary Tags */}
            <div className="flex-1 text-center sm:text-left space-y-2">
              <h1 className="text-2xl sm:text-3xl font-semibold text-[#18181B] tracking-tight">
                {app.child.fullName}
              </h1>
              
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
                {/* Age & Gender */}
                <span className="text-xs text-zinc-500 font-medium">
                  {getAgeText()} · {app.child.gender} · {app.child.ageGroup ? app.child.ageGroup.replace('to', '–') : 'Section'}
                </span>

                <span className="text-zinc-300">·</span>

                {/* Current Review status badge */}
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusColors[app.status] || 'bg-zinc-50 text-zinc-500'}`}>
                  {statusLabels[app.status] || app.status}
                </span>

                {/* Below event age warning flag */}
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

          {/* 2. CHILD DETAILS & AGE CONFIRMATION */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-5 shadow-none"
            data-component-version="admin-review-child-details-v3"
          >
            <div className="flex items-center justify-between border-b border-[#EAE8E1]/60 pb-3">
              <h2 className="text-sm font-semibold text-[#18181B]">
                Child details
              </h2>
              {!app.isDeleted && (
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

          {/* 3. CARE INFORMATION */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-5 shadow-none"
            data-component-version="admin-review-care-info-v4"
          >
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
                  <div className="text-zinc-600 font-normal pt-0.5">
                    No medical notes
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
                  <div className="text-zinc-600 font-normal pt-0.5">
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
                    <div className="text-zinc-600 font-normal pt-0.5">
                      Consent not recorded
                    </div>
                  );
                })()}
              </div>

            </div>
          </div>

          {/* 4. CONTACTS: PARENT / GUARDIAN & AUTHORISED PICKUP */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* PARENT / GUARDIAN CARD */}
            <div 
              className="bg-white border border-[#EAE8E1] rounded-2xl p-6 flex flex-col justify-between shadow-none"
              data-component-version="admin-review-parent-v4"
            >
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-[#18181B] pb-3 border-b border-[#EAE8E1]/60">
                  Parent / guardian
                </h2>

                <div className="flex items-start space-x-3.5">
                  <SafeImage
                    src={app.parent.photoUrl}
                    alt={app.parent.fullName}
                    className="w-14 h-14 rounded-xl object-cover border border-[#EAE8E1] shrink-0"
                    containerClassName="w-14 h-14 rounded-xl"
                    fallbackComponent={
                      <div className="w-14 h-14 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 font-semibold text-lg shrink-0">
                        <span>{app.parent.fullName?.charAt(0) || 'P'}</span>
                      </div>
                    }
                  />
                  <div className="space-y-1 flex-1 min-w-0">
                    <span className="font-semibold text-zinc-900 text-sm block truncate">{app.parent.fullName}</span>
                    <span className="text-xs text-zinc-500 block">
                      {app.child.relationship || 'Parent'}
                    </span>
                    {app.parent.isWorker && (
                      <span className="inline-block px-2 py-0.5 bg-zinc-100 border border-zinc-200 text-zinc-700 text-[11px] font-medium rounded">
                        Worker: {app.parent.department || 'General'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-xs text-zinc-600 pt-3 border-t border-[#EAE8E1]/40">
                  <div className="flex items-center space-x-2">
                    <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="font-medium text-zinc-800">{app.parent.phone}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate text-zinc-800 font-medium">{app.parent.email}</span>
                  </div>
                  {app.parent.address && (
                    <div className="flex items-start space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                      <span className="leading-relaxed text-zinc-700 line-clamp-2">{app.parent.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 flex flex-wrap gap-2 border-t border-[#EAE8E1]/40 mt-4">
                {app.parent.whatsapp && (
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
                <a 
                  href={`mailto:${app.parent.email}`}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 text-xs font-medium rounded-xl transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email</span>
                </a>
              </div>
            </div>

            {/* AUTHORISED PICKUP CARD */}
            <div 
              className="bg-white border border-[#EAE8E1] rounded-2xl p-6 flex flex-col justify-between shadow-none"
              data-component-version="admin-review-pickup-v4"
            >
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
                        {person.whatsapp && (
                          <div className="flex items-center space-x-2">
                            <MessageSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span className="font-medium text-zinc-800">{person.whatsapp}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-xs text-zinc-400">
                    No authorised pickup person has been added.
                  </div>
                )}
              </div>

              {/* Actions */}
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

          {/* 5. REVIEW HISTORY */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4 shadow-none"
            data-component-version="admin-review-history-v3"
          >
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
              <p className="text-xs text-zinc-400">No review history logs available.</p>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: DECISION PANEL & NOTES (5 COLUMNS, STICKY ON DESKTOP) */}
        <div 
          className="lg:col-span-5 space-y-6 bg-white border border-[#EAE8E1] rounded-2xl p-6 lg:sticky lg:top-6 shadow-none"
          data-component-version="admin-review-decision-panel-v3"
        >
          <div className="space-y-1 pb-4 border-b border-[#EAE8E1]/60">
            <h2 className="text-base font-semibold text-[#18181B]">Decision</h2>
            <p className="text-xs text-zinc-500">
              Choose an outcome for this registration.
            </p>
          </div>

          {/* STATE-DEPENDENT OPERATIONS WORKSPACE */}
          <div className="space-y-4">
            
            {/* 1. ARCHIVED / REMOVED CHILD PROFILE STATE */}
            {app.isDeleted && (
              <div className="bg-red-50/70 border border-red-200/60 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-red-900">Registration archived</h3>
                    <p className="text-xs text-red-700 leading-relaxed">
                      This child registration is soft-deleted and archived from event rosters. You can restore the registration if needed.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => setIsRestoreModalOpen(true)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-xs transition-all cursor-pointer"
                >
                  Restore registration
                </Button>
              </div>
            )}

            {/* 2. ATTENDANCE & CHECKED-IN STATE (READ-ONLY TERMINAL STATE) */}
            {!app.isDeleted && ['checked_in', 'inside', 'picked_up', 'checked_out'].includes(app.status) && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-[#C59B27] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-zinc-800">Child in attendance</h3>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      This child is currently checked in or picked up at the event. Review decisions cannot be reopened or revoked.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 3. UNDER REVIEW / REOPENED REVIEW STATUS */}
            {!app.isDeleted && ['under_review', 'review_reopened'].includes(app.status) && (
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
                    onClick={() => setIsWaitlistModalOpen(true)}
                    className="w-full p-3 text-left rounded-xl border border-[#EAE8E1] hover:border-zinc-300 bg-white text-zinc-800 flex items-center justify-between font-medium text-xs cursor-pointer"
                  >
                    <span>Add to waiting list</span>
                    <Hourglass className="w-4 h-4 text-zinc-500" />
                  </Button>

                  <button
                    type="button"
                    onClick={() => setIsNotSelectedModalOpen(true)}
                    className="w-full p-3 text-left rounded-xl border border-transparent hover:border-red-200 bg-transparent text-red-600 hover:bg-red-50/50 flex items-center justify-between font-medium text-xs cursor-pointer transition-colors"
                  >
                    <span>Mark as not selected</span>
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            )}

            {/* 4. SELECTED STATUS (PENDING EVENT PASS GENERATION) */}
            {!app.isDeleted && app.status === 'selected' && (
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
                    <span>Generate digital event pass</span>
                    <QrCode className="w-4 h-4 text-white" />
                  </Button>

                  <Button
                    type="button"
                    onClick={() => setIsWaitlistModalOpen(true)}
                    className="w-full p-3 text-left rounded-xl border border-[#EAE8E1] hover:border-zinc-300 bg-white text-zinc-800 flex items-center justify-between font-medium text-xs cursor-pointer"
                  >
                    <span>Move to waiting list</span>
                    <Hourglass className="w-4 h-4 text-zinc-500" />
                  </Button>

                  <button
                    type="button"
                    onClick={() => setIsNotSelectedModalOpen(true)}
                    className="w-full p-3 text-left rounded-xl border border-transparent hover:border-red-200 bg-transparent text-red-600 hover:bg-red-50/50 flex items-center justify-between font-medium text-xs cursor-pointer transition-colors"
                  >
                    <span>Mark as not selected</span>
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            )}

            {/* 5. PASS READY STATUS */}
            {!app.isDeleted && app.status === 'pass_ready' && (
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
            {!app.isDeleted && app.status === 'waiting_list' && (
              <div className="space-y-4">
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-xs text-zinc-700 leading-relaxed space-y-1">
                  <p className="font-semibold text-xs">Waiting list</p>
                  <p>This child is currently on the waiting list. You can choose to admit them if space opens up.</p>
                </div>

                <div className="space-y-2.5">
                  <Button
                    type="button"
                    onClick={() => setIsSelectModalOpen(true)}
                    variant="primary"
                    className="w-full p-3 text-left rounded-xl flex items-center justify-between font-semibold text-xs cursor-pointer"
                  >
                    <span>Admit & select child</span>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </Button>

                  <button
                    type="button"
                    onClick={() => setIsNotSelectedModalOpen(true)}
                    className="w-full p-3 text-left rounded-xl border border-transparent hover:border-red-200 bg-transparent text-red-600 hover:bg-red-50/50 flex items-center justify-between font-medium text-xs cursor-pointer transition-colors"
                  >
                    <span>Mark as not selected</span>
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            )}

            {/* 7. NOT SELECTED STATUS */}
            {!app.isDeleted && app.status === 'not_selected' && (
              <div className="space-y-4">
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-xs text-zinc-700 leading-relaxed space-y-1">
                  <p className="font-semibold text-xs">Not selected</p>
                  <p>This registration is marked as not selected. You can reopen the review to reconsider.</p>
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

          </div>

          {/* TEAM NOTES */}
          <div className="space-y-2 pt-4 border-t border-[#EAE8E1]/60">
            <span className="text-xs text-zinc-600 font-semibold block">
              Team notes
            </span>
            <textarea
              value={noteToTeam}
              onChange={(e) => setNoteToTeam(e.target.value)}
              placeholder="Add notes for other reviewers..."
              rows={3}
              className="w-full p-3 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all placeholder:text-zinc-400 text-zinc-800 font-medium"
            />
            <div className="flex justify-end pt-1">
              <Button
                type="button"
                onClick={handleSubmitReview}
                disabled={saving}
                className="px-4 py-2 bg-white hover:bg-zinc-50 text-zinc-800 border border-[#EAE8E1] rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                {saving ? 'Saving notes...' : 'Save notes'}
              </Button>
            </div>
          </div>

          {/* MESSAGE TO PARENT */}
          <div 
            className="space-y-2.5 pt-4 border-t border-[#EAE8E1]/60"
            data-component-version="admin-review-notification-preview-v3"
          >
            <span className="text-xs text-zinc-600 font-semibold block">
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
                Send this update to the parent
              </label>
            </div>
          </div>

          {/* MORE ACTIONS / DESTRUCTIVE ACTION NEAR BOTTOM */}
          {!app.isDeleted && (
            <div className="pt-4 border-t border-[#EAE8E1]/60 flex justify-end">
              <button
                type="button"
                onClick={() => setIsRemoveModalOpen(true)}
                className="text-xs font-medium text-zinc-400 hover:text-red-600 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <span>Remove from this event</span>
              </button>
            </div>
          )}

        </div>

      </div>

      {/* FOOTER ACTIONS BAR */}
      <div className="border-t border-[#EAE8E1] pt-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-white border border-[#EAE8E1] rounded-xl hover:bg-zinc-50 text-zinc-700 text-xs font-medium transition-colors cursor-pointer"
        >
          {backLabel || 'Back to review'}
        </button>
      </div>

      {/* REOPEN REVIEW CONFIRMATION MODAL */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in">
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
                <li>The child's status will revert to <strong>Awaiting review</strong> immediately.</li>
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
                disabled={reopening || !reopenReason.trim()}
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

      {/* EDIT CHILD DETAILS MODAL */}
      {isEditModalOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          data-view-version="admin-child-edit-v4"
        >
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

            <form 
              onSubmit={handleSaveEdit} 
              className="space-y-4 text-xs"
              data-component-version="admin-child-edit-form-v4"
            >
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

      {/* REMOVE CHILD REGISTRATION MODAL */}
      {isRemoveModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-zinc-800">
            <div className="flex items-start gap-3 text-red-700">
              <AlertCircle className="w-6 h-6 shrink-0 text-red-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">Remove registration from event?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to remove the registration for <strong>{app.child.fullName}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-red-50/50 border border-red-100 rounded-xl p-3.5 text-xs text-red-800 leading-relaxed space-y-1.5 text-left">
              <p className="font-semibold">Consequences of removal:</p>
              <ul className="list-disc pl-4 space-y-1 text-xs text-red-700">
                <li>The registration is soft-deleted and archived from event rosters.</li>
                <li>Any generated digital event pass is immediately <strong>revoked</strong>.</li>
                <li>The registration can be restored later if needed.</li>
              </ul>
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
                disabled={removing || !removeReason.trim()}
                onClick={handleConfirmRemove}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white border border-red-600 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center space-x-1.5 shadow-none cursor-pointer"
              >
                {removing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>Remove registration</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESTORE CHILD REGISTRATION MODAL */}
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
                The registration is reactivated and restored to event rosters. Its status will reset to <strong>Awaiting review</strong> so you can make the appropriate decision.
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

      {/* REVOKE PASS MODAL */}
      {isRevokeModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-zinc-800">
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
                disabled={revoking || !revokeReason.trim()}
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

      {/* SELECT CHILD CONFIRMATION MODAL */}
      {isSelectModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-zinc-800">
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
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-zinc-800">
            <div className="flex items-start gap-3 text-zinc-700">
              <Hourglass className="w-6 h-6 shrink-0 text-zinc-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">Add child to waiting list?</h3>
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
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-zinc-800">
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
                disabled={!notSelectedReason.trim()}
                onClick={handleConfirmNotSelected}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white border border-red-600 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 shadow-none cursor-pointer"
              >
                Confirm not selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GENERATE EVENT PASS CONFIRMATION MODAL */}
      {isGeneratePassModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in text-zinc-800">
            <div className="flex items-start gap-3 text-emerald-700">
              <QrCode className="w-6 h-6 shrink-0 text-emerald-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-base font-semibold text-zinc-900">Generate digital event pass?</h3>
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
                onClick={handleConfirmGeneratePass}
                className="px-4 py-2 bg-[#C59B27] hover:bg-[#B08921] text-white rounded-xl text-xs font-semibold transition-all shadow-none cursor-pointer"
              >
                Generate QR pass
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

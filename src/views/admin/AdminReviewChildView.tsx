import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  AlertCircle, 
  Calendar, 
  User, 
  Heart, 
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
}

export const AdminReviewChildView: React.FC<AdminReviewChildViewProps> = ({
  applicationId,
  onBack,
  onSave
}) => {
  const { showError, showSuccess } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [app, setApp] = useState<any>(null);

  // Form states for review
  const [decision, setDecision] = useState<'selected' | 'waiting_list' | 'under_review' | 'not_selected'>('selected');
  const [noteToTeam, setNoteToTeam] = useState('');
  const [sendNotification, setSendNotification] = useState(true);
  
  // Interactive confirmation checkbox (from Stitch target "Age group checked & confirmed")
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
        noteToTeam: 'Selected for enrollment.',
        sendNotification: true
      });
      if (res.success) {
        showSuccess('Child Selected', `${app?.child?.fullName || 'Child'} has been successfully selected.`);
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
        noteToTeam: 'Moved to waiting list.',
        sendNotification: true
      });
      if (res.success) {
        showSuccess('Added to Waitlist', `${app?.child?.fullName || 'Child'} moved to waitlist.`);
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
    
    // For Request Update status or Not Selected status, we require a private team note if the rule enforces it,
    // let's ensure we have a note when choosing request update
    if (decision === 'under_review' && !noteToTeam.trim()) {
      showError('Note Required', 'Please add a note for Request Update to clarify what needs revision.');
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
          `Application status for ${app.child.fullName} is now ${decision.replace('_', ' ')}.`
        );
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Submission Failed', parsed.message || 'Could not commit administrative decision.');
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
        showSuccess('Child Removed', 'Child registration has been soft-deleted.');
        setIsRemoveModalOpen(false);
        setRemoveReason('');
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Removal Failed', parsed.message || 'Could not remove child registration.');
    } finally {
      setRemoving(false);
    }
  };

  const handleConfirmRestore = async () => {
    setRestoring(true);
    try {
      const res = await api.admin.restoreChild(applicationId);
      if (res.success) {
        showSuccess('Child Restored', 'Child registration has been restored.');
        setIsRestoreModalOpen(false);
        await fetchDetails();
        onSave();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Restore Failed', parsed.message || 'Could not restore child registration.');
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
          `The application review for ${app?.child?.fullName || 'the child'} has been reopened successfully.`
        );
        setIsReopenModalOpen(false);
        setReopenReason('');
        await fetchDetails();
        onSave();
      } else {
        showError('Reopen Failed', res.error || 'Could not reopen application review.');
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

  // Generate real-time live preview of the pastoral parent notification email (human-centered, off-portal)
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
        return `Hello ${parentFirstName},\n\nThank you for sending ${childFirstName}’s details. We’re unable to select this application for the current event.\n\nWarm regards,\nKoinonia Children and Teens Team`;
      case 'under_review':
        return `Hello ${parentFirstName},\n\nWe need one more update before completing ${childFirstName}’s review. Please open Parent Access and update the requested details.\n\nWarm regards,\nKoinonia Children and Teens Team`;
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAF9F6] p-6 w-full">
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
    under_review: 'bg-amber-50 text-amber-700 border-amber-200',
    review_reopened: 'bg-amber-100 text-amber-800 border-amber-300',
    selected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pass_ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    waiting_list: 'bg-amber-50/70 text-amber-800 border-amber-200',
    not_selected: 'bg-zinc-50 text-zinc-500 border-zinc-200',
    checked_in: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    picked_up: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };

  const statusLabels: Record<string, string> = {
    under_review: 'Under Review',
    review_reopened: 'Review Reopened',
    selected: 'Selected',
    pass_ready: 'Pass Ready',
    waiting_list: 'Waiting List',
    not_selected: 'Not Selected',
    checked_in: 'Checked In',
    picked_up: 'Picked Up'
  };

  // Derive age display text format
  const getAgeText = () => {
    const age = app.child.age;
    if (age === 0) {
      return 'Under 1 Year';
    }
    return `${age} ${age === 1 ? 'Year' : 'Years'}`;
  };

  // Determine a dynamic suggested group if discrepancy exists
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
      data-view-version="admin-review-child-v4-contact-refined"
      data-view-version-extra="admin-child-profile-v4-management"
    >
      
      {/* HEADER BREADCRUMB ROW */}
      <div className="flex items-center justify-between border-b border-[#EAE8E1]/80 pb-4">
        <div className="flex items-center space-x-4">
          <button 
            onClick={onBack}
            className="flex items-center space-x-1 text-[11px] font-bold text-[#C59B27] hover:text-[#A37E1C] uppercase tracking-wider transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>BACK TO APPLICATIONS</span>
          </button>
          <span className="text-zinc-300">|</span>
          <span className="text-sm font-serif text-zinc-500 font-medium">Review Child</span>
        </div>

        {/* Dynamic Branded Event dropdown look-alike */}
        <div className="flex items-center space-x-2">
          <div className="bg-white border border-[#EAE8E1] rounded-lg px-3.5 py-1.5 flex items-center space-x-2 text-xs font-semibold text-zinc-700 shadow-2xs">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Event:</span>
            <span>The General Assembly 2026</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </div>
        </div>
      </div>

      {/* SOFT DELETED/REMOVED WARNING BANNER */}
      {app.isDeleted && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3.5 shadow-2xs">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <h4 className="text-xs font-bold text-amber-800 uppercase tracking-widest">Removed Child Profile</h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              This registration has been soft-deleted and archived from active rosters. 
              {app.deleteReason && <> Reason for removal: <strong>{app.deleteReason}</strong></>}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsRestoreModalOpen(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer"
              >
                Restore child
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TWO COLUMN GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: CHILD IDENTITY & CARE SHEETS (7 COLUMNS) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* 1. CHILD IDENTITY PROFILE HEADER CARD */}
          <div 
            className="bg-[#FCFBF9] border border-[#EAE8E1] rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row items-center sm:items-start gap-6"
            data-component-version="admin-review-child-identity-v3-refined"
            data-component-version-extra="admin-child-profile-summary-v3"
          >
            {/* Child Photo with soft gold-tint border frame */}
            <div className="shrink-0">
              <SafeImage
                src={app.child.photoUrl}
                alt={app.child.fullName}
                className="w-24 h-28 rounded-2xl object-cover border border-[#E2DFD7] shadow-sm ring-1 ring-[#C59B27]/10 ring-offset-1"
                containerClassName="w-24 h-28 rounded-2xl"
                fallbackComponent={
                  <div className="w-24 h-28 rounded-2xl bg-gradient-to-br from-[#FCFBF9] to-[#EFECE4] border border-[#E2DFD7] flex flex-col items-center justify-center text-[#715D3A] font-medium text-2xl uppercase shadow-xs ring-1 ring-[#C59B27]/10 ring-offset-1">
                    <span>{app.child.fullName?.charAt(0) || 'C'}</span>
                    <span className="text-[9px] text-[#A37E1C] uppercase font-bold tracking-wider mt-1 font-sans">Child</span>
                  </div>
                }
              />
            </div>

            {/* Title Block & Primary Tags */}
            <div className="flex-1 text-center sm:text-left space-y-3">
              <h1 className="text-3xl font-serif text-[#18181B] font-medium tracking-tight">
                {app.child.fullName}
              </h1>
              
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                {/* Age & Gender Pill */}
                <span className="bg-zinc-100 text-zinc-600 font-bold px-2.5 py-1 rounded text-[10px] tracking-wider uppercase">
                  {getAgeText()} • {app.child.gender}
                </span>

                {/* Current Review status badge */}
                <span className={`px-2.5 py-1 rounded text-[10px] font-bold border uppercase tracking-wider ${statusColors[app.status] || 'bg-zinc-50 text-zinc-500'}`}>
                  {statusLabels[app.status] || app.status}
                </span>

                {/* Below event age warning flag */}
                {app.child.needsAgeReview && (
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                    <ShieldAlert className="w-3 h-3 text-amber-600" />
                    <span>BELOW EVENT AGE</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 2. GRID OF CHILD DETAILS & AGE DISCREPANCY */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* CHILD DETAILS BLOCK */}
            <div 
              className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs space-y-4"
              data-component-version="admin-review-child-details-v2"
            >
              <div className="flex items-center justify-between border-b border-[#EAE8E1]/60 pb-2">
                <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  CHILD DETAILS
                </h3>
                {!app.isDeleted && (
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(true)}
                    className="text-[10px] font-bold text-[#C59B27] hover:text-[#A37E1C] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Edit className="w-3 h-3" />
                    <span>Edit Details</span>
                  </button>
                )}
              </div>
              
              <div className="space-y-3.5 text-xs text-zinc-700">
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-zinc-400 font-medium">Date of Birth</span>
                  <span className="font-semibold text-zinc-800">{app.child.dob}</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-zinc-400 font-medium">Relationship</span>
                  <span className="font-semibold text-zinc-800">{app.child.relationship || 'Child'}</span>
                </div>
                <div className="flex justify-between items-start py-0.5 gap-4">
                  <span className="text-zinc-400 font-medium shrink-0">School Status</span>
                  <span className="font-semibold text-zinc-800 text-right">
                    {app.schoolClass ? `${app.schoolClass} (${app.schoolName || 'N/A'})` : 'Not provided'}
                  </span>
                </div>
              </div>
            </div>

            {/* AGE DISCREPANCY BLOCK (Only rendered if there is an age warning) */}
            {app.child.needsAgeReview ? (
              <div className="bg-[#FFF8F6] border border-red-100 rounded-2xl p-5 shadow-2xs space-y-4">
                <h3 className="text-[10px] font-bold text-red-400 uppercase tracking-widest border-b border-red-100/60 pb-2 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                  <span>AGE DISCREPANCY</span>
                </h3>
                
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">Suggested Group</span>
                    <div className="mt-1.5 p-2.5 bg-white border border-red-100 rounded-xl font-semibold text-red-700">
                      {getSuggestedGroup()}
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">Event Target Group</span>
                    <div className="mt-1.5 p-2.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl font-semibold text-zinc-600">
                      {app.child.ageGroup}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Subtle confirmed placeholder if no discrepancy
              <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs flex flex-col justify-center items-center text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-semibold text-zinc-800">Age Category Verified</h4>
                <p className="text-[11px] text-zinc-400">The child's age aligns perfectly with the target group.</p>
              </div>
            )}
          </div>

          {/* 3. HEALTH & CARE PROFILE */}
          <div 
            className="bg-[#FCFBF9] border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs space-y-4"
            data-component-version="admin-review-health-care-v5-compact"
            data-component-version-extra="admin-child-care-notes-v3"
          >
            <h3 className="font-serif text-[13px] font-semibold text-zinc-700 pb-1.5 border-b border-[#EAE8E1]/60 uppercase tracking-wider text-xs">
              Health & Care Profile
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
              
              {/* Care & Medical Notes */}
              <div className="space-y-1 md:col-span-1">
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Medical & Care Notes</span>
                {app.hasMedicalNotes ? (
                  <div className="p-2.5 bg-red-50/70 border border-red-100 rounded-lg text-red-800 leading-relaxed font-semibold text-[11px]">
                    {app.medicalNotes}
                  </div>
                ) : (
                  <div className="text-zinc-500 italic font-medium text-[11px] pt-1">
                    No special medical notes
                  </div>
                )}
              </div>

              {/* Extra Support Notes */}
              <div className="space-y-1 md:col-span-1">
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Extra Support Notes</span>
                {app.needsExtraSupport ? (
                  <div className="p-2.5 bg-amber-50/70 border border-amber-100 rounded-lg text-amber-800 leading-relaxed font-semibold text-[11px]">
                    {app.supportNotes || 'Requires extra support attention'}
                  </div>
                ) : (
                  <div className="text-zinc-500 italic font-medium text-[11px] pt-1">
                    No extra support needed
                  </div>
                )}
              </div>

              {/* Parent Consent & Accommodation checklist */}
              <div className="space-y-1 md:col-span-1">
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Consent Status</span>
                {(() => {
                  const isConsentConfirmed = app.detailsConfirmed || app.informationConfirmed || app.child?.detailsConfirmed || app.child?.informationConfirmed || (app.status && app.status !== 'incomplete');
                  return isConsentConfirmed ? (
                    <div className="flex items-center space-x-2 py-1.5 text-zinc-700 font-medium">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span className="text-[11px] text-zinc-600 font-medium">Care consent confirmed</span>
                    </div>
                  ) : (
                    <div className="text-zinc-500 italic font-medium text-[11px] pt-1">
                      Consent not recorded
                    </div>
                  );
                })()}
              </div>

            </div>
          </div>

          {/* 4. PRIMARY CONTACT & AUTHORIZED PICKUP GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* PRIMARY CONTACT PROFILE CARD */}
            <div 
              className="bg-[#FCFBF9] border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs flex flex-col justify-between"
              data-component-version="admin-review-primary-contact-v5-refined"
              data-component-version-extra="admin-child-parent-details-v3"
            >
              <div className="space-y-3.5">
                <h3 className="font-serif text-[13px] font-semibold text-zinc-700 pb-1.5 border-b border-[#EAE8E1]/60 uppercase tracking-wider text-xs">
                  Primary Contact
                </h3>

                <div className="flex items-start space-x-4 pt-1.5">
                  <SafeImage
                    src={app.parent.photoUrl}
                    alt={app.parent.fullName}
                    className="w-20 h-24 rounded-xl object-cover border border-[#E2DFD7] shadow-xs shrink-0 ring-1 ring-[#C59B27]/5"
                    containerClassName="w-20 h-24 rounded-xl"
                    fallbackComponent={
                      <div className="w-20 h-24 rounded-xl bg-gradient-to-br from-[#FCFBF9] to-[#EFECE4] border border-[#E2DFD7] flex flex-col items-center justify-center text-[#715D3A] font-medium text-xl uppercase shrink-0 shadow-xs">
                        <span>{app.parent.fullName?.charAt(0) || 'P'}</span>
                        <span className="text-[8px] text-[#A37E1C] uppercase font-bold tracking-widest mt-1 font-sans">Guardian</span>
                      </div>
                    }
                  />
                  <div className="space-y-1.5 flex-1 min-w-0 pt-1">
                    <span className="font-semibold text-zinc-800 text-sm block leading-tight truncate">{app.parent.fullName}</span>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">
                      {app.child.relationship || 'Parent'}
                    </span>
                    {app.parent.isWorker && (
                      <span className="inline-flex items-center mt-1 px-2 py-0.5 bg-[#C59B27]/10 border border-[#C59B27]/25 text-[#A37E1C] text-[9px] font-bold uppercase tracking-wider rounded">
                        Church Worker ({app.parent.department || 'General'})
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-xs text-zinc-600 pt-3 border-t border-[#EAE8E1]/40 mt-3.5">
                  <div className="flex items-center space-x-2">
                    <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="font-medium text-zinc-700">{app.parent.phone}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate text-zinc-700 font-medium">{app.parent.email}</span>
                  </div>
                  {app.parent.address && (
                    <div className="flex items-start space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                      <span className="leading-relaxed text-zinc-700 font-medium line-clamp-2">{app.parent.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Contact triggers */}
              <div className="pt-3.5 flex flex-wrap gap-2 border-t border-[#EAE8E1]/40 mt-4">
                {app.parent.whatsapp && (
                  <a 
                    href={`https://wa.me/${app.parent.whatsapp.replace(/\D/g, '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100/50 text-emerald-800 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors"
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>WhatsApp</span>
                  </a>
                )}
                <a 
                  href={`mailto:${app.parent.email}`}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-[#C59B27] text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors shadow-3xs"
                >
                  <Mail className="w-3 h-3" />
                  <span>Email</span>
                </a>
              </div>
            </div>

            {/* AUTHORIZED PICKUP PROFILE CARD */}
            <div 
              className="bg-[#FCFBF9] border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs flex flex-col justify-between"
              data-component-version="admin-review-authorized-pickup-v5-refined"
              data-component-version-extra="admin-child-pickup-details-v3"
            >
              <div className="space-y-3.5">
                <h3 className="font-serif text-[13px] font-semibold text-zinc-700 pb-1.5 border-b border-[#EAE8E1]/60 uppercase tracking-wider text-xs">
                  Authorized Pickup
                </h3>

                {app.pickupPeople && app.pickupPeople.length > 0 ? (
                  app.pickupPeople.slice(0, 1).map((person: any) => (
                    <div key={person.id} className="pt-1.5">
                      <div className="flex items-start space-x-4">
                        <SafeImage
                          src={person.photoUrl}
                          alt={person.fullName}
                          className="w-20 h-24 rounded-xl object-cover border border-[#E2DFD7] shadow-xs shrink-0 ring-1 ring-[#C59B27]/5"
                          containerClassName="w-20 h-24 rounded-xl"
                          fallbackComponent={
                            <div className="w-20 h-24 rounded-xl bg-gradient-to-br from-[#FCFBF9] to-[#EFECE4] border border-[#E2DFD7] flex flex-col items-center justify-center text-[#715D3A] font-medium text-xl uppercase shrink-0 shadow-xs">
                              <span>{person.fullName?.charAt(0) || 'P'}</span>
                              <span className="text-[8px] text-[#A37E1C] uppercase font-bold tracking-widest mt-1 font-sans">Pickup</span>
                            </div>
                          }
                        />
                        <div className="space-y-1.5 flex-1 min-w-0 pt-1">
                          <span className="font-semibold text-zinc-800 text-sm block leading-tight truncate">{person.fullName}</span>
                          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">
                            {person.relationship || 'Pickup Person'}
                          </span>
                          <div className="pt-1">
                            {person.approved ? (
                              <div className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded text-[9px] font-bold uppercase tracking-wider text-emerald-800">
                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                                <span>ID Verified</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center space-x-1 px-2 py-0.5 bg-[#C59B27]/10 border border-[#C59B27]/20 rounded text-[9px] font-bold uppercase tracking-wider text-[#715D3A]">
                                <span>Approved by parent</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs text-zinc-600 pt-3 border-t border-[#EAE8E1]/40 mt-3.5">
                        <div className="flex items-center space-x-2">
                          <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="font-medium text-zinc-700">{person.phone}</span>
                        </div>
                        {person.whatsapp && (
                          <div className="flex items-center space-x-2">
                            <MessageSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span className="font-medium text-zinc-700">{person.whatsapp}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-[11px] text-zinc-500 italic font-medium">
                    No authorized pickup person has been added.
                  </div>
                )}
              </div>

              {/* Action triggers */}
              {app.pickupPeople && app.pickupPeople.length > 0 && (
                <div className="pt-3.5 flex flex-wrap gap-2 border-t border-[#EAE8E1]/40 mt-4">
                  {app.pickupPeople[0].whatsapp && (
                    <a 
                      href={`https://wa.me/${app.pickupPeople[0].whatsapp.replace(/\D/g, '')}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100/50 text-emerald-800 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>WhatsApp</span>
                    </a>
                  )}
                  <a 
                    href={`tel:${app.pickupPeople[0].phone}`}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-[#C59B27] text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors shadow-3xs"
                  >
                    <Phone className="w-3 h-3" />
                    <span>Call Phone</span>
                  </a>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN: DECISION PANEL & AUDIT HISTORY (5 COLUMNS) */}
        <div 
          className="lg:col-span-5 space-y-6 bg-white border border-[#EAE8E1] rounded-2xl p-6 shadow-xs"
          data-component-version="admin-review-decision-panel-v2"
          data-component-version-extra="admin-child-status-actions-v3"
        >
          <div className="space-y-1.5 pb-4 border-b border-[#EAE8E1]/60">
            <h2 className="text-2xl font-serif text-zinc-800 font-medium">Decision</h2>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Choose how this child should move forward.
            </p>
          </div>

          {/* STATE-DEPENDENT OPERATIONS WORKSPACE */}
          <div className="space-y-4">
            
            {/* 1. ARCHIVED / REMOVED CHILD PROFILE STATE */}
            {app.isDeleted && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5.5 h-5.5 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-red-800 uppercase tracking-wider">Profile Archived</h4>
                    <p className="text-xs text-red-700 leading-relaxed">
                      This child registration is soft-deleted and locked. You must restore the child profile to enable administrative operations.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRestoreModalOpen(true)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer"
                >
                  Restore Child Profile
                </button>
              </div>
            )}

            {/* 2. ATTENDANCE & CHECKED-IN STATE (READ-ONLY TERMINAL STATE) */}
            {!app.isDeleted && ['checked_in', 'inside', 'picked_up', 'checked_out'].includes(app.status) && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5.5 h-5.5 text-[#C59B27] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Child In Attendance</h4>
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
                <div className="bg-[#FAF8F3] border border-[#E5D5AE]/40 rounded-2xl p-4 text-xs text-[#715D3A] leading-relaxed space-y-1">
                  <p className="font-bold uppercase tracking-wider text-[10px] text-[#A37E1C]">Review Pending</p>
                  <p>Choose an enrollment decision to update this child's application status.</p>
                </div>
                
                {app.child.needsAgeReview && (
                  <div className="bg-[#FFF8F6] border border-red-100 rounded-xl p-4 space-y-3">
                    <div className="flex items-center space-x-2 text-red-700 font-bold text-[10px] uppercase tracking-wider">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      <span>Attention Required</span>
                    </div>
                    <div className="flex items-center space-x-2.5">
                      <input
                        type="checkbox"
                        id="ageConfirm"
                        checked={ageChecked}
                        onChange={(e) => setAgeChecked(e.target.checked)}
                        className="w-4 h-4 rounded text-[#C59B27] border-red-200 focus:ring-[#C59B27]"
                      />
                      <label htmlFor="ageConfirm" className="text-xs text-zinc-700 font-medium cursor-pointer select-none">
                        Age group checked & confirmed
                      </label>
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (app.child.needsAgeReview && !ageChecked) {
                        showError('Action Blocked', 'Please confirm that you have checked the child\'s age group first.');
                        return;
                      }
                      setIsSelectModalOpen(true);
                    }}
                    className="w-full p-4 text-left rounded-xl border border-[#EAE8E1] hover:border-[#C59B27] bg-white transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider text-[#C59B27] hover:bg-zinc-50 cursor-pointer"
                  >
                    <span>Select Child for Enrollment</span>
                    <CheckCircle2 className="w-4 h-4 text-[#C59B27]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsWaitlistModalOpen(true)}
                    className="w-full p-4 text-left rounded-xl border border-[#EAE8E1] hover:border-zinc-800 bg-white transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider text-zinc-800 hover:bg-zinc-50 cursor-pointer"
                  >
                    <span>Waitlist Child</span>
                    <Hourglass className="w-4 h-4 text-zinc-500" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsNotSelectedModalOpen(true)}
                    className="w-full p-4 text-left rounded-xl border border-[#EAE8E1] hover:border-red-500 bg-white transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider text-red-700 hover:bg-red-50/20 cursor-pointer"
                  >
                    <span>Mark as Not Selected</span>
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            )}

            {/* 4. SELECTED STATUS (PENDING EVENT PASS GENERATION) */}
            {!app.isDeleted && app.status === 'selected' && (
              <div className="space-y-4">
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 text-xs text-emerald-800 leading-relaxed space-y-1">
                  <p className="font-bold uppercase tracking-wider text-[10px]">Enrollment Approved</p>
                  <p>This child has been selected. You can now generate their digital event pass.</p>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setIsGeneratePassModalOpen(true)}
                    className="w-full p-4 text-left rounded-xl border border-[#C59B27] bg-[#C59B27] hover:bg-[#B08921] text-white transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider cursor-pointer shadow-xs"
                  >
                    <span>Generate Digital Event Pass</span>
                    <QrCode className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsWaitlistModalOpen(true)}
                    className="w-full p-4 text-left rounded-xl border border-[#EAE8E1] hover:border-zinc-800 bg-white transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider text-zinc-800 hover:bg-zinc-50 cursor-pointer"
                  >
                    <span>Move to Waitlist</span>
                    <Hourglass className="w-4 h-4 text-zinc-500" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsNotSelectedModalOpen(true)}
                    className="w-full p-4 text-left rounded-xl border border-[#EAE8E1] hover:border-red-500 bg-white transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider text-red-700 hover:bg-red-50/20 cursor-pointer"
                  >
                    <span>Mark as Not Selected</span>
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            )}

            {/* 5. PASS READY STATUS */}
            {!app.isDeleted && app.status === 'pass_ready' && (
              <div className="space-y-4">
                <div className="bg-emerald-50/80 border border-emerald-100 rounded-2xl p-4 text-xs text-emerald-800 leading-relaxed space-y-1">
                  <p className="font-bold uppercase tracking-wider text-[10px]">Event Pass Issued</p>
                  <p>The digital event pass is active and available to the parent.</p>
                </div>

                <div className="max-w-[300px] mx-auto py-2">
                  <EventPassPreviewCard
                    childName={app.child.fullName}
                    ageGroup={app.child.ageGroup || 'Section'}
                    status="Pass ready"
                    photoUrl={app.child.photoUrl || undefined}
                    passReference={app.passReference}
                  />
                </div>

                <div className="pt-2 border-t border-[#EAE8E1]/60 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRevokeModalOpen(true)}
                    className="flex-1 py-3 bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                  >
                    <X className="w-4 h-4" />
                    <span>Revoke Pass</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsReopenModalOpen(true)}
                    className="flex-1 py-3 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                  >
                    <Clock className="w-4 h-4" />
                    <span>Reopen Review</span>
                  </button>
                </div>
              </div>
            )}

            {/* 6. WAITING LIST STATUS */}
            {!app.isDeleted && app.status === 'waiting_list' && (
              <div className="space-y-4">
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-xs text-zinc-700 leading-relaxed space-y-1">
                  <p className="font-bold uppercase tracking-wider text-[10px]">Waiting List</p>
                  <p>This child is currently on the waitlist. You can choose to admit them if space opens up.</p>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setIsSelectModalOpen(true)}
                    className="w-full p-4 text-left rounded-xl border border-[#C59B27] bg-[#C59B27] hover:bg-[#B08921] text-white transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider cursor-pointer shadow-xs"
                  >
                    <span>Admit & Select Child</span>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsNotSelectedModalOpen(true)}
                    className="w-full p-4 text-left rounded-xl border border-zinc-200 hover:border-red-500 bg-white transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider text-red-700 hover:bg-red-50/20 cursor-pointer"
                  >
                    <span>Mark as Not Selected</span>
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            )}

            {/* 7. NOT SELECTED STATUS */}
            {!app.isDeleted && app.status === 'not_selected' && (
              <div className="space-y-4">
                <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4 text-xs text-red-800 leading-relaxed space-y-1">
                  <p className="font-bold uppercase tracking-wider text-[10px]">Not Selected</p>
                  <p>This child is marked as not selected. You can reopen the review to reconsider.</p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(true)}
                  className="w-full p-4 text-left rounded-xl border border-[#C59B27] bg-white text-[#C59B27] hover:bg-zinc-50 transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  <span>Reopen Review for Reconsideration</span>
                  <Clock className="w-4 h-4 text-[#C59B27]" />
                </button>
              </div>
            )}

          </div>

          {/* TEAM INTERNAL NOTES */}
          <div className="space-y-1.5 pt-4 border-t border-[#EAE8E1]/60">
            <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">
              INTERNAL TEAM NOTES
            </span>
            <textarea
              value={noteToTeam}
              onChange={(e) => setNoteToTeam(e.target.value)}
              placeholder="Add notes for other reviewers..."
              rows={3}
              className="w-full p-3 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all placeholder:text-zinc-400 text-zinc-800 font-medium"
            />
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={saving}
                className="px-4 py-2 bg-zinc-800 hover:bg-[#C59B27] hover:text-white text-white font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all shadow-xs cursor-pointer"
              >
                {saving ? 'Saving Notes...' : 'Save Internal Notes'}
              </button>
            </div>
          </div>

          {/* AUTOMATED PARENT NOTIFICATION PREVIEW */}
          <div 
            className="space-y-2 pt-4 border-t border-[#EAE8E1]/60"
            data-component-version="admin-review-notification-preview-v2"
          >
            <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">
              PARENT NOTIFICATION PREVIEW
            </span>
            
            <div className="p-4 bg-zinc-50 border border-[#EAE8E1] rounded-xl text-xs text-zinc-600 leading-relaxed font-serif italic whitespace-pre-wrap relative shadow-inner">
              {getNotificationPreview() || "Select an action above to preview the automated message."}
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
                Send automated notification to parent
              </label>
            </div>
          </div>

          {/* REMOVE CHILD ACTION FOR ACTIVE REGISTRATIONS */}
          {!app.isDeleted && (
            <div className="pt-4 border-t border-[#EAE8E1]/60 flex justify-end">
              <button
                type="button"
                onClick={() => setIsRemoveModalOpen(true)}
                className="text-xs font-bold text-red-600 hover:text-red-700 uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4 text-red-500" />
                <span>Remove Child</span>
              </button>
            </div>
          )}

          {/* REVIEWS HISTORY LOG */}
          <div 
            className="space-y-3 pt-4 border-t border-[#EAE8E1]/60"
            data-component-version="admin-review-history-v2"
            data-component-version-extra="admin-child-admin-notes-v3"
          >
            <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">
              REVIEW HISTORY
            </span>

            {app.history && app.history.length > 0 ? (
              <div className="relative border-l border-zinc-200 pl-4 space-y-4 py-1">
                {app.history.map((hist: any, index: number) => (
                  <div key={hist.id || index} className="relative text-xs">
                    {/* Circle icon bullet */}
                    <span className="absolute -left-[20.5px] top-1 w-2 h-2 rounded-full bg-[#C59B27]" />
                    
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-zinc-800">{hist.action}</span>
                      <span className="text-[10px] text-zinc-400 font-medium">
                        {new Date(hist.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    <p className="text-zinc-500 text-[11px] mt-0.5">
                      By: <strong className="font-semibold text-zinc-600">{hist.by}</strong>
                    </p>

                    {hist.note && (
                      <div className="mt-1 p-2 bg-zinc-50 border border-zinc-100 rounded-lg text-[10px] text-zinc-500 italic text-left">
                        "{hist.note}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 italic">No review history logs available.</p>
            )}
          </div>

        </div>

      </div>

      {/* REOPEN REVIEW CONFIRMATION MODAL */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 animate-scale-in">
            <div className="flex items-start gap-3 text-amber-700">
              <AlertCircle className="w-6 h-6 shrink-0 text-amber-600" />
              <div className="space-y-1 text-left">
                <h3 className="text-lg font-serif font-medium text-zinc-900">Reopen Application Review?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to reopen the review for <strong>{app.child.fullName}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3.5 text-xs text-amber-800 leading-relaxed space-y-1.5 text-left">
              <p className="font-semibold">Important Consequences:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>The child's status will revert to <strong>Review Reopened</strong> immediately.</li>
                <li>The digital event pass will be <strong>revoked</strong> and no longer valid for scan or check-in.</li>
                <li>The parent will be notified to check their dashboard.</li>
              </ul>
            </div>

            <div className="space-y-2 text-left">
              <label htmlFor="reopenReason" className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Reason for Reopening (Required for audit trail)
              </label>
              <textarea
                id="reopenReason"
                rows={3}
                placeholder="e.g. Discrepancy in medical notes, parent requested update, age limit verification required..."
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
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-bold text-zinc-600 uppercase tracking-wider transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reopening || !reopenReason.trim()}
                onClick={handleConfirmReopen}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white border border-amber-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center space-x-1.5 shadow-xs"
              >
                {reopening ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Reopening...</span>
                  </>
                ) : (
                  <span>Reopen Review</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER ACTIONS BAR */}
      <div className="border-t border-[#EAE8E1] pt-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-5 py-2.5 bg-white border border-[#EAE8E1] rounded-xl hover:bg-zinc-50 text-zinc-600 text-xs font-bold uppercase tracking-wider transition-colors shadow-2xs cursor-pointer"
        >
          BACK TO QUEUE
        </button>
      </div>

      {/* EDIT CHILD DETAILS MODAL */}
      {isEditModalOpen && (
        <div 
          className="fixed inset-0 bg-black/44 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          data-view-version="admin-child-edit-v3"
        >
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-5 max-h-[90vh] overflow-y-auto animate-scale-in text-zinc-800">
            <div className="flex items-start justify-between border-b border-[#EAE8E1]/80 pb-3">
              <h3 className="text-lg font-serif font-semibold text-zinc-900">Edit Child Details</h3>
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
              data-component-version="admin-child-edit-form-v3"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Gender</label>
                  <select
                    value={editForm.gender}
                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50 font-medium"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Date of Birth</label>
                  <input
                    type="date"
                    required
                    value={editForm.dateOfBirth}
                    onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50 font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">School Class / Grade</label>
                  <input
                    type="text"
                    placeholder="e.g. Primary 2"
                    value={editForm.schoolClass}
                    onChange={(e) => setEditForm({ ...editForm, schoolClass: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">School Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Koinonia Academy"
                    value={editForm.schoolName}
                    onChange={(e) => setEditForm({ ...editForm, schoolName: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50"
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
                  <label htmlFor="hasMedicalNotes" className="font-semibold text-zinc-700 cursor-pointer select-none">
                    Child has medical conditions / allergies
                  </label>
                </div>

                {editForm.hasMedicalNotes && (
                  <div className="space-y-1 pl-6.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Medical Details</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="List details of any allergies, asthma, medication or chronic conditions..."
                      value={editForm.medicalNotes}
                      onChange={(e) => setEditForm({ ...editForm, medicalNotes: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50"
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
                  <label htmlFor="needsExtraSupport" className="font-semibold text-zinc-700 cursor-pointer select-none">
                    Child requires special support or assistance
                  </label>
                </div>

                {editForm.needsExtraSupport && (
                  <div className="space-y-1 pl-6.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Support Details</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Specify support, learning, behavioral or developmental accommodations required..."
                      value={editForm.supportNotes}
                      onChange={(e) => setEditForm({ ...editForm, supportNotes: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50"
                    />
                  </div>
                )}
              </div>

              {/* Parent Profile section */}
              <div className="border-t border-[#EAE8E1]/60 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-[#8C6D23] uppercase tracking-wider">Parent Profile</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Parent Full Name</label>
                    <input
                      type="text"
                      required
                      value={editForm.parentFullName}
                      onChange={(e) => setEditForm({ ...editForm, parentFullName: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Parent Phone</label>
                    <input
                      type="text"
                      required
                      value={editForm.parentPhone}
                      onChange={(e) => setEditForm({ ...editForm, parentPhone: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50 font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Parent WhatsApp</label>
                    <input
                      type="text"
                      value={editForm.parentWhatsApp}
                      onChange={(e) => setEditForm({ ...editForm, parentWhatsApp: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50 font-medium"
                    />
                  </div>

                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Parent Home Address</label>
                    <textarea
                      rows={2}
                      value={editForm.parentHomeAddress}
                      onChange={(e) => setEditForm({ ...editForm, parentHomeAddress: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50"
                    />
                  </div>
                </div>
              </div>

              {/* Authorized Pickup section */}
              <div className="border-t border-[#EAE8E1]/60 pt-4 space-y-3">
                <h4 className="text-[10px] font-bold text-[#8C6D23] uppercase tracking-wider">Authorized Pickup</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Pickup Person Full Name</label>
                    <input
                      type="text"
                      value={editForm.pickupPersonName}
                      onChange={(e) => setEditForm({ ...editForm, pickupPersonName: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Relationship to Child</label>
                    <input
                      type="text"
                      placeholder="e.g. Uncle, Aunt, Driver..."
                      value={editForm.pickupPersonRelationship}
                      onChange={(e) => setEditForm({ ...editForm, pickupPersonRelationship: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Pickup Phone Number</label>
                    <input
                      type="text"
                      value={editForm.pickupPersonPhone}
                      onChange={(e) => setEditForm({ ...editForm, pickupPersonPhone: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all bg-zinc-50 font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-[#EAE8E1]/60">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-bold text-zinc-600 uppercase tracking-wider transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#8C6D23] hover:bg-[#715D3A] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Details</span>
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
              <div className="space-y-1">
                <h3 className="text-lg font-serif font-medium text-zinc-900">Remove Child Registration?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to remove and soft-delete the registration for <strong>{app.child.fullName}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-red-50/50 border border-red-100 rounded-xl p-3.5 text-xs text-red-800 leading-relaxed space-y-1.5">
              <p className="font-semibold">Consequences of Removal:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-red-700">
                <li>The child registration is soft-deleted and archived from event lists.</li>
                <li>Any generated digital event pass is immediately <strong>revoked</strong>.</li>
                <li>The child will not be able to scan or check in at the event.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <label htmlFor="removeReason" className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Reason for Removal (Required for audit trail)
              </label>
              <textarea
                id="removeReason"
                rows={3}
                placeholder="Specify the reason for archiving this child registration..."
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
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-bold text-zinc-600 uppercase tracking-wider transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removing || !removeReason.trim()}
                onClick={handleConfirmRemove}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white border border-red-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center space-x-1.5 shadow-xs cursor-pointer"
              >
                {removing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>Remove Child</span>
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
            <div className="flex items-start gap-3 text-[#8C6D23]">
              <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600" />
              <div className="space-y-1">
                <h3 className="text-lg font-serif font-medium text-zinc-900">Restore Child Registration?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to restore the child registration for <strong>{app.child.fullName}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3.5 text-xs text-emerald-800 leading-relaxed space-y-1">
              <p className="font-semibold">Effect of Restoration:</p>
              <p className="text-[11px] text-emerald-700">
                The profile is reactivated and restored to rosters. Its status will reset to <strong>Under Review</strong> so you can choose the appropriate event selection and issue passes.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={restoring}
                onClick={() => setIsRestoreModalOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-bold text-zinc-600 uppercase tracking-wider transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={restoring}
                onClick={handleConfirmRestore}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer"
              >
                {restoring ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <span>Restore Child</span>
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
                <h3 className="text-lg font-serif font-medium text-zinc-900">Revoke Event Pass?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to revoke the digital event pass for <strong>{app.child.fullName}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-red-50/50 border border-red-100 rounded-xl p-3.5 text-xs text-red-800 leading-relaxed space-y-1 text-left">
              <p className="font-semibold">Important Warning:</p>
              <p className="text-[11px] text-red-700">
                This digital pass reference will be disabled. It will no longer scan validly at check-in terminals, and parents will see that the pass has been withdrawn.
              </p>
            </div>

            <div className="space-y-2 text-left">
              <label htmlFor="revokeReason" className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Reason for Revocation (Required for parent notice)
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
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-bold text-zinc-600 uppercase tracking-wider transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={revoking || !revokeReason.trim()}
                onClick={handleConfirmRevokePass}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white border border-red-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center space-x-1.5 shadow-xs cursor-pointer"
              >
                {revoking ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Revoking...</span>
                  </>
                ) : (
                  <span>Revoke Pass</span>
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
                <h3 className="text-lg font-serif font-medium text-zinc-900">Select Child for Enrollment?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to select <strong>{app.child.fullName}</strong> for enrollment in <strong>{app.child.ageGroup || 'Section'}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3.5 text-xs text-emerald-800 leading-relaxed space-y-1.5 text-left">
              <p className="font-semibold text-[10px] uppercase tracking-wider">Consequences:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>Child's status will update to <strong>Selected</strong> instantly.</li>
                <li>You can subsequently generate their digital QR Event Pass.</li>
                <li>The parent will be notified to view their selection status online.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsSelectModalOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-bold text-zinc-600 uppercase tracking-wider transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSelect}
                className="px-4 py-2 bg-[#C59B27] hover:bg-[#B08921] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-xs cursor-pointer"
              >
                Confirm Selection
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
              <Hourglass className="w-6 h-6 shrink-0 text-zinc-600 animate-pulse" />
              <div className="space-y-1 text-left">
                <h3 className="text-lg font-serif font-medium text-zinc-900">Waitlist Child Registration?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to move <strong>{app.child.fullName}</strong> to the event Waitlist?
                </p>
              </div>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-xs text-zinc-700 leading-relaxed space-y-1.5 text-left">
              <p className="font-semibold text-[10px] uppercase tracking-wider">Consequences:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>Child's status will transition to <strong>Waitlist</strong>.</li>
                <li>If the child previously had an active event pass, it will be <strong>revoked</strong>.</li>
                <li>The parent will be informed that they are on the waitlist pending open slots.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsWaitlistModalOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-bold text-zinc-600 uppercase tracking-wider transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWaitlist}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-xs cursor-pointer"
              >
                Confirm Waitlist
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
                <h3 className="text-lg font-serif font-medium text-zinc-900">Mark as Not Selected?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to mark the application for <strong>{app.child.fullName}</strong> as not selected?
                </p>
              </div>
            </div>

            <div className="bg-red-50/50 border border-red-100 rounded-xl p-3.5 text-xs text-red-800 leading-relaxed space-y-1.5 text-left">
              <p className="font-semibold text-[10px] uppercase tracking-wider">Consequences:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>Child's status transitions to <strong>Not Selected</strong> immediately.</li>
                <li>Active digital event passes are instantly revoked.</li>
                <li>Parent receives an automated update advising of selection outcomes.</li>
              </ul>
            </div>

            <div className="space-y-2 text-left">
              <label htmlFor="notSelectedReason" className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Reason for Decision (Required for audit logging)
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
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-bold text-zinc-600 uppercase tracking-wider transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!notSelectedReason.trim()}
                onClick={handleConfirmNotSelected}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white border border-red-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-xs cursor-pointer"
              >
                Confirm Not Selected
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
              <QrCode className="w-6 h-6 shrink-0 text-emerald-600 animate-pulse" />
              <div className="space-y-1 text-left">
                <h3 className="text-lg font-serif font-medium text-zinc-900">Generate Digital Event Pass?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to generate and issue the secure digital Event Pass for <strong>{app.child.fullName}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3.5 text-xs text-emerald-800 leading-relaxed space-y-1.5 text-left">
              <p className="font-semibold text-[10px] uppercase tracking-wider">Consequences:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>A secure cryptographic check-in token is created.</li>
                <li>A premium printable & scannable QR Pass is activated on the parent dashboard.</li>
                <li>Child registration enters <strong>Pass Ready</strong> status, ready for physical gate scanning.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsGeneratePassModalOpen(false)}
                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 text-xs font-bold text-zinc-600 uppercase tracking-wider transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmGeneratePass}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-xs cursor-pointer"
              >
                Generate QR Pass
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

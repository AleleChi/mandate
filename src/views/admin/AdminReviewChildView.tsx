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
  MapPin,
  ChevronDown
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';

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

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getApplicationDetails(applicationId);
      if (res.success && res.application) {
        setApp(res.application);
        setNoteToTeam(res.application.noteToTeam || '');
        
        // Set ageChecked default to true if the child doesn't need age review
        setAgeChecked(!res.application.child.needsAgeReview);
        
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

  // Generate real-time live preview of the pastoral parent notification email (human-centered, off-portal)
  const getNotificationPreview = () => {
    if (!app) return '';
    const parentFirstName = app.parent.fullName.split(' ')[0] || app.parent.fullName;
    const childFirstName = app.child.fullName.split(' ')[0] || app.child.fullName;

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

      {/* TWO COLUMN GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: CHILD IDENTITY & CARE SHEETS (7 COLUMNS) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* 1. CHILD IDENTITY PROFILE HEADER CARD */}
          <div 
            className="bg-[#FCFBF9] border border-[#EAE8E1] rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row items-center sm:items-start gap-6"
            data-component-version="admin-review-child-identity-v3-refined"
          >
            {/* Child Photo with soft gold-tint border frame */}
            <div className="shrink-0">
              {app.child.photoUrl ? (
                <img 
                  referrerPolicy="no-referrer"
                  src={app.child.photoUrl} 
                  alt={app.child.fullName} 
                  className="w-24 h-28 rounded-2xl object-cover border border-[#E2DFD7] shadow-sm ring-1 ring-[#C59B27]/10 ring-offset-1"
                />
              ) : (
                <div className="w-24 h-28 rounded-2xl bg-gradient-to-br from-[#FCFBF9] to-[#EFECE4] border border-[#E2DFD7] flex flex-col items-center justify-center text-[#715D3A] font-medium text-2xl uppercase shadow-xs ring-1 ring-[#C59B27]/10 ring-offset-1">
                  <span>{app.child.fullName?.charAt(0) || 'C'}</span>
                  <span className="text-[9px] text-[#A37E1C] uppercase font-bold tracking-wider mt-1 font-sans">Child</span>
                </div>
              )}
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
              <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-[#EAE8E1]/60 pb-2">
                CHILD DETAILS
              </h3>
              
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
            >
              <div className="space-y-3.5">
                <h3 className="font-serif text-[13px] font-semibold text-zinc-700 pb-1.5 border-b border-[#EAE8E1]/60 uppercase tracking-wider text-xs">
                  Primary Contact
                </h3>

                <div className="flex items-start space-x-4 pt-1.5">
                  {app.parent.photoUrl ? (
                    <img 
                      referrerPolicy="no-referrer"
                      src={app.parent.photoUrl} 
                      alt={app.parent.fullName} 
                      className="w-20 h-24 rounded-xl object-cover border border-[#E2DFD7] shadow-xs shrink-0 ring-1 ring-[#C59B27]/5"
                    />
                  ) : (
                    <div className="w-20 h-24 rounded-xl bg-gradient-to-br from-[#FCFBF9] to-[#EFECE4] border border-[#E2DFD7] flex flex-col items-center justify-center text-[#715D3A] font-medium text-xl uppercase shrink-0 shadow-xs">
                      <span>{app.parent.fullName?.charAt(0) || 'P'}</span>
                      <span className="text-[8px] text-[#A37E1C] uppercase font-bold tracking-widest mt-1 font-sans">Guardian</span>
                    </div>
                  )}
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
            >
              <div className="space-y-3.5">
                <h3 className="font-serif text-[13px] font-semibold text-zinc-700 pb-1.5 border-b border-[#EAE8E1]/60 uppercase tracking-wider text-xs">
                  Authorized Pickup
                </h3>

                {app.pickupPeople && app.pickupPeople.length > 0 ? (
                  app.pickupPeople.slice(0, 1).map((person: any) => (
                    <div key={person.id} className="pt-1.5">
                      <div className="flex items-start space-x-4">
                        {person.photoUrl ? (
                          <img 
                            referrerPolicy="no-referrer"
                            src={person.photoUrl} 
                            alt={person.fullName} 
                            className="w-20 h-24 rounded-xl object-cover border border-[#E2DFD7] shadow-xs shrink-0 ring-1 ring-[#C59B27]/5"
                          />
                        ) : (
                          <div className="w-20 h-24 rounded-xl bg-gradient-to-br from-[#FCFBF9] to-[#EFECE4] border border-[#E2DFD7] flex flex-col items-center justify-center text-[#715D3A] font-medium text-xl uppercase shrink-0 shadow-xs">
                            <span>{person.fullName?.charAt(0) || 'P'}</span>
                            <span className="text-[8px] text-[#A37E1C] uppercase font-bold tracking-widest mt-1 font-sans">Pickup</span>
                          </div>
                        )}
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
        >
          <div className="space-y-1.5 pb-4 border-b border-[#EAE8E1]/60">
            <h2 className="text-2xl font-serif text-zinc-800 font-medium">Decision</h2>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Choose how this child should move forward.
            </p>
          </div>

          {/* Approved Status / Reopen Action Card */}
          {['selected', 'pass_ready'].includes(app.status) && (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Approved & Verified</h4>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    This child's application is currently approved and marked <strong>{statusLabels[app.status]}</strong>. 
                    Parents can access and download their secure digital event pass.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-emerald-100/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 text-xs font-bold text-zinc-700 transition-colors shadow-2xs cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  <span>REOPEN REVIEW</span>
                </button>
              </div>
            </div>
          )}

          {/* Checked-in Attendance State Card */}
          {['checked_in', 'inside', 'picked_up', 'checked_out'].includes(app.status) && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-[#C59B27] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Child In Attendance</h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    This child has already checked in or been picked up at the event. Review decisions cannot be reopened or revoked.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!['checked_in', 'inside', 'picked_up', 'checked_out'].includes(app.status) ? (
            <>
              {/* ATTENTION REQUIRED CHECKBOX IF AGE REVISIONS NEEDED */}
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

          {/* DYNAMIC DECISION SELECTOR (STACKED BUTTONS AS PER STITCH TARGET) */}
          <div className="space-y-2.5">
            {/* 1. SELECT CHILD BUTTON */}
            <button
              type="button"
              onClick={() => setDecision('selected')}
              className={`w-full p-3.5 text-left rounded-xl border transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider ${
                decision === 'selected'
                  ? 'bg-[#C59B27] border-[#C59B27] text-white shadow-xs'
                  : 'bg-white border-[#EAE8E1] hover:border-zinc-300 text-[#C59B27]'
              }`}
            >
              <span>SELECT CHILD</span>
              {decision === 'selected' ? (
                <Check className="w-4 h-4 text-white" />
              ) : (
                <Check className="w-4 h-4 text-zinc-400" />
              )}
            </button>

            {/* 2. MOVE TO WAITING LIST */}
            <button
              type="button"
              onClick={() => setDecision('waiting_list')}
              className={`w-full p-3.5 text-left rounded-xl border transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider ${
                decision === 'waiting_list'
                  ? 'bg-zinc-800 border-zinc-800 text-white shadow-xs'
                  : 'bg-white border-[#EAE8E1] hover:border-zinc-300 text-zinc-700'
              }`}
            >
              <span>MOVE TO WAITING LIST</span>
              <Hourglass className={`w-4 h-4 ${decision === 'waiting_list' ? 'text-white' : 'text-zinc-400'}`} />
            </button>

            {/* 3. REQUEST UPDATE */}
            <button
              type="button"
              onClick={() => setDecision('under_review')}
              className={`w-full p-3.5 text-left rounded-xl border transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider ${
                decision === 'under_review'
                  ? 'bg-[#C59B27]/10 border-[#C59B27] text-[#C59B27] shadow-xs'
                  : 'bg-white border-[#EAE8E1] hover:border-zinc-300 text-zinc-700'
              }`}
            >
              <span>REQUEST UPDATE</span>
              <Edit className="w-4 h-4 text-zinc-400" />
            </button>

            {/* 4. NOT SELECTED */}
            <button
              type="button"
              onClick={() => setDecision('not_selected')}
              className={`w-full p-3.5 text-left rounded-xl border transition-all flex items-center justify-between font-bold text-xs uppercase tracking-wider ${
                decision === 'not_selected'
                  ? 'bg-[#FFF8F6] border-red-200 text-red-700'
                  : 'bg-white border-[#EAE8E1] hover:border-zinc-300 text-zinc-700'
              }`}
            >
              <span className={decision === 'not_selected' ? 'text-red-700' : 'text-zinc-700'}>NOT SELECTED</span>
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          {/* TEAM INTERNAL NOTES */}
          <div className="space-y-1.5 pt-2">
            <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block">
              INTERNAL TEAM NOTES
            </span>
            <textarea
              value={noteToTeam}
              onChange={(e) => setNoteToTeam(e.target.value)}
              placeholder="Add notes for other reviewers..."
              rows={3}
              className="w-full p-3 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all placeholder:text-zinc-400 text-zinc-800"
            />
          </div>

          {/* AUTOMATED PARENT NOTIFICATION PREVIEW */}
          <div 
            className="space-y-2 pt-2 border-t border-[#EAE8E1]/60"
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
          </>
          ) : (
            <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-xl p-4 text-center">
              <p className="text-xs text-zinc-500">
                Decision options are locked because the child is already checked in.
              </p>
            </div>
          )}

          {/* REVIEWS HISTORY LOG */}
          <div 
            className="space-y-3 pt-4 border-t border-[#EAE8E1]/60"
            data-component-version="admin-review-history-v2"
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
                      <div className="mt-1 p-2 bg-zinc-50 border border-zinc-100 rounded-lg text-[10px] text-zinc-500 italic">
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
              <div className="space-y-1">
                <h3 className="text-lg font-serif font-medium text-zinc-900">Reopen Application Review?</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to reopen the review for <strong>{app.child.fullName}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3.5 text-xs text-amber-800 leading-relaxed space-y-1.5">
              <p className="font-semibold">Important Consequences:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>The child's status will revert to <strong>Review Reopened</strong> immediately.</li>
                <li>The digital event pass will be <strong>revoked</strong> and no longer valid for scan or check-in.</li>
                <li>The parent will be notified to check their dashboard.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <label htmlFor="reopenReason" className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Reason for Reopening (Required for audit trail)
              </label>
              <textarea
                id="reopenReason"
                rows={3}
                placeholder="e.g. Discrepancy in medical notes, parent requested update, age limit verification required..."
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                className="w-full p-3 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
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
          className="px-5 py-2.5 bg-white border border-[#EAE8E1] rounded-xl hover:bg-zinc-50 text-zinc-600 text-xs font-bold uppercase tracking-wider transition-colors shadow-2xs"
        >
          CANCEL
        </button>

        <Button
          onClick={handleSubmitReview}
          variant="primary"
          loading={saving}
          className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-xs"
        >
          SAVE DECISION
        </Button>
      </div>

    </div>
  );
};

export type AppRoute = string;

export type BottomNavTab = 'Home' | 'Children' | 'Status' | 'Passes' | 'Profile';

export interface ChildItem {
  id: string;
  name: string;
  age: number;
  ageGroup: string; // e.g., 'Ages 7 to 9', 'Ages 4 to 6'
  status: 'Draft' | 'Incomplete' | 'Under review' | 'Pass ready' | 'Selected' | 'Waiting list' | 'Not selected' | 'Withdrawn' | 'Checked in' | 'Inside' | 'Picked up' | 'Checked out';
  statusNote: string; // e.g., 'Details sent for review', 'Event pass is available'
  photoUrl: string;
  specialNeeds?: string;
  draftData?: AddChildDraft;
  submittedAt?: string;
  passReference?: string;
}

export interface AddChildDraft {
  id?: string;
  childDetails?: {
    photo: string;
    fullName: string;
    gender: string;
    dateOfBirth: string;
    calculatedAge: number | null;
    ageGroup: string;
    relationshipToChild: string;
    needsAgeReview?: boolean;
  };
  schoolAndAgeGroup?: {
    schoolClass: string;
    schoolName: string;
    previousChildrenProgramme: 'Yes' | 'No';
    noteToTeam?: string;
  };
  healthAndSupport?: {
    hasMedicalNotes: 'Yes' | 'No';
    medicalNotes?: string;
    needsExtraSupport: 'Yes' | 'No';
    supportNotes?: string;
    informationConfirmed?: boolean;
  };
  pickup?: {
    pickupType: 'parent' | 'other_person';
    mode?: string;
    pickupPersonPhoto?: string;
    pickupPersonFullName?: string;
    pickupPersonRelationship?: string;
    pickupPersonPhone?: string;
    pickupPersonWhatsApp?: string;
    approvedByParent?: boolean;
  };
  review?: {
    detailsConfirmed?: boolean;
    submittedAt?: string;
    status?: 'Draft' | 'Incomplete' | 'Under review';
  };

  photoUrl: string;
  fullName: string;
  gender: string;
  dob: string;
  age: number | null;
  ageGroup: string;
  relationship: string;
  needsReview?: boolean;
  schoolClass?: string;
  schoolName?: string;
  attendedBefore?: 'Yes' | 'No';
  careNote?: string;
  hasAllergies?: 'Yes' | 'No';
  medicalNote?: string;
  needsExtraSupport?: 'Yes' | 'No';
  supportNote?: string;
  infoConfirmed?: boolean;
  pickupType?: 'parent' | 'other_person';
  pickupPersonPhotoUrl?: string;
  pickupPersonFullName?: string;
  pickupPersonRelationship?: string;
  pickupPersonPhone?: string;
  pickupPersonWhatsapp?: string;
  pickupPersonApproved?: boolean;
}

export interface ParentProfile {
  fullName: string;
  email: string;
  phone: string;
  phoneNumber?: string;
  whatsapp: string;
  whatsappNumber?: string;
  homeAddress?: string;
  country?: string;
  stateRegion?: string;
  city?: string;
  preferredContact?: 'WhatsApp' | 'Email' | 'Phone call' | 'Both';
  isWorker: boolean;
  department?: string;
  photoFileId?: string;
  photoUrl?: string;
  profileCompletedAt?: string | null;
}

export interface EventDetails {
  title: string;
  subtitle: string;
  date: string;
  time: string;
  venue: string;
}

export interface PastMoment {
  id: string;
  category: 'Arrival' | 'Check-in' | 'Activities' | 'Teaching' | 'Care team' | 'Pickup' | 'Parent updates' | 'Event moments';
  title: string;
  description: string;
  imageUrl: string;
  videoUrl?: string;
  timeframe: string;
}

// Proof: data-component-version="alert-response-frontend-contract-v1"
export type AlertResponseStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'reopened' | 'cancelled';

export type ParticipantRole = 'owner' | 'assistant' | 'supervisor' | 'observer';

export type AlertResponseAction =
  | 'acknowledge'
  | 'join_response'
  | 'leave_response'
  | 'mark_in_progress'
  | 'add_update'
  | 'request_assistance'
  | 'request_handover'
  | 'accept_handover'
  | 'decline_handover'
  | 'reassign'
  | 'resolve'
  | 'reopen';

export function getResponseStatusLabel(status: AlertResponseStatus): string {
  switch (status) {
    case 'open': return 'Waiting for Responder';
    case 'acknowledged': return 'Acknowledged & Led';
    case 'in_progress': return 'Help in Progress';
    case 'resolved': return 'Resolved';
    case 'reopened': return 'Reopened';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

export function getResponseStatusDescription(status: AlertResponseStatus): string {
  switch (status) {
    case 'open': return 'The request has been sent to the event safety team and is waiting to be claimed.';
    case 'acknowledged': return 'A qualified responder has claimed the alert and is leading the physical response.';
    case 'in_progress': return 'The response team is actively addressing the concern.';
    case 'resolved': return 'The concern has been fully resolved.';
    case 'reopened': return 'The concern has been reopened and is being actively reassessed.';
    case 'cancelled': return 'The alert was cancelled or raised in error.';
    default: return '';
  }
}

export function getResponseStatusTone(status: AlertResponseStatus): { bg: string; text: string; border: string } {
  switch (status) {
    case 'open':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100' };
    case 'acknowledged':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case 'in_progress':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'resolved':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' };
    case 'reopened':
      return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    case 'cancelled':
      return { bg: 'bg-zinc-50', text: 'text-zinc-600', border: 'border-zinc-200' };
    default:
      return { bg: 'bg-zinc-50', text: 'text-zinc-700', border: 'border-zinc-200' };
  }
}


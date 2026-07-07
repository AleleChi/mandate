export type AppRoute =
  | '/'
  | '/parent/create-account'
  | '/parent/check-email'
  | '/parent/verify-email'
  | '/parent/sign-in'
  | '/parent/forgot-password'
  | '/parent/new-password'
  | '/parent/profile-setup'
  | '/parent/profile/edit'
  | '/parent/volunteer-request'
  | '/parent/home'
  | '/parent/profile'
  | '/parent/children'
  | '/parent/children/new'
  | '/parent/children/new/care-details'
  | '/parent/children/new/health-and-support'
  | '/parent/children/new/health-and-care'
  | '/parent/children/new/pickup-person'
  | '/parent/children/new/review'
  | '/parent/children/review-sent'
  | '/parent/status'
  | '/parent/passes'
  | `/parent/children/${string}/status`
  | `/parent/children/${string}/edit`
  | `/parent/children/${string}/pass`
  | '/volunteer/sign-in'
  | '/volunteer/forgot-password'
  | '/volunteer/reset-password'
  | '/volunteer/create-account'
  | '/volunteer/verify-email'
  | '/volunteer/pending-review'
  | '/volunteer/event'
  | '/volunteer/scan'
  | '/volunteer/children'
  | '/volunteer/reports'
  | '/volunteer/profile';

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
  preferredContact?: 'WhatsApp' | 'Email' | 'Phone call';
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

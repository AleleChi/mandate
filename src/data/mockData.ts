import { ChildItem, EventDetails, ParentProfile, PastMoment } from '../types';
import { REAL_ASSETS } from '../config/assets';

export const mockEventDetails: EventDetails = {
  title: 'Children and Teens',
  subtitle: 'The General Assembly',
  date: '22 Nov 2025',
  time: '9:00 AM to 7:00 PM',
  venue: 'Koinonia Global Auditorium & Children Pavilion, Abuja'
};

export const initialParentProfile: ParentProfile = {
  fullName: '',
  email: '',
  phone: '',
  whatsapp: '',
  homeAddress: '',
  preferredContact: 'WhatsApp',
  isWorker: false,
  department: '',
  photoUrl: ''
};

export const initialChildren: ChildItem[] = [];

export const pastMomentsReel: PastMoment[] = [
  {
    id: 'pm-1',
    category: 'Arrival',
    title: 'Arrival',
    description: 'Careful guidance and warm reception at the entrance point for children and parents.',
    imageUrl: REAL_ASSETS.gallery.arrival,
    timeframe: '08:30 AM'
  },
  {
    id: 'pm-2',
    category: 'Check-in',
    title: 'Check-in',
    description: 'Every child is verified against their official parent profile before entering their age pavilion.',
    imageUrl: REAL_ASSETS.gallery.checkIn,
    timeframe: '09:00 AM'
  },
  {
    id: 'pm-3',
    category: 'Activities',
    title: 'Activities',
    description: 'Thoughtful learning spaces tailored specifically for Ages 4-6, 7-9, and Teens.',
    imageUrl: REAL_ASSETS.gallery.activities,
    timeframe: '11:00 AM'
  },
  {
    id: 'pm-4',
    category: 'Teaching',
    title: 'Teaching',
    description: 'Deep, sound biblical instruction shared with wisdom and clarity for young minds.',
    imageUrl: REAL_ASSETS.gallery.teaching,
    timeframe: '01:30 PM'
  },
  {
    id: 'pm-5',
    category: 'Care team',
    title: 'Care team',
    description: 'Dedicated workers supervising hydration, rest, and safety throughout the event day.',
    imageUrl: REAL_ASSETS.gallery.careTeam,
    timeframe: 'All Day'
  },
  {
    id: 'pm-6',
    category: 'Pickup',
    title: 'Pickup',
    description: 'Authorized pickup persons must present their pass for verified child release.',
    imageUrl: REAL_ASSETS.gallery.pickup,
    timeframe: '07:00 PM'
  },
  {
    id: 'pm-7',
    category: 'Parent updates',
    title: 'Parent updates',
    description: 'Real-time notifications and progress shared directly to parent profiles.',
    imageUrl: REAL_ASSETS.gallery.parentUpdates,
    timeframe: 'Ongoing'
  },
  {
    id: 'pm-8',
    category: 'Event moments',
    title: 'Event moments',
    description: 'Joyful worship, interactive play zones, and community fellowship.',
    imageUrl: REAL_ASSETS.gallery.eventMoments,
    videoUrl: REAL_ASSETS.gallery.eventVideo,
    timeframe: 'Highlights'
  }
];

export const whatParentsDoSteps = [
  {
    stepNumber: '01',
    title: 'Create Parent Account',
    description: 'Establish your parent profile with verified contact and emergency details.'
  },
  {
    stepNumber: '02',
    title: 'Add Each Child',
    description: 'Enter individual details, age group, and recent photo for accurate identification.'
  },
  {
    stepNumber: '03',
    title: 'Send for Review',
    description: 'Our care team reviews submitted details to prepare age-appropriate arrangements.'
  },
  {
    stepNumber: '04',
    title: 'Receive Event Pass',
    description: 'Once selected, your secure digital event pass becomes ready for entry and pickup.'
  }
];

export const checksBeforeEntryList = [
  {
    title: 'Photo Verification',
    description: 'Recent child photo compared at entry point to confirm exact identity.'
  },
  {
    title: 'Parent & Guardian Profile',
    description: 'Verified contact numbers for immediate direct communication if required.'
  },
  {
    title: 'Authorized Pickup Person',
    description: 'Only designated guardians listed on your parent profile can complete pickup.'
  },
  {
    title: 'Secure Digital Pass',
    description: 'Unique pass code scanned by authorized staff at both entry and release.'
  }
];

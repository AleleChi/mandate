import React, { useEffect, useState } from 'react';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Plus, 
  ChevronRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle,
  Settings,
  Archive,
  Eye,
  Edit2,
  Trash2,
  Play,
  FileCheck2,
  Check,
  X
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { Button } from '../../components/common/Button';

interface AgeGroup {
  id?: string;
  label: string;
  minAge: number;
  maxAge: number;
  capacity: number;
  manualReview: boolean;
}

interface EventData {
  id?: string;
  title: string;
  sectionName: string;
  location: string;
  startsAt: string;
  endsAt: string;
  dailyStartTime: string;
  dailyEndTime: string;
  description: string;
  status: 'draft' | 'upcoming' | 'current' | 'closed' | 'archived';
  parentAccessOpensAt: string;
  parentAccessClosesAt: string;
  parentsCanCreateAccount: boolean;
  allowMultipleChildren: boolean;
  allowSaveAndContinue: boolean;
  allowEditAfterSubmission: boolean;
  totalCapacity?: number;
  applicationsCount?: number;
  selectedCount?: number;
}

const defaultAgeGroups: AgeGroup[] = [
  { label: 'Below', minAge: 0, maxAge: 1, capacity: 20, manualReview: true },
  { label: 'Ages 1', minAge: 1, maxAge: 3, capacity: 50, manualReview: true },
  { label: 'Ages 4', minAge: 4, maxAge: 6, capacity: 60, manualReview: false },
  { label: 'Ages 7', minAge: 7, maxAge: 9, capacity: 80, manualReview: false },
  { label: 'Ages 10', minAge: 10, maxAge: 12, capacity: 100, manualReview: false }
];

interface AdminEventsViewProps {
  onBackToOverview: () => void;
}

export const AdminEventsView: React.FC<AdminEventsViewProps> = ({ onBackToOverview }) => {
  const { showError, showSuccess } = useNotification();
  
  // Navigation states
  const [activeTab, setActiveTab] = useState<'current' | 'upcoming' | 'draft' | 'archived'>('current');
  const [currentScreen, setCurrentScreen] = useState<'home' | 'create' | 'edit'>('home');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Data states
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formSectionName, setFormSectionName] = useState('Children and Teens');
  const [formLocation, setFormLocation] = useState('');
  const [formStartsAt, setFormStartsAt] = useState('');
  const [formEndsAt, setFormEndsAt] = useState('');
  const [formDailyStartTime, setFormDailyStartTime] = useState('');
  const [formDailyEndTime, setFormDailyEndTime] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<EventData['status']>('draft');

  const [formParentAccessOpensAt, setFormParentAccessOpensAt] = useState('');
  const [formParentAccessClosesAt, setFormParentAccessClosesAt] = useState('');
  const [formParentsCanCreateAccount, setFormParentsCanCreateAccount] = useState(true);
  const [formAllowMultipleChildren, setFormAllowMultipleChildren] = useState(true);
  const [formAllowSaveAndContinue, setFormAllowSaveAndContinue] = useState(true);
  const [formAllowEditAfterSubmission, setFormAllowEditAfterSubmission] = useState(false);

  const [formAgeGroups, setFormAgeGroups] = useState<AgeGroup[]>(defaultAgeGroups);
  const [formAllowOverlappingAges, setFormAllowOverlappingAges] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getEvents();
      if (res.success) {
        setEvents(res.events || []);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Fetch Failed', parsed.message || 'Could not load events.');
    } finally {
      setLoading(false);
    }
  };

  const loadEventForEdit = async (eventId: string) => {
    setLoading(true);
    try {
      const res = await api.admin.getEvent(eventId);
      if (res.success && res.event) {
        const ev = res.event;
        setSelectedEventId(ev.id);
        setFormTitle(ev.title || '');
        setFormSectionName(ev.sectionName || 'Children and Teens');
        setFormLocation(ev.location || '');
        setFormStartsAt(ev.startsAt || '');
        setFormEndsAt(ev.endsAt || '');
        setFormDailyStartTime(ev.dailyStartTime || '');
        setFormDailyEndTime(ev.dailyEndTime || '');
        setFormDescription(ev.description || '');
        setFormStatus(ev.status || 'draft');

        setFormParentAccessOpensAt(ev.parentAccessOpensAt || '');
        setFormParentAccessClosesAt(ev.parentAccessClosesAt || '');
        setFormParentsCanCreateAccount(ev.parentsCanCreateAccount);
        setFormAllowMultipleChildren(ev.allowMultipleChildren);
        setFormAllowSaveAndContinue(ev.allowSaveAndContinue);
        setFormAllowEditAfterSubmission(ev.allowEditAfterSubmission);

        if (res.ageGroups && res.ageGroups.length > 0) {
          setFormAgeGroups(res.ageGroups);
        } else {
          setFormAgeGroups(defaultAgeGroups);
        }
        
        setFormAllowOverlappingAges(true);
        setCurrentScreen('edit');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Fetch Failed', parsed.message || 'Could not load event details.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateScreen = () => {
    setSelectedEventId(null);
    setFormTitle('');
    setFormSectionName('Children and Teens');
    setFormLocation('');
    setFormStartsAt('');
    setFormEndsAt('');
    setFormDailyStartTime('');
    setFormDailyEndTime('');
    setFormDescription('');
    setFormStatus('draft');

    setFormParentAccessOpensAt('');
    setFormParentAccessClosesAt('');
    setFormParentsCanCreateAccount(true);
    setFormAllowMultipleChildren(true);
    setFormAllowSaveAndContinue(true);
    setFormAllowEditAfterSubmission(false);

    setFormAgeGroups(defaultAgeGroups);
    setFormAllowOverlappingAges(true);
    setCurrentScreen('create');
  };

  const handleAddAgeGroupRow = () => {
    const newGroup: AgeGroup = {
      label: `Group ${formAgeGroups.length + 1}`,
      minAge: 0,
      maxAge: 17,
      capacity: 50,
      manualReview: false
    };
    setFormAgeGroups([...formAgeGroups, newGroup]);
  };

  const handleRemoveAgeGroupRow = (index: number) => {
    if (formAgeGroups.length <= 1) {
      showError('Invalid Action', 'At least one age group is required.');
      return;
    }
    const updated = [...formAgeGroups];
    updated.splice(index, 1);
    setFormAgeGroups(updated);
  };

  const handleAgeGroupChange = (index: number, field: keyof AgeGroup, value: any) => {
    const updated = [...formAgeGroups];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setFormAgeGroups(updated);
  };

  const validateForm = (isDraft: boolean): boolean => {
    if (!formTitle.trim()) {
      showError('Validation Error', 'Event Name is required.');
      return false;
    }
    if (formTitle.length > 120) {
      showError('Validation Error', 'Event Name cannot exceed 120 characters.');
      return false;
    }
    if (!formSectionName.trim()) {
      showError('Validation Error', 'Event group is required.');
      return false;
    }
    if (!formLocation.trim()) {
      showError('Validation Error', 'Venue is required.');
      return false;
    }
    if (formLocation.length > 120) {
      showError('Validation Error', 'Venue cannot exceed 120 characters.');
      return false;
    }
    if (!formStartsAt) {
      showError('Validation Error', 'Event Date is required.');
      return false;
    }
    if (!formDailyStartTime) {
      showError('Validation Error', 'Start Time is required.');
      return false;
    }
    if (!formDailyEndTime) {
      showError('Validation Error', 'End Time is required.');
      return false;
    }

    // Verify times
    if (formDailyStartTime && formDailyEndTime) {
      const [startH, startM] = formDailyStartTime.split(':').map(Number);
      const [endH, endM] = formDailyEndTime.split(':').map(Number);
      const startMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;
      if (endMin <= startMin) {
        showError('Validation Error', 'End Time must be strictly after Start Time.');
        return false;
      }
    }

    if (formDescription.length > 1000) {
      showError('Validation Error', 'Event Description cannot exceed 1000 characters.');
      return false;
    }

    // Access window validation
    if (formParentAccessOpensAt && formParentAccessClosesAt) {
      const openTime = new Date(formParentAccessOpensAt).getTime();
      const closeTime = new Date(formParentAccessClosesAt).getTime();
      if (closeTime <= openTime) {
        showError('Validation Error', 'Parent Access Closes date must be after Parent Access Opens date.');
        return false;
      }
    }

    // Age groups validation
    if (formAgeGroups.length === 0 && !isDraft) {
      showError('Validation Error', 'At least one age group is required to save an active event.');
      return false;
    }

    for (let i = 0; i < formAgeGroups.length; i++) {
      const group = formAgeGroups[i];
      if (!group.label.trim()) {
        showError('Validation Error', `Age group label at row ${i + 1} is required.`);
        return false;
      }
      if (group.minAge < 0 || group.maxAge < 0) {
        showError('Validation Error', `Ages at row ${i + 1} must be positive numbers.`);
        return false;
      }
      if (group.minAge > group.maxAge) {
        showError('Validation Error', `Min Age cannot exceed Max Age at row ${i + 1}.`);
        return false;
      }
      if (group.capacity <= 0) {
        showError('Validation Error', `Capacity at row ${i + 1} must be a positive integer.`);
        return false;
      }
    }

    if (!formAllowOverlappingAges) {
      for (let i = 0; i < formAgeGroups.length; i++) {
        const g1 = formAgeGroups[i];
        for (let j = i + 1; j < formAgeGroups.length; j++) {
          const g2 = formAgeGroups[j];
          const overlap = Math.max(g1.minAge, g2.minAge) <= Math.min(g1.maxAge, g2.maxAge);
          if (overlap) {
            showError('Validation Error', `Overlapping age ranges detected between "${g1.label}" (${g1.minAge}-${g1.maxAge}) and "${g2.label}" (${g2.minAge}-${g2.maxAge}).`);
            return false;
          }
        }
      }
    }

    return true;
  };

  const handleSaveEvent = async (statusOverride?: EventData['status']) => {
    const targetStatus = statusOverride || formStatus;
    const isSavingDraft = targetStatus === 'draft';
    
    if (!validateForm(isSavingDraft)) {
      return;
    }

    setSubmitting(true);
    const payload = {
      title: formTitle,
      sectionName: formSectionName,
      location: formLocation,
      startsAt: formStartsAt,
      endsAt: formEndsAt || formStartsAt,
      dailyStartTime: formDailyStartTime,
      dailyEndTime: formDailyEndTime,
      description: formDescription,
      status: targetStatus,
      parentAccessOpensAt: formParentAccessOpensAt || null,
      parentAccessClosesAt: formParentAccessClosesAt || null,
      parentsCanCreateAccount: formParentsCanCreateAccount,
      allowMultipleChildren: formAllowMultipleChildren,
      allowSaveAndContinue: formAllowSaveAndContinue,
      allowEditAfterSubmission: formAllowEditAfterSubmission,
      ageGroups: formAgeGroups
    };

    try {
      if (currentScreen === 'create') {
        const res = await api.admin.createEvent(payload);
        if (res.success) {
          showSuccess('Success', isSavingDraft ? 'Event saved as draft successfully.' : 'Event created successfully.');
          setCurrentScreen('home');
          fetchEvents();
        }
      } else {
        if (selectedEventId) {
          const res = await api.admin.updateEvent(selectedEventId, payload);
          if (res.success) {
            showSuccess('Success', 'Event details saved successfully.');
            setCurrentScreen('home');
            fetchEvents();
          }
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Save Failed', parsed.message || 'Could not save event details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetCurrentActive = async (eventId: string) => {
    try {
      const res = await api.admin.setCurrentEvent(eventId);
      if (res.success) {
        showSuccess('Active Status Updated', 'This event is now designated as the active current event.');
        fetchEvents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action Failed', parsed.message || 'Could not set active current event.');
    }
  };

  const handleArchiveEvent = async (eventId: string) => {
    if (!window.confirm('Are you sure you want to archive this event? Once archived, parents will no longer be able to submit applications for it.')) {
      return;
    }
    try {
      const res = await api.admin.archiveEvent(eventId);
      if (res.success) {
        showSuccess('Archived', 'Event has been archived successfully.');
        fetchEvents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action Failed', parsed.message || 'Could not archive event.');
    }
  };

  const ToggleSwitch = ({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) => (
    <div className="flex items-center justify-between py-2 border-b border-[#EAE8E1]/60 last:border-0">
      <div className="flex flex-col space-y-0.5 max-w-sm">
        <span className="text-xs font-semibold text-[#18181B]">{label}</span>
        <span className="text-[10px] text-zinc-500 leading-normal">{description}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          checked ? 'bg-[#C59B27]' : 'bg-zinc-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );

  // Helper metrics for setup progress sidebar panel
  const isCoreDetailsDone = !!(formTitle && formSectionName && formLocation && formStartsAt && formDailyStartTime && formDailyEndTime);
  const isCapacityLimitsDone = formAgeGroups.length > 0;
  const isParentAccessDone = !!(formParentAccessOpensAt && formParentAccessClosesAt);

  const getFilteredEvents = () => {
    return events.filter(e => {
      if (activeTab === 'current') return e.status === 'current' || e.status === 'open' || e.status === 'active';
      if (activeTab === 'upcoming') return e.status === 'upcoming';
      if (activeTab === 'draft') return e.status === 'draft';
      if (activeTab === 'archived') return e.status === 'archived' || e.status === 'closed';
      return false;
    });
  };

  const filteredEvents = getFilteredEvents();

  if (loading && events.length === 0 && currentScreen === 'home') {
    return (
      <div className="py-20 flex justify-center items-center">
        <KoinoniaInlineLoader variant="line" label="Loading events..." />
      </div>
    );
  }

  return (
    <div 
      className="space-y-6"
      data-view-version="admin-events-v3-current-event-visible"
    >
      {currentScreen === 'home' && (
        <div className="space-y-6" data-component-version="admin-events-home-v1">
          {/* Header block */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-serif text-2xl font-bold text-[#18181B] tracking-normal">Events</h2>
              <p className="text-xs text-zinc-500">Create and manage events for children, parents, and volunteers.</p>
            </div>
            
            <Button
              type="button"
              onClick={handleOpenCreateScreen}
              className="bg-[#C59B27] text-white hover:bg-[#b58c22] px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2 shadow-xs transition-all cursor-pointer self-start sm:self-center"
            >
              <Plus className="w-4 h-4" />
              <span>Create event</span>
            </Button>
          </div>

          {/* Tab Filter bar */}
          <div className="border-b border-[#EAE8E1] flex space-x-6 overflow-x-auto scrollbar-hide shrink-0">
            {[
              { id: 'current', label: 'Current event' },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'draft', label: 'Drafts' },
              { id: 'archived', label: 'Past events' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3.5 text-xs font-semibold border-b-2 transition-all shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-[#C59B27] text-[#18181B]'
                    : 'border-transparent text-zinc-400 hover:text-zinc-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Event items representation */}
          {filteredEvents.length === 0 ? (
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-16 text-center max-w-xl mx-auto space-y-4 shadow-2xs">
              <div className="w-12 h-12 bg-[#C59B27]/5 border border-[#C59B27]/10 text-[#C59B27] rounded-2xl flex items-center justify-center mx-auto">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-base font-bold text-[#18181B]">No events yet</h3>
              <p className="text-xs text-zinc-500 leading-relaxed max-w-xs mx-auto">
                Create your first event to begin setup.
              </p>
              <Button
                type="button"
                onClick={handleOpenCreateScreen}
                className="text-xs bg-[#C59B27] text-white hover:bg-[#b58c22] px-4 py-2"
              >
                Create event
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredEvents.map(event => (
                <div 
                  key={event.id}
                  data-component-version={event.status === 'current' || event.status === 'open' || event.status === 'active' ? "admin-current-event-card-v2" : undefined}
                  className="bg-white border border-[#EAE8E1] rounded-2xl p-6 shadow-3xs flex flex-col lg:flex-row justify-between lg:items-center gap-6 hover:border-[#C59B27]/30 transition-all"
                >
                  <div className="space-y-3.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="font-serif text-base font-bold text-[#18181B] truncate">{event.title}</h4>
                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-zinc-50 text-zinc-600 border border-zinc-100">
                        {event.sectionName}
                      </span>
                      {(event.status === 'current' || event.status === 'open' || event.status === 'active') && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Active Current
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-2 gap-x-4 text-xs text-zinc-500">
                      <div className="flex items-center space-x-2" data-component-version={event.status === 'current' || event.status === 'open' || event.status === 'active' ? "admin-current-event-date-meta-v1" : undefined}>
                        <Calendar className={`w-3.5 h-3.5 shrink-0 ${event.status === 'current' || event.status === 'open' || event.status === 'active' ? 'text-[#C59B27] stroke-[2.5]' : 'text-zinc-400'}`} />
                        <span className={event.status === 'current' || event.status === 'open' || event.status === 'active' ? 'text-zinc-700 font-semibold' : ''}>{event.startsAt}</span>
                      </div>
                      <div className="flex items-center space-x-2" data-component-version={event.status === 'current' || event.status === 'open' || event.status === 'active' ? "admin-current-event-time-meta-v1" : undefined}>
                        <Clock className={`w-3.5 h-3.5 shrink-0 ${event.status === 'current' || event.status === 'open' || event.status === 'active' ? 'text-[#C59B27] stroke-[2.5]' : 'text-zinc-400'}`} />
                        <span className={event.status === 'current' || event.status === 'open' || event.status === 'active' ? 'text-zinc-700 font-semibold' : ''}>{event.dailyStartTime} - {event.dailyEndTime}</span>
                      </div>
                      <div className="flex items-center space-x-2" data-component-version={event.status === 'current' || event.status === 'open' || event.status === 'active' ? "admin-current-event-venue-meta-v1" : undefined}>
                        <MapPin className={`w-3.5 h-3.5 shrink-0 ${event.status === 'current' || event.status === 'open' || event.status === 'active' ? 'text-[#C59B27] stroke-[2.5]' : 'text-zinc-400'}`} />
                        <span className={`truncate ${event.status === 'current' || event.status === 'open' || event.status === 'active' ? 'text-zinc-700 font-semibold' : ''}`}>{event.location}</span>
                      </div>
                    </div>

                    {/* Meta capacity & access windows info */}
                    <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-zinc-100/60 text-[10px] text-zinc-400 font-medium">
                      <span>Total Capacity: <strong className="text-zinc-600">{event.totalCapacity || 0}</strong></span>
                      <span>Applications Submitted: <strong className="text-zinc-600">{event.applicationsCount || 0}</strong></span>
                      <span>Confirmed Seats: <strong className="text-zinc-600">{event.selectedCount || 0}</strong></span>
                      {event.parentAccessOpensAt && (
                        <span>Access Window: <span className="text-zinc-500">{event.parentAccessOpensAt.split('T')[0]} to {event.parentAccessClosesAt?.split('T')[0]}</span></span>
                      )}
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2 shrink-0 self-start lg:self-center">
                    <Button
                      type="button"
                      onClick={() => loadEventForEdit(event.id!)}
                      data-component-version={event.status === 'current' || event.status === 'open' || event.status === 'active' ? "admin-current-event-edit-action-v2" : undefined}
                      className={
                        event.status === 'current' || event.status === 'open' || event.status === 'active'
                          ? "p-2.5 text-white bg-[#C59B27] hover:bg-[#A37B1E] rounded-xl border border-[#C59B27] flex items-center justify-center cursor-pointer transition-colors shadow-sm"
                          : "p-2 text-zinc-600 hover:text-[#C59B27] bg-zinc-50 hover:bg-zinc-100 rounded-xl border border-zinc-200/50 flex items-center justify-center cursor-pointer"
                      }
                      title="Edit Event details"
                    >
                      <Edit2 className={
                        event.status === 'current' || event.status === 'open' || event.status === 'active'
                          ? "w-4 h-4 stroke-[2.5]"
                          : "w-3.5 h-3.5"
                      } />
                    </Button>

                    {event.status !== 'current' && event.status !== 'open' && event.status !== 'active' && event.status !== 'archived' && (
                      <Button
                        type="button"
                        onClick={() => handleSetCurrentActive(event.id!)}
                        className="text-[10px] font-bold bg-[#C59B27]/5 text-[#C59B27] hover:bg-[#C59B27]/10 px-3 py-2 rounded-xl border border-[#C59B27]/20 flex items-center space-x-1 cursor-pointer"
                        title="Set as Active Current Event"
                      >
                        <Play className="w-3 h-3 fill-[#C59B27]" />
                        <span>Make Current</span>
                      </Button>
                    )}

                    {event.status !== 'archived' && (
                      <Button
                        type="button"
                        onClick={() => handleArchiveEvent(event.id!)}
                        data-component-version={event.status === 'current' || event.status === 'open' || event.status === 'active' ? "admin-current-event-archive-action-v2" : undefined}
                        className={
                          event.status === 'current' || event.status === 'open' || event.status === 'active'
                            ? "p-2.5 text-red-700 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 flex items-center justify-center cursor-pointer transition-colors"
                            : "p-2 text-zinc-400 hover:text-red-600 bg-zinc-50 hover:bg-red-50 rounded-xl border border-zinc-200/50 flex items-center justify-center cursor-pointer"
                        }
                        title="Archive Event"
                      >
                        <Archive className={
                          event.status === 'current' || event.status === 'open' || event.status === 'active'
                            ? "w-4 h-4 stroke-[2.5]"
                            : "w-3.5 h-3.5"
                        } />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(currentScreen === 'create' || currentScreen === 'edit') && (
        <div 
          className="space-y-6" 
          data-view-version={currentScreen === 'edit' ? "admin-edit-event-v2-current-event" : "admin-create-event-v1-stitch"}
        >
          {/* Back Action Bar */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setCurrentScreen('home')}
              className="p-1.5 rounded-xl border border-[#EAE8E1] bg-white hover:bg-zinc-50 text-zinc-500 hover:text-[#18181B] transition-all cursor-pointer flex items-center justify-center"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-400">
              <span className="hover:text-zinc-600 cursor-pointer" onClick={() => setCurrentScreen('home')}>Events</span>
              <ChevronRight className="w-3 h-3 text-zinc-300" />
              <span className="text-[#18181B]">{currentScreen === 'create' ? 'Create event' : 'Edit event'}</span>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="font-serif text-2xl font-bold text-[#18181B] tracking-normal">
              {currentScreen === 'create' ? 'Create event' : 'Edit event'}
            </h2>
          </div>

          {/* Form grid layout matching the Stitch screenshots */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left/Middle Column - Main form cards */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Card 1: Event Details */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xs"
                data-component-version={currentScreen === 'edit' ? "admin-edit-current-event-details-v1" : "admin-create-event-details-v1"}
              >
                <div className="space-y-1 border-b border-[#EAE8E1]/60 pb-4">
                  <h3 className="font-serif text-lg font-bold text-[#18181B]">Event Details</h3>
                  <p className="text-[11px] text-zinc-400">Define the core information for this event.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#18181B] mb-1.5">Event Name</label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={e => setFormTitle(e.target.value)}
                      placeholder="The General Assembly"
                      className="w-full px-4 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#18181B] mb-1.5">Event group</label>
                      <select
                        value={formSectionName}
                        onChange={e => setFormSectionName(e.target.value)}
                        className="w-full px-4 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all appearance-none cursor-pointer"
                      >
                        <option value="Children and Teens">Children and Teens</option>
                        <option value="Young Adults">Young Adults</option>
                        <option value="Families">Families</option>
                        <option value="Volunteers & Workers">Volunteers & Workers</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#18181B] mb-1.5">Venue</label>
                      <input
                        type="text"
                        value={formLocation}
                        onChange={e => setFormLocation(e.target.value)}
                        placeholder="Main Auditorium"
                        className="w-full px-4 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#18181B] mb-1.5">Event Date</label>
                      <input
                        type="date"
                        value={formStartsAt}
                        onChange={e => setFormStartsAt(e.target.value)}
                        className="w-full px-4 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#18181B] mb-1.5">Start Time</label>
                      <input
                        type="time"
                        value={formDailyStartTime}
                        onChange={e => setFormDailyStartTime(e.target.value)}
                        className="w-full px-4 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#18181B] mb-1.5">End Time</label>
                      <input
                        type="time"
                        value={formDailyEndTime}
                        onChange={e => setFormDailyEndTime(e.target.value)}
                        className="w-full px-4 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#18181B] mb-1.5">Event Description</label>
                    <textarea
                      value={formDescription}
                      onChange={e => setFormDescription(e.target.value)}
                      placeholder="Provide details about the event's purpose and expectations..."
                      rows={4}
                      className="w-full px-4 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Parent Access Configuration */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xs"
                data-component-version={currentScreen === 'edit' ? "admin-edit-current-event-parent-access-v1" : "admin-create-event-parent-access-v1"}
              >
                <div className="space-y-1 border-b border-[#EAE8E1]/60 pb-4">
                  <h3 className="font-serif text-lg font-bold text-[#18181B]">Parent Access Configuration</h3>
                  <p className="text-[11px] text-zinc-400">Control when and how parents interact with this event.</p>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#18181B] mb-1.5">Parent Access Opens</label>
                      <input
                        type="datetime-local"
                        value={formParentAccessOpensAt}
                        onChange={e => setFormParentAccessOpensAt(e.target.value)}
                        className="w-full px-4 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#18181B] mb-1.5">Parent Access Closes</label>
                      <input
                        type="datetime-local"
                        value={formParentAccessClosesAt}
                        onChange={e => setFormParentAccessClosesAt(e.target.value)}
                        className="w-full px-4 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <ToggleSwitch
                      checked={formParentsCanCreateAccount}
                      onChange={setFormParentsCanCreateAccount}
                      label="Parents can create account"
                      description="Allow new registrations during the access window."
                    />
                    
                    <ToggleSwitch
                      checked={formAllowMultipleChildren}
                      onChange={setFormAllowMultipleChildren}
                      label="Add more than one child"
                      description="Enable batch registration for siblings."
                    />

                    <ToggleSwitch
                      checked={formAllowSaveAndContinue}
                      onChange={setFormAllowSaveAndContinue}
                      label="Save and finish later"
                      description="Allow partial application saves."
                    />

                    <ToggleSwitch
                      checked={formAllowEditAfterSubmission}
                      onChange={setFormAllowEditAfterSubmission}
                      label="Edit details after sending for review"
                      description="Permit changes while status is pending."
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: Age Groups & Capacity */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xs"
                data-component-version={currentScreen === 'edit' ? "admin-edit-current-event-age-groups-v1" : "admin-create-event-age-capacity-v1"}
              >
                <div className="flex justify-between items-center border-b border-[#EAE8E1]/60 pb-4">
                  <div className="space-y-1">
                    <h3 className="font-serif text-lg font-bold text-[#18181B]">Age Groups & Capacity</h3>
                    <p className="text-[11px] text-zinc-400">Define sections, age limits, and headcount.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddAgeGroupRow}
                    className="text-xs font-bold text-[#C59B27] hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Group</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#EAE8E1] text-zinc-400 font-medium pb-2">
                        <th className="py-2 pr-4 font-semibold">Age Group</th>
                        <th className="py-2 pr-4 font-semibold">Min Age</th>
                        <th className="py-2 pr-4 font-semibold">Max Age</th>
                        <th className="py-2 pr-4 font-semibold">Capacity</th>
                        <th className="py-2 pr-4 font-semibold">Manual Review</th>
                        <th className="py-2 font-semibold text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {formAgeGroups.map((group, idx) => (
                        <tr key={idx} className="hover:bg-[#FAF9F6]/40">
                          <td className="py-2.5 pr-4">
                            <input
                              type="text"
                              value={group.label}
                              onChange={e => handleAgeGroupChange(idx, 'label', e.target.value)}
                              placeholder="Ages 4"
                              className="w-24 px-2 py-1 text-xs rounded-lg border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none"
                            />
                          </td>
                          <td className="py-2.5 pr-4">
                            <input
                              type="number"
                              value={group.minAge}
                              onChange={e => handleAgeGroupChange(idx, 'minAge', parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 text-xs rounded-lg border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none"
                            />
                          </td>
                          <td className="py-2.5 pr-4">
                            <input
                              type="number"
                              value={group.maxAge}
                              onChange={e => handleAgeGroupChange(idx, 'maxAge', parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 text-xs rounded-lg border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none"
                            />
                          </td>
                          <td className="py-2.5 pr-4">
                            <input
                              type="number"
                              value={group.capacity}
                              onChange={e => handleAgeGroupChange(idx, 'capacity', parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 text-xs rounded-lg border border-[#EAE8E1] bg-[#FAF9F6] focus:outline-none"
                            />
                          </td>
                          <td className="py-2.5 pr-4">
                            <input
                              type="checkbox"
                              checked={group.manualReview}
                              onChange={e => handleAgeGroupChange(idx, 'manualReview', e.target.checked)}
                              className="h-3.5 w-3.5 rounded-sm border-zinc-300 text-[#C59B27] focus:ring-[#C59B27]/40 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveAgeGroupRow(idx)}
                              className="p-1 text-zinc-400 hover:text-red-600 rounded-lg"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-4 border-t border-[#EAE8E1]/60 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="allow-overlapping-ages"
                    checked={formAllowOverlappingAges}
                    onChange={e => setFormAllowOverlappingAges(e.target.checked)}
                    className="h-3.5 w-3.5 rounded-sm border-zinc-300 text-[#C59B27] focus:ring-[#C59B27]/40 cursor-pointer"
                  />
                  <label htmlFor="allow-overlapping-ages" className="text-xs text-zinc-500 font-medium select-none cursor-pointer">
                    Allow overlapping age ranges (e.g. Below 0-1 and Ages 1-3)
                  </label>
                </div>
              </div>

            </div>

            {/* Right Column - Setup context panels */}
            <div className="space-y-6">
              
              {/* Panel A: Setup Progress */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4 shadow-2xs"
                data-component-version="admin-create-event-setup-progress-v1"
              >
                <h4 className="font-serif text-sm font-bold text-[#18181B]">Setup Progress</h4>
                
                <div className="space-y-3.5">
                  {[
                    { label: 'Core Details', done: isCoreDetailsDone },
                    { label: 'Capacity Limits', done: isCapacityLimitsDone },
                    { label: 'Parent Access', done: isParentAccessDone },
                    { label: 'Staff Assignment', done: false, subText: 'Pending configuration' },
                    { label: 'Automated Messages', done: false, subText: 'Pending configuration' }
                  ].map((step, idx) => (
                    <div key={idx} className="flex items-start space-x-3 text-xs">
                      {step.done ? (
                        <CheckCircle2 className="w-4 h-4 text-[#C59B27] mt-0.5 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-zinc-200 mt-0.5 shrink-0" />
                      )}
                      <div className="space-y-0.5">
                        <span className={`font-semibold ${step.done ? 'text-zinc-700' : 'text-zinc-400'}`}>
                          {step.label}
                        </span>
                        {step.subText && !step.done && (
                          <span className="block text-[9px] text-zinc-400 leading-none">{step.subText}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Panel B: Parent View Preview */}
              <div 
                className="bg-[#FFFDF6] border border-[#F5E6BE]/40 rounded-2xl p-6 space-y-4 shadow-2xs"
                data-component-version="admin-create-event-parent-preview-v1"
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-[#F5E6BE]/20">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Parent View Preview
                  </span>
                  <Eye className="w-3.5 h-3.5 text-[#C59B27]" />
                </div>

                <div className="bg-white border border-[#EAE8E1] rounded-xl p-4 space-y-3 shadow-3xs">
                  <span className="px-2 py-0.5 rounded bg-zinc-100 text-[8px] font-bold text-zinc-500 uppercase tracking-wider">
                    {formSectionName || 'Children and Teens'}
                  </span>
                  <h5 className="font-serif text-sm font-bold text-[#18181B] leading-snug">
                    {formTitle || 'Event Title Placeholder'}
                  </h5>
                  <div className="space-y-1.5 text-[10px] text-zinc-500">
                    <div className="flex items-center space-x-1.5">
                      <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                      <span>{formLocation || 'Main Auditorium'}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Calendar className="w-3 h-3 text-zinc-400 shrink-0" />
                      <span>{formStartsAt || 'Nov 22, 2025'}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Clock className="w-3 h-3 text-zinc-400 shrink-0" />
                      <span>{formDailyStartTime || '09:00'} - {formDailyEndTime || '17:00'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel C: Before Opening Access warning */}
              <div className="bg-[#FFF8F8] border border-[#FCDEDE] rounded-2xl p-5 flex items-start space-x-3 text-xs shadow-2xs">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <span className="font-bold text-red-800">Before Opening Access</span>
                  <p className="text-[10px] text-red-700 leading-relaxed font-medium">
                    Ensure capacity limits, parent access dates, and volunteer availability are ready before parents can register.
                  </p>
                </div>
              </div>

              {/* Form Action Controls */}
              <div className="space-y-2 pt-2">
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSaveEvent('upcoming')}
                  className="w-full bg-[#C59B27] text-white hover:bg-[#b58c22] py-2.5 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center justify-center space-x-2"
                >
                  {submitting ? (
                    <span>Saving...</span>
                  ) : (
                    <span>{currentScreen === 'create' ? 'Create Event' : 'Save Event'}</span>
                  )}
                </Button>

                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSaveEvent('draft')}
                  className="w-full bg-white text-zinc-700 hover:bg-zinc-50 py-2.5 rounded-xl text-xs font-semibold border border-zinc-200 shadow-2xs transition-all cursor-pointer flex items-center justify-center"
                >
                  <span>Save as Draft</span>
                </Button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setCurrentScreen('home')}
                  className="w-full text-center text-xs font-semibold text-zinc-400 hover:text-zinc-600 py-1 transition-all block cursor-pointer"
                >
                  Cancel
                </button>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
};

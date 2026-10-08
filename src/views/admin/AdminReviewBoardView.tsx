import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Users, 
  Search, 
  X, 
  AlertCircle, 
  Filter, 
  SlidersHorizontal, 
  ChevronRight, 
  CheckSquare, 
  Square,
  Loader2,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AdminReviewChildView } from './AdminReviewChildView';
import { CompletionReminderModal } from '../../components/admin/CompletionReminderModal';
import { BulkCompletionReminderModal } from '../../components/admin/BulkCompletionReminderModal';
import { BulkApplicationReviewModal, BulkReviewDecision } from '../../components/admin/BulkApplicationReviewModal';

interface AdminReviewBoardViewProps {
  onBackToOverview: () => void;
  initialApplicationId?: string | null;
  initialChildId?: string | null;
  onClearInitialParams?: () => void;
}

export const AdminReviewBoardView: React.FC<AdminReviewBoardViewProps> = ({
  onBackToOverview: _onBackToOverview,
  initialApplicationId,
  initialChildId,
  onClearInitialParams
}) => {
  const { showError, showSuccess } = useNotification();
  const [applications, setApplications] = useState<any[]>([]);
  const [dbStats, setDbStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // View states
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  
  // Search and Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'oldest' | 'newest' | 'not_reminded' | 'most_reminded' | 'youngest' | 'oldest_child' | 'name_asc'>('oldest');
  
  // Filter States
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [flagFilter, setFlagFilter] = useState<string>('all');
  const [workerFilter, setWorkerFilter] = useState<string>('all');
  const [ageFilter, setAgeFilter] = useState<string>('all');
  const [reminderFilter, setReminderFilter] = useState<string>('all');
  
  // Mobile sheet drawer filters open
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [bulkDecision, setBulkDecision] = useState<'selected' | 'waiting_list' | 'not_selected' | 'under_review'>('selected');
  const [bulkNote, setBulkNote] = useState('');
  const isFetchingRef = useRef(false);

  // Completion Reminder Modal State
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderTarget, setReminderTarget] = useState<{ id: string; childName: string; parentName: string } | null>(null);
  const [bulkReminderModalOpen, setBulkReminderModalOpen] = useState(false);

  const fetchApplications = async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await api.admin.getApplications({ limit: 10000 });
      if (res.success) {
        setApplications(res.applications || []);
        if (res.stats) {
          setDbStats(res.stats);
        }
        setFetchError(null);
      }
    } catch (err: any) {
      console.error('[AdminReviewBoardView - fetchApplications Error]:', err);
      const parsed = extractApiError(err);
      const errMsg = parsed.message || 'Could not load registration records.';
      setFetchError(errMsg);
      showError('Fetch Failed', errMsg);
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  useEffect(() => {
    if (loading || applications.length === 0) return;

    if (initialApplicationId) {
      const matchedApp = applications.find(app => app.id === initialApplicationId);
      if (matchedApp) {
        setSelectedApplicationId(initialApplicationId);
      } else {
        showError('Not Found', 'This item is no longer available.');
      }
      if (onClearInitialParams) {
        onClearInitialParams();
      }
    } else if (initialChildId) {
      const matchedApp = applications.find(app => app.child?.id === initialChildId || app.child_id === initialChildId);
      if (matchedApp) {
        setSelectedApplicationId(matchedApp.id);
      } else {
        showError('Not Found', 'This item is no longer available.');
      }
      if (onClearInitialParams) {
        onClearInitialParams();
      }
    }
  }, [initialApplicationId, initialChildId, applications, loading]);

  // Map phone numbers to sibling groups
  const siblingMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    applications.forEach(app => {
      const phone = app.parent?.phone;
      if (phone) {
        if (!map[phone]) map[phone] = [];
        if (app.child?.fullName) map[phone].push(app.child.fullName);
      }
    });
    return map;
  }, [applications]);

  // Enrich applications with contextual attention conditions and sibling relationships
  const enrichedApplications = useMemo(() => {
    return applications.map(app => {
      const isBelowAge = (app.child?.age !== undefined && app.child?.age !== null) ? (app.child.age < 2 || app.child.age > 14) : false;
      const isMissingPickupPhoto = app.pickupPeople && app.pickupPeople.length > 0 && app.pickupPeople.some((p: any) => !p.photoUrl);
      const isMissingChildPhoto = !app.child?.photoUrl;
      const hasMedicalNotes = !!app.hasMedicalNotes || !!app.medicalNotes;
      const needsExtraSupport = !!app.needsExtraSupport || !!app.supportNotes;
      
      const phone = app.parent?.phone;
      const siblings = (phone && siblingMap[phone]) ? siblingMap[phone].filter(name => name !== app.child?.fullName) : [];
      const isDuplicateContact = siblings.length > 0;

      return {
        ...app,
        flags: {
          belowAge: isBelowAge,
          missingPickupPhoto: isMissingPickupPhoto,
          missingChildPhoto: isMissingChildPhoto,
          medicalNotes: hasMedicalNotes,
          extraSupport: needsExtraSupport,
          duplicateContact: isDuplicateContact
        },
        siblings
      };
    });
  }, [applications, siblingMap]);

  // Summary Metrics (5 core indicators: Awaiting review, Selected, Waiting list, Not selected, Needs attention)
  const metrics = useMemo(() => {
    let underReviewCount = 0;
    let selectedCount = 0;
    let waitingListCount = 0;
    let notSelectedCount = 0;
    let needsAttentionCount = 0;

    enrichedApplications.forEach(app => {
      if (app.status === 'under_review' || app.status === 'review_reopened') {
        underReviewCount++;
      } else if (app.status === 'selected' || app.status === 'pass_ready' || app.status === 'checked_in' || app.status === 'picked_up') {
        selectedCount++;
      } else if (app.status === 'waiting_list') {
        waitingListCount++;
      } else if (app.status === 'not_selected') {
        notSelectedCount++;
      }

      // Attention condition: authoritative needsAttention from server, age review, medical/support notes, or missing photos
      if (app.needsAttention || app.flags.belowAge || app.flags.medicalNotes || app.flags.extraSupport || app.flags.missingChildPhoto || app.flags.missingPickupPhoto) {
        needsAttentionCount++;
      }
    });

    return {
      underReview: underReviewCount,
      selected: selectedCount,
      waitingList: waitingListCount,
      notSelected: notSelectedCount,
      needsAttention: needsAttentionCount
    };
  }, [enrichedApplications]);

  // Authoritative DB metrics with fallback to enriched applications client metrics
  const displayStats = useMemo(() => {
    return {
      incomplete: dbStats?.incomplete ?? enrichedApplications.filter(a => a.status === 'incomplete' || a.status === 'draft' || a.isIncomplete).length,
      underReview: dbStats?.sentReview ?? metrics.underReview,
      selected: dbStats?.selected ?? metrics.selected,
      waitingList: dbStats?.waitingList ?? metrics.waitingList,
      notSelected: dbStats?.notSelected ?? metrics.notSelected,
      needsAttention: dbStats?.needsAttention ?? metrics.needsAttention
    };
  }, [dbStats, enrichedApplications, metrics]);

  // Capacity Limits and real progress values
  const capacityStats = useMemo(() => {
    const limits: Record<string, number> = {
      '2–3': 30,
      '4–6': 40,
      '7–9': 50,
      '10–12': 40,
      '13–14': 30
    };

    const counts: Record<string, number> = {
      '2–3': 0,
      '4–6': 0,
      '7–9': 0,
      '10–12': 0,
      '13–14': 0
    };

    enrichedApplications.forEach(app => {
      const isSelected = app.status === 'selected' || app.status === 'pass_ready' || app.status === 'checked_in' || app.status === 'picked_up';
      if (!isSelected) return;

      const age = app.child?.age;
      if (typeof age !== 'number' || isNaN(age)) return;
      if (age >= 2 && age <= 3) {
        counts['2–3']++;
      } else if (age >= 4 && age <= 6) {
        counts['4–6']++;
      } else if (age >= 7 && age <= 9) {
        counts['7–9']++;
      } else if (age >= 10 && age <= 12) {
        counts['10–12']++;
      } else if (age >= 13 && age <= 14) {
        counts['13–14']++;
      }
    });

    return [
      { id: '2–3', label: 'Ages 2–3', current: counts['2–3'], limit: limits['2–3'] },
      { id: '4–6', label: 'Ages 4–6', current: counts['4–6'], limit: limits['4–6'] },
      { id: '7–9', label: 'Ages 7–9', current: counts['7–9'], limit: limits['7–9'] },
      { id: '10–12', label: 'Ages 10–12', current: counts['10–12'], limit: limits['10–12'] },
      { id: '13–14', label: 'Ages 13–14', current: counts['13–14'], limit: limits['13–14'] }
    ];
  }, [enrichedApplications]);

  // Helper to reliably compute reminder count
  const getReminderCount = (app: any): number => {
    if (typeof app.reminderCount === 'number' && !isNaN(app.reminderCount)) {
      return app.reminderCount;
    }
    let c = 0;
    if (app.lastReminderSentAt) c++;
    if (app.lastWhatsAppSentAt) c++;
    return c;
  };

  // Quick count metrics for filter chips
  const quickCounts = useMemo(() => {
    let unremindedIncomplete = 0;
    let remindedIncomplete = 0;
    let totalIncomplete = 0;
    const ageCounts: Record<string, number> = {
      age_2: 0,
      group_2_3: 0,
      group_4_6: 0,
      group_7_9: 0,
      group_10_12: 0,
      group_13_14: 0
    };

    enrichedApplications.forEach(app => {
      const isIncomplete = app.isIncomplete || app.status === 'incomplete' || app.status === 'draft';
      if (isIncomplete) {
        totalIncomplete++;
        const remCount = getReminderCount(app);
        if (remCount === 0) unremindedIncomplete++;
        else remindedIncomplete++;
      }

      const age = app.child?.age;
      if (typeof age === 'number' && !isNaN(age)) {
        if (age === 2) ageCounts.age_2++;
        if (age >= 2 && age <= 3) ageCounts.group_2_3++;
        if (age >= 4 && age <= 6) ageCounts.group_4_6++;
        if (age >= 7 && age <= 9) ageCounts.group_7_9++;
        if (age >= 10 && age <= 12) ageCounts.group_10_12++;
        if (age >= 13 && age <= 14) ageCounts.group_13_14++;
      }
    });

    return { unremindedIncomplete, remindedIncomplete, totalIncomplete, ageCounts };
  }, [enrichedApplications]);

  // Filter application list based on search and selected filter values
  const filteredApplications = useMemo(() => {
    let list = [...enrichedApplications];

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'incomplete') {
        list = list.filter(app => app.status === 'incomplete' || app.status === 'draft' || app.isIncomplete);
      } else if (statusFilter === 'under_review') {
        list = list.filter(app => app.status === 'under_review' || app.status === 'review_reopened');
      } else if (statusFilter === 'selected') {
        list = list.filter(app => ['selected', 'pass_ready', 'checked_in', 'picked_up'].includes(app.status));
      } else {
        list = list.filter(app => app.status === statusFilter);
      }
    }

    // Age Grade & Individual Age Filter
    if (ageFilter !== 'all') {
      list = list.filter(app => {
        const age = app.child?.age;
        const hasAge = typeof age === 'number' && !isNaN(age);

        if (ageFilter.startsWith('age_')) {
          const targetAge = parseInt(ageFilter.replace('age_', ''), 10);
          return hasAge && age === targetAge;
        }
        if (ageFilter === 'group_2_3') {
          return hasAge && age >= 2 && age <= 3;
        }
        if (ageFilter === 'group_4_6') {
          return hasAge && age >= 4 && age <= 6;
        }
        if (ageFilter === 'group_7_9') {
          return hasAge && age >= 7 && age <= 9;
        }
        if (ageFilter === 'group_10_12') {
          return hasAge && age >= 10 && age <= 12;
        }
        if (ageFilter === 'group_13_14') {
          return hasAge && age >= 13 && age <= 14;
        }
        if (ageFilter === 'below_2') {
          return hasAge && age < 2;
        }
        if (ageFilter === 'above_14') {
          return hasAge && age > 14;
        }
        if (ageFilter === 'age_missing') {
          return !hasAge;
        }
        return true;
      });
    }

    // Reminder Status Filter (specifically for incomplete applications)
    if (reminderFilter !== 'all') {
      list = list.filter(app => {
        const isIncomplete = app.isIncomplete || app.status === 'incomplete' || app.status === 'draft';
        const count = getReminderCount(app);
        if (reminderFilter === 'not_reminded') {
          return isIncomplete && count === 0;
        }
        if (reminderFilter === 'reminded') {
          return isIncomplete && count > 0;
        }
        if (reminderFilter === 'reminded_multiple') {
          return isIncomplete && count >= 2;
        }
        return true;
      });
    }

    // Flag filters
    if (flagFilter !== 'all') {
      if (flagFilter === 'any') {
        list = list.filter(app => app.needsAttention || app.flags.belowAge || app.flags.missingChildPhoto || app.flags.missingPickupPhoto || app.flags.medicalNotes || app.flags.extraSupport);
      } else if (flagFilter === 'missing_pickup_person') {
        list = list.filter(app => app.needsAttentionReasons?.includes('MISSING_PICKUP_PERSON') || (!app.pickupPeople || app.pickupPeople.length === 0));
      } else if (flagFilter === 'missing_pickup_photo') {
        list = list.filter(app => app.needsAttentionReasons?.includes('MISSING_PICKUP_PHOTO') || app.needsAttentionReasons?.includes('INVALID_PICKUP_PHOTO') || app.flags.missingPickupPhoto);
      } else if (flagFilter === 'missing_parent_photo') {
        list = list.filter(app => app.needsAttentionReasons?.includes('MISSING_PARENT_PHOTO'));
      } else if (flagFilter === 'missing_child_photo') {
        list = list.filter(app => app.needsAttentionReasons?.includes('MISSING_CHILD_PHOTO') || app.flags.missingChildPhoto);
      } else if (flagFilter === 'missing_required') {
        list = list.filter(app => app.needsAttentionReasons?.includes('MISSING_REQUIRED_FIELD'));
      } else if (flagFilter === 'age_issue' || flagFilter === 'below_age') {
        list = list.filter(app => app.needsAttentionReasons?.includes('AGE_NOT_ELIGIBLE') || app.needsAttentionReasons?.includes('DOB_MISSING') || app.flags.belowAge);
      } else if (flagFilter === 'medical_or_support') {
        list = list.filter(app => app.flags.medicalNotes || app.flags.extraSupport);
      } else if (flagFilter === 'duplicate_contact') {
        list = list.filter(app => app.flags.duplicateContact);
      }
    }

    // Parent Role Filter
    if (workerFilter !== 'all') {
      const isWorker = workerFilter === 'worker';
      list = list.filter(app => Boolean(app.parent?.isWorker) === isWorker);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(app => 
        app.child?.fullName?.toLowerCase().includes(q) ||
        app.parent?.fullName?.toLowerCase().includes(q) ||
        app.parent?.email?.toLowerCase().includes(q) ||
        app.parent?.phone?.includes(q)
      );
    }

    // Sort order
    list.sort((a, b) => {
      if (sortBy === 'not_reminded') {
        const isIncompA = a.isIncomplete || a.status === 'incomplete' || a.status === 'draft';
        const isIncompB = b.isIncomplete || b.status === 'incomplete' || b.status === 'draft';
        if (isIncompA !== isIncompB) return isIncompA ? -1 : 1;
        const countA = getReminderCount(a);
        const countB = getReminderCount(b);
        if (countA !== countB) return countA - countB; // 0 reminders first
        return new Date(a.submittedAt || a.updatedAt || 0).getTime() - new Date(b.submittedAt || b.updatedAt || 0).getTime();
      }
      if (sortBy === 'most_reminded') {
        const countA = getReminderCount(a);
        const countB = getReminderCount(b);
        if (countA !== countB) return countB - countA;
        return new Date(b.submittedAt || b.updatedAt || 0).getTime() - new Date(a.submittedAt || a.updatedAt || 0).getTime();
      }
      if (sortBy === 'youngest') {
        const ageA = typeof a.child?.age === 'number' ? a.child.age : 99;
        const ageB = typeof b.child?.age === 'number' ? b.child.age : 99;
        return ageA - ageB;
      }
      if (sortBy === 'oldest_child') {
        const ageA = typeof a.child?.age === 'number' ? a.child.age : -1;
        const ageB = typeof b.child?.age === 'number' ? b.child.age : -1;
        return ageB - ageA;
      }
      if (sortBy === 'name_asc') {
        return (a.child?.fullName || '').localeCompare(b.child?.fullName || '');
      }
      const dateA = new Date(a.submittedAt || 0).getTime();
      const dateB = new Date(b.submittedAt || 0).getTime();
      return sortBy === 'oldest' ? dateA - dateB : dateB - dateA;
    });

    return list;
  }, [enrichedApplications, statusFilter, ageFilter, reminderFilter, flagFilter, workerFilter, searchQuery, sortBy]);

  // Selected incomplete applications eligible for bulk reminders
  const selectedIncompleteApps = useMemo(() => {
    return filteredApplications.filter(app => 
      selectedIds.includes(app.id) && 
      (app.isIncomplete || app.status === 'incomplete' || app.status === 'draft')
    );
  }, [selectedIds, filteredApplications]);

  // Selected applications eligible for bulk review actions
  const selectedReviewApps = useMemo(() => {
    return filteredApplications.filter(app => selectedIds.includes(app.id));
  }, [selectedIds, filteredApplications]);

  const selectedUnderReviewCount = useMemo(() => {
    return selectedReviewApps.filter(app => app.status === 'under_review').length;
  }, [selectedReviewApps]);

  // Queue of incomplete applications for sequential one-by-one reminders
  const incompleteReminderQueue = useMemo(() => {
    const source = (statusFilter === 'incomplete' || reminderFilter !== 'all') 
      ? filteredApplications 
      : enrichedApplications;
    return source.filter(app => 
      (app.isIncomplete || app.status === 'incomplete' || app.status === 'draft')
    );
  }, [statusFilter, reminderFilter, filteredApplications, enrichedApplications]);

  const currentQueueIndex = useMemo(() => {
    if (!reminderTarget) return -1;
    return incompleteReminderQueue.findIndex(app => app.id === reminderTarget.id);
  }, [reminderTarget, incompleteReminderQueue]);

  const nextIncompleteTarget = useMemo(() => {
    if (!reminderTarget || currentQueueIndex === -1) return null;
    const afterCurrent = incompleteReminderQueue.slice(currentQueueIndex + 1).find(app => getReminderCount(app) === 0);
    if (afterCurrent) return afterCurrent;
    return incompleteReminderQueue.find(app => app.id !== reminderTarget.id && getReminderCount(app) === 0) || null;
  }, [reminderTarget, currentQueueIndex, incompleteReminderQueue]);

  const hasNextReminder = !!nextIncompleteTarget;

  const handleNextReminder = () => {
    if (nextIncompleteTarget) {
      setReminderTarget({
        id: nextIncompleteTarget.id,
        childName: nextIncompleteTarget.child?.fullName || 'Child',
        parentName: nextIncompleteTarget.parent?.fullName || 'Parent'
      });
      setActiveSelectId(nextIncompleteTarget.id);
    } else {
      showSuccess('All Incomplete Registrations Reminded', 'You have sent reminders to all parents with incomplete registrations in this queue.');
      setIsReminderModalOpen(false);
      setReminderTarget(null);
    }
  };

  const handleReminderSuccess = (entryId: string) => {
    setApplications(prev => prev.map(app => {
      if (app.id === entryId) {
        const curCount = getReminderCount(app);
        return {
          ...app,
          reminderCount: curCount + 1,
          portalReminderCount: (app.portalReminderCount || 0) + 1,
          lastReminderSentAt: new Date().toISOString()
        };
      }
      return app;
    }));
    fetchApplications(true);
  };

  // Active child highlight selection (first child from the filtered list if not chosen)
  const [activeSelectId, setActiveSelectId] = useState<string | null>(null);

  const activeSelectedChild = useMemo(() => {
    const targetId = activeSelectId || (filteredApplications[0]?.id || null);
    return enrichedApplications.find(app => app.id === targetId) || null;
  }, [activeSelectId, filteredApplications, enrichedApplications]);

  // Bulk selection actions
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredApplications.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredApplications.map(app => app.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(item => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;

    setSubmittingBulk(true);
    try {
      const res = await api.admin.bulkReviewApplications({
        applicationIds: selectedIds,
        decision: bulkDecision,
        note: bulkNote || undefined
      });

      if (res.success) {
        showSuccess('Bulk Decision Recorded', `Successfully updated decision for ${selectedIds.length} registrations.`);
        setSelectedIds([]);
        setBulkActionOpen(false);
        setBulkNote('');
        await fetchApplications(true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Bulk Action Failed', parsed.message || 'Could not process bulk registrations.');
    } finally {
      setSubmittingBulk(false);
    }
  };

  const handleResetFilters = () => {
    setStatusFilter('all');
    setFlagFilter('all');
    setWorkerFilter('all');
    setAgeFilter('all');
    setReminderFilter('all');
    setSearchQuery('');
  };

  const isFiltersActive = statusFilter !== 'all' || flagFilter !== 'all' || workerFilter !== 'all' || ageFilter !== 'all' || reminderFilter !== 'all' || searchQuery.trim() !== '';

  const formatSubmittedDate = (dateVal?: string) => {
    if (!dateVal) return 'Date not recorded';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Date not recorded';
    const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `Submitted ${monthDay} · ${time}`;
  };

  const formatDobDisplay = (dobVal?: string | null) => {
    if (!dobVal || !String(dobVal).trim()) return 'Date not recorded';
    const clean = String(dobVal).trim();
    const d = new Date(clean.includes('T') ? clean : `${clean}T00:00:00`);
    if (isNaN(d.getTime())) return 'Date not recorded';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatShortDateTime = (dateVal?: string | null) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const dayMonth = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${dayMonth} ${time}`;
  };

  const formatAgeGroupClean = (group?: string) => {
    if (!group) return '';
    const trimmed = group.trim();
    if (trimmed.toLowerCase().startsWith('ages') || trimmed.toLowerCase() === 'teens' || trimmed.toLowerCase().startsWith('teens')) {
      return trimmed;
    }
    return `Ages ${trimmed}`;
  };

  const renderReminderStatusText = (app: any) => {
    const totalCount = getReminderCount(app);
    const portalSent = !!app.lastReminderSentAt;
    const whatsappSent = !!app.lastWhatsAppSentAt;
    const portalCount = typeof app.portalReminderCount === 'number' ? app.portalReminderCount : (portalSent ? 1 : 0);
    const waCount = typeof app.whatsappReminderCount === 'number' ? app.whatsappReminderCount : (whatsappSent ? 1 : 0);

    if (totalCount === 0) {
      return (
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-[#8E877D] bg-zinc-50 dark:bg-zinc-800/40 px-2 py-0.5 rounded-md border border-zinc-200/60 dark:border-zinc-700/50">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 inline-block" />
            Not reminded yet
          </span>
        </div>
      );
    }

    const channelsDesc = portalSent && whatsappSent
      ? `Portal (${portalCount}x · ${formatShortDateTime(app.lastReminderSentAt)}) · WA (${waCount}x · ${formatShortDateTime(app.lastWhatsAppSentAt)})`
      : portalSent
        ? `Portal sent (${portalCount}x) · ${formatShortDateTime(app.lastReminderSentAt)}`
        : `WhatsApp sent (${waCount}x) · ${formatShortDateTime(app.lastWhatsAppSentAt)}`;

    return (
      <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A67C1E] dark:text-[#D4AF37] bg-amber-50/80 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-900/40">
          <Clock className="w-3 h-3 text-[#C59B27]" />
          Reminded ({totalCount}x)
        </span>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
          {channelsDesc}
        </span>
      </div>
    );
  };

  const renderApplicationDateLine = (app: any) => {
    const rawDob = app.dob || app.dateOfBirth || app.date_of_birth || app.child?.dob || app.child?.dateOfBirth || app.child?.date_of_birth;
    const hasValidDob = rawDob && String(rawDob).trim() && !isNaN(new Date(String(rawDob).includes('T') ? String(rawDob).trim() : `${String(rawDob).trim()}T00:00:00`).getTime());
    const dobText = hasValidDob ? formatDobDisplay(rawDob) : 'DOB missing';

    const isDraft = app.isIncomplete || app.status === 'incomplete' || app.status === 'draft';
    const submissionText = isDraft
      ? 'Draft · Not submitted'
      : (app.submittedAt ? formatSubmittedDate(app.submittedAt) : 'Submitted');

    const shouldShowReminder = isDraft || app.blockingAttention || getReminderCount(app) > 0 || reminderFilter !== 'all';

    return (
      <div className="space-y-0.5 pt-0.5">
        <p className="text-xs text-zinc-500 dark:text-[#8E877D] flex items-center flex-wrap gap-x-2">
          <span className={isDraft ? "font-medium text-amber-700 dark:text-amber-400" : "text-zinc-600 dark:text-[#7A7570]"}>
            {submissionText}
          </span>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <span>
            DOB: <span className={!hasValidDob ? 'text-amber-600 dark:text-amber-400 italic' : 'font-medium text-zinc-700 dark:text-[#D1CBC0]'}>{dobText}</span>
          </span>
          {isDraft && app.updatedAt && (
            <span className="text-zinc-400 dark:text-[#6E6A63] text-[11px]">
              (Updated {formatShortDateTime(app.updatedAt)})
            </span>
          )}
        </p>
        {shouldShowReminder && renderReminderStatusText(app)}
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'incomplete':
      case 'draft':
        return {
          label: 'Incomplete',
          className: 'bg-amber-50 text-amber-800 border border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40'
        };
      case 'under_review':
      case 'review_reopened':
        return {
          label: 'Awaiting review',
          className: 'bg-stone-100 text-stone-700 border border-stone-200 dark:bg-[#262520] dark:text-[#B8B0A5] dark:border-[#3A3835]'
        };
      case 'selected':
      case 'pass_ready':
      case 'checked_in':
      case 'picked_up':
        return {
          label: 'Selected',
          className: 'bg-emerald-50 text-emerald-800 border border-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40'
        };
      case 'waiting_list':
        return {
          label: 'Waiting list',
          className: 'bg-amber-50 text-amber-800 border border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40'
        };
      case 'not_selected':
        return {
          label: 'Not selected',
          className: 'bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800/40 dark:text-[#7A7570] dark:border-zinc-700/50'
        };
      default:
        return {
          label: status.replace('_', ' '),
          className: 'bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800/40 dark:text-[#7A7570] dark:border-zinc-700/50'
        };
    }
  };

  // If detailed child review screen is open, render it
  if (selectedApplicationId) {
    return (
      <AdminReviewChildView 
        applicationId={selectedApplicationId}
        onBack={() => setSelectedApplicationId(null)}
        backLabel="Back to review"
        onSave={async () => {
          setSelectedApplicationId(null);
          await fetchApplications(true);
        }}
      />
    );
  }

  return (
    <div 
      className="space-y-6 animate-fade-in" 
      data-view-version="admin-review-board-v3-refined"
    >
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE8E1] dark:border-[#302E29] pb-5">
        <div>
          <h1 className="type-h1-app text-[#18181B] dark:text-[#F0EBE3]">
            Registration review
          </h1>
          <p className="text-xs text-zinc-500 dark:text-[#7A7570] mt-1 leading-relaxed">
            Review child registrations and make event decisions with care.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => fetchApplications(true)}
            disabled={refreshing}
            className="px-3.5 py-2 text-xs font-semibold bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] text-[#18181B] dark:text-[#F0EBE3] rounded-xl hover:bg-zinc-50 dark:hover:bg-[#2A2926] transition-colors cursor-pointer flex items-center gap-2"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C59B27]" /> : null}
            Refresh
          </button>
        </div>
      </div>

      {/* 2. COMPACT SUMMARY STRIP */}
      {loading ? (
        <div className="w-full">
          <KoinoniaInlineLoader
            variant="logo"
            size="md"
            label="Loading registrations for review..."
            fullCard
            centered
          />
        </div>
      ) : fetchError && applications.length === 0 ? (
        <div className="bg-rose-50/70 dark:bg-red-950/20 border border-rose-200 dark:border-red-900/40 rounded-2xl p-6 text-center space-y-3">
          <div className="text-sm font-semibold text-rose-800 dark:text-red-400">
            Failed to load registrations
          </div>
          <p className="text-xs text-rose-600 dark:text-red-300 max-w-md mx-auto">
            {fetchError}
          </p>
          <button
            type="button"
            onClick={() => fetchApplications(false)}
            className="px-4 py-2 text-xs font-semibold bg-[#C59B27] hover:bg-[#b58c22] text-white rounded-xl transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div 
            className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-4 sm:p-5 shadow-xs"
            data-component-version="admin-review-summary-strip"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-0 sm:divide-x divide-[#EAE8E1] dark:sm:divide-[#302E29]">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === 'incomplete' ? 'all' : 'incomplete');
                  setReminderFilter('all');
                }}
                className={`text-left p-2.5 sm:px-4 first:sm:pl-0 rounded-xl transition-all cursor-pointer ${
                  statusFilter === 'incomplete'
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 ring-1 ring-amber-500/40 shadow-xs'
                    : 'hover:bg-zinc-50 dark:hover:bg-[#262520]'
                }`}
              >
                <span className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Incomplete
                </span>
                <span className="text-2xl font-semibold text-amber-700 dark:text-amber-400 block mt-1">
                  {displayStats.incomplete}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === 'under_review' ? 'all' : 'under_review');
                  setFlagFilter('all');
                }}
                className={`text-left p-2.5 sm:px-4 rounded-xl transition-all cursor-pointer ${
                  statusFilter === 'under_review'
                    ? 'bg-blue-50/70 dark:bg-blue-950/30 ring-1 ring-blue-500/40 shadow-xs'
                    : 'hover:bg-zinc-50 dark:hover:bg-[#262520]'
                }`}
              >
                <span className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  Awaiting review
                </span>
                <span className={`text-2xl font-semibold block mt-1 ${statusFilter === 'under_review' ? 'text-blue-600 dark:text-blue-400' : 'text-[#18181B] dark:text-[#F0EBE3]'}`}>
                  {displayStats.underReview}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === 'selected' ? 'all' : 'selected');
                  setFlagFilter('all');
                }}
                className={`text-left p-2.5 sm:px-4 rounded-xl transition-all cursor-pointer ${
                  statusFilter === 'selected'
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30 ring-1 ring-emerald-500/40 shadow-xs'
                    : 'hover:bg-zinc-50 dark:hover:bg-[#262520]'
                }`}
              >
                <span className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Selected
                </span>
                <span className={`text-2xl font-semibold block mt-1 ${statusFilter === 'selected' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#18181B] dark:text-[#F0EBE3]'}`}>
                  {displayStats.selected}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === 'waiting_list' ? 'all' : 'waiting_list');
                  setFlagFilter('all');
                }}
                className={`text-left p-2.5 sm:px-4 rounded-xl transition-all cursor-pointer ${
                  statusFilter === 'waiting_list'
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 ring-1 ring-amber-500/40 shadow-xs'
                    : 'hover:bg-zinc-50 dark:hover:bg-[#262520]'
                }`}
              >
                <span className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Waiting list
                </span>
                <span className={`text-2xl font-semibold block mt-1 ${statusFilter === 'waiting_list' ? 'text-amber-600 dark:text-amber-400' : 'text-[#18181B] dark:text-[#F0EBE3]'}`}>
                  {displayStats.waitingList}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === 'not_selected' ? 'all' : 'not_selected');
                  setFlagFilter('all');
                }}
                className={`text-left p-2.5 sm:px-4 rounded-xl transition-all cursor-pointer ${
                  statusFilter === 'not_selected'
                    ? 'bg-zinc-100 dark:bg-[#2A2926] ring-1 ring-zinc-400/40 shadow-xs'
                    : 'hover:bg-zinc-50 dark:hover:bg-[#262520]'
                }`}
              >
                <span className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Not selected
                </span>
                <span className={`text-2xl font-semibold block mt-1 ${statusFilter === 'not_selected' ? 'text-zinc-600 dark:text-zinc-300' : 'text-[#18181B] dark:text-[#F0EBE3]'}`}>
                  {displayStats.notSelected}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFlagFilter(flagFilter === 'any' ? 'all' : 'any');
                  setStatusFilter('all');
                }}
                className={`text-left p-2.5 sm:px-4 last:sm:pr-0 rounded-xl transition-all cursor-pointer ${
                  flagFilter === 'any'
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 ring-1 ring-amber-500/40 shadow-xs'
                    : 'hover:bg-zinc-50 dark:hover:bg-[#262520]'
                }`}
              >
                <span className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Needs attention
                </span>
                <span className={`text-2xl font-semibold block mt-1 ${displayStats.needsAttention > 0 ? 'text-amber-800 dark:text-amber-400' : 'text-zinc-500 dark:text-[#7A7570]'}`}>
                  {displayStats.needsAttention}
                </span>
              </button>
            </div>
          </div>

          {/* MAIN 3-COLUMN WORKSPACE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* 3. FILTER LEFT PANEL (Desktop: 3 cols, Hidden on Mobile) */}
            <aside 
              className="lg:col-span-3 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-5 space-y-5 hidden lg:block shadow-xs"
              data-component-version="admin-review-filters-panel"
            >
              <div className="flex items-center justify-between border-b border-[#EAE8E1] dark:border-[#302E29] pb-3">
                <span className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#C59B27]" />
                  Filters
                </span>
                {isFiltersActive && (
                  <button 
                    onClick={handleResetFilters}
                    className="text-xs text-zinc-400 dark:text-[#7A7570] hover:text-[#C59B27] dark:hover:text-[#C59B27] font-medium hover:underline cursor-pointer"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Status
                </label>
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] p-2.5 text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                >
                  <option value="all">All statuses</option>
                  <option value="incomplete">Incomplete draft</option>
                  <option value="under_review">Awaiting review</option>
                  <option value="selected">Selected</option>
                  <option value="waiting_list">Waiting list</option>
                  <option value="not_selected">Not selected</option>
                </select>
              </div>

              {/* Attention Conditions Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Needs attention
                </label>
                <select 
                  value={flagFilter}
                  onChange={(e) => setFlagFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] p-2.5 text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                >
                  <option value="all">All registrations</option>
                  <option value="any">Any needs attention</option>
                  <option value="missing_pickup_person">Missing pickup person</option>
                  <option value="missing_pickup_photo">Missing pickup photo</option>
                  <option value="missing_parent_photo">Missing parent photo</option>
                  <option value="missing_child_photo">Missing child photo</option>
                  <option value="missing_required">Missing required fields</option>
                  <option value="age_issue">Age not eligible / DOB missing</option>
                  <option value="medical_or_support">Care & medical notes</option>
                  <option value="duplicate_contact">Sibling registrations</option>
                </select>
              </div>

              {/* Age / Age Grade Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Age / Age grade
                </label>
                <select 
                  value={ageFilter}
                  onChange={(e) => setAgeFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] p-2.5 text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                >
                  <option value="all">All ages & grades</option>
                  <optgroup label="Single Ages (e.g. Batch approval)">
                    <option value="age_2">Age 2 only ({quickCounts.ageCounts.age_2})</option>
                    <option value="age_3">Age 3 only</option>
                    <option value="age_4">Age 4 only</option>
                    <option value="age_5">Age 5 only</option>
                    <option value="age_6">Age 6 only</option>
                    <option value="age_7">Age 7 only</option>
                    <option value="age_8">Age 8 only</option>
                    <option value="age_9">Age 9 only</option>
                    <option value="age_10">Age 10 only</option>
                    <option value="age_11">Age 11 only</option>
                    <option value="age_12">Age 12 only</option>
                    <option value="age_13">Age 13 only</option>
                    <option value="age_14">Age 14 only</option>
                  </optgroup>
                  <optgroup label="Age Cohorts">
                    <option value="group_2_3">Ages 2–3 ({quickCounts.ageCounts.group_2_3})</option>
                    <option value="group_4_6">Ages 4–6 ({quickCounts.ageCounts.group_4_6})</option>
                    <option value="group_7_9">Ages 7–9 ({quickCounts.ageCounts.group_7_9})</option>
                    <option value="group_10_12">Ages 10–12 ({quickCounts.ageCounts.group_10_12})</option>
                    <option value="group_13_14">Ages 13–14 ({quickCounts.ageCounts.group_13_14})</option>
                  </optgroup>
                  <optgroup label="Eligibility Checks">
                    <option value="below_2">Under 2 years (Review needed)</option>
                    <option value="above_14">Over 14 years</option>
                    <option value="age_missing">Age missing / unstated</option>
                  </optgroup>
                </select>
              </div>

              {/* Reminder Status Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Reminder status
                </label>
                <select 
                  value={reminderFilter}
                  onChange={(e) => setReminderFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] p-2.5 text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                >
                  <option value="all">All registrations</option>
                  <option value="not_reminded">Incomplete: Not reminded yet ({quickCounts.unremindedIncomplete})</option>
                  <option value="reminded">Incomplete: Reminded 1+ times ({quickCounts.remindedIncomplete})</option>
                  <option value="reminded_multiple">Incomplete: Reminded multiple times (2+)</option>
                </select>
              </div>

              {/* Parent Role Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Parent role
                </label>
                <select 
                  value={workerFilter}
                  onChange={(e) => setWorkerFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] p-2.5 text-zinc-800 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                >
                  <option value="all">All parents</option>
                  <option value="worker">Ministry team & workers</option>
                  <option value="non_worker">Other families</option>
                </select>
              </div>
            </aside>

            {/* MOBILE SEARCH & FILTER TRIGGER */}
            <div className="lg:hidden flex items-center gap-2 w-full">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400 dark:text-[#7A7570]">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by child, parent or email"
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] dark:text-[#F0EBE3] dark:placeholder-[#7A7570] focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                />
              </div>

              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="px-3.5 py-2 bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-xs font-semibold text-zinc-700 dark:text-[#F0EBE3] flex items-center gap-1.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-[#2A2926]"
              >
                <Filter className="w-3.5 h-3.5 text-zinc-500 dark:text-[#7A7570]" />
                Filters
              </button>
            </div>

            {/* 4. CENTER COLUMN: REGISTRATION RESULTS LIST (6 cols) */}
            <div 
              className="lg:col-span-6 space-y-4"
              data-component-version="admin-review-results-list"
            >
              {/* SEARCH & SORT TOOLBAR */}
              <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-4 flex flex-col gap-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Search Bar - Desktop */}
                  <div className="relative flex-1 max-w-sm hidden lg:block">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400 dark:text-[#7A7570]">
                      <Search className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by child, parent or email"
                      className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] dark:text-[#F0EBE3] dark:placeholder-[#7A7570] focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                    />
                  </div>

                  {/* Actions & Sort */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 w-full lg:w-auto flex-wrap">
                    <span className="text-xs text-zinc-500 dark:text-[#7A7570] font-medium hidden md:inline">
                      {filteredApplications.length} {filteredApplications.length === 1 ? 'result' : 'results'}
                    </span>

                    {/* Select All Filtered Toggle */}
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      disabled={filteredApplications.length === 0}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl border font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        filteredApplications.length > 0 && selectedIds.length === filteredApplications.length
                          ? 'bg-[#FAF8F3] dark:bg-[#262520] text-[#C59B27] border-[#C59B27] font-semibold'
                          : 'bg-white dark:bg-[#262520] text-zinc-700 dark:text-[#F0EBE3] border-[#EAE8E1] dark:border-[#3A3835] hover:bg-zinc-50 dark:hover:bg-[#2A2926]'
                      }`}
                      title={filteredApplications.length > 0 && selectedIds.length === filteredApplications.length ? 'Deselect all' : 'Select all filtered results'}
                    >
                      {filteredApplications.length > 0 && selectedIds.length === filteredApplications.length ? (
                        <CheckSquare className="w-3.5 h-3.5 text-[#C59B27]" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-zinc-400 dark:text-[#7A7570]" />
                      )}
                      <span>
                        {filteredApplications.length > 0 && selectedIds.length === filteredApplications.length 
                          ? `Deselect all (${selectedIds.length})` 
                          : `Select all (${filteredApplications.length})`}
                      </span>
                    </button>

                    {/* Expanded Sort Dropdown */}
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-[#FAF9F6] dark:bg-[#262520] px-3 py-1.5 font-medium text-zinc-700 dark:text-[#F0EBE3] focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
                    >
                      <option value="oldest">Sort: Oldest first</option>
                      <option value="newest">Sort: Newest first</option>
                      <option value="not_reminded">Sort: Not reminded first</option>
                      <option value="most_reminded">Sort: Most reminded first</option>
                      <option value="youngest">Sort: Youngest age first</option>
                      <option value="oldest_child">Sort: Oldest age first</option>
                      <option value="name_asc">Sort: Child name (A–Z)</option>
                    </select>
                  </div>
                </div>

                {/* Quick Filter Chips Strip for 1-Click Cohort & Reminder Filtering */}
                <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-[#EAE8E1]/70 dark:border-[#302E29] text-xs scrollbar-none">
                  <span className="text-[11px] font-medium text-zinc-400 dark:text-[#7A7570] shrink-0 mr-1">
                    Quick filter:
                  </span>
                  
                  {/* All */}
                  <button
                    type="button"
                    onClick={() => { setAgeFilter('all'); setReminderFilter('all'); setStatusFilter('all'); }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 cursor-pointer text-xs ${
                      ageFilter === 'all' && reminderFilter === 'all' && statusFilter === 'all'
                        ? 'bg-[#FAF8F3] dark:bg-[#262520] text-[#C59B27] border border-[#C59B27]/40 font-semibold'
                        : 'bg-zinc-50 dark:bg-[#262520] text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 border border-transparent'
                    }`}
                  >
                    All
                  </button>

                  {/* Awaiting Review */}
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter(statusFilter === 'under_review' ? 'all' : 'under_review');
                      setReminderFilter('all');
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 cursor-pointer text-xs flex items-center gap-1.5 ${
                      statusFilter === 'under_review'
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-300/60 font-semibold shadow-2xs'
                        : 'bg-zinc-50 dark:bg-[#262520] text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 border border-transparent'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>Awaiting review</span>
                    <span className="text-[10px] opacity-80 font-bold">({displayStats.underReview})</span>
                  </button>

                  {/* Age 2 */}
                  <button
                    type="button"
                    onClick={() => setAgeFilter(ageFilter === 'age_2' ? 'all' : 'age_2')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 cursor-pointer text-xs ${
                      ageFilter === 'age_2'
                        ? 'bg-[#FAF8F3] dark:bg-[#262520] text-[#C59B27] border border-[#C59B27]/50 font-semibold shadow-2xs'
                        : 'bg-zinc-50 dark:bg-[#262520] text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 border border-transparent'
                    }`}
                  >
                    Age 2 {quickCounts.ageCounts.age_2 > 0 ? `(${quickCounts.ageCounts.age_2})` : ''}
                  </button>

                  {/* Ages 2–3 */}
                  <button
                    type="button"
                    onClick={() => setAgeFilter(ageFilter === 'group_2_3' ? 'all' : 'group_2_3')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 cursor-pointer text-xs ${
                      ageFilter === 'group_2_3'
                        ? 'bg-[#FAF8F3] dark:bg-[#262520] text-[#C59B27] border border-[#C59B27]/50 font-semibold shadow-2xs'
                        : 'bg-zinc-50 dark:bg-[#262520] text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 border border-transparent'
                    }`}
                  >
                    Ages 2–3 {quickCounts.ageCounts.group_2_3 > 0 ? `(${quickCounts.ageCounts.group_2_3})` : ''}
                  </button>

                  {/* Ages 4–6 */}
                  <button
                    type="button"
                    onClick={() => setAgeFilter(ageFilter === 'group_4_6' ? 'all' : 'group_4_6')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 cursor-pointer text-xs ${
                      ageFilter === 'group_4_6'
                        ? 'bg-[#FAF8F3] dark:bg-[#262520] text-[#C59B27] border border-[#C59B27]/50 font-semibold shadow-2xs'
                        : 'bg-zinc-50 dark:bg-[#262520] text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 border border-transparent'
                    }`}
                  >
                    Ages 4–6 {quickCounts.ageCounts.group_4_6 > 0 ? `(${quickCounts.ageCounts.group_4_6})` : ''}
                  </button>

                  {/* Ages 7–9 */}
                  <button
                    type="button"
                    onClick={() => setAgeFilter(ageFilter === 'group_7_9' ? 'all' : 'group_7_9')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 cursor-pointer text-xs ${
                      ageFilter === 'group_7_9'
                        ? 'bg-[#FAF8F3] dark:bg-[#262520] text-[#C59B27] border border-[#C59B27]/50 font-semibold shadow-2xs'
                        : 'bg-zinc-50 dark:bg-[#262520] text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 border border-transparent'
                    }`}
                  >
                    Ages 7–9 {quickCounts.ageCounts.group_7_9 > 0 ? `(${quickCounts.ageCounts.group_7_9})` : ''}
                  </button>

                  {/* Ages 10–12 */}
                  <button
                    type="button"
                    onClick={() => setAgeFilter(ageFilter === 'group_10_12' ? 'all' : 'group_10_12')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 cursor-pointer text-xs ${
                      ageFilter === 'group_10_12'
                        ? 'bg-[#FAF8F3] dark:bg-[#262520] text-[#C59B27] border border-[#C59B27]/50 font-semibold shadow-2xs'
                        : 'bg-zinc-50 dark:bg-[#262520] text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 border border-transparent'
                    }`}
                  >
                    Ages 10–12 {quickCounts.ageCounts.group_10_12 > 0 ? `(${quickCounts.ageCounts.group_10_12})` : ''}
                  </button>

                  {/* Ages 13–14 */}
                  <button
                    type="button"
                    onClick={() => setAgeFilter(ageFilter === 'group_13_14' ? 'all' : 'group_13_14')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 cursor-pointer text-xs ${
                      ageFilter === 'group_13_14'
                        ? 'bg-[#FAF8F3] dark:bg-[#262520] text-[#C59B27] border border-[#C59B27]/50 font-semibold shadow-2xs'
                        : 'bg-zinc-50 dark:bg-[#262520] text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 border border-transparent'
                    }`}
                  >
                    Ages 13–14 {quickCounts.ageCounts.group_13_14 > 0 ? `(${quickCounts.ageCounts.group_13_14})` : ''}
                  </button>

                  <div className="h-4 w-px bg-zinc-200 dark:bg-[#3A3835] mx-1 shrink-0" />

                  {/* Incomplete - Not reminded */}
                  <button
                    type="button"
                    onClick={() => setReminderFilter(reminderFilter === 'not_reminded' ? 'all' : 'not_reminded')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 cursor-pointer text-xs flex items-center gap-1.5 ${
                      reminderFilter === 'not_reminded'
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300/60 font-semibold shadow-2xs'
                        : 'bg-zinc-50 dark:bg-[#262520] text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 border border-transparent'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                    <span>Incomplete: Not reminded</span>
                    <span className="text-[10px] opacity-80 font-bold">({quickCounts.unremindedIncomplete})</span>
                  </button>

                  {/* Incomplete - Reminded */}
                  <button
                    type="button"
                    onClick={() => setReminderFilter(reminderFilter === 'reminded' ? 'all' : 'reminded')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 cursor-pointer text-xs flex items-center gap-1.5 ${
                      reminderFilter === 'reminded'
                        ? 'bg-[#FAF8F3] dark:bg-[#262520] text-[#C59B27] border border-[#C59B27]/50 font-semibold shadow-2xs'
                        : 'bg-zinc-50 dark:bg-[#262520] text-zinc-600 dark:text-[#B8B0A5] hover:bg-zinc-100 border border-transparent'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-[#C59B27]" />
                    <span>Incomplete: Reminded</span>
                    <span className="text-[10px] opacity-80 font-bold">({quickCounts.remindedIncomplete})</span>
                  </button>
                </div>
              </div>

              {/* Bulk Action Controls Banner */}
              {selectedIds.length > 0 && (
                <div className="bg-[#FAF8F3] dark:bg-[#21211E] border border-[#E5D5AE]/60 dark:border-[#3A3835] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fade-in">
                  <div className="flex items-center space-x-2.5">
                    <CheckSquare className="w-4 h-4 text-[#C59B27]" />
                    <div>
                      <span className="text-xs font-semibold text-zinc-800 dark:text-[#F0EBE3] block">
                        {selectedIds.length} registration{selectedIds.length > 1 ? 's' : ''} selected
                      </span>
                      {selectedUnderReviewCount > 0 && (
                        <span className="text-[11px] text-zinc-500 dark:text-[#7A7570] block">
                          {selectedUnderReviewCount} awaiting review
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Bulk Reminder Button for Incomplete Applications */}
                    {selectedIncompleteApps.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setBulkReminderModalOpen(true)}
                        className="px-3.5 py-1.5 bg-[#C59B27] hover:bg-[#b08921] text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors flex items-center gap-1.5 shadow-xs"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Send reminders ({selectedIncompleteApps.length})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setBulkDecision('selected');
                        setBulkActionOpen(true);
                      }}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Select for event ({selectedIds.length})</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setBulkDecision('waiting_list');
                        setBulkActionOpen(true);
                      }}
                      className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-950/50 text-xs font-medium rounded-xl cursor-pointer transition-colors"
                    >
                      Add to waiting list
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setBulkDecision('not_selected');
                        setBulkActionOpen(true);
                      }}
                      className="px-3 py-1.5 bg-zinc-100 dark:bg-[#262520] text-zinc-700 dark:text-[#B8B0A5] border border-zinc-200 dark:border-[#3A3835] hover:bg-zinc-200 dark:hover:bg-[#2A2926] text-xs font-medium rounded-xl cursor-pointer transition-colors"
                    >
                      Mark not selected
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="text-xs text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#B8B0A5] font-medium cursor-pointer px-2 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* REGISTRATIONS RESULTS LIST */}
              {filteredApplications.length === 0 ? (
                <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-12 text-center space-y-3 shadow-xs">
                  <AlertCircle className="w-8 h-8 text-zinc-400 dark:text-[#7A7570] mx-auto" />
                  <h3 className="text-base font-semibold text-[#18181B] dark:text-[#F0EBE3]">
                    {isFiltersActive ? 'No registrations match these filters.' : 'No registrations found.'}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-[#7A7570] max-w-sm mx-auto leading-relaxed">
                    {isFiltersActive 
                      ? 'Try clearing your search terms or filter selections to view registrations.'
                      : 'No child registrations are currently waiting for review.'}
                  </p>
                  {isFiltersActive && (
                    <button 
                      onClick={handleResetFilters}
                      className="text-xs font-semibold text-[#C59B27] hover:underline cursor-pointer pt-1"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredApplications.map((app) => {
                    const isSelected = selectedIds.includes(app.id);
                    const isActive = activeSelectedChild?.id === app.id;
                    const statusInfo = getStatusBadge(app.status);
                    
                    const ageDisplay = (app.child?.age !== undefined && app.child?.age !== null)
                      ? (app.child.age === 0 ? 'Under 1 year' : `${app.child.age} years`)
                      : 'Age not stated';
                    
                    const ageGroupClean = formatAgeGroupClean(app.child?.ageGroup);

                    return (
                      <div 
                        key={app.id}
                        onClick={() => setActiveSelectId(app.id)}
                        className={`bg-white dark:bg-[#1D1D1A] border rounded-2xl p-4 sm:p-5 transition-all cursor-pointer ${
                          isActive 
                            ? 'border-[#C59B27] ring-1 ring-[#C59B27]/30 shadow-xs' 
                            : 'border-[#EAE8E1] dark:border-[#302E29] hover:border-[#C59B27]/40 dark:hover:border-[#C59B27]/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          
                          {/* Child and Parent Core Details */}
                          <div className="flex items-start space-x-3.5 min-w-0">
                            
                            {/* Checkbox */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelectOne(app.id);
                              }}
                              className="text-zinc-400 hover:text-[#C59B27] shrink-0 mt-1 focus:outline-none cursor-pointer"
                              title={isSelected ? 'Deselect' : 'Select'}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#C59B27]" />
                              ) : (
                                <Square className="w-4 h-4 text-zinc-300 dark:text-[#5A5550] hover:text-zinc-400 dark:hover:text-[#7A7570]" />
                              )}
                            </button>

                            {/* Avatar */}
                            <div className="w-12 h-14 bg-zinc-50 dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl shrink-0 overflow-hidden flex items-center justify-center relative">
                              {app.child?.photoUrl ? (
                                <img 
                                  src={app.child.photoUrl} 
                                  alt={app.child.fullName} 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-zinc-400 dark:text-[#7A7570] font-semibold text-sm">
                                  {app.child?.fullName?.charAt(0) || 'C'}
                                </span>
                              )}
                            </div>

                            {/* Text Metadata */}
                            <div className="space-y-1 min-w-0">
                              <h4 className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3] truncate">
                                {app.child?.fullName || 'Unnamed child'}
                              </h4>
                              
                              <p className="text-xs text-zinc-500 dark:text-[#7A7570] font-medium">
                                {ageDisplay}{ageGroupClean ? ` · ${ageGroupClean}` : ''}
                              </p>

                              <p className="text-xs text-zinc-600 dark:text-[#B8B0A5] pt-0.5 truncate">
                                Parent: <span className="font-medium text-zinc-800 dark:text-[#F0EBE3]">{app.parent?.fullName || 'Not recorded'}</span>
                                {app.parent?.isWorker ? (
                                  <span className="text-[#C59B27] font-medium ml-1">
                                    (Team member)
                                  </span>
                                ) : null}
                              </p>

                              {renderApplicationDateLine(app)}

                              {/* Attention Notices */}
                              <div className="flex flex-wrap gap-1.5 pt-2">
                                {(app.needsAttention || app.blockingAttention) && (
                                  <span className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Needs attention
                                  </span>
                                )}
                                {app.flags.belowAge && (
                                  <span className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Age needs review
                                  </span>
                                )}
                                {app.flags.missingChildPhoto && (
                                  <span className="bg-stone-100 dark:bg-[#262520] text-stone-700 dark:text-[#B8B0A5] border border-stone-200 dark:border-[#3A3835] text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Photo needed
                                  </span>
                                )}
                                {app.flags.missingPickupPhoto && (
                                  <span className="bg-stone-100 dark:bg-[#262520] text-stone-700 dark:text-[#B8B0A5] border border-stone-200 dark:border-[#3A3835] text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Pickup photo needed
                                  </span>
                                )}
                                {app.flags.medicalNotes && (
                                  <span className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Care note
                                  </span>
                                )}
                                {app.flags.extraSupport && (
                                  <span className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Extra support
                                  </span>
                                )}
                                {app.siblings.length > 0 && (
                                  <span className="bg-stone-100 dark:bg-[#262520] text-stone-700 dark:text-[#B8B0A5] border border-stone-200 dark:border-[#3A3835] text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Sibling registration
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                            {/* Status Badge & Actions */}
                            <div className="flex flex-col items-end justify-between gap-3 shrink-0 self-stretch">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.label === 'Incomplete' ? 'bg-amber-50 text-amber-800 border border-amber-200/80' : statusInfo.className}`}>
                                {statusInfo.label}
                              </span>

                              <div className="flex items-center gap-1.5 mt-auto">
                                {((app.isIncomplete || app.status === 'incomplete' || app.status === 'draft') || app.blockingAttention) && (() => {
                                  const appRemCount = getReminderCount(app);
                                  const isContactMode = app.blockingAttention && !(app.isIncomplete || app.status === 'incomplete' || app.status === 'draft');
                                  const buttonLabel = isContactMode
                                    ? (appRemCount > 0 ? `Contact (${appRemCount}x)` : 'Contact')
                                    : (appRemCount > 0 ? `Remind (${appRemCount}x)` : 'Remind');

                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setReminderTarget({
                                          id: app.id,
                                          childName: app.child?.fullName || 'Child',
                                          parentName: app.parent?.fullName || 'Parent'
                                        });
                                        setIsReminderModalOpen(true);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100/80 text-xs font-semibold text-amber-800 dark:text-amber-300 transition-colors cursor-pointer"
                                      title={appRemCount > 0 ? `Reminder already sent ${appRemCount} time(s). Click to send another.` : (isContactMode ? "Contact parent about missing required information" : "Send completion reminder")}
                                    >
                                      <Clock className="w-3.5 h-3.5" />
                                      <span>{buttonLabel}</span>
                                    </button>
                                  );
                                })()}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedApplicationId(app.id);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] hover:bg-zinc-50 dark:hover:bg-[#2A2926] text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] transition-colors cursor-pointer"
                                >
                                  <span>{app.status === 'under_review' ? 'Review' : (app.isIncomplete || app.status === 'incomplete' || app.status === 'draft') ? 'View draft' : 'View review'}</span>
                                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-[#7A7570]" />
                                </button>
                              </div>
                            </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 5. RIGHT SIDEBAR DETAILS PANEL (3 cols) */}
            <div className="lg:col-span-3 space-y-5">
              
              {/* REGISTRATION DETAILS CARD */}
              <div 
                className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-5 space-y-4 shadow-xs"
                data-component-version="admin-review-details-preview"
              >
                <span className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] block border-b border-[#EAE8E1] dark:border-[#302E29] pb-2.5">
                  Registration details
                </span>

                {activeSelectedChild ? (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-start space-x-3.5">
                      {/* Photo or Initials */}
                      <div className="w-16 h-20 bg-zinc-50 dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl overflow-hidden shrink-0 flex items-center justify-center relative">
                        {activeSelectedChild.child?.photoUrl ? (
                          <img 
                            src={activeSelectedChild.child.photoUrl} 
                            alt={activeSelectedChild.child.fullName} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-zinc-400 dark:text-[#7A7570] font-semibold text-lg">
                            {activeSelectedChild.child?.fullName?.charAt(0) || 'C'}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <h3 className="text-sm font-semibold text-[#18181B] dark:text-[#F0EBE3] truncate leading-snug">
                          {activeSelectedChild.child?.fullName}
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-[#7A7570] font-medium">
                          {activeSelectedChild.child?.age === 0 ? 'Under 1 year' : `${activeSelectedChild.child?.age} years`} · {activeSelectedChild.child?.gender || 'Gender not stated'}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-[#7A7570]">
                          {activeSelectedChild.child?.ageGroup ? (activeSelectedChild.child.ageGroup.toLowerCase().startsWith('ages') ? activeSelectedChild.child.ageGroup : `Ages ${activeSelectedChild.child.ageGroup}`) : 'Section not stated'}
                        </p>
                      </div>
                    </div>

                    {/* Definition List with subtle dividers */}
                    <div className="divide-y divide-[#EAE8E1]/60 dark:divide-[#302E29] text-xs space-y-2 pt-1">
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-zinc-500 dark:text-[#7A7570]">Class</span>
                        <span className="font-medium text-[#18181B] dark:text-[#F0EBE3] truncate max-w-[150px]">
                          {activeSelectedChild.schoolClass || 'Not stated'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-zinc-500 dark:text-[#7A7570]">Parent / guardian</span>
                        <span className="font-medium text-[#18181B] dark:text-[#F0EBE3] truncate max-w-[150px]">
                          {activeSelectedChild.parent?.fullName || 'Not stated'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-zinc-500 dark:text-[#7A7570]">Phone</span>
                        <span className="font-medium text-[#18181B] dark:text-[#F0EBE3] flex items-center gap-1">
                          {activeSelectedChild.parent?.phone || 'Not stated'}
                        </span>
                      </div>
                      {activeSelectedChild.siblings.length > 0 && (
                        <div className="flex justify-between items-center py-1.5">
                          <span className="text-zinc-500 dark:text-[#7A7570]">Siblings</span>
                          <span className="font-medium text-[#18181B] dark:text-[#F0EBE3] truncate max-w-[150px]">
                            {activeSelectedChild.siblings.join(', ')}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-zinc-500 dark:text-[#7A7570]">Reminders sent</span>
                        <span className="font-medium text-[#18181B] dark:text-[#F0EBE3] flex items-center gap-1">
                          {getReminderCount(activeSelectedChild) > 0 ? (
                            <span className="text-[#C59B27] font-semibold flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {getReminderCount(activeSelectedChild)}x sent
                            </span>
                          ) : (
                            <span className="text-zinc-400 dark:text-zinc-500">None sent yet</span>
                          )}
                        </span>
                      </div>
                      {getReminderCount(activeSelectedChild) > 0 && (
                        <div className="py-1 text-[11px] text-zinc-500 dark:text-[#7A7570] space-y-0.5 bg-zinc-50/70 dark:bg-[#262520] p-2 rounded-lg">
                          {activeSelectedChild.lastReminderSentAt && (
                            <p>• Portal reminder: {formatShortDateTime(activeSelectedChild.lastReminderSentAt)}</p>
                          )}
                          {activeSelectedChild.lastWhatsAppSentAt && (
                            <p>• WhatsApp reminder: {formatShortDateTime(activeSelectedChild.lastWhatsAppSentAt)}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {activeSelectedChild.noteToTeam && (
                      <div className="bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl p-3 text-xs text-zinc-600 dark:text-[#B8B0A5] leading-relaxed space-y-1">
                        <span className="font-semibold text-zinc-800 dark:text-[#F0EBE3] block">Parent note</span>
                        <p className="italic">"{activeSelectedChild.noteToTeam}"</p>
                      </div>
                    )}

                    {activeSelectedChild.blockingAttention && (
                      <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Decision Blocked</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                          {activeSelectedChild.needsAttentionSummary || 'Required information is missing. Selection and waiting list decisions are blocked until details are provided.'}
                        </p>
                      </div>
                    )}

                    {(activeSelectedChild.isIncomplete || activeSelectedChild.status === 'incomplete' || activeSelectedChild.status === 'draft') ? (
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          fullWidth
                          onClick={() => {
                            setReminderTarget({
                              id: activeSelectedChild.id,
                              childName: activeSelectedChild.child?.fullName || 'Child',
                              parentName: activeSelectedChild.parent?.fullName || 'Parent'
                            });
                            setIsReminderModalOpen(true);
                          }}
                          className="py-2.5 text-xs font-semibold cursor-pointer"
                        >
                          <Clock className="w-3.5 h-3.5 mr-1.5" />
                          <span>Contact parent / Send reminder</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          fullWidth
                          onClick={() => setSelectedApplicationId(activeSelectedChild.id)}
                          className="py-2 text-xs font-medium cursor-pointer"
                        >
                          View draft details
                        </Button>
                      </div>
                    ) : activeSelectedChild.blockingAttention ? (
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          fullWidth
                          onClick={() => {
                            setReminderTarget({
                              id: activeSelectedChild.id,
                              childName: activeSelectedChild.child?.fullName || 'Child',
                              parentName: activeSelectedChild.parent?.fullName || 'Parent'
                            });
                            setIsReminderModalOpen(true);
                          }}
                          className="py-2.5 text-xs font-semibold cursor-pointer"
                        >
                          <Clock className="w-3.5 h-3.5 mr-1.5" />
                          <span>Contact parent / Request missing details</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          fullWidth
                          onClick={() => setSelectedApplicationId(activeSelectedChild.id)}
                          className="py-2 text-xs font-medium cursor-pointer"
                        >
                          Review registration
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        fullWidth
                        onClick={() => setSelectedApplicationId(activeSelectedChild.id)}
                        className="py-2.5 text-xs font-semibold"
                      >
                        Review registration
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 px-4 space-y-2">
                    <Users className="w-8 h-8 text-zinc-300 dark:text-[#5A5550] mx-auto" />
                    <p className="text-xs text-zinc-400 dark:text-[#7A7570] leading-relaxed">
                      Select a registration from the list to see preview details here.
                    </p>
                  </div>
                )}
              </div>

              {/* ROOM CAPACITIES CARD */}
              <div 
                className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-5 space-y-4 shadow-xs"
                data-component-version="admin-review-room-capacities"
              >
                <span className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] block border-b border-[#EAE8E1] dark:border-[#302E29] pb-2.5">
                  Room capacities
                </span>

                {!capacityStats || capacityStats.length === 0 ? (
                  <div className="text-center py-4 px-2">
                    <p className="text-xs text-zinc-400 dark:text-[#7A7570]">
                      Capacity rules have not been configured yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5 pt-0.5">
                    {capacityStats.map((c) => {
                      const pct = Math.min(100, Math.round((c.current / c.limit) * 100));
                      const isFull = c.current >= c.limit;
                      const isWarning = pct >= 80;

                      const barFillColor = isFull 
                        ? 'bg-rose-500' 
                        : isWarning 
                          ? 'bg-amber-500' 
                          : 'bg-[#C59B27]';
                      
                      const cohortFilterKey = c.id === '2–3' ? 'group_2_3'
                        : c.id === '4–6' ? 'group_4_6'
                        : c.id === '7–9' ? 'group_7_9'
                        : c.id === '10–12' ? 'group_10_12'
                        : 'group_13_14';
                      const isFilterActiveForCohort = ageFilter === cohortFilterKey;

                      return (
                        <div 
                          key={c.id} 
                          onClick={() => setAgeFilter(isFilterActiveForCohort ? 'all' : cohortFilterKey)}
                          className={`space-y-1.5 p-2 -mx-2 rounded-xl transition-all cursor-pointer hover:bg-zinc-50 dark:hover:bg-[#262520] ${
                            isFilterActiveForCohort ? 'bg-[#FAF8F3] dark:bg-[#262520] ring-1 ring-[#C59B27]/40 shadow-2xs' : ''
                          }`}
                          title={`Click to filter registrations by ${c.label}`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-600 dark:text-[#B8B0A5] truncate max-w-[140px] font-medium">
                              {c.label} {isFilterActiveForCohort && <span className="text-[#C59B27] text-[10px] ml-1 font-semibold">(Active)</span>}
                            </span>
                            <span className="text-zinc-500 dark:text-[#7A7570] font-medium">
                              <span className="text-[#18181B] dark:text-[#F0EBE3] font-semibold">{c.current}</span>
                              <span className="text-zinc-300 dark:text-[#5A5550] mx-0.5">/</span>
                              <span>{c.limit}</span>
                            </span>
                          </div>
                          
                          <div className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-zinc-100 dark:border-[#3A3835] h-2 rounded-full overflow-hidden">
                            <div 
                              className={`${barFillColor} h-full rounded-full transition-all duration-500`} 
                              style={{ width: `${pct}%` }} 
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* REVIEW CRITERIA CARD */}
              <div 
                className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl p-5 space-y-3 shadow-xs"
                data-component-version="admin-review-guidelines"
              >
                <span className="text-xs font-semibold text-[#18181B] dark:text-[#F0EBE3] block border-b border-[#EAE8E1] dark:border-[#302E29] pb-2.5">
                  Review criteria
                </span>

                <div className="space-y-3 pt-0.5 text-xs text-zinc-600 dark:text-[#B8B0A5] leading-relaxed">
                  <div>
                    <strong className="text-[#18181B] dark:text-[#F0EBE3] font-medium block">Age guideline:</strong>
                    Children should meet the designated age bracket for their event section.
                  </div>
                  <div>
                    <strong className="text-[#18181B] dark:text-[#F0EBE3] font-medium block">Team priority:</strong>
                    Children of serving team members are prioritized to facilitate volunteer coverage.
                  </div>
                  <div>
                    <strong className="text-[#18181B] dark:text-[#F0EBE3] font-medium block">Safety standard:</strong>
                    A complete authorized pickup contact is required prior to gate check-in.
                  </div>
                </div>
              </div>

            </div>

          </div>
        </>
      )}

      {/* BULK APPLICATION REVIEW MODAL */}
      {bulkActionOpen && selectedReviewApps.length > 0 && (
        <BulkApplicationReviewModal
          isOpen={bulkActionOpen}
          applications={selectedReviewApps.map((a) => ({
            id: a.id,
            childName: a.child?.fullName || 'Child',
            parentName: a.parent?.fullName || 'Parent',
            age: a.child?.age,
            ageGroup: a.child?.ageGroup,
            currentStatus: a.status,
            photoUrl: a.child?.photoUrl
          }))}
          initialDecision={bulkDecision}
          onClose={() => setBulkActionOpen(false)}
          onSuccess={async () => {
            setSelectedIds([]);
            setBulkActionOpen(false);
            await fetchApplications(true);
          }}
        />
      )}

      {/* MOBILE DRAWER FILTERS SHEET */}
      {mobileFiltersOpen && (
        <div 
          className="fixed inset-0 z-50 flex justify-end lg:hidden"
          data-component-version="admin-review-mobile-filters"
        >
          <div 
            onClick={() => setMobileFiltersOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs" 
          />
          <div className="relative w-full max-w-xs bg-white dark:bg-[#1D1D1A] h-full shadow-2xl p-6 flex flex-col space-y-6 animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-[#EAE8E1] dark:border-[#302E29] pb-3 shrink-0">
              <span className="text-sm font-semibold text-zinc-800 dark:text-[#F0EBE3] flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-[#C59B27]" />
                Filters
              </span>
              <button 
                onClick={() => setMobileFiltersOpen(false)}
                className="text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#F0EBE3] p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1 py-1">
              {/* Status Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Status
                </label>
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] p-2.5 text-zinc-800 dark:text-[#F0EBE3] focus:outline-none"
                >
                  <option value="all">All statuses</option>
                  <option value="incomplete">Incomplete draft</option>
                  <option value="under_review">Awaiting review</option>
                  <option value="selected">Selected</option>
                  <option value="waiting_list">Waiting list</option>
                  <option value="not_selected">Not selected</option>
                </select>
              </div>

              {/* Attention Conditions Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Needs attention
                </label>
                <select 
                  value={flagFilter}
                  onChange={(e) => setFlagFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] p-2.5 text-zinc-800 dark:text-[#F0EBE3] focus:outline-none"
                >
                  <option value="all">All registrations</option>
                  <option value="any">Any needs attention</option>
                  <option value="missing_pickup_person">Missing pickup person</option>
                  <option value="missing_pickup_photo">Missing pickup photo</option>
                  <option value="missing_parent_photo">Missing parent photo</option>
                  <option value="missing_child_photo">Missing child photo</option>
                  <option value="missing_required">Missing required fields</option>
                  <option value="age_issue">Age not eligible / DOB missing</option>
                  <option value="medical_or_support">Care & medical notes</option>
                  <option value="duplicate_contact">Sibling registrations</option>
                </select>
              </div>

              {/* Age / Age Grade Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Age / Age grade
                </label>
                <select 
                  value={ageFilter}
                  onChange={(e) => setAgeFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] p-2.5 text-zinc-800 dark:text-[#F0EBE3] focus:outline-none"
                >
                  <option value="all">All ages & grades</option>
                  <optgroup label="Single Ages (Batch review)">
                    <option value="age_2">Age 2 only ({quickCounts.ageCounts.age_2})</option>
                    <option value="age_3">Age 3 only</option>
                    <option value="age_4">Age 4 only</option>
                    <option value="age_5">Age 5 only</option>
                    <option value="age_6">Age 6 only</option>
                    <option value="age_7">Age 7 only</option>
                    <option value="age_8">Age 8 only</option>
                    <option value="age_9">Age 9 only</option>
                    <option value="age_10">Age 10 only</option>
                    <option value="age_11">Age 11 only</option>
                    <option value="age_12">Age 12 only</option>
                    <option value="age_13">Age 13 only</option>
                    <option value="age_14">Age 14 only</option>
                  </optgroup>
                  <optgroup label="Age Cohorts">
                    <option value="group_2_3">Ages 2–3 ({quickCounts.ageCounts.group_2_3})</option>
                    <option value="group_4_6">Ages 4–6 ({quickCounts.ageCounts.group_4_6})</option>
                    <option value="group_7_9">Ages 7–9 ({quickCounts.ageCounts.group_7_9})</option>
                    <option value="group_10_12">Ages 10–12 ({quickCounts.ageCounts.group_10_12})</option>
                    <option value="group_13_14">Ages 13–14 ({quickCounts.ageCounts.group_13_14})</option>
                  </optgroup>
                  <optgroup label="Eligibility Checks">
                    <option value="below_2">Under 2 years (Review needed)</option>
                    <option value="above_14">Over 14 years</option>
                    <option value="age_missing">Age missing / unstated</option>
                  </optgroup>
                </select>
              </div>

              {/* Reminder Status Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Reminder status
                </label>
                <select 
                  value={reminderFilter}
                  onChange={(e) => setReminderFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] p-2.5 text-zinc-800 dark:text-[#F0EBE3] focus:outline-none"
                >
                  <option value="all">All registrations</option>
                  <option value="not_reminded">Incomplete: Not reminded yet ({quickCounts.unremindedIncomplete})</option>
                  <option value="reminded">Incomplete: Reminded 1+ times ({quickCounts.remindedIncomplete})</option>
                  <option value="reminded_multiple">Incomplete: Reminded multiple times (2+)</option>
                </select>
              </div>

              {/* Parent Role Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 dark:text-[#7A7570] block">
                  Parent role
                </label>
                <select 
                  value={workerFilter}
                  onChange={(e) => setWorkerFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] dark:border-[#3A3835] bg-white dark:bg-[#262520] p-2.5 text-zinc-800 dark:text-[#F0EBE3] focus:outline-none"
                >
                  <option value="all">All parents</option>
                  <option value="worker">Ministry team & workers</option>
                  <option value="non_worker">Other families</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-[#EAE8E1] dark:border-[#302E29] flex gap-2 shrink-0">
              <button
                onClick={handleResetFilters}
                className="flex-1 py-2 bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] hover:bg-zinc-50 dark:hover:bg-[#2A2926] text-zinc-700 dark:text-[#F0EBE3] font-medium rounded-xl text-xs cursor-pointer"
              >
                Reset
              </button>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="flex-1 py-2 bg-[#C59B27] hover:bg-[#B08921] text-white font-semibold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion Reminder Modal */}
      {isReminderModalOpen && reminderTarget && (
        <CompletionReminderModal
          isOpen={isReminderModalOpen}
          entryId={reminderTarget.id}
          childName={reminderTarget.childName}
          parentName={reminderTarget.parentName}
          onClose={() => {
            setIsReminderModalOpen(false);
            setReminderTarget(null);
          }}
          onSuccess={handleReminderSuccess}
          onNext={handleNextReminder}
          hasNext={hasNextReminder}
          queuePosition={currentQueueIndex >= 0 ? { current: currentQueueIndex + 1, total: incompleteReminderQueue.length } : undefined}
        />
      )}

      {/* Bulk Completion Reminder Modal */}
      {bulkReminderModalOpen && selectedIncompleteApps.length > 0 && (
        <BulkCompletionReminderModal
          isOpen={bulkReminderModalOpen}
          applications={selectedIncompleteApps.map((a) => ({
            id: a.id,
            childName: a.child?.fullName || 'Child',
            parentName: a.parent?.fullName || 'Parent'
          }))}
          onClose={() => setBulkReminderModalOpen(false)}
          onSuccess={async () => {
            setSelectedIds([]);
            setBulkReminderModalOpen(false);
            await fetchApplications(true);
          }}
        />
      )}

    </div>
  );
};

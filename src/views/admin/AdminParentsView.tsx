import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  Search,
  RotateCcw,
  Trash2,
  Plus,
  MoreHorizontal,
  AlertTriangle,
  ChevronDown,
  MapPin,
  Briefcase,
  ShieldCheck,
  Download,
  Eye,
  X,
  Filter,
  CheckCircle2,
  MessageSquare,
  Home,
  Globe,
  Building2,
  UserCheck,
  HeartHandshake,
  Loader2,
  Phone,
  ArrowRight,
  Mail
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AddParentModal } from '../../components/admin/modals/AddParentModal';
import { ChildReviewModal } from '../../components/admin/modals/ChildReviewModal';
import { 
  BulkChildEventActionModal, 
  BulkChildActionType, 
  ConnectedChildRecord 
} from '../../components/admin/modals/BulkChildEventActionModal';
import { AdminSelectionCheckbox } from '../../components/common/AdminSelectionCheckbox';
import { AppRoute } from '../../types';

interface AdminParentsViewProps {
  onBackToOverview?: () => void;
  onNavigate: (route: AppRoute) => void;
  adminUser?: any;
  currentEvent?: any;
}

type ParentTab = 'active' | 'removed';
type WorkerFilterType = 'all' | 'worker' | 'non_worker';
type ChildrenFilterType = 'all' | 'has_children' | 'no_children';
type LocationFilterType = 'all' | 'has_location' | 'missing_location';

const getInitials = (name: any): string => {
  if (!name || typeof name !== 'string') return 'P';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getDisplayName = (p: any): string => {
  const raw = typeof p?.fullName === 'string' ? p.fullName.trim() : '';
  if (!raw || raw.toLowerCase() === 'invited user') return 'Invited parent';
  return raw;
};

const formatChildrenCount = (count: number): string => {
  if (count === 1) return '1 child';
  return `${count} children`;
};

export const AdminParentsView: React.FC<AdminParentsViewProps> = ({ onNavigate, adminUser, currentEvent }) => {
  const isSuperAdmin = adminUser?.role === 'super_admin';
  const { showError, showSuccess } = useNotification();
  const [activeEvent, setActiveEvent] = useState<any>(currentEvent || null);
  const [parents, setParents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ParentTab>('active');

  // Quick View Child Action States
  const [submittingModalChildActionId, setSubmittingModalChildActionId] = useState<string | null>(null);
  const [modalChildToRestore, setModalChildToRestore] = useState<any | null>(null);
  const [restoringModalChild, setRestoringModalChild] = useState(false);
  const [reviewingChild, setReviewingChild] = useState<any | null>(null);

  // Enhanced Filter States
  const [workerFilter, setWorkerFilter] = useState<WorkerFilterType>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [hasChildrenFilter, setHasChildrenFilter] = useState<ChildrenFilterType>('all');
  const [hasLocationFilter, setHasLocationFilter] = useState<LocationFilterType>('all');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string>('all');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Available filter options returned by backend
  const [filterOptions, setFilterOptions] = useState<{
    departments: { department: string; count: number }[];
    countries: { country: string; count: number }[];
    states: { state_region: string; count: number }[];
    cities: { city: string; count: number }[];
  }>({
    departments: [],
    countries: [],
    states: [],
    cities: []
  });

  // Canonical age groups for event matching
  const availableAgeGroups = useMemo(() => {
    const canonicalTwoToThree = { id: '2-3', label: 'Ages 2–3', minAge: 2, maxAge: 3 };

    if (activeEvent?.ageGroups && Array.isArray(activeEvent.ageGroups) && activeEvent.ageGroups.length > 0) {
      const groups = activeEvent.ageGroups.map((g: any) => ({
        id: String(g.id || `${g.minAge}-${g.maxAge}`),
        label: g.label || (g.maxAge ? `Ages ${g.minAge}–${g.maxAge}` : `Age ${g.minAge}+`),
        minAge: Number(g.minAge ?? g.min_age ?? 0),
        maxAge: Number(g.maxAge ?? g.max_age ?? 99)
      }));

      // Check if Ages 2–3 is already present
      const hasTwoToThree = groups.some(
        (g: any) => (g.minAge === 2 && g.maxAge === 3) || g.id === '2-3' || g.label?.includes('2–3') || g.label?.includes('2-3')
      );

      if (!hasTwoToThree) {
        // Place Ages 2–3 right before Ages 4–6 (or at the beginning if not found)
        const idx4to6 = groups.findIndex(
          (g: any) => (g.minAge === 4 && g.maxAge === 6) || g.id === '4-6' || g.label?.includes('4–6') || g.label?.includes('4-6')
        );
        if (idx4to6 >= 0) {
          const updated = [...groups];
          updated.splice(idx4to6, 0, canonicalTwoToThree);
          return updated;
        }
        return [canonicalTwoToThree, ...groups];
      }
      return groups;
    }

    return [
      canonicalTwoToThree,
      { id: '4-6', label: 'Ages 4–6', minAge: 4, maxAge: 6 },
      { id: '7-9', label: 'Ages 7–9', minAge: 7, maxAge: 9 },
      { id: '10-12', label: 'Ages 10–12', minAge: 10, maxAge: 12 },
      { id: '13-14', label: 'Ages 13–14', minAge: 13, maxAge: 14 }
    ];
  }, [activeEvent]);

  // Calendar date parsing preserving strict timezone-independent date
  const parseCalendarDateParts = (dateInput?: string | Date | null): { year: number; month: number; day: number } | null => {
    if (!dateInput) return null;
    if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim();
      const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const day = parseInt(match[3], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          return { year, month, day };
        }
      }
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) return null;
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    } else if (dateInput instanceof Date) {
      if (isNaN(dateInput.getTime())) return null;
      return { year: dateInput.getUTCFullYear(), month: dateInput.getUTCMonth() + 1, day: dateInput.getUTCDate() };
    }
    return null;
  };

  const calculateChildAgeOnEvent = (dobStr?: string, eventDateStr?: string | Date | null, fallbackAge?: number): number | null => {
    if (dobStr) {
      const dobParts = parseCalendarDateParts(dobStr);
      if (dobParts) {
        const refParts = parseCalendarDateParts(eventDateStr) || parseCalendarDateParts(new Date());
        if (refParts) {
          let age = refParts.year - dobParts.year;
          const isBeforeBirthdayThisYear =
            refParts.month < dobParts.month ||
            (refParts.month === dobParts.month && refParts.day < dobParts.day);
          if (isBeforeBirthdayThisYear) {
            age--;
          }
          return age >= 0 ? age : 0;
        }
      }
    }
    if (typeof fallbackAge === 'number' && !isNaN(fallbackAge) && fallbackAge >= 0) {
      return fallbackAge;
    }
    return null;
  };

  const doesChildMatchAgeGroup = (child: any, ageGroup: { minAge: number; maxAge: number; label: string; id: string }) => {
    const age = calculateChildAgeOnEvent(child.dateOfBirth, activeEvent?.starts_at, child.age);
    if (age !== null) {
      return age >= ageGroup.minAge && age <= ageGroup.maxAge;
    }
    if (child.ageGroup) {
      const norm = String(child.ageGroup).toLowerCase().replace(/[–—]/g, '-').replace(/\s+to\s+/g, '-');
      const labelNorm = String(ageGroup.label).toLowerCase().replace(/[–—]/g, '-').replace(/\s+to\s+/g, '-');
      const idNorm = String(ageGroup.id).toLowerCase();
      if (norm.includes(idNorm) || norm.includes(`${ageGroup.minAge}-${ageGroup.maxAge}`) || labelNorm.includes(norm) || norm.includes(labelNorm)) {
        return true;
      }
    }
    return false;
  };

  const doesParentMatchAgeGroup = (parent: any, selectedGroupId: string) => {
    if (!selectedGroupId || selectedGroupId === 'all') return true;
    const group = availableAgeGroups.find(g => g.id === selectedGroupId);
    if (!group) return true;
    if (!parent.children || parent.children.length === 0) return false;
    return parent.children.some((child: any) => doesChildMatchAgeGroup(child, group));
  };

  // Bulk selection & actions
  const [selectedParentIds, setSelectedParentIds] = useState<string[]>([]);
  const [showBulkRemoveModal, setShowBulkRemoveModal] = useState(false);
  const [bulkRemoveReason, setBulkRemoveReason] = useState('');
  const [submittingBulkRemove, setSubmittingBulkRemove] = useState(false);
  const [showBulkRestoreModal, setShowBulkRestoreModal] = useState(false);
  const [submittingBulkRestore, setSubmittingBulkRestore] = useState(false);
  const [bulkMoreDropdownOpen, setBulkMoreDropdownOpen] = useState(false);
  const bulkMoreDropdownRef = useRef<HTMLDivElement>(null);

  // Controlled Bulk Selection Scope & Pagination
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [headerScopeMenuOpen, setHeaderScopeMenuOpen] = useState(false);
  const [toolbarScopeMenuOpen, setToolbarScopeMenuOpen] = useState(false);
  const headerScopeMenuRef = useRef<HTMLDivElement>(null);
  const toolbarScopeMenuRef = useRef<HTMLDivElement>(null);

  // Custom Amount Modal State
  const [showCustomAmountModal, setShowCustomAmountModal] = useState(false);
  const [customAmountValue, setCustomAmountValue] = useState('50');
  const [customAmountError, setCustomAmountError] = useState('');

  // Confirmation for large "Select all filtered"
  const [showConfirmSelectAllModal, setShowConfirmSelectAllModal] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        headerScopeMenuOpen &&
        headerScopeMenuRef.current &&
        !headerScopeMenuRef.current.contains(e.target as Node)
      ) {
        setHeaderScopeMenuOpen(false);
      }
      if (
        toolbarScopeMenuOpen &&
        toolbarScopeMenuRef.current &&
        !toolbarScopeMenuRef.current.contains(e.target as Node)
      ) {
        setToolbarScopeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [headerScopeMenuOpen, toolbarScopeMenuOpen]);

  // Bulk Child Event Actions & Sequence Review
  const [eventActionsDropdownOpen, setEventActionsDropdownOpen] = useState(false);
  const eventActionsRef = useRef<HTMLDivElement>(null);
  const [bulkChildActionType, setBulkChildActionType] = useState<BulkChildActionType | null>(null);
  const [reviewSequenceList, setReviewSequenceList] = useState<ConnectedChildRecord[]>([]);
  const [reviewSequenceIndex, setReviewSequenceIndex] = useState(0);

  // Selected parents records
  const selectedParentsList = useMemo(() => {
    if (selectedParentIds.length === 0) return [];
    const idSet = new Set(selectedParentIds.map(String));
    return parents.filter(p => idSet.has(String(p.id)));
  }, [parents, selectedParentIds]);

  // All connected children across selected parents
  const allConnectedChildren = useMemo<ConnectedChildRecord[]>(() => {
    const list: ConnectedChildRecord[] = [];
    selectedParentsList.forEach(p => {
      const parentName = getDisplayName(p);
      (p.children || []).forEach((c: any) => {
        list.push({
          id: String(c.id),
          applicationId: c.applicationId ? String(c.applicationId) : null,
          fullName: c.fullName || 'Unnamed Child',
          age: c.age,
          ageGroup: c.ageGroup,
          gender: c.gender,
          entryStatus: c.entryStatus || 'not_registered',
          checkedInAt: c.checkedInAt,
          pickedUpAt: c.pickedUpAt,
          parentId: String(p.id),
          parentName,
          parentEmail: p.email,
          parentPhone: p.phoneNumber || p.phone_number
        });
      });
    });
    return list;
  }, [selectedParentsList]);

  // Context-aware applicable counts for the Event Actions dropdown
  const applicableCounts = useMemo(() => {
    let selectForEvent = 0;
    let reviewSelected = 0;
    let approve = 0;
    let waitlist = 0;
    let notSelected = 0;
    let returnDraft = 0;
    let restore = 0;

    allConnectedChildren.forEach(child => {
      const status = child.entryStatus || 'not_registered';
      const isAttending = ['checked_in', 'inside', 'picked_up'].includes(status) || Boolean(child.checkedInAt && !child.pickedUpAt);
      if (isAttending) return;

      // restore
      if (child.applicationId && (status === 'withdrawn' || status === 'not_selected')) {
        restore++;
      }

      if (status === 'withdrawn') return;

      // select_for_event
      if (!child.entryStatus || status === 'not_registered' || status === 'not_selected' || status === 'incomplete' || status === 'draft' || status === 'waiting_list') {
        if (status !== 'pass_ready' && status !== 'selected' && status !== 'under_review' && status !== 'review_reopened') {
          selectForEvent++;
        }
      }

      // review_selected
      if (status === 'under_review' || status === 'review_reopened') {
        reviewSelected++;
      }

      // approve
      if (child.applicationId && (status === 'under_review' || status === 'review_reopened' || status === 'waiting_list')) {
        approve++;
      }

      // waitlist
      if (child.applicationId && status !== 'waiting_list' && status !== 'pass_ready' && ['under_review', 'review_reopened', 'selected', 'not_selected'].includes(status)) {
        waitlist++;
      }

      // not_selected
      if (child.applicationId && status !== 'not_selected' && status !== 'pass_ready' && ['under_review', 'review_reopened', 'selected', 'waiting_list'].includes(status)) {
        notSelected++;
      }

      // return_draft
      if (child.applicationId && (status === 'under_review' || status === 'review_reopened')) {
        returnDraft++;
      }
    });

    return {
      selectForEvent,
      reviewSelected,
      approve,
      waitlist,
      notSelected,
      returnDraft,
      restore
    };
  }, [allConnectedChildren]);

  // Bulk Permanent Delete
  const [showBulkPurgeModal, setShowBulkPurgeModal] = useState(false);
  const [bulkPurgeConfirmText, setBulkPurgeConfirmText] = useState('');
  const [submittingBulkPurge, setSubmittingBulkPurge] = useState(false);

  // Stats across parents
  const [stats, setStats] = useState({
    parents: 0,
    childrenLinked: 0,
    teamMembers: 0,
    regularParents: 0,
    locationsCount: 0,
    whatsAppNumbers: 0,
    whatsAppOptedIn: 0
  });

  // Quick View Modal
  const [quickViewParent, setQuickViewParent] = useState<any | null>(null);

  // Overflow menu state per row
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  // Soft remove confirmation modal
  const [parentToRemove, setParentToRemove] = useState<any | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [submittingRemove, setSubmittingRemove] = useState(false);

  // Restore confirmation modal
  const [parentToRestore, setParentToRestore] = useState<any | null>(null);
  const [submittingRestore, setSubmittingRestore] = useState(false);

  // Permanent delete modal
  const [parentToDelete, setParentToDelete] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Resend invitation modal state
  const [parentToResendInvite, setParentToResendInvite] = useState<any | null>(null);
  const [resendingInvite, setResendingInvite] = useState(false);

  // Add parent modal
  const [showAddParentModal, setShowAddParentModal] = useState(false);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (workerFilter !== 'all') count++;
    if (selectedDepartment !== 'all') count++;
    if (selectedCountry !== 'all') count++;
    if (selectedState !== 'all') count++;
    if (selectedCity !== 'all') count++;
    if (hasChildrenFilter !== 'all') count++;
    if (selectedAgeGroup !== 'all') count++;
    if (hasLocationFilter !== 'all') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [
    workerFilter,
    selectedDepartment,
    selectedCountry,
    selectedState,
    selectedCity,
    hasChildrenFilter,
    selectedAgeGroup,
    hasLocationFilter,
    searchQuery
  ]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setWorkerFilter('all');
    setSelectedDepartment('all');
    setSelectedCountry('all');
    setSelectedState('all');
    setSelectedCity('all');
    setHasChildrenFilter('all');
    setSelectedAgeGroup('all');
    setHasLocationFilter('all');
  };

  // Resolve active event if not provided
  useEffect(() => {
    if (!activeEvent) {
      api.admin.getEvents().then(res => {
        if (res.success && res.events?.length > 0) {
          const cur = res.events.find((e: any) => e.status === 'current') || res.events[0];
          setActiveEvent(cur);
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (currentEvent) {
      setActiveEvent(currentEvent);
    }
  }, [currentEvent]);

  const fetchParents = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getParents({
        q: searchQuery,
        status: activeTab,
        workerStatus: workerFilter,
        department: selectedDepartment,
        country: selectedCountry,
        stateRegion: selectedState,
        city: selectedCity,
        hasChildren: hasChildrenFilter,
        hasLocation: hasLocationFilter,
        ageGroup: selectedAgeGroup,
        eventId: activeEvent?.id
      });

      if (res.success) {
        const list = res.parents || [];
        setParents(list);

        if (res.filterOptions) {
          setFilterOptions(res.filterOptions);
        }

        // Calculate statistics based on fetched slice or entire active list
        const distinctCities = new Set(
          list.map((p: any) => p.city).filter((c: any) => Boolean(c && String(c).trim()))
        );

        setStats({
          parents: list.length,
          childrenLinked: list.reduce((sum: number, p: any) => sum + Number(p.childrenCount || 0), 0),
          teamMembers: list.filter((p: any) => p.isKoinoniaWorker).length,
          regularParents: list.filter((p: any) => !p.isKoinoniaWorker).length,
          locationsCount: distinctCities.size,
          whatsAppNumbers: list.filter((p: any) => Boolean(p.whatsapp && String(p.whatsapp).trim())).length,
          whatsAppOptedIn: list.filter((p: any) => p.whatsappConsentStatus === 'opted_in').length
        });
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Unable to load parents', parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParents();
  }, [
    searchQuery,
    activeTab,
    workerFilter,
    selectedDepartment,
    selectedCountry,
    selectedState,
    selectedCity,
    hasChildrenFilter,
    hasLocationFilter,
    selectedAgeGroup,
    activeEvent?.id
  ]);

  // Quick View Child Action Handlers
  const handleSelectModalChild = async (child: any) => {
    const actionKey = child.id + '-select';
    setSubmittingModalChildActionId(actionKey);
    try {
      const res = await api.admin.reviewApplication(child.applicationId || child.id, {
        status: 'under_review',
        eventId: activeEvent?.id,
        sendNotification: false
      });
      if (res.success) {
        showSuccess('Child Entered for Event', `${child.fullName} is now entered for ${activeEvent?.title || activeEvent?.name || 'the event'} and awaiting review.`);
        const newStatus = res.status || 'under_review';
        const newAppId = res.applicationId || res.pass?.child_event_entry_id || res.application?.id || child.applicationId;

        // Immediately update quickViewParent.children
        setQuickViewParent((prev: any) => {
          if (!prev) return null;
          return {
            ...prev,
            children: (prev.children || []).map((c: any) => 
              c.id === child.id ? { ...c, entryStatus: newStatus, applicationId: newAppId } : c
            )
          };
        });

        // Immediately update parents state
        setParents(prev => prev.map((p: any) => {
          if (p.id !== quickViewParent?.id) return p;
          return {
            ...p,
            children: (p.children || []).map((c: any) => 
              c.id === child.id ? { ...c, entryStatus: newStatus, applicationId: newAppId } : c
            )
          };
        }));
      } else {
        showError('Selection Failed', res.error || 'Could not select child.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Selection Failed', parsed.message || 'Could not select child.');
    } finally {
      setSubmittingModalChildActionId(null);
    }
  };

  const handleReviewModalChild = (child: any) => {
    setReviewingChild(child);
  };

  const handleStatusUpdatedFromReviewModal = (newStatus: string, newApplicationId?: string) => {
    if (!reviewingChild) return;
    const targetChildId = reviewingChild.id;

    // Immediately update quickViewParent.children
    setQuickViewParent((prev: any) => {
      if (!prev) return null;
      return {
        ...prev,
        children: (prev.children || []).map((c: any) => 
          c.id === targetChildId ? { ...c, entryStatus: newStatus, applicationId: newApplicationId || c.applicationId } : c
        )
      };
    });

    // Immediately update parents state
    setParents(prev => prev.map((p: any) => {
      const hasTargetChild = (p.children || []).some((c: any) => c.id === targetChildId);
      if (!hasTargetChild) return p;
      return {
        ...p,
        children: (p.children || []).map((c: any) => 
          c.id === targetChildId ? { ...c, entryStatus: newStatus, applicationId: newApplicationId || c.applicationId } : c
        )
      };
    }));

    // Immediately update reviewSequenceList
    setReviewSequenceList(prev => prev.map(c => 
      c.id === targetChildId ? { ...c, entryStatus: newStatus, applicationId: newApplicationId || c.applicationId } : c
    ));
  };

  const handleStartReviewSequence = (chosenChildren?: ConnectedChildRecord[]) => {
    const list = chosenChildren && chosenChildren.length > 0
      ? chosenChildren
      : allConnectedChildren.filter(c => 
          c.entryStatus === 'under_review' || c.entryStatus === 'review_reopened'
        );
    if (list.length === 0) {
      showError('No Applications to Review', 'None of the selected children are currently awaiting review.');
      return;
    }
    setReviewSequenceList(list);
    setReviewSequenceIndex(0);
    setReviewingChild(list[0]);
  };

  const handleBulkChildActionSuccess = (updatedChildIds: string[], newStatus: string) => {
    if (updatedChildIds.length === 0) return;

    // Immediately update parents state in-place
    setParents(prev => prev.map((p: any) => {
      const hasAny = (p.children || []).some((c: any) => updatedChildIds.includes(String(c.id)));
      if (!hasAny) return p;
      return {
        ...p,
        children: (p.children || []).map((c: any) => 
          updatedChildIds.includes(String(c.id)) ? { ...c, entryStatus: newStatus } : c
        )
      };
    }));

    // Immediately update quickViewParent if open
    setQuickViewParent((prev: any) => {
      if (!prev) return null;
      return {
        ...prev,
        children: (prev.children || []).map((c: any) => 
          updatedChildIds.includes(String(c.id)) ? { ...c, entryStatus: newStatus } : c
        )
      };
    });

    // Clear selection so the admin can move to the next batch
    setSelectedParentIds([]);
  };

  const handleViewModalChild = (child: any) => {
    setQuickViewParent(null);
    onNavigate(`/admin/children/${child.id}` as AppRoute);
  };

  const handleRestoreModalChildConfirm = async () => {
    if (!modalChildToRestore) return;
    setRestoringModalChild(true);
    try {
      const res = await api.admin.restoreChild(modalChildToRestore.applicationId || modalChildToRestore.id);
      if (res.success) {
        showSuccess('Child Restored', `${modalChildToRestore.fullName} has been restored to event review.`);
        const restoredChildId = modalChildToRestore.id;
        setModalChildToRestore(null);

        // Immediately update quickViewParent.children
        setQuickViewParent((prev: any) => {
          if (!prev) return null;
          return {
            ...prev,
            children: (prev.children || []).map((c: any) => 
              c.id === restoredChildId ? { ...c, entryStatus: 'under_review' } : c
            )
          };
        });

        // Immediately update parents state
        setParents(prev => prev.map((p: any) => {
          if (p.id !== quickViewParent?.id) return p;
          return {
            ...p,
            children: (p.children || []).map((c: any) => 
              c.id === restoredChildId ? { ...c, entryStatus: 'under_review' } : c
            )
          };
        }));
      } else {
        showError('Restore Failed', res.error || 'Could not restore child.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Restore Failed', parsed.message || 'Could not restore child.');
    } finally {
      setRestoringModalChild(false);
    }
  };

  const handleResendInviteConfirm = async () => {
    if (!parentToResendInvite) return;
    setResendingInvite(true);
    try {
      const res = await api.admin.resendInvite({
        userId: parentToResendInvite.userId,
        email: parentToResendInvite.email
      });
      if (res.success) {
        showSuccess('Invitation resent', `Invitation successfully resent to ${parentToResendInvite.email}.`);
        setParentToResendInvite(null);
        if (quickViewParent && (quickViewParent.id === parentToResendInvite.id || quickViewParent.userId === parentToResendInvite.userId)) {
          setQuickViewParent({
            ...quickViewParent,
            accountStatus: 'invitation_pending',
            invitationSentAt: new Date().toISOString()
          });
        }
        await fetchParents();
      } else {
        showError('Resend failed', res.message || res.error || 'Failed to resend invitation.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Resend failed', parsed.message || 'Failed to resend invitation.');
    } finally {
      setResendingInvite(false);
    }
  };

  // Filtered parent records combining backend response with client age-group verification
  const displayParents = useMemo(() => {
    if (selectedAgeGroup === 'all') return parents;
    return parents.filter(p => doesParentMatchAgeGroup(p, selectedAgeGroup));
  }, [parents, selectedAgeGroup, availableAgeGroups, activeEvent]);

  // Reset pagination & selection when switching tabs
  useEffect(() => {
    setSelectedParentIds([]);
    setCurrentPage(1);
  }, [activeTab]);

  // Reconcile selection when displayParents change:
  // Retain only selected parents that still match the active filtered dataset
  useEffect(() => {
    setCurrentPage(1);
    setSelectedParentIds(prev => {
      if (prev.length === 0) return prev;
      const validIdSet = new Set(displayParents.map(p => String(p.id)));
      const filtered = prev.filter(id => validIdSet.has(id));
      if (filtered.length === prev.length) return prev;
      return filtered;
    });
  }, [displayParents]);

  // Pagination & Visible Records calculation
  const totalPages = Math.max(1, Math.ceil(displayParents.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const visibleParents = useMemo(() => {
    return displayParents.slice(startIndex, endIndex);
  }, [displayParents, startIndex, endIndex]);

  const visibleParentIds = useMemo(() => {
    return visibleParents.map(p => String(p.id));
  }, [visibleParents]);

  const isAllVisibleSelected = visibleParents.length > 0 && visibleParents.every(p => selectedParentIds.includes(String(p.id)));
  const isSomeVisibleSelected = visibleParents.some(p => selectedParentIds.includes(String(p.id)));
  const isIndeterminate = isSomeVisibleSelected && !isAllVisibleSelected;

  const handleToggleSelectVisible = () => {
    if (isAllVisibleSelected) {
      // Deselect only currently visible rows
      setSelectedParentIds(prev => prev.filter(id => !visibleParentIds.includes(id)));
    } else {
      // Select currently visible rows (preserving any selections from other pages)
      setSelectedParentIds(prev => Array.from(new Set([...prev, ...visibleParentIds])));
    }
  };

  const handleSelectFirstN = (n: number) => {
    const toSelect = displayParents.slice(0, n).map(p => String(p.id));
    setSelectedParentIds(toSelect);
  };

  const handleSelectAllFiltered = () => {
    if (displayParents.length > 50) {
      setShowConfirmSelectAllModal(true);
    } else {
      setSelectedParentIds(displayParents.map(p => String(p.id)));
    }
  };

  const handleConfirmSelectAll = () => {
    setSelectedParentIds(displayParents.map(p => String(p.id)));
    setShowConfirmSelectAllModal(false);
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setCustomAmountValue(raw);
    if (!raw.trim()) {
      setCustomAmountError('Please enter a number greater than 0.');
      return;
    }
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setCustomAmountError('Please enter a number greater than 0.');
    } else if (parsed > displayParents.length) {
      setCustomAmountError(`Only ${displayParents.length} parents match the current filters.`);
    } else {
      setCustomAmountError('');
    }
  };

  const handleCustomAmountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customAmountValue.trim(), 10);
    if (isNaN(parsed) || parsed <= 0) {
      setCustomAmountError('Please enter a number greater than 0.');
      return;
    }
    if (parsed > displayParents.length) {
      setCustomAmountError(`Only ${displayParents.length} parents match the current filters.`);
      return;
    }
    handleSelectFirstN(parsed);
    setShowCustomAmountModal(false);
    setCustomAmountError('');
  };

  const parsedCustomAmount = parseInt(customAmountValue.trim(), 10);
  const isCustomAmountValid = !isNaN(parsedCustomAmount) && parsedCustomAmount > 0 && parsedCustomAmount <= displayParents.length;

  const renderSelectionScopeDropdown = (
    onClose: () => void,
    positionClass: string = "left-0 top-full mt-1.5"
  ) => (
    <div
      className={`absolute ${positionClass} w-56 bg-white dark:bg-[#1E1E1C] border border-[#EAE8E1] dark:border-[#2E2C28] rounded-lg shadow-xl z-50 py-1 text-xs text-left animate-scale-in`}
    >
      <div className="px-3 py-1.5 border-b border-[#EAE8E1] dark:border-[#2E2C28] text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        Selection Scope
      </div>

      <button
        type="button"
        onClick={() => {
          onClose();
          setSelectedParentIds(visibleParentIds);
        }}
        className="w-full px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 hover:bg-[#FAF9F6] dark:hover:bg-[#262522] hover:text-neutral-900 dark:hover:text-white flex items-center justify-between transition-colors cursor-pointer"
      >
        <span>Select visible</span>
        <span className="text-[10px] text-neutral-400 font-medium">{visibleParents.length}</span>
      </button>

      {[10, 25, 50, 100].map(count => {
        const isAvailable = displayParents.length >= count;
        return (
          <button
            key={count}
            type="button"
            disabled={!isAvailable}
            onClick={() => {
              onClose();
              handleSelectFirstN(count);
            }}
            className="w-full px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 hover:bg-[#FAF9F6] dark:hover:bg-[#262522] hover:text-neutral-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between transition-colors cursor-pointer"
          >
            <span>Select first {count}</span>
            {!isAvailable && (
              <span className="text-[10px] text-neutral-400 font-normal">({displayParents.length} available)</span>
            )}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => {
          onClose();
          setCustomAmountValue(String(Math.min(50, displayParents.length || 1)));
          setCustomAmountError('');
          setShowCustomAmountModal(true);
        }}
        className="w-full px-3 py-2 text-left text-neutral-700 dark:text-neutral-300 hover:bg-[#FAF9F6] dark:hover:bg-[#262522] hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        Select custom amount…
      </button>

      <div className="my-1 border-t border-[#EAE8E1] dark:border-[#2E2C28]" />

      <button
        type="button"
        onClick={() => {
          onClose();
          handleSelectAllFiltered();
        }}
        className="w-full px-3 py-2 text-left text-neutral-800 dark:text-neutral-200 hover:bg-[#FAF9F6] dark:hover:bg-[#262522] hover:text-neutral-950 dark:hover:text-white flex items-center justify-between transition-colors cursor-pointer font-medium"
      >
        <span>Select all filtered</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-semibold">
          {displayParents.length}
        </span>
      </button>
    </div>
  );

  const handleToggleSelectParent = (id: string) => {
    setSelectedParentIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkRemoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingBulkRemove(true);
    try {
      const res = await api.admin.bulkRemoveParents({
        parentIds: selectedParentIds,
        reason: bulkRemoveReason || undefined
      });
      if (res.success) {
        showSuccess('Parents removed', `${res.count} parent(s) moved to Removed. Linked children and event history are preserved.`);
        setShowBulkRemoveModal(false);
        setBulkRemoveReason('');
        setSelectedParentIds([]);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Removal failed', parsed.message);
    } finally {
      setSubmittingBulkRemove(false);
    }
  };

  const handleBulkRestoreSubmit = async () => {
    setSubmittingBulkRestore(true);
    try {
      const res = await api.admin.bulkRestoreParents({
        parentIds: selectedParentIds
      });
      if (res.success) {
        showSuccess('Parents restored', `${res.count} parent(s) restored to Active.`);
        setShowBulkRestoreModal(false);
        setSelectedParentIds([]);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Restore failed', parsed.message);
    } finally {
      setSubmittingBulkRestore(false);
    }
  };

  const handleBulkPurge = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (submittingBulkPurge || selectedParentIds.length === 0) return;
    setSubmittingBulkPurge(true);
    try {
      const res = await api.admin.bulkPermanentlyDeleteParents({
        parentIds: selectedParentIds,
        confirmText: 'DELETE',
        reason: 'Bulk permanent deletion by Super Admin'
      });
      if (res.success && (res.count > 0 || !res.failures || res.failures.length === 0)) {
        showSuccess('Parents permanently deleted', `${res.count ?? selectedParentIds.length} parent(s) permanently deleted.`);
        setShowBulkPurgeModal(false);
        setBulkPurgeConfirmText('');
        setSelectedParentIds([]);
        fetchParents();
      } else if (res.failures && res.failures.length > 0) {
        showError('Permanent delete failed', res.failures[0]?.reason || "We couldn't permanently delete selected parents.");
      } else {
        showError('Permanent delete failed', res.message || "We couldn't permanently delete selected parents. Nothing was changed.");
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Permanent delete failed', parsed.message || "We couldn't permanently delete selected parents. Nothing was changed.");
    } finally {
      setSubmittingBulkPurge(false);
    }
  };

  // Close overflow action menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionMenuId(null);
      }
      if (bulkMoreDropdownRef.current && !bulkMoreDropdownRef.current.contains(e.target as Node)) {
        setBulkMoreDropdownOpen(false);
      }
      if (eventActionsRef.current && !eventActionsRef.current.contains(e.target as Node)) {
        setEventActionsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTabChange = (tab: ParentTab) => {
    setActiveTab(tab);
    setOpenActionMenuId(null);
    setBulkMoreDropdownOpen(false);
    setEventActionsDropdownOpen(false);
    setSelectedParentIds([]);
  };

  const handleRemoveParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentToRemove) return;
    setSubmittingRemove(true);
    try {
      const res = await api.admin.removeParent(parentToRemove.id, removeReason);
      if (res.success) {
        showSuccess('Parent removed', 'Their account will move to Removed and can be restored later.');
        setParentToRemove(null);
        setRemoveReason('');
        setOpenActionMenuId(null);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action failed', parsed.message);
    } finally {
      setSubmittingRemove(false);
    }
  };

  const handleRestoreParentSubmit = async () => {
    if (!parentToRestore) return;
    setSubmittingRestore(true);
    try {
      const res = await api.admin.restoreParent(parentToRestore.id);
      if (res.success) {
        showSuccess('Parent restored', 'The parent profile has been restored to Active.');
        setParentToRestore(null);
        setOpenActionMenuId(null);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action failed', parsed.message);
    } finally {
      setSubmittingRestore(false);
    }
  };

  const handlePermanentDeleteSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!parentToDelete || submittingDelete) return;
    setSubmittingDelete(true);
    try {
      const res = await api.admin.permanentlyDeleteParent(parentToDelete.id, {
        reason: 'Single permanent deletion by Super Admin',
        confirmation: 'DELETE'
      });
      if (res.success) {
        showSuccess('Parent permanently deleted', `${getDisplayName(parentToDelete)} was permanently deleted.`);
        setParentToDelete(null);
        setDeleteReason('');
        setDeleteConfirmationText('');
        setOpenActionMenuId(null);
        fetchParents();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Permanent delete failed', parsed.message || "We couldn't permanently delete this parent. Nothing was changed.");
    } finally {
      setSubmittingDelete(false);
    }
  };

  // Export filtered parents list as CSV
  const handleExportCSV = () => {
    if (displayParents.length === 0) {
      showError('Export empty', 'There are no parents matching your current filters.');
      return;
    }

    const headers = [
      'Full Name',
      'Worker Status',
      'Department',
      'Email',
      'Phone Number',
      'WhatsApp Number',
      'Country',
      'State/Region',
      'City',
      'Home Address',
      'Children Count',
      'Children Names',
      'Account Status',
      'Created Date'
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = displayParents.map(p => {
      const childrenNames = (p.children || []).map((c: any) => `${c.fullName}${c.age ? ` (${c.age}y)` : ''}`).join('; ');
      return [
        escapeCsv(p.fullName),
        escapeCsv(p.isKoinoniaWorker ? 'Koinonia Worker' : 'Parent'),
        escapeCsv(p.department || ''),
        escapeCsv(p.email || ''),
        escapeCsv(p.phone || ''),
        escapeCsv(p.whatsapp || ''),
        escapeCsv(p.country || ''),
        escapeCsv(p.stateRegion || ''),
        escapeCsv(p.city || ''),
        escapeCsv(p.homeAddress || ''),
        escapeCsv(p.childrenCount || 0),
        escapeCsv(childrenNames),
        escapeCsv(p.isDeleted ? 'Removed' : 'Active'),
        escapeCsv(p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '')
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `koinonia_parents_directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showSuccess('Export Complete', `Exported ${displayParents.length} parent records to CSV.`);
  };

  const isDomReady = typeof document !== 'undefined' && Boolean(document.body);

  // ---- QUICK FAMILY OVERVIEW MODAL ----
  const quickViewModal = (quickViewParent && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setQuickViewParent(null)}
        className="fixed inset-0 bg-black/50 transition-opacity backdrop-blur-2xs"
      />
      <div className="relative bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg w-full max-w-[760px] shadow-xl overflow-hidden text-neutral-900 dark:text-neutral-100 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#EAE8E1] dark:border-[#2A2926] flex items-start justify-between gap-4 bg-white dark:bg-[#1D1D1A] shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            {quickViewParent.photoUrl ? (
              <img
                src={quickViewParent.photoUrl}
                alt={getDisplayName(quickViewParent)}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover border border-[#EAE8E1] dark:border-[#3A3835] shrink-0"
              />
            ) : (
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs uppercase shrink-0 border ${
                quickViewParent.isKoinoniaWorker
                  ? 'bg-[#C59B27]/10 text-[#C59B27] border-[#C59B27]/25'
                  : 'bg-neutral-100 dark:bg-[#262520] text-neutral-600 dark:text-neutral-400 border-[#EAE8E1] dark:border-[#2A2926]'
              }`}>
                {getInitials(getDisplayName(quickViewParent))}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-base text-neutral-900 dark:text-neutral-100 leading-tight truncate">
                {getDisplayName(quickViewParent)}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                {quickViewParent.email || 'No email registered'}
              </p>
              {quickViewParent.accountStatus === 'invitation_pending' && (
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                  Invitation pending{quickViewParent.invitationSentAt ? ` · Last sent: ${new Date(quickViewParent.invitationSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </p>
              )}
              {quickViewParent.accountStatus === 'email_delivery_failed' && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5 truncate font-medium">
                  Invitation email not delivered
                </p>
              )}
              {quickViewParent.isKoinoniaWorker ? (
                <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1 flex items-center gap-1.5 font-normal">
                  <Briefcase className="w-3.5 h-3.5 text-[#C59B27] shrink-0" />
                  <span>Koinonia Worker{quickViewParent.department ? ` · ${quickViewParent.department}` : ''}</span>
                </p>
              ) : (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 font-normal">
                  Registered Parent
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setQuickViewParent(null)}
            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto flex-1 text-xs">
          {/* Core Parent Metadata Row (Replacing the 3 cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 pb-5 border-b border-[#EAE8E1] dark:border-[#2A2926]">
            <div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">Role</span>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {quickViewParent.isKoinoniaWorker ? `Worker (${quickViewParent.department || 'General'})` : 'Regular Parent'}
              </p>
            </div>

            <div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">Phone</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {quickViewParent.phone || 'None'}
                </span>
                {quickViewParent.phone && (
                  <a
                    href={`tel:${quickViewParent.phone}`}
                    className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                    title={`Call ${quickViewParent.phone}`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                )}
                {(quickViewParent.whatsapp || quickViewParent.phone) && (
                  <a
                    href={`https://wa.me/${(quickViewParent.whatsapp || quickViewParent.phone).replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-0.5 text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    title="Open WhatsApp chat"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            <div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">Children</span>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {formatChildrenCount(quickViewParent.childrenCount || quickViewParent.children?.length || 0)}
              </p>
            </div>
          </div>

          {/* Location Section */}
          <div className="space-y-3 pb-5 border-b border-[#EAE8E1] dark:border-[#2A2926]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              <MapPin className="w-3.5 h-3.5 text-[#C59B27]" />
              <span>Location</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 block">City</span>
                <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 mt-0.5 block">
                  {quickViewParent.city || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 block">State / Region</span>
                <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 mt-0.5 block">
                  {quickViewParent.stateRegion || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 block">Country</span>
                <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 mt-0.5 block">
                  {quickViewParent.country || 'Nigeria'}
                </span>
              </div>
            </div>

            {quickViewParent.homeAddress && (
              <div className="pt-1">
                <span className="text-xs text-neutral-500 dark:text-neutral-400 block">Home address</span>
                <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 mt-0.5 leading-relaxed">
                  {quickViewParent.homeAddress}
                </p>
              </div>
            )}
          </div>

          {/* Connected Children Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                <Users className="w-3.5 h-3.5 text-[#C59B27]" />
                <span>Connected children</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-normal">
                  · {formatChildrenCount(quickViewParent.children?.length || 0)}
                </span>
              </div>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-medium">
                {activeEvent?.title || activeEvent?.name || 'Current Event'}
              </span>
            </div>

            {(!quickViewParent.children || quickViewParent.children.length === 0) ? (
              <div className="py-4 text-center text-neutral-400 dark:text-neutral-500 text-xs">
                No children profiles linked to this parent yet.
              </div>
            ) : (
              <div className="divide-y divide-[#EAE8E1] dark:divide-[#2A2926]">
                {quickViewParent.children.map((child: any) => {
                  const status = child.entryStatus || 'not_registered';
                  let statusLabel = 'Not selected';
                  let statusDotClass = 'bg-neutral-400';
                  let statusTextClass = 'text-neutral-500 dark:text-neutral-400';

                  if (status === 'pass_ready') {
                    statusLabel = 'Pass ready';
                    statusDotClass = 'bg-emerald-500';
                    statusTextClass = 'text-emerald-700 dark:text-emerald-400';
                  } else if (status === 'selected') {
                    statusLabel = 'Selected';
                    statusDotClass = 'bg-emerald-500';
                    statusTextClass = 'text-emerald-700 dark:text-emerald-400';
                  } else if (status === 'under_review' || status === 'review_reopened') {
                    statusLabel = 'Awaiting review';
                    statusDotClass = 'bg-amber-500';
                    statusTextClass = 'text-amber-700 dark:text-amber-400';
                  } else if (status === 'checked_in' || status === 'inside') {
                    statusLabel = 'Checked in';
                    statusDotClass = 'bg-sky-500';
                    statusTextClass = 'text-sky-700 dark:text-sky-400';
                  } else if (status === 'picked_up' || status === 'checked_out') {
                    statusLabel = 'Picked up';
                    statusDotClass = 'bg-purple-500';
                    statusTextClass = 'text-purple-700 dark:text-purple-400';
                  } else if (status === 'withdrawn') {
                    statusLabel = 'Withdrawn';
                    statusDotClass = 'bg-rose-500';
                    statusTextClass = 'text-rose-700 dark:text-rose-400';
                  } else if (status === 'waiting_list') {
                    statusLabel = 'Waiting list';
                    statusDotClass = 'bg-amber-500';
                    statusTextClass = 'text-amber-700 dark:text-amber-400';
                  }

                  const isSelecting = submittingModalChildActionId === `${child.id}-select`;
                  const canSelect = !child.entryStatus || child.entryStatus === 'not_registered' || child.entryStatus === 'not_selected' || child.entryStatus === 'incomplete' || child.entryStatus === 'draft' || child.entryStatus === 'waiting_list';
                  const isAwaitingReview = child.entryStatus === 'under_review' || child.entryStatus === 'review_reopened';
                  const isWithdrawn = child.entryStatus === 'withdrawn';

                  return (
                    <div
                      key={child.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 truncate">{child.fullName}</p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                          {child.gender || 'Unknown gender'} · {child.age ? `${child.age} yrs` : 'Age not calculated'}{child.ageGroup ? ` · ${child.ageGroup}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass}`} />
                          <span className={statusTextClass}>{statusLabel}</span>
                        </span>

                        <div className="flex items-center gap-2">
                          {canSelect && (
                            <button
                              type="button"
                              disabled={isSelecting}
                              onClick={() => handleSelectModalChild(child)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-[#C59B27] hover:bg-[#B08921] disabled:opacity-60 rounded-[4px] transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed focus:outline-none"
                            >
                              {isSelecting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              <span>Select for event</span>
                            </button>
                          )}

                          {isAwaitingReview && (
                            <button
                              type="button"
                              onClick={() => handleReviewModalChild(child)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-[#C59B27] hover:bg-[#B08921] rounded-[4px] transition-colors cursor-pointer focus:outline-none"
                            >
                              Review application
                            </button>
                          )}

                          {isWithdrawn && (
                            <button
                              type="button"
                              onClick={() => setModalChildToRestore(child)}
                              className="px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 rounded-[4px] transition-colors cursor-pointer focus:outline-none"
                            >
                              Restore
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleViewModalChild(child)}
                            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors flex items-center gap-1 cursor-pointer py-1 px-1.5"
                            title="View child profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-[#FAF9F6] dark:bg-[#1A1916] border-t border-[#EAE8E1] dark:border-[#2A2926] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                const pid = quickViewParent.id;
                setQuickViewParent(null);
                onNavigate(`/admin/parents/${pid}` as AppRoute);
              }}
              className="text-xs font-medium text-[#C59B27] hover:text-[#B08921] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>View full profile</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            {quickViewParent.canResendInvitation && (
              <button
                type="button"
                onClick={() => setParentToResendInvite(quickViewParent)}
                className="text-xs font-medium text-[#C59B27] hover:text-[#B08921] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Resend invitation</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setQuickViewParent(null)}
            className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-[#262520] rounded-[4px] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const modalChildRestoreModal = (modalChildToRestore && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4">
      <div
        onClick={() => setModalChildToRestore(null)}
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
      />
      <div className="relative bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg w-full max-w-md shadow-xl p-5 text-neutral-900 dark:text-neutral-100 text-left space-y-3">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <h3 className="font-semibold text-sm">Restore Child to Event</h3>
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          Restore <strong>{modalChildToRestore.fullName}</strong> to the event review list for <strong>{activeEvent?.title || activeEvent?.name || 'the current event'}</strong>?
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          <button
            type="button"
            onClick={() => setModalChildToRestore(null)}
            className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-[#262520] rounded-[4px] transition-colors cursor-pointer"
            disabled={restoringModalChild}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRestoreModalChildConfirm}
            className="px-3.5 py-1.5 text-xs rounded-[4px] bg-[#C59B27] hover:bg-[#B08921] text-white font-semibold cursor-pointer disabled:opacity-60 transition-colors"
            disabled={restoringModalChild}
          >
            {restoringModalChild ? (
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                Restoring...
              </span>
            ) : (
              'Restore to Event'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // ---- PORTAL MODALS ----
  const removeModal = (parentToRemove && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setParentToRemove(null)}
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl w-full max-w-md shadow-xl p-5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2.5 mb-3 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-sm">
            Remove this parent?
          </h4>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
          Their account will move to Removed and can be restored later. Linked children records remain safe.
        </p>
        <form onSubmit={handleRemoveParentSubmit} className="space-y-3.5">
          <div>
            <label className="text-neutral-500 dark:text-neutral-400 text-[10px] font-semibold uppercase tracking-wider block mb-1">
              Reason for removal (optional)
            </label>
            <textarea
              placeholder="State a reason for your records..."
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] focus:outline-none focus:border-red-400 bg-neutral-50 dark:bg-[#20201E] resize-none text-neutral-800 dark:text-neutral-200"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
            <Button
              type="button"
              onClick={() => setParentToRemove(null)}
              variant="secondary"
              className="px-3.5 py-1.5 text-xs rounded-md"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submittingRemove}
              disabled={submittingRemove}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-xs font-semibold rounded-md focus:outline-none"
            >
              Remove parent
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  const restoreModal = (parentToRestore && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setParentToRestore(null)}
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl w-full max-w-md shadow-xl p-5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 mb-3">
          <RotateCcw className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-sm">
            Restore this parent?
          </h4>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
          This parent will be restored and will appear under Active parents again.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          <Button
            onClick={() => setParentToRestore(null)}
            variant="secondary"
            className="px-3.5 py-1.5 text-xs rounded-md"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRestoreParentSubmit}
            loading={submittingRestore}
            disabled={submittingRestore}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs font-semibold rounded-md focus:outline-none"
          >
            Restore parent
          </Button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const permanentDeleteModal = (parentToDelete && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 font-sans" id="confirm-single-parent-delete-modal">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
        onClick={() => !submittingDelete && setParentToDelete(null)}
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-red-200 dark:border-red-900/40 rounded-xl w-full max-w-md p-5 shadow-xl space-y-3.5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Trash2 className="w-5 h-5 shrink-0" />
          <h3 className="font-semibold text-sm">
            Delete {getDisplayName(parentToDelete)} permanently?
          </h3>
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          Permanently delete this account? This will revoke access and release the email address so it may be used for another account. This action cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          <Button
            type="button"
            onClick={() => setParentToDelete(null)}
            variant="secondary"
            disabled={submittingDelete}
            className="px-3.5 py-1.5 text-xs rounded-md"
          >
            Cancel
          </Button>
          <button
            type="button"
            onClick={() => handlePermanentDeleteSubmit()}
            disabled={submittingDelete}
            className="px-4 py-1.5 text-xs font-semibold rounded-md bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
            id="confirm-single-parent-delete-btn"
          >
            {submittingDelete ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const bulkRemoveModal = (showBulkRemoveModal && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => setShowBulkRemoveModal(false)}
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl w-full max-w-md shadow-xl p-5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400 mb-3">
          <Trash2 className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-sm">
            Remove {selectedParentIds.length} parents?
          </h4>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3 leading-relaxed">
          These parents will be moved to the Removed tab. All linked children and attendance records will be safely preserved.
        </p>
        <form onSubmit={handleBulkRemoveSubmit} className="space-y-3.5">
          <div>
            <label className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider block mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              value={bulkRemoveReason}
              onChange={(e) => setBulkRemoveReason(e.target.value)}
              placeholder="e.g., Requested account closure"
              className="w-full px-3 py-1.5 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-white dark:bg-[#20201E] focus:outline-none focus:border-[#C59B27] text-neutral-800 dark:text-neutral-200"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
            <Button
              type="button"
              onClick={() => setShowBulkRemoveModal(false)}
              variant="secondary"
              disabled={submittingBulkRemove}
              className="px-3.5 py-1.5 text-xs rounded-md"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submittingBulkRemove}
              disabled={submittingBulkRemove}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 text-xs font-semibold rounded-md focus:outline-none"
            >
              Remove parents
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  const bulkRestoreModal = (showBulkRestoreModal && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => !submittingBulkRestore && setShowBulkRestoreModal(false)}
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-xl w-full max-w-md shadow-xl p-5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 mb-3">
          <RotateCcw className="w-5 h-5 shrink-0" />
          <h4 className="font-semibold text-sm">
            Restore {selectedParentIds.length} parents?
          </h4>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
          These parent profiles will be restored and will appear under Active parents again.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          <Button
            type="button"
            onClick={() => setShowBulkRestoreModal(false)}
            variant="secondary"
            disabled={submittingBulkRestore}
            className="px-3.5 py-1.5 text-xs rounded-md"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleBulkRestoreSubmit}
            loading={submittingBulkRestore}
            disabled={submittingBulkRestore}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs font-semibold rounded-md focus:outline-none"
          >
            Restore parents
          </Button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const bulkPurgeModal = (showBulkPurgeModal && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 font-sans">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
        onClick={() => !submittingBulkPurge && setShowBulkPurgeModal(false)}
      />
      <div className="relative bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-red-200 dark:border-red-900/40 rounded-xl w-full max-w-md p-5 shadow-xl space-y-3.5 text-neutral-900 dark:text-neutral-100">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Trash2 className="w-5 h-5 shrink-0" />
          <h3 className="font-semibold text-sm">
            Permanently delete {selectedParentIds.length} parents?
          </h3>
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          Type <strong>DELETE</strong> below to confirm. This action cannot be reversed.
        </p>
        <input
          type="text"
          value={bulkPurgeConfirmText}
          onChange={(e) => setBulkPurgeConfirmText(e.target.value)}
          placeholder="Type DELETE to confirm"
          className="w-full px-3 py-1.5 text-xs rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-[#20201E] focus:outline-none focus:border-red-500 text-neutral-800 dark:text-neutral-200"
        />
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          <Button
            type="button"
            onClick={() => setShowBulkPurgeModal(false)}
            variant="secondary"
            disabled={submittingBulkPurge}
            className="px-3.5 py-1.5 text-xs rounded-md"
          >
            Cancel
          </Button>
          <button
            type="button"
            onClick={() => handleBulkPurge()}
            disabled={submittingBulkPurge || bulkPurgeConfirmText !== 'DELETE'}
            className="px-4 py-1.5 text-xs font-semibold rounded-md bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
          >
            {submittingBulkPurge ? 'Deleting…' : 'Confirm purge'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const customAmountModal = showCustomAmountModal ? createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg shadow-xl max-w-sm w-full p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Select number of parents
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Enter how many parent records to select from the {displayParents.length} filtered results.
          </p>
        </div>

        <form onSubmit={handleCustomAmountSubmit} className="space-y-3">
          <div>
            <input
              type="number"
              min="1"
              max={displayParents.length}
              value={customAmountValue}
              onChange={handleCustomAmountChange}
              autoFocus
              className={`w-full px-3 py-2 text-sm rounded border focus:outline-none transition-colors dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 ${
                customAmountError
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-[#EAE8E1] dark:border-[#2A2926] focus:border-[#C59B27]'
              }`}
              placeholder={`1 - ${displayParents.length}`}
            />
            {customAmountError && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-medium">
                {customAmountError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowCustomAmountModal(false);
                setCustomAmountError('');
              }}
              className="text-xs px-3 py-1.5 rounded"
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={!isCustomAmountValid}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#C59B27] hover:bg-[#B08921] disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors shadow-xs cursor-pointer"
            >
              {isCustomAmountValid ? `Select ${parsedCustomAmount}` : 'Select'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  const confirmSelectAllModal = showConfirmSelectAllModal ? createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg shadow-xl max-w-sm w-full p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Select all {displayParents.length} parents?
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5">
            This will select all records matching the current filters.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowConfirmSelectAllModal(false)}
            className="text-xs px-3 py-1.5 rounded"
          >
            Cancel
          </Button>
          <button
            type="button"
            onClick={handleConfirmSelectAll}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#C59B27] hover:bg-[#B08921] rounded transition-colors shadow-xs cursor-pointer"
          >
            Select all {displayParents.length}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const resendInviteModal = (parentToResendInvite && isDomReady) ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        onClick={() => !resendingInvite && setParentToResendInvite(null)}
        className="fixed inset-0 bg-black/50 transition-opacity backdrop-blur-2xs"
      />
      <div className="relative bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg w-full max-w-md shadow-xl p-6 text-neutral-900 dark:text-neutral-100 text-left space-y-4">
        <div>
          <h3 className="font-semibold text-base text-neutral-900 dark:text-neutral-100">
            Resend invitation to {parentToResendInvite.email}?
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 leading-relaxed">
            A new invitation link will be created and the previous unused link will stop working.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setParentToResendInvite(null)}
            disabled={resendingInvite}
            className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#262520] rounded-[4px] transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleResendInviteConfirm}
            disabled={resendingInvite}
            className="px-3.5 py-1.5 text-xs font-medium bg-[#C59B27] hover:bg-[#B08921] text-white rounded-[4px] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {resendingInvite ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Resending...</span>
              </>
            ) : (
              <span>Resend invitation</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div
      className="space-y-6"
      data-view-version="admin-parents-enhanced-directory"
      id="admin-parents-module-root"
    >
      {/* Portal modals */}
      {removeModal}
      {restoreModal}
      {permanentDeleteModal}
      {bulkRemoveModal}
      {bulkRestoreModal}
      {bulkPurgeModal}
      {customAmountModal}
      {confirmSelectAllModal}
      {quickViewModal}
      {resendInviteModal}
      {reviewingChild && (
        <ChildReviewModal
          isOpen={Boolean(reviewingChild)}
          applicationId={reviewingChild.applicationId || reviewingChild.id}
          childId={reviewingChild.id}
          childName={reviewingChild.fullName}
          activeEvent={activeEvent}
          onClose={() => {
            setReviewingChild(null);
            setReviewSequenceList([]);
            setReviewSequenceIndex(0);
          }}
          onStatusUpdated={handleStatusUpdatedFromReviewModal}
          onNavigateToChild={(cid) => {
            setQuickViewParent(null);
            setReviewingChild(null);
            setReviewSequenceList([]);
            onNavigate(`/admin/children/${cid}` as AppRoute);
          }}
          adminUser={adminUser}
          isSuperAdmin={isSuperAdmin}
          sequenceIndex={reviewSequenceList.length > 1 ? reviewSequenceIndex : undefined}
          totalSequence={reviewSequenceList.length > 1 ? reviewSequenceList.length : undefined}
          onNext={() => {
            if (reviewSequenceIndex < reviewSequenceList.length - 1) {
              const nextIdx = reviewSequenceIndex + 1;
              setReviewSequenceIndex(nextIdx);
              setReviewingChild(reviewSequenceList[nextIdx]);
            }
          }}
          onPrevious={() => {
            if (reviewSequenceIndex > 0) {
              const prevIdx = reviewSequenceIndex - 1;
              setReviewSequenceIndex(prevIdx);
              setReviewingChild(reviewSequenceList[prevIdx]);
            }
          }}
        />
      )}
      {bulkChildActionType && (
        <BulkChildEventActionModal
          isOpen={Boolean(bulkChildActionType)}
          onClose={() => setBulkChildActionType(null)}
          actionType={bulkChildActionType}
          activeEvent={activeEvent}
          selectedParents={selectedParentsList}
          allChildren={allConnectedChildren}
          onSuccess={handleBulkChildActionSuccess}
          onStartReviewSequence={(chosen) => {
            handleStartReviewSequence(chosen);
          }}
        />
      )}
      {modalChildRestoreModal}

      {/* 1. Header with title and actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#EAE8E1] dark:border-[#2A2926]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Parents & Workers
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            View and manage registered parents, Koinonia workers, locations and linked children.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={handleExportCSV}
            variant="secondary"
            className="text-xs px-3.5 py-1.5 flex items-center gap-1.5 shrink-0 rounded-md shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
            <span>Export CSV</span>
          </Button>
          <Button
            onClick={() => setShowAddParentModal(true)}
            variant="primary"
            className="text-xs px-3.5 py-1.5 flex items-center gap-1.5 shrink-0 rounded-md shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add parent</span>
          </Button>
        </div>
      </div>

      {/* 2. Unified Flat Directory Summary Strip */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg shadow-2xs overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-[#EAE8E1] dark:divide-[#2A2926]">
          {/* 1. Total Parents */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Total Parents</span>
              <Users className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{stats.parents}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Profiles in view</div>
            </div>
          </div>

          {/* 2. Koinonia Workers */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Koinonia Workers</span>
              <Briefcase className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-[#C59B27]">{stats.teamMembers}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Ministry team</div>
            </div>
          </div>

          {/* 3. Regular Parents */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Regular Parents</span>
              <HeartHandshake className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{stats.regularParents}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Non-worker guardians</div>
            </div>
          </div>

          {/* 4. Children Linked */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Children Linked</span>
              <Users className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{stats.childrenLinked}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Connected family</div>
            </div>
          </div>

          {/* 5. Locations / Cities */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">Locations / Cities</span>
              <MapPin className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{stats.locationsCount}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Regions represented</div>
            </div>
          </div>

          {/* 6. WhatsApp Ready */}
          <div className="p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1">
              <span className="text-[11px] font-medium uppercase tracking-wider">WhatsApp Ready</span>
              <MessageSquare className="w-4 h-4 text-[#C59B27]" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{stats.whatsAppOptedIn}</div>
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Verified & opted in</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Status Tabs (Active vs Removed) */}
      <div className="flex items-center justify-between border-b border-[#EAE8E1] dark:border-[#2A2926]" id="parents-directory-tabs">
        <div className="flex gap-6">
          <button
            onClick={() => handleTabChange('active')}
            className={`pb-2.5 text-xs font-medium transition-colors border-b-2 cursor-pointer focus:outline-none flex items-center gap-1.5 ${
              activeTab === 'active'
                ? 'border-[#C59B27] text-neutral-950 dark:text-neutral-100 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
            id="tab-active-parents"
          >
            <span>Active Accounts</span>
            {activeTab === 'active' && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27]" />
            )}
          </button>
          <button
            onClick={() => handleTabChange('removed')}
            className={`pb-2.5 text-xs font-medium transition-colors border-b-2 cursor-pointer focus:outline-none flex items-center gap-1.5 ${
              activeTab === 'removed'
                ? 'border-[#C59B27] text-neutral-950 dark:text-neutral-100 font-semibold'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
            id="tab-removed-parents"
          >
            <span>Removed & Archived</span>
          </button>
        </div>

        {activeFiltersCount > 0 && (
          <button
            onClick={handleResetFilters}
            className="pb-2.5 text-xs text-[#C59B27] hover:underline cursor-pointer flex items-center gap-1 focus:outline-none font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''}</span>
          </button>
        )}
      </div>

      {/* 4. Single Unified Search & Filter Toolbar */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg p-3 sm:p-3.5 shadow-2xs space-y-3">
        {/* Top: Search + Restrained Worker Segment */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by parent name, phone, email, city, state, address, or child name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-8 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6]/50 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Role Segment Toggle (Restrained, not large pills) */}
          <div className="inline-flex p-0.5 rounded-md bg-neutral-100/80 dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#2A2926] shrink-0 h-9 items-center">
            <button
              onClick={() => setWorkerFilter('all')}
              className={`h-full px-3 text-xs rounded transition-all cursor-pointer font-medium ${
                workerFilter === 'all'
                  ? 'bg-white dark:bg-[#2A2926] text-neutral-950 dark:text-neutral-100 font-semibold shadow-2xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              All Members
            </button>
            <button
              onClick={() => setWorkerFilter('worker')}
              className={`h-full px-3 text-xs rounded transition-all cursor-pointer flex items-center gap-1.5 font-medium ${
                workerFilter === 'worker'
                  ? 'bg-[#C59B27] text-white font-semibold shadow-2xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Briefcase className="w-3 h-3" />
              <span>Koinonia Workers</span>
            </button>
            <button
              onClick={() => setWorkerFilter('non_worker')}
              className={`h-full px-3 text-xs rounded transition-all cursor-pointer font-medium ${
                workerFilter === 'non_worker'
                  ? 'bg-white dark:bg-[#2A2926] text-neutral-950 dark:text-neutral-100 font-semibold shadow-2xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Regular Parents
            </button>
          </div>
        </div>

        {/* Detailed Geographical & Status Selectors */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 pt-2 border-t border-[#EAE8E1] dark:border-[#2A2926]">
          {/* Department Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              Department
            </label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All Departments</option>
              {filterOptions.departments.map(d => (
                <option key={d.department} value={d.department}>
                  {d.department} ({d.count})
                </option>
              ))}
            </select>
          </div>

          {/* Country Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              Country
            </label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All Countries</option>
              {filterOptions.countries.map(c => (
                <option key={c.country} value={c.country}>
                  {c.country} ({c.count})
                </option>
              ))}
            </select>
          </div>

          {/* State / Region Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              State / Region
            </label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All States / Regions</option>
              {filterOptions.states.map(s => (
                <option key={s.state_region} value={s.state_region}>
                  {s.state_region} ({s.count})
                </option>
              ))}
            </select>
          </div>

          {/* City Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              City
            </label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All Cities</option>
              {filterOptions.cities.map(c => (
                <option key={c.city} value={c.city}>
                  {c.city} ({c.count})
                </option>
              ))}
            </select>
          </div>

          {/* Children Connected Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              Children Status
            </label>
            <select
              value={hasChildrenFilter}
              onChange={(e) => setHasChildrenFilter(e.target.value as ChildrenFilterType)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All Parents</option>
              <option value="has_children">Has Children Linked</option>
              <option value="no_children">No Children Linked</option>
            </select>
          </div>

          {/* Age / Age Group Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              Age / Age Group
            </label>
            <select
              value={selectedAgeGroup}
              onChange={(e) => setSelectedAgeGroup(e.target.value)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
              id="admin-parents-age-filter"
            >
              <option value="all">All Age Groups</option>
              {availableAgeGroups.map(ag => (
                <option key={ag.id} value={ag.id}>
                  {ag.label}
                </option>
              ))}
            </select>
          </div>

          {/* Location Details Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
              Location Data
            </label>
            <select
              value={hasLocationFilter}
              onChange={(e) => setHasLocationFilter(e.target.value as LocationFilterType)}
              className="w-full h-8 px-2 text-xs rounded-md border border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6]/40 dark:bg-[#20201E] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-[#C59B27] cursor-pointer"
            >
              <option value="all">All Records</option>
              <option value="has_location">Has Address / Location</option>
              <option value="missing_location">Missing Location Info</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contextual Action Bar when rows are selected */}
      {selectedParentIds.length > 0 && (
        <div className="bg-[#FAF8F2] dark:bg-[#20201E] border border-[#EAE8E1] dark:border-[#2A2926] rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs animate-fade-in">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-[#C59B27]" />
            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              {selectedParentIds.length} {selectedParentIds.length === 1 ? 'parent selected' : 'parents selected'}
              <span className="text-neutral-400 dark:text-neutral-500 font-normal"> · </span>
              <span className="text-neutral-600 dark:text-neutral-300 font-medium">
                {allConnectedChildren.length} {allConnectedChildren.length === 1 ? 'child' : 'children'}
              </span>
            </span>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 hidden sm:inline">
              ({selectedParentIds.length} of {displayParents.length} filtered {displayParents.length === 1 ? 'parent' : 'parents'})
            </span>
          </div>

          <div className="flex items-center gap-2 relative flex-wrap">
            {/* Change selection scope control */}
            <div className="relative" ref={toolbarScopeMenuRef}>
              <button
                type="button"
                id="parents-toolbar-change-selection-btn"
                onClick={() => setToolbarScopeMenuOpen(!toolbarScopeMenuOpen)}
                className="px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-white dark:bg-[#282724] border border-[#EAE8E1] dark:border-[#383632] rounded hover:border-neutral-300 transition-colors flex items-center gap-1 cursor-pointer focus:outline-none"
              >
                <span>Change selection</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${toolbarScopeMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {toolbarScopeMenuOpen && renderSelectionScopeDropdown(() => setToolbarScopeMenuOpen(false), "left-0 sm:right-0 sm:left-auto top-full mt-1.5")}
            </div>

            {/* Restrained Event actions dropdown */}
            {activeTab === 'active' && (
              <div className="relative" ref={eventActionsRef}>
                <button
                  type="button"
                  id="parents-bulk-event-actions-btn"
                  onClick={() => setEventActionsDropdownOpen(!eventActionsDropdownOpen)}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[#C59B27] hover:bg-[#B08921] rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs focus:outline-none"
                >
                  <span>Event actions</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${eventActionsDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {eventActionsDropdownOpen && (
                  <div 
                    id="parents-bulk-event-actions-menu"
                    className="absolute right-0 top-full mt-1.5 w-64 bg-white dark:bg-[#1E1E1C] border border-[#EAE8E1] dark:border-[#2E2C28] rounded-xl shadow-xl z-50 py-1.5 text-xs animate-scale-in"
                  >
                    <div className="px-3 py-1.5 border-b border-[#EAE8E1] dark:border-[#2E2C28] text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center justify-between">
                      <span>Connected Children</span>
                      <span className="font-bold text-neutral-700 dark:text-neutral-300">{allConnectedChildren.length}</span>
                    </div>

                    <button
                      type="button"
                      disabled={applicableCounts.selectForEvent === 0}
                      onClick={() => {
                        setEventActionsDropdownOpen(false);
                        setBulkChildActionType('select_for_event');
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-[#262522] text-neutral-800 dark:text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left transition-colors"
                    >
                      <span>Select for event</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40">
                        {applicableCounts.selectForEvent}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={applicableCounts.reviewSelected === 0}
                      onClick={() => {
                        setEventActionsDropdownOpen(false);
                        setBulkChildActionType('review_sequence');
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-[#262522] text-neutral-800 dark:text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left transition-colors"
                    >
                      <span>Review selected</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40">
                        {applicableCounts.reviewSelected}
                      </span>
                    </button>

                    <div className="my-1 border-t border-[#EAE8E1] dark:border-[#2E2C28]" />

                    <button
                      type="button"
                      disabled={applicableCounts.approve === 0}
                      onClick={() => {
                        setEventActionsDropdownOpen(false);
                        setBulkChildActionType('approve');
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-[#262522] text-neutral-800 dark:text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left transition-colors"
                    >
                      <span>Approve</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
                        {applicableCounts.approve}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={applicableCounts.waitlist === 0}
                      onClick={() => {
                        setEventActionsDropdownOpen(false);
                        setBulkChildActionType('waitlist');
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-[#262522] text-neutral-800 dark:text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left transition-colors"
                    >
                      <span>Move to waiting list</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40">
                        {applicableCounts.waitlist}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={applicableCounts.notSelected === 0}
                      onClick={() => {
                        setEventActionsDropdownOpen(false);
                        setBulkChildActionType('not_selected');
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-[#262522] text-neutral-800 dark:text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left transition-colors"
                    >
                      <span>Mark as not selected</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        {applicableCounts.notSelected}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={applicableCounts.returnDraft === 0}
                      onClick={() => {
                        setEventActionsDropdownOpen(false);
                        setBulkChildActionType('return_draft');
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-[#262522] text-neutral-800 dark:text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left transition-colors"
                    >
                      <span>Return to Parent</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40">
                        {applicableCounts.returnDraft}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={applicableCounts.restore === 0}
                      onClick={() => {
                        setEventActionsDropdownOpen(false);
                        setBulkChildActionType('restore');
                      }}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-[#262522] text-neutral-800 dark:text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left transition-colors"
                    >
                      <span>Restore</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
                        {applicableCounts.restore}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Parent account management remains separate */}
            {activeTab === 'active' ? (
              <button
                onClick={() => setShowBulkRemoveModal(true)}
                className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 rounded transition-colors cursor-pointer"
              >
                Remove selected
              </button>
            ) : (
              <button
                onClick={() => setShowBulkRestoreModal(true)}
                className="px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 rounded transition-colors cursor-pointer"
              >
                Restore selected
              </button>
            )}

            {isSuperAdmin && activeTab === 'removed' && (
              <button
                onClick={() => {
                  setBulkPurgeConfirmText('');
                  setShowBulkPurgeModal(true);
                }}
                className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-100/70 dark:bg-red-950/60 hover:bg-red-200 dark:hover:bg-red-900/60 rounded transition-colors cursor-pointer"
              >
                Permanently delete
              </button>
            )}

            <button
              onClick={() => setSelectedParentIds([])}
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 px-2 py-1.5 transition-colors cursor-pointer"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* 5. Comprehensive Parents & Workers Table */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-lg overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12">
            <KoinoniaInlineLoader
              variant="skeleton"
              size="lg"
              label="Loading parent and worker profiles..."
              centered
            />
          </div>
        ) : displayParents.length === 0 ? (
          <div className="text-center py-16 text-neutral-400 dark:text-neutral-500 space-y-3">
            <Users className="w-8 h-8 stroke-[1.5] mx-auto text-neutral-300 dark:text-neutral-600" />
            <div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 font-semibold">
                {activeTab === 'active' ? 'No parents match the selected criteria.' : 'No removed parents found.'}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                Try adjusting your search query, location filters, or worker status pills.
              </p>
            </div>
            {activeFiltersCount > 0 && (
              <Button
                onClick={handleResetFilters}
                variant="secondary"
                className="text-xs px-3.5 py-1.5 mx-auto mt-2 rounded-md"
              >
                Clear all filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#FAF9F6] dark:bg-[#20201E] border-b border-[#EAE8E1] dark:border-[#2A2926] text-neutral-500 dark:text-neutral-400">
                  <th className="py-3 px-3 pl-4 w-12 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <AdminSelectionCheckbox
                        checked={isAllVisibleSelected}
                        indeterminate={isIndeterminate}
                        onChange={handleToggleSelectVisible}
                        ariaLabel="Select visible parents"
                      />
                      <div className="relative" ref={headerScopeMenuRef}>
                        <button
                          type="button"
                          id="parents-header-scope-menu-btn"
                          onClick={() => setHeaderScopeMenuOpen(!headerScopeMenuOpen)}
                          className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded transition-colors focus:outline-none cursor-pointer"
                          title="Selection options"
                          aria-label="Selection options"
                          aria-expanded={headerScopeMenuOpen}
                        >
                          <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${headerScopeMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {headerScopeMenuOpen && renderSelectionScopeDropdown(() => setHeaderScopeMenuOpen(false), "left-0 top-full mt-1.5")}
                      </div>
                    </div>
                  </th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Parent Profile</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Worker Status</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Origin & Location</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">Connected Children</th>
                  <th className="py-3 px-4 text-[11px] font-semibold tracking-wider uppercase">WhatsApp</th>
                  <th className="py-3 px-4 pr-6 text-right text-[11px] font-semibold tracking-wider uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8E1] dark:divide-[#2A2926]">
                {visibleParents.map((p) => {
                  const displayName = getDisplayName(p);
                  const isRemoved = p.isDeleted || activeTab === 'removed';
                  const isSelected = selectedParentIds.includes(String(p.id));

                  const hasLocationData = Boolean(p.city || p.stateRegion || p.country || p.homeAddress);

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-[#FAF8F2] dark:bg-[#20201E]'
                          : 'hover:bg-neutral-50/70 dark:hover:bg-[#22211E]'
                      }`}
                      data-parent-row-id={p.id}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 pl-4 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                        <AdminSelectionCheckbox
                          checked={isSelected}
                          onChange={() => handleToggleSelectParent(String(p.id))}
                          ariaLabel={`Select ${displayName}`}
                        />
                      </td>

                      {/* Parent Profile */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {p.photoUrl ? (
                            <img
                              src={p.photoUrl}
                              alt={displayName}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-full object-cover border border-[#EAE8E1] dark:border-[#3A3835] shrink-0"
                            />
                          ) : (
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs uppercase shrink-0 border ${
                              p.isKoinoniaWorker
                                ? 'bg-[#C59B27]/10 text-[#C59B27] border-[#C59B27]/30'
                                : 'bg-[#FAF9F6] dark:bg-[#20201E] text-neutral-600 dark:text-neutral-400 border-[#EAE8E1] dark:border-[#2A2926]'
                            }`}>
                              {getInitials(displayName)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span 
                              onClick={() => setQuickViewParent(p)}
                              className="font-semibold text-neutral-900 dark:text-neutral-100 block text-xs leading-tight hover:text-[#C59B27] cursor-pointer truncate"
                              title="Click for quick family overview"
                            >
                              {displayName}
                            </span>
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block truncate mt-0.5">
                              {p.email || 'No email registered'}
                            </span>
                            {p.accountStatus === 'invitation_pending' && (
                              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block truncate">
                                Invitation pending{p.invitationSentAt ? ` · Last sent: ${new Date(p.invitationSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                              </span>
                            )}
                            {p.accountStatus === 'email_delivery_failed' && (
                              <span className="text-[10px] text-rose-600 dark:text-rose-400 block truncate font-medium">
                                Invitation email not delivered
                              </span>
                            )}
                            {p.phone && (
                              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block truncate">
                                📞 {p.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Worker / Ministry Role Status */}
                      <td className="py-3 px-4">
                        {p.isKoinoniaWorker ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C59B27]">
                              <Briefcase className="w-3.5 h-3.5" />
                              <span>Koinonia Worker</span>
                            </span>
                            {p.department && (
                              <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
                                {p.department}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-normal">
                            Parent
                          </span>
                        )}
                      </td>

                      {/* Geographic Origin & Residence */}
                      <td className="py-3 px-4 max-w-xs">
                        {hasLocationData ? (
                          <div className="space-y-0.5">
                            <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                              {p.city ? p.city : (p.stateRegion || 'Nigeria')}
                              {p.stateRegion && p.city ? ` · ${p.stateRegion}` : ''}
                              {p.country ? `, ${p.country}` : ''}
                            </div>
                            {p.homeAddress && (
                              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate flex items-center gap-1" title={p.homeAddress}>
                                <Home className="w-3 h-3 text-neutral-400 shrink-0" />
                                <span className="truncate">{p.homeAddress}</span>
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-500 italic text-[11px]">
                            Location not provided
                          </span>
                        )}
                      </td>

                      {/* Connected Children */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-xs block">
                            {formatChildrenCount(Number(p.childrenCount || 0))}
                          </span>
                          {p.children && p.children.length > 0 && (
                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-xs" title={p.children.map((c: any) => c.fullName).join(', ')}>
                              {p.children.map((c: any) => `${c.fullName?.split(' ')[0] || 'Child'}${c.age ? ` (${c.age}y)` : ''}`).join(', ')}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* WhatsApp Readiness */}
                      <td className="py-3 px-4">
                        {p.whatsappConsentStatus === 'opted_in' ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <span>Opted in</span>
                          </span>
                        ) : p.whatsapp ? (
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
                            Provided
                          </span>
                        ) : (
                          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 italic">
                            None
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 pr-6 text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setQuickViewParent(p)}
                            className="p-1.5 text-neutral-400 hover:text-neutral-800 dark:text-neutral-500 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#20201E] rounded transition-colors cursor-pointer"
                            title="Quick preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onNavigate(`/admin/parents/${p.id}` as AppRoute)}
                            className="px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white bg-white dark:bg-[#20201E] hover:bg-neutral-50 dark:hover:bg-neutral-800 border border-[#EAE8E1] dark:border-[#2A2926] rounded transition-colors cursor-pointer focus:outline-none"
                          >
                            Profile
                          </button>

                          {/* Overflow Menu */}
                          <div className="relative inline-block text-left" ref={openActionMenuId === p.id ? actionMenuRef : undefined}>
                            <button
                              onClick={() => setOpenActionMenuId(openActionMenuId === p.id ? null : p.id)}
                              className="p-1.5 text-neutral-400 hover:text-neutral-800 dark:text-neutral-500 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#20201E] rounded transition-colors cursor-pointer focus:outline-none"
                              aria-label="More options"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>

                            {openActionMenuId === p.id && (
                              <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded-md shadow-lg py-1 z-30 text-left">
                                <button
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    setQuickViewParent(p);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#242320] flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5 text-neutral-400" />
                                  <span>Quick family view</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onNavigate(`/admin/parents/${p.id}` as AppRoute);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#242320] flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Users className="w-3.5 h-3.5 text-neutral-400" />
                                  <span>View full details</span>
                                </button>

                                {p.canResendInvitation && (
                                  <button
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      setParentToResendInvite(p);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-[#C59B27] hover:bg-[#C59B27]/10 flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    <Mail className="w-3.5 h-3.5 text-[#C59B27]" />
                                    <span>Resend invitation</span>
                                  </button>
                                )}

                                <div className="h-px bg-[#EAE8E1] dark:bg-[#2A2926] my-1" />

                                {!isRemoved ? (
                                  <button
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      setParentToRemove(p);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Remove parent</span>
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setOpenActionMenuId(null);
                                        setParentToRestore(p);
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center gap-2 transition-colors cursor-pointer"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      <span>Restore parent</span>
                                    </button>
                                    {isSuperAdmin && (
                                      <>
                                        <div className="h-px bg-[#EAE8E1] dark:bg-[#2A2926] my-1" />
                                        <button
                                          onClick={() => {
                                            setOpenActionMenuId(null);
                                            setParentToDelete(p);
                                            setDeleteConfirmationText('');
                                          }}
                                          className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 transition-colors cursor-pointer"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Delete permanently</span>
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {displayParents.length > 0 && (
          <div className="px-4 py-3 border-t border-[#EAE8E1] dark:border-[#2A2926] bg-[#FAF9F6] dark:bg-[#20201E] flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-600 dark:text-neutral-400">
            <div className="flex items-center gap-2">
              <span>
                Showing <span className="font-semibold text-neutral-900 dark:text-neutral-100">{startIndex + 1}</span> to <span className="font-semibold text-neutral-900 dark:text-neutral-100">{Math.min(endIndex, displayParents.length)}</span> of <span className="font-semibold text-neutral-900 dark:text-neutral-100">{displayParents.length}</span> parents
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-neutral-500">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#2A2926] rounded px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-[#C59B27] cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-2.5 py-1 rounded border border-[#EAE8E1] dark:border-[#2A2926] bg-white dark:bg-[#1D1D1A] text-neutral-700 dark:text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-[#262522] transition-colors cursor-pointer"
                >
                  Previous
                </button>
                <span className="px-2 py-1 text-neutral-500 text-[11px]">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="px-2.5 py-1 rounded border border-[#EAE8E1] dark:border-[#2A2926] bg-white dark:bg-[#1D1D1A] text-neutral-700 dark:text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 dark:hover:bg-[#262522] transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Parent Modal */}
      <AddParentModal
        isOpen={showAddParentModal}
        onClose={() => setShowAddParentModal(false)}
        onSuccess={() => fetchParents()}
      />
    </div>
  );
};

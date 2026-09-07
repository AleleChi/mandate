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
  Loader2
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AdminReviewChildView } from './AdminReviewChildView';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // View states
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  
  // Search and Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'oldest' | 'newest'>('oldest');
  
  // Filter States
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [flagFilter, setFlagFilter] = useState<string>('all');
  const [workerFilter, setWorkerFilter] = useState<string>('all');
  
  // Mobile sheet drawer filters open
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [bulkDecision, setBulkDecision] = useState<'selected' | 'waiting_list' | 'not_selected' | 'under_review'>('selected');
  const [bulkNote, setBulkNote] = useState('');
  const isFetchingRef = useRef(false);

  const fetchApplications = async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await api.admin.getApplications();
      if (res.success) {
        setApplications(res.applications || []);
      }
    } catch (err: any) {
      console.error('[AdminReviewBoardView - fetchApplications Error]:', err);
      const parsed = extractApiError(err);
      showError('Fetch Failed', parsed.message || 'Could not load registration records.');
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
      const isBelowAge = (app.child?.age !== undefined && app.child?.age !== null) ? app.child.age < 1 : false;
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

      // Attention condition: age review, medical/support notes, or missing required photos
      if (app.flags.belowAge || app.flags.medicalNotes || app.flags.extraSupport || app.flags.missingChildPhoto || app.flags.missingPickupPhoto) {
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

  // Capacity Limits and real progress values
  const capacityStats = useMemo(() => {
    const limits = {
      under1: 10,
      toddler: 30,
      preschool: 40,
      primary: 50,
      preteen: 40
    };

    const counts = {
      under1: 0,
      toddler: 0,
      preschool: 0,
      primary: 0,
      preteen: 0
    };

    enrichedApplications.forEach(app => {
      const isSelected = app.status === 'selected' || app.status === 'pass_ready' || app.status === 'checked_in' || app.status === 'picked_up';
      if (!isSelected) return;

      const age = app.child?.age;
      if (age < 1) {
        counts.under1++;
      } else if (age >= 1 && age <= 3) {
        counts.toddler++;
      } else if (age >= 4 && age <= 6) {
        counts.preschool++;
      } else if (age >= 7 && age <= 9) {
        counts.primary++;
      } else if (age >= 10 && age <= 12) {
        counts.preteen++;
      }
    });

    return [
      { id: 'under1', label: 'Under 1 year', current: counts.under1, limit: limits.under1 },
      { id: 'toddler', label: 'Toddlers (ages 1–3)', current: counts.toddler, limit: limits.toddler },
      { id: 'preschool', label: 'Pre-school (ages 4–6)', current: counts.preschool, limit: limits.preschool },
      { id: 'primary', label: 'Primary (ages 7–9)', current: counts.primary, limit: limits.primary },
      { id: 'preteen', label: 'Pre-teens (ages 10–12)', current: counts.preteen, limit: limits.preteen }
    ];
  }, [enrichedApplications]);

  // Filter application list based on search and selected filter values
  const filteredApplications = useMemo(() => {
    let list = [...enrichedApplications];

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'under_review') {
        list = list.filter(app => app.status === 'under_review' || app.status === 'review_reopened');
      } else if (statusFilter === 'selected') {
        list = list.filter(app => ['selected', 'pass_ready', 'checked_in', 'picked_up'].includes(app.status));
      } else {
        list = list.filter(app => app.status === statusFilter);
      }
    }

    // Flag filters
    if (flagFilter !== 'all') {
      if (flagFilter === 'below_age') {
        list = list.filter(app => app.flags.belowAge);
      } else if (flagFilter === 'missing_child_photo') {
        list = list.filter(app => app.flags.missingChildPhoto);
      } else if (flagFilter === 'missing_pickup_photo') {
        list = list.filter(app => app.flags.missingPickupPhoto);
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

    // Sort order (oldest first or newest first)
    list.sort((a, b) => {
      const dateA = new Date(a.submittedAt || 0).getTime();
      const dateB = new Date(b.submittedAt || 0).getTime();
      return sortBy === 'oldest' ? dateA - dateB : dateB - dateA;
    });

    return list;
  }, [enrichedApplications, statusFilter, flagFilter, workerFilter, searchQuery, sortBy]);

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
    setSearchQuery('');
  };

  const isFiltersActive = statusFilter !== 'all' || flagFilter !== 'all' || workerFilter !== 'all' || searchQuery.trim() !== '';

  const formatSubmittedDate = (dateVal?: string) => {
    if (!dateVal) return 'Date not recorded';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Date not recorded';
    const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `Submitted ${monthDay} · ${time}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'under_review':
      case 'review_reopened':
        return {
          label: 'Awaiting review',
          className: 'bg-stone-100 text-stone-700 border border-stone-200'
        };
      case 'selected':
      case 'pass_ready':
      case 'checked_in':
      case 'picked_up':
        return {
          label: 'Selected',
          className: 'bg-emerald-50 text-emerald-800 border border-emerald-200/70'
        };
      case 'waiting_list':
        return {
          label: 'Waiting list',
          className: 'bg-amber-50 text-amber-800 border border-amber-200/70'
        };
      case 'not_selected':
        return {
          label: 'Not selected',
          className: 'bg-zinc-100 text-zinc-600 border border-zinc-200'
        };
      default:
        return {
          label: status.replace('_', ' '),
          className: 'bg-zinc-100 text-zinc-600 border border-zinc-200'
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-[#18181B] tracking-tight">
            Registration review
          </h1>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Review child registrations and make event decisions with care.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => fetchApplications(true)}
            disabled={refreshing}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-[#EAE8E1] text-[#18181B] rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer flex items-center gap-2"
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
      ) : (
        <>
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-4 sm:p-5 shadow-xs"
            data-component-version="admin-review-summary-strip"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-y-4 sm:gap-y-0 sm:divide-x divide-[#EAE8E1]">
              <div className="sm:px-4 first:sm:pl-0">
                <span className="text-xs font-medium text-zinc-500 block">
                  Awaiting review
                </span>
                <span className="text-2xl font-semibold text-[#18181B] block mt-1">
                  {metrics.underReview}
                </span>
              </div>

              <div className="sm:px-4">
                <span className="text-xs font-medium text-zinc-500 block">
                  Selected
                </span>
                <span className="text-2xl font-semibold text-[#18181B] block mt-1">
                  {metrics.selected}
                </span>
              </div>

              <div className="sm:px-4">
                <span className="text-xs font-medium text-zinc-500 block">
                  Waiting list
                </span>
                <span className="text-2xl font-semibold text-[#18181B] block mt-1">
                  {metrics.waitingList}
                </span>
              </div>

              <div className="sm:px-4">
                <span className="text-xs font-medium text-zinc-500 block">
                  Not selected
                </span>
                <span className="text-2xl font-semibold text-[#18181B] block mt-1">
                  {metrics.notSelected}
                </span>
              </div>

              <div className="sm:px-4 last:sm:pr-0">
                <span className="text-xs font-medium text-zinc-500 block">
                  Needs attention
                </span>
                <span className={`text-2xl font-semibold block mt-1 ${metrics.needsAttention > 0 ? 'text-amber-800' : 'text-zinc-500'}`}>
                  {metrics.needsAttention}
                </span>
              </div>
            </div>
          </div>

          {/* MAIN 3-COLUMN WORKSPACE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* 3. FILTER LEFT PANEL (Desktop: 3 cols, Hidden on Mobile) */}
            <aside 
              className="lg:col-span-3 bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-5 hidden lg:block shadow-xs"
              data-component-version="admin-review-filters-panel"
            >
              <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-3">
                <span className="text-xs font-semibold text-[#18181B] flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#C59B27]" />
                  Filters
                </span>
                {isFiltersActive && (
                  <button 
                    onClick={handleResetFilters}
                    className="text-xs text-zinc-400 hover:text-[#C59B27] font-medium hover:underline cursor-pointer"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 block">
                  Status
                </label>
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-white p-2.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                >
                  <option value="all">All statuses</option>
                  <option value="under_review">Awaiting review</option>
                  <option value="selected">Selected</option>
                  <option value="waiting_list">Waiting list</option>
                  <option value="not_selected">Not selected</option>
                </select>
              </div>

              {/* Attention Conditions Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 block">
                  Needs attention
                </label>
                <select 
                  value={flagFilter}
                  onChange={(e) => setFlagFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-white p-2.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                >
                  <option value="all">All registrations</option>
                  <option value="below_age">Age needs review</option>
                  <option value="missing_child_photo">Photo needed</option>
                  <option value="missing_pickup_photo">Pickup photo needed</option>
                  <option value="medical_or_support">Care & medical notes</option>
                  <option value="duplicate_contact">Sibling registrations</option>
                </select>
              </div>

              {/* Parent Role Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 block">
                  Parent role
                </label>
                <select 
                  value={workerFilter}
                  onChange={(e) => setWorkerFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-white p-2.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
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
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by child, parent or email"
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                />
              </div>

              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="px-3.5 py-2 bg-white border border-[#EAE8E1] rounded-xl text-xs font-semibold text-zinc-700 flex items-center gap-1.5 cursor-pointer hover:bg-zinc-50"
              >
                <Filter className="w-3.5 h-3.5 text-zinc-500" />
                Filters
              </button>
            </div>

            {/* 4. CENTER COLUMN: REGISTRATION RESULTS LIST (6 cols) */}
            <div 
              className="lg:col-span-6 space-y-4"
              data-component-version="admin-review-results-list"
            >
              {/* SEARCH & SORT TOOLBAR */}
              <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                {/* Search Bar - Desktop */}
                <div className="relative flex-1 max-w-sm hidden lg:block">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by child, parent or email"
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                  />
                </div>

                {/* Match count and Sort Options */}
                <div className="flex items-center justify-between sm:justify-end gap-3 w-full lg:w-auto">
                  <span className="text-xs text-zinc-500 font-medium">
                    {filteredApplications.length} {filteredApplications.length === 1 ? 'result' : 'results'}
                  </span>

                  <div className="flex items-center gap-1 bg-[#FAF9F6] p-1 border border-[#EAE8E1] rounded-xl text-xs">
                    <button 
                      onClick={() => setSortBy('oldest')}
                      className={`px-2.5 py-1 font-medium rounded-lg transition-colors cursor-pointer ${sortBy === 'oldest' ? 'bg-white text-[#18181B] shadow-2xs font-semibold' : 'text-zinc-500 hover:text-zinc-700'}`}
                    >
                      Oldest first
                    </button>
                    <button 
                      onClick={() => setSortBy('newest')}
                      className={`px-2.5 py-1 font-medium rounded-lg transition-colors cursor-pointer ${sortBy === 'newest' ? 'bg-white text-[#18181B] shadow-2xs font-semibold' : 'text-zinc-500 hover:text-zinc-700'}`}
                    >
                      Newest first
                    </button>
                  </div>
                </div>
              </div>

              {/* Bulk Action Controls Banner */}
              {selectedIds.length > 0 && (
                <div className="bg-[#FAF8F3] border border-[#E5D5AE]/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-fade-in">
                  <div className="flex items-center space-x-2.5">
                    <CheckSquare className="w-4 h-4 text-[#C59B27]" />
                    <span className="text-xs font-semibold text-zinc-800">
                      {selectedIds.length} registration{selectedIds.length > 1 ? 's' : ''} selected
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        setBulkDecision('selected');
                        setBulkActionOpen(true);
                      }}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200/60 hover:bg-emerald-100 text-xs font-medium rounded-xl cursor-pointer transition-colors"
                    >
                      Select for event
                    </button>
                    
                    <button
                      onClick={() => {
                        setBulkDecision('waiting_list');
                        setBulkActionOpen(true);
                      }}
                      className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200/60 hover:bg-amber-100 text-xs font-medium rounded-xl cursor-pointer transition-colors"
                    >
                      Add to waiting list
                    </button>

                    <button
                      onClick={() => {
                        setBulkDecision('not_selected');
                        setBulkActionOpen(true);
                      }}
                      className="px-3 py-1.5 bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-200 text-xs font-medium rounded-xl cursor-pointer transition-colors"
                    >
                      Mark not selected
                    </button>

                    <button
                      onClick={() => setSelectedIds([])}
                      className="text-xs text-zinc-400 hover:text-zinc-600 font-medium cursor-pointer px-2 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* REGISTRATIONS RESULTS LIST */}
              {filteredApplications.length === 0 ? (
                <div className="bg-white border border-[#EAE8E1] rounded-2xl p-12 text-center space-y-3 shadow-xs">
                  <AlertCircle className="w-8 h-8 text-zinc-400 mx-auto" />
                  <h3 className="text-base font-semibold text-[#18181B]">
                    {isFiltersActive ? 'No registrations match these filters.' : 'No registrations found.'}
                  </h3>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
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
                    
                    const ageGroupClean = app.child?.ageGroup 
                      ? (app.child.ageGroup.toLowerCase().startsWith('ages') ? app.child.ageGroup : `Ages ${app.child.ageGroup}`) 
                      : '';

                    return (
                      <div 
                        key={app.id}
                        onClick={() => setActiveSelectId(app.id)}
                        className={`bg-white border rounded-2xl p-4 sm:p-5 transition-all cursor-pointer ${
                          isActive 
                            ? 'border-[#C59B27] ring-1 ring-[#C59B27]/30 shadow-xs' 
                            : 'border-[#EAE8E1] hover:border-[#C59B27]/40'
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
                                <Square className="w-4 h-4 text-zinc-300 hover:text-zinc-400" />
                              )}
                            </button>

                            {/* Avatar */}
                            <div className="w-12 h-14 bg-zinc-50 border border-[#EAE8E1] rounded-xl shrink-0 overflow-hidden flex items-center justify-center relative">
                              {app.child?.photoUrl ? (
                                <img 
                                  src={app.child.photoUrl} 
                                  alt={app.child.fullName} 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-zinc-400 font-semibold text-sm">
                                  {app.child?.fullName?.charAt(0) || 'C'}
                                </span>
                              )}
                            </div>

                            {/* Text Metadata */}
                            <div className="space-y-1 min-w-0">
                              <h4 className="text-sm font-semibold text-[#18181B] truncate">
                                {app.child?.fullName || 'Unnamed child'}
                              </h4>
                              
                              <p className="text-xs text-zinc-500 font-medium">
                                {ageDisplay}{ageGroupClean ? ` · ${ageGroupClean}` : ''}
                              </p>

                              <p className="text-xs text-zinc-600 pt-0.5 truncate">
                                Parent: <span className="font-medium text-zinc-800">{app.parent?.fullName || 'Not recorded'}</span>
                                {app.parent?.isWorker ? (
                                  <span className="text-[#C59B27] font-medium ml-1">
                                    (Team member)
                                  </span>
                                ) : null}
                              </p>

                              <p className="text-xs text-zinc-400 pt-0.5">
                                {formatSubmittedDate(app.submittedAt)}
                              </p>

                              {/* Attention Notices */}
                              <div className="flex flex-wrap gap-1.5 pt-2">
                                {app.flags.belowAge && (
                                  <span className="bg-amber-50 text-amber-800 border border-amber-200/60 text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Age needs review
                                  </span>
                                )}
                                {app.flags.missingChildPhoto && (
                                  <span className="bg-stone-100 text-stone-700 border border-stone-200 text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Photo needed
                                  </span>
                                )}
                                {app.flags.missingPickupPhoto && (
                                  <span className="bg-stone-100 text-stone-700 border border-stone-200 text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Pickup photo needed
                                  </span>
                                )}
                                {app.flags.medicalNotes && (
                                  <span className="bg-amber-50 text-amber-800 border border-amber-200/60 text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Care note
                                  </span>
                                )}
                                {app.flags.extraSupport && (
                                  <span className="bg-amber-50 text-amber-800 border border-amber-200/60 text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Extra support
                                  </span>
                                )}
                                {app.siblings.length > 0 && (
                                  <span className="bg-stone-100 text-stone-700 border border-stone-200 text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0">
                                    Sibling registration
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Status Badge & Review Action */}
                          <div className="flex flex-col items-end justify-between gap-3 shrink-0 self-stretch">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
                              {statusInfo.label}
                            </span>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedApplicationId(app.id);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#EAE8E1] bg-white hover:bg-zinc-50 text-xs font-semibold text-[#18181B] transition-colors cursor-pointer mt-auto"
                            >
                              <span>{app.status === 'under_review' ? 'Review' : 'View review'}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                            </button>
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
                className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4 shadow-xs"
                data-component-version="admin-review-details-preview"
              >
                <span className="text-xs font-semibold text-[#18181B] block border-b border-[#EAE8E1] pb-2.5">
                  Registration details
                </span>

                {activeSelectedChild ? (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-start space-x-3.5">
                      {/* Photo or Initials */}
                      <div className="w-16 h-20 bg-zinc-50 border border-[#EAE8E1] rounded-xl overflow-hidden shrink-0 flex items-center justify-center relative">
                        {activeSelectedChild.child?.photoUrl ? (
                          <img 
                            src={activeSelectedChild.child.photoUrl} 
                            alt={activeSelectedChild.child.fullName} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-zinc-400 font-semibold text-lg">
                            {activeSelectedChild.child?.fullName?.charAt(0) || 'C'}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <h3 className="text-sm font-semibold text-[#18181B] truncate leading-snug">
                          {activeSelectedChild.child?.fullName}
                        </h3>
                        <p className="text-xs text-zinc-500 font-medium">
                          {activeSelectedChild.child?.age === 0 ? 'Under 1 year' : `${activeSelectedChild.child?.age} years`} · {activeSelectedChild.child?.gender || 'Gender not stated'}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {activeSelectedChild.child?.ageGroup ? (activeSelectedChild.child.ageGroup.toLowerCase().startsWith('ages') ? activeSelectedChild.child.ageGroup : `Ages ${activeSelectedChild.child.ageGroup}`) : 'Section not stated'}
                        </p>
                      </div>
                    </div>

                    {/* Definition List with subtle dividers */}
                    <div className="divide-y divide-[#EAE8E1]/60 text-xs space-y-2 pt-1">
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-zinc-500">Class</span>
                        <span className="font-medium text-[#18181B] truncate max-w-[150px]">
                          {activeSelectedChild.schoolClass || 'Not stated'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-zinc-500">School</span>
                        <span className="font-medium text-[#18181B] truncate max-w-[150px]">
                          {activeSelectedChild.schoolName || 'Not stated'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-zinc-500">Parent / guardian</span>
                        <span className="font-medium text-[#18181B] truncate max-w-[150px]">
                          {activeSelectedChild.parent?.fullName || 'Not stated'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-zinc-500">Phone</span>
                        <span className="font-medium text-[#18181B] flex items-center gap-1">
                          {activeSelectedChild.parent?.phone || 'Not stated'}
                        </span>
                      </div>
                      {activeSelectedChild.siblings.length > 0 && (
                        <div className="flex justify-between items-center py-1.5">
                          <span className="text-zinc-500">Siblings</span>
                          <span className="font-medium text-[#18181B] truncate max-w-[150px]">
                            {activeSelectedChild.siblings.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {activeSelectedChild.noteToTeam && (
                      <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-600 leading-relaxed space-y-1">
                        <span className="font-semibold text-zinc-800 block">Parent note</span>
                        <p className="italic">"{activeSelectedChild.noteToTeam}"</p>
                      </div>
                    )}

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
                  </div>
                ) : (
                  <div className="text-center py-8 px-4 space-y-2">
                    <Users className="w-8 h-8 text-zinc-300 mx-auto" />
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Select a registration from the list to see preview details here.
                    </p>
                  </div>
                )}
              </div>

              {/* ROOM CAPACITIES CARD */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4 shadow-xs"
                data-component-version="admin-review-room-capacities"
              >
                <span className="text-xs font-semibold text-[#18181B] block border-b border-[#EAE8E1] pb-2.5">
                  Room capacities
                </span>

                {!capacityStats || capacityStats.length === 0 ? (
                  <div className="text-center py-4 px-2">
                    <p className="text-xs text-zinc-400">
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
                      
                      return (
                        <div key={c.id} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-600 truncate max-w-[140px]">
                              {c.label}
                            </span>
                            <span className="text-zinc-500 font-medium">
                              <span className="text-[#18181B] font-semibold">{c.current}</span>
                              <span className="text-zinc-300 mx-0.5">/</span>
                              <span>{c.limit}</span>
                            </span>
                          </div>
                          
                          <div className="w-full bg-[#FAF9F6] border border-zinc-100 h-2 rounded-full overflow-hidden">
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
                className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-3 shadow-xs"
                data-component-version="admin-review-guidelines"
              >
                <span className="text-xs font-semibold text-[#18181B] block border-b border-[#EAE8E1] pb-2.5">
                  Review criteria
                </span>

                <div className="space-y-3 pt-0.5 text-xs text-zinc-600 leading-relaxed">
                  <div>
                    <strong className="text-[#18181B] font-medium block">Age guideline:</strong>
                    Children should meet the designated age bracket for their event section.
                  </div>
                  <div>
                    <strong className="text-[#18181B] font-medium block">Team priority:</strong>
                    Children of serving team members are prioritized to facilitate volunteer coverage.
                  </div>
                  <div>
                    <strong className="text-[#18181B] font-medium block">Safety standard:</strong>
                    A complete authorized pickup contact is required prior to gate check-in.
                  </div>
                </div>
              </div>

            </div>

          </div>
        </>
      )}

      {/* BULK ACTION SELECTION MODAL */}
      {bulkActionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => setBulkActionOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs" 
          />
          <div className="relative bg-white border border-[#EAE8E1] rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
              <h3 className="text-base font-semibold text-[#18181B]">
                Bulk decision
              </h3>
              <button 
                onClick={() => setBulkActionOpen(false)}
                className="text-zinc-400 hover:text-[#18181B] p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} className="space-y-4">
              <p className="text-xs text-zinc-500 leading-relaxed">
                You are recording a decision for <strong>{selectedIds.length}</strong> child registrations.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 block">
                  Action decision
                </label>
                <select 
                  value={bulkDecision}
                  onChange={(e) => setBulkDecision(e.target.value as any)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-white p-2.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                >
                  <option value="selected">Select for event</option>
                  <option value="waiting_list">Add to waiting list</option>
                  <option value="not_selected">Mark as not selected</option>
                  <option value="under_review">Reset to awaiting review</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 block">
                  Team note (optional)
                </label>
                <textarea 
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  placeholder="Add an internal note explaining this bulk decision..."
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-white p-2.5 text-zinc-800 h-20 focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
                />
              </div>

              <div className="bg-[#FAF9F6] border border-[#EAE8E1] p-3 rounded-xl text-xs text-zinc-500 leading-normal">
                Parents will be updated according to your event notification settings.
              </div>

              <div className="pt-3 border-t border-[#EAE8E1] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkActionOpen(false)}
                  className="px-4 py-2 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 font-medium rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={submittingBulk}
                >
                  Confirm decision
                </Button>
              </div>
            </form>
          </div>
        </div>
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
          <div className="relative w-full max-w-xs bg-white h-full shadow-2xl p-6 flex flex-col space-y-6 animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-3 shrink-0">
              <span className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-[#C59B27]" />
                Filters
              </span>
              <button 
                onClick={() => setMobileFiltersOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1 py-1">
              {/* Status Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 block">
                  Status
                </label>
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-white p-2.5 text-zinc-800 focus:outline-none"
                >
                  <option value="all">All statuses</option>
                  <option value="under_review">Awaiting review</option>
                  <option value="selected">Selected</option>
                  <option value="waiting_list">Waiting list</option>
                  <option value="not_selected">Not selected</option>
                </select>
              </div>

              {/* Attention Conditions Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 block">
                  Needs attention
                </label>
                <select 
                  value={flagFilter}
                  onChange={(e) => setFlagFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-white p-2.5 text-zinc-800 focus:outline-none"
                >
                  <option value="all">All registrations</option>
                  <option value="below_age">Age needs review</option>
                  <option value="missing_child_photo">Photo needed</option>
                  <option value="missing_pickup_photo">Pickup photo needed</option>
                  <option value="medical_or_support">Care & medical notes</option>
                  <option value="duplicate_contact">Sibling registrations</option>
                </select>
              </div>

              {/* Parent Role Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 block">
                  Parent role
                </label>
                <select 
                  value={workerFilter}
                  onChange={(e) => setWorkerFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-white p-2.5 text-zinc-800 focus:outline-none"
                >
                  <option value="all">All parents</option>
                  <option value="worker">Ministry team & workers</option>
                  <option value="non_worker">Other families</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-[#EAE8E1] flex gap-2 shrink-0">
              <button
                onClick={handleResetFilters}
                className="flex-1 py-2 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 font-medium rounded-xl text-xs cursor-pointer"
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

    </div>
  );
};

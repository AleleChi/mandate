import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Users, 
  Search, 
  Check, 
  X, 
  ShieldAlert, 
  Loader2, 
  ChevronRight, 
  AlertCircle,
  Phone,
  Clock,
  Filter,
  CheckCircle,
  Info,
  SlidersHorizontal,
  ChevronDown,
  ArrowUpDown,
  BookOpen,
  UserCheck,
  Smartphone,
  CheckSquare,
  Square
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
  onBackToOverview,
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
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('oldest'); // Oldest first is priority review order
  
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
      showError('Fetch Failed', parsed.message || 'Could not load review records.');
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

  // Compute duplicate parent phones to identify sibling groups / duplicate contacts
  const parentPhoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    applications.forEach(app => {
      const phone = app.parent?.phone;
      if (phone) {
        counts[phone] = (counts[phone] || 0) + 1;
      }
    });
    return counts;
  }, [applications]);

  // Enrich applications with custom diagnostic flags derived from the active dataset
  const enrichedApplications = useMemo(() => {
    return applications.map(app => {
      const isBelowAge = app.child?.age < 1;
      const isMissingPickupPhoto = app.pickupPeople && app.pickupPeople.length > 0 && app.pickupPeople.some((p: any) => !p.photoUrl);
      const isMissingChildPhoto = !app.child?.photoUrl;
      const hasMedicalNotes = !!app.hasMedicalNotes || !!app.medicalNotes;
      const needsExtraSupport = !!app.needsExtraSupport || !!app.supportNotes;
      
      const phone = app.parent?.phone;
      const isDuplicateContact = phone ? (parentPhoneCounts[phone] || 0) > 1 : false;

      return {
        ...app,
        flags: {
          belowAge: isBelowAge,
          missingPickupPhoto: isMissingPickupPhoto,
          missingChildPhoto: isMissingChildPhoto,
          medicalNotes: hasMedicalNotes,
          extraSupport: needsExtraSupport,
          duplicateContact: isDuplicateContact
        }
      };
    });
  }, [applications, parentPhoneCounts]);

  // Metrics (reflecting real data only)
  const metrics = useMemo(() => {
    let underReviewCount = 0;
    let selectedCount = 0;
    let waitingListCount = 0;
    let notSelectedCount = 0;
    let belowAgeCount = 0;
    let needsAttentionCount = 0;

    enrichedApplications.forEach(app => {
      if (app.status === 'under_review') {
        underReviewCount++;
      } else if (app.status === 'selected' || app.status === 'pass_ready' || app.status === 'checked_in' || app.status === 'picked_up') {
        selectedCount++;
      } else if (app.status === 'waiting_list') {
        waitingListCount++;
      } else if (app.status === 'not_selected') {
        notSelectedCount++;
      }

      if (app.flags.belowAge) {
        belowAgeCount++;
      }

      if (app.flags.medicalNotes || app.flags.extraSupport || app.flags.missingChildPhoto || app.flags.missingPickupPhoto) {
        needsAttentionCount++;
      }
    });

    return {
      underReview: underReviewCount,
      selected: selectedCount,
      waitingList: waitingListCount,
      notSelected: notSelectedCount,
      belowAge: belowAgeCount,
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

    // Calculate count of SELECTED children in each bracket
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
      { id: 'under1', label: 'Under 1 Year', current: counts.under1, limit: limits.under1 },
      { id: 'toddler', label: 'Toddlers (Ages 1–3)', current: counts.toddler, limit: limits.toddler },
      { id: 'preschool', label: 'Pre-school (Ages 4–6)', current: counts.preschool, limit: limits.preschool },
      { id: 'primary', label: 'Primary (Ages 7–9)', current: counts.primary, limit: limits.primary },
      { id: 'preteen', label: 'Pre-teens (Ages 10–12)', current: counts.preteen, limit: limits.preteen }
    ];
  }, [enrichedApplications]);

  // Suggested Actions Checklist (derived from real statistics)
  const suggestedActions = useMemo(() => {
    const list: { id: string; text: string; actionLabel: string; type: 'warn' | 'info'; filterFn: () => void }[] = [];

    if (metrics.belowAge > 0) {
      list.push({
        id: 'below_age',
        text: `${metrics.belowAge} application${metrics.belowAge > 1 ? 's are' : ' is'} below the 1-year age limit rule.`,
        actionLabel: 'Review Age Violations',
        type: 'warn',
        filterFn: () => {
          setFlagFilter('below_age');
          setStatusFilter('all');
          setWorkerFilter('all');
        }
      });
    }

    const missingPhotos = enrichedApplications.filter(app => app.flags.missingChildPhoto).length;
    if (missingPhotos > 0) {
      list.push({
        id: 'missing_child_photo',
        text: `${missingPhotos} child profile${missingPhotos > 1 ? 's lack' : ' lacks'} a mandatory face photograph.`,
        actionLabel: 'Filter Missing Photos',
        type: 'info',
        filterFn: () => {
          setFlagFilter('missing_child_photo');
          setStatusFilter('all');
          setWorkerFilter('all');
        }
      });
    }

    return list;
  }, [metrics, enrichedApplications]);

  // Filter application list based on search and selected filter values
  const filteredApplications = useMemo(() => {
    let list = [...enrichedApplications];

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'selected') {
        list = list.filter(app => ['selected', 'pass_ready', 'checked_in', 'picked_up'].includes(app.status));
      } else {
        list = list.filter(app => app.status === statusFilter);
      }
    }

    // Flag filters
    if (flagFilter !== 'all') {
      if (flagFilter === 'below_age') {
        list = list.filter(app => app.flags.belowAge);
      } else if (flagFilter === 'missing_pickup_photo') {
        list = list.filter(app => app.flags.missingPickupPhoto);
      } else if (flagFilter === 'missing_child_photo') {
        list = list.filter(app => app.flags.missingChildPhoto);
      } else if (flagFilter === 'medical_or_support') {
        list = list.filter(app => app.flags.medicalNotes || app.flags.extraSupport);
      } else if (flagFilter === 'duplicate_contact') {
        list = list.filter(app => app.flags.duplicateContact);
      }
    }

    // Worker Filter
    if (workerFilter !== 'all') {
      const isWorker = workerFilter === 'worker';
      list = list.filter(app => app.parent?.isWorker === isWorker);
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

    // Sort order (oldest first processed as high priority, or newest first)
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

  // Handlers for individual quick status updates
  const handleQuickStatusUpdate = async (id: string, status: string, name: string) => {
    try {
      const res = await api.admin.updateApplicationStatus(id, status);
      if (res.success) {
        showSuccess('Decision Recorded', `Successfully updated ${name}'s status to ${status.replace('_', ' ')}.`);
        await fetchApplications(true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action Failed', parsed.message || 'Could not record your action.');
    }
  };

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
        showSuccess('Bulk Action Recorded', `Successfully processed decision for ${selectedIds.length} children.`);
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

  // If detailed side review screen is open, route it
  if (selectedApplicationId) {
    return (
      <AdminReviewChildView 
        applicationId={selectedApplicationId}
        onBack={() => setSelectedApplicationId(null)}
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
      data-view-version="admin-review-board-v2-card-refined"
    >
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-5">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-[#18181B] tracking-tight">
            Review Board
          </h2>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Review child applications and make event decisions with care.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => fetchApplications(true)}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-[#EAE8E1] text-[#18181B] rounded-xl hover:bg-zinc-50 cursor-pointer flex items-center gap-2"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Refresh Applications
          </button>
          
          <button 
            onClick={onBackToOverview}
            className="px-3.5 py-2 text-xs font-semibold bg-[#C59B27] text-white rounded-xl hover:bg-[#B08921] shadow-xs cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* 1. METRICS ROW */}
      {loading ? (
        <div className="w-full">
          <KoinoniaInlineLoader
            variant="logo"
            size="md"
            label="Loading applications for review..."
            fullCard
            centered
          />
        </div>
      ) : (
        <>
          <div 
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
            data-component-version="admin-review-board-metrics-v1"
          >
            {[
              { label: 'Under Review', val: metrics.underReview, color: 'text-amber-600', bg: 'bg-amber-500/5', border: 'border-amber-200/50' },
              { label: 'Selected', val: metrics.selected, color: 'text-emerald-700', bg: 'bg-emerald-500/5', border: 'border-emerald-200/50' },
              { label: 'Waitlisted', val: metrics.waitingList, color: 'text-[#C59B27]', bg: 'bg-[#C59B27]/5', border: 'border-[#C59B27]/25' },
              { label: 'Not Selected', val: metrics.notSelected, color: 'text-zinc-500', bg: 'bg-zinc-100', border: 'border-zinc-200' },
              { label: 'Below Age Limit', val: metrics.belowAge, color: 'text-red-700', bg: 'bg-red-500/5', border: 'border-red-200/50' },
              { label: 'Needs Attention', val: metrics.needsAttention, color: 'text-rose-700', bg: 'bg-rose-500/5', border: 'border-rose-200/50' },
            ].map((m, idx) => (
              <div 
                key={idx} 
                className={`${m.bg} border ${m.border} rounded-2xl p-4 flex flex-col justify-between shadow-2xs`}
              >
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  {m.label}
                </span>
                <span className={`font-serif text-2xl font-bold ${m.color} block mt-2`}>
                  {m.val}
                </span>
              </div>
            ))}
          </div>

          {/* MAIN COLUMN WORKSPACE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* 2. FILTER LEFT PANEL (Desktop: 3 columns, Mobile: Collapsible Sheet) */}
            <aside 
              className="lg:col-span-3 bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-5 hidden lg:block"
              data-component-version="admin-review-board-filters-v1"
            >
              <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-3">
                <span className="text-xs font-bold text-[#18181B] flex items-center gap-1.5 uppercase tracking-wider">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#C59B27]" />
                  Refine Queue
                </span>
                <button 
                  onClick={handleResetFilters}
                  className="text-[10px] text-zinc-400 hover:text-[#C59B27] font-semibold uppercase hover:underline"
                >
                  Clear All
                </button>
              </div>

              {/* Status Filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  Review Status
                </label>
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 p-2.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27]"
                >
                  <option value="all">All Statuses</option>
                  <option value="under_review">Under Review</option>
                  <option value="selected">Selected / Pass Ready</option>
                  <option value="waiting_list">Waiting List</option>
                  <option value="not_selected">Not Selected</option>
                </select>
              </div>

              {/* Diagnostic Flag Filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  Attention Alerts
                </label>
                <select 
                  value={flagFilter}
                  onChange={(e) => setFlagFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 p-2.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27]"
                >
                  <option value="all">All Registrations</option>
                  <option value="below_age">Below Event Age (&lt; 1 yr)</option>
                  <option value="missing_child_photo">Missing Child Profile Photo</option>
                  <option value="missing_pickup_photo">Missing Pickup Face Photo</option>
                  <option value="medical_or_support">Medical or Support Needs</option>
                  <option value="duplicate_contact">Duplicate Contact / Sibling Group</option>
                </select>
              </div>

              {/* Parent Worker Type Filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  Parent Affiliation
                </label>
                <select 
                  value={workerFilter}
                  onChange={(e) => setWorkerFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 p-2.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27]"
                >
                  <option value="all">All Parents</option>
                  <option value="worker">Koinonia Workers First</option>
                  <option value="non_worker">Non-Worker Families</option>
                </select>
              </div>

              <div className="border-t border-[#EAE8E1] pt-4 text-[10px] text-zinc-400 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-amber-600 inline mr-1 -mt-0.5" />
                Sort order is pre-configured to <strong>Oldest Submissions First</strong> to preserve processing fairness for early registrants.
              </div>
            </aside>

            {/* MOBILE FILTER TRIGGER (Shown on lg:hidden) */}
            <div className="lg:hidden flex items-center gap-2 w-full">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search children, parents..."
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                />
              </div>

              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="px-3 py-2 bg-white border border-[#EAE8E1] rounded-xl text-xs font-semibold text-zinc-700 flex items-center gap-2 cursor-pointer"
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
              </button>
            </div>

            {/* 3. CENTER QUEUE: CHILDREN TO REVIEW (5 columns) */}
            <div 
              className="lg:col-span-6 space-y-4"
              data-component-version="admin-review-board-queue-v1"
            >
              {/* SEARCH & SORT HEADER */}
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
                    placeholder="Search children, parents, email..."
                    className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                  />
                </div>

                {/* Sort Order Toggles */}
                <div className="flex items-center justify-between sm:justify-end gap-3 w-full lg:w-auto">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                    {filteredApplications.length} Matches
                  </span>

                  <div className="flex items-center gap-1.5 bg-zinc-50 p-1 border border-[#EAE8E1] rounded-xl text-xs">
                    <button 
                      onClick={() => setSortBy('oldest')}
                      className={`px-2 py-1 font-semibold rounded-lg transition-all cursor-pointer ${sortBy === 'oldest' ? 'bg-white text-[#18181B] shadow-xs' : 'text-zinc-400 hover:text-zinc-600'}`}
                      title="Prioritize oldest entries"
                    >
                      Oldest First
                    </button>
                    <button 
                      onClick={() => setSortBy('newest')}
                      className={`px-2 py-1 font-semibold rounded-lg transition-all cursor-pointer ${sortBy === 'newest' ? 'bg-white text-[#18181B] shadow-xs' : 'text-zinc-400 hover:text-zinc-600'}`}
                      title="View newest entries first"
                    >
                      Newest
                    </button>
                  </div>
                </div>
              </div>

              {/* Bulk Actions Header (if some items selected) */}
              {selectedIds.length > 0 && (
                <div className="bg-[#FFFDF5] border border-[#F5E6BE] rounded-2xl p-4 flex items-center justify-between gap-4 animate-fade-in shadow-sm">
                  <div className="flex items-center space-x-2.5">
                    <CheckSquare className="w-5 h-5 text-[#C59B27]" />
                    <span className="text-xs font-semibold text-zinc-800">
                      {selectedIds.length} Application{selectedIds.length > 1 ? 's' : ''} Selected
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setBulkDecision('selected');
                        setBulkActionOpen(true);
                      }}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Approve Select
                    </button>
                    
                    <button
                      onClick={() => {
                        setBulkDecision('waiting_list');
                        setBulkActionOpen(true);
                      }}
                      className="px-3 py-1.5 bg-[#C59B27]/10 text-[#C59B27] hover:bg-[#C59B27]/20 text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Waitlist
                    </button>

                    <button
                      onClick={() => setSelectedIds([])}
                      className="text-xs text-zinc-400 hover:text-zinc-600 font-semibold cursor-pointer px-2 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* APPLICATIONS QUEUE LIST */}
              {filteredApplications.length === 0 ? (
                <div className="bg-white border border-[#EAE8E1] rounded-2xl p-12 text-center space-y-4">
                  <AlertCircle className="w-10 h-10 text-zinc-400 mx-auto" />
                  <h3 className="font-serif text-base font-bold text-zinc-800">No Applications to Show</h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    No active registrations match your filters. Try clearing search filters to display all child profiles.
                  </p>
                  <button 
                    onClick={handleResetFilters}
                    className="text-xs font-bold text-[#C59B27] hover:underline"
                  >
                    Clear All Filters
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  {filteredApplications.map((app) => {
                    const isSelected = selectedIds.includes(app.id);
                    const isActive = activeSelectedChild?.id === app.id;
                    const dateStr = app.submittedAt ? new Date(app.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown date';
                    
                    return (
                      <div 
                        key={app.id}
                        onClick={() => setActiveSelectId(app.id)}
                        className={`bg-white border transition-all rounded-2xl p-4 relative flex flex-col md:flex-row md:items-start justify-between gap-4 cursor-pointer hover:border-[#C59B27]/30 ${isActive ? 'ring-1 ring-[#C59B27] border-[#C59B27]/60 shadow-xs' : 'border-[#EAE8E1]'}`}
                      >
                        {/* Top-right corner marker for selected item */}
                        {isActive && (
                          <div className="absolute top-0 right-0 w-3 h-3 bg-[#C59B27] rounded-bl-lg rounded-tr-xl" />
                        )}

                        <div className="flex items-start space-x-3.5 min-w-0">
                          {/* Custom Checkbox (Multi-select) */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSelectOne(app.id);
                            }}
                            className="text-zinc-400 hover:text-[#C59B27] shrink-0 mt-0.5 focus:outline-none"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#C59B27]" />
                            ) : (
                              <Square className="w-4 h-4 text-zinc-300 hover:text-zinc-400" />
                            )}
                          </button>

                          {/* Avatar - Rectangular Stitch styling as approved */}
                          <div className="w-12 h-14 bg-zinc-50 border border-[#EAE8E1] rounded-xl shrink-0 overflow-hidden flex items-center justify-center relative">
                            {app.child?.photoUrl ? (
                              <img 
                                src={app.child.photoUrl} 
                                alt={app.child.fullName} 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Users className="w-5 h-5 text-zinc-300" />
                            )}
                            {/* Worker indicator */}
                            {app.parent?.isWorker && (
                              <span className="absolute bottom-0 inset-x-0 bg-[#C59B27] text-white text-[7px] font-bold text-center uppercase tracking-widest py-0.5">
                                Worker
                              </span>
                            )}
                          </div>

                          {/* Details */}
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-serif text-sm font-bold text-[#18181B] truncate">
                                {app.child?.fullName}
                              </h4>
                              <span className="text-[10px] text-zinc-400 font-semibold shrink-0">
                                Age {app.child?.age}
                              </span>
                            </div>

                            <p className="text-[10px] text-zinc-500 font-medium truncate flex items-center gap-1">
                              Parent: <span className="text-zinc-700 font-semibold">{app.parent?.fullName}</span>
                              {app.parent?.isWorker && <span className="text-[#C59B27] font-bold">({app.parent.department || 'Worker'})</span>}
                            </p>

                            <p className="text-[9px] text-zinc-400 flex items-center gap-1 font-mono">
                              <Clock className="w-3 h-3 text-zinc-300 shrink-0" />
                              {dateStr}
                            </p>

                            {/* Warning Diagnostic Badges */}
                            <div className="flex flex-wrap gap-1 pt-1.5">
                              {app.flags.belowAge && (
                                <span className="bg-red-50 text-red-700 text-[8px] font-bold px-1.5 py-0.5 rounded-md border border-red-100 flex items-center gap-0.5 uppercase shrink-0">
                                  <ShieldAlert className="w-2.5 h-2.5" />
                                  Below Age Limit
                                </span>
                              )}
                              {app.flags.missingChildPhoto && (
                                <span className="bg-amber-50 text-amber-800 text-[8px] font-bold px-1.5 py-0.5 rounded-md border border-amber-100 flex items-center gap-0.5 uppercase shrink-0">
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  Profile Photo Missing
                                </span>
                              )}
                              {app.flags.medicalNotes && (
                                <span className="bg-[#C59B27]/5 text-[#C59B27] text-[8px] font-bold px-1.5 py-0.5 rounded-md border border-[#C59B27]/15 flex items-center gap-0.5 uppercase shrink-0">
                                  Medical Check
                                </span>
                              )}
                              {app.flags.extraSupport && (
                                <span className="bg-rose-50 text-rose-700 text-[8px] font-bold px-1.5 py-0.5 rounded-md border border-rose-100 flex items-center gap-0.5 uppercase shrink-0">
                                  Needs Extra Support
                                </span>
                              )}
                              {app.flags.duplicateContact && (
                                <span className="bg-zinc-50 text-zinc-500 text-[8px] font-bold px-1.5 py-0.5 rounded-md border border-zinc-200 flex items-center gap-0.5 uppercase shrink-0">
                                  Sibling Group
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Badge & Actions */}
                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-2 shrink-0 md:border-l md:border-[#EAE8E1]/60 md:pl-4 self-stretch md:self-auto pt-2 md:pt-0">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            app.status === 'under_review' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                            ['selected', 'pass_ready', 'checked_in', 'picked_up'].includes(app.status) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            app.status === 'waiting_list' ? 'bg-[#C59B27]/5 text-[#C59B27] border border-[#C59B27]/15' :
                            'bg-zinc-50 text-zinc-500 border border-zinc-200'
                          }`}>
                            {app.status === 'under_review' ? 'Under Review' : app.status === 'waiting_list' ? 'Waitlist' : app.status === 'selected' || app.status === 'pass_ready' ? 'Selected' : 'Not Selected'}
                          </span>

                          <div className="flex items-center gap-1 mt-auto">
                            {app.status === 'under_review' ? (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickStatusUpdate(app.id, 'selected', app.child?.fullName);
                                  }}
                                  className="p-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-600 rounded-lg focus:outline-none shrink-0"
                                  title="Approve / Select"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickStatusUpdate(app.id, 'waiting_list', app.child?.fullName);
                                  }}
                                  className="p-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-100 text-amber-700 rounded-lg focus:outline-none shrink-0"
                                  title="Move to waitlist"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : null}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedApplicationId(app.id);
                              }}
                              className="px-2 py-1 bg-zinc-50 hover:bg-zinc-100 border border-[#EAE8E1] text-[#18181B] text-[10px] font-semibold rounded-lg flex items-center gap-0.5 shrink-0"
                            >
                              Review
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. RIGHT SIDEBAR DETAILS PANEL (3 columns) */}
            <div className="lg:col-span-3 space-y-5">
              
              {/* CURRENT SELECTION CARD */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4 shadow-2xs"
                data-component-version="admin-review-active-selection-v2-refined"
              >
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block border-b border-zinc-100 pb-2">
                  Active Selection
                </span>

                {activeSelectedChild ? (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-start space-x-3.5">
                      {/* Image frame */}
                      <div className="w-16 h-20 bg-zinc-50 border border-[#EAE8E1] rounded-xl overflow-hidden shrink-0 flex items-center justify-center relative shadow-2xs">
                        {activeSelectedChild.child?.photoUrl ? (
                          <img 
                            src={activeSelectedChild.child.photoUrl} 
                            alt={activeSelectedChild.child.fullName} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Users className="w-6 h-6 text-zinc-300" />
                        )}
                        {/* Worker indicator badge overlay */}
                        {activeSelectedChild.parent?.isWorker && (
                          <span className="absolute bottom-0 inset-x-0 bg-[#C59B27] text-white text-[7px] font-bold text-center uppercase tracking-widest py-0.5 leading-none">
                            Worker
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <h4 className="font-serif text-sm font-bold text-[#18181B] truncate leading-tight">
                          {activeSelectedChild.child?.fullName}
                        </h4>
                        <p className="text-[10px] text-zinc-500 font-medium">
                          Age {activeSelectedChild.child?.age} • {activeSelectedChild.child?.gender}
                        </p>
                        <span className="inline-block text-[9px] font-semibold text-[#C59B27] bg-[#C59B27]/5 border border-[#C59B27]/10 px-1.5 py-0.5 rounded uppercase tracking-wider mt-0.5">
                          {activeSelectedChild.child?.ageGroup || 'No age group'}
                        </span>
                      </div>
                    </div>

                    <div className="divide-y divide-zinc-50 text-xs text-zinc-600 space-y-2.5 pt-1">
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-zinc-400 font-medium">Class</span>
                        <span className="font-semibold text-zinc-800 truncate max-w-[150px]">
                          {activeSelectedChild.schoolClass || 'None'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-zinc-400 font-medium">School</span>
                        <span className="font-semibold text-zinc-800 truncate max-w-[150px]">
                          {activeSelectedChild.schoolName || 'None'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-zinc-400 font-medium">Parent</span>
                        <span className="font-semibold text-zinc-800 truncate max-w-[150px]">
                          {activeSelectedChild.parent?.fullName}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 pb-0.5">
                        <span className="text-zinc-400 font-medium">Phone</span>
                        <span className="font-mono text-[10px] font-semibold text-zinc-800 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-zinc-400" />
                          {activeSelectedChild.parent?.phone}
                        </span>
                      </div>
                    </div>

                    {activeSelectedChild.noteToTeam && (
                      <div className="bg-zinc-50 border border-[#EAE8E1]/60 rounded-xl p-3 text-[10px] text-zinc-500 leading-normal">
                        <span className="font-bold block text-zinc-700 mb-0.5">Parent Note</span>
                        "{activeSelectedChild.noteToTeam}"
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      fullWidth
                      onClick={() => setSelectedApplicationId(activeSelectedChild.id)}
                      className="py-2.5 text-xs"
                    >
                      Open full review
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8 px-4 space-y-2">
                    <Users className="w-8 h-8 text-zinc-300 mx-auto opacity-80" />
                    <p className="text-xs text-zinc-400 leading-relaxed max-w-[200px] mx-auto font-medium">
                      Select a child from the review queue to see details here.
                    </p>
                  </div>
                )}
              </div>

              {/* CAPACITY CARD */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-4 shadow-2xs"
                data-component-version="admin-review-capacity-card-v2-refined"
              >
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block border-b border-zinc-100 pb-2">
                  Room Seating Capacities
                </span>

                {!capacityStats || capacityStats.length === 0 ? (
                  <div className="text-center py-6 px-4">
                    <p className="text-xs text-zinc-400 font-medium">
                      Capacity rules have not been set yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5 pt-1">
                    {capacityStats.map((c) => {
                      const pct = Math.min(100, Math.round((c.current / c.limit) * 100));
                      const isFull = c.current >= c.limit;
                      const isWarning = pct >= 80;

                      // Visual refinement for capacity bars
                      const barFillColor = isFull 
                        ? 'bg-rose-500' 
                        : isWarning 
                          ? 'bg-amber-500' 
                          : 'bg-[#C59B27]'; // Elegant warm gold fill
                      
                      const barTrackColor = 'bg-[#FAF9F6] border border-zinc-100/50';

                      const textLabelColor = isFull 
                        ? 'text-rose-700 font-semibold' 
                        : 'text-zinc-600 font-medium';

                      return (
                        <div key={c.id} className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className={`${textLabelColor} truncate max-w-[140px]`}>
                              {c.label}
                            </span>
                            <span className="font-mono font-medium text-zinc-500">
                              <span className="text-zinc-800 font-bold">{c.current}</span>
                              <span className="text-zinc-300 mx-0.5">/</span>
                              <span>{c.limit}</span>
                              <span className="text-[10px] text-zinc-400 ml-1">({pct}%)</span>
                            </span>
                          </div>
                          
                          {/* Softer, more premium progress bar */}
                          <div className={`w-full ${barTrackColor} h-2 rounded-full overflow-hidden`}>
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

              {/* SUGGESTED ACTIONS CARD (IF SUPPORTED) */}
              {suggestedActions.length > 0 && (
                <div 
                  className="bg-amber-50/50 border border-amber-200/40 rounded-2xl p-5 space-y-3 shadow-2xs"
                  data-component-version="admin-review-board-suggested-actions-v1"
                >
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest block">
                    Suggested Actions
                  </span>

                  <div className="space-y-3">
                    {suggestedActions.map((act) => (
                      <div key={act.id} className="space-y-2">
                        <p className="text-xs text-zinc-600 leading-relaxed">
                          {act.text}
                        </p>
                        <button
                          onClick={act.filterFn}
                          className="text-xs font-bold text-[#C59B27] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          {act.actionLabel}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* REVIEW RULES CARD */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-3 shadow-2xs"
                data-component-version="admin-review-board-rules-v1"
              >
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  Approved Review Criteria
                </span>

                <div className="space-y-3.5 pt-1 text-xs text-zinc-600 leading-relaxed">
                  <div className="flex items-start space-x-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-1.5 shrink-0" />
                    <div>
                      <strong className="text-[#18181B] font-semibold block">Minimum Age rule:</strong>
                      Children must be at least 1 year old by event date.
                    </div>
                  </div>
                  <div className="flex items-start space-x-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-1.5 shrink-0" />
                    <div>
                      <strong className="text-[#18181B] font-semibold block">Affiliation Priority:</strong>
                      Koinonia workers' and volunteers' children are processed with immediate registration preference.
                    </div>
                  </div>
                  <div className="flex items-start space-x-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C59B27] mt-1.5 shrink-0" />
                    <div>
                      <strong className="text-[#18181B] font-semibold block">Security Standard:</strong>
                      Valid authorized pickup contacts and facial photographs are required for physical pass clearance.
                    </div>
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
              <h4 className="font-serif font-bold text-[#18181B] text-base">
                Confirm Bulk Action
              </h4>
              <button 
                onClick={() => setBulkActionOpen(false)}
                className="text-zinc-400 hover:text-[#18181B] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} className="space-y-4">
              <p className="text-xs text-zinc-500 leading-relaxed">
                You are performing a bulk event decision for <strong>{selectedIds.length}</strong> child registration applications.
              </p>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  Action Decision
                </label>
                <select 
                  value={bulkDecision}
                  onChange={(e) => setBulkDecision(e.target.value as any)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 p-2.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                >
                  <option value="selected">Approve & Select (Issues Passes)</option>
                  <option value="waiting_list">Move to Waiting List</option>
                  <option value="not_selected">Record as Not Selected</option>
                  <option value="under_review">Reset to Under Review</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  Internal Administrative Note
                </label>
                <textarea 
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  placeholder="Record an internal processing note regarding this bulk decision..."
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 p-2.5 text-zinc-800 h-20 focus:outline-none focus:ring-1 focus:ring-[#C59B27] resize-none"
                />
              </div>

              <div className="bg-[#FFFDF5] border border-[#F5E6BE] p-3.5 rounded-xl text-[10px] text-zinc-500 leading-normal">
                <span className="font-bold block text-zinc-700 mb-1">Transactional Alert:</span>
                Approved and rejected bulk actions automatically dispatch emails and WhatsApp alerts to affected parents.
              </div>

              <div className="pt-3 border-t border-[#EAE8E1] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkActionOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={submittingBulk}
                >
                  Confirm Bulk Update
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
          data-component-version="admin-review-mobile-filters-v1"
        >
          <div 
            onClick={() => setMobileFiltersOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs" 
          />
          <div className="relative w-full max-w-xs bg-white h-full shadow-2xl p-6 flex flex-col space-y-6 animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-3 shrink-0">
              <span className="font-serif text-base font-bold text-zinc-800 flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-[#C59B27]" />
                Queue Filters
              </span>
              <button 
                onClick={() => setMobileFiltersOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1 py-1">
              {/* Status Filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  Review Status
                </label>
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 p-2.5 text-zinc-800 focus:outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="under_review">Under Review</option>
                  <option value="selected">Selected</option>
                  <option value="waiting_list">Waiting List</option>
                  <option value="not_selected">Not Selected</option>
                </select>
              </div>

              {/* Diagnostic Flag Filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  Attention Alerts
                </label>
                <select 
                  value={flagFilter}
                  onChange={(e) => setFlagFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 p-2.5 text-zinc-800 focus:outline-none"
                >
                  <option value="all">All Registrations</option>
                  <option value="below_age">Below Event Age (&lt; 1 yr)</option>
                  <option value="missing_child_photo">Missing Child Profile Photo</option>
                  <option value="missing_pickup_photo">Missing Pickup Face Photo</option>
                  <option value="medical_or_support">Medical or Support Needs</option>
                  <option value="duplicate_contact">Duplicate Contact / Sibling Group</option>
                </select>
              </div>

              {/* Parent Worker Type Filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  Parent Affiliation
                </label>
                <select 
                  value={workerFilter}
                  onChange={(e) => setWorkerFilter(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 p-2.5 text-zinc-800 focus:outline-none"
                >
                  <option value="all">All Parents</option>
                  <option value="worker">Koinonia Workers First</option>
                  <option value="non_worker">Non-Worker Families</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-[#EAE8E1] flex gap-2 shrink-0">
              <button
                onClick={handleResetFilters}
                className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold rounded-xl text-xs cursor-pointer"
              >
                Reset All
              </button>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="flex-1 py-2 bg-[#C59B27] hover:bg-[#B08921] text-white font-semibold rounded-xl text-xs cursor-pointer"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

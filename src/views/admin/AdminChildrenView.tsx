import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Users, 
  Phone, 
  ArrowLeft, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  UserCheck, 
  X, 
  Sparkles,
  Heart,
  Calendar,
  Eye,
  CameraOff,
  SlidersHorizontal,
  MoreVertical,
  RotateCcw,
  Check,
  Trash2,
  Lock,
  Unlock,
  FileClock,
  RefreshCw,
  UserX,
  ChevronDown
} from 'lucide-react';
import { api } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AdminReviewChildView } from './AdminReviewChildView';

interface AdminChildrenViewProps {
  onBackToOverview: () => void;
}

export const AdminChildrenView: React.FC<AdminChildrenViewProps> = ({ onBackToOverview }) => {
  const { showError, showSuccess } = useNotification();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalChildren: 0,
    selected: 0,
    checkedIn: 0,
    inside: 0,
    pickedUp: 0,
    needsAttention: 0
  });
  const [children, setChildren] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [tempFilter, setTempFilter] = useState<string>('all');

  // More actions states
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  const [childToReopen, setChildToReopen] = useState<any | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [submittingReopen, setSubmittingReopen] = useState(false);

  const [childToRemove, setChildToRemove] = useState<any | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [submittingRemove, setSubmittingRemove] = useState(false);

  const [childToRevoke, setChildToRevoke] = useState<any | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [submittingRevoke, setSubmittingRevoke] = useState(false);

  const [childToRestore, setChildToRestore] = useState<any | null>(null);
  const [submittingRestore, setSubmittingRestore] = useState(false);

  const [submittingActionId, setSubmittingActionId] = useState<string | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveDropdownId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchChildren = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getChildren({
        q: debouncedQuery,
        filter: activeFilter === 'all' ? '' : activeFilter
      });
      if (res.success) {
        setChildren(res.children || []);
        if (res.stats) {
          setStats(res.stats);
        }
      } else {
        setError('We could not load child records right now. Please try again.');
      }
    } catch (err: any) {
      console.error(err);
      setError('We could not load child records right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChildren();
  }, [debouncedQuery, activeFilter]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setActiveFilter('all');
  };

  // List actions implementations
  const handleSelectChild = async (applicationId: string) => {
    setSubmittingActionId(applicationId + '-select');
    try {
      const res = await api.admin.reviewApplication(applicationId, {
        status: 'selected',
        sendNotification: true
      });
      if (res.success) {
        showSuccess('Child Approved', 'The child application has been approved and registered.');
        fetchChildren();
      }
    } catch (err: any) {
      showError('Action Failed', err.message || 'Could not approve child.');
    } finally {
      setSubmittingActionId(null);
    }
  };

  const handleDeclineChild = async (applicationId: string) => {
    setSubmittingActionId(applicationId + '-decline');
    try {
      const res = await api.admin.reviewApplication(applicationId, {
        status: 'not_selected',
        sendNotification: true
      });
      if (res.success) {
        showSuccess('Application Declined', 'The child application status has been updated.');
        fetchChildren();
      }
    } catch (err: any) {
      showError('Action Failed', err.message || 'Could not update status.');
    } finally {
      setSubmittingActionId(null);
    }
  };

  const handleWaitlistChild = async (applicationId: string) => {
    setSubmittingActionId(applicationId + '-waitlist');
    try {
      const res = await api.admin.reviewApplication(applicationId, {
        status: 'waiting_list',
        sendNotification: true
      });
      if (res.success) {
        showSuccess('Waitlisted', 'The child application has been placed on the waiting list.');
        fetchChildren();
      }
    } catch (err: any) {
      showError('Action Failed', err.message || 'Could not update status.');
    } finally {
      setSubmittingActionId(null);
    }
  };

  const handleGeneratePass = async (childId: string) => {
    setSubmittingActionId(childId + '-pass');
    try {
      const res = await api.admin.generateChildPass(childId);
      if (res.success) {
        showSuccess('Pass Issued', 'The digital event pass has been successfully generated.');
        fetchChildren();
      }
    } catch (err: any) {
      showError('Action Failed', err.message || 'Could not generate event pass.');
    } finally {
      setSubmittingActionId(null);
    }
  };

  const handleRestoreChildSubmit = async () => {
    if (!childToRestore) return;
    setSubmittingRestore(true);
    try {
      const res = await api.admin.restoreChild(childToRestore.applicationId);
      if (res.success) {
        showSuccess('Child Restored', 'The child record has been successfully restored.');
        setChildToRestore(null);
        fetchChildren();
      }
    } catch (err: any) {
      showError('Action Failed', err.message || 'Could not restore child.');
    } finally {
      setSubmittingRestore(false);
    }
  };

  const handleReopenReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childToReopen) return;
    setSubmittingReopen(true);
    try {
      const res = await api.admin.reopenApplicationReview(childToReopen.applicationId, reopenReason);
      if (res.success) {
        showSuccess('Review Reopened', 'The child application review has been reopened.');
        setChildToReopen(null);
        setReopenReason('');
        fetchChildren();
      }
    } catch (err: any) {
      showError('Action Failed', err.message || 'Could not reopen review.');
    } finally {
      setSubmittingReopen(false);
    }
  };

  const handleRemoveChildSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childToRemove) return;
    setSubmittingRemove(true);
    try {
      const res = await api.admin.removeChild(childToRemove.applicationId, removeReason);
      if (res.success) {
        showSuccess('Child Removed', 'The child record has been archived/soft-removed.');
        setChildToRemove(null);
        setRemoveReason('');
        fetchChildren();
      }
    } catch (err: any) {
      showError('Action Failed', err.message || 'Could not remove child.');
    } finally {
      setSubmittingRemove(false);
    }
  };

  const handleRevokePassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childToRevoke) return;
    setSubmittingRevoke(true);
    try {
      const res = await api.admin.revokeChildPass(childToRevoke.childId, revokeReason);
      if (res.success) {
        showSuccess('Pass Revoked', 'The digital event pass has been revoked.');
        setChildToRevoke(null);
        setRevokeReason('');
        fetchChildren();
      }
    } catch (err: any) {
      showError('Action Failed', err.message || 'Could not revoke pass.');
    } finally {
      setSubmittingRevoke(false);
    }
  };

  if (selectedApplicationId) {
    return (
      <AdminReviewChildView
        applicationId={selectedApplicationId}
        onBack={() => setSelectedApplicationId(null)}
        onSave={() => {
          setSelectedApplicationId(null);
          fetchChildren();
        }}
      />
    );
  }

  // Render status badge helpers
  const getReviewStatusBadge = (status: string) => {
    switch (status) {
      case 'selected':
      case 'pass_ready':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
            Selected
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
            Under review
          </span>
        );
      case 'waiting_list':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
            Waiting list
          </span>
        );
      case 'not_selected':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-red-50 text-red-700 border border-red-100">
            Needs attention
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-zinc-50 text-zinc-500 border border-zinc-100">
            {status}
          </span>
        );
    }
  };

  const getEntryStatusBadge = (status: string) => {
    if (status === 'checked_in') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          Checked in
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400">
        <Clock className="w-3.5 h-3.5" />
        Not arrived
      </span>
    );
  };

  const getPickupStatusBadge = (status: string) => {
    switch (status) {
      case 'inside':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
            Inside
          </span>
        );
      case 'picked_up':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-600">
            Picked up
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-50 text-zinc-400">
            Not arrived
          </span>
        );
    }
  };

  const getTodayStatusText = (entryStatus: string, pickupStatus: string) => {
    if (entryStatus === 'checked_in') {
      if (pickupStatus === 'inside') {
        return 'Checked in · Inside';
      } else if (pickupStatus === 'picked_up') {
        return 'Checked in · Picked up';
      }
      return 'Checked in';
    }
    return 'Not arrived';
  };

  return (
    <div 
      className="space-y-6 animate-fade-in"
      data-view-version="admin-children-records-v2-mobile-refined"
    >
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-5">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <button 
              onClick={onBackToOverview}
              className="text-zinc-400 hover:text-[#18181B] p-1 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-bold text-[#C59B27] uppercase tracking-widest">
              Children Records
            </span>
          </div>
          <h1 className="font-serif text-2xl font-semibold text-[#18181B]">
            Children
          </h1>
          <p className="text-xs text-zinc-500 font-medium">
            View each child’s review status, entry status, pickup status, parent, pickup person, and care notes.
          </p>
        </div>
      </div>

      {/* METRIC SUMMARIES */}
      <div 
        className="grid grid-cols-2 lg:grid-cols-5 gap-4"
        data-component-version="admin-children-stats-v1"
      >
        {[
          { label: 'Total children', value: stats.totalChildren, color: 'border-[#EAE8E1] text-[#18181B]' },
          { label: 'Selected', value: stats.selected, color: 'border-emerald-100 text-[#18181B]' },
          { label: 'Checked in', value: stats.checkedIn, color: 'border-teal-100 text-[#18181B]' },
          { label: 'Inside', value: stats.inside, color: 'border-[#C59B27]/20 text-[#18181B]' },
          { label: 'Picked up', value: stats.pickedUp, color: 'border-zinc-200 text-zinc-500' }
        ].map((card, idx) => (
          <div 
            key={idx}
            className={`bg-white border rounded-2xl p-4 space-y-1.5 shadow-2xs ${card.color}`}
          >
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
              {card.label}
            </span>
            <div className="font-serif text-2xl font-bold tracking-tight">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* SEARCH AND FILTERS (MOBILE & DESKTOP SPLIT) */}
      <div className="space-y-4">
        {/* DESKTOP SEARCH AND FILTERS */}
        <div 
          className="hidden lg:block bg-white border border-[#EAE8E1] rounded-2xl p-4 space-y-4 shadow-2xs"
          data-component-version="admin-children-search-filters-v1"
        >
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search child, parent, or phone number"
              className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#18181B] placeholder-zinc-400 focus:outline-hidden focus:border-[#C59B27] focus:ring-1 focus:ring-[#C59B27] transition-all font-medium"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#18181B] p-0.5 rounded-full hover:bg-zinc-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Quick filters:
            </div>
            <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {[
                { id: 'all', label: 'All' },
                { id: 'inside', label: 'Inside' },
                { id: 'not_arrived', label: 'Not arrived' },
                { id: 'picked_up', label: 'Picked up' },
                { id: 'medical_note', label: 'Medical note' },
                { id: 'missing_pickup_photo', label: 'Missing pickup photo' },
                { id: 'below_event_age', label: 'Below event age' },
                { id: 'special_support', label: 'Special support' },
                { id: 'removed', label: 'Removed' }
              ].map((f) => {
                const active = activeFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setActiveFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
                      active 
                        ? 'bg-[#C59B27]/5 text-[#C59B27] border-[#C59B27]/30 font-semibold' 
                        : 'bg-[#FAF9F6] text-zinc-600 border-[#EAE8E1] hover:bg-zinc-50 hover:text-[#18181B]'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* MOBILE SEARCH AND COMPACT FILTER BUTTON */}
        <div 
          className="lg:hidden flex flex-col sm:flex-row gap-3 bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-2xs"
          data-component-version="admin-children-mobile-filters-v1"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search child, parent, or phone number"
              className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#18181B] placeholder-zinc-400 focus:outline-hidden focus:border-[#C59B27] focus:ring-1 focus:ring-[#C59B27] transition-all font-medium"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#18181B] p-0.5 rounded-full hover:bg-zinc-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setTempFilter(activeFilter);
              setIsFilterSheetOpen(true);
            }}
            data-component-version="admin-children-mobile-filter-trigger-v1"
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
              activeFilter !== 'all'
                ? 'bg-[#C59B27]/5 text-[#C59B27] border-[#C59B27]/30 font-bold'
                : 'bg-[#FAF9F6] text-zinc-700 border-[#EAE8E1] hover:bg-zinc-50'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filter</span>
            {activeFilter !== 'all' && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-[#C59B27] text-white rounded-full leading-none font-bold">
                1
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ERROR OR LOADING OR DATA */}
      {loading ? (
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-8 text-center shadow-2xs">
          <KoinoniaInlineLoader
            variant="skeleton"
            size="lg"
            label="Loading child records..."
            centered
          />
        </div>
      ) : error ? (
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-8 text-center shadow-2xs space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <p className="text-xs text-rose-700 font-medium">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={fetchChildren}>
            Try again
          </Button>
        </div>
      ) : children.length === 0 ? (
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-12 text-center shadow-2xs space-y-3">
          <Users className="w-10 h-10 text-zinc-300 mx-auto" />
          <p className="text-xs text-zinc-500 font-medium">No child records found for this filter.</p>
          {(searchQuery || activeFilter !== 'all') && (
            <Button type="button" variant="outline" size="sm" onClick={handleClearFilters}>
              Reset search filters
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* DESKTOP TABLE */}
          <div 
            className="hidden lg:block bg-white border border-[#EAE8E1] rounded-2xl overflow-hidden shadow-2xs"
            data-component-version="admin-children-table-v1"
            data-component-version-extra="admin-child-list-v3-actions"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1] text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Child</th>
                    <th className="py-3 px-4">Age</th>
                    <th className="py-3 px-4">Group</th>
                    <th className="py-3 px-4">Parent</th>
                    <th className="py-3 px-4">Pickup Person</th>
                    <th className="py-3 px-4 text-center">Review</th>
                    <th className="py-3 px-4">Entry</th>
                    <th className="py-3 px-4">Pickup</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-xs text-zinc-600">
                  {children.map((c) => (
                    <tr 
                      key={c.id}
                      className={`hover:bg-[#FAF9F6]/40 transition-colors ${c.isDeleted ? 'opacity-70 bg-zinc-50/50' : ''}`}
                    >
                      {/* Child info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-zinc-50 border border-[#EAE8E1] rounded-lg overflow-hidden shrink-0 flex items-center justify-center relative">
                            {c.photoUrl ? (
                              <img 
                                src={c.photoUrl} 
                                alt={c.fullName} 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Users className="w-4 h-4 text-zinc-300" />
                            )}
                          </div>
                          <div>
                            <span className="font-semibold text-zinc-800 hover:text-[#C59B27] cursor-pointer" onClick={() => setSelectedApplicationId(c.applicationId)}>
                              {c.fullName}
                            </span>
                            {/* Warnings / Badges */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.isDeleted && (
                                <span className="px-1 py-0.5 rounded-[3px] text-[8px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-tight">
                                  Removed
                                </span>
                              )}
                              {c.flags?.includes('medical_notes') && (
                                <span className="px-1 py-0.5 rounded-[3px] text-[8px] font-bold bg-rose-50 text-rose-600 border border-rose-100 uppercase tracking-tight">
                                  Medical
                                </span>
                              )}
                              {c.flags?.includes('special_support') && (
                                <span className="px-1 py-0.5 rounded-[3px] text-[8px] font-bold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-tight">
                                  Support
                                </span>
                              )}
                              {c.flags?.includes('needs_age_review') && (
                                <span className="px-1 py-0.5 rounded-[3px] text-[8px] font-bold bg-[#C59B27]/5 text-[#C59B27] border border-[#C59B27]/20 uppercase tracking-tight">
                                  Age review
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Age */}
                      <td className="py-3 px-4 font-medium text-zinc-500">
                        {c.ageLabel}, {c.gender === 'Female' ? 'F' : 'M'}
                      </td>

                      {/* Group */}
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 text-[10px] font-semibold text-[#C59B27] bg-[#C59B27]/5 border border-[#C59B27]/10 rounded">
                          {c.ageGroup}
                        </span>
                      </td>

                      {/* Parent */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-zinc-800">{c.parentName}</p>
                          <p className="text-[10px] font-mono text-zinc-400">{c.parentPhone}</p>
                        </div>
                      </td>

                      {/* Pickup Person */}
                      <td className="py-3 px-4">
                        {c.pickupPersonName ? (
                          <div className="flex items-center space-x-2">
                            <div className="w-5 h-5 bg-zinc-50 border border-zinc-100 rounded-full overflow-hidden shrink-0 flex items-center justify-center">
                              {c.pickupPersonPhotoUrl ? (
                                <img 
                                  src={c.pickupPersonPhotoUrl} 
                                  alt={c.pickupPersonName} 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <Users className="w-2.5 h-2.5 text-zinc-300" />
                              )}
                            </div>
                            <span className="font-medium text-zinc-700">{c.pickupPersonName}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-500">
                            <CameraOff className="w-3 h-3" />
                            Missing
                          </span>
                        )}
                      </td>

                      {/* Review status */}
                      <td className="py-3 px-4 text-center">
                        {getReviewStatusBadge(c.reviewStatus)}
                      </td>

                      {/* Entry status */}
                      <td className="py-3 px-4">
                        {getEntryStatusBadge(c.entryStatus)}
                      </td>

                      {/* Pickup status */}
                      <td className="py-3 px-4">
                        {getPickupStatusBadge(c.pickupStatus)}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right relative">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedApplicationId(c.applicationId)}
                            className="p-1.5 hover:bg-zinc-50 rounded-lg text-zinc-400 hover:text-[#C59B27] transition-all"
                            title="View Details"
                            data-component-version="admin-child-view-action-v2"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <div className="relative inline-block text-left">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDropdownId(activeDropdownId === c.applicationId ? null : c.applicationId);
                              }}
                              className="p-1.5 hover:bg-zinc-50 rounded-lg text-zinc-400 hover:text-zinc-600 transition-all cursor-pointer focus:outline-none"
                              title="More Actions"
                              id={`child-more-actions-trigger-${c.applicationId}`}
                              data-component-version="admin-child-more-actions-v2"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {activeDropdownId === c.applicationId && (
                              <div 
                                className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#FFFDF9] border border-[#EAE8E1] shadow-xl z-50 py-1.5 text-left focus:outline-none animate-fade-in"
                                data-view-version="admin-children-v4-actions-management"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="px-3 py-1 border-b border-zinc-100 mb-1">
                                  <span className="text-[9px] font-mono font-bold tracking-wider text-zinc-400 uppercase block">Child Management</span>
                                  <span className="text-xs font-semibold text-zinc-800 truncate block max-w-[200px]">{c.fullName}</span>
                                </div>

                                {c.isDeleted ? (
                                  <button
                                    onClick={() => {
                                      setChildToRestore(c);
                                      setActiveDropdownId(null);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-all flex items-center gap-2 cursor-pointer"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 shrink-0" /> Restore child
                                  </button>
                                ) : (
                                  <>
                                    {c.reviewStatus !== 'selected' && c.reviewStatus !== 'pass_ready' && (
                                      <button
                                        onClick={() => {
                                          handleSelectChild(c.applicationId);
                                          setActiveDropdownId(null);
                                        }}
                                        disabled={submittingActionId !== null}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                      >
                                        <Check className="w-3.5 h-3.5 shrink-0" /> Select (Approve)
                                      </button>
                                    )}

                                    {c.reviewStatus !== 'not_selected' && (
                                      <button
                                        onClick={() => {
                                          handleDeclineChild(c.applicationId);
                                          setActiveDropdownId(null);
                                        }}
                                        disabled={submittingActionId !== null}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                      >
                                        <UserX className="w-3.5 h-3.5 shrink-0" /> Not Selected (Decline)
                                      </button>
                                    )}

                                    {c.reviewStatus !== 'waiting_list' && (
                                      <button
                                        onClick={() => {
                                          handleWaitlistChild(c.applicationId);
                                          setActiveDropdownId(null);
                                        }}
                                        disabled={submittingActionId !== null}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-amber-600 hover:bg-amber-50 hover:text-amber-700 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                      >
                                        <Clock className="w-3.5 h-3.5 shrink-0" /> Waitlist (Wait)
                                      </button>
                                    )}

                                    {c.reviewStatus !== 'under_review' && (
                                      <button
                                        onClick={() => {
                                          setChildToReopen(c);
                                          setActiveDropdownId(null);
                                        }}
                                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 transition-all flex items-center gap-2 cursor-pointer"
                                      >
                                        <FileClock className="w-3.5 h-3.5 shrink-0" /> Reopen review
                                      </button>
                                    )}

                                    {c.reviewStatus === 'selected' && (
                                      <button
                                        onClick={() => {
                                          handleGeneratePass(c.childId);
                                          setActiveDropdownId(null);
                                        }}
                                        disabled={submittingActionId !== null}
                                        className="w-full text-left px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                      >
                                        <Sparkles className="w-3.5 h-3.5 shrink-0" /> Generate pass
                                      </button>
                                    )}

                                    {c.reviewStatus === 'pass_ready' && (
                                      <button
                                        onClick={() => {
                                          setChildToRevoke(c);
                                          setActiveDropdownId(null);
                                        }}
                                        className="w-full text-left px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-all flex items-center gap-2 cursor-pointer"
                                      >
                                        <Lock className="w-3.5 h-3.5 shrink-0" /> Revoke pass
                                      </button>
                                    )}

                                    <div className="h-px bg-zinc-100 my-1" />

                                    <button
                                      onClick={() => {
                                        setChildToRemove(c);
                                        setActiveDropdownId(null);
                                      }}
                                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-all flex items-center gap-2 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 shrink-0" /> Remove child
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* MOBILE RESPONSIVE CARDS */}
          <div 
            className="lg:hidden space-y-4"
            data-component-version="admin-children-mobile-cards-v2-human"
          >
            {children.map((c) => (
              <div 
                key={c.id}
                className={`bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 space-y-3.5 shadow-xs ${c.isDeleted ? 'opacity-70 bg-zinc-50/50' : ''}`}
              >
                {/* Header info */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 bg-zinc-50 border border-[#EAE8E1] rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                      {c.photoUrl ? (
                        <img 
                          src={c.photoUrl} 
                          alt={c.fullName} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Users className="w-5 h-5 text-zinc-300" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-serif text-sm font-bold text-[#18181B] truncate">
                        {c.fullName}
                      </h4>
                      <p className="text-[10px] text-zinc-500 font-medium">
                        Age {c.ageLabel} • {c.gender}
                      </p>
                    </div>
                  </div>
                  <div>
                    {getReviewStatusBadge(c.reviewStatus)}
                  </div>
                </div>

                {/* Tags / Badges if any */}
                <div className="flex flex-wrap gap-1">
                  {c.isDeleted && (
                    <span className="px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">
                      Removed
                    </span>
                  )}
                  {c.flags?.includes('medical_notes') && (
                    <span className="px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold bg-rose-50 text-rose-600 border border-rose-100 uppercase tracking-wider">
                      Medical Note
                    </span>
                  )}
                  {c.flags?.includes('special_support') && (
                    <span className="px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wider">
                      Special Support
                    </span>
                  )}
                  {c.flags?.includes('needs_age_review') && (
                    <span className="px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold bg-[#C59B27]/5 text-[#C59B27] border border-[#C59B27]/20 uppercase tracking-wider">
                      Below Event Age
                    </span>
                  )}
                </div>

                {/* Main Details (Subtle, Human Layout) */}
                <div className="space-y-2.5 text-xs text-zinc-600">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] text-zinc-400 font-medium">Age group</span>
                    <span className="font-semibold text-zinc-700">{c.ageGroup}</span>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-zinc-100 pt-2.5">
                    <span className="text-[11px] text-zinc-400 font-medium">Parent</span>
                    <span className="font-semibold text-zinc-700">{c.parentName}</span>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-zinc-100 pt-2.5">
                    <span className="text-[11px] text-zinc-400 font-medium">Today</span>
                    <span className="font-semibold text-[#C59B27]">{getTodayStatusText(c.entryStatus, c.pickupStatus)}</span>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-zinc-100 pt-2.5">
                    <span className="text-[11px] text-zinc-400 font-medium">Pickup</span>
                    <span className="font-semibold text-zinc-700">
                      {c.pickupPersonName || (
                        <span className="text-rose-500 font-medium">No pickup person assigned</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* View Details action */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={() => setSelectedApplicationId(c.applicationId)}
                  className="py-2 text-xs font-semibold border-zinc-200 text-zinc-700 hover:text-[#C59B27] transition-colors"
                >
                  View details
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* MOBILE FILTER SHEET */}
      {isFilterSheetOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs animate-fade-in"
          data-component-version="admin-children-mobile-filter-sheet-v1"
        >
          {/* Backdrop Click Dismiss */}
          <div className="absolute inset-0" onClick={() => setIsFilterSheetOpen(false)} />

          {/* Sheet Body */}
          <div className="relative bg-[#FAF9F6] w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-t sm:border border-[#EAE8E1] shadow-2xl p-5 space-y-5 animate-slide-up sm:animate-zoom-in max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]">
              <h3 className="font-serif text-base font-bold text-[#18181B]">
                Filter child records
              </h3>
              <button 
                onClick={() => setIsFilterSheetOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-full hover:bg-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Filters */}
            <div className="space-y-4 text-xs">
              {/* Group 1: Review and Entry */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  Review and entry
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'inside', label: 'Inside' },
                    { id: 'not_arrived', label: 'Not arrived' },
                    { id: 'picked_up', label: 'Picked up' }
                  ].map((f) => {
                    const isSelected = tempFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTempFilter(f.id)}
                        className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                          isSelected
                            ? 'bg-[#C59B27]/5 text-[#C59B27] border-[#C59B27] font-bold'
                            : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Group 2: Care and Attention */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                  Care and attention
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'medical_note', label: 'Medical note' },
                    { id: 'missing_pickup_photo', label: 'Missing pickup photo' },
                    { id: 'below_event_age', label: 'Below event age' },
                    { id: 'special_support', label: 'Special support' },
                    { id: 'removed', label: 'Removed' }
                  ].map((f) => {
                    const isSelected = tempFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTempFilter(f.id)}
                        className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                          isSelected
                            ? 'bg-[#C59B27]/5 text-[#C59B27] border-[#C59B27] font-bold'
                            : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#EAE8E1]">
              <button
                type="button"
                onClick={() => {
                  setTempFilter('all');
                  setActiveFilter('all');
                  setIsFilterSheetOpen(false);
                }}
                className="py-2.5 rounded-xl border border-zinc-200 text-zinc-600 font-semibold hover:bg-zinc-50 transition-colors"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveFilter(tempFilter);
                  setIsFilterSheetOpen(false);
                }}
                className="py-2.5 rounded-xl bg-[#C59B27] text-white font-semibold hover:bg-[#C59B27]/90 transition-colors shadow-sm"
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Child Reopen Review Confirmation Modal */}
      {childToReopen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" id="confirm-reopen-child-review-modal">
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs" onClick={() => setChildToReopen(null)} />
          <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-[#C59B27]">
              <FileClock className="w-5 h-5 shrink-0" />
              <h3 className="font-serif font-bold text-lg text-zinc-900">Reopen review</h3>
            </div>
            
            <p className="text-xs text-zinc-600 leading-relaxed">
              Are you sure you want to reopen the review process for <strong>{childToReopen.fullName}</strong>?
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              The child profile status will be set back to <strong>Under Review</strong>, allowing team members to make a new registration decision.
            </p>

            <form onSubmit={handleReopenReviewSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Reason (Optional)</label>
                <textarea
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Explain why the review is being reopened..."
                  className="w-full h-16 px-3 py-2 text-xs border border-zinc-200 bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all resize-none placeholder-zinc-400 text-zinc-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
                <Button
                  type="button"
                  onClick={() => setChildToReopen(null)}
                  variant="secondary"
                  className="px-4 py-2 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={submittingReopen}
                  disabled={submittingReopen}
                  className="px-5 py-2 text-xs bg-[#C59B27] hover:bg-[#B89047] hover:text-white border-none text-white font-serif font-bold cursor-pointer"
                  id="confirm-reopen-child-review-btn"
                >
                  Reopen review
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Child Confirmation Modal */}
      {childToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" id="confirm-remove-child-modal">
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs" onClick={() => setChildToRemove(null)} />
          <div className="relative bg-[#FFFDF9] border border-zinc-200 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-red-600">
              <Trash2 className="w-5 h-5 shrink-0" />
              <h3 className="font-serif font-bold text-lg text-zinc-900">Remove child record</h3>
            </div>
            
            <p className="text-xs text-zinc-600 leading-relaxed">
              Are you sure you want to remove and archive <strong>{childToRemove.fullName}</strong> from active event registration?
            </p>
            <div className="text-xs bg-red-50 text-red-700 p-3 rounded-xl border border-red-100 space-y-1">
              <span className="font-semibold block">⚠️ Important Information:</span>
              <ul className="list-disc pl-4 text-[11px] space-y-0.5 text-red-600">
                <li>This child will be soft-removed and excluded from active event rosters.</li>
                <li>Admins can view and restore this child record anytime from the Removed tab.</li>
              </ul>
            </div>

            <form onSubmit={handleRemoveChildSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Reason for Removal (Required)</label>
                <textarea
                  required
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="Explain why this child registration is being removed..."
                  className="w-full h-16 px-3 py-2 text-xs border border-zinc-200 bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/10 focus:border-red-400 transition-all resize-none placeholder-zinc-400 text-zinc-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
                <Button
                  type="button"
                  onClick={() => setChildToRemove(null)}
                  variant="secondary"
                  className="px-4 py-2 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={submittingRemove}
                  disabled={submittingRemove || !removeReason.trim()}
                  className="px-5 py-2 text-xs bg-red-600 hover:bg-red-700 hover:text-white border-none text-white font-serif font-bold cursor-pointer disabled:opacity-50"
                  id="confirm-remove-child-btn"
                >
                  Remove child
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke Child Pass Confirmation Modal */}
      {childToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" id="confirm-revoke-child-pass-modal">
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs" onClick={() => setChildToRevoke(null)} />
          <div className="relative bg-[#FFFDF9] border border-zinc-200 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-rose-700">
              <Lock className="w-5 h-5 shrink-0" />
              <h3 className="font-serif font-bold text-lg text-zinc-900">Revoke event pass</h3>
            </div>
            
            <p className="text-xs text-zinc-600 leading-relaxed">
              Are you sure you want to revoke the digital event pass for <strong>{childToRevoke.fullName}</strong>?
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              The digital pass reference will be disabled. It will no longer scan validly at check-in terminals, and parents will see that the pass has been withdrawn.
            </p>

            <form onSubmit={handleRevokePassSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Reason for Revocation (Required)</label>
                <textarea
                  required
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Specify the reason for revoking this digital event pass..."
                  className="w-full h-16 px-3 py-2 text-xs border border-zinc-200 bg-zinc-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-600/10 focus:border-rose-400 transition-all resize-none placeholder-zinc-400 text-zinc-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
                <Button
                  type="button"
                  onClick={() => setChildToRevoke(null)}
                  variant="secondary"
                  className="px-4 py-2 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={submittingRevoke}
                  disabled={submittingRevoke || !revokeReason.trim()}
                  className="px-5 py-2 text-xs bg-rose-700 hover:bg-rose-800 hover:text-white border-none text-white font-serif font-bold cursor-pointer disabled:opacity-50"
                  id="confirm-revoke-child-pass-btn"
                >
                  Revoke pass
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restore Child Confirmation Modal */}
      {childToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" id="confirm-restore-child-modal">
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs" onClick={() => setChildToRestore(null)} />
          <div className="relative bg-[#FFFDF9] border border-[#EAE8E1] rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-emerald-600">
              <RotateCcw className="w-5 h-5 shrink-0 animate-spin-reverse" />
              <h3 className="font-serif font-bold text-lg text-zinc-900">Restore child record</h3>
            </div>
            
            <p className="text-xs text-zinc-600 leading-relaxed">
              Are you sure you want to restore the child record of <strong>{childToRestore.fullName}</strong>?
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              This will return the child registration profile to active review status.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE8E1]">
              <Button
                type="button"
                onClick={() => setChildToRestore(null)}
                variant="secondary"
                className="px-4 py-2 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleRestoreChildSubmit}
                loading={submittingRestore}
                disabled={submittingRestore}
                className="px-5 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 hover:text-white border-none text-white font-serif font-bold cursor-pointer"
                id="confirm-restore-child-btn"
              >
                Restore child
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

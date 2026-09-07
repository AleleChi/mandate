import React, { useEffect, useState, useMemo } from 'react';
import { 
  Users, 
  Search, 
  MessageSquare, 
  Check, 
  X, 
  ShieldAlert, 
  Loader2, 
  ChevronLeft,
  ChevronRight, 
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { AdminReviewChildView } from './AdminReviewChildView';

interface AdminApplicationsViewProps {
  onBackToOverview?: () => void;
}

export const AdminApplicationsView: React.FC<AdminApplicationsViewProps> = ({
  onBackToOverview
}) => {
  const { showError, showSuccess } = useNotification();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tab Filters matching human workflow
  const [activeTab, setActiveTab] = useState<'review' | 'event_review' | 'needs_attention' | 'selected' | 'waiting_list' | 'not_selected'>('review');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Dynamic stats loaded from backend
  const [stats, setStats] = useState({
    sentReview: 0,
    selected: 0,
    waitingList: 0,
    notSelected: 0
  });

  // Drawer / Side Sheet state
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string>('under_review');
  const [reviewNote, setReviewNote] = useState<string>('');
  const [savingReview, setSavingReview] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  const fetchApplications = async (pageToFetch = currentPage, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.admin.getApplications({
        page: pageToFetch,
        limit,
        q: searchQuery,
        status: activeTab
      });
      if (res.success) {
        setApplications(res.applications || []);
        if (res.stats) {
          setStats(res.stats);
        }
        if (res.pagination) {
          setCurrentPage(res.pagination.page);
          setTotalPages(res.pagination.pages || 1);
          setTotalCount(res.pagination.total || 0);
        }
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Fetch Failed', parsed.message || 'Could not load administrative registrations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Trigger fetch when activeTab or currentPage changes
  useEffect(() => {
    fetchApplications(currentPage);
  }, [activeTab, currentPage]);

  // Debounce search input to avoid hammering the server
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchApplications(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset page when switching tabs
  const handleTabChange = (tab: any) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  // Open detailed side sheet drawer for child triage
  const handleOpenTriage = (app: any) => {
    setSelectedApp(app);
    setReviewStatus(app.status);
    setReviewNote(app.noteToTeam || '');
  };

  // Submit status update to backend
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    setSavingReview(true);
    try {
      const res = await api.admin.updateApplicationStatus(selectedApp.id, reviewStatus, reviewNote);
      if (res.success) {
        showSuccess('Review Confirmed', `Successfully updated ${selectedApp.child?.fullName}'s registration status.`);
        setSelectedApp(null);
        // Refresh local dataset
        await fetchApplications(currentPage, true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Update Failed', parsed.message || 'Could not save status decision.');
    } finally {
      setSavingReview(false);
    }
  };

  // Filter application rows based on active category and search query
  const filteredApplications = useMemo(() => {
    return applications;
  }, [applications]);

  const getEmptyMessage = () => {
    if (searchQuery) return 'No registrations match your search.';
    switch (activeTab) {
      case 'review':
        return 'No registrations are waiting for review.';
      case 'event_review':
        return 'No registrations are currently in review.';
      case 'needs_attention':
        return 'No registrations need attention.';
      case 'waiting_list':
        return 'No children are currently on the waiting list.';
      case 'selected':
        return 'No registrations have been selected yet.';
      case 'not_selected':
        return 'No registrations have been declined.';
      default:
        return 'No registrations found in this category.';
    }
  };

  if (selectedApplicationId) {
    return (
      <AdminReviewChildView
        applicationId={selectedApplicationId}
        onBack={() => setSelectedApplicationId(null)}
        onSave={() => {
          setSelectedApplicationId(null);
          fetchApplications(currentPage, true);
        }}
      />
    );
  }

  const statusColors: Record<string, string> = {
    under_review: 'bg-stone-50 text-stone-700 border-stone-200',
    selected: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
    pass_ready: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
    waiting_list: 'bg-amber-50 text-amber-800 border-amber-200/60',
    not_selected: 'bg-zinc-50 text-zinc-600 border-zinc-200',
    checked_in: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
    picked_up: 'bg-stone-50 text-stone-600 border-stone-200'
  };

  const statusLabels: Record<string, string> = {
    under_review: 'Awaiting review',
    selected: 'Selected',
    pass_ready: 'Pass ready',
    waiting_list: 'Waiting list',
    not_selected: 'Not selected',
    checked_in: 'Checked in',
    picked_up: 'Picked up'
  };

  return (
    <div className="space-y-6 animate-fade-in" data-view-version="admin-applications-approved-design">
      {/* HEADER ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif text-[#18181B] tracking-tight">
            Registration review
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Review submitted child registrations and make event decisions.
          </p>
        </div>
        
        <div className="flex items-center space-x-2.5">
          <Button
            type="button"
            onClick={() => fetchApplications(currentPage, true)}
            disabled={refreshing}
            className="text-xs bg-white hover:bg-zinc-50 text-[#18181B] border border-[#EAE8E1] rounded-xl font-medium cursor-pointer"
          >
            {refreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5 text-zinc-400" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
            )}
            Refresh
          </Button>
          
          {onBackToOverview && (
            <Button
              type="button"
              onClick={onBackToOverview}
              className="text-xs bg-white text-zinc-600 hover:text-zinc-900 border border-[#EAE8E1] rounded-xl font-medium hover:bg-zinc-50 cursor-pointer"
            >
              Overview
            </Button>
          )}
        </div>
      </div>

      {/* SUMMARY STATUS STRIP */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-none">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-0 md:divide-x divide-[#EAE8E1]">
          <div className="md:px-5 first:md:pl-0">
            <span className="text-xs text-zinc-500 font-medium block">Submitted</span>
            <span className="text-2xl sm:text-3xl font-semibold text-[#18181B] mt-1.5 block">{stats.sentReview}</span>
          </div>
          <div className="md:px-5">
            <span className="text-xs text-zinc-500 font-medium block">Selected</span>
            <span className="text-2xl sm:text-3xl font-semibold text-[#18181B] mt-1.5 block">{stats.selected}</span>
          </div>
          <div className="md:px-5">
            <span className="text-xs text-zinc-500 font-medium block">Waiting list</span>
            <span className="text-2xl sm:text-3xl font-semibold text-[#18181B] mt-1.5 block">{stats.waitingList}</span>
          </div>
          <div className="md:px-5 last:md:pr-0">
            <span className="text-xs text-zinc-500 font-medium block">Not selected</span>
            <span className="text-2xl sm:text-3xl font-semibold text-[#18181B] mt-1.5 block">{stats.notSelected}</span>
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-3">
        {/* Dynamic Category Tabs with antique gold underline */}
        <div className="flex items-center gap-6 overflow-x-auto">
          {[
            { id: 'review', label: 'Submitted' },
            { id: 'event_review', label: 'In review' },
            { id: 'needs_attention', label: 'Needs attention' },
            { id: 'selected', label: 'Selected' },
            { id: 'waiting_list', label: 'Waiting list' },
            { id: 'not_selected', label: 'Not selected' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id as any)}
              className={`pb-2.5 text-xs whitespace-nowrap transition-colors relative cursor-pointer ${
                activeTab === tab.id
                  ? 'text-[#18181B] font-semibold'
                  : 'text-zinc-500 hover:text-[#18181B] font-medium'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C59B27]" />
              )}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search registrations..."
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 p-0.5 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* REGISTRATION DATA TABLE */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl overflow-hidden shadow-none">
        {loading ? (
          <div className="p-8">
            <KoinoniaInlineLoader
              variant="skeleton"
              size="lg"
              label="Loading applications..."
              centered
            />
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center justify-center space-y-2">
            <Users className="w-9 h-9 text-zinc-300" />
            <h3 className="font-medium text-[#18181B] text-sm">{getEmptyMessage()}</h3>
            <p className="text-xs text-zinc-400 max-w-sm">
              {searchQuery ? 'Try adjusting your search terms or clearing the search box.' : 'When child registrations arrive or are updated, they will appear here.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1] text-xs font-semibold text-zinc-500">
                  <th className="py-3 px-4 font-medium">Child</th>
                  <th className="py-3 px-4 font-medium">Parent / guardian</th>
                  <th className="py-3 px-4 font-medium">Care information</th>
                  <th className="py-3 px-4 font-medium">Authorised pickup</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8E1] text-xs">
                {filteredApplications.map((app) => {
                  return (
                    <tr key={app.id} className="hover:bg-[#FAF9F6]/50 transition-colors">
                      {/* CHILD */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          {app.child?.photoUrl ? (
                            <img 
                              referrerPolicy="no-referrer"
                              src={app.child.photoUrl} 
                              alt={app.child.fullName} 
                              className="w-9 h-9 rounded-full object-cover border border-[#EAE8E1]"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-[#C59B27]/5 border border-[#C59B27]/15 flex items-center justify-center text-[#C59B27] font-semibold text-xs">
                              {app.child?.fullName?.charAt(0) || 'C'}
                            </div>
                          )}
                          <div className="space-y-0.5">
                            <span className="font-semibold text-[#18181B] block">{app.child?.fullName}</span>
                            <div className="flex items-center space-x-1.5 text-xs text-zinc-500">
                              <span>{app.child?.gender ? app.child.gender.charAt(0).toUpperCase() + app.child.gender.slice(1).toLowerCase() : ''}</span>
                              {app.child?.gender && <span>·</span>}
                              <span>{app.child?.ageGroup ? app.child.ageGroup.replace('to', '–') : (app.child?.age ? `Age ${app.child.age}` : '')}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* PARENT / GUARDIAN */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span className="font-medium text-[#18181B] block">{app.parent?.fullName}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-zinc-500">{app.parent?.phone}</span>
                            {app.parent?.whatsapp && (
                              <a 
                                href={`https://wa.me/${app.parent.whatsapp.replace(/\D/g, '')}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-emerald-600 hover:text-emerald-700"
                                title="Chat on WhatsApp"
                                aria-label="Chat on WhatsApp"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                          {app.parent?.isWorker && (
                            <span className="inline-block bg-zinc-100 text-zinc-600 text-[10px] font-medium px-1.5 py-0.5 rounded border border-zinc-200">
                              Worker: {app.parent.department || 'General'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CARE INFORMATION */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {app.hasMedicalNotes && (
                            <span className="inline-flex items-center bg-rose-50 border border-rose-200/60 text-rose-700 text-xs font-medium px-2 py-0.5 rounded-md">
                              Medical
                            </span>
                          )}
                          {app.needsExtraSupport && (
                            <span className="inline-flex items-center bg-rose-50 border border-rose-200/60 text-rose-700 text-xs font-medium px-2 py-0.5 rounded-md">
                              Special support
                            </span>
                          )}
                          {app.child?.needsAgeReview && (
                            <span className="inline-flex items-center bg-amber-50 border border-amber-200/60 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-md">
                              Age review
                            </span>
                          )}
                          {!app.hasMedicalNotes && !app.needsExtraSupport && !app.child?.needsAgeReview && (
                            <span className="text-xs text-zinc-400">None</span>
                          )}
                        </div>
                      </td>

                      {/* AUTHORISED PICKUP */}
                      <td className="py-3.5 px-4">
                        {app.pickupPeople && app.pickupPeople.length > 0 ? (
                          <div className="flex items-center space-x-1">
                            {app.pickupPeople.map((person: any) => (
                              <div key={person.id} className="relative group" title={`${person.fullName} (${person.relationship})`}>
                                {person.photoUrl ? (
                                  <img 
                                    referrerPolicy="no-referrer"
                                    src={person.photoUrl} 
                                    alt={person.fullName} 
                                    className="w-7 h-7 rounded-full object-cover border border-[#EAE8E1]"
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 text-xs font-medium">
                                    {person.fullName?.charAt(0) || 'P'}
                                  </div>
                                )}
                              </div>
                            ))}
                            <span className="text-xs text-zinc-400 font-medium pl-1">
                              ({app.pickupPeople.length})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400">None assigned</span>
                        )}
                      </td>

                      {/* STATUS */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusColors[app.status] || 'bg-zinc-50 text-zinc-600 border-zinc-200'}`}>
                          {statusLabels[app.status] || app.status}
                        </span>
                      </td>

                      {/* ACTION */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedApplicationId(app.id)}
                          className="text-xs font-medium text-zinc-600 hover:text-[#18181B] transition-colors cursor-pointer"
                        >
                          Review details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PAGINATION CONTROLS */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#EAE8E1] px-4 py-3.5 sm:px-6 bg-white rounded-b-2xl">
              <div className="flex flex-1 justify-between sm:hidden">
                <Button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1 || loading}
                  className="text-xs bg-white text-zinc-700 hover:bg-zinc-50 border border-[#EAE8E1]"
                >
                  Previous
                </Button>
                <Button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages || loading}
                  className="text-xs bg-white text-zinc-700 hover:bg-zinc-50 border border-[#EAE8E1]"
                >
                  Next
                </Button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-zinc-500">
                    Showing <span className="font-semibold text-zinc-800">{((currentPage - 1) * limit) + 1}</span> to{' '}
                    <span className="font-semibold text-zinc-800">
                      {Math.min(currentPage * limit, totalCount)}
                    </span>{' '}
                    of <span className="font-semibold text-zinc-800">{totalCount}</span> registrations
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-xs" aria-label="Pagination">
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1 || loading}
                      className="relative inline-flex items-center rounded-l-md px-2 py-2 text-zinc-400 ring-1 ring-inset ring-[#EAE8E1] hover:bg-zinc-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                    >
                      <span className="sr-only">Previous</span>
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`relative inline-flex items-center px-4 py-2 text-xs font-semibold focus:z-20 ${
                          currentPage === p
                            ? 'z-10 bg-[#C59B27] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C59B27]'
                            : 'text-zinc-600 ring-1 ring-inset ring-[#EAE8E1] hover:bg-zinc-50 focus:outline-offset-0'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages || loading}
                      className="relative inline-flex items-center rounded-r-md px-2 py-2 text-zinc-400 ring-1 ring-inset ring-[#EAE8E1] hover:bg-zinc-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                    >
                      <span className="sr-only">Next</span>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* REGISTRATION REVIEW SIDE DRAWER MODAL */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedApp(null)}
          />
          
          {/* Side sheet panel */}
          <div className="relative bg-white border-l border-[#EAE8E1] w-full max-w-lg shadow-2xl h-full flex flex-col z-10 animate-slide-in">
            <div className="p-5 border-b border-[#EAE8E1] flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#18181B]">
                  Registration review
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Verify details and update registration status.
                </p>
              </div>
              <button 
                onClick={() => setSelectedApp(null)}
                className="text-zinc-400 hover:text-[#18181B] p-1 rounded-lg cursor-pointer"
                aria-label="Close review"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateStatus} className="flex-1 overflow-y-auto flex flex-col">
              <div className="p-6 space-y-6 flex-1">
                
                {/* 1. VERIFICATION PHOTOS */}
                <div className="bg-[#FAF9F6] border border-[#EAE8E1] p-4 rounded-2xl">
                  <span className="text-xs font-semibold text-zinc-600 block mb-3 text-center">
                    Identity verification
                  </span>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Child Face Verification */}
                    <div className="flex flex-col items-center text-center space-y-1.5">
                      <div className="relative">
                        {selectedApp.child?.photoUrl ? (
                          <img 
                            referrerPolicy="no-referrer"
                            src={selectedApp.child.photoUrl} 
                            alt={selectedApp.child.fullName} 
                            className="w-24 h-24 rounded-2xl object-cover border-2 border-white shadow-md"
                          />
                        ) : (
                          <div className="w-24 h-24 rounded-2xl bg-[#C59B27]/5 border border-[#C59B27]/15 flex items-center justify-center text-[#C59B27] font-semibold text-lg shadow-inner">
                            {selectedApp.child?.fullName?.charAt(0) || 'C'}
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 bg-[#C59B27] text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                          Child
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-[#18181B] truncate max-w-full">
                        {selectedApp.child?.fullName}
                      </span>
                    </div>

                    {/* Authorized Pickup Person Face Verification */}
                    <div className="flex flex-col items-center text-center space-y-1.5">
                      <div className="relative">
                        {selectedApp.pickupPeople && selectedApp.pickupPeople[0]?.photoUrl ? (
                          <img 
                            referrerPolicy="no-referrer"
                            src={selectedApp.pickupPeople[0].photoUrl} 
                            alt={selectedApp.pickupPeople[0].fullName} 
                            className="w-24 h-24 rounded-2xl object-cover border-2 border-white shadow-md"
                          />
                        ) : (
                          <div className="w-24 h-24 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 font-semibold text-lg shadow-inner">
                            {selectedApp.pickupPeople && selectedApp.pickupPeople[0]?.fullName?.charAt(0) || 'P'}
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 bg-zinc-700 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                          Pickup
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-[#18181B] truncate max-w-full">
                        {selectedApp.pickupPeople && selectedApp.pickupPeople[0]?.fullName || 'No pickup person'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. CARE INFORMATION */}
                {(selectedApp.hasMedicalNotes || selectedApp.needsExtraSupport || selectedApp.child?.needsAgeReview) && (
                  <div className="bg-rose-50/70 border border-rose-200/60 p-4 rounded-xl space-y-3">
                    <div className="flex items-center space-x-2 text-rose-800">
                      <ShieldAlert className="w-4 h-4" />
                      <span className="font-semibold text-xs">Care information requiring attention</span>
                    </div>
                    <div className="text-xs space-y-2 text-rose-700 leading-relaxed">
                      {selectedApp.hasMedicalNotes && (
                        <div>
                          <span className="font-semibold">Medical notes:</span> {selectedApp.medicalNotes || 'Not stated'}
                        </div>
                      )}
                      {selectedApp.needsExtraSupport && (
                        <div>
                          <span className="font-semibold">Special support required:</span> {selectedApp.supportNotes || 'Not stated'}
                        </div>
                      )}
                      {selectedApp.child?.needsAgeReview && (
                        <div className="bg-amber-50 text-amber-800 border border-amber-200/60 p-2.5 rounded-lg mt-1">
                          <span className="font-semibold">Age check required:</span> Calculated age is {selectedApp.child.age}, but mapped age group is "{selectedApp.child.ageGroup}". Please verify correct birth date.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. APPLICATION REGISTRY INFORMATION */}
                <div className="space-y-4 text-xs">
                  <div className="pb-2.5 border-b border-zinc-100">
                    <span className="text-xs text-zinc-500 font-medium block mb-1">Parent contact details</span>
                    <div className="flex justify-between">
                      <span className="font-medium text-[#18181B]">{selectedApp.parent?.fullName}</span>
                      <span className="text-zinc-500">{selectedApp.parent?.phone}</span>
                    </div>
                  </div>

                  <div className="pb-2.5 border-b border-zinc-100">
                    <span className="text-xs text-zinc-500 font-medium block mb-1">School and class</span>
                    <div className="flex justify-between">
                      <span className="font-medium text-[#18181B]">{selectedApp.schoolName || 'Not stated'}</span>
                      <span className="text-zinc-500">{selectedApp.schoolClass || 'Not stated'}</span>
                    </div>
                  </div>

                  <div className="pb-2.5 border-b border-zinc-100">
                    <span className="text-xs text-zinc-500 font-medium block mb-1">Previous attendance</span>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Attended previous assembly?</span>
                      <span className="font-medium text-[#18181B]">{selectedApp.previousProgramme || 'No'}</span>
                    </div>
                  </div>
                </div>

                {/* 4. ACTIONS: SET STATUS AND REVIEW NOTE */}
                <div className="space-y-4 pt-4 border-t border-zinc-100">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-700 block">
                      Status decision
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'under_review', label: 'Awaiting review' },
                        { id: 'selected', label: 'Selected' },
                        { id: 'waiting_list', label: 'Waiting list' },
                        { id: 'not_selected', label: 'Not selected' },
                      ].map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setReviewStatus(st.id)}
                          className={`p-3 rounded-xl border text-left text-xs font-medium transition-all focus:outline-none cursor-pointer ${
                            reviewStatus === st.id
                              ? 'bg-[#C59B27]/5 border-[#C59B27] text-[#18181B]'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                              reviewStatus === st.id ? 'border-[#C59B27] bg-[#C59B27]' : 'border-zinc-300'
                            }`}>
                              {reviewStatus === st.id && <div className="w-1 h-1 bg-white rounded-full" />}
                            </div>
                            <span>{st.label}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 block">
                      Team note
                    </label>
                    <textarea
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="Add administrative review details, seat assignments, or special instructions..."
                      rows={3}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-white focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all"
                    />
                  </div>
                </div>

              </div>

              {/* Side sheet footer */}
              <div className="p-4 border-t border-[#EAE8E1] bg-[#FAF9F6] flex space-x-3">
                <Button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  className="flex-1 text-xs bg-white text-[#18181B] border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl font-medium cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1 text-xs rounded-xl font-semibold"
                  loading={savingReview}
                >
                  Save decision
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

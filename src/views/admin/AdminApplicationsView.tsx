import React, { useEffect, useState, useMemo } from 'react';
import { 
  Users, 
  Search, 
  MessageSquare, 
  Check, 
  X, 
  ShieldAlert, 
  FileCheck2, 
  Loader2, 
  ChevronRight, 
  AlertCircle,
  Phone,
  Clock
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
  
  // Tab Filters matching Screenshot A specs
  const [activeTab, setActiveTab] = useState<'review' | 'event_review' | 'needs_attention' | 'selected' | 'waiting_list' | 'not_selected'>('review');

  // Drawer / Side Sheet state
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string>('under_review');
  const [reviewNote, setReviewNote] = useState<string>('');
  const [savingReview, setSavingReview] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  const fetchApplications = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.admin.getApplications();
      if (res.success) {
        setApplications(res.applications || []);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Fetch Failed', parsed.message || 'Could not load administrative registrations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  // Compute live statistics based on real backend applications dataset
  const stats = useMemo(() => {
    let sentReview = 0;
    let selected = 0;
    let waitingList = 0;
    let notSelected = 0;

    applications.forEach((app) => {
      if (app.status === 'under_review') {
        sentReview++;
      } else if (app.status === 'selected' || app.status === 'pass_ready' || app.status === 'checked_in' || app.status === 'picked_up') {
        selected++;
      } else if (app.status === 'waiting_list') {
        waitingList++;
      } else if (app.status === 'not_selected') {
        notSelected++;
      }
    });

    return { sentReview, selected, waitingList, notSelected };
  }, [applications]);

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
        await fetchApplications(true);
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
    let result = [...applications];

    // 1. Terminology category filters
    if (activeTab === 'review') {
      result = result.filter((app) => app.status === 'under_review');
    } else if (activeTab === 'event_review') {
      result = result.filter((app) => ['under_review', 'selected', 'pass_ready', 'waiting_list', 'not_selected'].includes(app.status));
    } else if (activeTab === 'needs_attention') {
      result = result.filter((app) => 
        app.hasMedicalNotes || 
        app.needsExtraSupport || 
        app.child?.needsAgeReview ||
        app.pickupPeople.length === 0
      );
    } else if (activeTab === 'selected') {
      result = result.filter((app) => ['selected', 'pass_ready', 'checked_in', 'picked_up'].includes(app.status));
    } else if (activeTab === 'waiting_list') {
      result = result.filter((app) => app.status === 'waiting_list');
    } else if (activeTab === 'not_selected') {
      result = result.filter((app) => app.status === 'not_selected');
    }

    // 2. Search query matching
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((app) => 
        (app.child?.fullName || '').toLowerCase().includes(query) ||
        (app.parent?.fullName || '').toLowerCase().includes(query) ||
        (app.parent?.phone || '').includes(query) ||
        (app.schoolClass || '').toLowerCase().includes(query) ||
        (app.schoolName || '').toLowerCase().includes(query)
      );
    }

    return result;
  }, [applications, activeTab, searchQuery]);

  if (selectedApplicationId) {
    return (
      <AdminReviewChildView
        applicationId={selectedApplicationId}
        onBack={() => setSelectedApplicationId(null)}
        onSave={() => {
          setSelectedApplicationId(null);
          fetchApplications(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-view-version="admin-applications-approved-design">
      {/* HEADER ROW */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif text-[#18181B] tracking-tight">
            Children sent for review
          </h2>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-1">
            Review child details and make event decisions with care
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <Button
            type="button"
            onClick={() => fetchApplications(true)}
            disabled={refreshing}
            className="text-xs bg-white hover:bg-zinc-50 text-[#18181B] border border-[#EAE8E1]"
          >
            {refreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Users className="w-3.5 h-3.5 mr-1.5 text-[#C59B27]" />
            )}
            Refresh Grid
          </Button>
          
          {onBackToOverview && (
            <Button
              type="button"
              onClick={onBackToOverview}
              className="text-xs bg-zinc-100 text-[#18181B] hover:bg-zinc-200"
            >
              Overview Metrics
            </Button>
          )}
        </div>
      </div>

      {/* SUMMARY STATS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* SENT FOR REVIEW */}
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Sent for review</span>
            <div className="p-1.5 bg-[#C59B27]/5 rounded-lg border border-[#C59B27]/15 text-[#C59B27]">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-serif text-[#18181B] font-semibold">{stats.sentReview}</span>
            <span className="text-[10px] text-zinc-400 font-bold uppercase">Pending</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#C59B27]/40" />
        </div>

        {/* SELECTED */}
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Selected</span>
            <div className="p-1.5 bg-emerald-50 rounded-lg border border-emerald-100 text-emerald-600">
              <Check className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-serif text-[#18181B] font-semibold">{stats.selected}</span>
            <span className="text-[10px] text-emerald-600 font-bold uppercase">Approved</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500/40" />
        </div>

        {/* WAITING LIST */}
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Waiting list</span>
            <div className="p-1.5 bg-amber-50 rounded-lg border border-amber-100 text-amber-600">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-serif text-[#18181B] font-semibold">{stats.waitingList}</span>
            <span className="text-[10px] text-amber-600 font-bold uppercase">Capacity Queue</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500/40" />
        </div>

        {/* NOT SELECTED */}
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Not selected</span>
            <div className="p-1.5 bg-zinc-100 rounded-lg border border-zinc-200 text-zinc-500">
              <X className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-serif text-[#18181B] font-semibold">{stats.notSelected}</span>
            <span className="text-[10px] text-zinc-400 font-bold uppercase">Declined</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-300" />
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 flex flex-col space-y-4 md:space-y-0 md:flex-row md:items-center md:justify-between gap-4">
        {/* Dynamic Category Tabs */}
        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'review', label: 'Children sent for review' },
            { id: 'event_review', label: 'Event review' },
            { id: 'needs_attention', label: 'Needs attention' },
            { id: 'selected', label: 'Selected' },
            { id: 'waiting_list', label: 'Waiting list' },
            { id: 'not_selected', label: 'Not selected' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all focus:outline-none ${
                activeTab === tab.id
                  ? 'bg-[#C59B27] text-white'
                  : 'bg-[#FAF9F6] text-zinc-500 border border-[#EAE8E1] hover:text-[#18181B]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dynamic Search Box */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search registrations..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 p-0.5 rounded-full hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* REGISTRATION DATA TABLE */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl overflow-hidden shadow-xs">
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
          <div className="py-20 text-center flex flex-col items-center justify-center space-y-2">
            <Users className="w-10 h-10 text-zinc-300" />
            <h3 className="font-serif text-zinc-600 text-sm">No child registrations found</h3>
            <p className="text-xs text-zinc-400 max-w-sm">
              We couldn't find any child applications matching the "{activeTab.replace('_', ' ')}" filter category or your search parameters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1] text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Child Details</th>
                  <th className="py-3 px-4">Parent / Contact</th>
                  <th className="py-3 px-4">Care & Support Flags</th>
                  <th className="py-3 px-4">Pickup Persons</th>
                  <th className="py-3 px-4">Review Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8E1] text-xs">
                {filteredApplications.map((app) => {
                  const statusColors: Record<string, string> = {
                    under_review: 'bg-amber-50 text-amber-700 border-amber-100',
                    selected: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                    pass_ready: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                    waiting_list: 'bg-amber-50/70 text-amber-800 border-amber-100',
                    not_selected: 'bg-zinc-50 text-zinc-500 border-zinc-200',
                    checked_in: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                    picked_up: 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  };

                  const statusLabels: Record<string, string> = {
                    under_review: 'Review',
                    selected: 'Selected',
                    pass_ready: 'Pass Ready',
                    waiting_list: 'Waiting List',
                    not_selected: 'Not Selected',
                    checked_in: 'Checked In',
                    picked_up: 'Picked Up'
                  };

                  return (
                    <tr key={app.id} className="hover:bg-[#FAF9F6]/50 transition-colors">
                      {/* CHILD DETAILS */}
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
                            <div className="w-9 h-9 rounded-full bg-[#C59B27]/5 border border-[#C59B27]/15 flex items-center justify-center text-[#C59B27] font-semibold text-xs uppercase">
                              {app.child?.fullName?.charAt(0) || 'C'}
                            </div>
                          )}
                          <div className="space-y-0.5">
                            <span className="font-semibold text-[#18181B] block">{app.child?.fullName}</span>
                            <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400">
                              <span className="font-bold uppercase tracking-wider">{app.child?.gender}</span>
                              <span>•</span>
                              <span>{app.child?.ageGroup || `Age ${app.child?.age}`}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* PARENT / CONTACT */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span className="font-medium text-[#18181B] block">{app.parent?.fullName}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-zinc-500 font-semibold">{app.parent?.phone}</span>
                            {app.parent?.whatsapp && (
                              <a 
                                href={`https://wa.me/${app.parent.whatsapp.replace(/\D/g, '')}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-emerald-600 hover:text-emerald-700"
                                title="Chat on WhatsApp"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                          {app.parent?.isWorker && (
                            <span className="inline-block bg-[#C59B27]/5 border border-[#C59B27]/15 text-[#C59B27] text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase">
                              Worker: {app.parent.department || 'General'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CARE & SUPPORT FLAGS */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {app.hasMedicalNotes && (
                            <span className="inline-flex items-center space-x-1 bg-red-50 border border-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase">
                              <AlertCircle className="w-3 h-3" />
                              <span>Medical</span>
                            </span>
                          )}
                          {app.needsExtraSupport && (
                            <span className="inline-flex items-center space-x-1 bg-red-50 border border-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase">
                              <AlertCircle className="w-3 h-3" />
                              <span>Special Support</span>
                            </span>
                          )}
                          {app.child?.needsAgeReview && (
                            <span className="inline-flex items-center space-x-1 bg-amber-50 border border-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase">
                              <ShieldAlert className="w-3 h-3" />
                              <span>Age Review</span>
                            </span>
                          )}
                          {!app.hasMedicalNotes && !app.needsExtraSupport && !app.child?.needsAgeReview && (
                            <span className="text-[10px] text-zinc-400">None flagged</span>
                          )}
                        </div>
                      </td>

                      {/* PICKUP PERSONS */}
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
                                    className="w-7 h-7 rounded-full object-cover border border-[#EAE8E1] hover:scale-110 transition-transform"
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 text-[10px] font-semibold uppercase hover:scale-110 transition-transform">
                                    {person.fullName?.charAt(0) || 'P'}
                                  </div>
                                )}
                              </div>
                            ))}
                            <span className="text-[10px] text-zinc-400 font-semibold pl-1">
                              ({app.pickupPeople.length})
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-red-500 font-bold uppercase">No pickup assigned</span>
                        )}
                      </td>

                      {/* STATUS BADGE */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusColors[app.status] || 'bg-zinc-50 text-zinc-500'}`}>
                          {statusLabels[app.status] || app.status}
                        </span>
                      </td>

                      {/* ACTIONS */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedApplicationId(app.id)}
                          className="text-[#C59B27] font-semibold hover:underline text-xs"
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
        )}
      </div>

      {/* TRIAGE SIDE DRAWER MODAL */}
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
                <h3 className="font-serif font-bold text-[#18181B] text-base">
                  Application Triage
                </h3>
                <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">
                  Confirm review status & internal directives
                </p>
              </div>
              <button 
                onClick={() => setSelectedApp(null)}
                className="text-zinc-400 hover:text-[#18181B] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateStatus} className="flex-1 overflow-y-auto flex flex-col">
              <div className="p-6 space-y-6 flex-1">
                
                {/* 1. SIDE-BY-SIDE VERIFICATION PHOTOS */}
                <div className="bg-[#FAF9F6] border border-[#EAE8E1] p-4 rounded-2xl">
                  <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider block mb-3 text-center">
                    Security Verification Check
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
                          <div className="w-24 h-24 rounded-2xl bg-[#C59B27]/5 border border-[#C59B27]/15 flex items-center justify-center text-[#C59B27] font-semibold text-lg uppercase shadow-inner">
                            {selectedApp.child?.fullName?.charAt(0) || 'C'}
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 bg-[#C59B27] text-white text-[8px] font-bold px-1 rounded uppercase">
                          Child
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-[#18181B] truncate max-w-full">
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
                          <div className="w-24 h-24 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400 font-semibold text-lg uppercase shadow-inner">
                            {selectedApp.pickupPeople && selectedApp.pickupPeople[0]?.fullName?.charAt(0) || 'P'}
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 bg-zinc-600 text-white text-[8px] font-bold px-1 rounded uppercase">
                          Pickup
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-[#18181B] truncate max-w-full">
                        {selectedApp.pickupPeople && selectedApp.pickupPeople[0]?.fullName || 'No Pickup Person'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. WARNING BANNER FLAGS */}
                {(selectedApp.hasMedicalNotes || selectedApp.needsExtraSupport || selectedApp.child?.needsAgeReview) && (
                  <div className="bg-red-50 border border-red-100 p-4 rounded-xl space-y-3">
                    <div className="flex items-center space-x-2 text-red-800">
                      <ShieldAlert className="w-4 h-4" />
                      <span className="font-bold text-xs">Care Flags Requiring Attention</span>
                    </div>
                    <div className="text-xs space-y-2 text-red-700 leading-relaxed">
                      {selectedApp.hasMedicalNotes && (
                        <div>
                          <span className="font-bold">Medical Notes:</span> {selectedApp.medicalNotes || 'Not stated'}
                        </div>
                      )}
                      {selectedApp.needsExtraSupport && (
                        <div>
                          <span className="font-bold">Special Support Required:</span> {selectedApp.supportNotes || 'Not stated'}
                        </div>
                      )}
                      {selectedApp.child?.needsAgeReview && (
                        <div className="bg-amber-50 text-amber-800 border border-amber-100 p-2.5 rounded-lg mt-1">
                          <span className="font-bold">Age Mismatch Warning:</span> Calculated age is {selectedApp.child.age}, but mapped age group is "{selectedApp.child.ageGroup}". Please verify correct birth date.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. APPLICATION REGISTRY INFORMATION */}
                <div className="space-y-4 text-xs">
                  <div className="pb-2 border-b border-zinc-100">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block mb-1">Parent Contact Info</span>
                    <div className="flex justify-between">
                      <span className="font-semibold text-[#18181B]">{selectedApp.parent?.fullName}</span>
                      <span className="text-zinc-500">{selectedApp.parent?.phone}</span>
                    </div>
                  </div>

                  <div className="pb-2 border-b border-zinc-100">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block mb-1">Class / Education</span>
                    <div className="flex justify-between">
                      <span className="font-semibold text-[#18181B]">{selectedApp.schoolName || 'Not stated'}</span>
                      <span className="text-zinc-500">{selectedApp.schoolClass || 'Not stated'}</span>
                    </div>
                  </div>

                  <div className="pb-2 border-b border-zinc-100">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block mb-1">Program experience</span>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Attended previous assembly?</span>
                      <span className="font-bold uppercase text-[#18181B]">{selectedApp.previousProgramme || 'No'}</span>
                    </div>
                  </div>
                </div>

                {/* 4. ACTIONS: SET STATUS AND REVIEW NOTE */}
                <div className="space-y-4 pt-4 border-t border-zinc-100">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Assign Status
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'under_review', label: 'Review' },
                        { id: 'selected', label: 'Selected' },
                        { id: 'waiting_list', label: 'Waiting List' },
                        { id: 'not_selected', label: 'Not Selected' },
                      ].map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setReviewStatus(st.id)}
                          className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all focus:outline-none ${
                            reviewStatus === st.id
                              ? 'bg-[#C59B27]/5 border-[#C59B27] text-[#18181B]'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100'
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

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Internal Directive / Team Note
                    </label>
                    <textarea
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="Add administrative review details, seat assignments, or special instructions..."
                      rows={3}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all"
                    />
                  </div>
                </div>

              </div>

              {/* Side sheet footer */}
              <div className="p-4 border-t border-[#EAE8E1] bg-[#FAF9F6] flex space-x-3">
                <Button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  className="flex-1 text-xs bg-white text-[#18181B] border border-[#EAE8E1] hover:bg-zinc-50"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1 text-xs"
                  loading={savingReview}
                >
                  Confirm Review
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Search, 
  UserCheck, 
  Clock, 
  X, 
  ShieldCheck, 
  Briefcase, 
  Phone, 
  MessageSquare, 
  CheckSquare, 
  ChevronRight,
  Filter,
  Check,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';

interface AdminVolunteersViewProps {
  onBackToOverview: () => void;
}

export const AdminVolunteersView: React.FC<AdminVolunteersViewProps> = ({ onBackToOverview }) => {
  const { showError, showSuccess } = useNotification();
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  
  // Selected volunteer for detail review modal
  const [selectedVol, setSelectedVol] = useState<any | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [assignedTeam, setAssignedTeam] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const teamOptions = [
    { value: 'Teens leaders', label: 'Teens Leaders' },
    { value: 'Teens support', label: 'Teens Support' },
    { value: 'Kids age 10-12', label: 'Kids age 10-12' },
    { value: 'Kids age 7-9', label: 'Kids age 7-9' },
    { value: 'Kids age 4-6', label: 'Kids age 4-6' },
    { value: 'Toddlers (1-3 yrs)', label: 'Toddlers (1-3 yrs)' },
    { value: 'Babies (under 1)', label: 'Babies (under 1)' },
    { value: 'General assistance', label: 'General Assistance' },
    { value: 'Hospitality', label: 'Hospitality Team' },
    { value: 'Media', label: 'Media Team' }
  ];

  const fetchVolunteers = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getVolunteers({
        q: searchQuery,
        status: statusFilter,
        team: teamFilter
      });
      if (res.success) {
        setVolunteers(res.volunteers || []);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Sync Failed', parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVolunteers();
  }, [searchQuery, statusFilter, teamFilter]);

  const handleOpenReview = (vol: any) => {
    setSelectedVol(vol);
    setAssignedTeam(vol.preferredTeam || 'General assistance');
    setReviewNote(vol.note || '');
  };

  const handleCloseReview = () => {
    setSelectedVol(null);
    setReviewNote('');
    setSubmittingReview(false);
  };

  const submitDecision = async (decision: 'approved' | 'rejected') => {
    if (!selectedVol) return;
    setSubmittingReview(true);
    try {
      const res = await api.admin.reviewVolunteer(selectedVol.id, {
        status: decision,
        team: assignedTeam,
        note: reviewNote
      });
      if (res.success) {
        showSuccess(
          decision === 'approved' ? 'Volunteer Approved' : 'Application Update', 
          decision === 'approved' 
            ? `${selectedVol.fullName} is now an active volunteer on the ${assignedTeam} team.`
            : 'Application status updated to rejected.'
        );
        handleCloseReview();
        fetchVolunteers();
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action Failed', parsed.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Status metrics
  const pendingCount = volunteers.filter(v => v.status === 'pending_review').length;
  const approvedCount = volunteers.filter(v => v.status === 'approved').length;

  return (
    <div 
      className="space-y-6 animate-fade-in" 
      data-view-version="admin-volunteers-v1"
      id="admin-volunteers-module-root"
    >
      {/* 1. Header & Quick stats */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-[#EAE8E1]">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[#18181B] tracking-tight">Volunteers Registry</h2>
          <p className="text-xs text-zinc-500 mt-1">Review applicant profiles, manage ministry team assignments, and approve service accounts.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            onClick={onBackToOverview} 
            variant="secondary" 
            className="text-xs px-4 py-2"
          >
            Back to Overview
          </Button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-[#C59B27] font-bold uppercase tracking-wider">Total Applicants</span>
          <span className="text-2xl font-serif font-bold text-[#18181B] mt-2">{volunteers.length}</span>
        </div>

        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-amber-600 font-bold uppercase tracking-wider">Pending Review</span>
          <span className="text-2xl font-serif font-bold text-amber-600 mt-2">{pendingCount}</span>
        </div>

        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">Approved Members</span>
          <span className="text-2xl font-serif font-bold text-emerald-600 mt-2">{approvedCount}</span>
        </div>

        <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase tracking-wider">Assigned Teams</span>
          <span className="text-2xl font-serif font-bold text-zinc-700 mt-2">
            {new Set(volunteers.filter(v => v.status === 'approved').map(v => v.preferredTeam)).size}
          </span>
        </div>
      </div>

      {/* 2. Filters & Search */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center">
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search volunteers by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all bg-zinc-50/50"
          />
        </div>

        <div className="flex flex-wrap w-full md:w-auto items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px] font-semibold text-zinc-500">Filters:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6] text-zinc-700 min-w-32 cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="pending_review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6] text-zinc-700 min-w-36 cursor-pointer"
          >
            <option value="">All Preferred Teams</option>
            {teamOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {(searchQuery || statusFilter || teamFilter) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('');
                setTeamFilter('');
              }}
              className="text-xs font-semibold text-red-600 hover:underline shrink-0 ml-1 cursor-pointer focus:outline-none"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* 3. Volunteers List Table */}
      <div className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27]"></div>
            <p className="text-xs text-zinc-500 font-medium font-serif">Loading volunteers directory...</p>
          </div>
        ) : volunteers.length === 0 ? (
          <div className="text-center py-20 text-zinc-400 space-y-2">
            <Users className="w-8 h-8 stroke-[1.2] mx-auto text-zinc-300" />
            <h3 className="font-serif font-bold text-zinc-700 text-sm">No Volunteers Found</h3>
            <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">There are no volunteer applications matching your query in the current rosters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1] text-[#18181B] font-serif font-semibold">
                  <th className="p-4 pl-6">Volunteer Profile</th>
                  <th className="p-4">Contact Info</th>
                  <th className="p-4">Koinonia Worker</th>
                  <th className="p-4">Assigned Team</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE8E1]">
                {volunteers.map((vol) => {
                  const statusLabel = 
                    vol.status === 'approved' ? 'Approved' :
                    vol.status === 'pending_review' ? 'Pending Review' : 'Rejected';
                    
                  const statusClass = 
                    vol.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                    vol.status === 'pending_review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-zinc-100 text-zinc-600 border-zinc-200';

                  const teamLabel = teamOptions.find(o => o.value === vol.preferredTeam)?.label || vol.preferredTeam || 'Not Assigned';

                  return (
                    <tr 
                      key={vol.id} 
                      className="hover:bg-zinc-50/50 transition-colors"
                      data-volunteer-row-id={vol.id}
                    >
                      <td className="p-4 pl-6">
                        <div className="flex items-center space-x-3.5">
                          {vol.photoUrl ? (
                            <img
                              src={vol.photoUrl}
                              alt={vol.fullName}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-xl object-cover border border-zinc-200 shadow-2xs shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-[#FAF9F6] border border-[#EAE8E1] flex items-center justify-center text-zinc-400 font-bold shrink-0 text-sm uppercase">
                              {vol.fullName.substring(0, 2)}
                            </div>
                          )}

                          <div className="min-w-0">
                            <span className="font-serif font-bold text-[#18181B] block text-sm tracking-tight">{vol.fullName}</span>
                            <span className="text-[10px] text-zinc-400 block truncate">{vol.email}</span>
                          </div>
                        </div>
                      </td>

                      <td className="p-4 space-y-1">
                        <span className="block font-semibold text-zinc-700">{vol.phone || 'N/A'}</span>
                        {vol.whatsapp && (
                          <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-medium">
                            <MessageSquare className="w-3 h-3 text-emerald-500" /> WhatsApp logs active
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        {vol.isKoinoniaWorker ? (
                          <div className="space-y-0.5">
                            <span className="px-2 py-0.5 rounded bg-[#FAF6EC] border border-[#C59B27]/20 text-[#C59B27] font-semibold text-[10px] uppercase">
                              Worker
                            </span>
                            <span className="block text-[10px] text-zinc-400 truncate max-w-32">{vol.department}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-400">Regular</span>
                        )}
                      </td>

                      <td className="p-4 font-semibold text-zinc-700">
                        {teamLabel}
                      </td>

                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </td>

                      <td className="p-4 pr-6 text-right">
                        <button
                          onClick={() => handleOpenReview(vol)}
                          className="px-3.5 py-1.5 text-xs font-serif text-[#C59B27] font-bold hover:bg-[#C59B27]/5 border border-[#C59B27]/10 hover:border-[#C59B27] rounded-xl transition-all cursor-pointer focus:outline-none"
                        >
                          Review Applications
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

      {/* 4. Rich Application Review Modal (Phase 4) */}
      {selectedVol && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          id="volunteer-review-modal"
          data-testid="volunteer-review-modal"
        >
          <div 
            onClick={handleCloseReview}
            className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity" 
          />
          
          <div className="relative bg-white border border-[#EAE8E1] rounded-3xl w-full max-w-xl shadow-2xl animate-fade-in flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="h-16 px-6 border-b border-[#EAE8E1] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <UserCheck className="w-4 h-4 text-[#C59B27]" />
                <h3 className="font-serif font-bold text-lg text-[#18181B]">
                  Volunteer Application
                </h3>
              </div>
              <button 
                onClick={handleCloseReview}
                className="text-zinc-400 hover:text-[#18181B] p-1.5 rounded-xl hover:bg-zinc-50 transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scroll Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Profile Headshot and Name summary */}
              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start bg-[#FAF9F6] border border-[#EAE8E1] p-4.5 rounded-2xl">
                {selectedVol.photoUrl ? (
                  <img
                    src={selectedVol.photoUrl}
                    alt={selectedVol.fullName}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-[#C59B27]/20 shadow-xs shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 font-bold shrink-0 text-xl border border-zinc-200 uppercase">
                    {selectedVol.fullName.substring(0, 2)}
                  </div>
                )}

                <div className="text-center sm:text-left space-y-1 min-w-0">
                  <h4 className="font-serif font-bold text-lg text-[#18181B] leading-snug">{selectedVol.fullName}</h4>
                  <p className="text-[11px] text-zinc-500 font-medium">{selectedVol.email}</p>
                  
                  <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start pt-1">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wide border uppercase ${
                      selectedVol.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      selectedVol.status === 'pending_review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-zinc-100 text-zinc-600 border-zinc-200'
                    }`}>
                      {selectedVol.status === 'approved' ? 'Active Volunteer' : selectedVol.status === 'pending_review' ? 'Pending Review' : 'Rejected'}
                    </span>
                    
                    {selectedVol.isKoinoniaWorker && (
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wide bg-amber-50 text-amber-800 border border-amber-100 uppercase">
                        Koinonia Staff Worker
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Registration Data Fields */}
              <div className="space-y-3.5">
                <h5 className="text-[10px] font-mono font-bold text-[#C59B27] uppercase tracking-wider">Volunteer details</h5>
                
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1 bg-zinc-50/50 p-2.5 rounded-xl border border-zinc-100">
                    <span className="text-zinc-400 font-medium block text-[10px]">Primary Contact Phone</span>
                    <span className="font-semibold text-zinc-800 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-zinc-400" /> {selectedVol.phone || 'None'}
                    </span>
                  </div>

                  <div className="space-y-1 bg-zinc-50/50 p-2.5 rounded-xl border border-zinc-100">
                    <span className="text-zinc-400 font-medium block text-[10px]">WhatsApp contact</span>
                    <span className="font-semibold text-zinc-800 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-zinc-400" /> {selectedVol.whatsapp || 'None'}
                    </span>
                  </div>

                  {selectedVol.isKoinoniaWorker && (
                    <div className="col-span-2 space-y-1 bg-[#FFFDF5] p-2.5 rounded-xl border border-[#F5E6BE]/40">
                      <span className="text-zinc-400 font-medium block text-[10px]">Parish/Staff Department</span>
                      <span className="font-semibold text-[#18181B] flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-[#C59B27]" /> {selectedVol.department || 'Not specified'}
                      </span>
                    </div>
                  )}

                  <div className="col-span-2 space-y-1 bg-zinc-50/50 p-3 rounded-xl border border-zinc-100">
                    <span className="text-zinc-400 font-medium block text-[10px] flex items-center gap-1">
                      <CheckSquare className="w-3.5 h-3.5 text-zinc-400" /> Past serving experience
                    </span>
                    <p className="text-zinc-700 italic leading-relaxed text-[11px] whitespace-pre-line bg-white/70 p-2.5 rounded-lg border border-zinc-100 mt-1">
                      {selectedVol.servingExperience || "Applicant did not supply a specific narrative of past ministry experiences."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Board: Team Assignment & Admin Notes */}
              <div className="border-t border-[#EAE8E1] pt-4.5 space-y-4">
                <h5 className="text-[10px] font-mono font-bold text-[#C59B27] uppercase tracking-wider">Ministry Team Assignment</h5>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
                      Assign to Service Team
                    </label>
                    <select
                      value={assignedTeam}
                      onChange={(e) => setAssignedTeam(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:border-[#C59B27] bg-[#FAF9F6] text-zinc-800"
                    >
                      {teamOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
                      Review Decision Memo (Optional notes sent internally)
                    </label>
                    <textarea
                      placeholder="Add an internal review note regarding this volunteer application..."
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      rows={2}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-[#EAE8E1] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/10 focus:border-[#C59B27] transition-all bg-zinc-50/50 resize-none text-zinc-700"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Decisions */}
            <div className="h-20 border-t border-[#EAE8E1] bg-[#FAF9F6] px-6 rounded-b-3xl flex items-center justify-between">
              <Button
                onClick={() => submitDecision('rejected')}
                loading={submittingReview}
                disabled={submittingReview}
                className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 text-xs font-semibold rounded-xl focus:outline-none"
              >
                Reject Application
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleCloseReview}
                  variant="secondary"
                  className="px-4 py-2 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => submitDecision('approved')}
                  loading={submittingReview}
                  disabled={submittingReview}
                  variant="primary"
                  className="px-5 py-2 text-xs flex items-center gap-1 bg-[#C59B27] hover:bg-[#B89047] text-white rounded-xl"
                >
                  <Check className="w-3.5 h-3.5 shrink-0" /> Approve Application
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

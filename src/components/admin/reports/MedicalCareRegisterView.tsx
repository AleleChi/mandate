import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Download,
  RefreshCw,
  User,
  Loader2,
  X,
  Phone,
  MessageSquare,
  AlertTriangle,
  HeartPulse,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MapPin,
  ExternalLink,
  CheckCircle2,
  Clock,
  Info,
  Calendar,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import { api } from '../../../services/api';
import { useNotification } from '../../../context/NotificationContext';

export interface MedicalCareRegisterViewProps {
  eventId?: string;
  onNavigate?: (route: string) => void;
  onViewChild?: (childId: string, applicationId?: string) => void;
}

export const MedicalCareRegisterView: React.FC<MedicalCareRegisterViewProps> = ({
  eventId,
  onNavigate,
  onViewChild
}) => {
  const { showSuccess, showError } = useNotification();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [eventInfo, setEventInfo] = useState<{ id: string; title: string; generatedAtWAT: string }>({
    id: eventId || 'event-ga-2026',
    title: 'The General Assembly 2026',
    generatedAtWAT: ''
  });

  const [summary, setSummary] = useState({
    totalRegistered: 0,
    withCareConcerns: 0,
    allergyMentions: 0,
    otherMedicalNotes: 0,
    supportRequested: 0,
    bothMedicalAndSupport: 0,
    requiresClarification: 0,
    careNotesInsideOrCheckedIn: 0,
    careNotesNotArrived: 0,
    careNotesPickedUp: 0,
    noConcernReported: 0,
    ageGroupBreakdown: [] as Array<{
      ageGroup: string;
      total: number;
      withCareConcerns: number;
      allergyMentions: number;
      otherMedical: number;
      supportRequested: number;
      checkedIn: number;
    }>,
    locationBreakdown: [] as Array<{
      locationName: string;
      total: number;
      withCareConcerns: number;
      allergyMentions: number;
      otherMedical: number;
      supportRequested: number;
    }>,
    attendanceBreakdown: {
      not_arrived: 0,
      checked_in: 0,
      inside: 0,
      picked_up: 0
    }
  });

  const [children, setChildren] = useState<any[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [careConcernFilter, setCareConcernFilter] = useState('with_concerns'); // Default: 'with_concerns'
  const [ageGroupFilter, setAgeGroupFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState('all');
  const [passStatusFilter, setPassStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('concern_priority');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // UI Accordions
  const [showAgeBreakdown, setShowAgeBreakdown] = useState(false);
  const [showLocationBreakdown, setShowLocationBreakdown] = useState(false);

  // Detail Drawer Modal
  const [selectedChild, setSelectedChild] = useState<any | null>(null);

  // Export Loading States
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch report data
  const fetchRegisterData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await api.admin.getMedicalCareRegister({
        eventId,
        page,
        pageSize,
        search: debouncedSearch,
        careConcern: careConcernFilter,
        ageGroup: ageGroupFilter,
        location: locationFilter,
        attendanceStatus: attendanceStatusFilter,
        passStatus: passStatusFilter,
        sort: sortOrder
      });

      if (res && res.success) {
        if (res.event) {
          setEventInfo(res.event);
        }
        if (res.summary) {
          setSummary(res.summary);
        }
        setChildren(res.children || []);
        if (res.pagination) {
          setTotalRecords(res.pagination.totalRecords || 0);
          setTotalPages(res.pagination.totalPages || 1);
        }
      } else {
        setError('We could not load the Allergy & Medical Care Register.');
      }
    } catch (err: any) {
      console.error('Failed to load Allergy & Medical Care Register:', err);
      setError(err?.message || 'Access denied or server error loading medical register.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    eventId,
    page,
    pageSize,
    debouncedSearch,
    careConcernFilter,
    ageGroupFilter,
    locationFilter,
    attendanceStatusFilter,
    passStatusFilter,
    sortOrder
  ]);

  useEffect(() => {
    fetchRegisterData();
  }, [fetchRegisterData]);

  // Export PDF Handler
  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      await api.admin.downloadMedicalCareExport('pdf', {
        eventId,
        search: debouncedSearch,
        careConcern: careConcernFilter,
        ageGroup: ageGroupFilter,
        location: locationFilter,
        attendanceStatus: attendanceStatusFilter,
        passStatus: passStatusFilter,
        sort: sortOrder
      });
      showSuccess('PDF Downloaded', 'Allergy & Medical Care Register PDF has been downloaded.');
    } catch (err: any) {
      console.error(err);
      showError('Export Failed', err?.message || 'Could not download PDF report.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Export CSV Handler
  const handleExportCsv = async () => {
    try {
      setExportingCsv(true);
      await api.admin.downloadMedicalCareExport('csv', {
        eventId,
        search: debouncedSearch,
        careConcern: careConcernFilter,
        ageGroup: ageGroupFilter,
        location: locationFilter,
        attendanceStatus: attendanceStatusFilter,
        passStatus: passStatusFilter,
        sort: sortOrder
      });
      showSuccess('Spreadsheet Exported', 'Allergy & Medical Care Register CSV downloaded successfully.');
    } catch (err: any) {
      console.error(err);
      showError('Export Failed', err?.message || 'Could not export spreadsheet.');
    } finally {
      setExportingCsv(false);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setCareConcernFilter('with_concerns');
    setAgeGroupFilter('all');
    setLocationFilter('all');
    setAttendanceStatusFilter('all');
    setPassStatusFilter('all');
    setSortOrder('concern_priority');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    debouncedSearch ||
    careConcernFilter !== 'with_concerns' ||
    ageGroupFilter !== 'all' ||
    locationFilter !== 'all' ||
    attendanceStatusFilter !== 'all' ||
    passStatusFilter !== 'all' ||
    sortOrder !== 'concern_priority'
  );

  return (
    <div className="space-y-6 pb-16 text-stone-900 dark:text-[#F0EBE3]" id="allergy-medical-care-register">
      {/* 1. TOP HEADER & CONFIDENTIALITY NOTICE */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-stone-200 dark:border-[#302E29] rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg">
                <HeartPulse className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-[#F0EBE3]">
                Allergy & Medical Care Register
              </h1>
            </div>
            <p className="text-xs text-stone-500 dark:text-[#8A847A] mt-1 font-medium">
              {eventInfo.title} · Live Session Operations
            </p>
            {eventInfo.generatedAtWAT && (
              <p className="text-[11px] text-stone-400 dark:text-[#6A6560] mt-0.5">
                Report generated: {eventInfo.generatedAtWAT}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => fetchRegisterData(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-stone-200 dark:border-[#383630] bg-white dark:bg-[#21211E] text-stone-700 dark:text-[#C5BFB5] hover:bg-stone-50 dark:hover:bg-[#282724] transition-colors cursor-pointer disabled:opacity-50"
              id="btn-refresh-medical-register"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#C59B27]' : ''}`} />
              Refresh
            </button>

            <button
              onClick={handleExportCsv}
              disabled={exportingCsv || loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-stone-200 dark:border-[#383630] bg-white dark:bg-[#21211E] text-stone-700 dark:text-[#C5BFB5] hover:bg-stone-50 dark:hover:bg-[#282724] transition-colors cursor-pointer disabled:opacity-50"
              id="btn-export-medical-csv"
            >
              {exportingCsv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
              Export Spreadsheet
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#C59B27] hover:bg-[#b58e22] text-white shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              id="btn-download-medical-pdf"
            >
              {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              Download Landscape PDF
            </button>
          </div>
        </div>

        {/* Confidential Security Banner */}
        <div className="bg-red-50/80 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg p-3 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <div className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            <span className="font-semibold">Confidential Safeguarding & Medical Record:</span> Access is strictly restricted to Super Administrators, authorised Safeguarding Leads, and Medical Personnel. This register contains emergency health and parent contact information. All viewings and downloads are logged for safeguarding compliance.
          </div>
        </div>
      </div>

      {/* 2. LIVE SUMMARY STATISTICS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Registered */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-stone-200/80 dark:border-[#302E29] rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-stone-500 dark:text-[#8A847A] uppercase tracking-wider block">
            Total Registered
          </span>
          <div className="text-2xl font-bold text-stone-900 dark:text-[#F0EBE3]">
            {summary.totalRegistered}
          </div>
          <p className="text-[10px] text-stone-400">All event children</p>
        </div>

        {/* Care Concerns Reported (Highlight) */}
        <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
            Care Concerns
          </span>
          <div className="text-2xl font-bold text-amber-900 dark:text-amber-200">
            {summary.withCareConcerns}
          </div>
          <p className="text-[10px] text-amber-700 dark:text-amber-400">Medical / allergy / support</p>
        </div>

        {/* Allergy Mentions */}
        <div className="bg-red-50/60 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/40 rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-red-800 dark:text-red-300 uppercase tracking-wider block">
            Allergy Mentions
          </span>
          <div className="text-2xl font-bold text-red-900 dark:text-red-200">
            {summary.allergyMentions}
          </div>
          <p className="text-[10px] text-red-700 dark:text-red-400">Requires verification</p>
        </div>

        {/* Other Medical Notes */}
        <div className="bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/40 rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider block">
            Other Medical
          </span>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">
            {summary.otherMedicalNotes}
          </div>
          <p className="text-[10px] text-blue-700 dark:text-blue-400">Conditions & medications</p>
        </div>

        {/* Extra Support Requested */}
        <div className="bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/40 rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-purple-800 dark:text-purple-300 uppercase tracking-wider block">
            Extra Support
          </span>
          <div className="text-2xl font-bold text-purple-900 dark:text-purple-200">
            {summary.supportRequested}
          </div>
          <p className="text-[10px] text-purple-700 dark:text-purple-400">Assistance notes</p>
        </div>

        {/* Requires Clarification */}
        <div className="bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200/80 dark:border-orange-900/40 rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] font-semibold text-orange-800 dark:text-orange-300 uppercase tracking-wider block">
            Needs Clarification
          </span>
          <div className="text-2xl font-bold text-orange-900 dark:text-orange-200">
            {summary.requiresClarification}
          </div>
          <p className="text-[10px] text-orange-700 dark:text-orange-400">Incomplete / unconfirmed</p>
        </div>
      </div>

      {/* Attendance Status Bar for Children with Care Notes */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-stone-200/80 dark:border-[#302E29] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-stone-800 dark:text-[#F0EBE3]">Live Attendance of Care Audience:</span>
          <span className="text-stone-500">({summary.withCareConcerns} children total)</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="font-medium text-stone-700 dark:text-[#C5BFB5]">Checked in / Inside:</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400">{summary.careNotesInsideOrCheckedIn}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="font-medium text-stone-700 dark:text-[#C5BFB5]">Not arrived yet:</span>
            <span className="font-bold text-amber-700 dark:text-amber-400">{summary.careNotesNotArrived}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="font-medium text-stone-700 dark:text-[#C5BFB5]">Picked up:</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">{summary.careNotesPickedUp}</span>
          </div>
        </div>
      </div>

      {/* 3. COLLAPSIBLE BREAKDOWN ACCORDIONS */}
      <div className="space-y-3">
        {/* Age Group Breakdown */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-stone-200/80 dark:border-[#302E29] rounded-xl overflow-hidden">
          <button
            onClick={() => setShowAgeBreakdown(prev => !prev)}
            className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-stone-50/60 dark:hover:bg-[#252522] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-stone-900 dark:text-[#F0EBE3]">
                Care Concerns by Age Cohort
              </span>
              <span className="text-xs text-stone-500">({summary.ageGroupBreakdown.length} cohorts)</span>
            </div>
            {showAgeBreakdown ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
          </button>

          {showAgeBreakdown && (
            <div className="px-5 pb-5 pt-1 overflow-x-auto border-t border-stone-100 dark:border-[#2C2A26]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-[#302E29] text-stone-500 dark:text-[#7A7570]">
                    <th className="py-2.5 font-semibold">Cohort</th>
                    <th className="py-2.5 font-semibold">Total Registered</th>
                    <th className="py-2.5 font-semibold text-amber-700 dark:text-amber-400">With Care Concerns</th>
                    <th className="py-2.5 font-semibold text-red-700 dark:text-red-400">Allergy Mentions</th>
                    <th className="py-2.5 font-semibold text-blue-700 dark:text-blue-400">Other Medical</th>
                    <th className="py-2.5 font-semibold text-purple-700 dark:text-purple-400">Extra Support</th>
                    <th className="py-2.5 font-semibold text-emerald-700 dark:text-emerald-400">Checked In / Inside</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-[#2C2A26]">
                  {summary.ageGroupBreakdown.map((g) => (
                    <tr key={g.ageGroup} className="hover:bg-stone-50/50 dark:hover:bg-[#252522]">
                      <td className="py-2 font-medium text-stone-800 dark:text-[#F0EBE3]">{g.ageGroup}</td>
                      <td className="py-2 text-stone-600 dark:text-[#A0988C]">{g.total}</td>
                      <td className="py-2 font-semibold text-amber-800 dark:text-amber-300">{g.withCareConcerns}</td>
                      <td className="py-2 font-semibold text-red-800 dark:text-red-300">{g.allergyMentions}</td>
                      <td className="py-2 text-blue-800 dark:text-blue-300">{g.otherMedical}</td>
                      <td className="py-2 text-purple-800 dark:text-purple-300">{g.supportRequested}</td>
                      <td className="py-2 font-medium text-emerald-700 dark:text-emerald-400">{g.checkedIn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Location Breakdown */}
        <div className="bg-white dark:bg-[#1D1D1A] border border-stone-200/80 dark:border-[#302E29] rounded-xl overflow-hidden">
          <button
            onClick={() => setShowLocationBreakdown(prev => !prev)}
            className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-stone-50/60 dark:hover:bg-[#252522] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-stone-900 dark:text-[#F0EBE3]">
                Care Concerns by Assigned Room / Location
              </span>
              <span className="text-xs text-stone-500">({summary.locationBreakdown.length} rooms)</span>
            </div>
            {showLocationBreakdown ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
          </button>

          {showLocationBreakdown && (
            <div className="px-5 pb-5 pt-1 overflow-x-auto border-t border-stone-100 dark:border-[#2C2A26]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-[#302E29] text-stone-500 dark:text-[#7A7570]">
                    <th className="py-2.5 font-semibold">Location / Room</th>
                    <th className="py-2.5 font-semibold">Total Registered</th>
                    <th className="py-2.5 font-semibold text-amber-700 dark:text-amber-400">With Care Concerns</th>
                    <th className="py-2.5 font-semibold text-red-700 dark:text-red-400">Allergy Mentions</th>
                    <th className="py-2.5 font-semibold text-blue-700 dark:text-blue-400">Other Medical</th>
                    <th className="py-2.5 font-semibold text-purple-700 dark:text-purple-400">Extra Support</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-[#2C2A26]">
                  {summary.locationBreakdown.map((loc) => (
                    <tr key={loc.locationName} className="hover:bg-stone-50/50 dark:hover:bg-[#252522]">
                      <td className="py-2 font-medium text-stone-800 dark:text-[#F0EBE3]">{loc.locationName}</td>
                      <td className="py-2 text-stone-600 dark:text-[#A0988C]">{loc.total}</td>
                      <td className="py-2 font-semibold text-amber-800 dark:text-amber-300">{loc.withCareConcerns}</td>
                      <td className="py-2 font-semibold text-red-800 dark:text-red-300">{loc.allergyMentions}</td>
                      <td className="py-2 text-blue-800 dark:text-blue-300">{loc.otherMedical}</td>
                      <td className="py-2 text-purple-800 dark:text-purple-300">{loc.supportRequested}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 4. FILTER BAR */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-stone-200/80 dark:border-[#302E29] rounded-xl p-4 space-y-3.5 shadow-2xs">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search child, parent, phone, WhatsApp, email, or care note keyword…"
              className="w-full text-xs pl-9 pr-8 py-2.5 bg-stone-50 dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg text-stone-900 dark:text-[#F0EBE3] placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              id="input-search-medical-register"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Care Concern Dropdown (Section 6) */}
          <div className="w-full sm:w-auto">
            <select
              value={careConcernFilter}
              onChange={(e) => {
                setCareConcernFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-60 text-xs py-2.5 px-3 bg-stone-50 dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg text-stone-800 dark:text-[#F0EBE3] font-medium focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
              id="select-care-concern-filter"
            >
              <option value="with_concerns">Children with Care Concerns (Default)</option>
              <option value="allergies_only">Allergies Only (Requires verification)</option>
              <option value="other_medical_only">Other Medical Only</option>
              <option value="support_only">Additional Support Only</option>
              <option value="both_medical_and_support">Both Medical & Support</option>
              <option value="needs_clarification">Needs Clarification / Incomplete</option>
              <option value="no_concerns">No Concerns Reported</option>
              <option value="all">All Registered Children</option>
            </select>
          </div>
        </div>

        {/* Secondary Filter Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          {/* Age Group */}
          <div>
            <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block mb-1">
              Age Cohort
            </label>
            <select
              value={ageGroupFilter}
              onChange={(e) => {
                setAgeGroupFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-2.5 bg-stone-50 dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg text-stone-800 dark:text-[#F0EBE3]"
            >
              <option value="all">All Cohorts</option>
              <option value="2–3">2–3 years</option>
              <option value="4–6">4–6 years</option>
              <option value="7–9">7–9 years</option>
              <option value="10–12">10–12 years</option>
              <option value="13–14">13–14 years</option>
              <option value="Age review needed">Age Review Needed</option>
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block mb-1">
              Assigned Room
            </label>
            <select
              value={locationFilter}
              onChange={(e) => {
                setLocationFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-2.5 bg-stone-50 dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg text-stone-800 dark:text-[#F0EBE3]"
            >
              <option value="all">All Rooms</option>
              {summary.locationBreakdown.map((loc) => (
                <option key={loc.locationName} value={loc.locationName}>
                  {loc.locationName}
                </option>
              ))}
            </select>
          </div>

          {/* Attendance */}
          <div>
            <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block mb-1">
              Attendance
            </label>
            <select
              value={attendanceStatusFilter}
              onChange={(e) => {
                setAttendanceStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-2.5 bg-stone-50 dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg text-stone-800 dark:text-[#F0EBE3]"
            >
              <option value="all">All Attendance</option>
              <option value="not_arrived">Not Arrived</option>
              <option value="checked_in">Checked In</option>
              <option value="inside">Inside Venue</option>
              <option value="picked_up">Picked Up</option>
            </select>
          </div>

          {/* Pass Status */}
          <div>
            <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block mb-1">
              Pass Status
            </label>
            <select
              value={passStatusFilter}
              onChange={(e) => {
                setPassStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-2.5 bg-stone-50 dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg text-stone-800 dark:text-[#F0EBE3]"
            >
              <option value="all">All Pass Status</option>
              <option value="pass_ready">Pass Ready</option>
              <option value="missing_pass">Missing Pass</option>
            </select>
          </div>

          {/* Sort Order */}
          <div>
            <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block mb-1">
              Sort Order
            </label>
            <select
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-2.5 bg-stone-50 dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg text-stone-800 dark:text-[#F0EBE3]"
            >
              <option value="concern_priority">Care Concern Priority</option>
              <option value="name_asc">Name (A → Z)</option>
              <option value="name_desc">Name (Z → A)</option>
              <option value="age_asc">Age (Youngest first)</option>
              <option value="age_desc">Age (Oldest first)</option>
            </select>
          </div>

          {/* Page Size */}
          <div>
            <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block mb-1">
              Records Per Page
            </label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="w-full py-1.5 px-2.5 bg-stone-50 dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg text-stone-800 dark:text-[#F0EBE3]"
            >
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
              <option value={200}>200 per page</option>
            </select>
          </div>
        </div>

        {/* Active Filter Clear */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-[#2C2A26] text-xs">
            <span className="text-stone-500">
              Showing filtered results ({totalRecords} matching records)
            </span>
            <button
              onClick={handleResetFilters}
              className="text-[#C59B27] dark:text-amber-400 hover:underline font-medium cursor-pointer"
            >
              Reset to default
            </button>
          </div>
        )}
      </div>

      {/* 5. DATA TABLE / REGISTER */}
      <div className="bg-white dark:bg-[#1D1D1A] border border-stone-200 dark:border-[#302E29] rounded-xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 min-h-[35vh] space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#C59B27]" />
            <p className="text-xs text-stone-500">Loading Allergy & Medical Care Register…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-12 min-h-[35vh] text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <p className="text-sm font-medium text-stone-800 dark:text-[#F0EBE3]">{error}</p>
            <button
              onClick={() => fetchRegisterData()}
              className="text-xs px-4 py-2 bg-[#C59B27] text-white rounded-lg font-medium"
            >
              Try again
            </button>
          </div>
        ) : children.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 min-h-[35vh] text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            <p className="text-sm font-medium text-stone-800 dark:text-[#F0EBE3]">
              No children match the selected care criteria.
            </p>
            <p className="text-xs text-stone-500 max-w-sm">
              Try adjusting your filter settings or search query to view other registered participants.
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="text-xs px-3.5 py-1.5 bg-stone-100 dark:bg-[#262520] text-stone-700 dark:text-[#C5BFB5] rounded-lg font-medium"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" aria-label="Allergy & Medical Care Register">
              <thead>
                <tr className="bg-stone-50 dark:bg-[#21211E] border-b border-stone-200 dark:border-[#302E29]">
                  <th className="py-3 px-4 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Child</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Room / Location</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Reported Care Notes</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Parent & Pickup Contacts</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Attendance</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-stone-500 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#302E29]">
                {children.map((c) => {
                  return (
                    <tr
                      key={c.childId}
                      className="hover:bg-stone-50/60 dark:hover:bg-[#262520]/60 transition-colors"
                    >
                      {/* Child Profile Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-3">
                          {c.photoUrl ? (
                            <img
                              src={c.photoUrl}
                              alt={c.fullName}
                              className="w-10 h-10 rounded-full object-cover shrink-0 border border-stone-200 dark:border-[#383630]"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-[#262520] text-stone-500 dark:text-[#A0988C] flex items-center justify-center font-bold text-xs shrink-0 border border-stone-200 dark:border-[#383630]">
                              {c.fullName.slice(0, 2).toUpperCase()}
                            </div>
                          )}

                          <div className="space-y-0.5">
                            <span className="text-sm font-semibold text-stone-900 dark:text-[#F0EBE3] block">
                              {c.fullName}
                            </span>
                            <div className="text-xs text-stone-500 dark:text-[#A0988C]">
                              {c.age} yrs · {c.gender} · {c.ageGroup}
                            </div>
                            {c.passReference && (
                              <span className="inline-block text-[10px] font-mono font-semibold px-1.5 py-0.2 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 rounded border border-amber-200/60">
                                Pass: {c.passReference}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Location Column */}
                      <td className="py-3.5 px-4 text-xs">
                        <div className="space-y-0.5">
                          <span className="font-medium text-stone-800 dark:text-[#F0EBE3] flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                            {c.assignedLocation}
                          </span>
                          {c.schoolName && (
                            <span className="text-[11px] text-stone-400 block">
                              {c.schoolName} {c.schoolClass ? `(${c.schoolClass})` : ''}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Care Notes Column (Highlighting Allergy Mentions distinctly) */}
                      <td className="py-3.5 px-4 text-xs max-w-xs">
                        <div className="space-y-1.5">
                          {/* Badges */}
                          <div className="flex flex-wrap gap-1">
                            {c.hasAllergyMention && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900/50">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Allergy Mentioned
                              </span>
                            )}
                            {c.hasOtherMedicalNotes && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
                                <HeartPulse className="w-2.5 h-2.5" />
                                Medical Note
                              </span>
                            )}
                            {c.needsExtraSupport && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-900/50">
                                Extra Support
                              </span>
                            )}
                            {c.requiresClarification && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-900/50">
                                Clarification Needed
                              </span>
                            )}
                          </div>

                          {/* Raw Notes Snippet */}
                          {c.rawMedicalNotes ? (
                            <p className="text-xs text-stone-700 dark:text-[#C5BFB5] line-clamp-2 leading-relaxed bg-stone-50 dark:bg-[#252522] p-1.5 rounded border border-stone-200/60 dark:border-[#383630]">
                              {c.rawMedicalNotes}
                            </p>
                          ) : c.hasAllergyMention || c.hasOtherMedicalNotes ? (
                            <span className="text-[11px] text-amber-700 italic block">
                              Reported without specific text
                            </span>
                          ) : null}

                          {c.rawSupportNotes && (
                            <p className="text-[11px] text-purple-900 dark:text-purple-300 line-clamp-2 bg-purple-50/50 dark:bg-purple-950/20 p-1.5 rounded border border-purple-200/50">
                              <span className="font-semibold">Support:</span> {c.rawSupportNotes}
                            </p>
                          )}

                          {!c.rawMedicalNotes && !c.rawSupportNotes && !c.hasMedicalNotes && !c.needsExtraSupport && (
                            <span className="text-[11px] text-stone-400">None reported</span>
                          )}
                        </div>
                      </td>

                      {/* Parent & Pickup Contacts */}
                      <td className="py-3.5 px-4 text-xs">
                        <div className="space-y-1">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-stone-900 dark:text-[#F0EBE3] block">
                              {c.parent.fullName} ({c.parent.relationship})
                            </span>
                            <div className="flex flex-wrap items-center gap-2 text-stone-600 dark:text-[#A0988C]">
                              {c.parent.phone && (
                                <a
                                  href={`tel:${c.parent.phone}`}
                                  className="inline-flex items-center gap-1 hover:text-[#C59B27] transition-colors"
                                  title="Call Parent"
                                >
                                  <Phone className="w-3 h-3 text-stone-400" />
                                  <span>{c.parent.phone}</span>
                                </a>
                              )}
                              {c.parent.whatsapp && (
                                <a
                                  href={`https://wa.me/${c.parent.whatsapp.replace(/[^0-9]/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 hover:text-emerald-600 transition-colors"
                                  title="WhatsApp Parent"
                                >
                                  <MessageSquare className="w-3 h-3 text-emerald-500" />
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Pickup Person */}
                          <div className="text-[11px] text-stone-500 dark:text-[#7A7570] border-t border-stone-100 dark:border-[#2C2A26] pt-1">
                            <span className="font-medium text-stone-700 dark:text-[#C5BFB5]">Pickup:</span>{' '}
                            {c.pickupPerson.fullName} ({c.pickupPerson.relationship})
                            {c.pickupPerson.phone && (
                              <a
                                href={`tel:${c.pickupPerson.phone}`}
                                className="ml-1.5 text-stone-600 dark:text-[#A0988C] hover:text-[#C59B27]"
                              >
                                {c.pickupPerson.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Attendance Status */}
                      <td className="py-3.5 px-4 text-xs">
                        <div className="space-y-1">
                          {c.attendanceStatus === 'inside' || c.attendanceStatus === 'checked_in' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
                              <CheckCircle2 className="w-3 h-3" />
                              Checked In
                            </span>
                          ) : c.attendanceStatus === 'picked_up' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-[#252522] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#383630]">
                              Picked Up
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40">
                              <Clock className="w-3 h-3" />
                              Not Arrived
                            </span>
                          )}

                          {c.checkedInAtWAT && (
                            <span className="text-[10px] text-stone-400 block">
                              In: {c.checkedInAtWAT.replace(' WAT', '')}
                            </span>
                          )}
                          {c.pickedUpAtWAT && (
                            <span className="text-[10px] text-stone-400 block">
                              Out: {c.pickedUpAtWAT.replace(' WAT', '')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Action Button */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedChild(c)}
                          className="h-8 px-3 bg-stone-100 dark:bg-[#262520] hover:bg-stone-200 dark:hover:bg-[#302E29] text-stone-800 dark:text-[#F0EBE3] rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-5 py-3.5 bg-stone-50/70 dark:bg-[#1D1D1A] border-t border-stone-200 dark:border-[#302E29] flex items-center justify-between text-xs">
            <span className="text-stone-500">
              Showing Page {page} of {totalPages} ({totalRecords} total records)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded border border-stone-200 dark:border-[#3A3835] bg-white dark:bg-[#262520] text-stone-700 dark:text-[#C5BFB5] disabled:opacity-40 cursor-pointer"
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-stone-800 dark:text-[#F0EBE3] px-2">{page}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded border border-stone-200 dark:border-[#3A3835] bg-white dark:bg-[#262520] text-stone-700 dark:text-[#C5BFB5] disabled:opacity-40 cursor-pointer"
                aria-label="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. INDIVIDUAL DETAILED CHILD VIEW MODAL / DRAWER (Section 7) */}
      {selectedChild && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-labelledby="medical-detail-title"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-[#21211E] rounded-xl shadow-2xl border border-stone-200 dark:border-[#302E29] w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-[#FAF9F6] dark:bg-[#1D1D1A] border-b border-stone-200 dark:border-[#302E29] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedChild.photoUrl ? (
                  <img
                    src={selectedChild.photoUrl}
                    alt={selectedChild.fullName}
                    className="w-12 h-12 rounded-full object-cover border border-stone-300"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-stone-200 dark:bg-[#262520] text-stone-600 dark:text-[#A0988C] flex items-center justify-center font-bold text-sm">
                    {selectedChild.fullName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 id="medical-detail-title" className="text-base font-bold text-stone-900 dark:text-[#F0EBE3]">
                    {selectedChild.fullName}
                  </h2>
                  <p className="text-xs text-stone-500">
                    {selectedChild.age} years old · {selectedChild.gender} · {selectedChild.ageGroup}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedChild(null)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-[#F0EBE3] p-1.5 hover:bg-stone-100 dark:hover:bg-[#262520] rounded-full transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Classification Banner */}
              <div className="bg-stone-50 dark:bg-[#1D1D1A] p-3.5 rounded-lg border border-stone-200 dark:border-[#302E29] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block">
                    Care Concern Assessment
                  </span>
                  <span className="text-sm font-semibold text-stone-900 dark:text-[#F0EBE3]">
                    {selectedChild.allergyClassificationLabel}
                  </span>
                </div>
                {selectedChild.passReference && (
                  <div className="text-right">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider block">Pass Code</span>
                    <span className="font-mono font-bold text-[#C59B27]">{selectedChild.passReference}</span>
                  </div>
                )}
              </div>

              {/* Exact Medical & Allergy Notes from Parent */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-stone-800 dark:text-[#F0EBE3] font-semibold text-sm">
                  <HeartPulse className="w-4 h-4 text-red-500" />
                  <span>Exact Medical & Allergy Notes from Parent</span>
                </div>

                <div className="p-3.5 bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg space-y-2">
                  {selectedChild.rawMedicalNotes ? (
                    <p className="text-xs text-stone-800 dark:text-[#F0EBE3] leading-relaxed whitespace-pre-wrap font-sans">
                      {selectedChild.rawMedicalNotes}
                    </p>
                  ) : (
                    <p className="text-xs text-stone-500 italic">No specific medical notes recorded.</p>
                  )}

                  {selectedChild.hasAllergyMention && (
                    <div className="pt-2 border-t border-red-200/60 dark:border-red-900/40 flex items-center gap-1.5 text-[11px] text-red-700 dark:text-red-300 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Note: Labelled as "Allergy mentioned — requires verification" until verified on arrival.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Exact Additional Support Notes from Parent */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-stone-800 dark:text-[#F0EBE3] font-semibold text-sm">
                  <Info className="w-4 h-4 text-purple-500" />
                  <span>Additional Support & Assistance Notes</span>
                </div>

                <div className="p-3.5 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-lg">
                  {selectedChild.rawSupportNotes ? (
                    <p className="text-xs text-stone-800 dark:text-[#F0EBE3] leading-relaxed whitespace-pre-wrap font-sans">
                      {selectedChild.rawSupportNotes}
                    </p>
                  ) : (
                    <p className="text-xs text-stone-500 italic">No extra support assistance requested.</p>
                  )}
                </div>
              </div>

              {/* Clarification Notice if Incomplete */}
              {selectedChild.requiresClarification && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    <span className="font-semibold">Clarification Required:</span> Parent indicated care concerns during intake but left specific descriptions incomplete or unconfirmed. Please verify health requirements directly with the parent upon arrival.
                  </p>
                </div>
              )}

              {/* Parent Emergency Contact Details */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-stone-700 dark:text-[#B8B0A5] uppercase tracking-wider block">
                  Parent / Primary Guardian Details
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-stone-50 dark:bg-[#1D1D1A] border border-stone-200 dark:border-[#302E29] rounded-lg">
                  <div>
                    <span className="text-stone-400 block text-[10px]">Full Name</span>
                    <span className="font-semibold text-stone-800 dark:text-[#F0EBE3]">{selectedChild.parent.fullName}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Relationship</span>
                    <span className="text-stone-700 dark:text-[#C5BFB5]">{selectedChild.parent.relationship}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Primary Phone</span>
                    {selectedChild.parent.phone ? (
                      <a
                        href={`tel:${selectedChild.parent.phone}`}
                        className="font-medium text-[#C59B27] hover:underline flex items-center gap-1"
                      >
                        <Phone className="w-3 h-3" />
                        {selectedChild.parent.phone}
                      </a>
                    ) : (
                      <span className="text-stone-400">None provided</span>
                    )}
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">WhatsApp</span>
                    {selectedChild.parent.whatsapp ? (
                      <a
                        href={`https://wa.me/${selectedChild.parent.whatsapp.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-emerald-600 hover:underline flex items-center gap-1"
                      >
                        <MessageSquare className="w-3 h-3" />
                        {selectedChild.parent.whatsapp}
                      </a>
                    ) : (
                      <span className="text-stone-400">None provided</span>
                    )}
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Email Address</span>
                    <span className="text-stone-700 dark:text-[#C5BFB5]">{selectedChild.parent.email || 'None provided'}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Home Address</span>
                    <span className="text-stone-700 dark:text-[#C5BFB5]">
                      {[selectedChild.parent.homeAddress, selectedChild.parent.city, selectedChild.parent.state]
                        .filter(Boolean)
                        .join(', ') || 'Not specified'}
                    </span>
                  </div>
                  {selectedChild.parent.isKoinoniaWorker && (
                    <div className="sm:col-span-2 pt-1 border-t border-stone-200/60 dark:border-[#2C2A26]">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                        Koinonia Ministry Worker · {selectedChild.parent.department || 'General'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Authorised Pickup Person Details */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-stone-700 dark:text-[#B8B0A5] uppercase tracking-wider block">
                  Authorised Pickup Person
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-stone-50 dark:bg-[#1D1D1A] border border-stone-200 dark:border-[#302E29] rounded-lg">
                  <div>
                    <span className="text-stone-400 block text-[10px]">Pickup Full Name</span>
                    <span className="font-semibold text-stone-800 dark:text-[#F0EBE3]">{selectedChild.pickupPerson.fullName}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Relationship</span>
                    <span className="text-stone-700 dark:text-[#C5BFB5]">{selectedChild.pickupPerson.relationship}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Contact Phone</span>
                    {selectedChild.pickupPerson.phone ? (
                      <a
                        href={`tel:${selectedChild.pickupPerson.phone}`}
                        className="font-medium text-[#C59B27] hover:underline flex items-center gap-1"
                      >
                        <Phone className="w-3 h-3" />
                        {selectedChild.pickupPerson.phone}
                      </a>
                    ) : (
                      <span className="text-stone-400">None provided</span>
                    )}
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Verification Status</span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      {selectedChild.pickupPerson.approvalStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Attendance & Movement Timeline */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-stone-700 dark:text-[#B8B0A5] uppercase tracking-wider block">
                  Live Attendance Timeline
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-stone-50 dark:bg-[#1D1D1A] border border-stone-200 dark:border-[#302E29] rounded-lg">
                  <div>
                    <span className="text-stone-400 block text-[10px]">Current Status</span>
                    <span className="font-bold text-stone-900 dark:text-[#F0EBE3] capitalize">
                      {selectedChild.attendanceStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Check-in Timestamp (WAT)</span>
                    <span className="font-medium text-stone-700 dark:text-[#C5BFB5]">
                      {selectedChild.checkedInAtWAT || 'Not checked in yet'}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Pickup Timestamp (WAT)</span>
                    <span className="font-medium text-stone-700 dark:text-[#C5BFB5]">
                      {selectedChild.pickedUpAtWAT || 'Not released yet'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-stone-50 dark:bg-[#1D1D1A] border-t border-stone-200 dark:border-[#302E29] px-6 py-3.5 flex items-center justify-between">
              {onViewChild ? (
                <button
                  onClick={() => {
                    const cid = selectedChild.childId;
                    const eid = selectedChild.eventEntryId;
                    setSelectedChild(null);
                    onViewChild(cid, eid);
                  }}
                  className="text-xs font-semibold text-[#C59B27] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in Admin Child Management
                </button>
              ) : (
                <div />
              )}

              <button
                onClick={() => setSelectedChild(null)}
                className="bg-stone-900 hover:bg-black text-white text-xs font-semibold py-2 px-5 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

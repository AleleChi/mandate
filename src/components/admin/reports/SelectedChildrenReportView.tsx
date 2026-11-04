import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Download, 
  RefreshCw, 
  Ticket, 
  Eye, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Check, 
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import { api } from '../../../services/api';
import { buildApiUrl } from '../../../utils/urlHelper';
import { useNotification } from '../../../context/NotificationContext';

interface SelectedChildRecord {
  childId: string;
  eventEntryId: string;
  fullName: string;
  photoUrl: string | null;
  dateOfBirth: string;
  age: number;
  ageGroup: string;
  gender: string;
  parent: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
  };
  passStatus: 'missing_pass' | 'pass_ready';
  attendanceStatus: 'not_arrived' | 'checked_in' | 'inside' | 'picked_up';
  passReference?: string | null;
}

interface SelectedChildrenReportViewProps {
  eventId?: string;
  onNavigate?: (route: string) => void;
  onViewChild?: (childId: string, applicationId?: string) => void;
}

export const SelectedChildrenReportView: React.FC<SelectedChildrenReportViewProps> = ({
  eventId,
  onNavigate,
  onViewChild
}) => {
  const { showSuccess, showError } = useNotification();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [eventInfo, setEventInfo] = useState<{ id: string; title: string }>({
    id: eventId || 'event-ga-2026',
    title: 'The General Assembly'
  });

  const [summary, setSummary] = useState({
    totalSelected: 0,
    passReady: 0,
    missingPass: 0,
    checkedIn: 0,
    inside: 0,
    pickedUp: 0
  });

  const [ageGroups, setAgeGroups] = useState<Array<{ ageGroup: string; selected: number; passReady?: number; missingPass?: number }>>([
    { ageGroup: '2–3', selected: 0, passReady: 0, missingPass: 0 },
    { ageGroup: '4–6', selected: 0, passReady: 0, missingPass: 0 },
    { ageGroup: '7–9', selected: 0, passReady: 0, missingPass: 0 },
    { ageGroup: '10–12', selected: 0, passReady: 0, missingPass: 0 },
    { ageGroup: '13–14', selected: 0, passReady: 0, missingPass: 0 }
  ]);

  const [children, setChildren] = useState<SelectedChildRecord[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [ageGroupFilter, setAgeGroupFilter] = useState('all');
  const [passStatusFilter, setPassStatusFilter] = useState('all');
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Row Action Loading
  const [issuingPassChildId, setIssuingPassChildId] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Selected-count context helper (Requirement 7)
  const getFilterContextSubtitle = () => {
    const parts: string[] = [];
    parts.push(`${totalRecords} selected children`);
    if (ageGroupFilter !== 'all') {
      parts.push(`Ages ${ageGroupFilter}`);
    }
    if (passStatusFilter === 'missing_pass') {
      parts.push('Missing pass');
    } else if (passStatusFilter === 'pass_ready') {
      parts.push('Pass ready');
    }
    if (attendanceStatusFilter === 'not_arrived') {
      parts.push('Not arrived');
    } else if (attendanceStatusFilter === 'checked_in') {
      parts.push('Checked in');
    } else if (attendanceStatusFilter === 'inside') {
      parts.push('Inside');
    } else if (attendanceStatusFilter === 'picked_up') {
      parts.push('Picked up');
    }
    if (genderFilter === 'male') {
      parts.push('Male');
    } else if (genderFilter === 'female') {
      parts.push('Female');
    }
    if (debouncedSearch) {
      parts.push(`Matching "${debouncedSearch}"`);
    }
    return parts.join(' · ');
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filters change
  const handleFilterChange = (setter: (val: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  // Fetch report data
  const fetchReport = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await api.admin.getSelectedChildrenReport({
        eventId,
        page,
        pageSize,
        search: debouncedSearch,
        ageGroup: ageGroupFilter,
        passStatus: passStatusFilter,
        attendanceStatus: attendanceStatusFilter,
        gender: genderFilter
      });

      if (res && res.success) {
        if (res.event) {
          setEventInfo(res.event);
        }
        if (res.summary) {
          setSummary(res.summary);
        }
        if (res.ageGroups) {
          setAgeGroups(res.ageGroups);
        }
        setChildren(res.children || []);
        if (res.pagination) {
          setTotalRecords(res.pagination.totalRecords || 0);
          setTotalPages(res.pagination.totalPages || 1);
        }
      } else {
        setError('Could not load selected children report right now.');
      }
    } catch (err: any) {
      console.error('Failed to load selected children report:', err);
      setError(err?.message || 'Could not load selected children report right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, page, pageSize, debouncedSearch, ageGroupFilter, passStatusFilter, attendanceStatusFilter, genderFilter]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Issue pass for a single child with missing pass (Requirement 17)
  const handleIssuePass = async (childId: string, fullName: string) => {
    setIssuingPassChildId(childId);
    try {
      const res = await api.admin.generateChildPass(childId);
      if (res && res.success) {
        showSuccess('Pass Issued', `Event pass generated successfully for ${fullName}.`);
        // Update row locally without full page reload
        setChildren(prev => prev.map(c => {
          if (c.childId === childId) {
            return {
              ...c,
              passStatus: 'pass_ready',
              passReference: res.pass?.passReference || c.passReference
            };
          }
          return c;
        }));
        // Update summary counts locally
        setSummary(prev => ({
          ...prev,
          passReady: prev.passReady + 1,
          missingPass: Math.max(0, prev.missingPass - 1)
        }));
      } else {
        showError('Pass Generation Failed', res?.error || 'Could not generate pass.');
      }
    } catch (err: any) {
      showError('Pass Generation Failed', err?.message || 'Could not generate pass.');
    } finally {
      setIssuingPassChildId(null);
    }
  };

  // Export CSV (Requirement 15)
  const handleExportCsv = () => {
    try {
      setExportingCsv(true);
      const queryParams = new URLSearchParams();
      if (eventId) queryParams.append('eventId', eventId);
      if (debouncedSearch) queryParams.append('search', debouncedSearch);
      if (ageGroupFilter && ageGroupFilter !== 'all') queryParams.append('ageGroup', ageGroupFilter);
      if (passStatusFilter && passStatusFilter !== 'all') queryParams.append('passStatus', passStatusFilter);
      if (attendanceStatusFilter && attendanceStatusFilter !== 'all') queryParams.append('attendanceStatus', attendanceStatusFilter);
      if (genderFilter && genderFilter !== 'all') queryParams.append('gender', genderFilter);

      const downloadUrl = buildApiUrl(`/api/admin/reports/selected-children/export-csv?${queryParams.toString()}`);
      
      const token = api.getToken();
      fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Failed to export CSV');
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `selected-children-${ageGroupFilter !== 'all' ? ageGroupFilter : 'all'}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 200);
        showSuccess('CSV Exported', 'Selected children report downloaded successfully.');
      })
      .catch((err) => {
        console.error(err);
        showError('Export Failed', 'Could not export CSV file.');
      })
      .finally(() => {
        setExportingCsv(false);
      });
    } catch (err) {
      setExportingCsv(false);
      showError('Export Failed', 'Could not export CSV file.');
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setAgeGroupFilter('all');
    setPassStatusFilter('all');
    setAttendanceStatusFilter('all');
    setGenderFilter('all');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    debouncedSearch || 
    ageGroupFilter !== 'all' || 
    passStatusFilter !== 'all' || 
    attendanceStatusFilter !== 'all' || 
    genderFilter !== 'all'
  );

  return (
    <div className="space-y-6 pb-12" id="selected-children-operational-report">
      {/* 1. HEADER & ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200 dark:border-[#302E29] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-[#F0EBE3]">
              {ageGroupFilter !== 'all' ? `Selected Children · Ages ${ageGroupFilter}` : 'Selected Children'}
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-[#C59B27] dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40">
              Live Report
            </span>
          </div>
          <p className="text-xs text-stone-500 dark:text-[#7A7570] mt-1 font-medium">
            {eventInfo.title} · Current Event · {getFilterContextSubtitle()}
          </p>
          <p className="text-xs text-stone-400 dark:text-[#5A5550] mt-0.5">
            View children selected for the current event by age group and operational status.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exportingCsv || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-200 dark:border-[#3A3835] bg-white dark:bg-[#21211E] text-stone-700 dark:text-[#B8B0A5] hover:bg-stone-50 dark:hover:bg-[#262520] hover:text-stone-900 dark:hover:text-[#F0EBE3] transition-colors cursor-pointer disabled:opacity-50"
            id="btn-export-selected-csv"
          >
            {exportingCsv ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-500" />
            ) : (
              <Download className="w-3.5 h-3.5 text-stone-500 dark:text-[#7A7570]" />
            )}
            {ageGroupFilter !== 'all' ? `Export Ages ${ageGroupFilter}` : 'Export selected children'}
          </button>

          <button
            type="button"
            onClick={() => fetchReport(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-200 dark:border-[#3A3835] bg-white dark:bg-[#21211E] text-stone-700 dark:text-[#B8B0A5] hover:bg-stone-50 dark:hover:bg-[#262520] hover:text-stone-900 dark:hover:text-[#F0EBE3] transition-colors cursor-pointer disabled:opacity-50"
            id="btn-refresh-selected-report"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-stone-500 dark:text-[#7A7570] ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 2. FLAT SUMMARY STRIP (Requirement Part 3) */}
      <div 
        className="bg-stone-50/60 dark:bg-[#21211E]/60 border border-stone-200/80 dark:border-[#302E29] rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-stone-600 dark:text-[#B8B0A5]"
        data-testid="selected-summary-strip"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-stone-900 dark:text-[#F0EBE3] text-sm tracking-tight text-[#C59B27] dark:text-amber-400">
            {summary.totalSelected}
          </span>
          <span className="text-stone-600 dark:text-[#A8A095]">selected children</span>
        </div>

        <div className="h-3.5 w-px bg-stone-300/80 dark:bg-[#3A3835] hidden sm:block" />

        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-stone-900 dark:text-[#F0EBE3] text-sm tracking-tight">
            {summary.passReady}
          </span>
          <span className="text-stone-600 dark:text-[#A8A095]">pass ready</span>
        </div>

        <div className="h-3.5 w-px bg-stone-300/80 dark:bg-[#3A3835] hidden sm:block" />

        <div className="flex items-center gap-1.5">
          <span className={`font-semibold text-sm tracking-tight ${summary.missingPass > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-stone-900 dark:text-[#F0EBE3]'}`}>
            {summary.missingPass}
          </span>
          <span className="text-stone-600 dark:text-[#A8A095]">missing pass</span>
        </div>

        <div className="h-3.5 w-px bg-stone-300/80 dark:bg-[#3A3835] hidden sm:block" />

        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-stone-900 dark:text-[#F0EBE3] text-sm tracking-tight">
            {summary.checkedIn}
          </span>
          <span className="text-stone-600 dark:text-[#A8A095]">checked in</span>
        </div>

        <div className="h-3.5 w-px bg-stone-300/80 dark:bg-[#3A3835] hidden sm:block" />

        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-stone-900 dark:text-[#F0EBE3] text-sm tracking-tight">
            {summary.inside}
          </span>
          <span className="text-stone-600 dark:text-[#A8A095]">inside</span>
        </div>

        {summary.pickedUp > 0 && (
          <>
            <div className="h-3.5 w-px bg-stone-300/80 dark:bg-[#3A3835] hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-stone-900 dark:text-[#F0EBE3] text-sm tracking-tight">
                {summary.pickedUp}
              </span>
              <span className="text-stone-600 dark:text-[#A8A095]">picked up</span>
            </div>
          </>
        )}
      </div>

      {/* 3. PRIMARY REPORT NAVIGATION: FLAT AGE-GROUP BREAKDOWN TABLE (Requirements 2, 3, 6, 14) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-stone-500 dark:text-[#7A7570] uppercase tracking-wider">
            Age group breakdown
          </span>
          {ageGroupFilter !== 'all' && (
            <button
              type="button"
              onClick={() => {
                setAgeGroupFilter('all');
                setPage(1);
              }}
              className="text-xs text-[#C59B27] dark:text-amber-400 hover:underline font-medium cursor-pointer"
            >
              Show all age groups
            </button>
          )}
        </div>
        <div className="bg-white dark:bg-[#21211E] border border-stone-200/80 dark:border-[#302E29] rounded-xl overflow-hidden shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50/70 dark:bg-[#262520] border-b border-stone-200/80 dark:border-[#302E29] text-[11px] font-medium text-stone-500 dark:text-[#7A7570]">
                <th className="py-2.5 px-4 font-medium">Age group</th>
                <th className="py-2.5 px-3 font-medium text-right">Selected</th>
                <th className="py-2.5 px-3 font-medium text-right">Pass ready</th>
                <th className="py-2.5 px-3 font-medium text-right">Missing pass</th>
                <th className="py-2.5 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-[#2A2926] text-stone-700 dark:text-[#C5BFB5]">
              {ageGroups.map((ag) => {
                const isActive = ageGroupFilter === ag.ageGroup;
                const passReadyCount = ag.passReady ?? 0;
                const missingPassCount = ag.missingPass ?? 0;

                return (
                  <tr
                    key={ag.ageGroup}
                    onClick={() => {
                      setAgeGroupFilter(isActive ? 'all' : ag.ageGroup);
                      setPage(1);
                    }}
                    className={`transition-colors hover:bg-stone-50/70 dark:hover:bg-[#262520]/70 cursor-pointer ${
                      isActive 
                        ? 'bg-amber-50/60 dark:bg-amber-950/25 font-semibold text-stone-900 dark:text-[#F0EBE3]' 
                        : ''
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#C59B27] dark:bg-amber-400 shrink-0" />}
                        <span className={isActive ? 'text-[#C59B27] dark:text-amber-400 font-semibold' : 'text-stone-900 dark:text-[#F0EBE3] font-medium'}>
                          Ages {ag.ageGroup}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-stone-900 dark:text-[#F0EBE3]">
                      {ag.selected}
                    </td>
                    <td className="py-2.5 px-3 text-right text-stone-600 dark:text-[#A8A095]">
                      {passReadyCount}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={missingPassCount > 0 ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-stone-400 dark:text-[#6A6560]'}>
                        {missingPassCount}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAgeGroupFilter(isActive ? 'all' : ag.ageGroup);
                          setPage(1);
                        }}
                        className={`text-xs font-medium hover:underline cursor-pointer ${
                          isActive 
                            ? 'text-[#C59B27] dark:text-amber-400 font-semibold' 
                            : 'text-stone-500 hover:text-stone-800 dark:text-[#7A7570] dark:hover:text-[#F0EBE3]'
                        }`}
                      >
                        {isActive ? 'Active list' : 'View list'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-stone-50/50 dark:bg-[#262520]/50 border-t border-stone-200/80 dark:border-[#302E29] text-[11px] font-semibold text-stone-700 dark:text-[#D5CFC5]">
                <td className="py-2.5 px-4">Total</td>
                <td className="py-2.5 px-3 text-right text-stone-900 dark:text-[#F0EBE3]">{summary.totalSelected}</td>
                <td className="py-2.5 px-3 text-right">{summary.passReady}</td>
                <td className="py-2.5 px-3 text-right">
                  <span className={summary.missingPass > 0 ? 'text-amber-700 dark:text-amber-400' : ''}>
                    {summary.missingPass}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-right">
                  {ageGroupFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAgeGroupFilter('all');
                        setPage(1);
                      }}
                      className="text-[11px] text-[#C59B27] dark:text-amber-400 hover:underline font-medium cursor-pointer"
                    >
                      View all
                    </button>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 4. COMPACT TOOLBAR (Requirement 8 & 12) */}
      <div className="bg-white dark:bg-[#21211E] border border-stone-200/80 dark:border-[#302E29] rounded-xl p-3 flex flex-wrap items-center gap-3 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 dark:text-[#7A7570]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search child, parent or phone"
            className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg pl-9 pr-7 py-1.5 text-xs text-stone-800 dark:text-[#F0EBE3] placeholder-stone-400 dark:placeholder-[#7A7570] focus:outline-hidden focus:border-[#C59B27] focus:ring-1 focus:ring-[#C59B27] transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Age group filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-stone-500 dark:text-[#7A7570] font-medium hidden sm:inline">Age group:</label>
          <select
            value={ageGroupFilter}
            onChange={handleFilterChange(setAgeGroupFilter)}
            className="bg-[#FAF9F6] dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg px-2.5 py-1.5 text-xs text-stone-800 dark:text-[#F0EBE3] focus:outline-hidden focus:border-[#C59B27] cursor-pointer font-medium"
          >
            <option value="all">All age groups</option>
            <option value="2–3">Ages 2–3</option>
            <option value="4–6">Ages 4–6</option>
            <option value="7–9">Ages 7–9</option>
            <option value="10–12">Ages 10–12</option>
            <option value="13–14">Ages 13–14</option>
          </select>
        </div>

        {/* Pass status filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-stone-500 dark:text-[#7A7570] font-medium hidden sm:inline">Pass:</label>
          <select
            value={passStatusFilter}
            onChange={handleFilterChange(setPassStatusFilter)}
            className="bg-[#FAF9F6] dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg px-2.5 py-1.5 text-xs text-stone-800 dark:text-[#F0EBE3] focus:outline-hidden focus:border-[#C59B27] cursor-pointer font-medium"
          >
            <option value="all">All</option>
            <option value="missing_pass">Missing pass</option>
            <option value="pass_ready">Pass ready</option>
          </select>
        </div>

        {/* Attendance status filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-stone-500 dark:text-[#7A7570] font-medium hidden sm:inline">Attendance:</label>
          <select
            value={attendanceStatusFilter}
            onChange={handleFilterChange(setAttendanceStatusFilter)}
            className="bg-[#FAF9F6] dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg px-2.5 py-1.5 text-xs text-stone-800 dark:text-[#F0EBE3] focus:outline-hidden focus:border-[#C59B27] cursor-pointer font-medium"
          >
            <option value="all">All</option>
            <option value="not_arrived">Not arrived</option>
            <option value="checked_in">Checked in</option>
            <option value="inside">Inside</option>
            <option value="picked_up">Picked up</option>
          </select>
        </div>

        {/* Gender filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-stone-500 dark:text-[#7A7570] font-medium hidden sm:inline">Gender:</label>
          <select
            value={genderFilter}
            onChange={handleFilterChange(setGenderFilter)}
            className="bg-[#FAF9F6] dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-lg px-2.5 py-1.5 text-xs text-stone-800 dark:text-[#F0EBE3] focus:outline-hidden focus:border-[#C59B27] cursor-pointer font-medium"
          >
            <option value="all">All</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        {/* Reset button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-xs text-[#C59B27] dark:text-amber-400 hover:underline font-medium ml-auto"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* ACTIVE AGE FILTER BANNER (Requirement 14) */}
      {ageGroupFilter !== 'all' && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40 rounded-lg text-xs text-stone-700 dark:text-[#E0D8CC]">
          <span className="font-medium">
            {totalRecords} selected children · Ages {ageGroupFilter}
          </span>
          <button
            type="button"
            onClick={() => {
              setAgeGroupFilter('all');
              setPage(1);
            }}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-[11px] font-medium underline"
          >
            Show all age groups
          </button>
        </div>
      )}

      {/* 5. TABLE / DATA AREA (Requirement 9 & 10) */}
      <div className="bg-white dark:bg-[#21211E] border border-stone-200/80 dark:border-[#302E29] rounded-xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#C59B27] mx-auto" />
            <p className="text-xs text-stone-500 dark:text-[#7A7570] font-medium">Loading selected children…</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center space-y-3 px-4">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-xs text-rose-700 dark:text-rose-400 font-medium">{error}</p>
            <button
              type="button"
              onClick={() => fetchReport()}
              className="text-xs px-3 py-1.5 border border-stone-200 rounded-lg hover:bg-stone-50 font-medium cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : children.length === 0 ? (
          <div className="py-16 text-center space-y-3 px-4">
            <Users className="w-8 h-8 text-stone-300 dark:text-[#5A5550] mx-auto" />
            <p className="text-xs text-stone-500 dark:text-[#7A7570] font-medium">
              No selected children found matching the active filters.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs px-3 py-1.5 border border-stone-200 dark:border-[#3A3835] rounded-lg hover:bg-stone-50 dark:hover:bg-[#262520] font-medium cursor-pointer"
              >
                Reset search filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50/70 dark:bg-[#262520] border-b border-stone-200/80 dark:border-[#302E29] text-[11px] font-medium text-stone-500 dark:text-[#7A7570]">
                  <th className="py-3 px-4">Child</th>
                  <th className="py-3 px-3">Age</th>
                  <th className="py-3 px-3">Age group</th>
                  <th className="py-3 px-3">Gender</th>
                  <th className="py-3 px-4">Parent / Guardian</th>
                  <th className="py-3 px-3">Parent phone</th>
                  <th className="py-3 px-3">Pass status</th>
                  <th className="py-3 px-3">Attendance</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-[#2A2926] text-stone-700 dark:text-[#C5BFB5]">
                {children.map((c) => {
                  const isIssuing = issuingPassChildId === c.childId;
                  const isPassReady = c.passStatus === 'pass_ready';

                  return (
                    <tr 
                      key={c.eventEntryId || c.childId}
                      className="hover:bg-stone-50/60 dark:hover:bg-[#262520]/60 transition-colors"
                    >
                      {/* Child */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-stone-100 dark:bg-[#2A2926] border border-stone-200/60 dark:border-[#3A3835] flex items-center justify-center">
                            {c.photoUrl ? (
                              <img 
                                src={c.photoUrl} 
                                alt={c.fullName} 
                                className="w-full h-full object-cover" 
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Users className="w-3.5 h-3.5 text-stone-400 dark:text-[#6A6560]" />
                            )}
                          </div>
                          <div>
                            <span 
                              className="font-medium text-stone-900 dark:text-[#F0EBE3] hover:text-[#C59B27] cursor-pointer"
                              onClick={() => {
                                if (onViewChild) {
                                  onViewChild(c.childId, c.eventEntryId);
                                } else if (onNavigate) {
                                  onNavigate(`/admin/children/${c.eventEntryId}`);
                                }
                              }}
                            >
                              {c.fullName}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Age */}
                      <td className="py-3 px-3 text-stone-600 dark:text-[#A8A095]">
                        {c.age} yrs
                      </td>

                      {/* Age Group (Plain text, no badge per Requirement 9) */}
                      <td className="py-3 px-3 text-stone-800 dark:text-[#D5CFC5] font-medium">
                        {c.ageGroup || '—'}
                      </td>

                      {/* Gender (Plain text per Requirement 9) */}
                      <td className="py-3 px-3 text-stone-600 dark:text-[#A8A095]">
                        {c.gender}
                      </td>

                      {/* Parent / Guardian */}
                      <td className="py-3 px-4 text-stone-800 dark:text-[#D5CFC5]">
                        {c.parent?.fullName || '—'}
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-3 text-stone-600 dark:text-[#A8A095] font-mono text-[11px]">
                        {c.parent?.phone || '—'}
                      </td>

                      {/* Pass status (Possible: Pass ready, Missing pass) */}
                      <td className="py-3 px-3">
                        {isPassReady ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            Pass ready
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-medium">
                            Missing pass
                          </span>
                        )}
                      </td>

                      {/* Attendance (Possible: Not arrived, Checked in, Inside, Picked up) */}
                      <td className="py-3 px-3 text-stone-700 dark:text-[#B8B0A5]">
                        {c.attendanceStatus === 'picked_up'
                          ? 'Picked up'
                          : c.attendanceStatus === 'inside'
                            ? 'Inside'
                            : c.attendanceStatus === 'checked_in'
                              ? 'Checked in'
                              : 'Not arrived'}
                      </td>

                      {/* Action (Quiet text/icon actions, Issue pass for missing pass) */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {!isPassReady && (
                            <button
                              type="button"
                              onClick={() => handleIssuePass(c.childId, c.fullName)}
                              disabled={isIssuing}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#C59B27] dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:underline cursor-pointer disabled:opacity-50"
                              title="Issue pass"
                            >
                              {isIssuing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Ticket className="w-3 h-3" />
                              )}
                              Issue pass
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (onViewChild) {
                                onViewChild(c.childId, c.eventEntryId);
                              } else if (onNavigate) {
                                onNavigate(`/admin/children/${c.eventEntryId}`);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 hover:text-stone-800 dark:text-[#7A7570] dark:hover:text-[#F0EBE3] cursor-pointer"
                            title="View child"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 6. SERVER-SIDE PAGINATION FOOTER (Requirement 11) */}
        {!loading && children.length > 0 && (
          <div className="border-t border-stone-200/80 dark:border-[#302E29] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-stone-500 dark:text-[#7A7570]">
            <div>
              Showing {totalRecords === 0 ? 0 : Math.min((page - 1) * pageSize + 1, totalRecords)}–{Math.min(page * pageSize, totalRecords)} of {totalRecords} selected children{ageGroupFilter !== 'all' ? ` · Ages ${ageGroupFilter}` : ''}
            </div>

            <div className="flex items-center gap-4">
              {/* Page size select */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px]">Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-[#FAF9F6] dark:bg-[#262520] border border-stone-200 dark:border-[#3A3835] rounded-md px-1.5 py-0.5 text-xs text-stone-800 dark:text-[#F0EBE3] cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Prev / Pages / Next */}
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1 rounded-md border border-stone-200 dark:border-[#3A3835] text-stone-600 dark:text-[#A8A095] hover:bg-stone-50 dark:hover:bg-[#262520] disabled:opacity-40 cursor-pointer"
                  title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <span className="px-2 font-medium text-stone-700 dark:text-[#D5CFC5]">
                  {page} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1 rounded-md border border-stone-200 dark:border-[#3A3835] text-stone-600 dark:text-[#A8A095] hover:bg-stone-50 dark:hover:bg-[#262520] disabled:opacity-40 cursor-pointer"
                  title="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

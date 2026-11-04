import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Download, 
  RefreshCw, 
  Ticket, 
  ChevronLeft, 
  ChevronRight, 
  User,
  Loader2,
  X,
  ChevronDown
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };
    if (downloadMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [downloadMenuOpen]);

  // Selected-count context helper (Requirement 7 & 12)
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
        setError('We couldn\'t load selected children.');
      }
    } catch (err: any) {
      console.error('Failed to load selected children report:', err);
      setError('We couldn\'t load selected children.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, page, pageSize, debouncedSearch, ageGroupFilter, passStatusFilter, attendanceStatusFilter, genderFilter]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Issue pass for a single child with missing pass
  const handleIssuePass = async (childId: string, fullName: string) => {
    setIssuingPassChildId(childId);
    try {
      const res = await api.admin.generateChildPass(childId);
      if (res && res.success) {
        showSuccess('Pass Issued', `Event pass generated successfully for ${fullName}.`);
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

  // Download PDF Report (Requirements 7, 8, 14, 16, 18)
  const handleDownloadPdf = async (targetAgeGroup?: string) => {
    try {
      setDownloadingPdf(true);
      setDownloadMenuOpen(false);

      const queryParams = new URLSearchParams();
      if (eventId) queryParams.append('eventId', eventId);
      if (debouncedSearch) queryParams.append('search', debouncedSearch);

      const effectiveAgeGroup = targetAgeGroup !== undefined
        ? targetAgeGroup
        : (ageGroupFilter !== 'all' ? ageGroupFilter : '');

      if (effectiveAgeGroup && effectiveAgeGroup !== 'all') {
        queryParams.append('ageGroup', effectiveAgeGroup);
      }
      if (passStatusFilter && passStatusFilter !== 'all') queryParams.append('passStatus', passStatusFilter);
      if (attendanceStatusFilter && attendanceStatusFilter !== 'all') queryParams.append('attendanceStatus', attendanceStatusFilter);
      if (genderFilter && genderFilter !== 'all') queryParams.append('gender', genderFilter);

      const downloadUrl = buildApiUrl(`/api/admin/reports/selected-children/export-pdf?${queryParams.toString()}`);
      const token = api.getToken();

      const res = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error('Failed to generate PDF report');
      }

      let filename = '';
      const disposition = res.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      if (!filename) {
        if (effectiveAgeGroup && effectiveAgeGroup !== 'all') {
          filename = `Koinonia-GA-2026-Selected-Children-Ages-${effectiveAgeGroup.replace(/[\s–—]+/g, '-')}.pdf`;
        } else {
          filename = `Koinonia-GA-2026-All-Selected-Children.pdf`;
        }
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 200);

      showSuccess('Report Downloaded', `Selected children PDF (${effectiveAgeGroup ? `Ages ${effectiveAgeGroup}` : 'All'}) ready.`);
    } catch (err: any) {
      console.error(err);
      showError('Download Failed', err?.message || 'Could not download PDF report.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Export CSV (Requirements 8, 9, 22)
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
    <div className="space-y-4 pb-12 text-stone-900 dark:text-[#F0EBE3]" id="selected-children-operational-report">
      {/* 1. CLEAN REPORT HEADER & ACTIONS (Requirements 1, 7, 9, 16) */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 border-b border-stone-200 dark:border-[#302E29] pb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-stone-900 dark:text-[#F0EBE3]">
            Selected Children
          </h1>
          <p className="text-xs text-stone-500 dark:text-[#8A847A] mt-0.5 font-medium">
            {eventInfo.title} · Current Event
          </p>
          <p className="text-xs text-stone-400 dark:text-[#6A6560] mt-0.5">
            View children selected for the current event by age group and operational status.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          {/* Download report (Primary Koinonia gold per Requirements 7, 16) */}
          <div className="relative inline-block" ref={downloadMenuRef}>
            <div className="inline-flex rounded shadow-xs">
              <button
                type="button"
                onClick={() => {
                  if (ageGroupFilter !== 'all') {
                    handleDownloadPdf(ageGroupFilter);
                  } else {
                    setDownloadMenuOpen(prev => !prev);
                  }
                }}
                disabled={downloadingPdf || loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-l text-xs font-medium bg-[#C59B27] hover:bg-[#b58e22] text-white dark:text-[#181816] transition-colors cursor-pointer disabled:opacity-50"
                id="btn-download-selected-pdf"
              >
                {downloadingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {ageGroupFilter !== 'all' ? `Download Ages ${ageGroupFilter} report` : 'Download report'}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDownloadMenuOpen(prev => !prev);
                }}
                disabled={downloadingPdf || loading}
                aria-label="Download options"
                className="inline-flex items-center px-1.5 py-1.5 rounded-r border-l border-[#ab841e] bg-[#C59B27] hover:bg-[#b58e22] text-white dark:text-[#181816] transition-colors cursor-pointer disabled:opacity-50"
                id="btn-download-selected-options"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Small restrained dropdown menu per Requirement 7 */}
            {downloadMenuOpen && (
              <div 
                className="absolute right-0 mt-1 w-52 bg-white dark:bg-[#1E1E1C] border border-stone-200 dark:border-[#33312B] rounded shadow-lg z-50 py-1 text-xs"
                role="menu"
              >
                {ageGroupFilter !== 'all' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(ageGroupFilter)}
                      className="w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-[#282724] text-stone-900 dark:text-[#F0EBE3] font-medium flex items-center justify-between cursor-pointer"
                    >
                      <span>Download Ages {ageGroupFilter} report</span>
                      <span className="text-[10px] text-stone-400">Current</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf('')}
                      className="w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-[#282724] text-stone-700 dark:text-[#C5BFB5] cursor-pointer"
                    >
                      Download all selected children
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf('')}
                      className="w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-[#282724] text-stone-900 dark:text-[#F0EBE3] font-medium cursor-pointer"
                    >
                      All selected children
                    </button>
                    <div className="border-t border-stone-100 dark:border-[#2C2A26] my-1" />
                    <div className="px-3 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
                      By Age Group
                    </div>
                    {['2–3', '4–6', '7–9', '10–12', '13–14'].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleDownloadPdf(g)}
                        className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-[#282724] text-stone-700 dark:text-[#C5BFB5] cursor-pointer"
                      >
                        Ages {g}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Export CSV (Secondary per Requirement 16) */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exportingCsv || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-stone-300 dark:border-[#383630] bg-white dark:bg-[#1E1E1C] text-stone-700 dark:text-[#C5BFB5] hover:bg-stone-50 dark:hover:bg-[#252522] hover:text-stone-900 dark:hover:text-[#F0EBE3] transition-colors cursor-pointer disabled:opacity-50"
            id="btn-export-selected-csv"
          >
            {exportingCsv ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Export CSV
          </button>

          {/* Refresh (Quiet action per Requirement 16) */}
          <button
            type="button"
            onClick={() => fetchReport(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border border-stone-200 dark:border-[#302E29] bg-transparent text-stone-600 dark:text-[#A0988D] hover:bg-stone-100/50 dark:hover:bg-[#252420] hover:text-stone-900 dark:hover:text-[#F0EBE3] transition-colors cursor-pointer disabled:opacity-50"
            id="btn-refresh-selected-report"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 2. FLAT SUMMARY STRIP BENEATH HEADER (Requirement 10) */}
      <div 
        className="py-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-stone-600 dark:text-[#9A9388] border-b border-stone-200/80 dark:border-[#2C2A26]"
        data-testid="selected-summary-strip"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-stone-900 dark:text-[#F0EBE3]">
            {summary.totalSelected}
          </span>
          <span>selected children</span>
        </div>

        <div className="h-3 w-px bg-stone-300 dark:bg-[#35332E] hidden sm:block" />

        <div className="flex items-center gap-1.5">
          <span className="font-medium text-stone-800 dark:text-[#D5CFC5]">
            {summary.passReady}
          </span>
          <span>pass ready</span>
        </div>

        <div className="h-3 w-px bg-stone-300 dark:bg-[#35332E] hidden sm:block" />

        <div className="flex items-center gap-1.5">
          <span className={`font-medium ${summary.missingPass > 0 ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-stone-800 dark:text-[#D5CFC5]'}`}>
            {summary.missingPass}
          </span>
          <span>missing pass</span>
        </div>

        <div className="h-3 w-px bg-stone-300 dark:bg-[#35332E] hidden sm:block" />

        <div className="flex items-center gap-1.5">
          <span className="font-medium text-stone-800 dark:text-[#D5CFC5]">
            {summary.checkedIn}
          </span>
          <span>checked in</span>
        </div>

        <div className="h-3 w-px bg-stone-300 dark:bg-[#35332E] hidden sm:block" />

        <div className="flex items-center gap-1.5">
          <span className="font-medium text-stone-800 dark:text-[#D5CFC5]">
            {summary.inside}
          </span>
          <span>inside</span>
        </div>

        {summary.pickedUp > 0 && (
          <>
            <div className="h-3 w-px bg-stone-300 dark:bg-[#35332E] hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-stone-800 dark:text-[#D5CFC5]">
                {summary.pickedUp}
              </span>
              <span>picked up</span>
            </div>
          </>
        )}

        {/* Selected-count context indicator */}
        {hasActiveFilters && (
          <div className="ml-auto text-[11px] text-[#C59B27] dark:text-amber-400 font-medium">
            {getFilterContextSubtitle()}
          </div>
        )}
      </div>

      {/* 3. PRIMARY REPORT NAVIGATION: COMPACT AGE-GROUP BREAKDOWN TABLE (Requirements 11, 12, 14) */}
      <div className="border border-stone-200 dark:border-[#2C2A26] rounded bg-white dark:bg-[#1E1E1C] overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-stone-50/70 dark:bg-[#242320] border-b border-stone-200 dark:border-[#2C2A26] text-[10px] font-semibold text-stone-500 dark:text-[#8A847A] uppercase tracking-wider">
              <th className="py-2 px-3 font-semibold">Age group</th>
              <th className="py-2 px-3 font-semibold text-right">Selected</th>
              <th className="py-2 px-3 font-semibold text-right">Pass ready</th>
              <th className="py-2 px-3 font-semibold text-right">Missing pass</th>
              <th className="py-2 px-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-[#262420] text-stone-700 dark:text-[#C5BFB5]">
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
                  className={`transition-colors hover:bg-stone-50/80 dark:hover:bg-[#252421] cursor-pointer ${
                    isActive 
                      ? 'border-l-2 border-[#C59B27] bg-stone-50/70 dark:bg-[#252420] text-stone-900 dark:text-[#F0EBE3] font-semibold' 
                      : ''
                  }`}
                >
                  <td className="py-2 px-3">
                    <span className={isActive ? 'text-[#C59B27] dark:text-amber-400 font-semibold' : 'text-stone-800 dark:text-[#E0D8CC]'}>
                      Ages {ag.ageGroup}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-stone-900 dark:text-[#F0EBE3]">
                    {ag.selected}
                  </td>
                  <td className="py-2 px-3 text-right text-stone-600 dark:text-[#A0988D]">
                    {passReadyCount}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={missingPassCount > 0 ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-stone-400 dark:text-[#656059]'}>
                      {missingPassCount}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="inline-flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAgeGroupFilter(isActive ? 'all' : ag.ageGroup);
                          setPage(1);
                        }}
                        className={`text-xs cursor-pointer ${
                          isActive 
                            ? 'text-[#C59B27] dark:text-amber-400 font-semibold underline' 
                            : 'text-[#C59B27] dark:text-amber-400/90 hover:underline'
                        }`}
                      >
                        {isActive ? 'Filtered' : 'View list'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadPdf(ag.ageGroup);
                        }}
                        disabled={downloadingPdf}
                        className="text-xs text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-[#F0EBE3] hover:underline cursor-pointer disabled:opacity-50"
                        title={`Download Ages ${ag.ageGroup} PDF`}
                      >
                        Download
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-stone-50/40 dark:bg-[#22211E] border-t border-stone-200 dark:border-[#2C2A26] text-[11px] font-semibold text-stone-700 dark:text-[#D5CFC5]">
              <td className="py-2 px-3">Total</td>
              <td className="py-2 px-3 text-right text-stone-900 dark:text-[#F0EBE3]">{summary.totalSelected}</td>
              <td className="py-2 px-3 text-right">{summary.passReady}</td>
              <td className="py-2 px-3 text-right">
                <span className={summary.missingPass > 0 ? 'text-amber-700 dark:text-amber-400' : ''}>
                  {summary.missingPass}
                </span>
              </td>
              <td className="py-2 px-3 text-right">
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

      {/* 4. COMPACT FILTER BAR (Requirement 13) */}
      <div className="border border-stone-200 dark:border-[#2C2A26] rounded p-2.5 bg-white dark:bg-[#1E1E1C] flex flex-wrap items-center gap-2.5 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 dark:text-[#706B62]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search child, parent or phone"
            className="w-full bg-[#FAF9F6] dark:bg-[#262421] border border-stone-200 dark:border-[#35332E] rounded pl-8 pr-6 py-1 text-xs text-stone-800 dark:text-[#F0EBE3] placeholder-stone-400 dark:placeholder-[#706B62] focus:outline-hidden focus:border-[#C59B27]"
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
          <label className="text-stone-500 dark:text-[#8A847A] font-medium hidden sm:inline">Age group:</label>
          <select
            value={ageGroupFilter}
            onChange={handleFilterChange(setAgeGroupFilter)}
            className="bg-[#FAF9F6] dark:bg-[#262421] border border-stone-200 dark:border-[#35332E] rounded px-2 py-1 text-xs text-stone-800 dark:text-[#F0EBE3] focus:outline-hidden focus:border-[#C59B27] cursor-pointer"
          >
            <option value="all">All age groups</option>
            <option value="2–3">Ages 2–3</option>
            <option value="4–6">Ages 4–6</option>
            <option value="7–9">Ages 7–9</option>
            <option value="10–12">Ages 10–12</option>
            <option value="13–14">Ages 13–14</option>
          </select>
        </div>

        {/* Pass filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-stone-500 dark:text-[#8A847A] font-medium hidden sm:inline">Pass:</label>
          <select
            value={passStatusFilter}
            onChange={handleFilterChange(setPassStatusFilter)}
            className="bg-[#FAF9F6] dark:bg-[#262421] border border-stone-200 dark:border-[#35332E] rounded px-2 py-1 text-xs text-stone-800 dark:text-[#F0EBE3] focus:outline-hidden focus:border-[#C59B27] cursor-pointer"
          >
            <option value="all">All</option>
            <option value="missing_pass">Missing pass</option>
            <option value="pass_ready">Pass ready</option>
          </select>
        </div>

        {/* Attendance filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-stone-500 dark:text-[#8A847A] font-medium hidden sm:inline">Attendance:</label>
          <select
            value={attendanceStatusFilter}
            onChange={handleFilterChange(setAttendanceStatusFilter)}
            className="bg-[#FAF9F6] dark:bg-[#262421] border border-stone-200 dark:border-[#35332E] rounded px-2 py-1 text-xs text-stone-800 dark:text-[#F0EBE3] focus:outline-hidden focus:border-[#C59B27] cursor-pointer"
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
          <label className="text-stone-500 dark:text-[#8A847A] font-medium hidden sm:inline">Gender:</label>
          <select
            value={genderFilter}
            onChange={handleFilterChange(setGenderFilter)}
            className="bg-[#FAF9F6] dark:bg-[#262421] border border-stone-200 dark:border-[#35332E] rounded px-2 py-1 text-xs text-stone-800 dark:text-[#F0EBE3] focus:outline-hidden focus:border-[#C59B27] cursor-pointer"
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
            className="text-xs text-[#C59B27] dark:text-amber-400 hover:underline font-medium ml-auto cursor-pointer"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* 5. PRIMARY SCREEN CONTENT: CHILDREN TABLE (Requirements 14, 15, 16, 17, 18, 19, 20) */}
      <div className="border border-stone-200 dark:border-[#2C2A26] rounded bg-white dark:bg-[#1E1E1C] overflow-hidden">
        {/* Subtle loading indicator line during refresh (Requirement 20) */}
        {refreshing && (
          <div className="h-0.5 w-full bg-stone-100 dark:bg-[#262420] overflow-hidden">
            <div className="h-full bg-[#C59B27] animate-pulse w-full" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50/70 dark:bg-[#242320] border-b border-stone-200 dark:border-[#2C2A26] text-[10px] font-semibold text-stone-500 dark:text-[#8A847A] uppercase tracking-wider">
                <th className="py-2.5 px-3">Child</th>
                <th className="py-2.5 px-3">Age</th>
                <th className="py-2.5 px-3">Age group</th>
                <th className="py-2.5 px-3">Gender</th>
                <th className="py-2.5 px-3">Parent / Guardian</th>
                <th className="py-2.5 px-3">Phone</th>
                <th className="py-2.5 px-3">Pass</th>
                <th className="py-2.5 px-3">Attendance</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-[#262420] text-stone-700 dark:text-[#C5BFB5]">
              {loading ? (
                // Table skeleton rows (Requirement 20)
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="animate-pulse">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-stone-200 dark:bg-[#2D2B27]" />
                        <div className="h-3 bg-stone-200 dark:bg-[#2D2B27] rounded w-24" />
                      </div>
                    </td>
                    <td className="py-3 px-3"><div className="h-3 bg-stone-200 dark:bg-[#2D2B27] rounded w-10" /></td>
                    <td className="py-3 px-3"><div className="h-3 bg-stone-200 dark:bg-[#2D2B27] rounded w-12" /></td>
                    <td className="py-3 px-3"><div className="h-3 bg-stone-200 dark:bg-[#2D2B27] rounded w-10" /></td>
                    <td className="py-3 px-3"><div className="h-3 bg-stone-200 dark:bg-[#2D2B27] rounded w-24" /></td>
                    <td className="py-3 px-3"><div className="h-3 bg-stone-200 dark:bg-[#2D2B27] rounded w-20" /></td>
                    <td className="py-3 px-3"><div className="h-3 bg-stone-200 dark:bg-[#2D2B27] rounded w-16" /></td>
                    <td className="py-3 px-3"><div className="h-3 bg-stone-200 dark:bg-[#2D2B27] rounded w-16" /></td>
                    <td className="py-3 px-3 text-right"><div className="h-3 bg-stone-200 dark:bg-[#2D2B27] rounded w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : error ? (
                // Compact inline error state within table body (Requirement 18)
                <tr>
                  <td colSpan={9} className="py-8 text-center px-4">
                    <p className="text-xs text-stone-600 dark:text-[#A8A095] font-medium">
                      We couldn't load selected children.
                    </p>
                    <button
                      type="button"
                      onClick={() => fetchReport()}
                      className="mt-2 text-xs text-[#C59B27] dark:text-amber-400 hover:underline font-medium cursor-pointer"
                    >
                      Try again
                    </button>
                  </td>
                </tr>
              ) : children.length === 0 ? (
                // Simple table-body empty state (Requirement 19)
                <tr>
                  <td colSpan={9} className="py-10 text-center px-4">
                    <p className="text-xs text-stone-500 dark:text-[#8A847A] font-medium">
                      No selected children match these filters.
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="mt-2 text-xs text-[#C59B27] dark:text-amber-400 hover:underline font-medium cursor-pointer"
                      >
                        Clear filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                children.map((c) => {
                  const isIssuing = issuingPassChildId === c.childId;
                  const isPassReady = c.passStatus === 'pass_ready';

                  return (
                    <tr 
                      key={c.eventEntryId || c.childId}
                      className="hover:bg-stone-50/70 dark:hover:bg-[#252421] transition-colors h-[56px]"
                    >
                      {/* Child Identity (Requirement 15: small photo or neutral placeholder, full name) */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded overflow-hidden shrink-0 bg-stone-100 dark:bg-[#262420] border border-stone-200/80 dark:border-[#35332E] flex items-center justify-center">
                            {c.photoUrl ? (
                              <img 
                                src={c.photoUrl} 
                                alt={c.fullName} 
                                className="w-full h-full object-cover" 
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <User className="w-3.5 h-3.5 text-stone-400 dark:text-[#605B52]" />
                            )}
                          </div>
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
                      </td>

                      {/* Age */}
                      <td className="py-2.5 px-3 text-stone-600 dark:text-[#A0988D]">
                        {c.age} yrs
                      </td>

                      {/* Age group */}
                      <td className="py-2.5 px-3 text-stone-800 dark:text-[#D5CFC5]">
                        {c.ageGroup || '—'}
                      </td>

                      {/* Gender */}
                      <td className="py-2.5 px-3 text-stone-600 dark:text-[#A0988D]">
                        {c.gender}
                      </td>

                      {/* Parent / Guardian (Requirement 16) */}
                      <td className="py-2.5 px-3 text-stone-800 dark:text-[#D5CFC5]">
                        {c.parent?.fullName || '—'}
                      </td>

                      {/* Phone (Requirement 16) */}
                      <td className="py-2.5 px-3 text-stone-600 dark:text-[#A0988D] text-[11px]">
                        {c.parent?.phone || '—'}
                      </td>

                      {/* Pass status (Requirement 14: plain text, missing pass in restrained amber) */}
                      <td className="py-2.5 px-3">
                        {isPassReady ? (
                          <span className="text-stone-800 dark:text-[#D5CFC5]">
                            Pass ready
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-medium">
                            Missing pass
                          </span>
                        )}
                      </td>

                      {/* Attendance (Requirement 14: plain text, no pills) */}
                      <td className="py-2.5 px-3 text-stone-700 dark:text-[#B0A89C]">
                        {c.attendanceStatus === 'picked_up'
                          ? 'Picked up'
                          : c.attendanceStatus === 'inside'
                            ? 'Inside'
                            : c.attendanceStatus === 'checked_in'
                              ? 'Checked in'
                              : 'Not arrived'}
                      </td>

                      {/* Action (Requirement 17: quiet text action, Issue pass in gold for missing pass) */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center justify-end gap-2.5">
                          {!isPassReady && (
                            <button
                              type="button"
                              onClick={() => handleIssuePass(c.childId, c.fullName)}
                              disabled={isIssuing}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#C59B27] dark:text-amber-400 hover:underline cursor-pointer disabled:opacity-50"
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
                            className="text-[11px] text-stone-500 hover:text-stone-800 dark:text-[#8A847A] dark:hover:text-[#F0EBE3] hover:underline cursor-pointer"
                          >
                            View child
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 6. SERVER-SIDE PAGINATION FOOTER (Requirement 21) */}
        {!loading && children.length > 0 && (
          <div className="border-t border-stone-200 dark:border-[#2C2A26] px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-stone-500 dark:text-[#8A847A]">
            <div>
              Showing {totalRecords === 0 ? 0 : Math.min((page - 1) * pageSize + 1, totalRecords)}–{Math.min(page * pageSize, totalRecords)} of {totalRecords} selected children{ageGroupFilter !== 'all' ? ` · Ages ${ageGroupFilter}` : ''}
            </div>

            <div className="flex items-center gap-3">
              {/* Page size select */}
              <div className="flex items-center gap-1">
                <span className="text-[11px]">Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-[#FAF9F6] dark:bg-[#262421] border border-stone-200 dark:border-[#35332E] rounded px-1.5 py-0.5 text-xs text-stone-800 dark:text-[#F0EBE3] cursor-pointer"
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
                  className="p-1 rounded border border-stone-200 dark:border-[#35332E] text-stone-600 dark:text-[#A0988D] hover:bg-stone-50 dark:hover:bg-[#252421] disabled:opacity-30 cursor-pointer"
                  title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <span className="px-1.5 text-[11px] font-medium text-stone-700 dark:text-[#D5CFC5]">
                  {page} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1 rounded border border-stone-200 dark:border-[#35332E] text-stone-600 dark:text-[#A0988D] hover:bg-stone-50 dark:hover:bg-[#252421] disabled:opacity-30 cursor-pointer"
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

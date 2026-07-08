import React, { useEffect, useState, useRef } from 'react';
import { 
  Search, 
  X, 
  SlidersHorizontal, 
  Download, 
  Users, 
  UserCheck, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  Play,
  RefreshCw,
  ChevronRight,
  UserX,
  FileSpreadsheet
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';

interface AdminAttendanceViewProps {
  onBackToOverview: () => void;
  onNavigate?: (route: string) => void;
}

export const AdminAttendanceView: React.FC<AdminAttendanceViewProps> = ({ 
  onBackToOverview,
  onNavigate 
}) => {
  const { showError, showSuccess } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeStatus, setActiveStatus] = useState<string>('all');
  
  // Backend data states
  const [stats, setStats] = useState({
    expected: 0,
    checkedIn: 0,
    inside: 0,
    pickedUp: 0,
    notArrived: 0,
    needsAttention: 0
  });
  const [rows, setRows] = useState<any[]>([]);
  const [ageGroups, setAgeGroups] = useState<any[]>([]);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [teamActivity, setTeamActivity] = useState<any[]>([]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadAttendanceData = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const params = {
        q: debouncedQuery,
        status: activeStatus
      };
      const res = await api.admin.getAttendance(params);
      if (res.success) {
        setStats(res.stats || {
          expected: 0,
          checkedIn: 0,
          inside: 0,
          pickedUp: 0,
          notArrived: 0,
          needsAttention: 0
        });
        setRows(res.rows || []);
        setAgeGroups(res.ageGroups || []);
        setRecentScans(res.recentScans || []);
        setTeamActivity(res.teamActivity || []);
      }
    } catch (err: any) {
      console.error('Failed to load attendance data:', err);
      showError('Error', 'We could not load attendance right now. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAttendanceData();
  }, [debouncedQuery, activeStatus]);

  // Helper for row navigation
  const handleRowClick = (applicationId?: string) => {
    if (!applicationId) {
      showError('Navigation Info', 'This child record is not linked to a review application.');
      return;
    }
    // Navigate using hashed-router or onNavigate if available
    window.location.hash = `#/admin/applications/${applicationId}`;
  };

  // Safe Export handler
  const handleExport = () => {
    showSuccess('Export Initiated', 'Preparing attendance report sheet...');
    // Generate simple mock CSV and download it
    try {
      const headers = ['Child Name', 'Age Group', 'Parent/Guardian', 'Status', 'Location', 'Notes', 'Last Activity'];
      const csvRows = [headers.join(',')];
      for (const row of rows) {
        const csvRow = [
          `"${row.childName}"`,
          `"${row.ageGroup}"`,
          `"${row.parentName}"`,
          `"${row.status}"`,
          `"${row.location || ''}"`,
          `"${row.notes || ''}"`,
          `"${row.lastActivityLabel || ''}"`
        ];
        csvRows.push(csvRow.join(','));
      }
      const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `koinonia_attendance_${activeStatus}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      showError('Export Failed', 'An error occurred during report export generation.');
    }
  };

  // Helper for status badge rendering
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'checked_in':
        return (
          <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
            Checked In
          </span>
        );
      case 'picked_up':
        return (
          <span className="inline-flex items-center space-x-1 text-zinc-600 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
            Picked up
          </span>
        );
      case 'needs_attention':
        return (
          <span className="inline-flex items-center space-x-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
            <AlertTriangle className="w-3 h-3 mr-0.5 text-amber-600" />
            Needs Attention
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 text-zinc-400 bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
            Not Arrived
          </span>
        );
    }
  };

  // Helper for location label rendering
  const getLocationLabel = (loc: string | null) => {
    if (loc === 'inside') {
      return <span className="text-[#C59B27] font-semibold bg-[#C59B27]/5 px-2 py-0.5 rounded-md text-[10px] border border-[#C59B27]/10 uppercase tracking-wider">Inside</span>;
    }
    if (loc === 'picked_up') {
      return <span className="text-zinc-500 font-medium bg-zinc-50 px-2 py-0.5 rounded-md text-[10px] border border-zinc-100 uppercase tracking-wider">Picked up</span>;
    }
    return <span className="text-zinc-400">—</span>;
  };

  // Helper for notes styling
  const getNotesElement = (notes: string, status: string) => {
    if (!notes || notes === 'No care note') {
      return <span className="text-zinc-400 text-xs">No care note</span>;
    }
    if (status === 'needs_attention') {
      return (
        <span className="text-rose-600 font-semibold bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md text-[10px]">
          {notes}
        </span>
      );
    }
    return <span className="text-amber-700 font-medium bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md text-[10px]">{notes}</span>;
  };

  // Age group sums compute
  const totalExpected = ageGroups.reduce((acc, curr) => acc + (curr.expected || 0), 0);
  const totalCheckedIn = ageGroups.reduce((acc, curr) => acc + (curr.checkedIn || 0), 0);
  const totalInside = ageGroups.reduce((acc, curr) => acc + (curr.inside || 0), 0);
  const totalPickedUp = ageGroups.reduce((acc, curr) => acc + (curr.pickedUp || 0), 0);
  const totalNotArrived = ageGroups.reduce((acc, curr) => acc + (curr.notArrived || 0), 0);

  return (
    <div 
      className="space-y-6 animate-fade-in"
      data-view-version="admin-attendance-v2-stitch-complete"
    >
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-serif text-2xl font-bold text-[#18181B] tracking-tight">
            Attendance
          </h2>
          {/* Static Event Selector dropdown matching screenshot */}
          <div className="relative inline-block text-left">
            <select 
              disabled
              className="bg-white border border-[#EAE8E1] text-[#18181B] text-xs font-semibold px-3 py-1.5 pr-8 rounded-xl appearance-none focus:outline-hidden cursor-not-allowed shadow-3xs"
            >
              <option>The General Assembly</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-zinc-500">
              <ChevronRight className="w-3.5 h-3.5 rotate-90" />
            </div>
          </div>

          {refreshing && (
            <span className="flex items-center space-x-1.5 text-xs text-[#C59B27] font-semibold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Updating...</span>
            </span>
          )}
        </div>

        {/* Search & Actions (Desktop) */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search child, parent, phone..."
              className="w-full bg-white border border-[#EAE8E1] rounded-xl pl-9 pr-8 py-2 text-xs text-[#18181B] placeholder-zinc-400 focus:outline-hidden focus:border-[#C59B27] focus:ring-1 focus:ring-[#C59B27] transition-all font-medium"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 border-[#EAE8E1] text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => loadAttendanceData(true)}
            className="p-2 border-[#EAE8E1]"
            title="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* METRICS SUMMARY ROW */}
      <div 
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
        data-component-version="admin-attendance-stats-v2"
      >
        {[
          { label: 'Expected', count: stats.expected, color: 'border-zinc-200' },
          { label: 'Checked In', count: stats.checkedIn, color: 'border-zinc-200' },
          { label: 'Inside', count: stats.inside, color: 'border-[#C59B27]' },
          { label: 'Picked Up', count: stats.pickedUp, color: 'border-zinc-200' },
          { label: 'Not Arrived', count: stats.notArrived, color: 'border-zinc-200' },
          { label: 'Needs Attention', count: stats.needsAttention, color: 'border-amber-400', isAlert: true }
        ].map((card, idx) => (
          <div
            key={idx}
            className={`bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-3xs border-l-4 ${card.color} ${
              card.isAlert && card.count > 0 ? 'bg-amber-50/20' : ''
            }`}
          >
            <span className="text-zinc-400 block text-[10px] uppercase tracking-wider font-bold mb-1">
              {card.label}
            </span>
            <span className="font-serif text-3xl font-medium text-[#18181B] tracking-tight">
              {card.count}
            </span>
          </div>
        ))}
      </div>

      {/* ATTENDANCE FILTERS & NAVIGATION TABS */}
      <div 
        className="border-b border-[#EAE8E1] pb-px flex flex-wrap items-center justify-between gap-4"
        data-component-version="admin-attendance-tabs-v2"
      >
        <div className="flex space-x-6 overflow-x-auto scrollbar-none">
          {[
            { id: 'all', label: 'All' },
            { id: 'inside', label: 'Inside' },
            { id: 'picked_up', label: 'Picked Up' },
            { id: 'not_arrived', label: 'Not Arrived' },
            { id: 'needs_attention', label: 'Needs Attention', count: stats.needsAttention }
          ].map((tab) => {
            const active = activeStatus === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveStatus(tab.id)}
                className={`py-3 text-xs font-semibold relative transition-all whitespace-nowrap ${
                  active 
                    ? 'text-[#C59B27]' 
                    : 'text-zinc-500 hover:text-[#18181B]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[9px] bg-amber-500 text-white rounded-full font-bold">
                    {tab.count}
                  </span>
                )}
                {active && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C59B27]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* CORE WORKSPACE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: LIVE ATTENDANCE TABLE & AGE GROUPS */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* LIVE ATTENDANCE LIST SECTION */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl overflow-hidden shadow-3xs"
            data-component-version="admin-live-attendance-table-v2"
          >
            <div className="p-5 border-b border-[#EAE8E1] flex items-center justify-between">
              <h3 className="font-serif text-base font-bold text-[#18181B]">
                Live Attendance
              </h3>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveStatus('all');
                }}
                className="text-xs font-semibold text-[#C59B27] hover:text-[#b58c22] transition-colors"
              >
                View All
              </button>
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="w-6 h-6 text-[#C59B27] animate-spin" />
                <span className="text-xs text-zinc-500">Loading registers...</span>
              </div>
            ) : (
              <>
                {/* DESKTOP TABLE */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#EAE8E1] bg-[#FAF9F6] text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                        <th className="py-3 px-4">Child Name</th>
                        <th className="py-3 px-4">Age Group</th>
                        <th className="py-3 px-4">Parent/Guardian</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Location</th>
                        <th className="py-3 px-4">Notes</th>
                        <th className="py-3 px-4">Last Activity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#FAF9F6]">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-xs text-zinc-400">
                            No attendance records found for this filter.
                          </td>
                        </tr>
                      ) : (
                        rows.map((row) => (
                          <tr 
                            key={row.id}
                            onClick={() => handleRowClick(row.applicationId)}
                            className="hover:bg-[#FAF9F6] transition-colors cursor-pointer text-xs"
                          >
                            <td className="py-3.5 px-4 font-semibold text-zinc-800">
                              {row.childName}
                              {row.status === 'needs_attention' && (
                                <span className="ml-1 text-rose-500 font-bold" title="Care flag active">⚠️</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-zinc-500">{row.ageGroup}</td>
                            <td className="py-3.5 px-4 text-zinc-600 font-medium">{row.parentName}</td>
                            <td className="py-3.5 px-4">{getStatusBadge(row.status)}</td>
                            <td className="py-3.5 px-4">{getLocationLabel(row.location)}</td>
                            <td className="py-3.5 px-4 max-w-[140px] truncate">
                              {getNotesElement(row.notes, row.status)}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-500">
                              {row.lastActivityLabel}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE LIST OF CARDS */}
                <div 
                  className="sm:hidden divide-y divide-[#EAE8E1]"
                  data-component-version="admin-attendance-mobile-cards-v2"
                >
                  {rows.length === 0 ? (
                    <div className="py-12 text-center text-xs text-zinc-400 bg-white">
                      No attendance records found for this filter.
                    </div>
                  ) : (
                    rows.map((row) => (
                      <div 
                        key={row.id}
                        onClick={() => handleRowClick(row.applicationId)}
                        className="p-4 space-y-3 bg-white hover:bg-[#FAF9F6] active:bg-zinc-50 transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-zinc-800 text-xs flex items-center">
                              {row.childName}
                              {row.status === 'needs_attention' && (
                                <span className="ml-1 text-rose-500">⚠️</span>
                              )}
                            </h4>
                            <span className="text-[10px] text-zinc-400 font-medium block mt-0.5">{row.ageGroup}</span>
                          </div>
                          <div>{getStatusBadge(row.status)}</div>
                        </div>

                        <div className="space-y-2 text-[11px] text-zinc-600 bg-[#FAF9F6] p-2.5 rounded-xl border border-zinc-100">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Parent:</span>
                            <span className="font-medium text-zinc-700">{row.parentName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Location:</span>
                            <span>{getLocationLabel(row.location)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Notes:</span>
                            <span className="max-w-[180px] truncate">{getNotesElement(row.notes, row.status)}</span>
                          </div>
                          <div className="flex justify-between border-t border-zinc-200/60 pt-1.5 mt-1">
                            <span className="text-zinc-400">Activity:</span>
                            <span className="font-mono text-[10px] text-zinc-500">{row.lastActivityLabel}</span>
                          </div>
                        </div>

                        {row.applicationId && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            fullWidth
                            className="py-1.5 text-[10px] font-semibold"
                          >
                            View Details
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* ATTENDANCE BY AGE GROUP SUMMARY SECTION */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl overflow-hidden shadow-3xs"
            data-component-version="admin-attendance-age-groups-v2"
          >
            <div className="p-5 border-b border-[#EAE8E1]">
              <h3 className="font-serif text-base font-bold text-[#18181B]">
                Attendance by Age Group
              </h3>
            </div>

            {loading ? (
              <div className="py-12 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-[#C59B27] animate-spin" />
              </div>
            ) : ageGroups.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400">
                Age-group attendance is not available yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#EAE8E1] bg-[#FAF9F6] text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Age Group</th>
                      <th className="py-3 px-4">Expected</th>
                      <th className="py-3 px-4">Checked In</th>
                      <th className="py-3 px-4">Inside</th>
                      <th className="py-3 px-4">Picked Up</th>
                      <th className="py-3 px-4">Not Arrived</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF9F6]">
                    {ageGroups.map((g, idx) => (
                      <tr key={idx} className="hover:bg-zinc-50/50">
                        <td className="py-3 px-4 font-medium text-zinc-800">{g.ageGroup}</td>
                        <td className="py-3 px-4 font-mono text-zinc-600">{g.expected || 0}</td>
                        <td className="py-3 px-4 font-mono text-emerald-600 font-semibold">{g.checkedIn || 0}</td>
                        <td className="py-3 px-4 font-mono text-[#C59B27] font-semibold">{g.inside || 0}</td>
                        <td className="py-3 px-4 font-mono text-zinc-600">{g.pickedUp || 0}</td>
                        <td className="py-3 px-4 font-mono text-zinc-400">{g.notArrived || 0}</td>
                      </tr>
                    ))}
                    {/* TOTAL COMPLETED ROW */}
                    <tr className="bg-[#FAF9F6] font-bold border-t-2 border-[#EAE8E1] text-zinc-800">
                      <td className="py-3 px-4">Total</td>
                      <td className="py-3 px-4 font-mono">{totalExpected}</td>
                      <td className="py-3 px-4 font-mono text-emerald-600">{totalCheckedIn}</td>
                      <td className="py-3 px-4 font-mono text-[#C59B27]">{totalInside}</td>
                      <td className="py-3 px-4 font-mono">{totalPickedUp}</td>
                      <td className="py-3 px-4 font-mono text-zinc-400">{totalNotArrived}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: RELEVANT SUB-PANELS */}
        <div className="space-y-6">
          
          {/* QUICK ACTIONS PANEL */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-3xs space-y-4"
            data-component-version="admin-attendance-quick-actions-v2"
          >
            <h4 className="font-serif text-sm font-bold text-[#18181B] border-b border-[#FAF9F6] pb-2">
              Quick Actions
            </h4>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setActiveStatus('inside')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-between ${
                  activeStatus === 'inside'
                    ? 'bg-[#C59B27]/5 text-[#C59B27] border-[#C59B27]/30'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                <span>View children inside</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setActiveStatus('not_arrived')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-between ${
                  activeStatus === 'not_arrived'
                    ? 'bg-[#C59B27]/5 text-[#C59B27] border-[#C59B27]/30'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                <span>View not arrived</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setActiveStatus('needs_attention')}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-between ${
                  activeStatus === 'needs_attention'
                    ? 'bg-[#C59B27]/5 text-[#C59B27] border-[#C59B27]/30'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                <span>View needs attention</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* RECENT SCANS PANEL */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-3xs space-y-4"
            data-component-version="admin-attendance-recent-scans-v2"
          >
            <h4 className="font-serif text-sm font-bold text-[#18181B] border-b border-[#FAF9F6] pb-2">
              Recent Scans
            </h4>
            
            {loading ? (
              <div className="py-6 flex justify-center">
                <RefreshCw className="w-4 h-4 text-[#C59B27] animate-spin" />
              </div>
            ) : recentScans.length === 0 ? (
              <p className="text-zinc-400 text-xs text-center py-4">No recent scans yet.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                {recentScans.map((scan) => (
                  <div key={scan.id} className="flex items-start space-x-2.5 text-xs">
                    <span className="mt-1 flex-shrink-0">
                      {scan.type === 'pickup' ? (
                        <span className="w-2 h-2 rounded-full bg-zinc-400 block" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 block" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-zinc-800 truncate">
                        {scan.childName}
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {scan.type === 'pickup' ? 'Picked up' : 'Checked in'} · {scan.timeLabel}
                      </p>
                    </div>
                    {scan.flagged && (
                      <span className="text-[10px] text-rose-500 font-bold bg-rose-50 px-1 rounded-sm">Care</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TEAM ACTIVITY PANEL */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-3xs space-y-4"
            data-component-version="admin-attendance-team-activity-v2"
          >
            <h4 className="font-serif text-sm font-bold text-[#18181B] border-b border-[#FAF9F6] pb-2">
              Team Activity
            </h4>

            {loading ? (
              <div className="py-6 flex justify-center">
                <RefreshCw className="w-4 h-4 text-[#C59B27] animate-spin" />
              </div>
            ) : teamActivity.length === 0 ? (
              <p className="text-zinc-400 text-xs text-center py-4">No team activity yet.</p>
            ) : (
              <div className="space-y-3.5 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                {teamActivity.map((act, idx) => (
                  <div key={idx} className="text-xs space-y-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-zinc-800 truncate">{act.teamMemberName}</span>
                      <span className="font-mono text-[10px] text-zinc-400 flex-shrink-0">{act.timeLabel}</span>
                    </div>
                    <p className="text-zinc-500 text-[11px]">
                      {act.action} <strong className="font-medium text-zinc-700">{act.childName}</strong>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  Download, 
  RefreshCw, 
  Users, 
  UserCheck, 
  Clock, 
  ShieldAlert, 
  AlertTriangle, 
  FileSpreadsheet, 
  FileText,
  Save,
  Loader2,
  Calendar,
  AlertCircle,
  ArrowRight,
  Activity
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { motion } from 'motion/react';

interface AdminReportsViewProps {
  onBackToOverview: () => void;
  onNavigate?: (route: string) => void;
}

type ReportTab = 'pre_event' | 'live_event' | 'end_of_event' | 'volunteer_parent';

export const AdminReportsView: React.FC<AdminReportsViewProps> = ({ 
  onBackToOverview,
  onNavigate 
}) => {
  const { showError, showSuccess } = useNotification();
  const [activeTab, setActiveTab] = useState<ReportTab>('end_of_event');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Dynamic report dataset
  const [reportData, setReportData] = useState<any>(null);
  const [localNotes, setLocalNotes] = useState('');

  // Fetch report metrics
  const fetchReports = async (showLoadingState = true) => {
    if (showLoadingState) {
      setLoading(true);
      setFetchError(null);
    } else {
      setRefreshing(true);
    }

    try {
      if (activeTab === 'volunteer_parent') {
        const response = await api.admin.getVolunteerParentStats();
        if (response && response.success) {
          setReportData(response.stats);
          setLocalNotes('');
          setFetchError(null);
        } else {
          setFetchError('We could not load this report right now. Please try again.');
        }
      } else {
        const response = await api.admin.getReports({ reportType: activeTab });
        if (response && response.success) {
          setReportData(response);
          setLocalNotes(response.notes || '');
          setFetchError(null);
        } else {
          setFetchError('We could not load this report right now. Please try again.');
        }
      }
    } catch (err: any) {
      setFetchError('We could not load this report right now. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Reload when activeTab changes
  useEffect(() => {
    fetchReports(true);
  }, [activeTab]);

  // Handle saving notes
  const handleSaveNotes = async () => {
    if (!reportData?.event?.id) return;
    setSavingNotes(true);
    try {
      await api.admin.saveReportNotes({
        eventId: reportData.event.id,
        reportType: activeTab,
        notes: localNotes
      });
      showSuccess('Notes Saved', 'Report notes updated successfully.');
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Save Failed', typeof parsed === 'string' ? parsed : parsed.message);
    } finally {
      setSavingNotes(false);
    }
  };

  // Trigger file download helper
  const handleExport = (type: string, format: string) => {
    if (format !== 'csv') {
      showSuccess('Report Pending', `The requested ${format.toUpperCase()} report is currently being prepared by the children ministry directors.`);
      return;
    }

    const exportUrl = `/api/admin/reports/export?type=${type}&format=csv`;
    // Create an anchor and click it to trigger native download
    const link = document.createElement('a');
    link.href = exportUrl;
    link.setAttribute('download', `${type}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess('Export Started', `Downloading ${type.replace(/_/g, ' ')} CSV export...`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-stone-500">
        <Loader2 className="w-8 h-8 animate-spin text-[#C59B27] mb-3" />
        <p className="text-sm font-medium">Loading report metrics and logs...</p>
      </div>
    );
  }

  const { event, metrics, sections, attendanceOutcome, eventSummary, careAttention } = reportData || {};

  // Formatter for relative timestamps in live logs
  const formatTimeAgo = (isoString?: string) => {
    if (!isoString) return 'Just now';
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Recent';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-8"
      id="admin-reports-module"
      data-view-version="admin-reports-v2-tabs-complete"
    >
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200/60 pb-6">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-stone-900 tracking-tight">
            Event Performance & Reports
          </h1>
          <p className="text-stone-500 text-sm mt-1.5">
            Reports for <strong className="text-stone-700 font-medium">{event?.name || 'The General Assembly'}</strong> • {event?.dateRangeLabel || 'Oct 12 - Oct 14, 2023'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => fetchReports(false)}
            variant="outline"
            className="border-stone-200 hover:bg-stone-50 text-stone-700 text-xs py-2 px-3 flex items-center gap-1.5 rounded-lg"
            id="btn-refresh-reports"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#C59B27]' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Metrics'}
          </Button>
        </div>
      </div>

      {/* Navigation Tabs - Horizontal Chips */}
      <div className="flex border-b border-stone-200/80 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto scrollbar-none" data-component-version="admin-reports-tabs-v2">
        <div className="flex space-x-6 min-w-max pb-1">
          {[
            { id: 'pre_event', label: 'Pre-event Report' },
            { id: 'live_event', label: 'Live event Report' },
            { id: 'end_of_event', label: 'End-of-event Report' },
            { id: 'volunteer_parent', label: 'Volunteers & Parents' }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ReportTab)}
                className={`pb-3 text-sm font-medium border-b-2 transition-all relative ${
                  isActive 
                    ? 'border-[#C59B27] text-[#C59B27]' 
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
                id={`tab-${tab.id}`}
              >
                {tab.label}
                {isActive && (
                  <motion.div 
                    layoutId="activeTabUnderline" 
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C59B27]"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {fetchError ? (
        <div 
          className="flex flex-col items-center justify-center p-12 bg-stone-50/50 border border-stone-200/60 rounded-2xl min-h-[40vh] text-stone-500 space-y-4"
          data-component-version="admin-reports-error-state-v1"
        >
          <AlertCircle className="w-10 h-10 text-stone-400" />
          <p className="text-sm font-medium text-stone-600">{fetchError}</p>
          <Button
            onClick={() => fetchReports(true)}
            className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-medium py-2 px-5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all duration-200"
            id="btn-retry-reports"
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          {/* ----------------- PRE-EVENT VIEW ----------------- */}
          {activeTab === 'pre_event' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8" data-report-view="pre-event-report-v1">
          {/* Left Column content */}
          <div className="xl:col-span-2 space-y-8">
            {/* Subtitle / Purpose bar */}
            <div className="bg-amber-50/40 border border-[#C59B27]/10 p-4 rounded-xl text-stone-600 text-xs leading-relaxed">
              <strong className="text-stone-800 font-serif font-medium text-sm block mb-1">Pre-event report</strong>
              Review registrations, selected children, care needs, and missing details before the event begins.
            </div>

            {/* Metric Blocks */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-component-version="admin-reports-metrics-v2">
              {[
                { label: "Total registered", value: metrics?.totalRegistered || 0, desc: "Profiles applied", icon: Users, theme: 'default' },
                { label: "Under review", value: metrics?.underReview || 0, desc: "Pending review", icon: Clock, theme: 'amber' },
                { label: "Selected", value: metrics?.selected || 0, desc: "Admitted list", icon: UserCheck, theme: 'gold' },
                { label: "Waiting list", value: metrics?.waitingList || 0, desc: "On hold applications", icon: AlertTriangle, theme: 'amber' },
                { label: "Not selected", value: metrics?.notSelected || 0, desc: "Declined applications", icon: AlertCircle, theme: 'default' },
                { label: "Needs attention", value: metrics?.needsAttention || 0, desc: "Urgent checkups", icon: ShieldAlert, theme: 'amber' },
                { label: "Missing photo", value: metrics?.missingPickupPhoto || 0, desc: "Pickup safety check", icon: AlertCircle, theme: 'amber' },
                { label: "Care notes", value: metrics?.careNotesPresent || 0, desc: "Medical & support", icon: FileText, theme: 'gold' }
              ].map((card, idx) => (
                <div key={idx} className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">{card.label}</span>
                    <card.icon className={`w-4 h-4 ${
                      card.theme === 'gold' ? 'text-[#C59B27]' : card.theme === 'amber' ? 'text-amber-500' : 'text-stone-400'
                    }`} />
                  </div>
                  <div className="text-2xl font-semibold text-stone-900 mt-2 font-serif">{card.value}</div>
                  <p className="text-[10px] text-stone-500 mt-1">{card.desc}</p>
                </div>
              ))}
            </div>

            {/* Review readiness section */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-5">
                Review readiness
              </h3>
              <div className="space-y-4">
                {sections?.reviewReadiness?.map((item: any, idx: number) => {
                  const maxVal = metrics?.totalRegistered || 1;
                  const percentage = Math.min(100, Math.round((item.value / maxVal) * 100));
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-stone-700">{item.label}</span>
                        <span className="text-stone-500 font-medium">{item.value} ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.1 }}
                          className={`h-full rounded-full ${
                            item.label === 'Selected' ? 'bg-[#C59B27]' : 'bg-stone-400'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Child readiness list */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-5">
                Child readiness
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sections?.childReadiness?.map((item: any, idx: number) => (
                  <div key={idx} className="p-4 rounded-lg bg-stone-50/50 border border-stone-100 flex flex-col justify-between">
                    <div>
                      <div className="text-xs text-stone-400 uppercase font-semibold tracking-wider">{item.label}</div>
                      <div className="text-xs text-stone-500 mt-1">{item.desc}</div>
                    </div>
                    <div className="text-xl font-serif font-semibold text-stone-800 mt-3">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Age group summary table */}
            <div className="bg-white rounded-xl border border-stone-200/80 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-lg font-serif font-medium text-stone-900">
                  Age group summary
                </h3>
                <span className="text-stone-400 text-xs font-mono">Registry Demographics</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50/50 border-b border-stone-100">
                      <th className="py-3 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">Age Group</th>
                      <th className="py-3 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider text-right">Registered</th>
                      <th className="py-3 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider text-right">Selected</th>
                      <th className="py-3 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider text-right">Under Review</th>
                      <th className="py-3 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider text-right">Needs Attention</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {sections?.ageGroupSummary?.length > 0 ? (
                      sections.ageGroupSummary.map((row: any, idx: number) => (
                        <tr key={idx} className="hover:bg-stone-50/40 transition-colors">
                          <td className="py-3 px-6 text-xs font-medium text-stone-800">{row.ageGroup}</td>
                          <td className="py-3 px-6 text-xs font-semibold text-stone-900 text-right font-mono">{row.registered}</td>
                          <td className="py-3 px-6 text-xs font-semibold text-stone-900 text-right font-mono">{row.selected}</td>
                          <td className="py-3 px-6 text-xs font-semibold text-stone-900 text-right font-mono">{row.underReview}</td>
                          <td className="py-3 px-6 text-xs font-semibold text-stone-900 text-right font-mono text-amber-600">{row.needsAttention}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-xs text-stone-400">
                          No age group data is available yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Parent and pickup readiness */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-5">
                Parent and pickup readiness
              </h3>
              <div className="divide-y divide-stone-100">
                {sections?.parentPickupReadiness?.map((item: any, idx: number) => (
                  <div key={idx} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-stone-800">{item.label}</div>
                      <div className="text-[10px] text-stone-500 mt-0.5">{item.desc}</div>
                    </div>
                    <div className="text-sm font-semibold text-stone-900 font-mono">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column content */}
          <div className="space-y-8" data-component-version="admin-reports-side-panels-v2">
            {/* Review actions */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-4">
                Review actions
              </h3>
              <div className="space-y-2.5">
                {[
                  { label: 'Go to Application Review Board', path: '/admin/review' },
                  { label: 'Go to Children Register', path: '/admin/children' },
                  { label: 'Go to Applications Inbox', path: '/admin/applications' }
                ].map((act, idx) => (
                  <button
                    key={idx}
                    onClick={() => onNavigate && onNavigate(act.path)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-stone-100 hover:bg-stone-50/50 hover:border-stone-200 text-left text-xs font-medium text-stone-700 transition-all group"
                  >
                    <span>{act.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#C59B27] group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
            </div>

            {/* Care & Attention Summary Card */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-4 mb-4">
                <AlertCircle className="w-5 h-5 text-[#C59B27]" />
                <h3 className="text-lg font-serif font-medium text-stone-900">
                  Care & Attention
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {careAttention?.map((item: any, idx: number) => (
                  <div key={idx} className="bg-stone-50/50 p-4 rounded-lg border border-stone-100 hover:border-stone-200 transition-colors">
                    <div className="text-xs text-stone-500 font-medium truncate">{item.label}</div>
                    <div className="text-xl font-serif font-semibold text-stone-800 mt-1">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Export Reports Module */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-4">
                Export reports
              </h3>
              <p className="text-stone-500 text-xs mb-5 leading-relaxed">
                Generate pre-event spreadsheets for church safety audits and classroom sheets.
              </p>
              <div className="space-y-3">
                {[
                  { type: 'event_summary', label: 'Export readiness summary', icon: FileSpreadsheet },
                  { type: 'selected_children', label: 'Export selected children', icon: FileSpreadsheet },
                  { type: 'care_notes', label: 'Export care notes', icon: FileSpreadsheet },
                  { type: 'missing_pickup_photos', label: 'Export missing pickup photos', icon: FileSpreadsheet }
                ].map((item) => (
                  <div key={item.type} className="flex items-center justify-between p-3 rounded-lg border border-stone-100 hover:bg-stone-50/40 transition-all">
                    <div className="flex items-center gap-2.5">
                      <item.icon className="w-4 h-4 text-stone-400" />
                      <span className="text-xs font-medium text-stone-700">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleExport(item.type, 'csv')}
                        className="text-[10px] font-semibold text-[#C59B27] bg-[#C59B27]/5 hover:bg-[#C59B27]/10 px-2 py-1 rounded transition-colors"
                        title="Download as CSV"
                      >
                        CSV
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Report Notes Module */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm space-y-4">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4">
                Report notes
              </h3>
              <textarea
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                placeholder="Record event outcomes, observations, teacher logs, and children behaviors..."
                className="w-full h-32 p-3 text-xs text-stone-800 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] placeholder:text-stone-400 resize-none transition-all"
              />
              <Button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="w-full bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all"
                id="btn-save-report-notes"
              >
                {savingNotes ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving Notes...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Save Notes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- LIVE EVENT VIEW ----------------- */}
      {activeTab === 'live_event' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8" data-report-view="live-event-report-v1">
          {/* Left Column content */}
          <div className="xl:col-span-2 space-y-8">
            <div className="bg-emerald-50/40 border border-emerald-600/10 p-4 rounded-xl text-stone-600 text-xs leading-relaxed">
              <strong className="text-emerald-800 font-serif font-medium text-sm block mb-1">Live event report</strong>
              Track check-in, pickup, children inside, and attention items while the event is active.
            </div>

            {/* Metric Blocks */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4" data-component-version="admin-reports-metrics-v2">
              {[
                { label: "Expected", value: metrics?.expected || 0, desc: "Total approved seats", icon: UserCheck, theme: 'gold' },
                { label: "Checked in", value: metrics?.checkedIn || 0, desc: "Present inside event", icon: Clock, theme: 'emerald' },
                { label: "Inside", value: metrics?.inside || 0, desc: "Currently present", icon: Users, theme: 'emerald' },
                { label: "Picked up", value: metrics?.pickedUp || 0, desc: "Safely checked-out", icon: UserCheck, theme: 'gold' },
                { label: "Not arrived", value: metrics?.notArrived || 0, desc: "Absent children", icon: AlertTriangle, theme: 'amber' },
                { label: "Needs attention", value: metrics?.needsAttention || 0, desc: "Care flags", icon: ShieldAlert, theme: 'amber' }
              ].map((card, idx) => (
                <div key={idx} className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">{card.label}</span>
                    <card.icon className={`w-4 h-4 ${
                      card.theme === 'gold' ? 'text-[#C59B27]' : card.theme === 'emerald' ? 'text-emerald-600' : 'text-amber-500'
                    }`} />
                  </div>
                  <div className="text-2xl font-semibold text-stone-900 mt-2 font-serif">{card.value}</div>
                  <p className="text-[10px] text-stone-500 mt-1">{card.desc}</p>
                </div>
              ))}
            </div>

            {/* Live attendance outcome */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-5">
                Live attendance
              </h3>
              <div className="space-y-4">
                {sections?.liveAttendanceOutcome?.map((item: any, idx: number) => {
                  const percentage = item.percentage;
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-stone-700">{item.label}</span>
                        <span className="text-stone-500 font-medium">{item.value} children ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.1 }}
                          className={`h-full rounded-full ${
                            item.label === 'Checked In' || item.label === 'Inside'
                              ? 'bg-emerald-600' 
                              : item.label === 'Picked Up'
                              ? 'bg-stone-700'
                              : 'bg-[#C59B27]'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Attendance by age group table */}
            <div className="bg-white rounded-xl border border-stone-200/80 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-lg font-serif font-medium text-stone-900">
                  Attendance by age group
                </h3>
                <span className="text-stone-400 text-xs font-mono">Live Ratios</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50/50 border-b border-stone-100">
                      <th className="py-3 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">Age Group</th>
                      <th className="py-3 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider text-right">Expected</th>
                      <th className="py-3 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider text-right">Checked In</th>
                      <th className="py-3 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider text-right">Inside</th>
                      <th className="py-3 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider text-right">Picked Up</th>
                      <th className="py-3 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider text-right">Not Arrived</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {sections?.attendanceByAgeGroup?.length > 0 ? (
                      sections.attendanceByAgeGroup.map((row: any, idx: number) => (
                        <tr key={idx} className="hover:bg-stone-50/40 transition-colors">
                          <td className="py-3 px-6 text-xs font-medium text-stone-800">{row.ageGroup}</td>
                          <td className="py-3 px-6 text-xs font-semibold text-stone-900 text-right font-mono">{row.expected}</td>
                          <td className="py-3 px-6 text-xs font-semibold text-emerald-700 text-right font-mono">{row.checkedIn}</td>
                          <td className="py-3 px-6 text-xs font-semibold text-emerald-800 text-right font-mono">{row.inside}</td>
                          <td className="py-3 px-6 text-xs font-semibold text-stone-700 text-right font-mono">{row.pickedUp}</td>
                          <td className="py-3 px-6 text-xs font-semibold text-stone-400 text-right font-mono">{row.notArrived}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-xs text-stone-400">
                          No age group data is available yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Current attention list */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-5">
                Current attention list
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sections?.currentAttentionList?.map((item: any, idx: number) => (
                  <div key={idx} className="p-4 rounded-lg bg-stone-50/50 border border-stone-100 flex flex-col justify-between">
                    <div>
                      <div className="text-xs text-amber-600 uppercase font-semibold tracking-wider flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {item.label}
                      </div>
                      <div className="text-xs text-stone-500 mt-1">{item.desc}</div>
                    </div>
                    <div className="text-xl font-serif font-semibold text-stone-800 mt-3">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent scans list */}
            <div className="bg-white rounded-xl border border-stone-200/80 shadow-sm p-6 space-y-4">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                Recent scans
              </h3>
              {sections?.recentScans?.length > 0 ? (
                <div className="divide-y divide-stone-100">
                  {sections.recentScans.map((scan: any, idx: number) => (
                    <div key={idx} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-stone-800">{scan.childName}</div>
                        <div className="text-[10px] text-stone-500 mt-0.5">{scan.ageGroup}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[9px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full ${
                          scan.status === 'picked_up' 
                            ? 'bg-stone-100 text-stone-800 border border-stone-200' 
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}>
                          {scan.status.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-stone-400 font-mono">{formatTimeAgo(scan.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-stone-400">
                  No recent scans yet.
                </div>
              )}
            </div>

            {/* Team activity list */}
            <div className="bg-white rounded-xl border border-stone-200/80 shadow-sm p-6 space-y-4">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#C59B27]" />
                Team activity
              </h3>
              {sections?.teamActivity?.length > 0 ? (
                <div className="divide-y divide-stone-100">
                  {sections.teamActivity.map((member: any, idx: number) => (
                    <div key={idx} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-stone-800">{member.fullName}</div>
                        <div className="text-[10px] text-stone-500 mt-0.5">{member.team}</div>
                      </div>
                      <span className="text-[9px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                        {member.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-stone-400">
                  No team activity yet.
                </div>
              )}
            </div>
          </div>

          {/* Right Column content */}
          <div className="space-y-8" data-component-version="admin-reports-side-panels-v2">
            {/* Quick Actions */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-4">
                Quick actions
              </h3>
              <div className="space-y-2.5">
                {[
                  { label: 'View children inside', path: '/admin/attendance' },
                  { label: 'View not arrived', path: '/admin/attendance' },
                  { label: 'View needs attention', path: '/admin/attendance' }
                ].map((act, idx) => (
                  <button
                    key={idx}
                    onClick={() => onNavigate && onNavigate(act.path)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-stone-100 hover:bg-stone-50/50 hover:border-stone-200 text-left text-xs font-medium text-stone-700 transition-all group"
                  >
                    <span>{act.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#C59B27] group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
            </div>

            {/* Care & Attention Summary Card */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-4 mb-4">
                <AlertCircle className="w-5 h-5 text-[#C59B27]" />
                <h3 className="text-lg font-serif font-medium text-stone-900">
                  Care & Attention
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {careAttention?.map((item: any, idx: number) => (
                  <div key={idx} className="bg-stone-50/50 p-4 rounded-lg border border-stone-100 hover:border-stone-200 transition-colors">
                    <div className="text-xs text-stone-500 font-medium truncate">{item.label}</div>
                    <div className="text-xl font-serif font-semibold text-stone-800 mt-1">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Export Reports Module */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-4">
                Export reports
              </h3>
              <p className="text-stone-500 text-xs mb-5 leading-relaxed">
                Generate dynamic live-event spreadsheets for secure guardian lookup, registration verification, and audit logs.
              </p>
              <div className="space-y-3">
                {[
                  { type: 'attendance', label: 'Export live attendance', icon: FileSpreadsheet },
                  { type: 'children_inside', label: 'Export children inside', icon: FileSpreadsheet },
                  { type: 'not_arrived', label: 'Export not arrived', icon: FileSpreadsheet },
                  { type: 'pickup_list', label: 'Export pickup list', icon: FileSpreadsheet },
                  { type: 'needs_attention', label: 'Export needs attention', icon: FileSpreadsheet }
                ].map((item) => (
                  <div key={item.type} className="flex items-center justify-between p-3 rounded-lg border border-stone-100 hover:bg-stone-50/40 transition-all">
                    <div className="flex items-center gap-2.5">
                      <item.icon className="w-4 h-4 text-stone-400" />
                      <span className="text-xs font-medium text-stone-700">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleExport(item.type, 'csv')}
                        className="text-[10px] font-semibold text-[#C59B27] bg-[#C59B27]/5 hover:bg-[#C59B27]/10 px-2 py-1 rounded transition-colors"
                        title="Download as CSV"
                      >
                        CSV
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Report Notes Module */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm space-y-4">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4">
                Report notes
              </h3>
              <textarea
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                placeholder="Record event outcomes, observations, teacher logs, and children behaviors..."
                className="w-full h-32 p-3 text-xs text-stone-800 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] placeholder:text-stone-400 resize-none transition-all"
              />
              <Button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="w-full bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all"
                id="btn-save-report-notes"
              >
                {savingNotes ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving Notes...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Save Notes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- END OF EVENT VIEW ----------------- */}
      {activeTab === 'end_of_event' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8" data-report-view="end-of-event-report-v1">
          {/* Left Column content */}
          <div className="xl:col-span-2 space-y-8">
            <div className="bg-stone-50 border border-stone-200/80 p-4 rounded-xl text-stone-600 text-xs leading-relaxed">
              <strong className="text-stone-800 font-serif font-medium text-sm block mb-1">End-of-event report</strong>
              Final counts for registration, selection, entry, pickup, and children needing attention.
            </div>

            {/* Key Metric Blocks */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-component-version="admin-reports-metrics-v2">
              <div className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">Total Registered</span>
                  <Users className="w-4 h-4 text-[#C59B27]" />
                </div>
                <div className="text-2xl font-semibold text-stone-900 mt-2 font-serif">{metrics?.totalRegistered || 0}</div>
                <p className="text-[10px] text-stone-500 mt-1">Children profiles applied</p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">Selected List</span>
                  <UserCheck className="w-4 h-4 text-[#C59B27]" />
                </div>
                <div className="text-2xl font-semibold text-stone-900 mt-2 font-serif">{metrics?.selected || 0}</div>
                <p className="text-[10px] text-stone-500 mt-1">Confirmed event seats</p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">Total Checked In</span>
                  <Clock className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-semibold text-stone-900 mt-2 font-serif">{metrics?.checkedIn || 0}</div>
                <p className="text-[10px] text-stone-500 mt-1">Present inside ministry space</p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">Attention Items</span>
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-semibold text-stone-900 mt-2 font-serif">{metrics?.needsAttention || 0}</div>
                <p className="text-[10px] text-stone-500 mt-1">Requiring direct care follow-up</p>
              </div>
            </div>

            {/* Attendance Outcome Panel */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-5">
                Attendance Outcome
              </h3>
              
              <div className="space-y-5">
                {attendanceOutcome?.map((item: any, idx: number) => {
                  const maxVal = metrics?.totalRegistered || 1;
                  const percentage = Math.min(100, Math.round((item.value / maxVal) * 100));
                  
                  return (
                    <div key={idx} className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-stone-700">{item.label}</span>
                        <span className="text-stone-500 font-medium">{item.value} children ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.1 }}
                          className={`h-full rounded-full ${
                            item.label === 'Checked In' 
                              ? 'bg-emerald-600' 
                              : item.label === 'Picked Up' 
                              ? 'bg-stone-700' 
                              : item.label === 'Absent' 
                              ? 'bg-amber-500/80' 
                              : 'bg-[#C59B27]'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Event Summary Table */}
            <div className="bg-white rounded-xl border border-stone-200/80 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-lg font-serif font-medium text-stone-900">
                  Event Summary
                </h3>
                <span className="text-stone-400 text-xs font-mono">
                  {event?.section || 'Children and Teens Section'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50/50 border-b border-stone-100">
                      <th className="py-3.5 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">Metrics Parameter</th>
                      <th className="py-3.5 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider text-right">Value Count</th>
                      <th className="py-3.5 px-6 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">Scope Context</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {eventSummary?.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-stone-50/40 transition-colors">
                        <td className="py-3.5 px-6 text-xs font-medium text-stone-800">{row.label}</td>
                        <td className="py-3.5 px-6 text-xs font-semibold text-stone-900 text-right font-mono">{row.value}</td>
                        <td className="py-3.5 px-6 text-xs text-stone-500">{row.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column content */}
          <div className="space-y-8" data-component-version="admin-reports-side-panels-v2">
            {/* Care & Attention Summary Card */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-4 mb-4">
                <AlertCircle className="w-5 h-5 text-[#C59B27]" />
                <h3 className="text-lg font-serif font-medium text-stone-900">
                  Care & Attention
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {careAttention?.map((item: any, idx: number) => (
                  <div key={idx} className="bg-stone-50/50 p-4 rounded-lg border border-stone-100 hover:border-stone-200 transition-colors">
                    <div className="text-xs text-stone-500 font-medium truncate">{item.label}</div>
                    <div className="text-xl font-serif font-semibold text-stone-800 mt-1">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Export Reports Module */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-4">
                Export reports
              </h3>
              
              <p className="text-stone-500 text-xs mb-5 leading-relaxed">
                Generate structured sheets for church records, safety audits, and ministry file verification.
              </p>

              <div className="space-y-3">
                {[
                  { type: 'event_summary', label: 'Download event report', icon: FileSpreadsheet },
                  { type: 'event_summary', label: 'Download summary', icon: FileSpreadsheet },
                  { type: 'attendance', label: 'Export attendance', icon: FileSpreadsheet },
                  { type: 'absent', label: 'Export absent children', icon: FileSpreadsheet },
                  { type: 'care_notes', label: 'Export care notes', icon: FileSpreadsheet },
                  { type: 'pickup_list', label: 'Export pickup list', icon: FileSpreadsheet }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-stone-100 hover:bg-stone-50/40 transition-all">
                    <div className="flex items-center gap-2.5">
                      <item.icon className="w-4 h-4 text-stone-400" />
                      <span className="text-xs font-medium text-stone-700">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleExport(item.type, 'csv')}
                        className="text-[10px] font-semibold text-[#C59B27] bg-[#C59B27]/5 hover:bg-[#C59B27]/10 px-2 py-1 rounded transition-colors"
                        title="Download as CSV"
                      >
                        CSV
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Report Notes Module */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm space-y-4">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4">
                Report notes
              </h3>

              <textarea
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                placeholder="Record event outcomes, observations, teacher logs, and children behaviors..."
                className="w-full h-32 p-3 text-xs text-stone-800 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] placeholder:text-stone-400 resize-none transition-all"
              />

              <Button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="w-full bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all"
                id="btn-save-report-notes"
              >
                {savingNotes ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving Notes...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Save Notes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- VOLUNTEER & PARENT ENGAGEMENT VIEW ----------------- */}
      {activeTab === 'volunteer_parent' && reportData && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8" data-report-view="volunteer-parent-report-v1">
          {/* Left Column content */}
          <div className="xl:col-span-2 space-y-8">
            <div className="bg-[#FAF9F6] border border-[#EAE8E1] p-4 rounded-xl text-stone-600 text-xs leading-relaxed">
              <strong className="text-stone-800 font-serif font-medium text-sm block mb-1">Volunteers & Parents Census</strong>
              Review demographic reach, volunteer availability, and ministry team staffing distribution ratios.
            </div>

            {/* Key Metric Blocks */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-component-version="admin-reports-metrics-v2">
              <div className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">Total Families</span>
                  <Users className="w-4 h-4 text-[#C59B27]" />
                </div>
                <div className="text-2xl font-semibold text-stone-900 mt-2 font-serif">{reportData.totalParents || 0}</div>
                <p className="text-[10px] text-stone-500 mt-1">Registered parent folders</p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">Total Applicants</span>
                  <Activity className="w-4 h-4 text-[#C59B27]" />
                </div>
                <div className="text-2xl font-semibold text-stone-900 mt-2 font-serif">{reportData.totalVolunteers || 0}</div>
                <p className="text-[10px] text-stone-500 mt-1">Created volunteer profiles</p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">Approved Rosters</span>
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-semibold text-emerald-600 mt-2 font-serif">{reportData.approvedVolunteers || 0}</div>
                <p className="text-[10px] text-stone-500 mt-1">Active serving volunteers</p>
              </div>

              <div className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">Pending Review</span>
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-semibold text-amber-600 mt-2 font-serif">{reportData.pendingVolunteers || 0}</div>
                <p className="text-[10px] text-stone-500 mt-1">Awaiting admin review</p>
              </div>
            </div>

            {/* Volunteer Team load-distribution panel */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-5">
                Active Volunteer Team Staffing Distribution
              </h3>
              
              <div className="space-y-4">
                {(!reportData.volunteersByTeam || reportData.volunteersByTeam.length === 0) ? (
                  <p className="text-xs text-stone-400 text-center py-6">No approved volunteers are assigned to any service teams yet.</p>
                ) : (
                  reportData.volunteersByTeam.map((item: any, idx: number) => {
                    const maxVal = Math.max(...reportData.volunteersByTeam.map((v: any) => v.count), 1);
                    const percentage = Math.min(100, Math.round((item.count / maxVal) * 100));
                    
                    // human readable team labels
                    const formatTeamLabel = (raw: string) => {
                      return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    };

                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-stone-700">{formatTeamLabel(item.team)}</span>
                          <span className="text-stone-500 font-medium">{item.count} Volunteer(s)</span>
                        </div>
                        <div className="w-full bg-stone-100 h-3.5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 0.8, delay: idx * 0.05 }}
                            className="h-full rounded-full bg-[#C59B27]"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Column content */}
          <div className="space-y-8" data-component-version="admin-reports-side-panels-v2">
            {/* Quick Actions Panel */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-4">
                Engagement Shortcuts
              </h3>
              <p className="text-stone-500 text-[11px] mb-4 leading-relaxed">
                Quick links to review applicant files and manage family folders directly.
              </p>
              
              <div className="space-y-2.5">
                <button
                  onClick={() => onNavigate && onNavigate('/admin/volunteers')}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-stone-100 hover:bg-stone-50/50 hover:border-stone-200 text-left text-xs font-medium text-stone-700 transition-all group cursor-pointer"
                >
                  <span>Open Volunteers Board</span>
                  <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#C59B27] group-hover:translate-x-0.5 transition-all" />
                </button>

                <button
                  onClick={() => onNavigate && onNavigate('/admin/parents')}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-stone-100 hover:bg-stone-50/50 hover:border-stone-200 text-left text-xs font-medium text-stone-700 transition-all group cursor-pointer"
                >
                  <span>Open Parents Directory</span>
                  <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#C59B27] group-hover:translate-x-0.5 transition-all" />
                </button>
              </div>
            </div>

            {/* Vetting & Safeguarding Guidelines */}
            <div className="bg-white p-6 rounded-xl border border-stone-200/80 shadow-sm">
              <h3 className="text-lg font-serif font-medium text-stone-900 border-b border-stone-100 pb-4 mb-4">
                Safeguarding & Staffing
              </h3>
              
              <div className="text-xs text-stone-600 space-y-3 leading-relaxed">
                <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-xl space-y-1">
                  <span className="font-bold block text-[#C59B27] uppercase text-[9px] tracking-wider">Teacher/Child Ratio Standards</span>
                  <p className="text-[11px] text-stone-500">
                    Maintain at least 1 vetted teacher per 6 children under age 4, and 1 vetted teacher per 10 children aged 4-12.
                  </p>
                </div>

                <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">
                  <span className="font-bold block text-emerald-800 uppercase text-[9px] tracking-wider">Two-Leader Mandate</span>
                  <p className="text-[11px] text-stone-500">
                    A minimum of two approved workers must be present in every classroom space during any kids or teens service session.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}

    </motion.div>
  );
};

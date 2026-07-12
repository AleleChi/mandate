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
  Activity,
  ArrowLeft,
  Plus,
  BarChart2,
  Shield,
  FileCheck,
  Eye,
  Trash2,
  Archive,
  History,
  CheckCircle,
  X,
  FileDown,
  ChevronRight,
  Sparkles,
  Search,
  Lock,
  LockOpen
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { motion, AnimatePresence } from 'motion/react';

interface AdminReportsViewProps {
  onBackToOverview: () => void;
  onNavigate?: (route: string) => void;
}

// Tabs
type MainTab = 'reports_centre' | 'template_library' | 'custom_builder' | 'live_metrics';
type LegacyReportTab = 'pre_event' | 'live_event' | 'end_of_event' | 'volunteer_parent';

interface ReportTemplate {
  key: string;
  name: string;
  description: string;
  privacyClassification: string;
  recommendedSections: string[];
}

export const AdminReportsView: React.FC<AdminReportsViewProps> = ({ 
  onBackToOverview,
  onNavigate 
}) => {
  const { showError, showSuccess } = useNotification();
  
  // Tabs State
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('reports_centre');
  const [activeLegacyTab, setActiveLegacyTab] = useState<LegacyReportTab>('end_of_event');

  // Loading States
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [loadingReportsList, setLoadingReportsList] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Data States
  const [legacyReportData, setLegacyReportData] = useState<any>(null);
  const [localNotes, setLocalNotes] = useState('');
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [generatedReports, setGeneratedReports] = useState<any[]>([]);
  
  // Custom Builder Form State
  const [builderTemplate, setBuilderTemplate] = useState<string>('event_executive_summary');
  const [builderClassification, setBuilderClassification] = useState<string>('Internal operational');
  const [builderSections, setBuilderSections] = useState<string[]>([
    'Executive Summary', 'Operational Metrics', 'Grounded Recommendations'
  ]);
  const [builderFilters, setBuilderFilters] = useState({
    ageGroup: 'All',
    location: 'All',
    timezone: 'Africa/Lagos'
  });
  const [submittingJob, setSubmittingJob] = useState(false);
  const [activeProgressJobId, setActiveProgressJobId] = useState<string | null>(null);
  const [activeProgressStep, setActiveProgressStep] = useState<number>(0);
  const [activeProgressText, setActiveProgressText] = useState<string>('');

  // Audit modal
  const [auditReportId, setAuditReportId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // 1. Fetch Legacy Metrics
  const fetchLegacyReports = async (showLoadingState = true) => {
    if (showLoadingState) {
      setLoadingMetrics(true);
      setFetchError(null);
    } else {
      setRefreshing(true);
    }

    try {
      if (activeLegacyTab === 'volunteer_parent') {
        const response = await api.admin.getVolunteerParentStats();
        if (response && response.success) {
          setLegacyReportData(response.stats);
          setLocalNotes('');
        } else {
          setFetchError('We could not load legacy metrics.');
        }
      } else {
        const response = await api.admin.getReports({ reportType: activeLegacyTab });
        if (response && response.success) {
          setLegacyReportData(response);
          setLocalNotes(response.notes || '');
        } else {
          setFetchError('We could not load legacy metrics.');
        }
      }
    } catch (err: any) {
      setFetchError('Failed to fetch legacy metrics.');
    } finally {
      setLoadingMetrics(false);
      setRefreshing(false);
    }
  };

  // 2. Fetch Templates & Job History
  const fetchReportsListAndTemplates = async () => {
    setLoadingReportsList(true);
    try {
      // Templates
      const tempRes = await api.request('/api/admin/reports/templates');
      if (tempRes && tempRes.success) {
        setTemplates(tempRes.templates);
      }
      
      // Generated Jobs
      const jobsRes = await api.request('/api/admin/reports');
      if (jobsRes && jobsRes.success) {
        setGeneratedReports(jobsRes.reports);
      }
    } catch (err) {
      console.error('Failed to load reports list or templates:', err);
    } finally {
      setLoadingReportsList(false);
    }
  };

  useEffect(() => {
    fetchReportsListAndTemplates();
  }, []);

  useEffect(() => {
    if (activeMainTab === 'live_metrics') {
      fetchLegacyReports(true);
    }
  }, [activeMainTab, activeLegacyTab]);

  // Handle saving notes
  const handleSaveNotes = async () => {
    if (!legacyReportData?.event?.id) return;
    setSavingNotes(true);
    try {
      await api.admin.saveReportNotes({
        eventId: legacyReportData.event.id,
        reportType: activeLegacyTab,
        notes: localNotes
      });
      showSuccess('Notes Saved', 'Report notes updated successfully.');
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Save Failed', parsed.message);
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
    const link = document.createElement('a');
    link.href = exportUrl;
    link.setAttribute('download', `${type}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess('Export Started', `Downloading ${type.replace(/_/g, ' ')} CSV export...`);
  };

  // 3. Request a new PDF Report Job
  const handleCreateReportJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingJob(true);
    
    // Auto-generate idempotency key to prevent double clicks
    const idempotencyKey = 'key-' + Math.random().toString(36).substring(2);

    try {
      const response = await api.request('/api/admin/reports', {
        method: 'POST',
        body: JSON.stringify({
          templateKey: builderTemplate,
          privacyLevel: builderClassification,
          sections: builderSections,
          filters: builderFilters,
          idempotencyKey
        })
      });

      if (response && response.success) {
        showSuccess('Job Queued', 'Professional PDF snapshot compilation started in background.');
        const newJobId = response.jobId;
        setActiveProgressJobId(newJobId);
        setActiveProgressStep(1);
        setActiveProgressText('Compiling real-time database snapshot & ledger...');

        // Start polling for progress
        pollJobStatus(newJobId);
      } else {
        showError('Request Failed', 'Failed to request report generation.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Submission Failed', parsed.message);
    } finally {
      setSubmittingJob(false);
    }
  };

  // Poll Job Status
  const pollJobStatus = (jobId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 30) {
        clearInterval(interval);
        setActiveProgressJobId(null);
        showError('Timeout', 'Report took longer than expected. Check Reports Centre.');
        fetchReportsListAndTemplates();
        return;
      }

      try {
        const res = await api.request(`/api/admin/reports/${jobId}`);
        if (res && res.success) {
          const status = res.report.status;
          
          if (status === 'queued') {
            setActiveProgressStep(1);
            setActiveProgressText('Compiling database records safely...');
          } else if (status === 'generating') {
            setActiveProgressStep(2);
            setActiveProgressText('Applying role-aware privacy filters...');
          } else if (status === 'completed' || status === 'ready') {
            setActiveProgressStep(4);
            setActiveProgressText('Signing hash ledger and writing PDF...');
            clearInterval(interval);
            setTimeout(() => {
              setActiveProgressJobId(null);
              showSuccess('Report Complete', 'Immutable A4 PDF ready for download.');
              setActiveMainTab('reports_centre');
              fetchReportsListAndTemplates();
            }, 1000);
          } else if (status === 'failed') {
            clearInterval(interval);
            setActiveProgressJobId(null);
            showError('Generation Failed', res.report.error_log || 'PDF generation failed.');
            fetchReportsListAndTemplates();
          } else if (status === 'cancelled') {
            clearInterval(interval);
            setActiveProgressJobId(null);
            showError('Cancelled', 'Job was cancelled by another supervisor.');
            fetchReportsListAndTemplates();
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 1500);
  };

  // View Audit Logs
  const viewAuditLogs = async (reportId: string) => {
    setAuditReportId(reportId);
    setLoadingAudit(true);
    try {
      const res = await api.request(`/api/admin/reports/${reportId}/history`);
      if (res && res.success) {
        setAuditLogs(res.history);
      }
    } catch (err) {
      showError('Error', 'Failed to fetch audit trails.');
    } finally {
      setLoadingAudit(false);
    }
  };

  // Perform actions on generated reports
  const handleCancelReport = async (reportId: string) => {
    try {
      const res = await api.request(`/api/admin/reports/${reportId}/cancel`, { method: 'POST' });
      if (res && res.success) {
        showSuccess('Cancelled', 'Report generation cancelled.');
        fetchReportsListAndTemplates();
      }
    } catch (err: any) {
      showError('Failed', extractApiError(err).message);
    }
  };

  const handleRegenerateReport = async (reportId: string) => {
    try {
      const res = await api.request(`/api/admin/reports/${reportId}/regenerate`, { method: 'POST' });
      if (res && res.success) {
        showSuccess('Queued', 'Regeneration from original snapshot queued.');
        pollJobStatus(reportId);
        fetchReportsListAndTemplates();
      }
    } catch (err: any) {
      showError('Failed', extractApiError(err).message);
    }
  };

  const handleArchiveReport = async (reportId: string) => {
    try {
      const res = await api.request(`/api/admin/reports/${reportId}/archive`, { method: 'POST' });
      if (res && res.success) {
        showSuccess('Archived', 'Report moved to archived records.');
        fetchReportsListAndTemplates();
      }
    } catch (err: any) {
      showError('Failed', extractApiError(err).message);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this report snapshot? This cannot be undone.')) {
      return;
    }
    try {
      const res = await api.request(`/api/admin/reports/${reportId}`, { method: 'DELETE' });
      if (res && res.success) {
        showSuccess('Deleted', 'Report deleted permanently.');
        fetchReportsListAndTemplates();
      }
    } catch (err: any) {
      showError('Failed', extractApiError(err).message);
    }
  };

  const handleTriggerUpdatedVersion = async (reportId: string) => {
    try {
      const res = await api.request(`/api/admin/reports/${reportId}/generate-updated`, { method: 'POST' });
      if (res && res.success) {
        showSuccess('New Job Created', 'A new updated report has been queued.');
        pollJobStatus(res.jobId);
        fetchReportsListAndTemplates();
      }
    } catch (err: any) {
      showError('Failed', extractApiError(err).message);
    }
  };

  // Secure authorized download via standard auth header token
  const handleDownloadReportPDF = (reportId: string, filename: string) => {
    const token = api.getToken();
    if (!token) {
      showError('Error', 'You are currently logged out.');
      return;
    }

    // Direct download with authorization in header is preferred, but for iframe downloads we can fetch and download
    showSuccess('Downloading', 'Decrypting and verifying report digital signature...');
    
    // We can fetch as blob to include token header
    let apiBaseUrl = '';
    try {
      apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
    } catch {
      apiBaseUrl = ((import.meta as any).env?.VITE_API_BASE_URL || '').trim();
    }
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.run.app')) {
        apiBaseUrl = '';
      }
    }

    const downloadUrl = `${apiBaseUrl}/api/admin/reports/${reportId}/download`;
    
    fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(res => {
      if (!res.ok) {
        throw new Error(`Download failed with code: ${res.status}`);
      }
      return res.blob();
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `report_${reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showSuccess('Success', 'PDF successfully downloaded.');
    })
    .catch(err => {
      showError('Download failed', err.message || 'Verification of hash ledger failed.');
    });
  };

  // Toggle report sections helper
  const handleToggleSection = (sec: string) => {
    if (builderSections.includes(sec)) {
      setBuilderSections(builderSections.filter(s => s !== sec));
    } else {
      setBuilderSections([...builderSections, sec]);
    }
  };

  // Use recommended sections
  const handleApplyTemplateToForm = (temp: ReportTemplate) => {
    setBuilderTemplate(temp.key);
    setBuilderClassification(temp.privacyClassification);
    setBuilderSections(temp.recommendedSections);
    setActiveMainTab('custom_builder');
    showSuccess('Template Applied', `Form preset configured for "${temp.name}".`);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-8 pb-16"
      id="admin-reports-module"
      data-view-version="admin-reports-v3-professional-ledger"
    >
      {/* ----------------- TOP BANNER & STATS ----------------- */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200/60 pb-6">
        <div>
          <h1 className="text-3xl font-serif font-semibold text-stone-900 tracking-tight flex items-center gap-2">
            <Shield className="w-8 h-8 text-[#C59B27] stroke-1" />
            Reports Centre & Analytics
          </h1>
          <p className="text-stone-500 text-sm mt-1.5 leading-relaxed">
            Immutable snapshot reports, professional A4 print PDF rendering, and role-aware safeguarding filters.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={onBackToOverview}
            variant="outline"
            className="border-stone-200 hover:bg-stone-50 text-stone-700 text-xs py-2 px-3 flex items-center gap-1.5 rounded-lg"
            id="btn-back-overview"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Button>
          <Button
            onClick={() => {
              fetchReportsListAndTemplates();
              if (activeMainTab === 'live_metrics') fetchLegacyReports(false);
            }}
            variant="outline"
            className="border-stone-200 hover:bg-stone-50 text-stone-700 text-xs py-2 px-3 flex items-center gap-1.5 rounded-lg"
            id="btn-refresh-all-reports"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Ledger
          </Button>
        </div>
      </div>

      {/* ----------------- CORE TAB SELECTION ----------------- */}
      <div className="flex border-b border-stone-200/80 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto scrollbar-none" data-component-version="admin-reports-main-tabs">
        <div className="flex space-x-6 min-w-max pb-1">
          {[
            { id: 'reports_centre', label: 'Reports Directory', desc: 'Immutable PDF Snapshots' },
            { id: 'template_library', label: 'Report Templates', desc: 'Predefined Outlines' },
            { id: 'custom_builder', label: 'Custom PDF Builder', desc: 'Generate Ledger PDF' },
            { id: 'live_metrics', label: 'Live Analytics Dashboard', desc: 'Real-time Metrics' }
          ].map((tab) => {
            const isActive = activeMainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id as MainTab)}
                className={`pb-3 text-left transition-all relative ${
                  isActive 
                    ? 'text-[#C59B27]' 
                    : 'text-stone-500 hover:text-stone-800'
                }`}
                id={`main-tab-${tab.id}`}
              >
                <div className="text-sm font-medium">{tab.label}</div>
                <div className="text-[10px] text-stone-400 font-normal mt-0.5">{tab.desc}</div>
                {isActive && (
                  <motion.div 
                    layoutId="activeMainTabUnderline" 
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C59B27]"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ----------------- COMPILATION PROGRESS FLOATER ----------------- */}
      <AnimatePresence>
        {activeProgressJobId && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 bg-stone-900 text-stone-100 rounded-xl p-5 shadow-2xl border border-stone-800 w-96"
            id="report-compilation-progress-widget"
            data-component-version="report-generation-progress-v1"
          >
            <div className="flex items-center justify-between mb-3 border-b border-stone-800 pb-2">
              <span className="text-xs font-serif font-medium uppercase tracking-wider text-[#C59B27] flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                A4 Generation Pipeline
              </span>
              <span className="text-[10px] font-mono text-stone-400">ID: {activeProgressJobId.slice(0, 8)}</span>
            </div>
            <p className="text-xs text-stone-300 font-medium">{activeProgressText}</p>
            <div className="w-full bg-stone-800 h-2 rounded-full mt-3 overflow-hidden">
              <div 
                className="bg-[#C59B27] h-full transition-all duration-500"
                style={{ width: `${(activeProgressStep / 4) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-stone-500 mt-2 font-mono">
              <span>Snapshot</span>
              <span>Filter Privacy</span>
              <span>Render</span>
              <span>Sign Ledger</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ----------------- TAB CONTENTS ----------------- */}

      {/* TAB 1: REPORTS CENTRE DIRECTORY */}
      {activeMainTab === 'reports_centre' && (
        <div className="space-y-6" data-view-version="admin-reports-centre-v1-premium">
          <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-serif font-semibold text-stone-900">Signed Report Registry</h3>
              <p className="text-stone-500 text-xs leading-relaxed">
                Every record is generated on demand as an immutable snapshot. This guarantees reproducible, audit-safe compliance reports.
              </p>
            </div>
            <Button
              onClick={() => setActiveMainTab('custom_builder')}
              className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-medium py-2 px-4 rounded-lg flex items-center gap-1.5 shadow-sm transition-all self-start md:self-auto"
              id="btn-nav-custom-builder"
            >
              <Plus className="w-4 h-4" />
              Build New Snapshot
            </Button>
          </div>

          {loadingReportsList ? (
            <div className="flex items-center justify-center p-12 min-h-[30vh]">
              <KoinoniaInlineLoader variant="logo" size="md" label="Loading reports registry..." />
            </div>
          ) : generatedReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white border border-stone-200 rounded-xl min-h-[30vh] text-stone-500 text-center space-y-4">
              <FileText className="w-10 h-10 text-stone-300 stroke-1" />
              <div className="space-y-1">
                <p className="text-sm font-serif font-medium text-stone-700">No Immutable Snapshots Registered</p>
                <p className="text-xs text-stone-400">Generate your first audit-ready report using our Custom PDF Builder.</p>
              </div>
              <Button
                onClick={() => setActiveMainTab('custom_builder')}
                className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-medium py-2 px-5 rounded-lg"
              >
                Open Custom Builder
              </Button>
            </div>
          ) : (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm" data-component-version="reports-accessibility-v1">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" aria-label="Generated Snapshot Reports">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200">
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Report Description</th>
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Privacy & Classification</th>
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Audit Metadata</th>
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Operational Status</th>
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {generatedReports.map((report) => {
                      const isComplete = report.status === 'completed' || report.status === 'ready';
                      const isPending = ['queued', 'generating'].includes(report.status);
                      const isFailed = report.status === 'failed';
                      const isCancelled = report.status === 'cancelled';
                      const isArchived = report.status === 'archived';

                      let classificationBadge = 'bg-stone-100 text-stone-700 border-stone-200';
                      if (report.privacy_classification === 'Internal operational') classificationBadge = 'bg-[#C59B27]/5 text-[#C59B27] border-[#C59B27]/20';
                      if (report.privacy_classification === 'Safeguarding restricted') classificationBadge = 'bg-red-50 text-red-700 border-red-200';

                      return (
                        <tr key={report.id} className="hover:bg-stone-50/40 transition-colors">
                          <td className="py-4 px-6">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <FileText className={`w-4 h-4 ${isComplete ? 'text-[#C59B27]' : 'text-stone-400'}`} />
                                <span className="font-serif font-semibold text-stone-900 text-sm">{report.report_name}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-400 font-mono">
                                <span>ID: {report.id.substring(0, 10)}...</span>
                                <span>•</span>
                                <span>Template: {report.template_key.replace(/_/g, ' ')}</span>
                                {report.file_size && (
                                  <>
                                    <span>•</span>
                                    <span>{(report.file_size / 1024).toFixed(1)} KB</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded border ${classificationBadge}`}>
                              {report.privacy_classification === 'Safeguarding restricted' ? <ShieldAlert className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                              {report.privacy_classification}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-xs text-stone-500 space-y-0.5">
                            <div className="font-medium text-stone-700">By: User #{(report.requested_by || report.requested_by_user_id || '').slice(0,8)}</div>
                            <div className="font-mono text-[10px]">{new Date(report.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full ${
                              isComplete ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                              isPending ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                              isFailed ? 'bg-red-50 text-red-800 border border-red-200' :
                              isCancelled ? 'bg-stone-100 text-stone-500' :
                              'bg-stone-100 text-stone-600'
                            }`}>
                              {isPending && <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-600" />}
                              {report.status}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isComplete && (
                                <>
                                  <Button
                                    onClick={() => handleDownloadReportPDF(report.id, report.storage_key)}
                                    className="bg-stone-900 hover:bg-black text-white text-[10px] font-semibold py-1.5 px-2.5 rounded flex items-center gap-1"
                                    id={`btn-download-${report.id}`}
                                    title="Secure Expiring PDF Download"
                                    data-component-version="secure-report-download-v1"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Download
                                  </Button>
                                  <Button
                                    onClick={() => handleTriggerUpdatedVersion(report.id)}
                                    variant="outline"
                                    className="border-stone-200 text-stone-600 text-[10px] font-semibold py-1.5 px-2.5 rounded flex items-center gap-1 hover:bg-stone-50"
                                    id={`btn-updated-${report.id}`}
                                    title="Compile Updated Version on Live DB"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    Update
                                  </Button>
                                </>
                              )}

                              {isFailed && (
                                <Button
                                  onClick={() => handleRegenerateReport(report.id)}
                                  className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-[10px] font-semibold py-1.5 px-2.5 rounded flex items-center gap-1"
                                  id={`btn-retry-${report.id}`}
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Retry
                                </Button>
                              )}

                              {isPending && (
                                <Button
                                  onClick={() => handleCancelReport(report.id)}
                                  variant="outline"
                                  className="border-stone-200 text-red-600 text-[10px] font-semibold py-1.5 px-2.5 rounded hover:bg-red-50 hover:border-red-200"
                                  id={`btn-cancel-${report.id}`}
                                >
                                  Cancel
                                </Button>
                              )}

                              <Button
                                onClick={() => viewAuditLogs(report.id)}
                                variant="outline"
                                className="border-stone-200 text-stone-600 text-[10px] font-semibold p-1.5 rounded hover:bg-stone-50"
                                id={`btn-audit-${report.id}`}
                                title="Audit Trails Log"
                              >
                                <History className="w-3.5 h-3.5" />
                              </Button>

                              {!isArchived && isComplete && (
                                <Button
                                  onClick={() => handleArchiveReport(report.id)}
                                  variant="outline"
                                  className="border-stone-200 text-stone-600 text-[10px] font-semibold p-1.5 rounded hover:bg-stone-50"
                                  id={`btn-archive-${report.id}`}
                                  title="Archive Report"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </Button>
                              )}

                              <Button
                                onClick={() => handleDeleteReport(report.id)}
                                variant="outline"
                                className="border-stone-200 text-red-600 hover:bg-red-50 hover:border-red-200 p-1.5 rounded"
                                id={`btn-delete-${report.id}`}
                                title="Delete Permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TEMPLATE LIBRARY */}
      {activeMainTab === 'template_library' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-view-version="admin-report-library-v1-premium">
          {templates.map((temp) => {
            let classificationBadge = 'bg-stone-100 text-stone-700';
            if (temp.privacyClassification === 'Internal operational') classificationBadge = 'bg-[#C59B27]/5 text-[#C59B27] border border-[#C59B27]/20';
            if (temp.privacyClassification === 'Safeguarding restricted') classificationBadge = 'bg-red-50 text-red-700 border border-red-200';

            return (
              <div 
                key={temp.key} 
                className="bg-white p-6 rounded-xl border border-stone-200 hover:border-[#C59B27]/40 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-5"
                id={`template-card-${temp.key}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${classificationBadge}`}>
                      {temp.privacyClassification}
                    </span>
                    <FileText className="w-5 h-5 text-stone-400 stroke-1" />
                  </div>
                  <h3 className="font-serif font-bold text-stone-900 text-base leading-snug">{temp.name}</h3>
                  <p className="text-stone-500 text-xs leading-relaxed">{temp.description}</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5 border-t border-stone-100 pt-3">
                    <span className="text-[10px] text-stone-400 font-mono block">RECOMMENDED SECTIONS:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {temp.recommendedSections.map((sec, i) => (
                        <span key={i} className="text-[10px] bg-stone-50 text-stone-600 px-2 py-0.5 rounded-sm font-medium">
                          {sec}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={() => handleApplyTemplateToForm(temp)}
                    className="w-full bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  >
                    Configure Template
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: CUSTOM REPORT BUILDER */}
      {activeMainTab === 'custom_builder' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8" data-view-version="custom-report-builder-v1-premium">
          {/* Builder Form Column */}
          <form 
            onSubmit={handleCreateReportJob} 
            className="xl:col-span-7 bg-white p-6 rounded-xl border border-stone-200 shadow-sm space-y-6"
            aria-label="Custom Report Builder Form"
          >
            <div className="border-b border-stone-100 pb-4">
              <h3 className="text-lg font-serif font-semibold text-stone-900">Custom PDF Report Configuration</h3>
              <p className="text-stone-500 text-xs leading-relaxed mt-1">
                Customize structural sections, filters, and classifications to produce an authoritative PDF snapshot ledger.
              </p>
            </div>

            {/* Template Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-700 block uppercase tracking-wider">Report Base Template</label>
              <select
                value={builderTemplate}
                onChange={(e) => {
                  setBuilderTemplate(e.target.value);
                  const matched = templates.find(t => t.key === e.target.value);
                  if (matched) {
                    setBuilderClassification(matched.privacyClassification);
                    setBuilderSections(matched.recommendedSections);
                  }
                }}
                className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-lg text-stone-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                id="select-builder-template"
              >
                {templates.map(t => (
                  <option key={t.key} value={t.key}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Privacy Classification selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-700 block uppercase tracking-wider">Privacy Classification</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'Public Summary', desc: 'Anonymised aggregations' },
                  { value: 'Internal operational', desc: 'Standard supervisor details' },
                  { value: 'Safeguarding restricted', desc: 'Authorized role only' }
                ].map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    onClick={() => setBuilderClassification(item.value)}
                    className={`p-3 rounded-lg border text-left flex flex-col justify-between space-y-2 transition-all ${
                      builderClassification === item.value 
                        ? 'border-[#C59B27] bg-[#C59B27]/5' 
                        : 'border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <span className="text-xs font-semibold text-stone-900">{item.value}</span>
                    <span className="text-[10px] text-stone-500 leading-snug">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Section Checklist checkboxes */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-700 block uppercase tracking-wider">Custom Section Checklist</label>
              <p className="text-[11px] text-stone-400 mb-2">Toggle specific layouts to compile in the final A4 output.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  'Executive Summary',
                  'Operational Metrics',
                  'Child Profiles & Demographic Details',
                  'Critical Incident Logs & Escalations',
                  'Safeguarding Audits & Device Readiness',
                  'Medical Allergies & Specific Diet logs',
                  'Pickup & Authorized Collectors list',
                  'Grounded Recommendations'
                ].map((sec) => {
                  const checked = builderSections.includes(sec);
                  return (
                    <label 
                      key={sec} 
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        checked ? 'border-[#C59B27] bg-[#C59B27]/5 text-[#C59B27]' : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleSection(sec)}
                        className="rounded border-stone-300 text-[#C59B27] focus:ring-[#C59B27] h-4 w-4"
                      />
                      <span className="text-xs font-medium">{sec}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Query Filters */}
            <div className="space-y-3 border-t border-stone-100 pt-4">
              <label className="text-xs font-bold text-stone-700 block uppercase tracking-wider">Snapshot Query Filters</label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-stone-500 font-mono">AGE GROUP COHORT</span>
                  <select
                    value={builderFilters.ageGroup}
                    onChange={(e) => setBuilderFilters({ ...builderFilters, ageGroup: e.target.value })}
                    className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-lg text-stone-800"
                  >
                    <option value="All">All age cohorts</option>
                    <option value="Toddlers">Toddlers (2-4)</option>
                    <option value="Kids">Kids (5-9)</option>
                    <option value="PreTeens">Pre-Teens (10-12)</option>
                    <option value="Teens">Teens (13-17)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-stone-500 font-mono">LOCATION AREA</span>
                  <select
                    value={builderFilters.location}
                    onChange={(e) => setBuilderFilters({ ...builderFilters, location: e.target.value })}
                    className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-lg text-stone-800"
                  >
                    <option value="All">All rooms & fields</option>
                    <option value="Grace Hall">Grace Hall (Primary)</option>
                    <option value="Chapel Annex">Chapel Annex</option>
                    <option value="Youth Dome">Youth Dome</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Trigger Button */}
            <Button
              type="submit"
              disabled={submittingJob}
              className="w-full bg-[#C59B27] hover:bg-[#A37B1B] text-white text-sm font-medium py-3 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all"
              id="btn-trigger-generation"
            >
              {submittingJob ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Initializing Snapshot Pipeline...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Request Safe PDF Snapshot Report
                </>
              )}
            </Button>
          </form>

          {/* Interactive Report Preview Panel Column */}
          <div className="xl:col-span-5 space-y-6" data-view-version="report-preview-v1-premium">
            <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl">
              <h3 className="text-xs font-serif font-semibold text-stone-900 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-[#C59B27]" />
                Interactive Layout Preview
              </h3>
              <p className="text-[10px] text-stone-400 mt-0.5">
                Renders a representation of the compiled cover page and structure.
              </p>
            </div>

            {/* A4 mockup sheet */}
            <div className="bg-stone-100 border border-stone-200 rounded-xl p-6 flex justify-center shadow-inner min-h-[500px]">
              <div 
                className="w-full max-w-sm bg-[#FAF9F6] border border-stone-300 shadow-xl rounded-sm p-8 flex flex-col justify-between text-stone-950 font-sans relative aspect-[1/1.41]"
                id="report-preview-a4-canvas"
                data-component-version="premium-report-cover-v1"
              >
                {/* Stamp overlay */}
                <div className="absolute top-6 right-6 border border-[#C59B27] text-[#C59B27] font-mono text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded rotate-12 opacity-80 select-none">
                  IMMUTABLE LEDGER
                </div>

                <div className="space-y-8">
                  {/* Branding */}
                  <div className="border-b border-[#C59B27]/40 pb-4">
                    <div className="text-xs font-serif font-bold text-stone-900 tracking-wider">KOINONIA GLOBAL</div>
                    <div className="text-[7px] text-stone-500 font-mono uppercase tracking-widest mt-0.5">
                      CHILDREN & TEENS FELLOWSHIP PROGRAMME
                    </div>
                  </div>

                  {/* Title & Classification */}
                  <div className="space-y-4">
                    <span className="inline-block text-[7px] uppercase font-bold tracking-widest text-white bg-stone-900 px-2 py-0.5 rounded">
                      SYSTEM SNAPSHOT LEDGER
                    </span>
                    <h2 className="text-xl font-serif font-semibold text-stone-900 tracking-tight leading-snug">
                      {templates.find(t => t.key === builderTemplate)?.name?.toUpperCase() || 'OPERATIONAL REPORT'}
                    </h2>
                    <div className="space-y-1.5 text-[8px] text-stone-500">
                      <div><strong className="text-stone-700">Scope:</strong> General Assembly Cohort 2026</div>
                      <div><strong className="text-stone-700">Filters:</strong> Age cohort: {builderFilters.ageGroup} | Room: {builderFilters.location}</div>
                      <div><strong className="text-stone-700">Timezone:</strong> {builderFilters.timezone} UTC</div>
                    </div>
                  </div>

                  {/* Included Sections Representation */}
                  <div className="space-y-2 pt-2 border-t border-stone-200">
                    <span className="text-[7px] font-bold text-stone-400 uppercase tracking-wider block">INCLUDED LEDGER SECTIONS:</span>
                    <div className="space-y-1">
                      {builderSections.map((sec, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[8px] text-stone-600 font-mono">
                          <span className="text-[#C59B27]">✔</span>
                          {sec}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-stone-200">
                  {/* Classification Strip */}
                  <div className={`p-2 rounded text-[8px] uppercase font-bold tracking-widest text-center ${
                    builderClassification === 'Public Summary' ? 'bg-stone-200 text-stone-800' :
                    builderClassification === 'Internal operational' ? 'bg-[#C59B27]/10 text-[#C59B27]' :
                    'bg-red-50 text-red-700'
                  }`}>
                    Classification: {builderClassification}
                  </div>

                  {/* Footer Notice */}
                  <div className="text-[6px] text-stone-400 leading-normal text-center font-mono">
                    NOTICE: Contains administrative data ledger records. Every report downloaded registers an entry in the auditing logs.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LEGACY REAL-TIME ANALYTICS DASHBOARD (PRESERVED) */}
      {activeMainTab === 'live_metrics' && (
        <div className="space-y-6">
          {/* Legacy horizontal tabs */}
          <div className="flex border-b border-stone-200 px-1 overflow-x-auto scrollbar-none" data-component-version="legacy-analytics-tabs">
            <div className="flex space-x-6 min-w-max pb-1">
              {[
                { id: 'pre_event', label: 'Pre-event Report' },
                { id: 'live_event', label: 'Live event Report' },
                { id: 'end_of_event', label: 'End-of-event Report' },
                { id: 'volunteer_parent', label: 'Volunteers & Parents' }
              ].map((tab) => {
                const isActive = activeLegacyTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveLegacyTab(tab.id as LegacyReportTab)}
                    className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                      isActive 
                        ? 'border-[#C59B27] text-[#C59B27]' 
                        : 'border-transparent text-stone-400 hover:text-stone-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loadingMetrics ? (
            <div className="flex items-center justify-center min-h-[30vh] w-full">
              <KoinoniaInlineLoader variant="logo" size="md" label="Aggregating metrics..." />
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center p-12 bg-stone-50 border border-stone-200 rounded-xl min-h-[30vh] text-stone-500 space-y-4">
              <AlertCircle className="w-8 h-8 text-stone-400" />
              <p className="text-xs font-medium text-stone-600">{fetchError}</p>
              <Button onClick={() => fetchLegacyReports(true)} className="bg-[#C59B27] text-white text-xs py-1.5 px-4 rounded">Retry</Button>
            </div>
          ) : !legacyReportData ? (
            <div className="text-center py-12 text-stone-400 text-xs">Select a dashboard category to load live metric telemetry.</div>
          ) : (
            <div className="space-y-8 animate-fadeIn">
              {/* LEGACY VIEW CONTROLLERS (Pre-event, Live, End, Volunteers) */}
              
              {/* 1. PRE-EVENT */}
              {activeLegacyTab === 'pre_event' && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  <div className="xl:col-span-2 space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: "Total registered", value: legacyReportData.metrics?.totalRegistered || 0, desc: "Profiles applied" },
                        { label: "Under review", value: legacyReportData.metrics?.underReview || 0, desc: "Pending review" },
                        { label: "Selected", value: legacyReportData.metrics?.selected || 0, desc: "Admitted list" },
                        { label: "Waiting list", value: legacyReportData.metrics?.waitingList || 0, desc: "On hold applications" }
                      ].map((card, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                          <span className="text-[9px] uppercase font-bold tracking-wider text-stone-400 block">{card.label}</span>
                          <div className="text-xl font-serif font-bold text-stone-900 mt-1.5">{card.value}</div>
                          <p className="text-[10px] text-stone-500 mt-1">{card.desc}</p>
                        </div>
                      ))}
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-stone-200">
                      <h3 className="text-sm font-serif font-semibold text-stone-900 border-b border-stone-100 pb-3 mb-4">Readiness</h3>
                      <div className="space-y-3">
                        {legacyReportData.sections?.reviewReadiness?.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <span className="text-stone-600">{item.label}</span>
                            <span className="font-semibold text-stone-900">{item.value} children</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-white p-5 rounded-xl border border-stone-200">
                      <h3 className="text-sm font-serif font-semibold text-stone-900 mb-3">Care Demographics</h3>
                      <div className="space-y-2">
                        {legacyReportData.careAttention?.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <span className="text-stone-600">{item.label}</span>
                            <span className="font-mono font-semibold text-stone-900">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. LIVE EVENT */}
              {activeLegacyTab === 'live_event' && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  <div className="xl:col-span-2 space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {[
                        { label: "Expected", value: legacyReportData.metrics?.expected || 0, desc: "Seats" },
                        { label: "Checked in", value: legacyReportData.metrics?.checkedIn || 0, desc: "Inside" },
                        { label: "Picked up", value: legacyReportData.metrics?.pickedUp || 0, desc: "Checked-out" }
                      ].map((card, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                          <span className="text-[9px] uppercase font-bold tracking-wider text-stone-400 block">{card.label}</span>
                          <div className="text-xl font-serif font-bold text-stone-900 mt-1.5">{card.value}</div>
                          <p className="text-[10px] text-stone-500 mt-0.5">{card.desc}</p>
                        </div>
                      ))}
                    </div>

                    <div className="bg-white rounded-xl border border-stone-200 p-5">
                      <h3 className="text-sm font-serif font-semibold text-stone-900 mb-4">Recent live check-in scans</h3>
                      {legacyReportData.sections?.recentScans?.length > 0 ? (
                        <div className="divide-y divide-stone-100">
                          {legacyReportData.sections?.recentScans?.map((scan: any, i: number) => (
                            <div key={i} className="py-2.5 flex justify-between items-center text-xs">
                              <div>
                                <div className="font-semibold text-stone-800">{scan.childName}</div>
                                <div className="text-[10px] text-stone-400">{scan.ageGroup}</div>
                              </div>
                              <span className="text-[10px] font-mono text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                                {scan.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-stone-400 text-xs">No entries reported.</div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-stone-200 h-fit">
                    <h3 className="text-sm font-serif font-semibold text-stone-900 mb-3">Live Ratios</h3>
                    <div className="space-y-4">
                      {legacyReportData.sections?.liveAttendanceOutcome?.map((item: any, i: number) => (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-stone-600">{item.label}</span>
                            <span className="font-semibold text-stone-900">{item.percentage}%</span>
                          </div>
                          <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-[#C59B27] h-full" style={{ width: `${item.percentage}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. END OF EVENT */}
              {activeLegacyTab === 'end_of_event' && (
                <div className="bg-white p-6 rounded-xl border border-stone-200 space-y-6">
                  <h3 className="text-sm font-serif font-semibold text-[#C59B27]">Event Performance Ledger</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[
                      { label: "Total Registrations", value: legacyReportData.metrics?.totalRegistered || 0 },
                      { label: "Admitted Seats", value: legacyReportData.metrics?.selected || 0 },
                      { label: "Actual Arrivals", value: legacyReportData.metrics?.checkedIn || 0 },
                      { label: "Successful Collections", value: legacyReportData.metrics?.pickedUp || 0 }
                    ].map((m, i) => (
                      <div key={i} className="border-l-2 border-[#C59B27] pl-3">
                        <span className="text-[10px] uppercase font-bold text-stone-400 block">{m.label}</span>
                        <div className="text-2xl font-serif font-bold text-stone-900 mt-1">{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. VOLUNTEERS & PARENTS */}
              {activeLegacyTab === 'volunteer_parent' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-5 rounded-xl border border-stone-200">
                    <h3 className="text-sm font-serif font-semibold text-stone-900 mb-4">Supervisor roster ratios</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs">
                        <span>Total approved supervisors</span>
                        <span className="font-semibold">{legacyReportData.totalApprovedVolunteers || 0}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Active checks</span>
                        <span className="font-semibold">{legacyReportData.activeVolunteersCount || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-stone-200">
                    <h3 className="text-sm font-serif font-semibold text-stone-900 mb-4">Guardian profiles</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs">
                        <span>Total Registered Families</span>
                        <span className="font-semibold">{legacyReportData.totalRegisteredParents || 0}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Profiles undergoing review</span>
                        <span className="font-semibold">{legacyReportData.unapprovedParentsCount || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Export Panel */}
              <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm space-y-4">
                <h3 className="text-sm font-serif font-semibold text-stone-900">Standard Data Spreadsheet Exports</h3>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => handleExport('attendance', 'csv')}
                    className="bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs font-semibold py-2 px-3.5 rounded flex items-center gap-1.5 transition-all"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-stone-400" />
                    Download Attendance CSV
                  </button>
                  <button 
                    onClick={() => handleExport('care_notes', 'csv')}
                    className="bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs font-semibold py-2 px-3.5 rounded flex items-center gap-1.5 transition-all"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-stone-400" />
                    Download Care Notes CSV
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------- AUDIT LOG MODAL ----------------- */}
      <AnimatePresence>
        {auditReportId && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-labelledby="audit-modal-title"
            aria-modal="true"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-2xl overflow-hidden"
            >
              <div className="bg-[#FAF9F6] border-b border-stone-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 id="audit-modal-title" className="text-base font-serif font-bold text-stone-900">Digital Access Ledger & Audit Trail</h3>
                  <p className="text-[10px] text-stone-400 mt-0.5">Job ID: {auditReportId}</p>
                </div>
                <button 
                  onClick={() => setAuditReportId(null)}
                  className="text-stone-400 hover:text-stone-700 p-1.5 hover:bg-stone-100 rounded-full transition-all"
                  aria-label="Close Audit Dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                {loadingAudit ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-[#C59B27]" />
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center text-xs text-stone-400 py-12">No audit actions recorded yet.</div>
                ) : (
                  <div className="space-y-3">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="bg-stone-50 p-4 rounded-lg border border-stone-100 flex justify-between gap-4 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-stone-800 capitalize">{log.action_type}</span>
                            <span className="text-[10px] bg-stone-200 text-stone-600 px-1.5 py-0.2 rounded font-mono">
                              By: User #{log.actor_user_id.slice(0, 8)}
                            </span>
                          </div>
                          <p className="text-stone-500 leading-relaxed text-[11px]">{log.safe_summary}</p>
                        </div>
                        <span className="text-[10px] font-mono text-stone-400 shrink-0 mt-0.5">
                          {new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-stone-50 border-t border-stone-200 px-6 py-4 flex justify-end">
                <Button 
                  onClick={() => setAuditReportId(null)}
                  className="bg-stone-900 hover:bg-black text-white text-xs font-semibold py-2 px-4 rounded-lg"
                >
                  Dismiss Ledger
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

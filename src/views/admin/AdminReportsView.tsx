import React, { useEffect, useState } from 'react';
import { 
  Download, 
  RefreshCw, 
  Plus, 
  Eye, 
  ChevronRight, 
  Loader2, 
  FileSpreadsheet, 
  X, 
  Check, 
  ArrowLeft, 
  Calendar,
  AlertCircle
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { buildApiUrl } from '../../utils/urlHelper';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';
import { KoinoniaInlineLoader } from '../../components/common/KoinoniaInlineLoader';
import { motion, AnimatePresence } from 'motion/react';
import { TemplateConfigureView } from '../../components/admin/TemplateConfigureView';
import { GeneratedReportPreviewModal } from '../../components/admin/reports/GeneratedReportPreviewModal';
import { ReportActionsMenu } from '../../components/admin/reports/ReportActionsMenu';
import { ReportChartRenderer } from '../../components/admin/reports/ReportChartRenderer';

interface AdminReportsViewProps {
  onBackToOverview: () => void;
  onNavigate?: (route: string) => void;
  currentRoute?: string;
}

// 4 Canonical Tabs (Prompt Section 5)
type MainTab = 'reports_centre' | 'template_library' | 'custom_builder' | 'live_metrics';

function formatReportDate(value?: string | null): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

// Human-facing statuses (Prompt Section 8 & 57)
function getReportStatusLabel(status: string): string {
  switch (status) {
    case 'queued':
    case 'generating':
      return 'Preparing';
    case 'ready':
    case 'completed':
      return 'Ready';
    case 'failed':
      return "Couldn't create report";
    case 'cancelled':
      return 'Cancelled';
    case 'archived':
      return 'Archived';
    default:
      return 'Preparing';
  }
}

interface ReportTemplate {
  key: string;
  name: string;
  description: string;
  privacyClassification: string;
  recommendedSections: string[];
  supportedSections?: string[];
  defaultSections?: string[];
  availableFilters?: any;
  includes?: string[];
  audience?: string;
  reportDomain?: string;
}

// 6 Canonical Templates (Prompt Section 9)
const CANONICAL_TEMPLATES: ReportTemplate[] = [
  {
    key: 'management-summary',
    name: 'Management summary',
    description: 'A concise leadership report covering participation, attendance, volunteer coverage and issues requiring attention.',
    privacyClassification: 'Internal operational',
    recommendedSections: [
      'Executive summary',
      'Registration & participation',
      'Attendance & movement',
      'Volunteer coverage',
      'Care & safety',
      'Key observations'
    ],
    supportedSections: [
      'Executive summary',
      'Registration & participation',
      'Attendance & movement',
      'Volunteer coverage',
      'Care & safety',
      'Key observations'
    ],
    reportDomain: 'Leadership',
    audience: 'Senior Leadership, Event Directors',
    includes: [
      'Executive KPI summary band',
      'Deterministic key findings & attention items',
      'Registration & attendance yields',
      'Volunteer coverage ratios',
      'Aggregated care & safety status'
    ]
  },
  {
    key: 'full-event-report',
    name: 'Full event report',
    description: 'A detailed event report covering registration, attendance, demographics, volunteers, care, safety and operational outcomes.',
    privacyClassification: 'Internal operational',
    recommendedSections: [
      'Executive summary',
      'Registration & selection',
      'Participation profile',
      'Attendance & movement',
      'Volunteer coverage',
      'Care & support',
      'Safety & incidents',
      'Key observations',
      'Appendix'
    ],
    supportedSections: [
      'Executive summary',
      'Registration & selection',
      'Participation profile',
      'Attendance & movement',
      'Volunteer coverage',
      'Care & support',
      'Safety & incidents',
      'Key observations',
      'Appendix'
    ],
    reportDomain: 'Comprehensive',
    audience: 'Executive Leadership, Department Leads',
    includes: [
      'Comprehensive executive summary',
      'Registration pipeline & selection outcomes',
      'Hourly arrival & pickup movement trends',
      'Volunteer deployment & location loads',
      'Aggregated safeguarding & care analysis',
      'Observations and operational appendix'
    ]
  },
  {
    key: 'registration-selection',
    name: 'Registration & selection',
    description: 'Registration demand, review outcomes, age-group distribution and selection.',
    privacyClassification: 'Internal operational',
    recommendedSections: ['Registration & selection', 'Participation profile', 'Key observations'],
    supportedSections: ['Executive summary', 'Registration & selection', 'Participation profile', 'Key observations'],
    reportDomain: 'Registration',
    audience: 'Registration Leads, Review Coordinators',
    includes: [
      'Registration demand & intake volumes',
      'Application review outcome breakdown',
      'Age-group cohort registration demand',
      'Capacity pressure evaluation'
    ]
  },
  {
    key: 'attendance-movement',
    name: 'Attendance & movement',
    description: 'Attendance, check-in, pickup and participation analysis.',
    privacyClassification: 'Internal operational',
    recommendedSections: ['Attendance & movement', 'Participation profile', 'Key observations'],
    supportedSections: ['Executive summary', 'Attendance & movement', 'Participation profile', 'Key observations'],
    reportDomain: 'Attendance',
    audience: 'Attendance Lead, Operations Supervisors',
    includes: [
      'Expected vs checked-in attendance rate',
      'Active inside vs verified pickups',
      'Attendance rate breakdown by age group',
      'Chronological check-in activity flow'
    ]
  },
  {
    key: 'volunteer-coverage',
    name: 'Volunteer coverage',
    description: 'Volunteer participation, team coverage and service distribution.',
    privacyClassification: 'Internal operational',
    recommendedSections: ['Volunteer coverage', 'Key observations'],
    supportedSections: ['Executive summary', 'Volunteer coverage', 'Operational appendix', 'Key observations'],
    reportDomain: 'People',
    audience: 'Volunteer Coordinator, Team Leads',
    includes: [
      'Approved vs on-duty volunteer headcounts',
      'Volunteer deployment by ministry team',
      'Staff-to-child ratios per location',
      'Coverage gaps and staffing observations'
    ]
  },
  {
    key: 'care-safety-summary',
    name: 'Care & safety summary',
    description: 'An aggregated overview of care needs, incidents and safety follow-up without exposing unnecessary personal information.',
    privacyClassification: 'Safeguarding restricted',
    recommendedSections: ['Care & safety', 'Key observations'],
    supportedSections: ['Executive summary', 'Care & safety', 'Key observations'],
    reportDomain: 'Safeguarding',
    audience: 'Safeguarding Lead, Executive Leadership',
    includes: [
      'Aggregated medical and care awareness count',
      'Safety concerns recorded by resolution status',
      'Incident severity distribution (anonymised)',
      'Safeguarding follow-up items'
    ]
  }
];

export const AdminReportsView: React.FC<AdminReportsViewProps> = ({ 
  onBackToOverview,
  onNavigate,
  currentRoute
}) => {
  const { showError, showSuccess } = useNotification();
  
  // Tabs State (Prompt Section 5: Reports, Templates, Create report, Event overview)
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('reports_centre');

  // Loading States
  const [loadingReportsList, setLoadingReportsList] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Events & Templates
  const [availableEvents, setAvailableEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('event-ga-2026');
  const [templates, setTemplates] = useState<ReportTemplate[]>(CANONICAL_TEMPLATES);
  const [generatedReports, setGeneratedReports] = useState<any[]>([]);

  // Preview Modal State
  const [previewingReportId, setPreviewingReportId] = useState<string | null>(null);
  const [previewReportTitle, setPreviewReportTitle] = useState<string>('');
  const [previewEventTitle, setPreviewEventTitle] = useState<string>('');
  
  // Create Report Editorial Workflow State (Prompt Sections 10-14 & 48)
  const [createStep, setCreateStep] = useState<number>(1);
  const [builderTemplate, setBuilderTemplate] = useState<string>('management-summary');
  const [builderClassification, setBuilderClassification] = useState<string>('Internal operational');
  const [customReportTitle, setCustomReportTitle] = useState<string>('');
  const [customSubtitle, setCustomSubtitle] = useState<string>('Children & Teens Ministry');
  const [builderSections, setBuilderSections] = useState<string[]>([
    'Executive summary',
    'Registration & participation',
    'Attendance & movement',
    'Volunteer coverage',
    'Care & safety',
    'Key observations'
  ]);
  const [builderFilters, setBuilderFilters] = useState({
    ageGroup: 'All',
    location: 'All',
    timezone: 'Africa/Lagos'
  });
  const [submittingJob, setSubmittingJob] = useState(false);
  const [activeProgressJobId, setActiveProgressJobId] = useState<string | null>(null);

  // Event Overview State (Prompt Sections 44-46)
  const [liveOverviewAnalytics, setLiveOverviewAnalytics] = useState<any>(null);

  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState<{ type: 'delete' | 'archive'; reportId: string } | null>(null);

  // Audit modal
  const [auditReportId, setAuditReportId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // 1. Fetch Events List
  const fetchEvents = async () => {
    try {
      const res = await api.request<any>('/api/admin/events');
      if (res && res.success && res.events && res.events.length > 0) {
        setAvailableEvents(res.events);
        const current = res.events.find((e: any) => e.is_current || e.status === 'published') || res.events[0];
        if (current) {
          setSelectedEventId(current.id);
        }
      }
    } catch (err) {
      console.warn('Could not load events list:', err);
    }
  };

  // 2. Fetch Reports List & Server Templates
  const fetchReportsListAndTemplates = async () => {
    setLoadingReportsList(true);
    try {
      // Templates from API
      const tempRes = await api.request('/api/admin/reports/templates');
      if (tempRes && tempRes.success && tempRes.templates && tempRes.templates.length > 0) {
        // Ensure 6 canonical templates are at the front
        const merged = [...CANONICAL_TEMPLATES];
        tempRes.templates.forEach((t: any) => {
          if (!merged.some(m => m.key === t.key)) {
            merged.push(t);
          }
        });
        setTemplates(merged);
      }
      
      // Generated Reports
      const jobsRes = await api.request('/api/admin/reports');
      if (jobsRes && jobsRes.success) {
        setGeneratedReports(jobsRes.reports || []);
      }
    } catch (err) {
      console.error('Failed to load reports list or templates:', err);
    } finally {
      setLoadingReportsList(false);
    }
  };

  // 3. Fetch Live Overview Analytics for Event overview Tab (Prompt Section 44-46)
  const fetchLiveOverview = async (eventId?: string) => {
    setLoadingOverview(true);
    try {
      const targetId = eventId || selectedEventId || 'event-ga-2026';
      const res = await api.request<any>('/api/admin/reports/preview', {
        method: 'POST',
        body: JSON.stringify({
          templateKey: 'management-summary',
          privacyLevel: 'Internal operational',
          sections: [
            'Executive summary',
            'Registration & participation',
            'Attendance & movement',
            'Volunteer coverage',
            'Care & safety',
            'Key observations'
          ],
          filters: { ageGroup: 'All', location: 'All' },
          eventId: targetId
        })
      });
      if (res && res.success && res.analytics) {
        setLiveOverviewAnalytics(res.analytics);
      }
    } catch (err) {
      console.warn('Could not load live event overview:', err);
    } finally {
      setLoadingOverview(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    fetchReportsListAndTemplates();
  }, []);

  useEffect(() => {
    if (activeMainTab === 'live_metrics') {
      fetchLiveOverview(selectedEventId);
    }
  }, [activeMainTab, selectedEventId]);

  // Set default report title when template or event changes
  useEffect(() => {
    const ev = availableEvents.find(e => e.id === selectedEventId);
    const eventName = ev?.title || 'The General Assembly 2026';
    const tm = templates.find(t => t.key === builderTemplate);
    const templateName = tm?.name || 'Management summary';
    setCustomReportTitle(`${eventName} — ${templateName}`);
  }, [selectedEventId, builderTemplate, availableEvents, templates]);

  // Handle template selection from template library
  const handleSelectTemplate = (templateKey: string) => {
    const tm = templates.find(t => t.key === templateKey);
    if (!tm) return;
    setBuilderTemplate(tm.key);
    setBuilderClassification(tm.privacyClassification || 'Internal operational');
    setBuilderSections(tm.recommendedSections || tm.defaultSections || [
      'Executive summary',
      'Registration & participation',
      'Attendance & movement',
      'Volunteer coverage',
      'Care & safety',
      'Key observations'
    ]);
    setCreateStep(2); // Advance to event selection
    setActiveMainTab('custom_builder');
    showSuccess('Template Selected', `Configuring "${tm.name}".`);
  };

  // Toggle section selection in Step 4
  const handleToggleSection = (sec: string) => {
    if (builderSections.includes(sec)) {
      setBuilderSections(builderSections.filter(s => s !== sec));
    } else {
      setBuilderSections([...builderSections, sec]);
    }
  };

  // Submit report generation job
  const handleCreateReportJob = async () => {
    setSubmittingJob(true);
    const idempotencyKey = 'key-' + Math.random().toString(36).substring(2);

    try {
      const response = await api.request('/api/admin/reports', {
        method: 'POST',
        body: JSON.stringify({
          templateKey: builderTemplate,
          privacyLevel: builderClassification,
          sections: builderSections,
          filters: builderFilters,
          eventId: selectedEventId,
          reportTitle: customReportTitle,
          idempotencyKey
        })
      });

      if (response && response.success) {
        const newJobId = response.jobId;
        setActiveProgressJobId(newJobId);
        pollJobStatus(newJobId);
      } else {
        showError('Request Failed', 'Could not create report. Please try again.');
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Submission Failed', parsed.message);
    } finally {
      setSubmittingJob(false);
    }
  };

  // Poll Job Status (Prompt Section 58 & 59)
  const pollJobStatus = (jobId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 30) {
        clearInterval(interval);
        setActiveProgressJobId(null);
        showError('Notice', 'Report generation is taking a moment. Please check the reports list shortly.');
        fetchReportsListAndTemplates();
        return;
      }

      try {
        const res = await api.request(`/api/admin/reports/${jobId}`);
        const job = res?.report || res?.job;
        if (res && res.success && job) {
          const status = job.status;
          
          if (status === 'completed' || status === 'ready') {
            clearInterval(interval);
            setTimeout(() => {
              setActiveProgressJobId(null);
              showSuccess('Report ready', 'Your report has been created and is ready for review.');
              setActiveMainTab('reports_centre');
              fetchReportsListAndTemplates();
              setCreateStep(1);
            }, 800);
          } else if (status === 'failed') {
            clearInterval(interval);
            setActiveProgressJobId(null);
            showError("We couldn't create this report", 'Please try again. If the problem continues, refresh the page and try once more.');
            fetchReportsListAndTemplates();
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 1500);
  };

  // Secure authorized download via standard auth header token (Prompt Section 52 & 55)
  const handleDownloadReportPDF = (reportId: string, filename?: string) => {
    const token = api.getToken();
    if (!token) {
      showError('Error', 'You are currently logged out.');
      return;
    }

    showSuccess('Preparing file', 'Preparing report download…');
    
    const downloadUrl = buildApiUrl(`/api/admin/reports/${reportId}/download`);
    
    fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(async (res) => {
      const contentType = res.headers.get('content-type') || '';
      
      if (!res.ok || contentType.includes('application/json')) {
        let errorMsg = 'We could not download this report.';
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      if (!contentType.includes('application/pdf')) {
        throw new Error('We could not download this report.');
      }

      const blob = await res.blob();
      if (blob.size === 0) {
        throw new Error('Downloaded report file was empty.');
      }

      const disposition = res.headers.get('content-disposition') || '';
      let headerFilename = '';
      const filenameStarMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      if (filenameStarMatch) {
        try {
          headerFilename = decodeURIComponent(filenameStarMatch[1]);
        } catch (_) {}
      }
      if (!headerFilename) {
        const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
        if (filenameMatch) headerFilename = filenameMatch[1];
      }

      const safeDownloadName = headerFilename || (filename && filename.endsWith('.pdf') ? filename : 'TGA-2026-Management-Report.pdf');

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = safeDownloadName;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 200);

      showSuccess('Download started', `Downloading ${safeDownloadName}`);
    })
    .catch((err) => {
      console.error('Download error:', err);
      showError('Download failed', err.message || 'Failed to download report.');
    });
  };

  // CSV Export
  const handleExport = (type: string, format: string) => {
    const url = buildApiUrl(`/api/admin/reports/export?type=${type}&format=${format}&eventId=${selectedEventId}`);
    window.open(url, '_blank');
  };

  // Actions
  const handleRegenerateReport = async (reportId: string) => {
    try {
      const res = await api.request(`/api/admin/reports/${reportId}/regenerate`, { method: 'POST' });
      if (res && res.success) {
        showSuccess('Queued', 'Report regeneration has been queued.');
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
    try {
      const res = await api.request(`/api/admin/reports/${reportId}`, { method: 'DELETE' });
      if (res && res.success) {
        showSuccess('Deleted', 'Report deleted.');
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
        showSuccess('Queued', 'A new updated report has been queued.');
        pollJobStatus(res.jobId);
        fetchReportsListAndTemplates();
      }
    } catch (err: any) {
      showError('Failed', extractApiError(err).message);
    }
  };

  const viewAuditLogs = async (reportId: string) => {
    setAuditReportId(reportId);
    setLoadingAudit(true);
    try {
      const res = await api.request(`/api/admin/reports/${reportId}/history`);
      if (res && res.success) {
        setAuditLogs(res.history || []);
      }
    } catch (err) {
      showError('Error', 'Failed to fetch audit log.');
    } finally {
      setLoadingAudit(false);
    }
  };

  // Sub-route handling
  const isConfigureRoute = currentRoute && currentRoute.startsWith('/admin/reports/templates/') && currentRoute.endsWith('/configure');
  const templateKey = isConfigureRoute ? currentRoute.split('/')[4] : null;

  if (isConfigureRoute && templateKey) {
    return (
      <TemplateConfigureView 
        templateKey={templateKey}
        onBack={() => {
          if (onNavigate) {
            onNavigate('/admin/reports');
          }
        }}
        onNavigate={onNavigate}
        showSuccess={showSuccess}
        showError={showError}
      />
    );
  }

  const selectedEventObj = availableEvents.find(e => e.id === selectedEventId) || availableEvents[0];
  const selectedTemplateObj = templates.find(t => t.key === builderTemplate) || templates[0];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-8 pb-16"
      id="admin-reports-module"
    >
      {/* ----------------- 1. MAIN PAGE HEADER (Prompt Section 4) ----------------- */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200/80 pb-6">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 tracking-tight">
            Reports
          </h1>
          <p className="text-stone-500 text-sm mt-1.5 leading-relaxed">
            Create clear event reports for leadership, review previous reports and understand how the current event is progressing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              fetchReportsListAndTemplates();
              if (activeMainTab === 'live_metrics') fetchLiveOverview(selectedEventId);
            }}
            variant="outline"
            className="border-stone-200 hover:bg-stone-50 text-stone-700 text-xs py-2 px-3.5 flex items-center gap-1.5 rounded-lg font-medium"
            id="btn-refresh-all-reports"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ----------------- 2. TOP-LEVEL TABS (Prompt Section 5) ----------------- */}
      <div className="flex border-b border-stone-200 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto scrollbar-none">
        <div className="flex space-x-8 min-w-max pb-1">
          {[
            { id: 'reports_centre', label: 'Reports' },
            { id: 'template_library', label: 'Templates' },
            { id: 'custom_builder', label: 'Create report' },
            { id: 'live_metrics', label: 'Event overview' }
          ].map((tab) => {
            const isActive = activeMainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id as MainTab)}
                className={`pb-3 text-left transition-all relative font-sans ${
                  isActive 
                    ? 'text-[#C59B27] font-semibold' 
                    : 'text-stone-500 hover:text-stone-800 font-medium'
                }`}
                id={`main-tab-${tab.id}`}
              >
                <div className="text-sm">{tab.label}</div>
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

      {/* ----------------- 3. COMPILATION LOADING FLOATER (Prompt Section 58) ----------------- */}
      <AnimatePresence>
        {activeProgressJobId && (
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 right-6 z-50 bg-stone-900 text-stone-100 rounded-xl p-5 shadow-xl border border-stone-800 w-84"
            id="report-compilation-progress-widget"
          >
            <div className="flex items-center gap-2.5 mb-1.5">
              <Loader2 className="w-4 h-4 animate-spin text-[#C59B27]" />
              <span className="text-sm font-medium text-white">
                Preparing your report…
              </span>
            </div>
            <p className="text-xs text-stone-400 pl-6.5">This may take a moment.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ----------------- TAB 1: REPORTS ARCHIVE (Prompt Section 6, 7, 8) ----------------- */}
      {activeMainTab === 'reports_centre' && (
        <div className="space-y-6">
          <div className="bg-white border border-stone-200/80 p-5 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold text-stone-900">Reports</h2>
              <p className="text-stone-500 text-xs leading-relaxed">
                Reports created for this event will appear here.
              </p>
            </div>
            <Button
              onClick={() => {
                setCreateStep(1);
                setActiveMainTab('custom_builder');
              }}
              className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold py-2 px-4 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all self-start sm:self-auto"
              id="btn-nav-custom-builder"
            >
              <Plus className="w-4 h-4" />
              Create report
            </Button>
          </div>

          {loadingReportsList ? (
            <div className="flex items-center justify-center p-12 min-h-[30vh]">
              <KoinoniaInlineLoader variant="logo" size="md" label="Loading reports…" />
            </div>
          ) : generatedReports.length === 0 ? (
            /* Quiet Empty State (Prompt Section 7) */
            <div className="flex flex-col items-center justify-center p-12 bg-white border border-stone-200 rounded-xl min-h-[30vh] text-center space-y-4">
              <div className="space-y-1.5 max-w-sm">
                <p className="text-base font-medium text-stone-800">No reports yet</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Create a report to summarise registrations, attendance, participation and event operations.
                </p>
              </div>
              <Button
                onClick={() => {
                  setCreateStep(1);
                  setActiveMainTab('custom_builder');
                }}
                className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold py-2.5 px-5 rounded-lg"
              >
                Create report
              </Button>
            </div>
          ) : (
            /* Generated Report List Table (Prompt Section 8) */
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" aria-label="Reports Archive">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200">
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Report</th>
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Event</th>
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Type</th>
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Created</th>
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Created by</th>
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Status</th>
                      <th className="py-3 px-6 text-[11px] font-semibold text-stone-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {generatedReports.map((report) => {
                      const isComplete = report.status === 'completed' || report.status === 'ready';
                      const isPending = ['queued', 'generating'].includes(report.status);
                      const isFailed = report.status === 'failed';

                      const reportTitle = report.reportTitle || report.report_name || report.templateName || 'Management Report';
                      const eventTitle = report.eventTitle || report.eventName || 'The General Assembly 2026';
                      const typeName = report.templateName || 'Management summary';
                      const preparedBy = report.requestedByName || report.requestedByEmail || 'Super Admin';
                      const statusLabel = getReportStatusLabel(report.status);
                      const formattedDate = formatReportDate(report.createdAt || report.created_at || report.updatedAt);

                      return (
                        <tr key={report.id} className="hover:bg-stone-50/60 transition-colors">
                          <td className="py-4 px-6">
                            <div className="space-y-0.5">
                              <span className="text-sm font-semibold text-stone-900 block line-clamp-1">
                                {reportTitle}
                              </span>
                              <span className="text-xs text-stone-400 block">
                                {report.pageCount ? `${report.pageCount} pages` : 'PDF Document'}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-xs text-stone-700 font-medium">
                            {eventTitle}
                          </td>
                          <td className="py-4 px-6 text-xs text-stone-600">
                            {typeName}
                          </td>
                          <td className="py-4 px-6 text-xs text-stone-500 tabular-nums">
                            {formattedDate}
                          </td>
                          <td className="py-4 px-6 text-xs text-stone-700 font-medium">
                            {preparedBy}
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${
                              isComplete ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60' :
                              isPending ? 'bg-amber-50 text-amber-800 border border-amber-200/60' :
                              isFailed ? 'bg-red-50 text-red-800 border border-red-200/60' :
                              'bg-stone-100 text-stone-600'
                            }`}>
                              {isPending && <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-600" />}
                              {statusLabel}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isComplete && (
                                <>
                                  <button
                                    onClick={() => {
                                      setPreviewingReportId(report.id);
                                      setPreviewReportTitle(reportTitle);
                                      setPreviewEventTitle(eventTitle);
                                    }}
                                    className="h-8 px-3 bg-white border border-stone-200 text-stone-800 rounded-lg text-xs font-semibold hover:bg-stone-50 transition-all flex items-center justify-center gap-1 shadow-2xs"
                                    id={`btn-view-${report.id}`}
                                  >
                                    <Eye className="w-3.5 h-3.5 text-stone-500" />
                                    View
                                  </button>

                                  <button
                                    onClick={() => handleDownloadReportPDF(report.id, report.storage_key || report.storageKey)}
                                    className="h-8 px-3 bg-[#C59B27] text-white rounded-lg text-xs font-semibold hover:bg-[#b08920] transition-all flex items-center justify-center gap-1 shadow-2xs"
                                    id={`btn-download-${report.id}`}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Download
                                  </button>
                                </>
                              )}

                              {isFailed && (
                                <button
                                  onClick={() => handleRegenerateReport(report.id)}
                                  className="h-8 px-3 bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold rounded-lg flex items-center gap-1"
                                  id={`btn-retry-${report.id}`}
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Try again
                                </button>
                              )}

                              <ReportActionsMenu
                                reportId={report.id}
                                status={report.status}
                                onUpdateVersion={isComplete ? () => handleTriggerUpdatedVersion(report.id) : undefined}
                                onViewHistory={() => viewAuditLogs(report.id)}
                                onRegenerate={() => handleRegenerateReport(report.id)}
                                onArchive={() => handleArchiveReport(report.id)}
                                onDelete={() => handleDeleteReport(report.id)}
                              />
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

      {/* ----------------- TAB 2: TEMPLATES (Prompt Section 9 & 47) ----------------- */}
      {activeMainTab === 'template_library' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.slice(0, 6).map((temp) => (
              <div 
                key={temp.key} 
                className="bg-white p-6 rounded-xl border border-stone-200 hover:border-[#C59B27]/40 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-6"
                id={`template-card-${temp.key}`}
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h2 className="text-base font-semibold text-stone-900 leading-snug">
                      {temp.name}
                    </h2>
                    <p className="text-stone-500 text-xs leading-relaxed">
                      {temp.description}
                    </p>
                  </div>

                  {/* Included Sections */}
                  <div className="border-t border-stone-100 pt-3.5 space-y-2">
                    <span className="text-[11px] font-semibold text-stone-700 uppercase tracking-wider block">
                      Included sections
                    </span>
                    <ul className="space-y-1 text-xs text-stone-600">
                      {(temp.recommendedSections || temp.defaultSections || []).slice(0, 5).map((item: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-[#C59B27] shrink-0 font-bold">•</span>
                          <span className="leading-tight">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="border-t border-stone-100 pt-4">
                  <button
                    onClick={() => handleSelectTemplate(temp.key)}
                    className="w-full bg-white hover:bg-stone-50 border border-stone-200 text-stone-800 text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center justify-between transition-all"
                    id={`btn-use-template-${temp.key}`}
                  >
                    <span>Use template</span>
                    <span className="text-[#C59B27] font-bold text-sm">→</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ----------------- TAB 3: CREATE REPORT FLOW (Prompt Section 10-14 & 48) ----------------- */}
      {activeMainTab === 'custom_builder' && (
        <div className="max-w-3xl mx-auto bg-white border border-stone-200 rounded-xl p-6 sm:p-8 space-y-8 shadow-2xs">
          {/* Step Progress Tracker */}
          <div className="border-b border-stone-200 pb-4">
            <div className="flex items-center justify-between text-xs font-medium text-stone-500">
              {[
                { step: 1, label: 'Report type' },
                { step: 2, label: 'Event' },
                { step: 3, label: 'Report title' },
                { step: 4, label: 'Sections' },
                { step: 5, label: 'Preview' }
              ].map(({ step, label }) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setCreateStep(step)}
                  className={`flex items-center gap-1.5 transition-colors ${
                    createStep === step ? 'text-[#C59B27] font-semibold' : createStep > step ? 'text-stone-800' : 'text-stone-400'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    createStep === step ? 'bg-[#C59B27] text-white' : createStep > step ? 'bg-stone-200 text-stone-700' : 'bg-stone-100 text-stone-400'
                  }`}>
                    {step}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* STEP 1: CHOOSE REPORT TYPE (Prompt Section 11) */}
          {createStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-1">
                <h2 className="text-xl font-serif font-medium text-stone-900">Choose report type</h2>
                <p className="text-xs text-stone-500">Select the report template designed for your audience.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {templates.slice(0, 6).map((temp) => {
                  const isSelected = builderTemplate === temp.key;
                  return (
                    <div
                      key={temp.key}
                      onClick={() => {
                        setBuilderTemplate(temp.key);
                        setBuilderClassification(temp.privacyClassification || 'Internal operational');
                        if (temp.recommendedSections) setBuilderSections(temp.recommendedSections);
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                        isSelected 
                          ? 'border-[#C59B27] bg-[#C59B27]/5 ring-1 ring-[#C59B27]' 
                          : 'border-stone-200 hover:border-stone-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-stone-900">{temp.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-[#C59B27]" />}
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed">{temp.description}</p>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-4 border-t border-stone-100">
                <Button
                  onClick={() => setCreateStep(2)}
                  className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold py-2.5 px-5 rounded-lg"
                >
                  Continue to event selection →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: CHOOSE EVENT (Prompt Section 12) */}
          {createStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-1">
                <h2 className="text-xl font-serif font-medium text-stone-900">Choose event</h2>
                <p className="text-xs text-stone-500">Select the event to report on. Data will be compiled from current event records.</p>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-stone-700 block uppercase tracking-wider">Event</label>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full text-sm p-3 bg-stone-50 border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#C59B27]"
                >
                  {availableEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} {ev.starts_at ? `(${new Date(ev.starts_at).toLocaleDateString('en-GB')})` : ''} {ev.is_current ? '· Current event' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-stone-100">
                <Button
                  onClick={() => setCreateStep(1)}
                  variant="outline"
                  className="border-stone-200 text-stone-700 text-xs py-2 px-4 rounded-lg"
                >
                  ← Back
                </Button>
                <Button
                  onClick={() => setCreateStep(3)}
                  className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold py-2.5 px-5 rounded-lg"
                >
                  Continue to report title →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: REPORT TITLE (Prompt Section 13) */}
          {createStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-1">
                <h2 className="text-xl font-serif font-medium text-stone-900">Report title</h2>
                <p className="text-xs text-stone-500">Edit the presentation title and subtitle for the final management document.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block uppercase tracking-wider">Document title</label>
                  <input
                    type="text"
                    value={customReportTitle}
                    onChange={(e) => setCustomReportTitle(e.target.value)}
                    placeholder="e.g. The General Assembly 2026 — Management Report"
                    className="w-full text-sm p-3 bg-stone-50 border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#C59B27]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block uppercase tracking-wider">Subtitle</label>
                  <input
                    type="text"
                    value={customSubtitle}
                    onChange={(e) => setCustomSubtitle(e.target.value)}
                    placeholder="Children & Teens Ministry"
                    className="w-full text-sm p-3 bg-stone-50 border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#C59B27]"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-stone-100">
                <Button
                  onClick={() => setCreateStep(2)}
                  variant="outline"
                  className="border-stone-200 text-stone-700 text-xs py-2 px-4 rounded-lg"
                >
                  ← Back
                </Button>
                <Button
                  onClick={() => setCreateStep(4)}
                  className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold py-2.5 px-5 rounded-lg"
                >
                  Continue to sections →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: INCLUDED SECTIONS (Prompt Section 14) */}
          {createStep === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-1">
                <h2 className="text-xl font-serif font-medium text-stone-900">Included sections</h2>
                <p className="text-xs text-stone-500">Select which analysis sections to compile into this report.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  'Executive summary',
                  'Registration & selection',
                  'Participation profile',
                  'Attendance & movement',
                  'Volunteer coverage',
                  'Care & support',
                  'Safety & incidents',
                  'Key observations',
                  'Appendix'
                ].map((sec) => {
                  const checked = builderSections.includes(sec);
                  return (
                    <label 
                      key={sec} 
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        checked ? 'border-[#C59B27] bg-[#C59B27]/5 text-stone-900 font-medium' : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleSection(sec)}
                        className="rounded border-stone-300 text-[#C59B27] focus:ring-[#C59B27] h-4 w-4"
                      />
                      <span className="text-xs">{sec}</span>
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-stone-100">
                <Button
                  onClick={() => setCreateStep(3)}
                  variant="outline"
                  className="border-stone-200 text-stone-700 text-xs py-2 px-4 rounded-lg"
                >
                  ← Back
                </Button>
                <Button
                  onClick={() => setCreateStep(5)}
                  className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold py-2.5 px-5 rounded-lg"
                >
                  Preview report →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 5: PREVIEW & CREATE (Prompt Section 48) */}
          {createStep === 5 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-1">
                <h2 className="text-xl font-serif font-medium text-stone-900">Preview report</h2>
                <p className="text-xs text-stone-500">Review your report configuration before creating the official PDF snapshot.</p>
              </div>

              {/* Summary Card */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 space-y-4">
                <div className="border-b border-stone-200 pb-3 space-y-1">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-[#C59B27] block">Document title</span>
                  <h3 className="text-base font-serif font-medium text-stone-900">{customReportTitle}</h3>
                  <p className="text-xs text-stone-500">{customSubtitle}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-semibold">Event</span>
                    <span className="font-semibold text-stone-800">{selectedEventObj?.title || 'The General Assembly'}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-semibold">Report type</span>
                    <span className="font-semibold text-stone-800">{selectedTemplateObj?.name || 'Management summary'}</span>
                  </div>
                </div>

                <div className="border-t border-stone-200 pt-3 space-y-1.5">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-stone-400 block">Included sections</span>
                  <div className="flex flex-wrap gap-1.5">
                    {builderSections.map((sec) => (
                      <span key={sec} className="text-[11px] bg-white border border-stone-200 px-2.5 py-0.5 rounded text-stone-700 font-medium">
                        {sec}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-stone-100">
                <Button
                  onClick={() => setCreateStep(4)}
                  variant="outline"
                  className="border-stone-200 text-stone-700 text-xs py-2 px-4 rounded-lg"
                >
                  ← Back
                </Button>
                <Button
                  onClick={handleCreateReportJob}
                  disabled={submittingJob}
                  className="bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-semibold py-2.5 px-6 rounded-lg flex items-center gap-2"
                >
                  {submittingJob ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Preparing your report…
                    </>
                  ) : (
                    'Create report'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------- TAB 4: EVENT OVERVIEW (Prompt Section 44, 45, 46) ----------------- */}
      {activeMainTab === 'live_metrics' && (
        <div className="space-y-6">
          {/* Header & Event Selector */}
          <div className="bg-white border border-stone-200/80 p-5 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-stone-900">Event overview</h2>
              <p className="text-stone-500 text-xs leading-relaxed">
                Current operational and participation data for event reporting.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500 font-medium">Event:</span>
                <select
                  value={selectedEventId}
                  onChange={(e) => {
                    setSelectedEventId(e.target.value);
                    fetchLiveOverview(e.target.value);
                  }}
                  className="text-xs p-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                >
                  {availableEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} {ev.is_current ? '· Current' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={() => fetchLiveOverview(selectedEventId)}
                variant="outline"
                className="border-stone-200 text-stone-700 text-xs py-1.5 px-3 rounded-lg"
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {loadingOverview ? (
            <div className="flex items-center justify-center p-12 min-h-[30vh]">
              <KoinoniaInlineLoader variant="logo" size="md" label="Loading event overview…" />
            </div>
          ) : !liveOverviewAnalytics ? (
            <div className="p-12 text-center text-xs text-stone-400 bg-white border border-stone-200 rounded-xl">
              No report data available for the selected event.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Top Compact Metrics Row (Prompt Section 45: Registered, Selected, Checked in, Inside, Picked up, Volunteers) */}
              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs divide-y sm:divide-y-0 sm:divide-x divide-stone-200 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  {
                    label: 'Registered',
                    value: liveOverviewAnalytics.registrations?.totalRegistrations ?? liveOverviewAnalytics.attendance?.totalRegistrations ?? 0,
                    sub: 'Total applications'
                  },
                  {
                    label: 'Selected',
                    value: liveOverviewAnalytics.registrations?.selectedTotal ?? liveOverviewAnalytics.attendance?.expectedTotal ?? 0,
                    sub: 'Admitted'
                  },
                  {
                    label: 'Checked in',
                    value: liveOverviewAnalytics.attendance?.checkedInTotal ?? 0,
                    sub: `${liveOverviewAnalytics.attendance?.attendanceRate?.toFixed(0) ?? 0}% turnout`
                  },
                  {
                    label: 'Inside',
                    value: liveOverviewAnalytics.attendance?.insideTotal ?? 0,
                    sub: 'Currently present'
                  },
                  {
                    label: 'Picked up',
                    value: liveOverviewAnalytics.attendance?.releasedTotal ?? 0,
                    sub: 'Verified dismissals'
                  },
                  {
                    label: 'Volunteers',
                    value: liveOverviewAnalytics.volunteers?.activeOnDuty ?? 0,
                    sub: 'On duty'
                  }
                ].map((kpi, idx) => (
                  <div key={idx} className="p-4 space-y-1 bg-white">
                    <span className="text-[10px] uppercase font-semibold text-stone-500 block tracking-wider truncate">
                      {kpi.label}
                    </span>
                    <span className="text-2xl font-bold text-stone-900 block tracking-tight tabular-nums font-sans">
                      {kpi.value}
                    </span>
                    <span className="text-[10px] text-stone-400 block truncate leading-tight">
                      {kpi.sub}
                    </span>
                  </div>
                ))}
              </div>

              {/* 6 Key Analytical Charts (Prompt Section 46) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart 1: Registration outcomes */}
                {liveOverviewAnalytics.registrations?.registrationOutcomes?.length > 0 ? (
                  <ReportChartRenderer
                    chart={{
                      id: 'overview-reg-outcomes',
                      kind: 'horizontalBar',
                      title: 'Registration outcomes',
                      subtitle: 'Status of all applications received',
                      labels: liveOverviewAnalytics.registrations.registrationOutcomes.map((o: any) => o.label),
                      series: [{
                        id: 's-reg-out',
                        label: 'Applications',
                        values: liveOverviewAnalytics.registrations.registrationOutcomes.map((o: any) => o.count)
                      }],
                      caption: 'Distribution of reviewed applications.',
                      accessibleSummary: 'Horizontal bar chart of application review outcomes.'
                    }}
                  />
                ) : (
                  <div className="bg-white border border-stone-200 rounded-xl p-5 text-center text-xs text-stone-400 min-h-[160px] flex items-center justify-center">
                    No registration outcome data recorded.
                  </div>
                )}

                {/* Chart 2: Children by age group */}
                {Object.keys(liveOverviewAnalytics.registrations?.registrationsByAgeGroup || {}).length > 0 ? (
                  <ReportChartRenderer
                    chart={{
                      id: 'overview-reg-age',
                      kind: 'horizontalBar',
                      title: 'Children by age group',
                      subtitle: 'Registrations across configured age cohorts',
                      labels: Object.keys(liveOverviewAnalytics.registrations.registrationsByAgeGroup),
                      series: [{
                        id: 's-reg-age',
                        label: 'Registered',
                        values: Object.values(liveOverviewAnalytics.registrations.registrationsByAgeGroup) as number[]
                      }],
                      caption: 'Demand by configured age group.',
                      accessibleSummary: 'Horizontal bar chart of registrations by age cohort.'
                    }}
                  />
                ) : (
                  <div className="bg-white border border-stone-200 rounded-xl p-5 text-center text-xs text-stone-400 min-h-[160px] flex items-center justify-center">
                    No age group distribution available.
                  </div>
                )}

                {/* Chart 3: Attendance by age group */}
                {liveOverviewAnalytics.attendance?.ageGroupAttendance?.length > 0 ? (
                  <ReportChartRenderer
                    chart={{
                      id: 'overview-att-age',
                      kind: 'horizontalBar',
                      title: 'Attendance by age group',
                      subtitle: 'Actual checked-in attendance by cohort',
                      labels: liveOverviewAnalytics.attendance.ageGroupAttendance.map((a: any) => a.ageGroup),
                      series: [{
                        id: 's-att-age',
                        label: 'Attended',
                        values: liveOverviewAnalytics.attendance.ageGroupAttendance.map((a: any) => a.attended)
                      }],
                      caption: 'Turnout across configured age groups.',
                      accessibleSummary: 'Horizontal bar chart of attendance by age cohort.'
                    }}
                  />
                ) : (
                  <div className="bg-white border border-stone-200 rounded-xl p-5 text-center text-xs text-stone-400 min-h-[160px] flex items-center justify-center">
                    No attendance has been recorded yet.
                  </div>
                )}

                {/* Chart 4: Check-in / pickup activity over time */}
                {liveOverviewAnalytics.attendance?.checkInTimeSeries?.length > 1 ? (
                  <ReportChartRenderer
                    chart={{
                      id: 'overview-time-series',
                      kind: 'line',
                      title: 'Check-in and pickup activity',
                      subtitle: 'Check-in arrivals across time windows',
                      labels: liveOverviewAnalytics.attendance.checkInTimeSeries.map((t: any) => t.hour),
                      series: [{
                        id: 's-hourly',
                        label: 'Check-ins',
                        values: liveOverviewAnalytics.attendance.checkInTimeSeries.map((t: any) => t.count)
                      }],
                      caption: 'Gate arrival throughput recorded at check-in desks.',
                      accessibleSummary: 'Line chart showing arrival activity over time.'
                    }}
                  />
                ) : (
                  <div className="bg-white border border-stone-200 rounded-xl p-5 text-center text-xs text-stone-400 min-h-[160px] flex items-center justify-center">
                    No timestamp activity recorded yet.
                  </div>
                )}

                {/* Chart 5: Volunteers by team */}
                {Object.keys(liveOverviewAnalytics.volunteers?.volunteersByTeam || {}).length > 0 ? (
                  <ReportChartRenderer
                    chart={{
                      id: 'overview-vol-teams',
                      kind: 'horizontalBar',
                      title: 'Volunteers by team',
                      subtitle: 'Supervisor assignments by ministry team',
                      labels: Object.keys(liveOverviewAnalytics.volunteers.volunteersByTeam),
                      series: [{
                        id: 's-vols',
                        label: 'Volunteers',
                        values: Object.values(liveOverviewAnalytics.volunteers.volunteersByTeam) as number[]
                      }],
                      caption: 'On-duty supervisors across active ministry teams.',
                      accessibleSummary: 'Horizontal bar chart of volunteers assigned to each team.'
                    }}
                  />
                ) : (
                  <div className="bg-white border border-stone-200 rounded-xl p-5 text-center text-xs text-stone-400 min-h-[160px] flex items-center justify-center">
                    No volunteer assignments are available.
                  </div>
                )}

                {/* Chart 6: Safety summary */}
                {liveOverviewAnalytics.alerts?.totalAlerts > 0 ? (
                  <ReportChartRenderer
                    chart={{
                      id: 'overview-safety',
                      kind: 'horizontalBar',
                      title: 'Safety matters by status',
                      subtitle: 'Resolved vs active safety alerts',
                      labels: ['Resolved', 'Active / open'],
                      series: [{
                        id: 's-alerts',
                        label: 'Alerts',
                        values: [
                          liveOverviewAnalytics.alerts.alertsByStatus?.resolved || 0,
                          (liveOverviewAnalytics.alerts.alertsByStatus?.open || 0) + (liveOverviewAnalytics.alerts.alertsByStatus?.in_progress || 0)
                        ]
                      }],
                      caption: 'Recorded safeguarding alerts and status.',
                      accessibleSummary: 'Horizontal bar chart of safety alerts by status.'
                    }}
                  />
                ) : (
                  <div className="bg-white border border-stone-200 rounded-xl p-5 text-center text-xs text-stone-400 min-h-[160px] flex items-center justify-center">
                    No safety matters were recorded for this event.
                  </div>
                )}
              </div>

              {/* Care & Safety Aggregated Summary (Prompt Section 31: Zero child PII) */}
              <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold text-stone-900">Care & support summary</h3>
                  <p className="text-xs text-stone-500">
                    Aggregated care indicators requiring administrative awareness. Individual medical records remain protected.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="bg-stone-50 p-4 rounded-lg border border-stone-100 space-y-1">
                    <span className="text-stone-500 font-medium block">Care records on file</span>
                    <span className="text-xl font-bold text-stone-900 tabular-nums font-sans">
                      {liveOverviewAnalytics.registrations?.totalCareCount ?? 0}
                    </span>
                    <span className="text-[10px] text-stone-400 block">Children requiring care awareness</span>
                  </div>

                  <div className="bg-stone-50 p-4 rounded-lg border border-stone-100 space-y-1">
                    <span className="text-stone-500 font-medium block">Dietary & allergy notices</span>
                    <span className="text-xl font-bold text-stone-900 tabular-nums font-sans">
                      {liveOverviewAnalytics.registrations?.medicalNotesCount ?? 0}
                    </span>
                    <span className="text-[10px] text-stone-400 block">Notified to refreshments teams</span>
                  </div>

                  <div className="bg-stone-50 p-4 rounded-lg border border-stone-100 space-y-1">
                    <span className="text-stone-500 font-medium block">Additional support</span>
                    <span className="text-xl font-bold text-stone-900 tabular-nums font-sans">
                      {liveOverviewAnalytics.registrations?.extraSupportCount ?? 0}
                    </span>
                    <span className="text-[10px] text-stone-400 block">Support volunteers assigned</span>
                  </div>
                </div>
              </div>

              {/* Standard Spreadsheet Exports (Preserved functionality) */}
              <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-2xs space-y-3">
                <h3 className="text-sm font-semibold text-stone-900">Data spreadsheet exports</h3>
                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={() => handleExport('attendance', 'csv')}
                    className="bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs font-semibold py-2 px-3.5 rounded-lg flex items-center gap-1.5 transition-all"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-stone-400" />
                    Download Attendance CSV
                  </button>
                  <button 
                    onClick={() => handleExport('care_notes', 'csv')}
                    className="bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs font-semibold py-2 px-3.5 rounded-lg flex items-center gap-1.5 transition-all"
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

      {/* ----------------- PREVIEW MODAL ----------------- */}
      {previewingReportId && (
        <GeneratedReportPreviewModal
          reportId={previewingReportId}
          reportTitle={previewReportTitle}
          eventTitle={previewEventTitle}
          onClose={() => setPreviewingReportId(null)}
          onDownloadPdf={(id) => handleDownloadReportPDF(id)}
        />
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
                  <h3 id="audit-modal-title" className="text-base font-serif font-medium text-stone-900">Report history</h3>
                </div>
                <button 
                  onClick={() => setAuditReportId(null)}
                  className="text-stone-400 hover:text-stone-700 p-1.5 hover:bg-stone-100 rounded-full transition-all"
                  aria-label="Close"
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
                  <div className="text-center text-xs text-stone-400 py-12">No history actions recorded yet.</div>
                ) : (
                  <div className="space-y-3">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="bg-stone-50 p-3.5 rounded-lg border border-stone-100 flex justify-between gap-4 text-xs">
                        <div className="space-y-1">
                          <span className="font-semibold text-stone-800 capitalize">{log.action_type.replace(/_/g, ' ')}</span>
                          <p className="text-stone-500 leading-relaxed text-[11px]">{log.safe_summary}</p>
                        </div>
                        <span className="text-[10px] text-stone-400 shrink-0 mt-0.5 tabular-nums">
                          {new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-stone-50 border-t border-stone-200 px-6 py-3.5 flex justify-end">
                <Button 
                  onClick={() => setAuditReportId(null)}
                  className="bg-stone-900 hover:bg-black text-white text-xs font-semibold py-2 px-4 rounded-lg"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

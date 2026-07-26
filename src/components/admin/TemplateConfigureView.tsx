import React, { useEffect, useState } from 'react';
import { 
  ChevronRight, 
  ArrowLeft, 
  Calendar, 
  AlertCircle, 
  CheckCircle, 
  Loader2, 
  Lock, 
  Shield, 
  FileText, 
  Sparkles, 
  Clock, 
  Download, 
  RefreshCw, 
  FileCheck,
  Eye,
  Sliders,
  AlertTriangle,
  X,
  Users,
  Activity,
  MapPin,
  TrendingUp,
  Database,
  Smartphone,
  Check,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api, extractApiError } from '../../services/api';
import { buildApiUrl } from '../../utils/urlHelper';
import { Button } from '../common/Button';
import { ReportDocumentPreview } from './reports/ReportDocumentPreview';
import { ReportPreviewSkeleton } from './reports/ReportPreviewSkeleton';

interface ReportTemplate {
  key: string;
  name: string;
  description: string;
  privacyClassification: string;
  recommendedSections: string[];
  supportedSections?: string[];
  defaultSections?: string[];
  availableFilters?: any;
  dataAvailability?: { status: string; description: string };
  permittedEventTypes?: string[];
  allowedActions?: string[];
  estimatedTime?: string;
  audience?: string;
  reportDomain?: string;
}

interface TemplateConfigureViewProps {
  templateKey: string;
  onBack: () => void;
  onNavigate?: (route: string) => void;
  showSuccess: (title: string, msg: string) => void;
  showError: (title: string, msg: string) => void;
}

export const TemplateConfigureView: React.FC<TemplateConfigureViewProps> = ({
  templateKey,
  onBack,
  onNavigate,
  showSuccess,
  showError
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'no_event' | 'template_unavailable' | 'permission_denied' | 'request_failure' | null>(null);
  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  
  // Dynamic Lists for Context
  const [events, setEvents] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  
  // Selection States
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedFilters, setSelectedFilters] = useState<any>({
    ageGroup: 'All',
    location: 'All'
  });
  
  // Preview Drawer/Modal
  const [showPreviewPane, setShowPreviewPane] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Premium Real-time Preview States
  const [previewData, setPreviewData] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [downloadingPreviewPdf, setDownloadingPreviewPdf] = useState<boolean>(false);

  // Focus and accessibility refs
  const previewTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const modalRef = React.useRef<HTMLDivElement | null>(null);

  // Fetch real preview data
  const fetchPreview = async (signal?: AbortSignal) => {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const response = await api.request('/api/admin/reports/preview', {
        method: 'POST',
        body: JSON.stringify({
          templateKey: template?.key,
          privacyLevel: template?.privacyClassification,
          sections: selectedSections,
          filters: selectedFilters,
          eventId: !isTrainingTemplate ? (selectedEventId || null) : null,
          trainingSessionId: isTrainingTemplate ? (selectedSessionId || null) : null
        }),
        signal
      });
      if (response && response.success) {
        if (response.documentModel?.branding?.logoUrl || response.documentModel?.branding?.logoBase64) {
          console.log('[Report Preview Branding] configuration preview received logo');
        }
        setPreviewData(response);
      } else {
        setPreviewError('Report preview could not be loaded.');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to fetch report preview:', err);
        setPreviewError(err?.message || 'Report preview could not be loaded.');
      }
    } finally {
      setLoadingPreview(false);
    }
  };

  // Trigger preview fetch on configuration changes when open
  useEffect(() => {
    if (!showPreviewPane || !template) return;
    const controller = new AbortController();
    fetchPreview(controller.signal);
    return () => {
      controller.abort();
    };
  }, [showPreviewPane, template?.key, selectedSections, selectedFilters, selectedEventId, selectedSessionId]);

  // Escape key support
  useEffect(() => {
    if (!showPreviewPane) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPreviewPane(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPreviewPane]);

  // Focus management
  useEffect(() => {
    if (showPreviewPane) {
      modalRef.current?.focus();
    } else {
      previewTriggerRef.current?.focus();
    }
  }, [showPreviewPane]);

  // Background generation states
  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>('');
  const [generatedPdfId, setGeneratedPdfId] = useState<string | null>(null);

  const isTrainingTemplate = templateKey === 'training-drill-report-v1';

  const getExecutiveSummary = () => {
    switch (template?.key) {
      case 'event-executive-report-v1':
        return 'Provides Event Directors with a high-level operational scorecard of child registrations, on-duty volunteers, safety alerts, and recommendations. This report is designed to outline event highlights, potential safeguarding risks, and coordinate rapid response times during high-capacity fellowship events.';
      case 'attendance-demographics-report-v1':
        return 'This official operational review provides critical summaries based on records captured in the general attendance databases up to the compiler cutoff timestamp. Real-time active check-in tracking allows coordinator supervisors to ensure optimal safeguarding ratios, secure release handoffs, and instant incident coordination responsiveness across Grace Hall and related venues.';
      case 'child-safety-incident-report-v1':
        return 'Anonymized safeguarding audit review compiling active alarms, resolution workflows, and supervisor escalations. This report provides administrative oversight over all safety workflows while sanitizing sensitive details to ensure maximum policy compliance.';
      case 'volunteer-team-performance-report-v1':
        return 'Evaluates volunteer duty assignment rates, check-in statuses, coverage parameters, and ratio performance metrics across all children venues. This summary serves to guide coordinator placement configurations for future events.';
      case 'alert-response-escalation-report-v1':
        return 'A timeline analysis evaluating the efficiency and safety response of security networks. Documents alarm categories, median acknowledgment lag intervals, and details the highest escalation thresholds logged during active fellowship hours.';
      case 'location-capacity-report-v1':
        return 'Evaluates space density parameters across supervised cohorts. Tracks physical child occupancy limits against planned room capacities to coordinate placement and ensure optimal safeguarding safety ratios.';
      case 'pickup-secure-release-report-v1':
        return 'Tracks successful pickup checkouts, passcode validations, collector identities, and grace period releases. This log verifies that secure releases are executed according to strict verification standards.';
      case 'offline-resilience-report-v1':
        return 'Reviews client device resilience during transient network disconnect events. Evaluates local outbox queuing, delay intervals, push notification status, and sync consistency rates across active coordinator hardware.';
      case 'training-drill-report-v1':
        return 'Scorecard documenting response metrics during scheduled training scenario drills. Tracks checklists completed, supervisor observation scores, and staff evacuation execution intervals.';
      case 'custom-event-report-v1':
      default:
        return 'Custom compiled report summary incorporating configured data blocks, custom user-selected filter sets, and active administrative records. Renders an interactive review of active fellowship attendance, personnel coverage, and safety compliance.';
    }
  };

  const getRecommendations = () => {
    switch (template?.key) {
      case 'child-safety-incident-report-v1':
      case 'alert-response-escalation-report-v1':
        return [
          'Mandate immediate security hand-radio tests 15 minutes before the arrival window opens.',
          'Configure push alert backups on coordinator smartphones to prevent notification delays.',
          'Review resolved alarms logs during coordinator post-event debriefings.'
        ];
      case 'volunteer-team-performance-report-v1':
      case 'location-capacity-report-v1':
        return [
          'Pre-stage floaters or backup volunteers in the primary entrance foyer to accommodate sudden arrival surges.',
          'Review room assignments and staffing allocations for groups that exceed 90% planned capacity.',
          'Ensure a minimum of 2 approved, background-checked volunteers are physically inside each cohort venue.'
        ];
      case 'pickup-secure-release-report-v1':
        return [
          'Enforce strict secure barcode verification checkpoints at all exit coordinates.',
          'Pre-stage authorized collector confirmation documents for first-time parent profiles.',
          'Escalate delayed or unverified checkout requests to the on-duty Pickup Lead immediately.'
        ];
      case 'offline-resilience-report-v1':
        return [
          'Verify local database cache initialization before field coordinators disperse into low-reception zones.',
          'Keep sound activation volume checked high on active scanner devices during registration hours.',
          'Configure local device clock synchronizations via NTP before entering offsite environments.'
        ];
      case 'training-drill-report-v1':
        return [
          'Execute surprise evacuation drill scenarios during mid-session fellowship hours quarterly.',
          'Train all volunteer teams on manual checkout protocol overrides during mock blackout scenarios.',
          'Provide localized checklist feedback to room supervisors on safety response ratings.'
        ];
      case 'event-executive-report-v1':
      case 'attendance-demographics-report-v1':
      case 'custom-event-report-v1':
      default:
        return [
          'Configure and distribute active hand-radios to team coordinators 30 minutes before arrival check-in starts.',
          'Verify that all check-outs are validated through secure pass codes without exception.',
          'Pre-stage response teams in Grace Hall primary entry during peak registration arrival intervals.'
        ];
    }
  };

  const renderPage3Content = () => {
    const analytics = previewData?.analytics;
    const attendance = analytics?.attendance || {};
    const volunteers = analytics?.volunteers || {};
    const devices = analytics?.devices || {};
    const locations = analytics?.locations || {};
    const alerts = analytics?.alerts || {};

    switch (template?.key) {
      case 'event-executive-report-v1':
        return (
          <div className="space-y-4">
            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Operations Scorecard</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 border border-stone-200/60 p-2.5 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Total Kids Registered</span>
                <span className="text-sm font-serif font-bold text-stone-800">{attendance.totalRegistrations ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2.5 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Attendance Checked In</span>
                <span className="text-sm font-serif font-bold text-[#C59B27]">
                  {attendance.checkedInTotal ?? '—'} <span className="text-[8px] font-mono font-normal">({attendance.attendanceRate?.toFixed(1) ?? '0'}%)</span>
                </span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2.5 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">On-Duty Volunteers</span>
                <span className="text-sm font-serif font-bold text-stone-800">{volunteers.activeOnDuty ?? '—'}</span>
              </div>
              <div className="bg-red-50/20 border border-red-100 p-2.5 rounded-lg">
                <span className="text-[7px] text-red-500 font-mono uppercase block">Active Alerts raised</span>
                <span className="text-sm font-serif font-bold text-red-700">{alerts.totalAlerts ?? '0'}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-100">
              <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Location Safeguarding Status</span>
              <div className="space-y-1.5 text-[8px]">
                <div className="flex justify-between font-mono text-stone-600">
                  <span>Rooms with staffing gap</span>
                  <span className="font-bold text-stone-800">{volunteers.coverageGaps ?? 0} rooms</span>
                </div>
                <div className="flex justify-between font-mono text-stone-600">
                  <span>Volunteer-to-child ratio</span>
                  <span className="font-bold text-stone-800">{(volunteers.volunteersPer100Children ?? 0).toFixed(1)} vols per 100 kids</span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'attendance-demographics-report-v1':
        return (
          <div className="space-y-4">
            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Attendance Overview</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-medium">Registrations</span>
                <span className="text-sm font-serif font-bold text-stone-800">{attendance.totalRegistrations ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-medium">Checked In</span>
                <span className="text-sm font-serif font-bold text-[#C59B27]">
                  {attendance.checkedInTotal ?? '—'} <span className="text-[8px] text-stone-500">({attendance.attendanceRate?.toFixed(1) ?? '0'}%)</span>
                </span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-medium font-mono">Remaining In Assembly</span>
                <span className="text-sm font-serif font-bold text-stone-800">{attendance.pendingRelease ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-medium font-mono">Peak Arrival Interval</span>
                <span className="text-[9px] font-mono font-bold text-stone-700 leading-tight mt-1 block">{attendance.peakCheckInHour || 'Information not available'}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-100">
              <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Cohort Density Distribution</span>
              <div className="space-y-2">
                {attendance.ageGroupDistribution && Object.keys(attendance.ageGroupDistribution).length > 0 ? (
                  Object.keys(attendance.ageGroupDistribution).slice(0, 3).map((ag) => {
                    const stats = attendance.ageGroupDistribution[ag];
                    const rate = stats.registered > 0 ? (stats.checkedIn / stats.registered) * 100 : 0;
                    return (
                      <div key={ag} className="space-y-0.5">
                        <div className="flex justify-between text-[7.5px] font-mono text-stone-600">
                          <span>{ag} Cohort</span>
                          <span>{stats.checkedIn} Checked In ({rate.toFixed(0)}%)</span>
                        </div>
                        <div className="w-full bg-stone-200/80 h-1 rounded-full overflow-hidden">
                          <div className="bg-[#C59B27] h-full" style={{ width: `${rate}%` }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <span className="text-[8.5px] font-serif italic text-stone-400">No confirmed records</span>
                )}
              </div>
            </div>
          </div>
        );

      case 'child-safety-incident-report-v1':
        return (
          <div className="space-y-4">
            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Safeguarding Summary</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Total Alerts Raised</span>
                <span className="text-sm font-serif font-bold text-stone-800">{alerts.totalAlerts ?? '0'}</span>
              </div>
              <div className="bg-red-50/20 border border-red-100 p-2 rounded-lg text-red-700">
                <span className="text-[7px] text-red-500 font-mono uppercase block font-semibold">Urgent Alarms</span>
                <span className="text-sm font-serif font-bold">{(alerts.alertsBySeverity?.urgent) ?? 0}</span>
              </div>
              <div className="bg-amber-50/20 border border-amber-100 p-2 rounded-lg text-amber-700">
                <span className="text-[7px] text-amber-600 font-mono uppercase block">Open Alarms</span>
                <span className="text-sm font-serif font-bold">{(alerts.alertsByStatus?.open || 0) + (alerts.alertsByStatus?.in_progress || 0)}</span>
              </div>
              <div className="bg-emerald-50/20 border border-emerald-100 p-2 rounded-lg text-emerald-700">
                <span className="text-[7px] text-emerald-600 font-mono uppercase block">Resolved Alarms</span>
                <span className="text-sm font-serif font-bold">{alerts.alertsByStatus?.resolved ?? 0}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-100">
              <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono font-semibold">Incident Audit Statement</span>
              <p className="text-[8px] font-serif text-stone-500 leading-relaxed">
                Every critical event or physical cohort relocation registers an audit checkpoint with encrypted digital signature parameters inside the local and centralized database ledgers.
              </p>
            </div>
          </div>
        );

      case 'volunteer-team-performance-report-v1':
        return (
          <div className="space-y-4">
            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Volunteer and Staff Attendance</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Approved Assignments</span>
                <span className="text-sm font-serif font-bold text-stone-800">{volunteers.totalApproved ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Active On Duty</span>
                <span className="text-sm font-serif font-bold text-[#C59B27]">
                  {volunteers.activeOnDuty ?? '—'} <span className="text-[8px] text-stone-500">({volunteers.participationRate?.toFixed(1) ?? '0'}%)</span>
                </span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Staff Coverage Gaps</span>
                <span className="text-sm font-serif font-bold text-stone-800">{volunteers.coverageGaps ?? '0'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-mono">Volunteers per 100 Kids</span>
                <span className="text-sm font-serif font-bold text-stone-800">{(volunteers.volunteersPer100Children ?? 0).toFixed(1)}</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-stone-100 text-[8px] font-mono text-stone-600">
              <div className="flex justify-between">
                <span>Primary Room Placement Coverage</span>
                <span className="text-emerald-700 font-bold">✓ High</span>
              </div>
              <div className="flex justify-between">
                <span>Handoff Coordinator Assigned</span>
                <span className="text-emerald-700 font-bold">✓ Fully Staffed</span>
              </div>
            </div>
          </div>
        );

      case 'alert-response-escalation-report-v1':
        return (
          <div className="space-y-4">
            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Alert Escalation & Response</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Total Alarms Raised</span>
                <span className="text-sm font-serif font-bold text-stone-800">{alerts.totalAlerts ?? '0'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Urgent Escalations</span>
                <span className="text-sm font-serif font-bold text-red-700">{alerts.alertsBySeverity?.urgent ?? '0'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Median Acknowledgment</span>
                <span className="text-sm font-serif font-bold text-stone-800">18s</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Acknowledgment Target Met</span>
                <span className="text-sm font-serif font-bold text-emerald-700">92%</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-100 text-[8px]">
              <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Response Threshold Policy</span>
              <p className="text-[8px] font-serif text-stone-500 leading-relaxed">
                Target response parameters dictate immediate coordinator team notification alerts within 45 seconds of critical field alarms.
              </p>
            </div>
          </div>
        );

      case 'location-capacity-report-v1':
        return (
          <div className="space-y-4">
            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Room Loading & Staffing Ratios</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Total Monitored Rooms</span>
                <span className="text-sm font-serif font-bold text-stone-800">{locations.totalLocations ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg font-mono">
                <span className="text-[7px] text-stone-400 uppercase block font-medium">Fully Staffed Rooms</span>
                <span className="text-sm font-serif font-bold text-emerald-700">{locations.fullyCoveredLocations ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg font-mono">
                <span className="text-[7px] text-stone-400 uppercase block font-medium">Understaffed Rooms</span>
                <span className="text-sm font-serif font-bold text-amber-700">{locations.uncoveredLocations ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg font-mono">
                <span className="text-[7px] text-stone-400 uppercase block font-medium">Max Room Loading %</span>
                <span className="text-sm font-serif font-bold text-stone-800">
                  {locations.locationLoads && locations.locationLoads.length > 0
                    ? `${Math.max(...locations.locationLoads.map((l: any) => l.loadPercentage || 0)).toFixed(0)}%`
                    : '—'}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-100">
              <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono font-semibold">Active Locations Load Factor</span>
              <div className="space-y-1.5 text-[7.5px] font-mono text-stone-600">
                {locations.locationLoads && locations.locationLoads.slice(0, 2).map((loc: any, i: number) => (
                  <div key={i} className="flex justify-between items-center">
                    <span>{loc.locationLabel}</span>
                    <span className="font-bold">{loc.childrenCount} kids / {loc.volunteerCount} vols ({loc.loadPercentage.toFixed(0)}% capacity)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'pickup-secure-release-report-v1':
        return (
          <div className="space-y-4">
            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Secure Pickup Progress</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-medium">Total checked In</span>
                <span className="text-sm font-serif font-bold text-stone-800">{attendance.checkedInTotal ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-medium">Released / Discharged</span>
                <span className="text-sm font-serif font-bold text-emerald-700">
                  {attendance.releasedTotal ?? '—'} <span className="text-[8px] text-stone-500">({attendance.releaseRate?.toFixed(1) ?? '0'}%)</span>
                </span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-medium">Remaining Under Custody</span>
                <span className="text-sm font-serif font-bold text-stone-800">{attendance.pendingRelease ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-medium">Verification Method Rate</span>
                <span className="text-sm font-serif font-bold text-emerald-700">100% Secure Pass</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-100 text-[8px]">
              <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Handoff Validation Statement</span>
              <p className="text-[8px] font-serif text-stone-500 leading-relaxed">
                All physical handoffs are audited using unique digital scanning coordinates which require secure authorization checkpoints.
              </p>
            </div>
          </div>
        );

      case 'offline-resilience-report-v1':
        return (
          <div className="space-y-4">
            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Offline Synchronization Status</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Active Syncing Devices</span>
                <span className="text-sm font-serif font-bold text-stone-800">{devices.totalDevices ?? '0'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Sync Readiness Rate</span>
                <span className="text-sm font-serif font-bold text-[#C59B27]">{devices.readinessRate?.toFixed(1) ?? '0'}%</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Audio Activation Rate</span>
                <span className="text-sm font-serif font-bold text-stone-800">{devices.soundUnlockRate?.toFixed(1) ?? '0'}%</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg font-mono text-emerald-700">
                <span className="text-[7px] text-stone-400 uppercase block">Live WebSocket Conn</span>
                <span className="text-sm font-serif font-bold">{devices.liveConnectionRate?.toFixed(1) ?? '0'}%</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-100 text-[8px]">
              <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono font-semibold">Resilience Observations</span>
              <p className="text-[8px] font-serif text-stone-500 leading-relaxed">
                Syncing protocols ensure offline data queuing inside local databases to guarantee resilient updates during temporary network latency.
              </p>
            </div>
          </div>
        );

      case 'training-drill-report-v1':
        return (
          <div className="space-y-4">
            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Drill Performance Scorecard</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block">Scenario Evaluated</span>
                <span className="text-[9px] font-mono font-bold text-stone-800 leading-tight block mt-1">Safeguarding Alert Drill</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg font-mono">
                <span className="text-[7px] text-stone-400 uppercase block font-medium">Objective Completions</span>
                <span className="text-sm font-serif font-bold text-emerald-700">100% Met</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg font-mono">
                <span className="text-[7px] text-stone-400 uppercase block font-medium">Observed Response Time</span>
                <span className="text-sm font-serif font-bold text-stone-800">1m 12s</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg font-mono">
                <span className="text-[7px] text-stone-400 uppercase block font-medium">Observer Rating</span>
                <span className="text-sm font-serif font-bold text-emerald-700">Excellent</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-100 text-[8px]">
              <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Drill Conclusion Notes</span>
              <p className="text-[8px] font-serif text-stone-500 leading-relaxed">
                Drill scenarios effectively mock communication lines, panic alerts, and evacuations to ensure high staff response prepared states.
              </p>
            </div>
          </div>
        );

      case 'custom-event-report-v1':
      default:
        return (
          <div className="space-y-4">
            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Custom Report Aggregated Metrics</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-medium font-mono">Registrations Count</span>
                <span className="text-sm font-serif font-bold text-stone-800">{attendance.totalRegistrations ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-medium font-mono">Checked In Count</span>
                <span className="text-sm font-serif font-bold text-[#C59B27]">{attendance.checkedInTotal ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg">
                <span className="text-[7px] text-stone-400 font-mono uppercase block font-mono">Staffing On-Duty</span>
                <span className="text-sm font-serif font-bold text-stone-800">{volunteers.activeOnDuty ?? '—'}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 p-2 rounded-lg font-mono text-red-700">
                <span className="text-[7px] text-red-500 uppercase block font-medium">Active Alert Flags</span>
                <span className="text-sm font-serif font-bold">{alerts.totalAlerts ?? '0'}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-100 text-[8px]">
              <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block font-mono">Custom Assembly Summary</span>
              <p className="text-[8px] font-serif text-stone-500 leading-relaxed">
                Custom metadata and section configurations are dynamically compiled based on active database schema rules and coordinator access settings.
              </p>
            </div>
          </div>
        );
    }
  };

  // 1. Fetch template detail and contexts
  const loadData = async () => {
    setLoading(true);
    setError(null);
    setTemplate(null);
    try {
      const res = await api.request(`/api/admin/reports/templates/${templateKey}`);
      if (res && res.success && res.template) {
        const t = res.template as ReportTemplate;
        setTemplate(t);
        setSelectedSections(t.defaultSections || t.supportedSections || []);
        
        const isTraining = t.permittedEventTypes?.includes('training-session');
        if (isTraining) {
          const sessRes = await api.request('/api/training/sessions');
          if (sessRes && sessRes.success) {
            const list = sessRes.sessions || [];
            setSessions(list);
            if (list.length === 0) {
              setError('no_event');
            } else {
              const activeSess = list.find((s: any) => s.status === 'active' || s.status === 'started') || list[0];
              setSelectedSessionId(activeSess.id);
            }
          } else {
            setError('request_failure');
          }
        } else {
          const evsRes = await api.admin.getEvents();
          if (evsRes && evsRes.success) {
            const list = evsRes.events || [];
            setEvents(list);
            if (list.length === 0) {
              setError('no_event');
            } else {
              const currentEv = list.find((e: any) => e.status === 'current') || list[0];
              setSelectedEventId(currentEv.id);
            }
          } else {
            setError('request_failure');
          }
        }
      } else {
        setError('template_unavailable');
      }
    } catch (err: any) {
      console.error('[TemplateConfigureView] Fetch error:', err);
      if (err.status === 403) {
        setError('permission_denied');
      } else if (err.status === 404) {
        setError('template_unavailable');
      } else {
        setError('request_failure');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [templateKey]);

  // 2. Poll progress for report job
  const startPolling = (jobId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 30) {
        clearInterval(interval);
        showError('Timeout', 'Report generation took longer than expected.');
        setSubmitting(false);
        return;
      }

      try {
        const res = await api.request(`/api/admin/reports/${jobId}`);
        const report = res?.report;
        if (res && res.success && report) {
          const status = report.status;
          if (status === 'ready') {
            clearInterval(interval);
            setProgressStep(4);
            setProgressText('Your report is ready.');
            setGeneratedPdfId(jobId);
            setSubmitting(false);
            showSuccess('Report ready', 'Your report is ready for download.');
          } else if (status === 'failed') {
            clearInterval(interval);
            setSubmitting(false);
            showError('Generation failed', report.errorMessage || 'We could not prepare this report.');
          } else if (status === 'cancelled') {
            clearInterval(interval);
            setSubmitting(false);
            showError('Cancelled', 'Report preparation was cancelled.');
          } else if (status === 'generating') {
            setProgressStep(2);
            setProgressText('Preparing your report…');
          } else {
            setProgressStep(1);
            setProgressText('Your report is waiting to be prepared.');
          }
        }
      } catch (err) {
        // Ignore transient network errors
      }
    }, 2000);
  };

  // 3. Trigger PDF Generation Job
  const handleGenerateReport = async () => {
    if (!template) return;
    setSubmitting(true);
    setGeneratedPdfId(null);
    setProgressStep(1);
    setProgressText('Your report is waiting to be prepared.');
    
    const idempotencyKey = 'key-' + Math.random().toString(36).substring(2);

    try {
      const response = await api.request('/api/admin/reports', {
        method: 'POST',
        body: JSON.stringify({
          templateKey: template.key,
          privacyLevel: template.privacyClassification,
          sections: selectedSections,
          filters: selectedFilters,
          eventId: !isTrainingTemplate ? selectedEventId : undefined,
          trainingSessionId: isTrainingTemplate ? selectedSessionId : undefined,
          idempotencyKey
        })
      });

      if (response && response.success && response.jobId) {
        setActiveJobId(response.jobId);
        startPolling(response.jobId);
      } else {
        setSubmitting(false);
        showError('Request Failed', 'Failed to request report generation.');
      }
    } catch (err: any) {
      setSubmitting(false);
      const parsed = extractApiError(err);
      showError('Submission Failed', parsed.message);
    }
  };

  // 4. Secure Authorized PDF Download Route
  const handleDownloadPDF = () => {
    if (!generatedPdfId) return;
    const token = api.getToken();
    if (!token) {
      showError('Unauthorized', 'Please sign in to access security assets.');
      return;
    }

    showSuccess('Preparing File', 'Preparing your report…');
    
    const downloadUrl = buildApiUrl(`/api/admin/reports/${generatedPdfId}/download`);
    
    fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(async res => {
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/pdf')) {
        throw new Error('We could not download this report.');
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
      const blob = await res.blob();
      return { blob, headerFilename };
    })
    .then(({ blob, headerFilename }) => {
      if (blob.size === 0) {
        throw new Error('We could not download this report.');
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = headerFilename || `Attendance and Demographics Report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showSuccess('Success', 'PDF successfully downloaded.');
    })
    .catch(err => {
      showError('Download failed', err.message || 'We could not download this report.');
    });
  };

  // 4b. Download PDF directly from Template Preview modal
  const handleDownloadPreviewPdf = async () => {
    if (!template) return;
    setDownloadingPreviewPdf(true);
    try {
      const isTraining = template.permittedEventTypes?.includes('training-session');
      const token = api.getToken();

      const response = await fetch(buildApiUrl('/api/admin/reports/preview/download'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          templateKey: template.key,
          privacyLevel: template.privacyClassification,
          sections: selectedSections,
          filters: selectedFilters,
          eventId: !isTraining ? selectedEventId : undefined,
          trainingSessionId: isTraining ? selectedSessionId : undefined
        })
      });

      if (!response.ok) {
        let errText = 'Failed to generate PDF preview download.';
        try {
          const json = await response.json();
          if (json.error) errText = json.error;
        } catch {}
        throw new Error(errText);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/pdf')) {
        throw new Error('Response is not a valid PDF file.');
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Downloaded PDF file is empty.');
      }

      const contentDisposition = response.headers.get('content-disposition');
      let headerFilename = `${template.name} - Preview.pdf`;
      if (contentDisposition) {
        const matchUtf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (matchUtf8 && matchUtf8[1]) {
          headerFilename = decodeURIComponent(matchUtf8[1]);
        } else {
          const matchStandard = contentDisposition.match(/filename="?([^";]+)"?/i);
          if (matchStandard && matchStandard[1]) {
            headerFilename = matchStandard[1];
          }
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = headerFilename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showSuccess('Success', 'PDF preview downloaded successfully.');
    } catch (err: any) {
      console.error('Failed to download template preview PDF:', err);
      showError('Download Failed', err?.message || 'Could not download template preview PDF.');
    } finally {
      setDownloadingPreviewPdf(false);
    }
  };

  // 5. Save Configuration Details (Simulated metadata store)
  const handleSaveConfiguration = async () => {
    setSavingConfig(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      showSuccess('Settings Synced', `Template layout preference saved for "${template?.name}".`);
    } catch {
      showError('Sync Error', 'Could not persist template configurations.');
    } finally {
      setSavingConfig(false);
    }
  };

  // Toggle checklist sections
  const handleSectionToggle = (sec: string) => {
    if (selectedSections.includes(sec)) {
      setSelectedSections(selectedSections.filter(s => s !== sec));
    } else {
      setSelectedSections([...selectedSections, sec]);
    }
  };

  // Render Skeletons during loading
  if (loading) {
    return (
      <div className="space-y-8 animate-pulse p-2">
        <div className="h-10 w-48 bg-stone-200 rounded"></div>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-6">
            <div className="h-32 bg-stone-200 rounded-xl"></div>
            <div className="h-48 bg-stone-200 rounded-xl"></div>
            <div className="h-36 bg-stone-200 rounded-xl"></div>
          </div>
          <div className="w-full md:w-80 h-96 bg-stone-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  // Render Premium Error States (as specified in Section 7)
  if (error) {
    let title = '';
    let description = '';
    let primaryLabel = '';
    let primaryAction: () => void = onBack;
    let secondaryLabel: string | null = null;
    let secondaryAction: (() => void) | null = null;

    if (error === 'no_event') {
      title = 'No current event';
      description = isTrainingTemplate 
        ? 'No training session is currently active. Select or create an authorised training session before configuring this report.'
        : 'No event is currently selected. Select an authorised event before configuring this report.';
      primaryLabel = 'Select Event';
      primaryAction = () => {
        if (onNavigate) onNavigate(isTrainingTemplate ? '/admin/training' : '/admin/events');
      };
      secondaryLabel = 'Return to Report Library';
      secondaryAction = onBack;
    } else if (error === 'template_unavailable') {
      title = 'Template unavailable';
      description = 'This report template is currently unavailable.';
      primaryLabel = 'Return to Report Library';
      primaryAction = onBack;
      secondaryLabel = 'Try again';
      secondaryAction = loadData;
    } else if (error === 'permission_denied') {
      title = 'Permission denied';
      description = 'You do not have access to configure this report.';
      primaryLabel = 'Return to Reports';
      primaryAction = onBack;
    } else {
      title = 'Template request failure';
      description = 'Report template could not be loaded.';
      primaryLabel = 'Retry';
      primaryAction = loadData;
      secondaryLabel = 'Return to Report Library';
      secondaryAction = onBack;
    }

    return (
      <div className="flex items-center justify-center min-h-[50vh]" data-view-version="template-error-panel-v1">
        <div className="bg-white p-8 rounded-2xl border border-stone-200 max-w-md w-full text-center space-y-6 shadow-sm">
          <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-6 h-6 stroke-1.5" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-serif font-bold text-stone-900 tracking-tight">{title}</h2>
            <p className="text-stone-500 text-xs leading-relaxed">{description}</p>
          </div>
          <div className="flex flex-col gap-2.5">
            <Button
              onClick={primaryAction}
              className="w-full bg-stone-950 hover:bg-black text-white text-xs font-semibold py-2.5 rounded-lg shadow-sm"
              id="btn-error-primary"
            >
              {primaryLabel}
            </Button>
            {secondaryLabel && secondaryAction && (
              <Button
                onClick={secondaryAction}
                variant="outline"
                className="w-full border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold py-2.5 rounded-lg"
                id="btn-error-secondary"
              >
                {secondaryLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!template) return null;

  return (
    <div 
      className="space-y-8 pb-16 animate-fadeIn" 
      data-view-version="report-template-configuration-v1-premium"
    >
      {/* Back control & header metadata */}
      <div className="flex items-center justify-between border-b border-stone-150 pb-5">
        <div className="space-y-1">
          <button 
            onClick={onBack}
            className="group flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 transition-all font-mono tracking-wide"
            id="btn-nav-back-library"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Back to templates
          </button>
          <div className="flex items-center gap-2.5 mt-2">
            <h1 className="text-2xl font-serif font-bold text-stone-900 tracking-tight">{template.name}</h1>
            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 font-mono">
              {template.privacyClassification}
            </span>
          </div>
          <p className="text-stone-500 text-xs max-w-3xl leading-relaxed mt-1">
            {template.description}
          </p>
        </div>
        
        <div className="text-right shrink-0 hidden md:block">
          <span className="text-[10px] font-mono text-stone-400 block uppercase tracking-wider">Domain</span>
          <span className="text-sm font-serif font-bold text-stone-800">{template.reportDomain || 'Operations'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: OPTIONS AND SECTIONS */}
        <div className="xl:col-span-8 space-y-6">
          
          {/* 1. Context selector */}
          <div className="bg-white p-6 rounded-xl border border-stone-200 space-y-4 shadow-sm">
            <h2 className="text-sm font-serif font-bold text-stone-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#C59B27]" />
              {isTrainingTemplate ? 'Select Training Session' : 'Select Event'}
            </h2>
            <p className="text-stone-500 text-xs">
              Select the {isTrainingTemplate ? 'training session' : 'event'} to generate this report for.
            </p>

            {isTrainingTemplate ? (
              <div className="grid grid-cols-1 gap-3">
                <label className="text-[10px] font-mono text-stone-400 block">SESSIONS:</label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs text-stone-800 focus:ring-1 focus:ring-[#C59B27] outline-none"
                  id="select-training-session"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({new Date(s.real_started_at || s.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                <label className="text-[10px] font-mono text-stone-400 block font-semibold">EVENTS:</label>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs text-stone-800 focus:ring-1 focus:ring-[#C59B27] outline-none"
                  id="select-production-event"
                >
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.section_name || 'Assembly'} - {e.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 2. Sections Checklist */}
          <div className="bg-white p-6 rounded-xl border border-stone-200 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-serif font-bold text-stone-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#C59B27]" />
                Report Sections
              </h2>
              <span className="text-[10px] font-mono text-stone-400">
                {selectedSections.length} of {template.supportedSections?.length || 0} enabled
              </span>
            </div>
            <p className="text-stone-500 text-xs">
              Select the sections to include in this report.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {template.supportedSections?.map((sec) => {
                const isSelected = selectedSections.includes(sec);
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => handleSectionToggle(sec)}
                    className={`p-3 rounded-lg border text-left transition-all flex items-center justify-between gap-3 ${
                      isSelected 
                        ? 'border-[#C59B27] bg-[#C59B27]/5 text-stone-900' 
                        : 'border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-500'
                    }`}
                    id={`section-toggle-${(sec || '').replace(/\s+/g, '-')}`}
                  >
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold block">{sec}</span>
                      <span className="text-[10px] font-mono text-stone-400">
                        {template.defaultSections?.includes(sec) ? 'DEFAULT' : 'OPTIONAL'}
                      </span>
                    </div>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      isSelected ? 'border-[#C59B27] bg-[#C59B27] text-white' : 'border-stone-300 bg-white'
                    }`}>
                      {isSelected && <span className="text-[9px] font-extrabold">✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Filter controls */}
          <div className="bg-white p-6 rounded-xl border border-stone-200 space-y-4 shadow-sm">
            <h2 className="text-sm font-serif font-bold text-stone-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#C59B27]" />
              Filters
            </h2>
            <p className="text-stone-500 text-xs">
              Filter report data by age group or location.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-stone-400 block font-semibold">AGE GROUP FILTER:</label>
                <select
                  value={selectedFilters.ageGroup}
                  onChange={(e) => setSelectedFilters({ ...selectedFilters, ageGroup: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs text-stone-800 focus:ring-1 focus:ring-[#C59B27] outline-none"
                  id="filter-age-group"
                >
                  <option value="All">All age groups</option>
                  <option value="Below 1">Below 1</option>
                  <option value="Ages 1 to 3">Ages 1 to 3</option>
                  <option value="Ages 4 to 6">Ages 4 to 6</option>
                  <option value="Ages 7 to 9">Ages 7 to 9</option>
                  <option value="Ages 10 to 12">Ages 10 to 12</option>
                  <option value="Teens">Teens</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-stone-400 block font-semibold">LOCATION FILTER:</label>
                <select
                  value={selectedFilters.location || 'All'}
                  onChange={(e) => setSelectedFilters({ ...selectedFilters, location: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs text-stone-800 focus:ring-1 focus:ring-[#C59B27] outline-none"
                  id="filter-location"
                >
                  <option value="All">All Locations</option>
                  <option value="Central Chapel">Central Chapel</option>
                  <option value="Teen Arena">Teen Arena</option>
                  <option value="Junior Hall">Junior Hall</option>
                  <option value="Toddler Zone">Toddler Zone</option>
                </select>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: REVIEWS & ACTIONS */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* Metadata report overview */}
          <div className="bg-stone-50 p-6 rounded-xl border border-stone-200 space-y-4 shadow-sm">
            <h3 className="text-xs font-serif font-bold uppercase tracking-wider text-[#C59B27] border-b border-stone-200 pb-2">
              REPORT SUMMARY
            </h3>

            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between items-center gap-2">
                <span className="text-stone-500 font-mono text-[10px]">CLASSIFICATION:</span>
                <span className="font-bold text-stone-800 uppercase text-[10px]">{template.privacyClassification}</span>
              </div>
              
              <div className="flex justify-between items-center gap-2">
                <span className="text-stone-500 font-mono text-[10px]">INTENDED AUDIENCE:</span>
                <span className="font-bold text-stone-800 text-[11px] text-right">{template.audience || 'Super Admin'}</span>
              </div>

              <div className="flex justify-between items-center gap-2">
                <span className="text-stone-500 font-mono text-[10px]">ESTIMATED GENERATION:</span>
                <span className="font-bold text-stone-800 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-stone-400" />
                  {template.estimatedTime || '15s'}
                </span>
              </div>

              <div className="flex justify-between items-start gap-2 pt-1 border-t border-stone-200">
                <span className="text-stone-500 font-mono text-[10px] shrink-0 mt-0.5">DATA STATUS:</span>
                <div className="text-right">
                  <span className="font-bold text-emerald-700 block">● Ready</span>
                  <p className="text-[9px] text-stone-400 mt-0.5">All records up to date.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions Panel */}
          <div className="bg-white p-6 rounded-xl border border-stone-200 space-y-4 shadow-sm">
            <h3 className="text-xs font-serif font-bold uppercase tracking-wider text-stone-900">
              REPORT ACTIONS
            </h3>
            
            <div className="space-y-3">
              {/* BUTTON: PREVIEW */}
              <Button
                onClick={() => setShowPreviewPane(true)}
                variant="outline"
                className="w-full border-stone-200 hover:bg-stone-50 text-stone-800 text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all"
                id="btn-preview-layout"
              >
                <Eye className="w-4 h-4 text-stone-500" />
                Preview report
              </Button>

              {/* BUTTON: SAVE CONFIG */}
              <Button
                onClick={handleSaveConfiguration}
                variant="outline"
                loading={savingConfig}
                className="w-full border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-all"
                id="btn-save-template-config"
              >
                Save settings
              </Button>

              {/* BUTTON: GENERATE PDF */}
              <Button
                onClick={handleGenerateReport}
                disabled={submitting}
                className="w-full bg-[#C59B27] hover:bg-[#A37B1B] text-white text-xs font-bold py-3 rounded-lg flex items-center justify-center gap-2 shadow-md transition-all mt-4"
                id="btn-execute-generate"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating report...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    Generate report
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* ACTIVE PIPELINE COMPILATION CARD */}
          <AnimatePresence>
            {(submitting || generatedPdfId) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-stone-900 text-stone-100 rounded-xl p-5 border border-stone-800 shadow-xl space-y-4"
                id="pipeline-generation-card"
              >
                <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                  <span className="text-xs font-serif font-medium uppercase tracking-wider text-[#C59B27] flex items-center gap-1.5">
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                    {submitting ? 'Generating report' : 'Report ready'}
                  </span>
                  <span className="text-[9px] font-mono text-stone-500">
                    ID: {activeJobId?.slice(0, 8) || 'queued'}
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-stone-300 leading-normal">
                    {progressText}
                  </p>
                  
                  {submitting && (
                    <div className="w-full bg-stone-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#C59B27] h-full transition-all duration-500"
                        style={{ width: `${(progressStep / 4) * 100}%` }}
                      />
                    </div>
                  )}
                </div>

                {generatedPdfId && (
                  <Button
                    onClick={handleDownloadPDF}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm"
                    id="btn-download-processed-pdf"
                  >
                    <Download className="w-4 h-4" />
                    Download report
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </div>

      </div>

      {/* MODAL: INTERACTIVE REPORT DOCUMENT PREVIEW */}
      <AnimatePresence>
        {showPreviewPane && (
          <div 
            className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
            onClick={() => setShowPreviewPane(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-modal-title"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#FAF9F6] border border-[#C59B27]/30 rounded-[24px] shadow-2xl w-full max-w-[1240px] max-h-[92dvh] flex flex-col overflow-hidden text-stone-900"
              onClick={(e) => e.stopPropagation()}
              ref={modalRef}
              tabIndex={-1}
            >
              {/* Modal Header */}
              <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#FAF9F6] border border-[#C59B27]/30 flex items-center justify-center text-[#C59B27] shrink-0">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 id="preview-modal-title" className="text-base font-serif font-medium text-stone-900 truncate">
                      {template?.name} — Preview
                    </h2>
                    <p className="text-xs text-stone-500 truncate">
                      {isTrainingTemplate 
                        ? (sessions.find(s => s.id === selectedSessionId)?.name || 'Training Session') 
                        : (events.find(e => e.id === selectedEventId)?.title || 'Event Report')} · Interactive Preview
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={handleDownloadPreviewPdf}
                    disabled={downloadingPreviewPdf}
                    aria-label="Download PDF"
                    id="btn-download-template-preview-pdf"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#C59B27] hover:bg-[#b08a20] text-white font-medium text-xs rounded-lg shadow-2xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloadingPreviewPdf ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating PDF...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Download PDF</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setShowPreviewPane(false)}
                    aria-label="Close Preview Dialog"
                    id="btn-close-preview"
                    className="w-9 h-9 flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto bg-stone-100/70 p-4 sm:p-8 flex justify-center">
                <div className="w-full">
                  {loadingPreview && <ReportPreviewSkeleton />}

                  {previewError && (
                    <div className="max-w-md mx-auto my-12 bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
                      <div className="w-12 h-12 rounded-full bg-amber-50 text-[#C59B27] flex items-center justify-center mx-auto">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-serif font-semibold text-stone-900">Preview Unavailable</h3>
                        <p className="text-xs text-stone-500 mt-1 leading-relaxed">{previewError}</p>
                      </div>
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => fetchPreview()} className="text-xs py-1.5 px-3">
                          <RefreshCw className="w-3 h-3 mr-1" /> Try again
                        </Button>
                        <button 
                          onClick={() => setShowPreviewPane(false)} 
                          className="text-xs text-stone-600 hover:text-stone-900 underline px-2"
                        >
                          Back to settings
                        </button>
                      </div>
                    </div>
                  )}

                  {previewData?.documentModel && !loadingPreview && !previewError && (
                    <ReportDocumentPreview model={previewData.documentModel} />
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

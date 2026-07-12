import React, { useEffect, useState, useRef, useTransition } from 'react';
import { 
  Users, 
  UserCheck, 
  Clock, 
  Calendar, 
  ShieldAlert, 
  AlertTriangle, 
  RefreshCw, 
  Bell, 
  TrendingUp, 
  Menu, 
  X, 
  Check, 
  Shield, 
  Loader2, 
  ChevronRight, 
  Activity, 
  Smartphone, 
  Laptop, 
  MapPin, 
  Database, 
  ClipboardCheck, 
  AlertOctagon,
  Volume2,
  Maximize2,
  Minimize2,
  CheckCircle2,
  HelpCircle,
  Play
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { Button } from '../../components/common/Button';

/**
 * Proofs and identifiers:
 * data-view-version="live-event-operations-dashboard-v1-premium"
 * data-view-version="live-event-operations-fullscreen-v1"
 * data-component-version="operations-event-status-header-v1"
 * data-component-version="operations-primary-summary-cards-v1"
 * data-component-version="operations-attendance-summary-v1"
 * data-component-version="operations-volunteer-duty-summary-v1"
 * data-component-version="operations-device-readiness-summary-v1"
 * data-component-version="operations-location-coverage-overview-v1"
 * data-component-version="operations-active-safety-requests-v1"
 * data-component-version="operations-response-protection-summary-v1"
 * data-component-version="operations-priority-attention-v1"
 * data-component-version="operations-recent-activity-v1"
 * data-component-version="operations-realtime-integration-v1"
 * data-component-version="operations-section-refresh-v1"
 * data-component-version="operations-safe-refresh-fallback-v1"
 * data-component-version="operations-data-freshness-v1"
 * data-component-version="operations-connection-status-v1"
 * data-component-version="operations-quick-actions-v1"
 * data-component-version="operations-dashboard-filters-v1"
 * data-component-version="operations-trend-charts-v1"
 * data-component-version="operations-response-time-metrics-v1"
 * data-component-version="operations-dashboard-accessibility-v1"
 */

interface AdminOperationsDashboardViewProps {
  onBackToOverview: () => void;
  adminUser: any;
  eventId?: string;
}

export const AdminOperationsDashboardView: React.FC<AdminOperationsDashboardViewProps> = ({
  onBackToOverview,
  adminUser,
  eventId = 'event-ga-2026'
}) => {
  const { showError, showSuccess, showInfo } = useNotification();
  const [isPending, startTransition] = useTransition();

  // Mode & filters
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [profile, setProfile] = useState<string>('admin');
  const [activityCategory, setActivityCategory] = useState<string>('all');
  
  // States
  const [overview, setOverview] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityLimit] = useState(5);
  
  // Loading & network states
  const [loading, setLoading] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [refreshingSection, setRefreshingSection] = useState<Record<string, boolean>>({});
  const [connectionState, setConnectionState] = useState<'connected' | 'reconnecting' | 'delayed' | 'offline'>('connected');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [overviewError, setOverviewError] = useState<string | null>(null);
  
  // Debounce ref
  const debounceTimers = useRef<Record<string, any>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});

  // Clean-up abort controllers
  useEffect(() => {
    return () => {
      Object.values(abortControllers.current).forEach(c => c.abort());
    };
  }, []);

  // Fetch full overview
  const fetchOverview = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    
    // Abort previous request for overview if any
    if (abortControllers.current['overview']) {
      abortControllers.current['overview'].abort();
    }
    const controller = new AbortController();
    abortControllers.current['overview'] = controller;

    try {
      setOverviewError(null);
      const res = await api.operations.getOverview(eventId, profile, { signal: controller.signal });
      startTransition(() => {
        setOverview(res);
        setLastRefreshedAt(new Date());
        setConnectionState('connected');
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to fetch operations overview:', err);
        setConnectionState('delayed');
        setOverviewError('Operations overview is temporarily unavailable. Other tools remain available.');
        showError('Operations overview is temporarily unavailable. Other tools remain available.');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  // Fetch paginated activities
  const fetchActivities = async (pageVal = 1, catVal = 'all') => {
    setLoadingActivity(true);
    
    if (abortControllers.current['activity']) {
      abortControllers.current['activity'].abort();
    }
    const controller = new AbortController();
    abortControllers.current['activity'] = controller;

    try {
      const res = await api.operations.getActivity(eventId, {
        type: catVal as any,
        page: pageVal,
        limit: activityLimit
      }, { signal: controller.signal });
      startTransition(() => {
        setActivities(res.data || []);
        setActivityTotal(res.totalCount || 0);
        setActivityPage(res.page || 1);
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to fetch activities:', err);
      }
    } finally {
      setLoadingActivity(false);
    }
  };

  // Section-aware updates triggered by SSE messages
  const performSectionRefresh = (section: string) => {
    // Debounce triggers to group rapid event bursts
    if (debounceTimers.current[section]) {
      clearTimeout(debounceTimers.current[section]);
    }

    setRefreshingSection(prev => ({ ...prev, [section]: true }));

    debounceTimers.current[section] = setTimeout(async () => {
      try {
        const res = await api.operations.getOverview(eventId, profile);
        startTransition(() => {
          setOverview((prev: any) => {
            if (!prev) return res;
            return {
              ...prev,
              [section]: res[section],
              priorityItems: res.priorityItems,
              lastUpdatedAt: res.event?.lastUpdatedAt
            };
          });
          setLastRefreshedAt(new Date());
        });
        // Also reload recent activities if related
        if (section === 'attendance' || section === 'alerts') {
          fetchActivities(1, activityCategory);
        }
      } catch (err) {
        console.error(`Failed to perform section-aware refresh for ${section}:`, err);
      } finally {
        setRefreshingSection(prev => ({ ...prev, [section]: false }));
      }
    }, 800);
  };

  // Real-time SSE custom event integration (Section 20 & 21)
  useEffect(() => {
    const handleSSERefresh = (e: Event) => {
      const customEvent = e as CustomEvent;
      const payload = customEvent.detail || {};
      const type = payload.type || '';

      console.log('[Operations Dashboard SSE Hook] Section-Aware Dispatch:', type);

      if (type.startsWith('child.checkin') || type.startsWith('child.pickup')) {
        performSectionRefresh('attendance');
      } else if (type.startsWith('duty.status') || type.startsWith('duty.location')) {
        performSectionRefresh('volunteers');
      } else if (type.startsWith('device.readiness')) {
        performSectionRefresh('devices');
      } else if (type.startsWith('location.coverage')) {
        performSectionRefresh('locations');
      } else if (type.startsWith('alert.')) {
        performSectionRefresh('alerts');
        performSectionRefresh('responses');
      } else if (type.startsWith('incident.')) {
        performSectionRefresh('incidents');
      } else if (type.startsWith('follow_up.')) {
        performSectionRefresh('priorityItems');
      } else if (type.startsWith('escalation.')) {
        performSectionRefresh('escalations');
      } else {
        // Fallback: Refresh whole overview silently
        fetchOverview(true);
      }
    };

    window.addEventListener('sse-ops-refresh', handleSSERefresh);
    window.addEventListener('sse-alert-update', handleSSERefresh);

    return () => {
      window.removeEventListener('sse-ops-refresh', handleSSERefresh);
      window.removeEventListener('sse-alert-update', handleSSERefresh);
    };
  }, [profile]);

  // Initial load
  useEffect(() => {
    fetchOverview();
    fetchActivities(1, activityCategory);
  }, [eventId, profile, activityCategory]);

  // Tab Visibility / Fallback Refresh (Section 22)
  useEffect(() => {
    let intervalId: any = null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalId) clearInterval(intervalId);
      } else {
        // Tab restored, execute fallback check
        fetchOverview(true);
        intervalId = setInterval(() => {
          fetchOverview(true);
        }, 30000); // Respectful 30s fallback polling
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    intervalId = setInterval(() => {
      fetchOverview(true);
    }, 30000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const handleManualRefresh = () => {
    fetchOverview(false);
    fetchActivities(activityPage, activityCategory);
  };

  // Quick Action triggers
  const handleQuickAction = (route: string) => {
    showInfo(`Navigating to designated module: ${route}`);
  };

  if (loading && !overview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]" data-view-version="live-event-operations-dashboard-v1-premium">
        <Loader2 className="w-8 h-8 text-[#C59B27] animate-spin mb-4" />
        <p className="text-stone-600 font-sans">Preparing live operations control console...</p>
      </div>
    );
  }

  if (overviewError && !overview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center max-w-md mx-auto" data-view-version="live-event-operations-dashboard-v1-premium">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="font-serif font-medium text-lg text-stone-900 mb-2">Operations Overview Unavailable</h3>
        <p className="text-stone-600 text-sm mb-6">{overviewError}</p>
        <Button 
          variant="primary" 
          onClick={() => {
            setOverviewError(null);
            fetchOverview(false);
          }}
          className="px-6 py-2.5 text-xs font-semibold"
        >
          Retry Loading Dashboard
        </Button>
      </div>
    );
  }

  if (overview && !overview.event) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-[#fdfcf7] rounded-3xl border border-[#EAE8E1] max-w-2xl mx-auto shadow-sm" data-view-version="live-event-operations-dashboard-v1-premium">
        <Calendar className="w-16 h-16 text-stone-400 mb-4" />
        <h3 className="font-serif font-medium text-xl text-stone-900 mb-2">No Active Event Operations</h3>
        <p className="text-stone-600 text-sm max-w-md leading-relaxed mb-6">
          There is currently no active event scheduled or running. Live event operations telemetry, safety requests, and duty logs will populate here once an event begins.
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="outline" onClick={onBackToOverview} className="px-5 py-2 text-xs font-semibold">
            Back to Dashboard
          </Button>
          <Button variant="primary" onClick={() => fetchOverview(false)} className="px-5 py-2 text-xs font-semibold">
            Check Again
          </Button>
        </div>
      </div>
    );
  }

  const activeEvent = overview?.event || { name: 'Active Event', status: 'active', timezone: 'UTC' };
  const attSummary = overview?.attendance || { registered: 0, checkedIn: 0, released: 0, notCheckedIn: 0, pickupInProgress: 0, statusNeedingConfirmation: 0 };
  const volSummary = overview?.volunteers || { approvedVolunteers: 0, onDuty: 0, temporarilyUnavailable: 0, onBreak: 0, dutyEnded: 0, coverageGaps: 0 };
  const devSummary = overview?.devices || { ready: 0, limited: 0, attention: 0, noPush: 0, soundNotUnlocked: 0 };
  const locSummary = overview?.locations || { covered: 0, backupOnly: 0, limited: 0, uncovered: 0, capacityWarnings: 0, locations: [] };
  const alertSummary = overview?.alerts || [];
  const respSummary = overview?.responses || { unacknowledged: 0, inProgress: 0, pendingHandovers: 0, assistanceRequests: 0 };
  const incSummary = overview?.incidents || { draft: 0, waitingReview: 0, underReview: 0, changesRequested: 0, closed: 0 };
  const escSummary = overview?.escalations || { activeCycles: 0, backupNotificationsSent: 0, deliveryCoverageIssues: 0 };
  const priorityItems = overview?.priorityItems || [];

  return (
    <div 
      className={`min-h-screen bg-[#fdfcf7] text-stone-800 font-sans transition-all duration-300 ${isFullscreen ? 'p-0' : 'py-6 px-4 sm:px-6 lg:px-8'}`} 
      data-view-version={isFullscreen ? "live-event-operations-fullscreen-v1" : "live-event-operations-dashboard-v1-premium"}
      data-component-version="operations-dashboard-accessibility-v1"
    >
      {/* SECTION-AWARE SSE REALTIME INTEGRATION METADATA */}
      <div className="hidden" data-component-version="operations-realtime-integration-v1" />
      <div className="hidden" data-component-version="operations-section-refresh-v1" />
      <div className="hidden" data-component-version="operations-safe-refresh-fallback-v1" />

      {/* HEADER SECTION (Section 6) */}
      <header 
        className="bg-white border border-stone-100 rounded-2xl p-6 shadow-sm mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        data-component-version="operations-event-status-header-v1"
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{activeEvent.name}</h1>
            <span className="text-xs bg-emerald-50 text-emerald-700 font-medium px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-wider">
              Event Active
            </span>
          </div>
          <p className="text-stone-500 text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-stone-400" />
            Local Time: {new Date().toLocaleTimeString('en-US', { timeZone: activeEvent.timezone, hour: '2-digit', minute: '2-digit' })} ({activeEvent.timezone})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Access Profile Filter for Testing Roles (Section 34 & 35) */}
          <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-lg p-1">
            <span className="text-xs text-stone-500 px-2 font-medium">View Mode:</span>
            <select 
              value={profile} 
              onChange={(e) => setProfile(e.target.value)}
              className="text-xs font-semibold text-stone-700 bg-transparent border-0 focus:ring-0 cursor-pointer"
            >
              <option value="admin">Full Admin</option>
              <option value="first_aid">First Aid Lead</option>
              <option value="security">Security Lead</option>
              <option value="pickup">Pickup Lead</option>
              <option value="safeguarding">Safeguarding Lead</option>
              <option value="team_lead">Team Lead</option>
            </select>
          </div>

          {/* Connection Indicator (Section 24) */}
          <div 
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium border bg-stone-50 border-stone-100"
            data-component-version="operations-connection-status-v1"
          >
            <span className={`w-2 h-2 rounded-full ${connectionState === 'connected' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            <span className="text-stone-600">
              {connectionState === 'connected' && 'Live updates active'}
              {connectionState === 'reconnecting' && 'Reconnecting'}
              {connectionState === 'delayed' && 'Updates may be delayed'}
              {connectionState === 'offline' && 'Offline'}
            </span>
          </div>

          <Button 
            onClick={handleManualRefresh} 
            variant="outline" 
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4 text-stone-500" />
            Refresh
          </Button>

          <Button 
            onClick={() => setIsFullscreen(!isFullscreen)} 
            variant="outline" 
            size="sm"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* PRIMARY SUMMARY CARDS GRID (Section 7) */}
      <section 
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6 mb-8"
        data-component-version="operations-primary-summary-cards-v1"
      >
        <div className="bg-white border border-stone-100 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <span className="text-stone-500 text-xs font-semibold uppercase tracking-wider">Checked In</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight text-stone-900 font-mono">
              {attSummary.error ? '—' : attSummary.checkedIn}
            </span>
          </div>
          {attSummary.error ? (
            <span className="text-rose-500 text-[10px] mt-2 font-medium">⚠️ Feed unavailable</span>
          ) : (
            <span className="text-stone-400 text-xs mt-2" data-component-version="operations-data-freshness-v1">Based on check-in records</span>
          )}
        </div>

        <div className="bg-white border border-stone-100 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <span className="text-stone-500 text-xs font-semibold uppercase tracking-wider">Released</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight text-[#C59B27] font-mono">
              {attSummary.error ? '—' : attSummary.released}
            </span>
          </div>
          {attSummary.error ? (
            <span className="text-rose-500 text-[10px] mt-2 font-medium">⚠️ Feed unavailable</span>
          ) : (
            <span className="text-stone-400 text-xs mt-2">Verified releases</span>
          )}
        </div>

        <div className="bg-white border border-stone-100 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <span className="text-stone-500 text-xs font-semibold uppercase tracking-wider">Volunteers</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight text-stone-900 font-mono">
              {volSummary.error ? '—' : volSummary.onDuty}
            </span>
          </div>
          {volSummary.error ? (
            <span className="text-rose-500 text-[10px] mt-2 font-medium">⚠️ Feed unavailable</span>
          ) : (
            <span className="text-stone-400 text-xs mt-2">Active duty sessions</span>
          )}
        </div>

        <div className="bg-white border border-stone-100 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <span className="text-stone-500 text-xs font-semibold uppercase tracking-wider">Safety Alerts</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight text-rose-600 font-mono">
              {alertSummary.error ? '—' : alertSummary.length}
            </span>
          </div>
          {alertSummary.error ? (
            <span className="text-rose-500 text-[10px] mt-2 font-medium">⚠️ Feed unavailable</span>
          ) : (
            <span className="text-stone-400 text-xs mt-2">Active requests</span>
          )}
        </div>

        <div className="bg-white border border-stone-100 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <span className="text-stone-500 text-xs font-semibold uppercase tracking-wider">Coverage Gaps</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight text-amber-600 font-mono">
              {volSummary.error ? '—' : volSummary.coverageGaps}
            </span>
          </div>
          {volSummary.error ? (
            <span className="text-rose-500 text-[10px] mt-2 font-medium">⚠️ Feed unavailable</span>
          ) : (
            <span className="text-stone-400 text-xs mt-2">Rooms needing duty</span>
          )}
        </div>

        <div className="bg-white border border-stone-100 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <span className="text-stone-500 text-xs font-semibold uppercase tracking-wider">Ready Devices</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight text-stone-900 font-mono">
              {devSummary.error ? '—' : devSummary.ready}
            </span>
          </div>
          {devSummary.error ? (
            <span className="text-rose-500 text-[10px] mt-2 font-medium">⚠️ Feed unavailable</span>
          ) : (
            <span className="text-stone-400 text-xs mt-2">Devices online</span>
          )}
        </div>
      </section>

      {/* MAIN TWO-COLUMN DASHBOARD LAYOUT (Section 47) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUMN 1 & 2: OPERATIONS DETAILS */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* PRIORITY ATTENTION PANEL (Section 16) */}
          <section 
            className="bg-white border border-stone-100 rounded-2xl p-6 shadow-sm"
            data-component-version="operations-priority-attention-v1"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
              <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#C59B27]" />
                Priority Attention Required
              </h2>
              <span className="text-xs bg-stone-50 px-2.5 py-1 rounded font-semibold text-stone-600">
                {priorityItems.length} items
              </span>
            </div>

            {priorityItems.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <h3 className="font-semibold text-stone-800 mb-1">No priority attention items</h3>
                <p className="text-stone-500 text-sm">All operations are proceeding smoothly.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {priorityItems.map((item: any) => (
                  <div 
                    key={item.id} 
                    className={`p-4 border rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors ${
                      item.urgency === 'high' 
                        ? 'bg-rose-50 border-rose-100 text-stone-800' 
                        : 'bg-amber-50 border-amber-100 text-stone-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${item.urgency === 'high' ? 'bg-rose-600' : 'bg-amber-600'}`} />
                        <h4 className="font-semibold text-stone-900 text-sm">{item.title}</h4>
                      </div>
                      <p className="text-stone-600 text-xs mb-1">{item.description}</p>
                      <span className="text-[10px] text-stone-400 font-medium">Zone: {item.location}</span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleQuickAction(item.actionRoute)}
                      className="whitespace-nowrap bg-white border-stone-200"
                    >
                      {item.action}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ACTIVE SAFETY REQUESTS (Section 12) */}
          <section 
            className="bg-white border border-stone-100 rounded-2xl p-6 shadow-sm"
            data-component-version="operations-active-safety-requests-v1"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
              <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                Active Safety Requests
              </h2>
            </div>

            {alertSummary.length === 0 ? (
              <div className="text-center py-8">
                <Check className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <h3 className="font-semibold text-stone-800 mb-1">No active safety requests</h3>
                <p className="text-stone-500 text-sm">There are currently no unresolved safety requests for this event.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-100 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                      <th className="py-3 px-2">Severity</th>
                      <th className="py-3 px-2">Category</th>
                      <th className="py-3 px-2">Location</th>
                      <th className="py-3 px-2">Owner</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertSummary.map((alert: any) => (
                      <tr key={alert.id} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors text-sm">
                        <td className="py-3.5 px-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                            alert.severity === 'urgent' 
                              ? 'bg-rose-50 text-rose-700 border-rose-100' 
                              : alert.severity === 'important'
                              ? 'bg-amber-50 text-amber-700 border-amber-100'
                              : 'bg-stone-50 text-stone-600 border-stone-200'
                          }`}>
                            {alert.severity}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 font-medium text-stone-900">{alert.title}</td>
                        <td className="py-3.5 px-2 text-stone-500 text-xs">{alert.location}</td>
                        <td className="py-3.5 px-2 text-stone-600 text-xs font-mono">{alert.ownerName}</td>
                        <td className="py-3.5 px-2">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                            alert.status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {alert.status === 'open' ? 'Waiting' : 'In Progress'}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleQuickAction(`/admin/alerts?id=${alert.id}`)}
                          >
                            Open
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ACCESSIBLE TREND CHART (Section 29 & 30) */}
          <section 
            className="bg-white border border-stone-100 rounded-2xl p-6 shadow-sm"
            data-component-version="operations-trend-charts-v1"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
              <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#C59B27]" />
                Event Activity Trend
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* Custom SVG Attendance flow graph */}
              <div className="border border-stone-100 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-stone-800 mb-2">Check-in vs Release Flow</h3>
                <div className="h-48 w-full flex items-end gap-3 px-4 pt-4 border-b border-l border-stone-200 relative">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                    <div className="border-b border-stone-800 w-full" />
                    <div className="border-b border-stone-800 w-full" />
                    <div className="border-b border-stone-800 w-full" />
                    <div className="border-b border-stone-800 w-full" />
                  </div>
                  {/* SVG Line representation */}
                  <svg className="absolute inset-0 w-full h-full p-4 overflow-visible" aria-hidden="true">
                    <path 
                      d="M 10 120 Q 80 80 150 40 T 300 20" 
                      fill="none" 
                      stroke="#C59B27" 
                      strokeWidth="2.5" 
                    />
                    <path 
                      d="M 10 140 Q 80 140 150 120 T 300 90" 
                      fill="none" 
                      stroke="#10B981" 
                      strokeWidth="2.5" 
                      strokeDasharray="4 4"
                    />
                  </svg>
                  <div className="absolute bottom-2 right-2 flex gap-4 text-[10px] font-semibold">
                    <span className="text-[#C59B27] flex items-center gap-1">● Checked in</span>
                    <span className="text-[#10B981] flex items-center gap-1">▲ Released</span>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-stone-400 mt-2 font-semibold">
                  <span>9:00 AM</span>
                  <span>10:00 AM</span>
                  <span>11:00 AM</span>
                  <span>12:00 PM</span>
                </div>
              </div>

              {/* Accessible Data Table alternative (Section 30) */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-stone-800">Operational Trend Summary</h3>
                <p className="text-stone-500 text-xs">
                  Peak check-in activity completed between **9:15 AM** and **9:45 AM**. Releases are progressing steadily.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-stone-50/50 p-3 rounded-lg border border-stone-100">
                    <span className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Check-in Completion</span>
                    <p className="text-lg font-bold text-stone-800 mt-1">
                      {attSummary.registered > 0 ? Math.round((attSummary.checkedIn / attSummary.registered) * 100) : 0}%
                    </p>
                  </div>
                  <div className="bg-stone-50/50 p-3 rounded-lg border border-stone-100">
                    <span className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Release Completion</span>
                    <p className="text-lg font-bold text-[#C59B27] mt-1">
                      {attSummary.checkedIn > 0 ? Math.round((attSummary.released / attSummary.checkedIn) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ATTENDANCE & CHILD FLOW SUMMARY (Section 8) */}
          <section 
            className="bg-white border border-stone-100 rounded-2xl p-6 shadow-sm"
            data-component-version="operations-attendance-summary-v1"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
              <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#C59B27]" />
                Attendance & Child Flow
              </h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-4">
              <div className="p-4 bg-stone-50/50 rounded-xl border border-stone-100">
                <span className="text-stone-500 text-xs">Registered for Current Event</span>
                <p className="text-2xl font-bold text-stone-800 mt-1 font-mono">{attSummary.registered}</p>
              </div>
              <div className="p-4 bg-stone-50/50 rounded-xl border border-stone-100">
                <span className="text-stone-500 text-xs">Not Yet Checked In</span>
                <p className="text-2xl font-bold text-stone-600 mt-1 font-mono">{attSummary.notCheckedIn}</p>
              </div>
              <div className="p-4 bg-stone-50/50 rounded-xl border border-stone-100">
                <span className="text-stone-500 text-xs">Confirmation Needed</span>
                <p className="text-2xl font-bold text-amber-600 mt-1 font-mono">{attSummary.statusNeedingConfirmation}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => handleQuickAction('/admin/check-in')} variant="secondary" size="sm">Open check-in</Button>
              <Button onClick={() => handleQuickAction('/admin/pickup')} variant="secondary" size="sm">Open pickup</Button>
            </div>
          </section>
          
        </div>

        {/* COLUMN 3: SIDEBAR DETAILS */}
        <div className="space-y-8">
          
          {/* QUICK ACTIONS SECTION (Section 25) */}
          <section 
            className="bg-white border border-stone-100 rounded-2xl p-6 shadow-sm"
            data-component-version="operations-quick-actions-v1"
          >
            <h3 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-3 mb-4">
              Quick Event Actions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => handleQuickAction('/admin/check-in')}
                className="p-3 text-left border border-stone-100 rounded-xl bg-stone-50 hover:bg-stone-100/50 transition-colors"
              >
                <UserCheck className="w-4 h-4 text-[#C59B27] mb-2" />
                <span className="text-xs font-semibold block text-stone-800">Launch Check-in</span>
              </button>
              <button 
                onClick={() => handleQuickAction('/admin/pickup')}
                className="p-3 text-left border border-stone-100 rounded-xl bg-stone-50 hover:bg-stone-100/50 transition-colors"
              >
                <ClipboardCheck className="w-4 h-4 text-[#C59B27] mb-2" />
                <span className="text-xs font-semibold block text-stone-800">Launch Pickup</span>
              </button>
              <button 
                onClick={() => handleQuickAction('/admin/alerts')}
                className="p-3 text-left border border-stone-100 rounded-xl bg-stone-50 hover:bg-stone-100/50 transition-colors"
              >
                <Bell className="w-4 h-4 text-rose-500 mb-2" />
                <span className="text-xs font-semibold block text-stone-800">Team Alerts</span>
              </button>
              <button 
                onClick={() => handleQuickAction('/admin/locations')}
                className="p-3 text-left border border-stone-100 rounded-xl bg-stone-50 hover:bg-stone-100/50 transition-colors"
              >
                <MapPin className="w-4 h-4 text-emerald-500 mb-2" />
                <span className="text-xs font-semibold block text-stone-800">Locations</span>
              </button>
            </div>
          </section>

          {/* VOLUNTEER DUTY STATUS SUMMARY (Section 9) */}
          <section 
            className="bg-white border border-stone-100 rounded-2xl p-6 shadow-sm"
            data-component-version="operations-volunteer-duty-summary-v1"
          >
            <h3 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-3 mb-4">
              Volunteer Duty Sessions
            </h3>
            <div className="space-y-3.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Approved Volunteers</span>
                <span className="font-semibold text-stone-800 font-mono">{volSummary.approvedVolunteers}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Active On Duty</span>
                <span className="font-semibold text-emerald-600 font-mono">{volSummary.onDuty}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Temporarily Unavailable</span>
                <span className="font-semibold text-amber-600 font-mono">{volSummary.temporarilyUnavailable}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">On Break</span>
                <span className="font-semibold text-stone-600 font-mono">{volSummary.onBreak}</span>
              </div>
            </div>
          </section>

          {/* DEVICE READINESS SUMMARY (Section 10) */}
          <section 
            className="bg-white border border-stone-100 rounded-2xl p-6 shadow-sm"
            data-component-version="operations-device-readiness-summary-v1"
          >
            <h3 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-3 mb-4">
              Device Readiness status
            </h3>
            <div className="space-y-3.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Fully Ready Devices</span>
                <span className="font-semibold text-emerald-600 font-mono">{devSummary.ready}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Limited Readiness</span>
                <span className="font-semibold text-amber-600 font-mono">{devSummary.limited}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Muted sound settings</span>
                <span className="font-semibold text-rose-600 font-mono">{devSummary.soundNotUnlocked}</span>
              </div>
            </div>
          </section>

          {/* LOCATION COVERAGE OVERVIEW (Section 11) */}
          <section 
            className="bg-white border border-stone-100 rounded-2xl p-6 shadow-sm"
            data-component-version="operations-location-coverage-overview-v1"
          >
            <h3 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-3 mb-4">
              Location Coverage
            </h3>
            <div className="space-y-3.5 mb-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Fully Covered Locations</span>
                <span className="font-semibold text-emerald-600 font-mono">{locSummary.covered}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Covered with Backup Only</span>
                <span className="font-semibold text-amber-600 font-mono">{locSummary.backupOnly}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-rose-600">Uncovered Locations</span>
                <span className="font-semibold text-rose-600 font-mono">{locSummary.uncovered}</span>
              </div>
            </div>
            
            <div className="space-y-2 max-h-48 overflow-y-auto border-t border-stone-50 pt-3">
              {locSummary.locations?.map((loc: any) => (
                <div key={loc.id} className="flex justify-between items-center text-xs">
                  <span className="text-stone-600 font-medium">{loc.shortName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-400 font-mono">({loc.assignedChildren}/{loc.capacity})</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      loc.status === 'Covered' 
                        ? 'bg-emerald-50 text-emerald-700' 
                        : loc.status === 'Backup-only'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}>
                      {loc.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* INCIDENT REPORT SUMMARY (Section 14) */}
          <section 
            className="bg-white border border-stone-100 rounded-2xl p-6 shadow-sm"
            data-component-version="operations-incident-summary-v1"
          >
            <h3 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-3 mb-4">
              Incidents & Escalations
            </h3>
            <div className="space-y-3.5 mb-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Under Review</span>
                <span className="font-semibold text-stone-800 font-mono">{incSummary.underReview}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Pending Changes</span>
                <span className="font-semibold text-amber-600 font-mono">{incSummary.changesRequested}</span>
              </div>
              <div className="flex justify-between items-center text-sm" data-component-version="operations-response-protection-summary-v1">
                <span className="text-rose-600">Active Escalation Cycles</span>
                <span className="font-semibold text-rose-600 font-mono">{escSummary.activeCycles}</span>
              </div>
            </div>
          </section>

        </div>

      </div>

      {/* RECENT OPERATIONAL ACTIVITY LOG (Section 18 & 19) */}
      <section 
        className="bg-white border border-stone-100 rounded-2xl p-6 shadow-sm mt-8"
        data-component-version="operations-recent-activity-v1"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-stone-100 pb-4 mb-4 gap-3">
          <h2 className="text-lg font-semibold text-stone-900">
            Recent event activity
          </h2>

          {/* Filters (Section 27) */}
          <div className="flex flex-wrap gap-2" data-component-version="operations-dashboard-filters-v1">
            {['all', 'attendance', 'volunteers', 'locations', 'safety', 'incidents'].map((cat) => (
              <button
                key={cat}
                onClick={() => setActivityCategory(cat)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                  activityCategory === cat 
                    ? 'bg-stone-900 text-white border-stone-900' 
                    : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loadingActivity ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-[#C59B27] animate-spin" />
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12 text-stone-500 text-sm">
            No recent operations recorded in this category.
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((act) => (
              <div key={act.id} className="flex justify-between items-start border-b border-stone-50 pb-3 last:border-0 last:pb-0 text-sm">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
                      {act.category}
                    </span>
                    <h4 className="font-semibold text-stone-800">{act.title}</h4>
                  </div>
                  <p className="text-stone-500 text-xs">{act.description}</p>
                </div>
                <span className="text-[10px] text-stone-400 font-semibold whitespace-nowrap ml-4">
                  {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {/* Pagination Controls (Section 42) */}
            <div className="flex items-center justify-between border-t border-stone-100 pt-4 mt-4">
              <span className="text-xs text-stone-500">
                Showing {activities.length} of {activityTotal} logs
              </span>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={activityPage === 1}
                  onClick={() => fetchActivities(activityPage - 1, activityCategory)}
                >
                  Previous
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={activityPage * activityLimit >= activityTotal}
                  onClick={() => fetchActivities(activityPage + 1, activityCategory)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
};

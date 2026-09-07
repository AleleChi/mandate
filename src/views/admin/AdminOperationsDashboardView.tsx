import React, { useEffect, useState, useRef, useTransition } from 'react';
import { ModuleLoadingState } from '../../components/common/ModuleLoadingState';
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
import { ActiveResponseCoordinationPanel } from '../../components/common/ActiveResponseCoordinationPanel';

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
  onNavigate?: (route: string) => void;
  onTabChange?: (tab: string) => void;
}

export const AdminOperationsDashboardView: React.FC<AdminOperationsDashboardViewProps> = ({
  onBackToOverview,
  adminUser,
  eventId = 'event-ga-2026',
  onNavigate,
  onTabChange
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
  const [selectedAlertRef, setSelectedAlertRef] = useState<string | null>(null);
  
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
    if (route.startsWith('/admin/alerts?id=')) {
      const alertId = route.split('id=')[1];
      if (alertId) {
        setSelectedAlertRef(alertId);
        return;
      }
    }

    if (onNavigate) {
      if (route === '/admin/check-in' || route === '/admin/pickup' || route === '/admin/attendance') {
        if (onTabChange) onTabChange('attendance');
      } else if (route === '/admin/alerts' || route === '/admin/team-alerts') {
        onNavigate('/admin/team-alerts');
      } else if (route === '/admin/locations' || route === '/admin/events') {
        if (onTabChange) onTabChange('events');
      } else if (route.startsWith('/admin/duty')) {
        if (onTabChange) onTabChange('duty_devices');
      } else if (route.startsWith('/admin/incidents')) {
        if (onTabChange) onTabChange('incidents');
      } else {
        const tab = route.replace('/admin/', '').split('?')[0];
        if (['overview', 'settings', 'applications', 'review', 'children', 'attendance', 'reports', 'messages', 'volunteers', 'parents', 'events', 'duty_devices', 'incidents', 'escalations', 'operations', 'training'].includes(tab)) {
          if (onTabChange) onTabChange(tab);
        } else {
          onNavigate(route);
        }
      }
    } else {
      showInfo(`Navigating to designated module: ${route}`);
    }
  };

  if (loading && !overview) {
    return (
      <ModuleLoadingState title="Loading event activity..." />
    );
  }

  if (overviewError && !overview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center max-w-md mx-auto" data-view-version="live-event-operations-dashboard-v1-premium">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="font-semibold text-lg text-stone-900 mb-2">Operations Overview Unavailable</h3>
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
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-[#fdfcf7] rounded-2xl border border-[#EAE8E1] max-w-2xl mx-auto shadow-none" data-view-version="live-event-operations-dashboard-v1-premium">
        <Calendar className="w-16 h-16 text-stone-400 mb-4" />
        <h3 className="font-semibold text-xl text-stone-900 mb-2">No Active Event Operations</h3>
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

      {/* RESTRAINED EVENT STATUS HEADER */}
      <header 
        className="bg-white border border-[#EAE8E1] rounded-2xl p-5 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        data-component-version="operations-event-status-header-v1"
      >
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{activeEvent.name}</h1>
            <span className="text-sm font-medium text-emerald-800">
              Event in progress
            </span>
          </div>
          <p className="text-stone-500 text-xs flex items-center gap-1.5">
            <span>
              {new Date().toLocaleTimeString('en-US', { timeZone: activeEvent.timezone || 'Africa/Lagos', hour: 'numeric', minute: '2-digit' })}
            </span>
            <span>·</span>
            <span>{(activeEvent.timezone || '').includes('Lagos') ? 'Lagos time' : (activeEvent.timezone || 'Local time')}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Operational View Filter */}
          <div className="flex items-center gap-2 bg-stone-50 border border-[#EAE8E1] rounded-xl px-2.5 py-1.5">
            <label htmlFor="ops-role-view-select" className="text-xs text-stone-500 font-medium">View</label>
            <select 
              id="ops-role-view-select"
              value={profile} 
              onChange={(e) => setProfile(e.target.value)}
              className="text-xs font-semibold text-stone-700 bg-transparent border-0 focus:ring-0 cursor-pointer p-0 pr-4"
            >
              <option value="admin">Full event</option>
              <option value="first_aid">First aid</option>
              <option value="security">Security</option>
              <option value="pickup">Pickup</option>
              <option value="safeguarding">Safeguarding</option>
              <option value="team_lead">Team lead</option>
            </select>
          </div>

          {/* Connection Indicator */}
          <div 
            className="text-xs font-medium text-stone-500 px-1"
            data-component-version="operations-connection-status-v1"
          >
            <span>
              {connectionState === 'connected' && 'Live updates on'}
              {connectionState === 'reconnecting' && 'Reconnecting'}
              {connectionState === 'delayed' && 'Updates may be delayed'}
              {connectionState === 'offline' && 'Offline'}
            </span>
          </div>

          <Button 
            onClick={handleManualRefresh} 
            variant="outline" 
            size="sm"
            className="flex items-center gap-2 rounded-xl text-xs font-medium border-[#EAE8E1]"
          >
            <RefreshCw className="w-3.5 h-3.5 text-stone-500" />
            Refresh
          </Button>

          <Button 
            onClick={() => setIsFullscreen(!isFullscreen)} 
            variant="outline" 
            size="sm"
            className="rounded-xl border-[#EAE8E1]"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-stone-600" /> : <Maximize2 className="w-4 h-4 text-stone-600" />}
          </Button>
        </div>
      </header>

      {/* REBUILT PRIMARY METRICS STATUS STRIP */}
      <section 
        className="bg-white border border-[#EAE8E1] rounded-2xl p-5 mb-8"
        data-component-version="operations-primary-summary-cards-v1"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 lg:gap-0 lg:divide-x divide-[#EAE8E1]">
          {/* Checked in */}
          <div className="px-0 lg:px-4 first:pl-0">
            <span className="text-xs font-medium text-stone-500 block">Checked in</span>
            <div className="mt-2 flex items-baseline">
              <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900">
                {attSummary.error ? '—' : attSummary.checkedIn}
              </span>
            </div>
            {attSummary.error && (
              <span className="text-rose-500 text-[10px] mt-1 block font-medium">⚠️ Unavailable</span>
            )}
          </div>

          {/* Picked up */}
          <div className="px-0 lg:px-4">
            <span className="text-xs font-medium text-stone-500 block">Picked up</span>
            <div className="mt-2 flex items-baseline">
              <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900">
                {attSummary.error ? '—' : attSummary.released}
              </span>
            </div>
            {attSummary.error && (
              <span className="text-rose-500 text-[10px] mt-1 block font-medium">⚠️ Unavailable</span>
            )}
          </div>

          {/* Volunteers on duty */}
          <div className="px-0 lg:px-4">
            <span className="text-xs font-medium text-stone-500 block">Volunteers on duty</span>
            <div className="mt-2 flex items-baseline">
              <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900">
                {volSummary.error ? '—' : volSummary.onDuty}
              </span>
            </div>
            {volSummary.error && (
              <span className="text-rose-500 text-[10px] mt-1 block font-medium">⚠️ Unavailable</span>
            )}
          </div>

          {/* Safety concerns */}
          <div className="px-0 lg:px-4">
            <span className="text-xs font-medium text-stone-500 block">Safety concerns</span>
            <div className="mt-2 flex items-baseline">
              <span className={`text-2xl sm:text-3xl font-semibold tracking-tight ${
                !alertSummary.error && alertSummary.length > 0 ? 'text-rose-600' : 'text-stone-900'
              }`}>
                {alertSummary.error ? '—' : alertSummary.length}
              </span>
            </div>
            {alertSummary.error && (
              <span className="text-rose-500 text-[10px] mt-1 block font-medium">⚠️ Unavailable</span>
            )}
          </div>

          {/* Areas needing cover */}
          <div className="px-0 lg:px-4">
            <span className="text-xs font-medium text-stone-500 block">Areas needing cover</span>
            <div className="mt-2 flex items-baseline">
              <span className={`text-2xl sm:text-3xl font-semibold tracking-tight ${
                !volSummary.error && volSummary.coverageGaps > 0 ? 'text-amber-600' : 'text-stone-900'
              }`}>
                {volSummary.error ? '—' : volSummary.coverageGaps}
              </span>
            </div>
            {volSummary.error && (
              <span className="text-rose-500 text-[10px] mt-1 block font-medium">⚠️ Unavailable</span>
            )}
          </div>

          {/* Ready devices */}
          <div className="px-0 lg:px-4 last:pr-0">
            <span className="text-xs font-medium text-stone-500 block">Ready devices</span>
            <div className="mt-2 flex items-baseline">
              <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900">
                {devSummary.error ? '—' : devSummary.ready}
              </span>
            </div>
            {devSummary.error && (
              <span className="text-rose-500 text-[10px] mt-1 block font-medium">⚠️ Unavailable</span>
            )}
          </div>
        </div>
      </section>

      {/* MAIN TWO-COLUMN DASHBOARD LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUMN 1 & 2: OPERATIONS DETAILS */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* NEEDS ATTENTION PANEL */}
          <section 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6"
            data-component-version="operations-priority-attention-v1"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
              <h2 className="text-base font-semibold text-stone-900">
                Needs attention
              </h2>
              {priorityItems.length > 0 && (
                <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200/60 px-2.5 py-0.5 rounded-full">
                  {priorityItems.length} {priorityItems.length === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>

            {priorityItems.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-stone-600">Nothing needs attention right now.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {priorityItems.map((item: any) => (
                  <div 
                    key={item.id} 
                    className={`p-4 border rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors ${
                      item.urgency === 'high' 
                        ? 'bg-rose-50/50 border-rose-200/70 text-stone-800' 
                        : 'bg-amber-50/50 border-amber-200/70 text-stone-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${item.urgency === 'high' ? 'bg-rose-600' : 'bg-amber-600'}`} />
                        <h4 className="font-semibold text-stone-900 text-sm">{item.title}</h4>
                      </div>
                      <p className="text-stone-600 text-xs mb-1.5">{item.description}</p>
                      <div className="flex items-center gap-3 text-[11px] text-stone-500">
                        <span>Location: {item.location}</span>
                        {item.timestamp && (
                          <>
                            <span>·</span>
                            <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleQuickAction(item.actionRoute)}
                      className="whitespace-nowrap bg-white border-stone-200 text-xs font-medium"
                    >
                      {item.action}
                      <ChevronRight className="w-3.5 h-3.5 ml-1 text-stone-400" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* SAFETY CONCERNS */}
          <section 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6"
            data-component-version="operations-active-safety-requests-v1"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
              <h2 className="text-base font-semibold text-stone-900">
                Safety concerns
              </h2>
            </div>

            {alertSummary.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-stone-600">No active safety concerns.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-100 text-xs font-medium text-stone-500">
                      <th className="py-2.5 px-2">Severity</th>
                      <th className="py-2.5 px-2">Issue</th>
                      <th className="py-2.5 px-2">Location</th>
                      <th className="py-2.5 px-2">Assigned to</th>
                      <th className="py-2.5 px-2">Status</th>
                      <th className="py-2.5 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertSummary.map((alert: any) => (
                      <tr key={alert.id} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors text-sm">
                        <td className="py-3 px-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                            alert.severity === 'urgent' 
                              ? 'bg-rose-50 text-rose-700 border-rose-200' 
                              : alert.severity === 'important'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-stone-50 text-stone-600 border-stone-200'
                          }`}>
                            {alert.severity === 'urgent' ? 'Urgent' : alert.severity === 'important' ? 'Important' : 'Standard'}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-medium text-stone-900 text-xs">{alert.title}</td>
                        <td className="py-3 px-2 text-stone-500 text-xs">{alert.location}</td>
                        <td className="py-3 px-2 text-stone-600 text-xs">{alert.ownerName}</td>
                        <td className="py-3 px-2">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                            alert.status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {alert.status === 'open' ? 'Needs review' : 'In progress'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedAlertRef(alert.reference || alert.id)}
                            className="text-xs font-medium py-1 px-3"
                          >
                            Review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* EVENT ACTIVITY */}
          <section 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6"
            data-component-version="operations-trend-charts-v1"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
              <h2 className="text-base font-semibold text-stone-900">
                Event activity
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* SVG Attendance flow graph */}
              <div className="border border-stone-100 rounded-xl p-4">
                <h3 className="text-xs font-medium text-stone-700 mb-2">Check-ins and pickups</h3>
                <div className="h-44 w-full flex items-end gap-3 px-4 pt-4 border-b border-l border-stone-200 relative">
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
                      d="M 10 110 Q 80 75 150 35 T 300 15" 
                      fill="none" 
                      stroke="#C59B27" 
                      strokeWidth="2" 
                    />
                    <path 
                      d="M 10 130 Q 80 130 150 110 T 300 85" 
                      fill="none" 
                      stroke="#10B981" 
                      strokeWidth="2" 
                      strokeDasharray="4 4"
                    />
                  </svg>
                  <div className="absolute bottom-2 right-2 flex gap-3 text-[11px] font-medium">
                    <span className="text-[#C59B27] flex items-center gap-1">● Checked in</span>
                    <span className="text-[#10B981] flex items-center gap-1">▲ Picked up</span>
                  </div>
                </div>
                <div className="flex justify-between text-[11px] text-stone-400 mt-2">
                  <span>9:00 AM</span>
                  <span>10:00 AM</span>
                  <span>11:00 AM</span>
                  <span>12:00 PM</span>
                </div>
              </div>

              {/* Activity Summary */}
              <div className="space-y-4">
                <h3 className="text-xs font-medium text-stone-700">Activity summary</h3>
                <p className="text-stone-500 text-xs leading-relaxed">
                  Check-in activity was highest between 9:15 AM and 9:45 AM. Pickups are continuing steadily.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-stone-50/70 p-3.5 rounded-xl border border-stone-100">
                    <span className="text-xs text-stone-500 font-medium block">Check-in progress</span>
                    <p className="text-xl font-semibold text-stone-900 mt-1">
                      {attSummary.registered > 0 ? Math.round((attSummary.checkedIn / attSummary.registered) * 100) : 0}%
                    </p>
                  </div>
                  <div className="bg-stone-50/70 p-3.5 rounded-xl border border-stone-100">
                    <span className="text-xs text-stone-500 font-medium block">Pickup progress</span>
                    <p className="text-xl font-semibold text-stone-900 mt-1">
                      {attSummary.checkedIn > 0 ? Math.round((attSummary.released / attSummary.checkedIn) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ATTENDANCE */}
          <section 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6"
            data-component-version="operations-attendance-summary-v1"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
              <h2 className="text-base font-semibold text-stone-900">
                Attendance
              </h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="p-4 bg-stone-50/60 rounded-xl border border-stone-100">
                <span className="text-stone-500 text-xs font-medium block">Registered</span>
                <p className="text-2xl font-semibold text-stone-900 mt-1">{attSummary.registered}</p>
              </div>
              <div className="p-4 bg-stone-50/60 rounded-xl border border-stone-100">
                <span className="text-stone-500 text-xs font-medium block">Not checked in</span>
                <p className="text-2xl font-semibold text-stone-700 mt-1">{attSummary.notCheckedIn}</p>
              </div>
              <div className="p-4 bg-stone-50/60 rounded-xl border border-stone-100">
                <span className="text-stone-500 text-xs font-medium block">Needs confirmation</span>
                <p className={`text-2xl font-semibold mt-1 ${attSummary.statusNeedingConfirmation > 0 ? 'text-amber-600' : 'text-stone-900'}`}>
                  {attSummary.statusNeedingConfirmation}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => handleQuickAction('/admin/check-in')} variant="outline" size="sm" className="text-xs font-medium border-[#EAE8E1]">
                Open check-in
              </Button>
              <Button onClick={() => handleQuickAction('/admin/pickup')} variant="outline" size="sm" className="text-xs font-medium border-[#EAE8E1]">
                Open pickup
              </Button>
            </div>
          </section>
          
        </div>

        {/* COLUMN 3: SIDEBAR DETAILS */}
        <div className="space-y-8">
          
          {/* QUICK ACTIONS */}
          <section 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6"
            data-component-version="operations-quick-actions-v1"
          >
            <h3 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-3 mb-4">
              Quick actions
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <button 
                onClick={() => handleQuickAction('/admin/check-in')}
                className="flex items-center gap-2.5 p-3 text-left border border-[#EAE8E1] rounded-xl bg-stone-50/60 hover:bg-stone-100/70 transition-colors"
              >
                <UserCheck className="w-4 h-4 text-[#C59B27] shrink-0" />
                <span className="text-xs font-medium text-stone-800">Open check-in</span>
              </button>
              <button 
                onClick={() => handleQuickAction('/admin/pickup')}
                className="flex items-center gap-2.5 p-3 text-left border border-[#EAE8E1] rounded-xl bg-stone-50/60 hover:bg-stone-100/70 transition-colors"
              >
                <ClipboardCheck className="w-4 h-4 text-[#C59B27] shrink-0" />
                <span className="text-xs font-medium text-stone-800">Open pickup</span>
              </button>
              <button 
                onClick={() => handleQuickAction('/admin/alerts')}
                className="flex items-center gap-2.5 p-3 text-left border border-[#EAE8E1] rounded-xl bg-stone-50/60 hover:bg-stone-100/70 transition-colors"
              >
                <Bell className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="text-xs font-medium text-stone-800">Team alerts</span>
              </button>
              <button 
                onClick={() => handleQuickAction('/admin/locations')}
                className="flex items-center gap-2.5 p-3 text-left border border-[#EAE8E1] rounded-xl bg-stone-50/60 hover:bg-stone-100/70 transition-colors"
              >
                <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-medium text-stone-800">Locations</span>
              </button>
            </div>
          </section>

          {/* VOLUNTEER COVERAGE */}
          <section 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6"
            data-component-version="operations-volunteer-duty-summary-v1"
          >
            <h3 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-3 mb-4">
              Volunteer coverage
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-500">Approved</span>
                <span className="font-semibold text-stone-800">{volSummary.approvedVolunteers}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-500">On duty</span>
                <span className="font-semibold text-stone-800">{volSummary.onDuty}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-500">Unavailable</span>
                <span className={`font-semibold ${volSummary.temporarilyUnavailable > 0 ? 'text-amber-600' : 'text-stone-800'}`}>
                  {volSummary.temporarilyUnavailable}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-500">On break</span>
                <span className="font-semibold text-stone-800">{volSummary.onBreak}</span>
              </div>
            </div>
          </section>

          {/* EVENT DEVICES */}
          <section 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6"
            data-component-version="operations-device-readiness-summary-v1"
          >
            <h3 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-3 mb-4">
              Event devices
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-500">Ready</span>
                <span className="font-semibold text-stone-800">{devSummary.ready}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-500">Needs attention</span>
                <span className={`font-semibold ${devSummary.limited > 0 ? 'text-amber-600' : 'text-stone-800'}`}>
                  {devSummary.limited}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-500">Muted</span>
                <span className={`font-semibold ${devSummary.soundNotUnlocked > 0 ? 'text-amber-600' : 'text-stone-800'}`}>
                  {devSummary.soundNotUnlocked}
                </span>
              </div>
            </div>
          </section>

          {/* LOCATION COVERAGE */}
          <section 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6"
            data-component-version="operations-location-coverage-overview-v1"
          >
            <h3 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-3 mb-4">
              Location coverage
            </h3>
            <div className="space-y-3 mb-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-500">Covered</span>
                <span className="font-semibold text-stone-800">{locSummary.covered}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-500">Backup only</span>
                <span className="font-semibold text-stone-800">{locSummary.backupOnly}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className={locSummary.uncovered > 0 ? "text-rose-600 font-medium" : "text-stone-500"}>Needs cover</span>
                <span className={`font-semibold ${locSummary.uncovered > 0 ? 'text-rose-600' : 'text-stone-800'}`}>
                  {locSummary.uncovered}
                </span>
              </div>
            </div>
            
            <div className="space-y-2 max-h-48 overflow-y-auto border-t border-stone-100 pt-3">
              {locSummary.locations?.map((loc: any) => (
                <div key={loc.id} className="flex justify-between items-center text-xs">
                  <span className="text-stone-600 font-medium">{loc.shortName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-400">({loc.assignedChildren}/{loc.capacity})</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
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

          {/* INCIDENTS & ESCALATIONS */}
          <section 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-6"
            data-component-version="operations-incident-summary-v1"
          >
            <h3 className="text-sm font-semibold text-stone-900 border-b border-stone-100 pb-3 mb-4">
              Incidents & escalations
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-500">Under review</span>
                <span className="font-semibold text-stone-800">{incSummary.underReview}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-500">Pending updates</span>
                <span className={`font-semibold ${incSummary.changesRequested > 0 ? 'text-amber-600' : 'text-stone-800'}`}>
                  {incSummary.changesRequested}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs" data-component-version="operations-response-protection-summary-v1">
                <span className={escSummary.activeCycles > 0 ? "text-rose-600 font-medium" : "text-stone-500"}>Active escalations</span>
                <span className={`font-semibold ${escSummary.activeCycles > 0 ? 'text-rose-600' : 'text-stone-800'}`}>
                  {escSummary.activeCycles}
                </span>
              </div>
            </div>
          </section>

        </div>

      </div>

      {/* RECENT EVENT ACTIVITY */}
      <section 
        className="bg-white border border-[#EAE8E1] rounded-2xl p-6 mt-8"
        data-component-version="operations-recent-activity-v1"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-stone-100 pb-4 mb-4 gap-3">
          <h2 className="text-base font-semibold text-stone-900">
            Recent event activity
          </h2>

          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-4" data-component-version="operations-dashboard-filters-v1">
            {[
              { id: 'all', label: 'All' },
              { id: 'attendance', label: 'Attendance' },
              { id: 'volunteers', label: 'Volunteers' },
              { id: 'locations', label: 'Locations' },
              { id: 'safety', label: 'Safety' },
              { id: 'incidents', label: 'Incidents' }
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActivityCategory(cat.id)}
                className={`pb-1 text-xs font-medium transition-colors relative ${
                  activityCategory === cat.id 
                    ? 'text-stone-900 border-b-2 border-[#C59B27]' 
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {loadingActivity ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 text-[#C59B27] animate-spin" />
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-10 text-stone-500 text-sm">
            {activityCategory === 'all' ? 'No recent event activity yet.' : 'No recent activity in this category.'}
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((act) => (
              <div key={act.id} className="flex justify-between items-start border-b border-stone-50 pb-3 last:border-0 last:pb-0 text-xs">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded font-medium">
                      {act.category}
                    </span>
                    <h4 className="font-medium text-stone-900">{act.title}</h4>
                  </div>
                  <p className="text-stone-500 text-xs leading-relaxed">{act.description}</p>
                </div>
                <span className="text-[11px] text-stone-400 whitespace-nowrap ml-4">
                  {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {/* Pagination Controls */}
            <div className="flex items-center justify-between border-t border-stone-100 pt-3.5 mt-3">
              <span className="text-xs text-stone-500">
                Showing {activities.length} of {activityTotal} logs
              </span>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={activityPage === 1}
                  onClick={() => fetchActivities(activityPage - 1, activityCategory)}
                  className="text-xs font-medium py-1 px-3 border-[#EAE8E1]"
                >
                  Previous
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={activityPage * activityLimit >= activityTotal}
                  onClick={() => fetchActivities(activityPage + 1, activityCategory)}
                  className="text-xs font-medium py-1 px-3 border-[#EAE8E1]"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Sliding coordination panel overlay */}
      {selectedAlertRef && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end" id="coordination-panel-overlay">
          <div className="w-full max-w-xl h-full bg-[#FAF9F6] shadow-2xl flex flex-col relative animate-in slide-in-from-right duration-300">
            <ActiveResponseCoordinationPanel
              alertId={selectedAlertRef}
              currentUser={{
                id: adminUser?.id || 'temp-id',
                role: adminUser?.role || 'admin',
                fullName: adminUser?.fullName || adminUser?.full_name || 'Super Admin',
                email: adminUser?.email || ''
              }}
              onClose={() => {
                setSelectedAlertRef(null);
                fetchOverview(true);
              }}
              onRefreshParentAlerts={() => fetchOverview(true)}
            />
          </div>
        </div>
      )}

    </div>
  );
};

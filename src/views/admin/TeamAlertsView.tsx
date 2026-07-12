/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  Check, 
  RefreshCw, 
  LogOut, 
  ArrowLeft, 
  ShieldCheck, 
  Volume2, 
  VolumeX, 
  AlertTriangle, 
  MessageSquare,
  Lock,
  Clock,
  UserCheck,
  ChevronRight,
  Sparkles,
  Users
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { BrandLogo } from '../../components/common/BrandLogo';
import { Button } from '../../components/common/Button';
import { playSound, resumeAudioContext } from '../../utils/sound';
import { urgentAlertEffectsManager, getCategoryLabel } from '../../utils/urgentAlertEffects';
import { ActiveResponseCoordinationPanel } from '../../components/common/ActiveResponseCoordinationPanel';
import { AppRoute } from '../../types';

interface TeamAlertsViewProps {
  onNavigate: (route: AppRoute) => void;
  onSignOut: () => void;
  adminUser: any;
  volunteerProfile?: any;
}

export const TeamAlertsView: React.FC<TeamAlertsViewProps> = ({
  onNavigate,
  onSignOut,
  adminUser,
  volunteerProfile
}) => {
  const { showError, showSuccess } = useNotification();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolvingAlert, setResolvingAlert] = useState<any | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  // Load device preferences
  const [preferences, setPreferences] = useState({
    receiveUrgent: () => {
      const stored = localStorage.getItem('koinonia_device_receive_urgent');
      return stored !== 'false';
    },
    sound: () => {
      const stored = localStorage.getItem('koinonia_device_sound');
      return stored !== 'false';
    },
    vibration: () => {
      const stored = localStorage.getItem('koinonia_device_vibration');
      return stored !== 'false';
    },
    showPopup: () => {
      const stored = localStorage.getItem('koinonia_device_show_popup');
      return stored !== 'false';
    }
  });

  // Derived user information
  const teamRoleTitle = volunteerProfile?.assignedTeam || volunteerProfile?.preferredTeam || 'Ministry Coordinator';
  const teamArea = volunteerProfile?.assignedArea || 'General Assembly Hall';
  const userFullName = adminUser?.fullName || volunteerProfile?.full_name || 'Team Lead';

  const fetchAlerts = async (isQuiet = false) => {
    if (!isQuiet) setLoading(true);
    try {
      const res = await api.admin.getSafetyAlerts();
      if (Array.isArray(res)) {
        setAlerts(res);
        urgentAlertEffectsManager.syncAlerts(res);
      }
    } catch (err: any) {
      console.error('Failed to load safety alerts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // SSE Real-time instant safety alert updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      const token = localStorage.getItem('koinonia_token');
      if (!token) return;

      const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
      const sseUrl = `${apiBaseUrl}/api/notifications/stream?token=${token}`;

      console.log('[SSE Client TeamAlerts] Connecting to:', sseUrl);
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          console.log('[SSE Client TeamAlerts] Received message:', payload);

          if (payload.type === 'handshake') {
            console.log('[SSE Client TeamAlerts] Handshake successful, clientId:', payload.clientId);
            return;
          }

          if (
            payload.type === 'safety_alert_created' ||
            payload.type === 'safety_alert_acknowledged' ||
            payload.type === 'safety_alert_resolved' ||
            payload.type === 'safety_alert_escalated'
          ) {
            const clientReceiptTime = new Date();
            const createdTime = new Date(payload.timestamp || (payload.data && payload.data.created_at) || new Date());
            const latencyMs = clientReceiptTime.getTime() - createdTime.getTime();
            
            console.log('%c[EMERGENCY ALERT TIMING DIAGNOSTIC (TEAM)]', 'background: #DC2626; color: white; font-weight: bold; padding: 6px; border-radius: 4px;', {
              'Event Type': payload.type,
              'Submission/DB Timestamp (Server)': createdTime.toISOString(),
              'Client Receipt Timestamp': clientReceiptTime.toISOString(),
              'Measured Net Delivery Latency': `${latencyMs}ms (${(latencyMs / 1000).toFixed(3)}s)`,
              'Priority Route Status': 'SSE Priority Channel Active (Polling Bypassed)',
              'Sound Trigger Time': new Date().toISOString()
            });

            const alertId = payload.alertId || payload.data?.id || (payload.data && payload.data.alertId);
            window.dispatchEvent(new CustomEvent('sse-alert-update', { detail: { alertId } }));
            fetchAlerts(true);
          }
        } catch (err) {
          console.error('[SSE Client TeamAlerts] Failed to parse message:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('[SSE Client TeamAlerts] Error or disconnected, retrying in 3s:', err);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        reconnectTimeout = setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
        console.log('[SSE Client TeamAlerts] Connection closed.');
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  // Global browser autoplay restriction bypass via user interaction
  useEffect(() => {
    const handleGlobalInteraction = () => {
      try {
        resumeAudioContext();
      } catch (e) {
        console.warn('Failed to resume AudioContext globally:', e);
      }
    };
    document.addEventListener('click', handleGlobalInteraction);
    document.addEventListener('touchstart', handleGlobalInteraction);
    return () => {
      document.removeEventListener('click', handleGlobalInteraction);
      document.removeEventListener('touchstart', handleGlobalInteraction);
    };
  }, []);

  useEffect(() => {
    fetchAlerts();
    
    // Auto refresh every 10 seconds for real-time safety
    const interval = setInterval(() => {
      fetchAlerts(true);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Listen to browser lifecycle events to immediately silence alert effects if hidden or closed
  useEffect(() => {
    const handleUnloadCleanup = () => {
      try {
        (window as any).stopAllUrgentAlertEffects?.();
      } catch (e) {
        console.warn('Failed in stopAllUrgentAlertEffects during unload:', e);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        try {
          (window as any).stopAllUrgentAlertEffects?.();
        } catch (e) {
          console.warn('Failed in stopAllUrgentAlertEffects during visibility change:', e);
        }
      }
    };

    window.addEventListener('beforeunload', handleUnloadCleanup);
    window.addEventListener('pagehide', handleUnloadCleanup);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleUnloadCleanup);
      window.removeEventListener('pagehide', handleUnloadCleanup);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Also stop sound when this view unmounts
      try {
        (window as any).stopAllUrgentAlertEffects?.();
      } catch (_) {}
    };
  }, []);

  const handleTogglePreference = (key: string) => {
    // Resume context on interaction to comply with Chrome guidelines
    resumeAudioContext();
    const currentVal = localStorage.getItem(key) !== 'false';
    const newVal = !currentVal;
    localStorage.setItem(key, newVal ? 'true' : 'false');
    
    // Trigger small audio test if sound was turned on
    if (key === 'koinonia_device_sound' && newVal) {
      try { playSound('notification_gentle'); } catch (_) {}
    }

    setPreferences({
      receiveUrgent: () => localStorage.getItem('koinonia_device_receive_urgent') !== 'false',
      sound: () => localStorage.getItem('koinonia_device_sound') !== 'false',
      vibration: () => localStorage.getItem('koinonia_device_vibration') !== 'false',
      showPopup: () => localStorage.getItem('koinonia_device_show_popup') !== 'false'
    });
    
    showSuccess('Settings Saved', 'Your device alert delivery preferences were updated.');
  };

  const handleAcknowledge = async (id: string) => {
    resumeAudioContext();
    setActionInProgress(id);
    try {
      const res = await api.admin.acknowledgeSafetyAlert(id);
      if (res.success) {
        showSuccess('Alert Claimed', 'You have acknowledged and claimed responsibility for this request.');
        urgentAlertEffectsManager.silenceAlert(id);
        fetchAlerts(true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Action Failed', parsed.message || 'Could not acknowledge this safety alert.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleEscalate = async (id: string) => {
    resumeAudioContext();
    setActionInProgress(`escalate-${id}`);
    try {
      const res = await api.admin.escalateSafetyAlert(id);
      if (res.success) {
        showSuccess('Alert Escalated', 'Safety Alert has been escalated to Urgent priority.');
        fetchAlerts(true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Escalation Failed', parsed.message || 'Could not escalate this safety alert.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingAlert) return;
    if (!resolutionNote.trim()) {
      showError('Details Required', 'Please enter a brief note on how this situation was settled.');
      return;
    }

    setActionInProgress(`resolve-${resolvingAlert.id}`);
    try {
      const res = await api.admin.resolveSafetyAlert(resolvingAlert.id, resolutionNote.trim());
      if (res.success) {
        showSuccess('Request Settled', 'The care and safety request has been marked as resolved.');
        urgentAlertEffectsManager.silenceAlert(resolvingAlert.id);
        setResolvingAlert(null);
        setResolutionNote('');
        fetchAlerts(true);
      }
    } catch (err: any) {
      const parsed = extractApiError(err);
      showError('Resolution Failed', parsed.message || 'Could not resolve this safety alert.');
    } finally {
      setActionInProgress(null);
    }
  };

  const formatTimeAgo = (isoString?: string) => {
    if (!isoString) return 'Just now';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} mins ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours} hours ago`;
  };

  const activeAlertsCount = alerts.filter(a => a.status !== 'resolved').length;
  const urgentAlertsCount = alerts.filter(a => a.status !== 'resolved' && a.severity === 'urgent').length;

  return (
    <div 
      className="min-h-screen bg-[#FAF9F6] text-[#18181B] font-sans antialiased relative pb-16"
      data-view-version="admin-active-alert-responses-v2-premium"
    >
      {/* HEADER SECTION */}
      <header className="sticky top-0 z-40 bg-[#F9F8F3]/95 backdrop-blur-md border-b border-[#EAE8E1] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <button
              onClick={() => onNavigate('/admin/overview')}
              className="p-2.5 rounded-xl border border-[#EAE8E1] hover:bg-white text-zinc-600 hover:text-[#18181B] transition-all cursor-pointer shadow-xs"
              title="Return to Overview"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-serif text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2">
                Team Safety Alerts
                {activeAlertsCount > 0 && (
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                    {activeAlertsCount} Active
                  </span>
                )}
              </h1>
              <p className="text-[11px] text-zinc-500 font-medium tracking-wide">
                Role: <strong className="text-zinc-700">{teamRoleTitle}</strong> &bull; Area: <strong className="text-zinc-700">{teamArea}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={() => { setRefreshing(true); fetchAlerts(); }}
              disabled={refreshing || loading}
              className="p-2.5 rounded-xl border border-[#EAE8E1] hover:bg-white text-zinc-600 hover:text-[#18181B] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              title="Refresh queue"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => { onSignOut(); onNavigate('/'); }}
              className="hidden sm:flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition-all cursor-pointer shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 sm:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
        
        {/* LEFT COLUMN: ACTIVE SAFETY ALERTS QUEUE */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold text-[#18181B]">
              Active Care Concerns
            </h2>
            {urgentAlertsCount > 0 && (
              <span className="bg-red-50 text-red-700 border border-red-100 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {urgentAlertsCount} Urgent Situation
              </span>
            )}
          </div>

          {loading ? (
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-16 text-center shadow-xs flex flex-col items-center justify-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#C59B27] mb-4"></div>
              <p className="text-xs text-zinc-500 font-medium">Loading security alerts...</p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-16 text-center shadow-xs space-y-4 max-w-2xl mx-auto">
              <div className="w-12 h-12 bg-[#C59B27]/5 border border-[#C59B27]/10 text-[#C59B27] rounded-full flex items-center justify-center mx-auto shadow-xs">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-base font-bold text-[#18181B]">
                All Quiet on Site
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mx-auto">
                No safety alerts or care requests have been reported. All rooms and entry points are currently operating securely.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {alerts.map((alert) => {
                  const isResolved = alert.status === 'resolved';
                  const isAck = alert.status === 'acknowledged';
                  const isUrgent = alert.severity === 'urgent';
                  const isImportant = alert.severity === 'important';

                  return (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                      className={`bg-white border rounded-2xl p-5 shadow-xs transition-all relative overflow-hidden ${
                        isResolved 
                          ? 'border-zinc-200 opacity-65' 
                          : isUrgent
                            ? 'border-red-200 bg-red-50/10 hover:shadow-md'
                            : 'border-[#EAE8E1] hover:shadow-md'
                      }`}
                    >
                      {/* Left accent border */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                        isResolved
                          ? 'bg-zinc-300'
                          : isUrgent
                            ? 'bg-red-600'
                            : isImportant
                              ? 'bg-amber-500'
                              : 'bg-zinc-400'
                      }`} />

                      <div className="flex items-start justify-between gap-4 pl-1.5">
                        <div className="space-y-2 min-w-0">
                          {/* Alert Header Meta */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-sans font-bold border uppercase tracking-wider ${
                              isUrgent 
                                ? 'bg-red-50 text-red-700 border-red-100' 
                                : isImportant
                                  ? 'bg-amber-50 text-amber-700 border-amber-100'
                                  : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                            }`}>
                              {alert.severity} priority
                            </span>

                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-sans font-bold border uppercase tracking-wider ${
                              isResolved 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                : isAck
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                            }`}>
                              {alert.status}
                            </span>

                            <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTimeAgo(alert.created_at)}
                            </span>
                          </div>

                          {/* Context Details */}
                          <div className="space-y-1">
                            <h3 className="font-serif font-bold text-sm text-[#18181B]">
                              {alert.category ? getCategoryLabel(alert.category) : 'Care Request'}
                            </h3>
                            <p className="text-xs text-zinc-600 font-medium">
                              Raised by <strong className="text-zinc-900">{alert.raised_by_name || 'Volunteer'}</strong>
                              {alert.location_label && <span> at <strong className="text-zinc-900">{alert.location_label}</strong></span>}
                              {alert.child_name && <span> regarding child <strong className="text-zinc-900">{alert.child_name}</strong></span>}
                            </p>
                          </div>

                          {/* Alert message */}
                          {alert.message && (
                            <p className="text-xs italic bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-xl p-3 leading-relaxed text-zinc-700">
                              "{alert.message}"
                            </p>
                          )}

                          {/* Parent Contact quick peek */}
                          {alert.parent_name && !isResolved && (
                            <div className="flex items-center gap-2 text-[11px] text-[#C59B27] bg-[#C59B27]/5 border border-[#C59B27]/10 px-3 py-1.5 rounded-xl w-fit font-medium">
                              <span>Parent: <strong>{alert.parent_name}</strong> ({alert.parent_phone || 'No phone'})</span>
                            </div>
                          )}

                          {/* Active Responder Coordination Indicators */}
                          {!isResolved && (
                            <div className="flex flex-wrap gap-2 items-center mt-2" data-component-version="admin-active-alert-responses-v2-indicators">
                              {alert.acknowledged_by ? (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#C59B27]/5 border border-[#C59B27]/20 rounded-full text-[10px] text-amber-800 font-semibold shadow-2xs">
                                  <div className="w-1.5 h-1.5 bg-[#C59B27] rounded-full animate-ping" />
                                  <span>Owner: {alert.acknowledged_by_name || 'Team Lead'}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 border border-rose-200/60 rounded-full text-[10px] text-rose-700 font-semibold animate-pulse shadow-2xs">
                                  <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                                  <span>Unclaimed Incident</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Resolution details if resolved */}
                          {isResolved && alert.resolution_note && (
                            <div className="text-xs bg-emerald-50/30 border border-emerald-100 text-emerald-900 p-3 rounded-xl space-y-1">
                              <p className="font-bold flex items-center gap-1 text-[11px]">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                Resolved Details:
                              </p>
                              <p className="text-[11px] text-zinc-600">{alert.resolution_note}</p>
                              {alert.resolved_by_name && (
                                <p className="text-[9px] text-zinc-400">Settled by {alert.resolved_by_name}</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Interactive actions for active alerts */}
                        {!isResolved && (
                          <div className="flex flex-col gap-2 shrink-0 self-center">
                            {/* Premium Response Coordination Control Center */}
                            <button
                              onClick={() => { resumeAudioContext(); setSelectedAlertId(alert.id); }}
                              className="text-xs bg-zinc-900 hover:bg-black text-white px-3.5 py-2.5 rounded-xl font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-800"
                              id={`coord-btn-${alert.id}`}
                            >
                              <Users className="w-3.5 h-3.5 text-[#C59B27]" />
                              <span>Coordinate Response</span>
                            </button>

                            {!isAck && (
                              <button
                                onClick={() => handleAcknowledge(alert.id)}
                                disabled={actionInProgress !== null}
                                className="text-xs bg-[#C59B27] hover:bg-[#b58c22] text-white px-3.5 py-2 rounded-xl font-semibold transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                {actionInProgress === alert.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <UserCheck className="w-3.5 h-3.5" />
                                )}
                                <span>Acknowledge</span>
                              </button>
                            )}

                            {isAck && (
                              <button
                                onClick={() => { resumeAudioContext(); setResolvingAlert(alert); }}
                                disabled={actionInProgress !== null}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl font-semibold transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Resolve</span>
                              </button>
                            )}

                            {!isUrgent && (
                              <button
                                onClick={() => handleEscalate(alert.id)}
                                disabled={actionInProgress !== null}
                                className="text-[10px] bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 hover:text-red-800 px-3 py-1.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                {actionInProgress === `escalate-${alert.id}` ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <AlertTriangle className="w-3 h-3" />
                                )}
                                <span>Escalate to Admin</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: DEVICE DELIVERY PREFERENCES */}
        <div className="space-y-6">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-[#EAE8E1]">
              <Sparkles className="w-4 h-4 text-[#C59B27]" />
              <h3 className="font-serif font-bold text-sm text-[#18181B]">
                Notification Delivery Settings
              </h3>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              Define how emergency alerts and safety notifications should be delivered to this device while active on site.
            </p>

            <div className="space-y-4">
              {/* Toggle Audio */}
              <div className="flex items-center justify-between p-3.5 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-2xl">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-zinc-800 block">Sound Chimes</span>
                  <span className="text-[10px] text-zinc-400 block">Synthesized chord chimes on new alert</span>
                </div>
                <button
                  onClick={() => handleTogglePreference('koinonia_device_sound')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    preferences.sound() ? 'bg-[#C59B27]' : 'bg-zinc-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      preferences.sound() ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle Vibration */}
              <div className="flex items-center justify-between p-3.5 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-2xl">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-zinc-800 block">Physical Vibration</span>
                  <span className="text-[10px] text-zinc-400 block">Pulse pattern on critical alerts</span>
                </div>
                <button
                  onClick={() => handleTogglePreference('koinonia_device_vibration')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    preferences.vibration() ? 'bg-[#C59B27]' : 'bg-zinc-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      preferences.vibration() ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle Alerts Enablement */}
              <div className="flex items-center justify-between p-3.5 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-2xl">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-zinc-800 block">Receive Alerts</span>
                  <span className="text-[10px] text-zinc-400 block">Allow safety alerts to stream to this device</span>
                </div>
                <button
                  onClick={() => handleTogglePreference('koinonia_device_receive_urgent')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    preferences.receiveUrgent() ? 'bg-[#C59B27]' : 'bg-zinc-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      preferences.receiveUrgent() ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl p-4 text-xs text-zinc-500 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Emergency sound & tactile delivery utilizes secure, sandbox-safe, client-side Web Audio synthesis to protect site access and avoid raw browser constraints.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* RESOLUTION MODAL */}
      {resolvingAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => setResolvingAlert(null)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs" 
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative bg-white border border-[#EAE8E1] rounded-[24px] w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#EAE8E1]">
              <h4 className="font-serif font-bold text-base text-[#18181B] flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-600" />
                Resolve Care Request
              </h4>
            </div>

            <form onSubmit={handleResolveSubmit} className="space-y-4 text-xs">
              <div className="space-y-1 bg-[#FAF9F6] border border-[#EAE8E1]/60 p-3.5 rounded-xl text-zinc-600">
                <p>Concern: <strong>{resolvingAlert.category ? getCategoryLabel(resolvingAlert.category) : 'Care Request'}</strong></p>
                <p>Location: <strong>{resolvingAlert.location_label || 'Not specified'}</strong></p>
                {resolvingAlert.child_name && <p>Child: <strong>{resolvingAlert.child_name}</strong></p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 block">Resolution Notes</label>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Explain how this situation was settled (e.g. child was reunited with parent, care lead escorted child to rest zone)..."
                  className="w-full bg-[#FAF9F6] border border-[#EAE8E1] hover:border-zinc-300 focus:border-[#C59B27] focus:ring-1 focus:ring-[#C59B27] rounded-xl p-3 text-xs outline-none min-h-[90px] resize-none transition-all placeholder:text-zinc-400"
                  required
                />
              </div>

              <div className="flex justify-end gap-3.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResolvingAlert(null)}
                  className="text-xs px-4 py-2 border-[#EAE8E1]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={actionInProgress !== null}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2"
                >
                  {actionInProgress === `resolve-${resolvingAlert.id}` ? (
                    <span className="flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Resolving...
                    </span>
                  ) : (
                    'Resolve'
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Sliding coordination panel overlay */}
      {selectedAlertId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end" id="coordination-panel-overlay">
          <div className="w-full max-w-xl h-full bg-[#FAF9F6] shadow-2xl flex flex-col relative animate-in slide-in-from-right duration-300">
            <ActiveResponseCoordinationPanel
              alertId={selectedAlertId}
              currentUser={{
                id: adminUser?.id || volunteerProfile?.user_id || 'temp-id',
                role: adminUser?.role || (volunteerProfile?.assignedTeam ? 'team' : 'admin'),
                fullName: userFullName,
                email: adminUser?.email || ''
              }}
              onClose={() => {
                setSelectedAlertId(null);
                fetchAlerts(true);
              }}
              onRefreshParentAlerts={() => fetchAlerts(true)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

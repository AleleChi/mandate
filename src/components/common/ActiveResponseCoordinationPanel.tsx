import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  Check, 
  RefreshCw, 
  UserCheck, 
  Users, 
  FileText, 
  Clock, 
  Share2, 
  AlertTriangle, 
  CheckCircle, 
  ArrowLeftRight, 
  ShieldCheck, 
  Plus, 
  UserPlus, 
  LogOut, 
  Eye, 
  CheckSquare, 
  ChevronDown, 
  HelpCircle,
  X,
  Lock,
  ChevronRight,
  Info
} from 'lucide-react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { 
  AlertResponseStatus, 
  getResponseStatusLabel, 
  getResponseStatusDescription, 
  getResponseStatusTone 
} from '../../types';
import { SafeImage } from './SafeImage';
import { IncidentEditModal } from './IncidentEditModal';

interface ActiveResponseCoordinationPanelProps {
  alertId: string;
  currentUser: { id: string; role: string; email: string; fullName?: string };
  initialAlert?: any;
  onClose?: () => void;
  onRefreshParentAlerts?: () => void;
}

export const ActiveResponseCoordinationPanel: React.FC<ActiveResponseCoordinationPanelProps> = ({
  alertId,
  currentUser,
  initialAlert,
  onClose,
  onRefreshParentAlerts
}) => {
  const { showError, showSuccess } = useNotification();
  const [loading, setLoading] = useState<boolean>(true);
  const [responseState, setResponseState] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelinePage, setTimelinePage] = useState<number>(1);
  const [timelineTotal, setTimelineTotal] = useState<number>(0);
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // Idempotency support
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  
  // Modals & Sheets visibility
  const [showUpdateSheet, setShowUpdateSheet] = useState<boolean>(false);
  const [showAssistanceSheet, setShowAssistanceSheet] = useState<boolean>(false);
  const [showHandoverSheet, setShowHandoverSheet] = useState<boolean>(false);
  const [showReassignmentSheet, setShowReassignmentSheet] = useState<boolean>(false);
  const [showResolveSheet, setShowResolveSheet] = useState<boolean>(false);
  const [showReopenSheet, setShowReopenSheet] = useState<boolean>(false);
  const [showIncidentModal, setShowIncidentModal] = useState<boolean>(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Form Fields
  const [updateType, setUpdateType] = useState<string>('Team has arrived');
  const [updateNote, setUpdateNote] = useState<string>('');
  const [updateVisibility, setUpdateVisibility] = useState<string>('response_team');
  
  const [assistanceUserId, setAssistanceUserId] = useState<string>('');
  const [assistanceTeamKey, setAssistanceTeamKey] = useState<string>('first_aid');
  const [assistanceNote, setAssistanceNote] = useState<string>('');

  const [handoverUserId, setHandoverUserId] = useState<string>('');
  const [handoverReason, setHandoverReason] = useState<string>('Shift ending');
  const [handoverNote, setHandoverNote] = useState<string>('');

  const [reassignUserId, setReassignUserId] = useState<string>('');
  const [reassignReason, setReassignReason] = useState<string>('');

  const [resolveOutcome, setResolveOutcome] = useState<string>('Child assisted');
  const [resolveNote, setResolveNote] = useState<string>('');
  const [resolveFollowUp, setResolveFollowUp] = useState<boolean>(false);

  const [reopenReason, setReopenReason] = useState<string>('');

  // Search Results
  const [eligibleResponders, setEligibleResponders] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchingResponders, setSearchingResponders] = useState<boolean>(false);

  // Performance diagnostics
  const [metrics, setMetrics] = useState<{
    renderTime: number;
    lastActionLatency: number | null;
  }>({
    renderTime: Date.now(),
    lastActionLatency: null,
  });

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const dateStr = date.toLocaleDateString([], { day: 'numeric', month: 'short' });
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${dateStr} · ${timeStr}`;
    } catch (_) {
      return '';
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const generateIdempotencyKey = (actionName: string) => {
    const key = `${actionName}_${alertId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setIdempotencyKey(key);
    return key;
  };

  const loadResponseState = async (isQuiet = false) => {
    if (!isQuiet) setLoading(true);
    const start = Date.now();
    try {
      const state = await api.safetyAlerts.getAlertResponse(alertId);
      setResponseState(state);
      setConflictError(null);
      
      // Stop effects if alert is urgent and has been acknowledged
      if (state.alert?.severity === 'urgent' && state.alert?.status === 'acknowledged') {
        const stopEvent = new CustomEvent('alert.effects_stop', { detail: { alertId } });
        window.dispatchEvent(stopEvent);
      }
    } catch (err: any) {
      console.error('[loadResponseState Error]:', err);
      showError('Failed to fetch response details', err.message);
    } finally {
      setLoading(false);
      setMetrics(prev => ({ ...prev, lastActionLatency: Date.now() - start }));
    }
  };

  const loadTimeline = async (page = 1) => {
    setLoadingTimeline(true);
    try {
      const res = await api.safetyAlerts.getAlertResponseTimeline(alertId, { page, limit: 10 });
      if (res && res.success) {
        if (page === 1) {
          setTimeline(res.data || []);
        } else {
          setTimeline(prev => [...prev, ...(res.data || [])]);
        }
        setTimelinePage(page);
        setTimelineTotal(res.total || 0);
      }
    } catch (err: any) {
      console.error('[loadTimeline Error]:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  useEffect(() => {
    loadResponseState();
    loadTimeline(1);
    
    // Subscribe to SSE Global event updates
    const handleSseUpdate = (e: Event) => {
      const sseEvent = e as CustomEvent;
      if (sseEvent.detail?.alertId === alertId) {
        console.log('[SSE Client Coordination Panel] Hot-updating state from event:', sseEvent.detail);
        loadResponseState(true);
        loadTimeline(1);
      }
    };

    window.addEventListener('sse-alert-update', handleSseUpdate);
    window.addEventListener('alert.effects_stop', handleSseUpdate);
    return () => {
      window.removeEventListener('sse-alert-update', handleSseUpdate);
      window.removeEventListener('alert.effects_stop', handleSseUpdate);
    };
  }, [alertId]);

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const delayDebounce = setTimeout(async () => {
        setSearchingResponders(true);
        try {
          const res = await api.safetyAlerts.searchEligibleResponders(currentUser.role, searchQuery);
          setEligibleResponders(res || []);
        } catch (err) {
          console.error(err);
        } finally {
          setSearchingResponders(false);
        }
      }, 350);
      return () => clearTimeout(delayDebounce);
    } else {
      setEligibleResponders([]);
    }
  }, [searchQuery]);

  const handleSearchEligible = async () => {
    setSearchingResponders(true);
    try {
      const res = await api.safetyAlerts.searchEligibleResponders(currentUser.role, '');
      setEligibleResponders(res || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSearchingResponders(false);
    }
  };

  const handleAction = async (action: () => Promise<any>, actionName: string, successMsg: string) => {
    const start = Date.now();
    setActionInProgress(actionName);
    try {
      const key = generateIdempotencyKey(actionName);
      const res = await action();
      if (res) {
        showSuccess('Success', successMsg);
        loadResponseState(true);
        loadTimeline(1);
        if (onRefreshParentAlerts) onRefreshParentAlerts();
      }
    } catch (err: any) {
      console.error(`[${actionName} Error]:`, err);
      if (err.code === 'ALERT_ALREADY_OWNED' || err.code === 'STALE_RESPONSE_STATE' || err.code === 'HANDOVER_ALREADY_DECIDED' || err.code === 'ALERT_ALREADY_RESOLVED') {
        setConflictError(err.message || 'The response status has been modified by another device.');
        showError('State Conflict', err.message);
        loadResponseState(true);
      } else {
        showError('Action Failed', err.message || 'An error occurred during submission.');
      }
    } finally {
      setActionInProgress(null);
      setMetrics(prev => ({ ...prev, lastActionLatency: Date.now() - start }));
    }
  };

  if (loading && !responseState && !initialAlert) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white/80 backdrop-blur-xs rounded-2xl border border-zinc-200 h-96" id="coordination-loader">
        <RefreshCw className="w-8 h-8 text-[#C59B27] animate-spin mb-4" />
        <p className="text-xs text-zinc-500 font-medium font-sans">Loading response details...</p>
      </div>
    );
  }

  const alert = { ...(initialAlert || {}), ...(responseState?.alert || {}) };
  const response = responseState?.response;
  const isOwner = response?.owner?.id === currentUser.id;
  const isAssistant = response?.assistants?.some((a: any) => a.id === currentUser.id);
  const allowedActions = response?.allowedActions || [];

  const status = alert?.status || 'open';
  const isResolved = status === 'resolved' || status === 'closed';
  const isUnderway = status === 'acknowledged' || status === 'in_progress';
  const isNeedsResponse = status === 'open' || (!isResolved && !isUnderway);

  const resolvedByName = alert.resolved_by_name || alert.resolvedByName || alert.structuredDetails?.resolved_by_name || (isResolved ? (response?.owner?.displayName || 'Admin') : 'Admin');
  const resolvedAt = alert.resolved_at || alert.resolvedAt || (isResolved ? (alert.updated_at || alert.updatedAt) : null);
  const resolutionNote = alert.resolution_note || alert.resolutionNote || alert.structuredDetails?.resolution_note || '';

  const acknowledgedByName = alert.acknowledged_by_name || alert.acknowledgedByName || response?.owner?.displayName || 'Care Lead';
  const acknowledgedAt = alert.acknowledged_at || alert.acknowledgedAt || response?.owner?.assignedAt || response?.ownershipStartTime;

  const childName = alert.child_name || alert.childName || alert.structuredDetails?.child_name;
  const childAgeGroup = alert.child_age_group || alert.childAgeGroup || alert.structuredDetails?.child_age_group;
  const parentName = alert.parent_name || alert.parentName || alert.structuredDetails?.parent_name;
  const parentPhone = alert.parent_phone || alert.parentPhone || alert.structuredDetails?.parent_phone;
  const locationLabel = alert.location_label || alert.location || alert.structuredDetails?.location_label || 'Location not available';

  return (
    <div 
      className="bg-[#FAF9F6] dark:bg-[#1D1D1A] border border-zinc-200/80 dark:border-[#302E29] rounded-2xl p-5 sm:p-6 shadow-md space-y-5 max-w-xl mx-auto w-full text-left overflow-y-auto max-h-[85vh]"
      data-view-version="active-alert-response-coordination-v2-premium"
      id={`panel-${alertId}`}
    >
      {/* PERFORMANCE METRIC DIAGNOSTIC BLOCK */}
      <div className="hidden" data-component-version="alert-response-frontend-performance-v1">
        Render latency: {Date.now() - metrics.renderTime}ms. Last Action latency: {metrics.lastActionLatency}ms
      </div>

      {/* ACCESSIBILITY HELPER FOR SCREEN READERS */}
      <div className="sr-only" data-component-version="alert-response-accessibility-v2">
        Security alert details for alert {alert?.id}. Severity: {alert?.severity}. Status: {status}.
      </div>

      {/* IDEMPOTENCY KEY HIDDEN FEEDBACK */}
      <div className="hidden" data-component-version="alert-response-idempotency-client-v1">
        IDEM_KEY: {idempotencyKey}
      </div>

      {/* CONFLICT ERROR DISPLAY */}
      {conflictError && (
        <div 
          className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl p-3.5 text-xs text-red-800 dark:text-red-300 font-sans space-y-1 flex items-start space-x-2"
          data-component-version="response-ownership-conflict-ui-v1"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Conflict Notice</p>
            <p className="text-[11px] text-red-700 dark:text-red-400">{conflictError}</p>
            <button onClick={() => setConflictError(null)} className="text-zinc-500 dark:text-[#7A7570] hover:text-zinc-800 dark:hover:text-[#F0EBE3] underline text-[10px] mt-1 bg-transparent border-none cursor-pointer">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STATE A: RESOLVED INCIDENT SUMMARY (READ-ONLY CALM PRESENTATION)          */}
      {/* ========================================================================= */}
      {isResolved && (
        <div className="space-y-4" data-component-version="resolved-incident-summary-v2-premium">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200/80 dark:border-[#302E29]">
            <div className="space-y-0.5">
              <h2 className="font-serif font-bold text-lg text-zinc-900 dark:text-[#F0EBE3] tracking-tight">Incident resolved</h2>
              <p className="text-xs text-zinc-500 dark:text-[#7A7570] font-sans">Closed care request summary</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 px-2.5 py-0.5 rounded-full">
                Resolved
              </span>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-zinc-400 dark:text-[#7A7570] hover:text-zinc-700 dark:hover:text-[#F0EBE3] p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-[#262520] transition-colors cursor-pointer"
                  title="Close"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Incident title and location */}
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-base text-zinc-950 dark:text-[#F0EBE3]">
              {alert?.title || 'Safety Concern'}
            </h3>
            <p className="text-xs text-zinc-600 dark:text-[#B8B0A5] font-sans">
              {locationLabel}
            </p>
            <p className="text-xs text-zinc-600 dark:text-[#B8B0A5] font-sans pt-1">
              Resolved by <strong className="text-zinc-800 dark:text-[#F0EBE3]">{resolvedByName}</strong>
              {resolvedAt && <span> · {formatDateTime(resolvedAt)}</span>}
            </p>
            {acknowledgedByName && acknowledgedAt && (
              <p className="text-[11px] text-zinc-400 dark:text-[#7A7570] font-sans">
                Response taken by {acknowledgedByName} · {formatTime(acknowledgedAt)}
              </p>
            )}
          </div>

          {/* Child & Parent info if present */}
          {childName && (
            <div className="py-2.5 px-3.5 bg-white dark:bg-[#21211E] border border-zinc-200/80 dark:border-[#302E29] rounded-xl flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-medium text-zinc-900 dark:text-[#F0EBE3]">{childName}</span>
                {childAgeGroup && <span className="text-zinc-500 dark:text-[#7A7570]"> ({childAgeGroup})</span>}
                {parentName && <span className="text-zinc-500 dark:text-[#7A7570] block text-[11px]">Parent: {parentName}</span>}
              </div>
              {parentPhone && (
                <a
                  href={`tel:${parentPhone}`}
                  className="text-[11px] text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 dark:hover:text-[#F0EBE3] border border-zinc-200 dark:border-[#3A3835] px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-[#262520]"
                >
                  {parentPhone}
                </a>
              )}
            </div>
          )}

          {/* Distress message with subtle left rule */}
          {alert?.message && (
            <div className="pl-3.5 border-l-2 border-[#C59B27]/40 dark:border-amber-500/40 py-1 text-left">
              <p className="text-xs text-zinc-800 dark:text-[#F0EBE3] leading-relaxed font-sans">
                “{alert.message}”
              </p>
            </div>
          )}

          {/* Resolution Note */}
          <div className="space-y-1.5 pt-1">
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3] font-sans">Resolution</h4>
            {resolutionNote ? (
              <div className="pl-3.5 border-l-2 border-emerald-600/60 dark:border-emerald-500/40 py-1.5 text-left bg-emerald-50/40 dark:bg-emerald-950/30 rounded-r-lg">
                <p className="text-xs text-zinc-800 dark:text-[#F0EBE3] leading-relaxed font-sans">
                  “{resolutionNote}”
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 dark:text-[#7A7570] font-sans">No resolution note was added.</p>
            )}
          </div>

          {/* Response History */}
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-[#302E29]">
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3] font-sans">Response history</h4>
            {timeline.length > 0 ? (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {timeline.map((item: any, idx: number) => (
                  <div key={item.id || idx} className="text-xs flex items-start gap-2.5 text-zinc-600 dark:text-[#B8B0A5]">
                    <span className="text-[11px] text-zinc-400 dark:text-[#7A7570] shrink-0 font-mono pt-0.5">
                      {formatTime(item.createdAt || item.timestamp || item.created_at)}
                    </span>
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-800 dark:text-[#F0EBE3]">{item.actionName || item.action}</span>
                      {item.actorName && <span className="text-zinc-400 dark:text-[#7A7570]"> · {item.actorName}</span>}
                      {item.note && <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] italic mt-0.5">"{item.note}"</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 dark:text-[#7A7570] font-sans">No additional response notes.</p>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-zinc-200/80 dark:border-[#302E29] flex items-center justify-between gap-3">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white dark:bg-[#21211E] hover:bg-zinc-50 dark:hover:bg-[#262520] border border-zinc-200 dark:border-[#3A3835] text-zinc-700 dark:text-[#F0EBE3] text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            ) : <div />}
            <div className="flex items-center gap-2">
              {currentUser.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => setShowReopenSheet(true)}
                  className="px-3.5 py-2 text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 dark:hover:text-[#F0EBE3] text-xs font-medium transition-colors cursor-pointer"
                >
                  Reopen case
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowIncidentModal(true)}
                className="px-4 py-2 bg-zinc-900 dark:bg-amber-600 hover:bg-zinc-800 dark:hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                View incident report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STATE B: RESPONSE UNDERWAY STATE                                          */}
      {/* ========================================================================= */}
      {isUnderway && (
        <div className="space-y-4" data-component-version="underway-incident-summary-v2-premium">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200/80 dark:border-[#302E29]">
            <div className="space-y-0.5">
              <h2 className="font-serif font-bold text-lg text-zinc-900 dark:text-[#F0EBE3] tracking-tight">Emergency Response</h2>
              <p className="text-xs text-zinc-500 dark:text-[#7A7570] font-sans">Response underway</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-[#C59B27] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 px-2.5 py-0.5 rounded-full">
                Response underway
              </span>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-zinc-400 dark:text-[#7A7570] hover:text-zinc-700 dark:hover:text-[#F0EBE3] p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-[#262520] transition-colors cursor-pointer"
                  title="Close"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Incident title and location */}
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-base text-zinc-950 dark:text-[#F0EBE3]">
              {alert?.title || 'Safety Emergency'}
            </h3>
            <p className="text-xs text-zinc-600 dark:text-[#B8B0A5] font-sans">
              {locationLabel}
            </p>
          </div>

          {/* Responder section */}
          <div className="p-3.5 bg-white dark:bg-[#21211E] border border-zinc-200 dark:border-[#302E29] rounded-xl space-y-1">
            <span className="text-[11px] text-zinc-400 dark:text-[#7A7570] font-medium">Responding</span>
            <p className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3]">
              {acknowledgedByName}
            </p>
            {acknowledgedAt && (
              <p className="text-[11px] text-zinc-500 dark:text-[#7A7570] font-sans">
                Acknowledged at {formatTime(acknowledgedAt)}
              </p>
            )}
          </div>

          {/* Other Responders (ONLY if > 0) */}
          {response?.assistants && response.assistants.length > 0 && (
            <div className="p-3.5 bg-white dark:bg-[#21211E] border border-zinc-200 dark:border-[#302E29] rounded-xl space-y-2">
              <span className="text-[11px] text-zinc-400 dark:text-[#7A7570] font-medium">Other responders ({response.assistants.length})</span>
              <div className="space-y-1.5">
                {response.assistants.map((assistant: any, idx: number) => (
                  <div key={assistant.id || idx} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-800 dark:text-[#F0EBE3]">{assistant.displayName}</span>
                    <span className="text-[11px] text-zinc-400 dark:text-[#7A7570]">{assistant.responsibility || 'Care Assistant'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Distress message */}
          {alert?.message && (
            <div className="pl-3.5 border-l-2 border-[#C59B27]/40 dark:border-amber-500/40 py-1 text-left">
              <p className="text-xs text-zinc-800 dark:text-[#F0EBE3] leading-relaxed font-sans">
                “{alert.message}”
              </p>
            </div>
          )}

          {/* Child & Parent Details */}
          {childName && (
            <div className="py-2.5 px-3.5 bg-white dark:bg-[#21211E] border border-zinc-200/80 dark:border-[#302E29] rounded-xl flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-medium text-zinc-900 dark:text-[#F0EBE3]">{childName}</span>
                {childAgeGroup && <span className="text-zinc-500 dark:text-[#7A7570]"> ({childAgeGroup})</span>}
                {parentName && <span className="text-zinc-500 dark:text-[#7A7570] block text-[11px]">Parent: {parentName}</span>}
              </div>
              {parentPhone && (
                <a
                  href={`tel:${parentPhone}`}
                  className="text-[11px] text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 dark:hover:text-[#F0EBE3] border border-zinc-200 dark:border-[#3A3835] px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-[#262520]"
                >
                  {parentPhone}
                </a>
              )}
            </div>
          )}

          {/* Handover decision card if target is current user */}
          {response?.handover?.pending && response.handover.targetUserId === currentUser.id && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3.5 space-y-2.5">
              <p className="text-xs font-semibold text-amber-950 dark:text-amber-200">Responsibility Handover Requested</p>
              <p className="text-xs text-zinc-600 dark:text-[#B8B0A5]">The current responder has requested to transfer this case to you.</p>
              {response.handover.reason && <p className="text-xs text-zinc-500 dark:text-[#7A7570] italic">"{response.handover.reason}"</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleAction(() => api.safetyAlerts.respondToAlertHandover(alertId, response.handover.id, { decision: 'accept' }), 'handover_decide', 'Handover accepted')}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-medium py-1.5 rounded-lg text-xs cursor-pointer"
                >
                  Accept Transfer
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(() => api.safetyAlerts.respondToAlertHandover(alertId, response.handover.id, { decision: 'decline' }), 'handover_decide', 'Handover declined')}
                  className="flex-1 bg-white dark:bg-[#21211E] hover:bg-zinc-50 dark:hover:bg-[#262520] text-zinc-700 dark:text-[#F0EBE3] border border-zinc-200 dark:border-[#3A3835] font-medium py-1.5 rounded-lg text-xs cursor-pointer"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-[#302E29]">
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-[#F0EBE3] font-sans">Response timeline</h4>
            {timeline.length > 0 ? (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {timeline.map((item: any, idx: number) => (
                  <div key={item.id || idx} className="text-xs flex items-start gap-2.5 text-zinc-600 dark:text-[#B8B0A5]">
                    <span className="text-[11px] text-zinc-400 dark:text-[#7A7570] shrink-0 font-mono pt-0.5">
                      {formatTime(item.createdAt || item.timestamp || item.created_at)}
                    </span>
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-800 dark:text-[#F0EBE3]">{item.actionName || item.action}</span>
                      {item.actorName && <span className="text-zinc-400 dark:text-[#7A7570]"> · {item.actorName}</span>}
                      {item.note && <p className="text-[11px] text-zinc-500 dark:text-[#B8B0A5] italic mt-0.5">"{item.note}"</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400 dark:text-[#7A7570] font-sans">No additional response notes.</p>
            )}
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-zinc-200/80 dark:border-[#302E29] flex items-center justify-between gap-3">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white dark:bg-[#21211E] hover:bg-zinc-50 dark:hover:bg-[#262520] border border-zinc-200 dark:border-[#3A3835] text-zinc-700 dark:text-[#F0EBE3] text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            ) : <div />}
            <div className="flex flex-wrap items-center gap-2">
              {allowedActions.includes('add_update') && (
                <button
                  type="button"
                  onClick={() => setShowUpdateSheet(true)}
                  className="px-3.5 py-2 text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 dark:hover:text-[#F0EBE3] text-xs font-medium transition-colors cursor-pointer"
                >
                  Add update
                </button>
              )}
              {allowedActions.includes('request_assistance') && isOwner && (
                <button
                  type="button"
                  onClick={() => setShowAssistanceSheet(true)}
                  className="px-3.5 py-2 text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 dark:hover:text-[#F0EBE3] text-xs font-medium transition-colors cursor-pointer"
                >
                  Request backup
                </button>
              )}
              {allowedActions.includes('request_handover') && isOwner && (
                <button
                  type="button"
                  onClick={() => { handleSearchEligible(); setShowHandoverSheet(true); }}
                  className="px-3.5 py-2 text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 dark:hover:text-[#F0EBE3] text-xs font-medium transition-colors cursor-pointer"
                >
                  Hand over
                </button>
              )}
              {(allowedActions.includes('resolve') || currentUser.role === 'admin') && (
                <button
                  type="button"
                  onClick={() => setShowResolveSheet(true)}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Resolve request
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STATE C: NEEDS RESPONSE STATE                                             */}
      {/* ========================================================================= */}
      {isNeedsResponse && (
        <div className="space-y-4" data-component-version="needs-response-incident-summary-v2-premium">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200/80 dark:border-[#302E29]">
            <div className="space-y-0.5">
              <h2 className="font-serif font-bold text-lg text-zinc-900 dark:text-[#F0EBE3] tracking-tight">Emergency Response</h2>
              <p className="text-xs text-zinc-500 dark:text-[#7A7570] font-sans">Needs response</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 px-2.5 py-0.5 rounded-full">
                Needs response
              </span>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-zinc-400 dark:text-[#7A7570] hover:text-zinc-700 dark:hover:text-[#F0EBE3] p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-[#262520] transition-colors cursor-pointer"
                  title="Close"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Incident title and location */}
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-base text-zinc-950 dark:text-[#F0EBE3]">
              {alert?.title || 'Safety Emergency'}
            </h3>
            <p className="text-xs text-zinc-600 dark:text-[#B8B0A5] font-sans">
              {locationLabel}
            </p>
            {alert?.raised_by_name && (
              <p className="text-xs text-zinc-500 dark:text-[#7A7570] font-sans">
                Raised by <strong className="text-zinc-800 dark:text-[#F0EBE3]">{alert.raised_by_name}</strong>
                {alert.volunteer_team && <span> ({alert.volunteer_team})</span>}
              </p>
            )}
          </div>

          {/* Child & Parent Details */}
          {childName && (
            <div className="py-2.5 px-3.5 bg-white dark:bg-[#21211E] border border-zinc-200/80 dark:border-[#302E29] rounded-xl flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-medium text-zinc-900 dark:text-[#F0EBE3]">{childName}</span>
                {childAgeGroup && <span className="text-zinc-500 dark:text-[#7A7570]"> ({childAgeGroup})</span>}
                {parentName && <span className="text-zinc-500 dark:text-[#7A7570] block text-[11px]">Parent: {parentName}</span>}
              </div>
              {parentPhone && (
                <a
                  href={`tel:${parentPhone}`}
                  className="text-[11px] text-zinc-600 dark:text-[#B8B0A5] hover:text-zinc-900 dark:hover:text-[#F0EBE3] border border-zinc-200 dark:border-[#3A3835] px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-[#262520]"
                >
                  {parentPhone}
                </a>
              )}
            </div>
          )}

          {/* Distress message */}
          {alert?.message && (
            <div className="pl-3.5 border-l-2 border-red-500 dark:border-red-500/60 py-1 text-left">
              <p className="text-xs text-zinc-800 dark:text-[#F0EBE3] leading-relaxed font-sans">
                “{alert.message}”
              </p>
            </div>
          )}

          {/* Responder section: calm and honest */}
          <div className="p-3 bg-zinc-50 dark:bg-[#21211E] border border-zinc-200/80 dark:border-[#302E29] rounded-xl text-xs text-zinc-600 dark:text-[#B8B0A5] font-sans">
            <span className="font-medium text-zinc-800 dark:text-[#F0EBE3]">Responder: </span>
            <span>No responder yet</span>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-zinc-200/80 dark:border-[#302E29] flex items-center justify-between gap-3">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white dark:bg-[#21211E] hover:bg-zinc-50 dark:hover:bg-[#262520] border border-zinc-200 dark:border-[#3A3835] text-zinc-700 dark:text-[#F0EBE3] text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            ) : <div />}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAction(() => api.safetyAlerts.acknowledgeAndRespond(alertId, {}), 'ack', 'You are now leading this response')}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Acknowledge & respond
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* SHEET MODALS RENDERING                     */}
      {/* ========================================== */}
      
      {/* 1. ADD RESPONSE UPDATE SHEET */}
      <AnimatePresence>
        {showUpdateSheet && (
          <div className="fixed inset-0 bg-[#18181B]/40 dark:bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white dark:bg-[#1D1D1A] border-t sm:border border-transparent sm:border-zinc-200 dark:border-[#302E29] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="add-response-update-sheet-v1-premium"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-[#302E29] pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B] dark:text-[#F0EBE3]">Add Response Update</h3>
                <button onClick={() => setShowUpdateSheet(false)} className="text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#F0EBE3] bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider">Update Type</label>
                  <select 
                    value={updateType}
                    onChange={(e) => setUpdateType(e.target.value)}
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] focus:outline-hidden"
                  >
                    <option value="Team has arrived">Team has arrived</option>
                    <option value="Child located">Child located</option>
                    <option value="First aid started">First aid started</option>
                    <option value="Parent contact in progress">Parent contact in progress</option>
                    <option value="Pickup verification being reviewed">Pickup verification being reviewed</option>
                    <option value="Security checking location">Security checking location</option>
                    <option value="More support required">More support required</option>
                    <option value="General response update">General response update</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider">Note (Optional)</label>
                  <textarea 
                    value={updateNote}
                    onChange={(e) => setUpdateNote(e.target.value)}
                    placeholder="Provide optional structured details..."
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] h-20 resize-none focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1" data-component-version="response-update-visibility-ui-v1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider block">Visibility Scope</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {[
                      { key: 'response_team', label: 'Team Only', icon: Users },
                      { key: 'admins', label: 'Admin Only', icon: Lock },
                      { key: 'safe_requester_update', label: 'Requester Safe', icon: Eye }
                    ].map((v) => (
                      <button
                        key={v.key}
                        onClick={() => setUpdateVisibility(v.key)}
                        className={`flex flex-col items-center p-2.5 rounded-xl border text-center space-y-1 transition-all cursor-pointer ${
                          updateVisibility === v.key 
                            ? 'border-[#C59B27] bg-[#C59B27]/5 dark:bg-amber-950/20 text-[#C59B27] dark:text-amber-400'
                            : 'border-[#EAE8E1] dark:border-[#302E29] bg-[#FAF9F6] dark:bg-[#262520] text-zinc-500 dark:text-[#7A7570]'
                        }`}
                      >
                        <v.icon className="w-4 h-4" />
                        <span className="text-[9px] font-bold">{v.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    handleAction(() => api.safetyAlerts.addAlertResponseUpdate(alertId, {
                      updateType,
                      note: updateNote,
                      visibility: updateVisibility
                    }), 'add_update', 'Response update added successfully');
                    setShowUpdateSheet(false);
                    setUpdateNote('');
                  }}
                  className="w-full bg-[#C59B27] hover:bg-[#b58c22] text-white font-bold py-3 rounded-xl text-xs transition-all border-none cursor-pointer"
                >
                  Add Update
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. REQUEST ASSISTANCE SHEET */}
      <AnimatePresence>
        {showAssistanceSheet && (
          <div className="fixed inset-0 bg-[#18181B]/40 dark:bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white dark:bg-[#1D1D1A] border-t sm:border border-transparent sm:border-zinc-200 dark:border-[#302E29] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="request-response-assistance-sheet-v1"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-[#302E29] pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B] dark:text-[#F0EBE3]">Request Additional Support</h3>
                <button onClick={() => setShowAssistanceSheet(false)} className="text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#F0EBE3] bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider">Required Team</label>
                  <select 
                    value={assistanceTeamKey}
                    onChange={(e) => setAssistanceTeamKey(e.target.value)}
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] focus:outline-hidden"
                  >
                    <option value="first_aid">First Aid / Medical</option>
                    <option value="security">Security Team</option>
                    <option value="care_team">General Care Team</option>
                    <option value="logistics">Facilities / Logistics</option>
                    <option value="event_admin">Event Administrators</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider">Note / Assistance Reason</label>
                  <textarea 
                    value={assistanceNote}
                    onChange={(e) => setAssistanceNote(e.target.value)}
                    placeholder="Explain why backup support is required..."
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] h-20 resize-none focus:outline-hidden"
                  />
                </div>

                <button
                  onClick={() => {
                    handleAction(() => api.safetyAlerts.requestAlertAssistance(alertId, {
                      teamKey: assistanceTeamKey,
                      note: assistanceNote
                    }), 'request_assistance', 'Support request broadcast successfully');
                    setShowAssistanceSheet(false);
                    setAssistanceNote('');
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-xs transition-all border-none cursor-pointer"
                >
                  Broadcast Assistance Request
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. REQUEST HANDOVER SHEET */}
      <AnimatePresence>
        {showHandoverSheet && (
          <div className="fixed inset-0 bg-[#18181B]/40 dark:bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white dark:bg-[#1D1D1A] border-t sm:border border-transparent sm:border-zinc-200 dark:border-[#302E29] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="alert-response-handover-sheet-v1-premium"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-[#302E29] pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B] dark:text-[#F0EBE3]">Hand Over Case Responsibility</h3>
                <button onClick={() => setShowHandoverSheet(false)} className="text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#F0EBE3] bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4" data-component-version="response-handover-request-ui-v2">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider block">Find Eligible Target Responder</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search approved teammates..."
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] focus:outline-hidden"
                  />
                  
                  {searchingResponders && <p className="text-[10px] text-zinc-400 dark:text-[#7A7570]">Searching active duty roster...</p>}
                  
                  {eligibleResponders.length > 0 && (
                    <div className="border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl max-h-32 overflow-y-auto bg-white dark:bg-[#21211E] shadow-2xs mt-1 divide-y divide-zinc-100 dark:divide-[#302E29]">
                      {eligibleResponders.map((r: any) => (
                        <button
                          key={r.id}
                          onClick={() => {
                            setHandoverUserId(r.id);
                            setSearchQuery(r.fullName || r.full_name || 'Selected');
                            setEligibleResponders([]);
                          }}
                          className="w-full text-left p-2.5 hover:bg-zinc-50 dark:hover:bg-[#262520] text-xs flex justify-between items-center cursor-pointer border-none bg-transparent"
                        >
                          <div>
                            <p className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">{r.fullName || r.full_name}</p>
                            <p className="text-[10px] text-zinc-400 dark:text-[#7A7570]">{r.preferredTeam || r.assignedTeam || 'Active Responder'}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-[#7A7570]" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider">Transfer Reason</label>
                  <select 
                    value={handoverReason}
                    onChange={(e) => setHandoverReason(e.target.value)}
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] focus:outline-hidden"
                  >
                    <option value="Shift ending">Shift ending</option>
                    <option value="Leaving duty area">Leaving duty area</option>
                    <option value="More suitable team required">More suitable team required</option>
                    <option value="Device or connection problem">Device or connection problem</option>
                    <option value="Escalating to supervisor">Escalating to supervisor</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider">Transfer Note (Optional)</label>
                  <textarea 
                    value={handoverNote}
                    onChange={(e) => setHandoverNote(e.target.value)}
                    placeholder="Add brief details to pass over to the target responder..."
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] h-16 resize-none focus:outline-hidden"
                  />
                </div>

                <button
                  onClick={() => {
                    if (!handoverUserId) {
                      showError('Selection Required', 'Please select an eligible target responder.');
                      return;
                    }
                    handleAction(() => api.safetyAlerts.requestAlertHandover(alertId, {
                      targetUserId: handoverUserId,
                      reason: handoverReason,
                      note: handoverNote
                    }), 'request_handover', 'Handover transfer request sent');
                    setShowHandoverSheet(false);
                    setHandoverNote('');
                    setHandoverUserId('');
                    setSearchQuery('');
                  }}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl text-xs transition-all border-none cursor-pointer"
                >
                  Send Handover Request
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. ADMIN RESPONSE REASSIGNMENT SHEET */}
      <AnimatePresence>
        {showReassignmentSheet && (
          <div className="fixed inset-0 bg-[#18181B]/40 dark:bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white dark:bg-[#1D1D1A] border-t sm:border border-transparent sm:border-zinc-200 dark:border-[#302E29] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="admin-response-reassignment-sheet-v1"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-[#302E29] pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B] dark:text-[#F0EBE3]">Admin Reassign Responder</h3>
                <button onClick={() => setShowReassignmentSheet(false)} className="text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#F0EBE3] bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider block">Find Target Lead Responder</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search approved active teammates..."
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] focus:outline-hidden"
                  />
                  
                  {searchingResponders && <p className="text-[10px] text-zinc-400 dark:text-[#7A7570]">Searching active duty roster...</p>}
                  
                  {eligibleResponders.length > 0 && (
                    <div className="border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl max-h-32 overflow-y-auto bg-white dark:bg-[#21211E] shadow-2xs mt-1 divide-y divide-zinc-100 dark:divide-[#302E29]">
                      {eligibleResponders.map((r: any) => (
                        <button
                          key={r.id}
                          onClick={() => {
                            setReassignUserId(r.id);
                            setSearchQuery(r.fullName || r.full_name || 'Selected');
                            setEligibleResponders([]);
                          }}
                          className="w-full text-left p-2.5 hover:bg-zinc-50 dark:hover:bg-[#262520] text-xs flex justify-between items-center cursor-pointer border-none bg-transparent"
                        >
                          <div>
                            <p className="font-semibold text-zinc-800 dark:text-[#F0EBE3]">{r.fullName || r.full_name}</p>
                            <p className="text-[10px] text-zinc-400 dark:text-[#7A7570]">{r.preferredTeam || r.assignedTeam || 'Active Responder'}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-[#7A7570]" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider">Reason for Reassignment</label>
                  <input 
                    type="text"
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    placeholder="e.g., Unresponsive on duty, shift ending..."
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] focus:outline-hidden"
                  />
                </div>

                <button
                  onClick={() => {
                    if (!reassignUserId) {
                      showError('Selection Required', 'Please search and select a target responder.');
                      return;
                    }
                    if (!reassignReason.trim()) {
                      showError('Reason Required', 'Please provide a valid reason for reassignment.');
                      return;
                    }
                    handleAction(() => api.safetyAlerts.adminReassignAlertResponse(alertId, {
                      targetUserId: reassignUserId,
                      reason: reassignReason
                    }), 'reassign', 'Case lead successfully reassigned by admin');
                    setShowReassignmentSheet(false);
                    setReassignReason('');
                    setReassignUserId('');
                    setSearchQuery('');
                  }}
                  className="w-full bg-[#C59B27] hover:bg-[#b58c22] text-white font-bold py-3 rounded-xl text-xs transition-all border-none cursor-pointer"
                >
                  Confirm Reassignment
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. RESOLVE ALERT SHEET */}
      <AnimatePresence>
        {showResolveSheet && (
          <div className="fixed inset-0 bg-[#18181B]/40 dark:bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white dark:bg-[#1D1D1A] border-t sm:border border-transparent sm:border-zinc-200 dark:border-[#302E29] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="resolve-alert-response-sheet-v2-premium"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-[#302E29] pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B] dark:text-[#F0EBE3]">Resolve Security Alert</h3>
                <button onClick={() => setShowResolveSheet(false)} className="text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#F0EBE3] bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4" data-component-version="resolve-alert-response-ui-v3">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider">Resolution Outcome</label>
                  <select 
                    value={resolveOutcome}
                    onChange={(e) => setResolveOutcome(e.target.value)}
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] focus:outline-hidden"
                  >
                    <option value="Child assisted">Child assisted</option>
                    <option value="Child located safely">Child located safely</option>
                    <option value="First aid completed">First aid completed</option>
                    <option value="Parent contacted">Parent contacted</option>
                    <option value="Pickup concern resolved">Pickup concern resolved</option>
                    <option value="Check-in concern resolved">Check-in concern resolved</option>
                    <option value="Security concern resolved">Security concern resolved</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider">Resolution Summary (Required)</label>
                  <textarea 
                    value={resolveNote}
                    onChange={(e) => setResolveNote(e.target.value)}
                    placeholder="Summarize exact assessment, actions, or pickup verification findings..."
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] h-24 resize-none focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-[#FAF9F6] dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] rounded-xl">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-zinc-800 dark:text-[#F0EBE3] block">Follow-up Required</span>
                    <span className="text-[10px] text-zinc-400 dark:text-[#7A7570] block">Requires supervisor monitoring</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={resolveFollowUp}
                    onChange={(e) => setResolveFollowUp(e.target.checked)}
                    className="w-4 h-4 text-[#C59B27] border-zinc-300 dark:border-[#3A3835] rounded-sm focus:ring-[#C59B27] cursor-pointer"
                  />
                </div>

                <button
                  onClick={() => {
                    if (!resolveNote.trim()) {
                      showError('Note Required', 'Please provide a detailed resolution summary.');
                      return;
                    }
                    handleAction(() => api.safetyAlerts.resolveAlertResponse(alertId, {
                      outcome: resolveOutcome,
                      resolutionNote: resolveNote,
                      followUpRequired: resolveFollowUp
                    }), 'resolve', 'Alert successfully resolved and closed');
                    setShowResolveSheet(false);
                    setResolveNote('');
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs transition-all border-none cursor-pointer"
                >
                  Resolve and Complete Request
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. REOPEN ALERT SHEET */}
      <AnimatePresence>
        {showReopenSheet && (
          <div className="fixed inset-0 bg-[#18181B]/40 dark:bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white dark:bg-[#1D1D1A] border-t sm:border border-transparent sm:border-zinc-200 dark:border-[#302E29] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="reopen-alert-response-sheet-v1"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-[#302E29] pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B] dark:text-[#F0EBE3]">Reopen Closed Request</h3>
                <button onClick={() => setShowReopenSheet(false)} className="text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#F0EBE3] bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4" data-component-version="reopen-alert-response-ui-v1">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 dark:text-[#7A7570] font-bold uppercase tracking-wider">Reason for Reopening</label>
                  <textarea 
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Provide reason for reopening this concern..."
                    className="w-full bg-[#FAF9F6] dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl p-3 text-xs text-zinc-800 dark:text-[#F0EBE3] h-20 resize-none focus:outline-hidden"
                  />
                </div>

                <button
                  onClick={() => {
                    if (!reopenReason.trim()) {
                      showError('Reason Required', 'Please provide a valid reopening reason.');
                      return;
                    }
                    handleAction(() => api.safetyAlerts.reopenAlertResponse(alertId, {
                      reason: reopenReason
                    }), 'reopen', 'Request successfully reopened');
                    setShowReopenSheet(false);
                    setReopenReason('');
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl text-xs transition-all border-none cursor-pointer"
                >
                  Reopen and Dispatch Again
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showIncidentModal && (
        <IncidentEditModal
          alertId={alertId}
          currentUser={currentUser}
          onClose={() => setShowIncidentModal(false)}
        />
      )}

    </div>
  );
};

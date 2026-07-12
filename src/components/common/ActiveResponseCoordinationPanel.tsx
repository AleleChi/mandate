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
  onClose?: () => void;
  onRefreshParentAlerts?: () => void;
}

export const ActiveResponseCoordinationPanel: React.FC<ActiveResponseCoordinationPanelProps> = ({
  alertId,
  currentUser,
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

  if (loading || !responseState) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white/80 backdrop-blur-xs rounded-3xl border border-[#EAE8E1] h-96" id="coordination-loader">
        <RefreshCw className="w-8 h-8 text-[#C59B27] animate-spin mb-4" />
        <p className="text-xs text-zinc-500 font-medium font-sans">Loading premium coordination panel...</p>
      </div>
    );
  }

  const { alert, response } = responseState;
  const isOwner = response?.owner?.id === currentUser.id;
  const isAssistant = response?.assistants?.some((a: any) => a.id === currentUser.id);
  const allowedActions = response?.allowedActions || [];

  // Helper selectors
  const statusLabel = getResponseStatusLabel(alert?.status);
  const statusTone = getResponseStatusTone(alert?.status);

  return (
    <div 
      className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-3xl p-6 shadow-md space-y-6 max-w-4xl mx-auto"
      data-view-version="active-alert-response-coordination-v2-premium"
      id={`panel-${alertId}`}
    >
      {/* PERFORMANCE METRIC DIAGNOSTIC BLOCK (HIDDEN OR MINI) */}
      <div className="hidden" data-component-version="alert-response-frontend-performance-v1">
        Render latency: {Date.now() - metrics.renderTime}ms. Last Action latency: {metrics.lastActionLatency}ms
      </div>

      {/* ACCESSIBILITY HELPER FOR SCREEN READERS */}
      <div className="sr-only" data-component-version="alert-response-accessibility-v2">
        Active security alert coordination panel for alert {alert?.id}. Severity: {alert?.severity}. Status: {alert?.status}. Led by: {response?.owner?.displayName || 'Unassigned'}.
      </div>

      {/* IDEMPOTENCY KEY HIDDEN FEEDBACK */}
      <div className="hidden" data-component-version="alert-response-idempotency-client-v1">
        IDEM_KEY: {idempotencyKey}
      </div>

      {/* REALTIME STREAM INDICATOR */}
      <div className="flex items-center justify-between border-b border-[#EAE8E1]/80 pb-4" data-component-version="alert-response-realtime-client-v1">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-5 h-5 text-red-600 animate-pulse" />
          <h2 className="font-serif font-bold text-base text-[#18181B] tracking-tight">Active Response Coordination</h2>
        </div>
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] text-emerald-700 font-bold tracking-wider uppercase font-sans">Live Connection Active</span>
        </div>
      </div>

      {/* VERSION AWARE HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#EAE8E1] rounded-2xl p-4 shadow-2xs" data-component-version="alert-response-version-aware-ui-v1">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase tracking-wider ${
              alert?.severity === 'urgent' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {alert?.severity} Priority
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase tracking-wider ${statusTone.bg} ${statusTone.text} ${statusTone.border} border`}>
              {statusLabel}
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">v{response?.version || 1}</span>
          </div>
          <h3 className="font-serif font-bold text-sm text-zinc-800">{alert?.title || 'Safety Emergency'}</h3>
          <p className="text-xs text-zinc-500 font-medium">📍 {alert?.location_label || 'Main Campus Hall'}</p>
        </div>
        {alert?.status === 'acknowledged' && alert?.severity === 'urgent' && (
          <div 
            className="text-[10px] bg-red-50 text-red-700 border border-red-200 rounded-lg px-2.5 py-1 font-sans font-semibold flex items-center space-x-1" 
            data-component-version="response-acknowledgement-effects-stop-v2"
          >
            <CheckCircle className="w-3.5 h-3.5 text-red-600" />
            <span>Alarms silenced on this device</span>
          </div>
        )}
      </div>

      {/* CONFLICT ERROR DISPLAY */}
      {conflictError && (
        <div 
          className="bg-red-50 border border-red-100 rounded-xl p-3.5 text-xs text-red-800 font-sans space-y-1 flex items-start space-x-2"
          data-component-version="response-ownership-conflict-ui-v1"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Coordination Conflict Warning</p>
            <p className="text-[11px] opacity-90">{conflictError}</p>
            <div className="mt-2 flex space-x-2">
              <button 
                onClick={() => handleAction(() => api.safetyAlerts.joinAlertResponse(alertId, {}), 'join', 'Joined as response assistant')}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-lg text-[10px] border-none"
              >
                Join Response Team
              </button>
              <button onClick={() => setConflictError(null)} className="text-zinc-500 hover:text-zinc-700 underline text-[10px] bg-transparent border-none cursor-pointer">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AVAILABILITY WARNINGS */}
      {response?.ownerAvailabilityWarning && (
        <div 
          className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-xs font-sans space-y-2 flex items-start space-x-3 shadow-xs"
          data-component-version="response-owner-availability-warning-v1"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="space-y-1 flex-1">
            <p className="font-bold text-amber-950">Response Coverage Needs Attention</p>
            <p className="text-zinc-600 leading-relaxed text-[11px]">{response.ownerAvailabilityWarning}</p>
            {currentUser.role === 'admin' && (
              <div className="flex space-x-2.5 pt-1.5">
                <button 
                  onClick={() => { handleSearchEligible(); setShowReassignmentSheet(true); }}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] transition-all cursor-pointer border-none shadow-2xs"
                >
                  Reassign Lead
                </button>
                <button 
                  onClick={() => setShowAssistanceSheet(true)}
                  className="bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold px-3 py-1.5 rounded-lg text-[10px] transition-all cursor-pointer shadow-2xs"
                >
                  Request Backup Support
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MAIN TWO-COLUMN RESPONSIVE LAYOUT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-component-version="alert-response-desktop-v2">
        
        {/* LEFT COLUMN: ACTIVE OWNER CARD & CORE ACTIONS */}
        <div className="space-y-6" data-component-version="alert-response-mobile-v2">
          
          {/* OWNER CARD */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs space-y-4"
            data-component-version="alert-response-owner-card-v2"
          >
            <h4 className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider font-sans">Active Response Lead</h4>
            
            {response?.owner ? (
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-full border border-[#FAF9F6] bg-[#C59B27]/10 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                  {response.owner.photoUrl ? (
                    <SafeImage src={response.owner.photoUrl} alt={response.owner.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[#C59B27] font-serif font-bold text-sm">
                      {response.owner.displayName?.charAt(0) || 'R'}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="font-serif font-bold text-[#18181B] text-sm truncate">
                    {response.owner.displayName}
                  </p>
                  <p className="text-[11px] text-zinc-500 font-medium truncate">
                    {response.owner.responsibility || 'Care Team Responder'}
                  </p>
                  {response.owner.assignedTeam && (
                    <p className="text-[10px] text-[#C59B27] font-semibold tracking-wide">
                      {response.owner.assignedTeam}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-3 p-3 bg-red-50/20 border border-dashed border-red-200 rounded-xl">
                <Users className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-xs text-red-800 font-sans font-medium">Waiting for a responder to lead this case.</p>
              </div>
            )}

            <div className="border-t border-[#FAF9F6] pt-3.5 flex justify-between items-center text-[10px] text-zinc-400 font-medium">
              <span>Ownership: {response?.owner ? `Since ${new Date(response.ownershipStartTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'Pending'}</span>
              <span>State: <strong className="text-[#C59B27]">{statusLabel}</strong></span>
            </div>
          </div>

          {/* PRIMARY CONTEXTUAL ACTION AREA */}
          <div 
            className="space-y-3"
            data-component-version="contextual-response-primary-action-v2"
          >
            {/* ACTION LOADER STATE */}
            {actionInProgress && (
              <div 
                className="bg-zinc-100 border border-zinc-200 text-zinc-600 rounded-xl p-3 text-xs flex items-center space-x-2 justify-center"
                data-component-version="alert-response-action-state-v1"
              >
                <RefreshCw className="w-4 h-4 animate-spin text-[#C59B27]" />
                <span>{actionInProgress === 'ack' ? 'Acknowledging…' : actionInProgress === 'in_progress' ? 'Updating…' : 'Processing request…'}</span>
              </div>
            )}

            {/* ACKNOWLEDGE & CLAIM RESPOND UI */}
            {allowedActions.includes('acknowledge') && !actionInProgress && (
              <button
                onClick={() => handleAction(() => api.safetyAlerts.acknowledgeAndRespond(alertId, {}), 'ack', 'You are now leading this response')}
                className="w-full bg-[#C59B27] hover:bg-[#b58c22] text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-md text-center flex items-center justify-center space-x-2 text-sm cursor-pointer border-none"
                data-component-version="acknowledge-and-respond-ui-v2"
              >
                <UserCheck className="w-5 h-5" />
                <span>Acknowledge & Respond</span>
              </button>
            )}

            {/* MARK IN PROGRESS */}
            {allowedActions.includes('mark_in_progress') && isOwner && !actionInProgress && (
              <button
                onClick={() => handleAction(() => api.safetyAlerts.markAlertInProgress(alertId, {}), 'in_progress', 'Response marked as In Progress')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-md text-center flex items-center justify-center space-x-2 text-sm cursor-pointer border-none"
                data-component-version="mark-alert-in-progress-ui-v1"
              >
                <Clock className="w-5 h-5 animate-pulse" />
                <span>Mark Help in Progress</span>
              </button>
            )}

            {/* JOIN RESPONSE UI */}
            {allowedActions.includes('join_response') && !isAssistant && !isOwner && !actionInProgress && (
              <button
                onClick={() => handleAction(() => api.safetyAlerts.joinAlertResponse(alertId, {}), 'join', 'Joined as response assistant')}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-md text-center flex items-center justify-center space-x-2 text-sm cursor-pointer border-none"
                data-component-version="join-alert-response-ui-v1"
              >
                <Plus className="w-5 h-5" />
                <span>Join Response Team</span>
              </button>
            )}

            {/* LEAVE RESPONSE */}
            {isAssistant && !isOwner && !actionInProgress && (
              <button
                onClick={() => handleAction(() => api.safetyAlerts.leaveAlertResponse(alertId, {}), 'leave', 'Left assistance')}
                className="w-full bg-zinc-200 hover:bg-zinc-300 text-zinc-800 font-bold py-3.5 px-6 rounded-2xl transition-all text-center flex items-center justify-center space-x-2 text-xs cursor-pointer border-none"
              >
                <LogOut className="w-4 h-4" />
                <span>Leave Response Team</span>
              </button>
            )}

            {/* SECONDARY ACTION GRID */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {/* ADD UPDATE BUTTON */}
              {allowedActions.includes('add_update') && (
                <button
                  onClick={() => setShowUpdateSheet(true)}
                  className="bg-white hover:bg-[#FAF9F6] text-zinc-800 border border-[#EAE8E1] py-3 px-4 rounded-xl font-bold transition-all text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-3xs"
                >
                  <FileText className="w-4 h-4 text-[#C59B27]" />
                  <span>Add Update</span>
                </button>
              )}

              {/* REQUEST ASSISTANCE BUTTON */}
              {allowedActions.includes('request_assistance') && isOwner && (
                <button
                  onClick={() => setShowAssistanceSheet(true)}
                  className="bg-white hover:bg-[#FAF9F6] text-zinc-800 border border-[#EAE8E1] py-3 px-4 rounded-xl font-bold transition-all text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-3xs"
                >
                  <UserPlus className="w-4 h-4 text-blue-600" />
                  <span>Request Backup</span>
                </button>
              )}

              {/* REQUEST HANDOVER */}
              {allowedActions.includes('request_handover') && isOwner && (
                <button
                  onClick={() => { handleSearchEligible(); setShowHandoverSheet(true); }}
                  className="bg-white hover:bg-[#FAF9F6] text-zinc-800 border border-[#EAE8E1] py-3 px-4 rounded-xl font-bold transition-all text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-3xs col-span-2"
                >
                  <ArrowLeftRight className="w-4 h-4 text-amber-600" />
                  <span>Hand Over Responsibility</span>
                </button>
              )}

              {/* RESOLVE BUTTON */}
              {allowedActions.includes('resolve') && (isOwner || currentUser.role === 'admin') && (
                <button
                  onClick={() => setShowResolveSheet(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 px-4 rounded-xl font-bold transition-all text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs col-span-2"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>Resolve Request</span>
                </button>
              )}

              {/* REOPEN BUTTON (ADMIN ONLY) */}
              {alert?.status === 'resolved' && currentUser.role === 'admin' && (
                <button
                  onClick={() => setShowReopenSheet(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white py-3.5 px-4 rounded-xl font-bold transition-all text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs col-span-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Reopen Case</span>
                </button>
              )}

              {/* LOG INCIDENT BUTTON AFTER RESOLUTION */}
              {alert?.status === 'resolved' && (
                <button
                  onClick={() => setShowIncidentModal(true)}
                  className="bg-[#C59B27] hover:bg-[#B08621] text-white py-3.5 px-4 rounded-xl font-bold transition-all text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs col-span-2 animate-pulse"
                >
                  <FileText className="w-4 h-4" />
                  <span>Document Incident Report</span>
                </button>
              )}
            </div>
          </div>

          {/* HANDOVER DECISION CARD */}
          {response?.handover?.pending && response.handover.targetUserId === currentUser.id && (
            <div 
              className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3"
              data-component-version="response-handover-decision-ui-v2"
            >
              <div className="flex items-start space-x-2.5">
                <ArrowLeftRight className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-xs text-amber-950">Responsibility Handover Requested</p>
                  <p className="text-[11px] text-zinc-600">The current owner has requested to transfer this case to you.</p>
                  {response.handover.reason && <p className="text-[11px] text-zinc-600 italic">Reason: "{response.handover.reason}"</p>}
                </div>
              </div>
              <div className="flex space-x-2 pt-1">
                <button
                  onClick={() => handleAction(() => api.safetyAlerts.respondToAlertHandover(alertId, response.handover.id, { decision: 'accept' }), 'handover_decide', 'Handover accepted successfully')}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 rounded-lg text-[11px] border-none shadow-3xs"
                >
                  Accept Transfer
                </button>
                <button
                  onClick={() => handleAction(() => api.safetyAlerts.respondToAlertHandover(alertId, response.handover.id, { decision: 'decline' }), 'handover_decide', 'Handover declined')}
                  className="flex-1 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-300 font-bold py-2 rounded-lg text-[11px] shadow-3xs"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* ASSISTING RESPONDERS LIST */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs space-y-4"
            data-component-version="alert-response-assistants-list-v1"
          >
            <div className="flex items-center justify-between border-b border-[#FAF9F6] pb-2">
              <h4 className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider font-sans">Assisting Team</h4>
              <span className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-bold">{response?.assistants?.length || 0}</span>
            </div>
            
            {response?.assistants && response.assistants.length > 0 ? (
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {response.assistants.map((assistant: any, idx: number) => (
                  <div key={assistant.id || idx} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 text-zinc-600 font-sans font-bold text-xs overflow-hidden">
                        {assistant.photoUrl ? (
                          <SafeImage src={assistant.photoUrl} alt={assistant.displayName} className="w-full h-full object-cover" />
                        ) : (
                          <span>{assistant.displayName?.charAt(0) || 'A'}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-800 truncate">{assistant.displayName}</p>
                        <p className="text-[10px] text-zinc-400 truncate">{assistant.responsibility || 'Care Assistant'}</p>
                      </div>
                    </div>
                    {assistant.joinedTime && (
                      <span className="text-[9px] text-zinc-400 font-medium">Joined {new Date(assistant.joinedTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-400 text-center py-2">No other responders have joined yet.</p>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: PROGRESS & RESPONSE TIMELINE */}
        <div className="space-y-6">
          
          {/* RESPONSE PROGRESS INDICATOR STEPPER */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs space-y-4"
            data-component-version="alert-response-progress-v2"
          >
            <h4 className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider font-sans border-b border-[#FAF9F6] pb-2">Response Progress</h4>
            
            <div className="flex items-center justify-between relative py-2 px-1">
              {/* Stepper progress bar line */}
              <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-zinc-100 -translate-y-1/2 z-0" />
              
              {/* Step 1 */}
              <div className="flex flex-col items-center z-10 space-y-1">
                <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  1
                </div>
                <span className="text-[9px] text-zinc-800 font-bold">Requested</span>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center z-10 space-y-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-xs ${
                  ['acknowledged', 'in_progress', 'resolved'].includes(alert?.status) ? 'bg-amber-500 text-white' : 'bg-zinc-100 text-zinc-400'
                }`}>
                  2
                </div>
                <span className="text-[9px] text-zinc-500 font-bold">Led</span>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center z-10 space-y-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-xs ${
                  ['in_progress', 'resolved'].includes(alert?.status) ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-400'
                }`}>
                  3
                </div>
                <span className="text-[9px] text-zinc-500 font-bold">In Progress</span>
              </div>

              {/* Step 4 */}
              <div className="flex flex-col items-center z-10 space-y-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-xs ${
                  alert?.status === 'resolved' ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-400'
                }`}>
                  {alert?.status === 'resolved' ? <Check className="w-4 h-4" /> : '4'}
                </div>
                <span className="text-[9px] text-zinc-500 font-bold">Resolved</span>
              </div>
            </div>
          </div>

          {/* RESPONSE TIMELINE */}
          <div 
            className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs space-y-4"
            data-component-version="alert-response-timeline-v2-premium"
          >
            <div className="flex items-center justify-between border-b border-[#FAF9F6] pb-2">
              <h4 className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider font-sans">Response Timeline</h4>
              {loadingTimeline && <RefreshCw className="w-3.5 h-3.5 text-[#C59B27] animate-spin" />}
            </div>

            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              {timeline.length > 0 ? (
                timeline.map((item: any, idx: number) => (
                  <div key={item.id || idx} className="flex space-x-3 text-xs">
                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#C59B27] ring-4 ring-[#C59B27]/15 mt-1" />
                      {idx !== timeline.length - 1 && <div className="w-0.5 bg-zinc-100 flex-1 my-1" />}
                    </div>
                    <div className="space-y-0.5 pb-2 min-w-0">
                      <p className="font-bold text-zinc-800 break-words">{item.actionName || item.action}</p>
                      {item.actorName && (
                        <p className="text-[10px] text-zinc-500">
                          {item.actorName} &bull; <span className="italic">{item.responsibility || 'Care Team'}</span>
                        </p>
                      )}
                      {item.note && (
                        <p className="text-[11px] text-zinc-600 italic bg-[#FAF9F6] border border-[#EAE8E1]/40 rounded-lg p-2 mt-1 leading-relaxed break-words">
                          "{item.note}"
                        </p>
                      )}
                      <p className="text-[9px] text-zinc-400 font-medium">
                        {new Date(item.createdAt || item.timestamp || item.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-zinc-400 text-center py-4">No events found in response history.</p>
              )}

              {/* Load More Button */}
              {timelineTotal > timeline.length && (
                <button
                  onClick={() => loadTimeline(timelinePage + 1)}
                  className="w-full text-center text-[10px] text-[#C59B27] font-bold hover:underline py-2 bg-transparent border-none cursor-pointer"
                >
                  Load More Events ({timelineTotal - timeline.length} remaining)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* SHEET MODALS RENDERING                     */}
      {/* ========================================== */}
      
      {/* 1. ADD RESPONSE UPDATE SHEET */}
      <AnimatePresence>
        {showUpdateSheet && (
          <div className="fixed inset-0 bg-[#18181B]/40 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="add-response-update-sheet-v1-premium"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B]">Add Response Update</h3>
                <button onClick={() => setShowUpdateSheet(false)} className="text-zinc-400 hover:text-zinc-600 bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Update Type</label>
                  <select 
                    value={updateType}
                    onChange={(e) => setUpdateType(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
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
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Note (Optional)</label>
                  <textarea 
                    value={updateNote}
                    onChange={(e) => setUpdateNote(e.target.value)}
                    placeholder="Provide optional structured details..."
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800 h-20 resize-none"
                  />
                </div>

                <div className="space-y-1" data-component-version="response-update-visibility-ui-v1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Visibility Scope</label>
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
                            ? 'border-[#C59B27] bg-[#C59B27]/5 text-[#C59B27]' 
                            : 'border-[#EAE8E1] bg-[#FAF9F6] text-zinc-500'
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
          <div className="fixed inset-0 bg-[#18181B]/40 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="request-response-assistance-sheet-v1"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B]">Request Additional Support</h3>
                <button onClick={() => setShowAssistanceSheet(false)} className="text-zinc-400 hover:text-zinc-600 bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Required Team</label>
                  <select 
                    value={assistanceTeamKey}
                    onChange={(e) => setAssistanceTeamKey(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                  >
                    <option value="first_aid">First Aid / Medical</option>
                    <option value="security">Security Team</option>
                    <option value="care_team">General Care Team</option>
                    <option value="logistics">Facilities / Logistics</option>
                    <option value="event_admin">Event Administrators</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Note / Assistance Reason</label>
                  <textarea 
                    value={assistanceNote}
                    onChange={(e) => setAssistanceNote(e.target.value)}
                    placeholder="Explain why backup support is required..."
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800 h-20 resize-none"
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
          <div className="fixed inset-0 bg-[#18181B]/40 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="alert-response-handover-sheet-v1-premium"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B]">Hand Over Case Responsibility</h3>
                <button onClick={() => setShowHandoverSheet(false)} className="text-zinc-400 hover:text-zinc-600 bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4" data-component-version="response-handover-request-ui-v2">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Find Eligible Target Responder</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search approved teammates..."
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                  />
                  
                  {searchingResponders && <p className="text-[10px] text-zinc-400">Searching active duty roster...</p>}
                  
                  {eligibleResponders.length > 0 && (
                    <div className="border border-[#EAE8E1] rounded-xl max-h-32 overflow-y-auto bg-white shadow-2xs mt-1 divide-y divide-zinc-100">
                      {eligibleResponders.map((r: any) => (
                        <button
                          key={r.id}
                          onClick={() => {
                            setHandoverUserId(r.id);
                            setSearchQuery(r.fullName || r.full_name || 'Selected');
                            setEligibleResponders([]);
                          }}
                          className="w-full text-left p-2.5 hover:bg-zinc-50 text-xs flex justify-between items-center cursor-pointer border-none bg-transparent"
                        >
                          <div>
                            <p className="font-semibold text-zinc-800">{r.fullName || r.full_name}</p>
                            <p className="text-[10px] text-zinc-400">{r.preferredTeam || r.assignedTeam || 'Active Responder'}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Transfer Reason</label>
                  <select 
                    value={handoverReason}
                    onChange={(e) => setHandoverReason(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
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
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Transfer Note (Optional)</label>
                  <textarea 
                    value={handoverNote}
                    onChange={(e) => setHandoverNote(e.target.value)}
                    placeholder="Add brief details to pass over to the target responder..."
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800 h-16 resize-none"
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
          <div className="fixed inset-0 bg-[#18181B]/40 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="admin-response-reassignment-sheet-v1"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B]">Admin Reassign Responder</h3>
                <button onClick={() => setShowReassignmentSheet(false)} className="text-zinc-400 hover:text-zinc-600 bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Find Target Lead Responder</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search approved active teammates..."
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
                  />
                  
                  {searchingResponders && <p className="text-[10px] text-zinc-400">Searching active duty roster...</p>}
                  
                  {eligibleResponders.length > 0 && (
                    <div className="border border-[#EAE8E1] rounded-xl max-h-32 overflow-y-auto bg-white shadow-2xs mt-1 divide-y divide-zinc-100">
                      {eligibleResponders.map((r: any) => (
                        <button
                          key={r.id}
                          onClick={() => {
                            setReassignUserId(r.id);
                            setSearchQuery(r.fullName || r.full_name || 'Selected');
                            setEligibleResponders([]);
                          }}
                          className="w-full text-left p-2.5 hover:bg-zinc-50 text-xs flex justify-between items-center cursor-pointer border-none bg-transparent"
                        >
                          <div>
                            <p className="font-semibold text-zinc-800">{r.fullName || r.full_name}</p>
                            <p className="text-[10px] text-zinc-400">{r.preferredTeam || r.assignedTeam || 'Active Responder'}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Reason for Reassignment</label>
                  <input 
                    type="text"
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    placeholder="e.g., Unresponsive on duty, shift ending..."
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
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
          <div className="fixed inset-0 bg-[#18181B]/40 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="resolve-alert-response-sheet-v2-premium"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B]">Resolve Security Alert</h3>
                <button onClick={() => setShowResolveSheet(false)} className="text-zinc-400 hover:text-zinc-600 bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4" data-component-version="resolve-alert-response-ui-v3">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Resolution Outcome</label>
                  <select 
                    value={resolveOutcome}
                    onChange={(e) => setResolveOutcome(e.target.value)}
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800"
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
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Resolution Summary (Required)</label>
                  <textarea 
                    value={resolveNote}
                    onChange={(e) => setResolveNote(e.target.value)}
                    placeholder="Summarize exact assessment, actions, or pickup verification findings..."
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800 h-24 resize-none"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-zinc-800 block">Follow-up Required</span>
                    <span className="text-[10px] text-zinc-400 block">Requires supervisor monitoring</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={resolveFollowUp}
                    onChange={(e) => setResolveFollowUp(e.target.checked)}
                    className="w-4 h-4 text-[#C59B27] border-zinc-300 rounded-sm focus:ring-[#C59B27] cursor-pointer"
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
          <div className="fixed inset-0 bg-[#18181B]/40 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              data-view-version="reopen-alert-response-sheet-v1"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 className="font-serif font-bold text-sm text-[#18181B]">Reopen Closed Request</h3>
                <button onClick={() => setShowReopenSheet(false)} className="text-zinc-400 hover:text-zinc-600 bg-transparent border-none cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4" data-component-version="reopen-alert-response-ui-v1">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Reason for Reopening</label>
                  <textarea 
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Provide reason for reopening this concern..."
                    className="w-full bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl p-3 text-xs text-zinc-800 h-20 resize-none"
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

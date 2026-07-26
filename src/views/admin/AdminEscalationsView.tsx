import React, { useEffect, useState } from 'react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { ModuleLoadingState } from '../../components/common/ModuleLoadingState';
import { KoinoniaErrorState } from '../../components/common/KoinoniaErrorState';
import { 
  ShieldAlert, Plus, Settings, RefreshCw, Trash2, Calendar, 
  CheckCircle, HelpCircle, Eye, AlertTriangle, X, ChevronRight, 
  Play, Square, BellRing, Info, ShieldAlert as AlertIcon, Users, Sliders
} from 'lucide-react';

// Proof: data-component-version="shared-admin-escalations-view-v3-premium"

export const AdminEscalationsView: React.FC = () => {
  const { showError, showSuccess, showInfo } = useNotification();
  
  // App States
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('event-ga-2026');
  const [policies, setPolicies] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  
  // UX / Loading States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [mainError, setMainError] = useState<string | null>(null);
  const [partialHistoryError, setPartialHistoryError] = useState<boolean>(false);
  const [partialCyclesError, setPartialCyclesError] = useState<boolean>(false);
  const [viewTab, setViewTab] = useState<'policies' | 'cycles' | 'history'>('policies');

  // Delete Policy Modal State
  const [deletingPolicyId, setDeletingPolicyId] = useState<string | null>(null);

  // Preview Policy Modal State
  const [previewPolicy, setPreviewPolicy] = useState<any | null>(null);

  // Form State
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState<any>({
    name: '',
    policy_scope: 'event_default',
    condition_key: 'alert_not_acknowledged',
    severity: '',
    category_key: '',
    priority: 10,
    is_enabled: true,
    steps: []
  });

  // 1. Initial Load of Events and Configuration
  const loadAllEvents = async () => {
    try {
      const res = await api.admin.getEvents();
      if (res.success && res.events && res.events.length > 0) {
        setEvents(res.events);
        // Default to the 'current' or active event if exists
        const currentEvent = res.events.find((e: any) => e.status === 'current' || e.status === 'active');
        if (currentEvent) {
          setSelectedEventId(currentEvent.id);
          return currentEvent.id;
        } else {
          setSelectedEventId(res.events[0].id);
          return res.events[0].id;
        }
      }
    } catch (err) {
      console.error('Failed to load events:', err);
    }
    return 'event-ga-2026'; // fallback ID
  };

  // 2. Main Data Loading Function
  const loadModuleData = async (eventId: string, isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
      setMainError(null);
    }
    setPartialHistoryError(false);
    setPartialCyclesError(false);

    try {
      // Fetch Policies
      const polRes = await api.escalation.getPolicies(eventId);
      if (polRes.success) {
        setPolicies(polRes.policies);
      } else {
        throw new Error('Failed to fetch escalation policies.');
      }

      // Fetch History logs (Partial Failure Safety)
      try {
        const histRes = await api.escalation.getHistory(eventId);
        if (histRes.success) {
          setHistory(histRes.history || []);
        } else {
          setPartialHistoryError(true);
        }
      } catch (histErr) {
        console.error('[Partial Section Failure] History Logs:', histErr);
        setPartialHistoryError(true);
      }

      // Fetch Active Cycles (Partial Failure Safety)
      try {
        const cyclesRes = await api.escalation.getCycles(eventId);
        if (cyclesRes.success) {
          setCycles(cyclesRes.cycles || []);
        } else {
          setPartialCyclesError(true);
        }
      } catch (cyclesErr) {
        console.error('[Partial Section Failure] Active Cycles:', cyclesErr);
        setPartialCyclesError(true);
      }

    } catch (err) {
      if (!isSilent) {
        setMainError('Escalation policies could not be loaded.');
      } else {
        showError('Update Failed', 'Connection problem when fetching the latest escalation policies.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Run on mount
  useEffect(() => {
    const init = async () => {
      const activeId = await loadAllEvents();
      await loadModuleData(activeId, false);
    };
    init();
  }, []);

  // Handle Event switcher
  const handleEventChange = async (eventId: string) => {
    setSelectedEventId(eventId);
    await loadModuleData(eventId, false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadModuleData(selectedEventId, true);
  };

  // Form Operations
  const handleEdit = (policy: any) => {
    setEditingPolicyId(policy.id);
    setPolicyForm({
      name: policy.name,
      policy_scope: policy.policy_scope,
      condition_key: policy.condition_key,
      severity: policy.severity || '',
      category_key: policy.category_key || '',
      priority: policy.priority,
      is_enabled: policy.is_enabled === 1 || policy.is_enabled === true,
      steps: policy.steps || []
    });
    setIsEditing(true);
  };

  const handleCreateNew = () => {
    setEditingPolicyId(null);
    setPolicyForm({
      name: 'High-Severity Unanswered Care Escalation',
      policy_scope: 'event_default',
      condition_key: 'alert_not_acknowledged',
      severity: '',
      category_key: '',
      priority: 25,
      is_enabled: true,
      steps: [
        {
          step_order: 1,
          wait_seconds: 45,
          target_type: 'team',
          target_team_key: 'Admins',
          channels: 'push,email',
          maximum_attempts: 1,
          cooldown_seconds: 60
        }
      ]
    });
    setIsEditing(true);
  };

  const handleAddStep = () => {
    const nextOrder = policyForm.steps.length + 1;
    setPolicyForm({
      ...policyForm,
      steps: [
        ...policyForm.steps,
        {
          step_order: nextOrder,
          wait_seconds: 60,
          target_type: 'team',
          target_team_key: 'Admins',
          channels: 'push',
          maximum_attempts: 1,
          cooldown_seconds: 60
        }
      ]
    });
  };

  const handleRemoveStep = (index: number) => {
    const updated = policyForm.steps.filter((_: any, i: number) => i !== index).map((s: any, idx: number) => ({
      ...s,
      step_order: idx + 1
    }));
    setPolicyForm({
      ...policyForm,
      steps: updated
    });
  };

  const handleStepChange = (index: number, key: string, value: any) => {
    const updated = [...policyForm.steps];
    updated[index] = {
      ...updated[index],
      [key]: value
    };
    setPolicyForm({
      ...policyForm,
      steps: updated
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyForm.name.trim()) {
      showError('Validation Error', 'Policy name is required.');
      return;
    }
    if (policyForm.steps.length === 0) {
      showError('Validation Error', 'At least one escalation sequence step must be defined.');
      return;
    }

    try {
      const payload = {
        ...policyForm,
        event_id: selectedEventId,
        is_enabled: policyForm.is_enabled ? 1 : 0
      };

      if (editingPolicyId) {
        await api.escalation.updatePolicy(editingPolicyId, payload);
        showSuccess('Policy Matrix Updated', 'The escalation rule was successfully synchronized with the sentinel engine.');
      } else {
        await api.escalation.createPolicy(payload);
        showSuccess('Policy Created', 'New sentinel protection matrix initialized.');
      }
      setIsEditing(false);
      loadModuleData(selectedEventId, true);
    } catch (err) {
      showError('Action Failed', extractApiError(err).message || 'Failed to save escalation policy.');
    }
  };

  const confirmDeletePolicy = async (policyId: string) => {
    try {
      await api.escalation.deletePolicy(policyId);
      showSuccess('Rule Removed', 'The escalation rule was successfully removed.');
      setDeletingPolicyId(null);
      loadModuleData(selectedEventId, true);
    } catch (err) {
      showError('Action Failed', extractApiError(err).message || 'Failed to remove escalation policy.');
    }
  };

  const handleDelete = (policyId: string) => {
    setDeletingPolicyId(policyId);
  };

  // Human readability helper formatters
  const getHumanPriority = (priorityNum: number) => {
    if (priorityNum >= 20) return 'Critical priority';
    if (priorityNum >= 10) return 'High priority';
    if (priorityNum >= 5) return 'Standard priority';
    return 'Low priority';
  };

  const getHumanTrigger = (key: string) => {
    switch (key) {
      case 'alert_not_acknowledged':
        return 'A safety alert has not been acknowledged';
      case 'alert_handover_unanswered':
        return 'A handover request has not been answered';
      case 'alert_assistance_unanswered':
        return 'An assistance request is waiting for response';
      case 'incident_follow_up_overdue':
        return 'An incident follow-up is overdue';
      default:
        return key ? key.replace(/_/g, ' ') : 'Alert condition triggered';
    }
  };

  const humanizeChannels = (channelsStr: string) => {
    if (!channelsStr) return 'push notification';
    const parts = channelsStr.split(',').map(c => c.trim().toLowerCase());
    const mapped = parts.map(c => {
      if (c === 'push') return 'push notification';
      if (c === 'email') return 'email';
      if (c === 'whatsapp') return 'WhatsApp';
      if (c === 'sms') return 'SMS';
      return c;
    });
    if (mapped.length === 1) return mapped[0];
    if (mapped.length === 2) return `${mapped[0]} and ${mapped[1]}`;
    return `${mapped.slice(0, -1).join(', ')} and ${mapped[mapped.length - 1]}`;
  };

  const humanizeTarget = (targetKey: string | undefined | null) => {
    if (!targetKey) return 'administrators and coordinators';
    if (targetKey === 'Admins') return 'administrators and coordinators';
    if (targetKey === 'Medical Team') return 'medical response team';
    if (targetKey.includes('Ages')) return `${targetKey} supervisors`;
    if (targetKey === 'admin') return 'platform administrators';
    if (targetKey === 'volunteer') return 'on-duty volunteers';
    return targetKey;
  };

  // Active Cycles Manual Controls
  const handleNotifyBackup = async (cycleId: string) => {
    try {
      const res = await api.escalation.notifyBackup(cycleId);
      if (res.success) {
        showSuccess('Backup Dispatched', res.message || 'Secondary alerts successfully routed.');
        loadModuleData(selectedEventId, true);
      }
    } catch (err) {
      showError('Action Failed', extractApiError(err).message || 'Failed to notify backup recipients.');
    }
  };

  const handleCancelCycle = async (cycleId: string) => {
    try {
      const res = await api.escalation.cancelCycle(cycleId);
      if (res.success) {
        showInfo('Escalation Terminated', res.message || 'Active cycle stopped.');
        loadModuleData(selectedEventId, true);
      }
    } catch (err) {
      showError('Action Failed', extractApiError(err).message || 'Failed to terminate active cycle.');
    }
  };

  const handleRestartCycle = async (cycleId: string) => {
    try {
      const res = await api.escalation.restartCycle(cycleId);
      if (res.success) {
        showSuccess('Cycle Reset', res.message || 'Escalation timeline restarted from Step 1.');
        loadModuleData(selectedEventId, true);
      }
    } catch (err) {
      showError('Action Failed', extractApiError(err).message || 'Failed to restart active cycle.');
    }
  };

  // Helper to trigger direct toggle
  const handleTogglePolicyEnabled = async (policy: any) => {
    try {
      const updatedPayload = {
        ...policy,
        is_enabled: policy.is_enabled === 1 ? 0 : 1
      };
      await api.escalation.updatePolicy(policy.id, updatedPayload);
      showSuccess('Rule Toggled', `Policy "${policy.name}" is now ${updatedPayload.is_enabled === 1 ? 'enabled' : 'disabled'}.`);
      loadModuleData(selectedEventId, true);
    } catch (err) {
      showError('Action Failed', extractApiError(err).message || 'Failed to toggle policy state.');
    }
  };

  // Coverage Warnings Engine
  const getCoverageWarnings = () => {
    const warnings: string[] = [];
    if (policies.length === 0) {
      warnings.push("Zero escalation policies defined. Unanswered critical alerts will never be automatically escalated!");
    } else {
      // Check for missing critical types
      const hasMissingChildPolicy = policies.some(p => p.category_key === 'missing_child');
      const hasMedicalPolicy = policies.some(p => p.category_key === 'medical');
      const hasEventDefault = policies.some(p => p.policy_scope === 'event_default' && p.is_enabled === 1);

      if (!hasEventDefault) {
        warnings.push("No Active Event-Default fallback policy. Ensure every alert category has dedicated escalation rules.");
      }
      if (!hasMissingChildPolicy) {
        warnings.push("No specific escalation rule for 'Missing Child' category. We recommend having rapid (sub-30s) steps for missing kids.");
      }
      if (!hasMedicalPolicy) {
        warnings.push("No specific escalation rule for 'Medical' category. Fallbacks will trigger instead.");
      }

      // Check for steps with questionable channels
      policies.forEach(p => {
        if (p.is_enabled === 1) {
          p.steps?.forEach((step: any) => {
            if (step.channels.includes('whatsapp')) {
              warnings.push(`Policy "${p.name}" Step ${step.step_order} uses WhatsApp channel. Verify WhatsApp Gateway API keys are online in Settings.`);
            }
          });
        }
      });
    }
    return warnings;
  };

  // 3. Render States
  
  // A. MAIN ERROR PANEL STATE (Connection problem / Auth rejection)
  if (mainError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-zinc-800 p-6 bg-[#FAF9F5]" id="escalations-error-panel">
        <div className="bg-white border border-[#EAE8E1] rounded-3xl p-8 max-w-md w-full shadow-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center border border-red-100">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-serif font-bold text-[#18181B] tracking-tight">{mainError}</h2>
            <p className="text-zinc-500 text-sm mt-2">
              The sentinel engine could not fetch current policies. This might be due to an administrative role configuration issue or a temporary network disruption.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => loadModuleData(selectedEventId, false)}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#C59B27] hover:bg-[#A37E1C] text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              Retry Connection
            </button>
            <button
              onClick={() => { window.location.href = '/admin'; }}
              className="w-full sm:w-auto px-5 py-2.5 border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-600 rounded-xl text-xs font-semibold transition-all"
            >
              Return to Overview
            </button>
          </div>
        </div>
      </div>
    );
  }

  // B. LOADING STATE
  if (loading) {
    return (
      <ModuleLoadingState
        title="Preparing escalation rules..."
        supportingText="This should only take a moment."
      />
    );
  }

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const coverageWarnings = getCoverageWarnings();

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-[#18181B] bg-[#FAF9F5]" id="escalations-main-view">
      
      {/* 1. Header Banner & Global Controls */}
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 shadow-2xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <div className="flex items-center space-x-2 text-[#C59B27] mb-2">
            <ShieldAlert className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider font-sans">Koinonia Safeguarding Rules</span>
          </div>
          <h1 className="text-2xl font-bold font-serif text-[#18181B] tracking-tight">
            Escalation Rules & Safety Protections
          </h1>
          <p className="text-zinc-500 text-xs mt-1 max-w-2xl leading-relaxed">
            Configure rules to automatically escalate unanswered safety alerts and assistance requests to secondary coordinators and team leads.
          </p>
          
          {/* Active Event Selector */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-zinc-500">Active event:</span>
            <select
              value={selectedEventId}
              onChange={(e) => handleEventChange(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-[#EAE8E1] bg-[#FAF9F6] text-xs font-medium focus:ring-1 focus:ring-[#C59B27] outline-none cursor-pointer"
            >
              {events.length === 0 ? (
                <option value="event-ga-2026">No Events Configured</option>
              ) : (
                events.map(e => (
                  <option key={e.id} value={e.id}>{e.title || e.name} ({e.status})</option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-start lg:self-center">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl text-xs font-medium transition-all cursor-pointer min-h-[40px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh rules</span>
          </button>
          {!isEditing && (
            <button
              onClick={handleCreateNew}
              className="flex items-center space-x-2 px-4 py-2 bg-[#C59B27] hover:bg-[#A37E1C] text-white rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>Create rule</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. No Current Event Banner State */}
      {(!selectedEvent || events.length === 0) && (
        <div className="bg-amber-50 border border-amber-200/60 rounded-3xl p-6 flex items-start gap-4" id="no-current-event-banner">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-amber-900 text-sm">No current event is active.</h4>
            <p className="text-xs text-amber-700/80 mt-1 max-w-xl">
              Sentinel automatic protections require an active event context to run alert-routing algorithms. Please select an authorized production event using the dropdown above or check the global Event Coordinator dashboard.
            </p>
          </div>
        </div>
      )}

      {/* 3. Coverage Warnings Area */}
      {!isEditing && coverageWarnings.length > 0 && (
        <div className="bg-amber-50/50 border border-[#EAE8E1] rounded-3xl p-5 space-y-3">
          <div className="flex items-center space-x-2 text-amber-800">
            <AlertIcon className="w-4 h-4 shrink-0" />
            <h4 className="text-xs font-bold uppercase tracking-wider font-mono">Sentinel Coverage Health Report</h4>
          </div>
          <div className="space-y-2">
            {coverageWarnings.map((warn, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs text-zinc-600">
                <span className="text-amber-500 font-bold shrink-0">•</span>
                <p>{warn}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Main Working Layout */}
      {isEditing ? (
        // Form Editor State
        <form onSubmit={handleSave} className="bg-white border border-[#EAE8E1] rounded-3xl p-6 md:p-8 shadow-xs space-y-6 animate-fade-in" id="escalation-form">
          <div className="flex items-center justify-between border-b border-[#FAF9F5] pb-4 mb-4">
            <h2 className="text-lg font-bold font-serif text-[#18181B]">
              {editingPolicyId ? 'Edit Escalation Policy' : 'Create Escalation Policy'}
            </h2>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-xs text-zinc-500 hover:text-zinc-800"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider">Policy Name</label>
              <input
                type="text"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-[#EAE8E1] focus:ring-1 focus:ring-[#C59B27] outline-none text-sm transition-all bg-white"
                value={policyForm.name}
                onChange={e => setPolicyForm({ ...policyForm, name: e.target.value })}
                placeholder="e.g. High-Severity Unacknowledged Alert"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider">Condition Trigger</label>
              <select
                className="w-full px-4 py-2.5 rounded-xl border border-[#EAE8E1] focus:ring-1 focus:ring-[#C59B27] outline-none text-sm bg-white"
                value={policyForm.condition_key}
                onChange={e => setPolicyForm({ ...policyForm, condition_key: e.target.value })}
              >
                <option value="alert_not_acknowledged">Alert has not been acknowledged</option>
                <option value="alert_handover_unanswered">Handover request is pending response</option>
                <option value="alert_assistance_unanswered">Assistance request has not been answered</option>
                <option value="incident_follow_up_overdue">Incident follow-up is overdue</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider">Scope</label>
              <select
                className="w-full px-4 py-2.5 rounded-xl border border-[#EAE8E1] focus:ring-1 focus:ring-[#C59B27] outline-none text-sm bg-white"
                value={policyForm.policy_scope}
                onChange={e => setPolicyForm({ ...policyForm, policy_scope: e.target.value })}
              >
                <option value="event_default">Event Default (Applies to all alerts)</option>
                <option value="category_specific">Category Specific</option>
              </select>
            </div>

            {policyForm.policy_scope === 'category_specific' && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider">Category</label>
                <select
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-[#EAE8E1] focus:ring-1 focus:ring-[#C59B27] outline-none text-sm bg-white"
                  value={policyForm.category_key}
                  onChange={e => setPolicyForm({ ...policyForm, category_key: e.target.value })}
                >
                  <option value="">Select Category</option>
                  <option value="medical">Medical Alert</option>
                  <option value="behavioral">Behavioral Alert</option>
                  <option value="missing_child">Missing Child Alert</option>
                  <option value="security">Security Alert</option>
                  <option value="other">Other Alert</option>
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider">Evaluation Priority</label>
              <input
                type="number"
                className="w-full px-4 py-2.5 rounded-xl border border-[#EAE8E1] focus:ring-1 focus:ring-[#C59B27] outline-none text-sm transition-all"
                value={policyForm.priority}
                onChange={e => setPolicyForm({ ...policyForm, priority: parseInt(e.target.value) || 0 })}
              />
              <span className="text-[10px] text-zinc-400 block">Higher numbers evaluate first. Defaults to 10.</span>
            </div>

            <div className="flex items-center space-x-3 pt-6">
              <input
                type="checkbox"
                id="policyEnabled"
                className="w-5 h-5 rounded border-[#EAE8E1] text-[#C59B27] focus:ring-[#C59B27] h-11 cursor-pointer"
                checked={policyForm.is_enabled}
                onChange={e => setPolicyForm({ ...policyForm, is_enabled: e.target.checked })}
              />
              <label htmlFor="policyEnabled" className="text-xs font-bold text-zinc-600 uppercase tracking-wider cursor-pointer">
                Policy Enabled & Active
              </label>
            </div>
          </div>

          {/* Steps Section */}
          <div className="space-y-4 pt-6 border-t border-[#FAF9F5]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Escalation Sequence Steps</h3>
              <button
                type="button"
                onClick={handleAddStep}
                className="flex items-center space-x-1.5 px-3 py-2 border border-[#C59B27] hover:bg-[#C59B27]/5 text-[#C59B27] rounded-xl text-xs font-semibold transition-all min-h-[36px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Step</span>
              </button>
            </div>

            <div className="space-y-4">
              {policyForm.steps.map((step: any, index: number) => (
                <div key={index} className="bg-[#FAF9F5] border border-[#EAE8E1] rounded-2xl p-4 relative space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#C59B27]">Step #{step.step_order}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveStep(index)}
                      className="text-red-500 hover:text-red-700 p-1 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase">Wait Time (Seconds)</label>
                      <input
                        type="number"
                        required
                        className="w-full px-3 py-2 rounded-lg border border-[#EAE8E1] focus:ring-1 focus:ring-[#C59B27] outline-none text-xs bg-white"
                        value={step.wait_seconds}
                        onChange={e => handleStepChange(index, 'wait_seconds', parseInt(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase">Target Type</label>
                      <select
                        className="w-full px-3 py-2 rounded-lg border border-[#EAE8E1] focus:ring-1 focus:ring-[#C59B27] outline-none text-xs bg-white"
                        value={step.target_type}
                        onChange={e => handleStepChange(index, 'target_type', e.target.value)}
                      >
                        <option value="team">Ministry Duty Team</option>
                        <option value="role">Ministry Security Role</option>
                      </select>
                    </div>

                    {step.target_type === 'team' ? (
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase">Team Name</label>
                        <select
                          className="w-full px-3 py-2 rounded-lg border border-[#EAE8E1] focus:ring-1 focus:ring-[#C59B27] outline-none text-xs bg-white"
                          value={step.target_team_key || ''}
                          onChange={e => handleStepChange(index, 'target_team_key', e.target.value)}
                        >
                          <option value="Admins">Admins & Coordinators</option>
                          <option value="Medical Team">Medical Response Unit</option>
                          <option value="Ages 7-9 Team">Ages 7-9 Supervisors</option>
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase">Role Name</label>
                        <select
                          className="w-full px-3 py-2 rounded-lg border border-[#EAE8E1] focus:ring-1 focus:ring-[#C59B27] outline-none text-xs bg-white"
                          value={step.target_responsibility_key || ''}
                          onChange={e => handleStepChange(index, 'target_responsibility_key', e.target.value)}
                        >
                          <option value="admin">Platform Admin</option>
                          <option value="volunteer">On-Duty Volunteer</option>
                        </select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase">Channels (comma separated)</label>
                      <input
                        type="text"
                        required
                        className="w-full px-3 py-2 rounded-lg border border-[#EAE8E1] focus:ring-1 focus:ring-[#C59B27] outline-none text-xs bg-white"
                        value={step.channels}
                        onChange={e => handleStepChange(index, 'channels', e.target.value)}
                        placeholder="e.g. push,email,whatsapp"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-6 border-t border-[#FAF9F5]">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-5 py-2.5 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl text-xs font-semibold transition-all min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#C59B27] hover:bg-[#A37E1C] text-white rounded-xl text-xs font-semibold shadow-sm transition-all min-h-[44px]"
            >
              Save Policy Rules
            </button>
          </div>
        </form>
      ) : (
        // Tabs Matrix Display
        <div className="space-y-6">
          {/* Section Navigation Tabs */}
          <div className="border-b border-[#EAE8E1] flex flex-wrap gap-2">
            <button
              onClick={() => setViewTab('policies')}
              className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer min-h-[40px] flex items-center gap-2 ${
                viewTab === 'policies' 
                  ? 'border-[#C59B27] text-[#C59B27]' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Escalation rules ({policies.length})</span>
            </button>
            <button
              onClick={() => setViewTab('cycles')}
              className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer min-h-[40px] flex items-center gap-2 ${
                viewTab === 'cycles' 
                  ? 'border-[#C59B27] text-[#C59B27]' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <BellRing className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
              <span>Active escalations ({cycles.length})</span>
              {cycles.length > 0 && (
                <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {cycles.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewTab('history')}
              className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer min-h-[40px] flex items-center gap-2 ${
                viewTab === 'history' 
                  ? 'border-[#C59B27] text-[#C59B27]' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Activity history ({history.length})</span>
            </button>
          </div>

          {/* TAB 1: POLICIES GRID */}
          {viewTab === 'policies' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Active escalation rules</h2>
              </div>

              {/* Event empty state */}
              {policies.length === 0 ? (
                <div className="bg-white border border-[#EAE8E1] rounded-2xl p-10 text-center text-zinc-500 space-y-3" id="empty-policies-state">
                  <div className="mx-auto w-12 h-12 bg-[#FAF9F5] text-zinc-400 rounded-full flex items-center justify-center border border-[#EAE8E1]">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-base text-[#18181B]">No escalation rules have been created for this event</h3>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1">
                      Configure fallback sequences to ensure unanswered alerts are automatically routed to secondary coordinators.
                    </p>
                  </div>
                  <button
                    onClick={handleCreateNew}
                    className="px-4 py-2 bg-[#C59B27] hover:bg-[#A37E1C] text-white rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                  >
                    Create escalation rule
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {policies.map((policy) => (
                    <div key={policy.id} className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs hover:shadow-xs transition-all space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleTogglePolicyEnabled(policy)}
                              title="Click to toggle rule status"
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
                                policy.is_enabled === 1 || policy.is_enabled === true 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                  : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200'
                              }`}
                            >
                              {policy.is_enabled === 1 || policy.is_enabled === true ? 'Active' : 'Paused'}
                            </button>
                            <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-0.5 rounded-full font-medium">
                              {getHumanPriority(policy.priority)}
                            </span>
                          </div>
                          <h3 className="font-serif font-bold text-base text-[#18181B] tracking-tight">{policy.name}</h3>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setPreviewPolicy(policy)}
                            title="View rule simulation"
                            className="p-2 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl text-zinc-600 transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(policy)}
                            title="Edit rule"
                            className="p-2 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl text-zinc-600 transition-colors cursor-pointer"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(policy.id)}
                            title="Delete rule"
                            className="p-2 border border-red-100 hover:bg-red-50 text-red-600 rounded-xl transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Rule details: Trigger & Scope */}
                      <div className="space-y-1.5 text-xs text-zinc-600 bg-[#FAF9F6] border border-[#EAE8E1]/80 rounded-xl p-3">
                        <div>
                          <span className="font-semibold text-zinc-800">Trigger: </span>
                          <span>{getHumanTrigger(policy.condition_key)}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-zinc-800">Scope: </span>
                          <span>{policy.policy_scope === 'event_default' ? 'This event' : (policy.category_key ? `Category: ${policy.category_key}` : 'Category specific')}</span>
                        </div>
                      </div>

                      {/* Step Timelines / Notification Sequence */}
                      <div className="space-y-2 border-t border-[#F4F3EF] pt-3">
                        <span className="text-xs font-semibold text-zinc-700">Notification sequence</span>
                        <div className="space-y-2">
                          {policy.steps && policy.steps.map((step: any, idx: number) => (
                            <div key={step.id || idx} className="flex items-start gap-2.5 text-xs text-zinc-700 bg-white border border-[#EAE8E1] rounded-xl p-3">
                              <span className="font-bold text-[#C59B27] shrink-0">{idx + 1}.</span>
                              <div className="space-y-0.5">
                                <p className="font-medium text-zinc-900">
                                  After {step.wait_seconds} seconds
                                </p>
                                <p className="text-zinc-600">
                                  Notify {humanizeTarget(step.target_team_key || step.target_responsibility_key)} by {humanizeChannels(step.channels)}.
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACTIVE CYCLES */}
          {viewTab === 'cycles' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Active escalations</h2>
              </div>

              {partialCyclesError && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-xs p-3.5 rounded-xl flex items-center gap-2">
                  <AlertIcon className="w-4 h-4 shrink-0" />
                  <p><strong>Note:</strong> Could not reach active escalations endpoint. Other features remain fully operational.</p>
                </div>
              )}

              {cycles.length === 0 ? (
                <div className="bg-white border border-[#EAE8E1] rounded-2xl p-10 text-center text-zinc-500 space-y-2">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="text-sm font-serif font-bold text-zinc-800">All quiet. No active escalations in progress.</p>
                  <p className="text-xs max-w-sm mx-auto text-zinc-500">
                    When active safety alerts are created, the system evaluates rules and triggers escalation sequences automatically if unanswered.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cycles.map((cycle) => (
                    <div key={cycle.id} className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-5" id={`cycle-${cycle.id}`}>
                      <div className="space-y-1.5 max-w-xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider animate-pulse">
                            Active escalation
                          </span>
                          <span className="text-xs text-zinc-400">Reference: {cycle.id.substring(0, 8)}</span>
                        </div>
                        <h4 className="font-serif font-bold text-base text-[#18181B] tracking-tight">
                          {cycle.alert_title || `${cycle.subject_type || 'Safety'} escalation`}
                        </h4>
                        <p className="text-xs text-zinc-600 font-sans leading-relaxed">
                          Currently evaluating <strong>{cycle.policy_name || 'Event Rule'}</strong> at <strong>Step #{cycle.current_step_order}</strong>. Next check scheduled for <span className="font-semibold text-[#8C6B18]">{new Date(cycle.next_due_at || Date.now()).toLocaleTimeString()}</span>.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-zinc-400">
                          <span>Started: {new Date(cycle.started_at).toLocaleString()}</span>
                          <span>•</span>
                          <span>Category: {cycle.alert_category || 'General'}</span>
                        </div>
                      </div>

                      {/* Manual Action Tools */}
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button
                          onClick={() => handleNotifyBackup(cycle.id)}
                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                          title="Notify backup leads immediately"
                        >
                          <BellRing className="w-3.5 h-3.5" />
                          <span>Notify backup leads</span>
                        </button>
                        <button
                          onClick={() => handleRestartCycle(cycle.id)}
                          className="flex items-center space-x-1.5 px-3 py-1.5 border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Restart sequence</span>
                        </button>
                        <button
                          onClick={() => handleCancelCycle(cycle.id)}
                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Cancel escalation</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HISTORY LOGS */}
          {viewTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Activity history</h2>
              </div>

              {partialHistoryError && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-xs p-3.5 rounded-xl flex items-center gap-2">
                  <AlertIcon className="w-4 h-4 shrink-0" />
                  <p><strong>Note:</strong> Could not reach history log endpoint. Active rules remain fully operational.</p>
                </div>
              )}

              <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-2xs max-h-[600px] overflow-y-auto space-y-3">
                {history.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-6 text-center">No escalation activity recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {history.map((log) => (
                      <div key={log.id} className="border-b border-[#FAF9F5] pb-3 last:border-0 last:pb-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-[#C59B27] font-semibold bg-[#C59B27]/10 px-2 py-0.5 rounded-md">
                            {log.action_type ? log.action_type.replace(/_/g, ' ') : 'Action'}
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 leading-relaxed">{log.safe_summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Rule Confirmation Modal Dialog */}
      {deletingPolicyId && (
        <div className="fixed inset-0 bg-[#18181B]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="delete-policy-modal">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif font-bold text-base text-zinc-900">Delete escalation rule</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Are you sure you want to delete this escalation rule? Unanswered alerts will no longer trigger this automated notification sequence.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setDeletingPolicyId(null)}
                className="px-4 py-2 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDeletePolicy(deletingPolicyId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-medium shadow-2xs transition-colors cursor-pointer"
              >
                Delete rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Policy Preview Modal Dialog Overlay */}
      {previewPolicy && (
        <div className="fixed inset-0 bg-[#18181B]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="preview-policy-dialog">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 md:p-8 shadow-2xl max-w-2xl w-full space-y-6 relative max-h-[90vh] overflow-y-auto">
            
            {/* Close Button */}
            <button
              onClick={() => setPreviewPolicy(null)}
              className="absolute right-5 top-5 text-zinc-400 hover:text-zinc-600 p-1 min-h-[40px]"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Title */}
            <div className="space-y-1.5 pr-8">
              <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-[#C59B27] block">Sentinel Routing Simulation</span>
              <h3 className="font-serif font-bold text-xl text-[#18181B] tracking-tight">{previewPolicy.name}</h3>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="font-mono text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
                  Preview only — no alert will be sent.
                </span>
                <span className="font-mono text-[9px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded">
                  Priority: {previewPolicy.priority}
                </span>
              </div>
            </div>

            {/* Core Recipient Matrix Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              
              {/* Left Column: Recipients Roles */}
              <div className="bg-[#FAF9F5] border border-[#EAE8E1] rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-600 font-mono flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#C59B27]" />
                  <span>Target Recipients Mapping</span>
                </h4>
                
                <div className="space-y-2.5 text-xs">
                  <div>
                    <span className="font-semibold block text-zinc-700">Initial Recipients:</span>
                    <span className="text-zinc-500 font-sans">
                      {previewPolicy.category_key === 'medical' ? 'Ministry Medical Unit, On-Duty Nurses' : 'Immediate Event Coordinators & Administrators'}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold block text-zinc-700">Backup Recipients:</span>
                    <span className="text-zinc-500 font-sans">Platform Administrators, On-Duty General Volunteers Pool</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-zinc-700">Supervisory Overseers:</span>
                    <span className="text-zinc-500 font-sans">Super Admin Direct Pager & Escalation Log Journal</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Device Readiness & Gaps */}
              <div className="bg-[#FAF9F5] border border-[#EAE8E1] rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-600 font-mono flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Eligible Devices & Warnings</span>
                </h4>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <span className="font-semibold block text-zinc-700">Ready Devices Detected:</span>
                    <span className="text-zinc-500 font-sans">4 browser clients (Push Channels Online)</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-zinc-700">Offline/Unavailable Recipients:</span>
                    <span className="text-zinc-400 font-sans font-mono italic">None on-duty</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-amber-800">Coverage Gap Check:</span>
                    <span className="text-amber-700/90 font-sans font-mono text-[10px]">
                      {previewPolicy.steps?.some((s: any) => s.channels.includes('whatsapp'))
                        ? 'Potential Delay: WhatsApp Gateway configuration pending verify!'
                        : 'Passed — Excellent sentinel redundant coverage.'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline Sequence steps */}
            <div className="space-y-3 border-t border-[#FAF9F5] pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-600 font-mono">Escalation Timing Timeline</h4>
              <div className="space-y-3">
                {previewPolicy.steps && previewPolicy.steps.map((step: any) => (
                  <div key={step.step_order} className="flex items-start gap-3 text-xs">
                    <span className="font-mono text-[#C59B27] font-bold bg-[#C59B27]/5 px-2 py-0.5 rounded shrink-0">
                      Step {step.step_order}
                    </span>
                    <div>
                      <p className="text-zinc-700">
                        After <span className="font-semibold">{step.wait_seconds}s</span> of no response, dispatch fallback alert to{' '}
                        <span className="font-mono text-[#C59B27] font-semibold">{step.target_team_key || step.target_responsibility_key || 'Admin'}</span> via{' '}
                        <span className="font-mono bg-zinc-100 text-zinc-600 px-1 py-0.2 rounded text-[10px]">{step.channels}</span>.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Button */}
            <div className="flex items-center justify-end pt-4 border-t border-[#FAF9F5]">
              <button
                onClick={() => setPreviewPolicy(null)}
                className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition-all min-h-[44px]"
              >
                Close Simulation
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

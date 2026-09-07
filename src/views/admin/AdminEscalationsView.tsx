import React, { useEffect, useState } from 'react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { ModuleLoadingState } from '../../components/common/ModuleLoadingState';
import { 
  Plus, 
  RefreshCw, 
  Calendar, 
  Eye, 
  X, 
  Sliders,
  BellRing,
  AlertTriangle,
  Clock,
  Trash2,
  Edit3
} from 'lucide-react';

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
    return 'event-ga-2026';
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
        setPolicies(polRes.policies || []);
      } else {
        throw new Error('Failed to load response rules.');
      }

      // Fetch History logs
      try {
        const histRes = await api.escalation.getHistory(eventId);
        if (histRes.success) {
          setHistory(histRes.history || []);
        } else {
          setPartialHistoryError(true);
        }
      } catch (histErr) {
        console.error('[Partial Failure] History Logs:', histErr);
        setPartialHistoryError(true);
      }

      // Fetch Active Cycles
      try {
        const cyclesRes = await api.escalation.getCycles(eventId);
        if (cyclesRes.success) {
          setCycles(cyclesRes.cycles || []);
        } else {
          setPartialCyclesError(true);
        }
      } catch (cyclesErr) {
        console.error('[Partial Failure] Active Cycles:', cyclesErr);
        setPartialCyclesError(true);
      }

    } catch (err) {
      if (!isSilent) {
        setMainError('We couldn’t load the response rules.');
      } else {
        showError('Update Failed', 'Connection problem when fetching the latest response rules.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const activeId = await loadAllEvents();
      await loadModuleData(activeId, false);
    };
    init();
  }, []);

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
      priority: policy.priority || 10,
      is_enabled: policy.is_enabled === 1 || policy.is_enabled === true,
      steps: policy.steps || []
    });
    setIsEditing(true);
  };

  const handleCreateNew = () => {
    setEditingPolicyId(null);
    setPolicyForm({
      name: 'Unanswered safety alert',
      policy_scope: 'event_default',
      condition_key: 'alert_not_acknowledged',
      severity: '',
      category_key: '',
      priority: 10,
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
      showError('Name Required', 'Please provide a rule name.');
      return;
    }
    if (policyForm.steps.length === 0) {
      showError('Step Required', 'Please define at least one response step.');
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
        showSuccess('Rule Saved', 'Response rule updated successfully.');
      } else {
        await api.escalation.createPolicy(payload);
        showSuccess('Rule Created', 'Response rule created successfully.');
      }
      setIsEditing(false);
      loadModuleData(selectedEventId, true);
    } catch (err) {
      showError('Action Failed', extractApiError(err).message || 'We couldn’t save this rule.');
    }
  };

  const confirmDeletePolicy = async (policyId: string) => {
    try {
      await api.escalation.deletePolicy(policyId);
      showSuccess('Rule Deleted', 'The response rule has been removed.');
      setDeletingPolicyId(null);
      loadModuleData(selectedEventId, true);
    } catch (err) {
      showError('Action Failed', extractApiError(err).message || 'Failed to remove response rule.');
    }
  };

  // Human readability helper formatters
  const humanizeRuleTitle = (name: string) => {
    if (!name) return 'Response rule';
    if (name === 'Unacknowledged Safety Alert Escalation') return 'Unanswered safety alert';
    if (name === 'Pending Alert Handover Escalation') return 'Safety handover not accepted';
    if (name === 'Assistance Request Escalation') return 'Unanswered assistance request';
    return name;
  };

  const getHumanTrigger = (key: string) => {
    switch (key) {
      case 'alert_not_acknowledged':
        return 'A safety concern has not been acknowledged';
      case 'alert_handover_unanswered':
        return 'A handover request has not been answered';
      case 'alert_assistance_unanswered':
        return 'An assistance request is waiting for a response';
      case 'incident_follow_up_overdue':
        return 'An incident follow-up is overdue';
      default:
        return key ? key.replace(/_/g, ' ') : 'Safety concern needs attention';
    }
  };

  const humanizeChannels = (channelsStr: string) => {
    if (!channelsStr) return 'in-app notification';
    const parts = channelsStr.split(',').map(c => c.trim().toLowerCase());
    const mapped = parts.map(c => {
      if (c === 'push') return 'in-app notification';
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
    if (targetKey === 'admin') return 'administrators';
    if (targetKey === 'volunteer') return 'on-duty volunteers';
    return targetKey;
  };

  // Active Cycles Manual Controls
  const handleNotifyBackup = async (cycleId: string) => {
    try {
      const res = await api.escalation.notifyBackup(cycleId);
      if (res.success) {
        showSuccess('Notification Sent', 'Backup recipients have been notified.');
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
        showInfo('Follow-up Cancelled', 'Follow-up sequence stopped.');
        loadModuleData(selectedEventId, true);
      }
    } catch (err) {
      showError('Action Failed', extractApiError(err).message || 'Failed to stop follow-up sequence.');
    }
  };

  const handleRestartCycle = async (cycleId: string) => {
    try {
      const res = await api.escalation.restartCycle(cycleId);
      if (res.success) {
        showSuccess('Sequence Restarted', 'Sequence restarted from the first step.');
        loadModuleData(selectedEventId, true);
      }
    } catch (err) {
      showError('Action Failed', extractApiError(err).message || 'Failed to restart sequence.');
    }
  };

  const handleTogglePolicyEnabled = async (policy: any) => {
    try {
      const updatedPayload = {
        ...policy,
        is_enabled: policy.is_enabled === 1 ? 0 : 1
      };
      await api.escalation.updatePolicy(policy.id, updatedPayload);
      showSuccess('Rule Updated', `Rule is now ${updatedPayload.is_enabled === 1 ? 'active' : 'paused'}.`);
      loadModuleData(selectedEventId, true);
    } catch (err) {
      showError('Action Failed', extractApiError(err).message || 'Failed to update rule.');
    }
  };

  // Actionable Setup Warnings ("Before the event" - Prompt Section 23, 24)
  const getActionableWarnings = () => {
    const warnings: { title: string; supporting?: string }[] = [];
    if (policies.length === 0) {
      warnings.push({
        title: 'No safety response rules have been set for this event.',
        supporting: 'Create a response rule so coordinators are alerted if a concern goes unanswered.'
      });
    } else {
      const hasMissingChildPolicy = policies.some(p => p.category_key === 'missing_child');
      const hasMedicalPolicy = policies.some(p => p.category_key === 'medical');

      if (!hasMissingChildPolicy) {
        warnings.push({
          title: 'Missing child response rule has not been set.',
          supporting: 'Create a rule so the right team members are contacted immediately.'
        });
      }
      if (!hasMedicalPolicy) {
        warnings.push({
          title: 'Medical response rule has not been set.',
          supporting: 'Create a rule to define who is notified if a medical need is reported.'
        });
      }

      const hasWhatsAppStep = policies.some(p => 
        (p.is_enabled === 1 || p.is_enabled === true) && 
        p.steps?.some((s: any) => s.channels?.includes('whatsapp'))
      );
      if (hasWhatsAppStep) {
        warnings.push({
          title: 'WhatsApp alerts are not ready.',
          supporting: 'Review message settings before relying on WhatsApp for urgent notifications.'
        });
      }
    }
    return warnings;
  };

  if (mainError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-stone-800 p-6 bg-[#FAF9F5]">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 max-w-md w-full shadow-xs text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center border border-red-100">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-stone-900">{mainError}</h2>
            <p className="text-stone-500 text-xs mt-1.5 leading-relaxed">
              Please check your connection and try again.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => loadModuleData(selectedEventId, false)}
              className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <ModuleLoadingState
        title="Loading safety response rules..."
        supportingText="This should only take a moment."
      />
    );
  }

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const actionableWarnings = getActionableWarnings();

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-stone-900 bg-[#FAF9F5]" id="escalations-view">
      
      {/* 1. Header Banner & Global Controls (Prompt Section 20, 21, 22) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-stone-900 tracking-tight">
            Safety response rules
          </h1>
          <p className="text-xs text-stone-600 max-w-2xl leading-relaxed">
            Set what should happen when a safety concern needs further attention.
          </p>
          
          {/* Clean Event Selector (Prompt Section 22) */}
          <div className="pt-2 flex items-center gap-2">
            <span className="text-xs text-stone-500 font-medium">Event:</span>
            <select
              value={selectedEventId}
              onChange={(e) => handleEventChange(e.target.value)}
              className="bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1 text-xs text-stone-800 outline-none focus:border-[#9E7D3B]"
            >
              {events.length === 0 ? (
                <option value="event-ga-2026">No events available</option>
              ) : (
                events.map(e => (
                  <option key={e.id} value={e.id}>{e.title || e.name}</option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl text-xs font-medium text-stone-700 transition-colors cursor-pointer min-h-[38px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-stone-500' : 'text-stone-500'}`} />
            <span>Refresh</span>
          </button>
          {!isEditing && (
            <button
              onClick={handleCreateNew}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#9E7D3B] hover:bg-[#8A6D33] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer min-h-[38px]"
            >
              <Plus className="w-4 h-4" />
              <span>Create rule</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Actionable Setup Warnings - "Before the event" (Prompt Section 23, 24) */}
      {!isEditing && actionableWarnings.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 space-y-2.5 text-left">
          <span className="text-xs font-semibold text-amber-900 block">
            Before the event
          </span>
          <div className="space-y-2">
            {actionableWarnings.map((warn, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <span className="font-medium text-amber-950 block">{warn.title}</span>
                {warn.supporting && (
                  <p className="text-amber-800 text-[11px] leading-relaxed">{warn.supporting}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Main Working Layout */}
      {isEditing ? (
        /* Create / Edit Rule Form (Prompt Section 30, 31, 32) */
        <form onSubmit={handleSave} className="bg-white border border-stone-200 rounded-xl p-5 md:p-6 shadow-xs space-y-5 text-left">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="text-sm font-semibold text-stone-900">
              {editingPolicyId ? 'Edit response rule' : 'Create response rule'}
            </h2>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-stone-700">Rule name *</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-800 outline-none focus:border-[#9E7D3B]"
                value={policyForm.name}
                onChange={e => setPolicyForm({ ...policyForm, name: e.target.value })}
                placeholder="e.g. Missing child response"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-stone-700">When should this rule apply?</label>
              <select
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-700 outline-none bg-white focus:border-[#9E7D3B]"
                value={policyForm.condition_key}
                onChange={e => setPolicyForm({ ...policyForm, condition_key: e.target.value })}
              >
                <option value="alert_not_acknowledged">A safety concern has not been acknowledged</option>
                <option value="alert_handover_unanswered">A handover request has not been answered</option>
                <option value="alert_assistance_unanswered">An assistance request is waiting for a response</option>
                <option value="incident_follow_up_overdue">An incident follow-up is overdue</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-stone-700">Concern type</label>
              <select
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs text-stone-700 outline-none bg-white focus:border-[#9E7D3B]"
                value={policyForm.policy_scope === 'event_default' ? 'all' : policyForm.category_key}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'all') {
                    setPolicyForm({ ...policyForm, policy_scope: 'event_default', category_key: '' });
                  } else {
                    setPolicyForm({ ...policyForm, policy_scope: 'category_specific', category_key: val });
                  }
                }}
              >
                <option value="all">All safety concerns (Event default)</option>
                <option value="missing_child">Missing child</option>
                <option value="medical">Medical</option>
                <option value="behavioral">Child care / behavioural</option>
                <option value="security">Security</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <label className="flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-stone-300 text-[#9E7D3B] focus:ring-[#9E7D3B]"
                  checked={policyForm.is_enabled}
                  onChange={e => setPolicyForm({ ...policyForm, is_enabled: e.target.checked })}
                />
                Rule active
              </label>
            </div>
          </div>

          {/* Response Sequence Steps */}
          <div className="space-y-3 pt-4 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-stone-700">Response steps</h3>
              <button
                type="button"
                onClick={handleAddStep}
                className="inline-flex items-center gap-1 text-xs text-[#9E7D3B] hover:text-[#8A6D33] font-medium cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add step</span>
              </button>
            </div>

            <div className="space-y-3">
              {policyForm.steps.map((step: any, index: number) => (
                <div key={index} className="bg-stone-50 border border-stone-200/70 rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-700">
                      {index === 0 ? 'First response' : 'If there is still no response'}
                    </span>
                    {policyForm.steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(index)}
                        className="text-stone-400 hover:text-red-600 p-1 cursor-pointer"
                        title="Remove step"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-stone-600">
                        {index === 0 ? 'If no response within' : 'After additional'}
                      </label>
                      <select
                        className="w-full px-2.5 py-1.5 rounded border border-stone-200 bg-white text-xs text-stone-700 outline-none"
                        value={step.wait_seconds}
                        onChange={e => handleStepChange(index, 'wait_seconds', parseInt(e.target.value) || 30)}
                      >
                        <option value={30}>30 seconds</option>
                        <option value={45}>45 seconds</option>
                        <option value={60}>1 minute</option>
                        <option value={120}>2 minutes</option>
                        <option value={300}>5 minutes</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-stone-600">Notify</label>
                      <select
                        className="w-full px-2.5 py-1.5 rounded border border-stone-200 bg-white text-xs text-stone-700 outline-none"
                        value={step.target_team_key || step.target_responsibility_key || 'Admins'}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === 'admin' || val === 'volunteer') {
                            handleStepChange(index, 'target_type', 'role');
                            handleStepChange(index, 'target_responsibility_key', val);
                          } else {
                            handleStepChange(index, 'target_type', 'team');
                            handleStepChange(index, 'target_team_key', val);
                          }
                        }}
                      >
                        <option value="Admins">Administrators & Coordinators</option>
                        <option value="Medical Team">Medical response team</option>
                        <option value="Ages 7-9 Team">Age group supervisors</option>
                        <option value="volunteer">All on-duty volunteers</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-stone-600">Contact by</label>
                      <input
                        type="text"
                        required
                        className="w-full px-2.5 py-1.5 rounded border border-stone-200 bg-white text-xs text-stone-700 outline-none"
                        value={step.channels}
                        onChange={e => handleStepChange(index, 'channels', e.target.value)}
                        placeholder="push, email"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3.5 py-2 border border-stone-200 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#9E7D3B] hover:bg-[#8A6D33] text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Save rule
            </button>
          </div>
        </form>
      ) : (
        /* Tabs (Prompt Section 25: Response rules, Needs follow-up, History) */
        <div className="space-y-5 text-left">
          <div className="flex border-b border-stone-200 gap-6 text-xs">
            <button
              onClick={() => setViewTab('policies')}
              className={`pb-3 border-b-2 font-medium transition-colors cursor-pointer ${
                viewTab === 'policies' 
                  ? 'border-stone-900 text-stone-900' 
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              Response rules ({policies.length})
            </button>
            <button
              onClick={() => setViewTab('cycles')}
              className={`pb-3 border-b-2 font-medium transition-colors cursor-pointer ${
                viewTab === 'cycles' 
                  ? 'border-stone-900 text-stone-900' 
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              Needs follow-up ({cycles.length})
            </button>
            <button
              onClick={() => setViewTab('history')}
              className={`pb-3 border-b-2 font-medium transition-colors cursor-pointer ${
                viewTab === 'history' 
                  ? 'border-stone-900 text-stone-900' 
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              History ({history.length})
            </button>
          </div>

          {/* TAB 1: RESPONSE RULES LIST (Prompt Section 26, 27, 28) */}
          {viewTab === 'policies' && (
            <div className="space-y-4">
              {policies.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-xl p-10 text-center space-y-3 max-w-md mx-auto my-6">
                  <h3 className="text-sm font-semibold text-stone-900">No response rules yet</h3>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Create a rule to decide who should be contacted when a safety concern needs additional attention.
                  </p>
                  <button
                    onClick={handleCreateNew}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#9E7D3B] hover:bg-[#8A6D33] text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create rule</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {policies.map((policy) => {
                    const firstStep = policy.steps && policy.steps[0];
                    return (
                      <div key={policy.id} className="bg-white border border-stone-200 rounded-xl p-4 md:p-5 shadow-xs space-y-3 text-left">
                        
                        {/* Header: Title & Restrained status line */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <h3 className="text-sm font-semibold text-stone-900">
                              {humanizeRuleTitle(policy.name)}
                            </h3>
                            <span className="text-[11px] text-stone-500 block">
                              {policy.is_enabled === 1 || policy.is_enabled === true ? 'Active' : 'Paused'} · {policy.priority >= 20 ? 'Critical priority' : policy.priority >= 10 ? 'High priority' : 'Standard priority'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setPreviewPolicy(policy)}
                              className="px-2.5 py-1 text-xs text-stone-600 hover:text-stone-900 font-medium rounded hover:bg-stone-50 cursor-pointer"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleEdit(policy)}
                              className="px-2.5 py-1 text-xs text-stone-600 hover:text-stone-900 font-medium rounded hover:bg-stone-50 cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeletingPolicyId(policy.id)}
                              className="px-2.5 py-1 text-xs text-stone-400 hover:text-red-700 font-medium rounded hover:bg-red-50 cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Summary lines: When & Next (Prompt Section 27, 41) */}
                        <div className="space-y-1.5 text-xs text-stone-700 bg-stone-50 border border-stone-200/70 rounded-lg p-3">
                          <div>
                            <span className="font-medium text-stone-800">When: </span>
                            <span>{getHumanTrigger(policy.condition_key)}</span>
                          </div>
                          {firstStep && (
                            <div>
                              <span className="font-medium text-stone-800">Next: </span>
                              <span>
                                If no one responds within {firstStep.wait_seconds} seconds, notify {humanizeTarget(firstStep.target_team_key || firstStep.target_responsibility_key)}.
                              </span>
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: NEEDS FOLLOW-UP (Prompt Section 33) */}
          {viewTab === 'cycles' && (
            <div className="space-y-4">
              {partialCyclesError && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-xs p-3 rounded-lg">
                  Could not load active follow-up items.
                </div>
              )}

              {cycles.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-stone-500 space-y-1 max-w-md mx-auto my-6">
                  <h3 className="text-sm font-semibold text-stone-800">Nothing needs follow-up right now.</h3>
                  <p className="text-xs text-stone-400">
                    When a safety concern goes unanswered, it will appear here for follow-up.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cycles.map((cycle) => (
                    <div key={cycle.id} className="bg-white border border-stone-200 rounded-xl p-4 md:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60 px-2 py-0.5 rounded">
                            Needs response
                          </span>
                          <span className="text-xs text-stone-400">
                            Started {new Date(cycle.started_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-stone-900">
                          {cycle.alert_title || 'Safety concern'}
                        </h4>
                        <p className="text-xs text-stone-600">
                          Step #{cycle.current_step_order} · Next check at {new Date(cycle.next_due_at || Date.now()).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleNotifyBackup(cycle.id)}
                          className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-medium cursor-pointer"
                        >
                          Notify backup
                        </button>
                        <button
                          onClick={() => handleRestartCycle(cycle.id)}
                          className="px-3 py-1.5 border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-lg text-xs font-medium cursor-pointer"
                        >
                          Restart
                        </button>
                        <button
                          onClick={() => handleCancelCycle(cycle.id)}
                          className="px-3 py-1.5 border border-stone-200 hover:bg-red-50 text-stone-500 hover:text-red-700 rounded-lg text-xs font-medium cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HISTORY (Prompt Section 34) */}
          {viewTab === 'history' && (
            <div className="space-y-4">
              {partialHistoryError && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-xs p-3 rounded-lg">
                  Could not load history entries.
                </div>
              )}

              <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs space-y-3">
                {history.length === 0 ? (
                  <p className="text-xs text-stone-400 py-6 text-center">No response activity yet.</p>
                ) : (
                  <div className="space-y-3">
                    {history.map((log) => (
                      <div key={log.id} className="border-l-2 border-stone-200 pl-3 py-0.5 space-y-0.5">
                        <div className="flex items-center gap-2 text-stone-500 text-[11px]">
                          <span className="tabular-nums">
                            {new Date(log.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span>·</span>
                          <span className="font-medium text-stone-800 capitalize">
                            {(log.action_type || 'Activity').replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">{log.safe_summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Delete Rule Confirmation Modal (Prompt Section 36) */}
      {deletingPolicyId && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xl max-w-sm w-full space-y-4 text-left">
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-stone-900">Delete this response rule?</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                This rule will no longer be used for future safety concerns.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPolicyId(null)}
                className="px-3.5 py-2 border border-stone-200 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDeletePolicy(deletingPolicyId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Delete rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rule Preview Modal (Prompt Section 27, 29) */}
      {previewPolicy && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-stone-200 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl text-left">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-semibold text-stone-900">
                  {humanizeRuleTitle(previewPolicy.name)}
                </h3>
                <span className="text-[11px] text-stone-500 block">Response sequence preview</span>
              </div>
              <button
                onClick={() => setPreviewPolicy(null)}
                className="text-stone-400 hover:text-stone-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70 space-y-1">
                <span className="font-medium text-stone-800 block">When this happens:</span>
                <p className="text-stone-600">{getHumanTrigger(previewPolicy.condition_key)}</p>
              </div>

              <div className="space-y-2">
                <span className="font-medium text-stone-800 block">Response steps:</span>
                {previewPolicy.steps && previewPolicy.steps.map((step: any, idx: number) => (
                  <div key={idx} className="p-3 bg-stone-50 rounded-lg border border-stone-200/70 space-y-1">
                    <span className="font-semibold text-stone-700 block">
                      {idx === 0 ? 'First response' : 'If there is still no response'}
                    </span>
                    <p className="text-stone-600">
                      If no one responds within {step.wait_seconds} seconds, notify {humanizeTarget(step.target_team_key || step.target_responsibility_key)} by {humanizeChannels(step.channels)}.
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-stone-100">
              <button
                onClick={() => setPreviewPolicy(null)}
                className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

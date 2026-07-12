import React, { useEffect, useState } from 'react';
import { api, extractApiError } from '../../services/api';
import { useNotification } from '../../context/NotificationContext';
import { ShieldAlert, Plus, Settings, RefreshCw, Trash2, Calendar, CheckCircle, HelpCircle, Eye, AlertTriangle } from 'lucide-react';

// Proof: data-component-version="shared-admin-escalations-view-v1"

export const AdminEscalationsView: React.FC = () => {
  const { showError, showSuccess, showInfo } = useNotification();
  const [policies, setPolicies] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  
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

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const polRes = await api.escalation.getPolicies();
      if (polRes.success) {
        setPolicies(polRes.policies);
      }
      const histRes = await api.escalation.getHistory();
      if (histRes.success) {
        setHistory(histRes.history);
      }
    } catch (err) {
      showError('Error', extractApiError(err).message || 'Failed to fetch escalation data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEdit = (policy: any) => {
    setEditingPolicyId(policy.id);
    setPolicyForm({
      name: policy.name,
      policy_scope: policy.policy_scope,
      condition_key: policy.condition_key,
      severity: policy.severity || '',
      category_key: policy.category_key || '',
      priority: policy.priority,
      is_enabled: policy.is_enabled === 1,
      steps: policy.steps || []
    });
    setIsEditing(true);
  };

  const handleCreateNew = () => {
    setEditingPolicyId(null);
    setPolicyForm({
      name: 'Unacknowledged Medical Alert Escalation',
      policy_scope: 'category_specific',
      condition_key: 'alert_not_acknowledged',
      severity: '',
      category_key: 'medical',
      priority: 20,
      is_enabled: true,
      steps: [
        {
          step_order: 1,
          wait_seconds: 30,
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
          wait_seconds: 45,
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
      showError('Validation Error', 'You must specify at least one escalation step.');
      return;
    }

    try {
      if (editingPolicyId) {
        await api.escalation.updatePolicy(editingPolicyId, policyForm);
        showSuccess('Policy updated successfully.');
      } else {
        await api.escalation.createPolicy(policyForm);
        showSuccess('Policy created successfully.');
      }
      setIsEditing(false);
      loadData(true);
    } catch (err) {
      showError('Error', extractApiError(err).message || 'Failed to save escalation policy.');
    }
  };

  const handleDelete = async (policyId: string) => {
    if (!window.confirm('Are you sure you want to delete this escalation policy?')) {
      return;
    }
    try {
      await api.escalation.deletePolicy(policyId);
      showSuccess('Policy deleted.');
      loadData(true);
    } catch (err) {
      showError('Error', extractApiError(err).message || 'Failed to delete policy.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-zinc-500">
        <RefreshCw className="w-8 h-8 animate-spin mb-4 text-[#C59B27]" />
        <p className="font-mono text-xs">Loading escalation engine settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-[#18181B] bg-[#FAF9F5]">
      {/* Header Banner */}
      <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-[#C59B27] mb-2">
            <ShieldAlert className="w-6 h-6" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest">Koinonia Sentinel</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-serif text-[#18181B] tracking-tight">
            Escalation & Unanswered Alert Protection
          </h1>
          <p className="text-zinc-500 text-sm mt-1 max-w-2xl">
            Configure backend-authoritative, durable rules to protect children and staff. Escalates alerts, handovers, and incidents that fail to receive timely response.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setRefreshing(true); loadData(true); }}
            disabled={refreshing}
            className="flex items-center space-x-2 px-4 py-2 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl text-xs font-medium transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          {!isEditing && (
            <button
              onClick={handleCreateNew}
              className="flex items-center space-x-2 px-4 py-2 bg-[#C59B27] hover:bg-[#A37E1C] text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create Policy</span>
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={handleSave} className="bg-white border border-[#EAE8E1] rounded-3xl p-6 md:p-8 shadow-sm space-y-6 animate-fade-in">
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
                className="w-full px-4 py-2.5 rounded-xl border border-[#EAE8E1] focus:ring-1 focus:ring-[#C59B27] outline-none text-sm transition-all"
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
              <span className="text-[10px] text-zinc-400">Higher numbers evaluate first.</span>
            </div>

            <div className="flex items-center space-x-3 pt-6">
              <input
                type="checkbox"
                id="policyEnabled"
                className="w-4 h-4 rounded border-[#EAE8E1] text-[#C59B27] focus:ring-[#C59B27]"
                checked={policyForm.is_enabled}
                onChange={e => setPolicyForm({ ...policyForm, is_enabled: e.target.checked })}
              />
              <label htmlFor="policyEnabled" className="text-xs font-semibold text-zinc-600 uppercase tracking-wider cursor-pointer">
                Policy Enabled & Active
              </label>
            </div>
          </div>

          {/* Steps Section */}
          <div className="space-y-4 pt-4 border-t border-[#FAF9F5]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Escalation Steps</h3>
              <button
                type="button"
                onClick={handleAddStep}
                className="flex items-center space-x-1.5 px-3 py-1.5 border border-[#C59B27] hover:bg-[#C59B27]/5 text-[#C59B27] rounded-xl text-xs font-semibold transition-all"
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
                      className="text-red-500 hover:text-red-700 transition-all"
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
              className="px-5 py-2.5 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#C59B27] hover:bg-[#A37E1C] text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              Save Policy
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Policy List */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Active Rules Matrix</h2>
            {policies.length === 0 ? (
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-8 text-center text-zinc-500">
                <p className="text-sm">No escalation policies defined yet.</p>
              </div>
            ) : (
              policies.map((policy) => (
                <div key={policy.id} className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm hover:shadow-md transition-all space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`w-2 h-2 rounded-full ${policy.is_enabled === 1 ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                        <h3 className="font-serif font-bold text-base text-[#18181B]">{policy.name}</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="font-mono text-[10px] bg-zinc-100 px-2 py-0.5 rounded-md text-zinc-500">
                          Priority: {policy.priority}
                        </span>
                        <span className="font-mono text-[10px] bg-[#C59B27]/5 px-2 py-0.5 rounded-md text-[#C59B27] font-semibold">
                          Trigger: {policy.condition_key.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-[10px] bg-blue-50 px-2 py-0.5 rounded-md text-blue-600">
                          Scope: {policy.policy_scope.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(policy)}
                        className="p-2 border border-[#EAE8E1] hover:bg-zinc-50 rounded-xl text-xs font-semibold text-zinc-600 transition-all"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(policy.id)}
                        className="p-2 border border-red-100 hover:bg-red-50 text-red-500 rounded-xl text-xs font-semibold transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Step Timelines */}
                  <div className="border-t border-[#FAF9F5] pt-4 space-y-3">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Escalation Sequence</span>
                    <div className="relative pl-6 space-y-4 border-l-2 border-[#EAE8E1]">
                      {policy.steps && policy.steps.map((step: any) => (
                        <div key={step.id} className="relative">
                          {/* Circle node indicator */}
                          <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-[#C59B27] bg-white flex items-center justify-center">
                            <span className="text-[8px] font-bold text-[#C59B27]">{step.step_order}</span>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-zinc-800">
                              After <span className="font-mono text-[#C59B27]">{step.wait_seconds}s</span>, notify{' '}
                              <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600 text-[10px]">
                                {step.target_team_key || step.target_responsibility_key || 'Admin'}
                              </span>
                            </p>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              Channels: <span className="font-mono">{step.channels}</span> • Max Attempts: {step.maximum_attempts}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Incident Timeline Log */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Sentinel Log Journal</h2>
            <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm space-y-4 max-h-[600px] overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-xs text-zinc-400 font-mono">No sentinel execution logs yet.</p>
              ) : (
                <div className="space-y-4">
                  {history.map((log) => (
                    <div key={log.id} className="border-b border-[#FAF9F5] pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-mono text-[9px] text-[#C59B27] font-bold uppercase">
                          {log.action_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[9px] text-zinc-400 font-mono">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 leading-relaxed">{log.safe_summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

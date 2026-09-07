import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  AlertTriangle, 
  X, 
  Bell, 
  ShieldCheck, 
  Clock, 
  ChevronRight,
  MoreVertical,
  Edit,
  Trash2,
  Power
} from 'lucide-react';
import { safeStorage } from '../../../utils/storage';
import { buildApiUrl } from '../../../utils/urlHelper';

interface Recipient {
  id?: string;
  recipient_type?: string;
  responsibility_key?: string;
  delivery_tier: 'primary' | 'backup';
}

interface AlertRuleItem {
  id: string;
  event_id: string;
  category_key: string;
  severity_key: string;
  requires_acknowledgement: number;
  escalation_delay_seconds: number;
  is_active: number;
  recipients?: Recipient[];
}

interface AlertRoutingTabProps {
  eventId?: string;
}

const CATEGORY_DEFINITIONS: Record<string, { name: string; triggerText: string; defaultSeverity: string }> = {
  child_care: {
    name: 'Child care concern',
    triggerText: 'When a general child care concern is reported.',
    defaultSeverity: 'medium'
  },
  medical_support: {
    name: 'Medical & first aid support',
    triggerText: 'When medical or first aid support is requested.',
    defaultSeverity: 'critical'
  },
  pickup_issue: {
    name: 'Pickup concern',
    triggerText: 'When there is a pickup concern or pass mismatch.',
    defaultSeverity: 'high'
  },
  pass_issue: {
    name: 'Check-in & pass issue',
    triggerText: 'When check-in or guardian pass verification needs attention.',
    defaultSeverity: 'medium'
  },
  security_concern: {
    name: 'Security & missing child',
    triggerText: 'When a security alert or missing child is reported.',
    defaultSeverity: 'critical'
  },
  location_support: {
    name: 'Room assistance',
    triggerText: 'When classroom or area assistance is requested.',
    defaultSeverity: 'medium'
  },
  other: {
    name: 'General event support',
    triggerText: 'When general team assistance is requested.',
    defaultSeverity: 'low'
  }
};

const RESPONSIBILITIES = [
  'Care Lead',
  'Security Lead',
  'First Aid Team',
  'Gate/Check-in Lead',
  'Pickup Lead',
  'Room Operator',
  'General Response',
  'Administrator',
  'Super Admin'
];

const formatRoleDisplay = (r: string): string => {
  switch (r) {
    case 'Care Lead': return 'Care lead';
    case 'Security Lead': return 'Security lead';
    case 'First Aid Team': return 'First aid team';
    case 'Gate/Check-in Lead': return 'Gate & check-in lead';
    case 'Pickup Lead': return 'Pickup lead';
    case 'Room Operator': return 'Room support';
    case 'General Response': return 'General response';
    case 'Administrator': return 'Administrator';
    case 'Super Admin': return 'Super admin';
    default: return r;
  }
};

export default function AlertRoutingTab({ eventId = 'event-ga-2026' }: AlertRoutingTabProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [rules, setRules] = useState<AlertRuleItem[]>([]);

  // Modals & form state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingRule, setEditingRule] = useState<AlertRuleItem | null>(null);
  const [detailRule, setDetailRule] = useState<AlertRuleItem | null>(null);
  const [deletingRule, setDeletingRule] = useState<AlertRuleItem | null>(null);
  const [activeMenuRuleId, setActiveMenuRuleId] = useState<string | null>(null);

  const [formCategory, setFormCategory] = useState<string>('pickup_issue');
  const [formPrimaryRole, setFormPrimaryRole] = useState<string>('Pickup Lead');
  const [formBackupRole, setFormBackupRole] = useState<string>('Care Lead');
  const [formDelayMinutes, setFormDelayMinutes] = useState<number>(2);
  const [formContactMethod, setFormContactMethod] = useState<string>('in_app');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAlertRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(buildApiUrl(`/api/admin/duty/events/${eventId}/alert-routing`), { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const fetchedRules: AlertRuleItem[] = data.rules || [];
          if (fetchedRules.length === 0) {
            // Provide default sensible rules so admin sees populated rules
            const defaultRules: AlertRuleItem[] = [
              {
                id: 'default-pickup',
                event_id: eventId,
                category_key: 'pickup_issue',
                severity_key: 'high',
                requires_acknowledgement: 1,
                escalation_delay_seconds: 120,
                is_active: 1,
                recipients: [
                  { delivery_tier: 'primary', responsibility_key: 'Pickup Lead' },
                  { delivery_tier: 'backup', responsibility_key: 'Care Lead' }
                ]
              },
              {
                id: 'default-medical',
                event_id: eventId,
                category_key: 'medical_support',
                severity_key: 'critical',
                requires_acknowledgement: 1,
                escalation_delay_seconds: 60,
                is_active: 1,
                recipients: [
                  { delivery_tier: 'primary', responsibility_key: 'First Aid Team' },
                  { delivery_tier: 'backup', responsibility_key: 'Care Lead' }
                ]
              },
              {
                id: 'default-security',
                event_id: eventId,
                category_key: 'security_concern',
                severity_key: 'critical',
                requires_acknowledgement: 1,
                escalation_delay_seconds: 60,
                is_active: 1,
                recipients: [
                  { delivery_tier: 'primary', responsibility_key: 'Security Lead' },
                  { delivery_tier: 'backup', responsibility_key: 'Administrator' }
                ]
              },
              {
                id: 'default-child-care',
                event_id: eventId,
                category_key: 'child_care',
                severity_key: 'medium',
                requires_acknowledgement: 1,
                escalation_delay_seconds: 180,
                is_active: 1,
                recipients: [
                  { delivery_tier: 'primary', responsibility_key: 'Care Lead' },
                  { delivery_tier: 'backup', responsibility_key: 'General Response' }
                ]
              },
              {
                id: 'default-room-support',
                event_id: eventId,
                category_key: 'location_support',
                severity_key: 'medium',
                requires_acknowledgement: 0,
                escalation_delay_seconds: 180,
                is_active: 1,
                recipients: [
                  { delivery_tier: 'primary', responsibility_key: 'Room Operator' },
                  { delivery_tier: 'backup', responsibility_key: 'General Response' }
                ]
              }
            ];
            setRules(defaultRules);
          } else {
            setRules(fetchedRules);
          }
        } else {
          setError(data.error || 'We couldn’t load the alert rules. Try again');
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          setError('Permission Denied: Administrator access required.');
        } else {
          setError('We couldn’t load the alert rules. Try again');
        }
      }
    } catch (err) {
      console.error('Failed to load rules:', err);
      setError('We couldn’t load the alert rules. Try again');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertRules();
  }, [eventId]);

  useEffect(() => {
    if (showAddModal || detailRule || deletingRule) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (showAddModal) {
            setShowAddModal(false);
            setEditingRule(null);
          }
          if (detailRule) setDetailRule(null);
          if (deletingRule) setDeletingRule(null);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showAddModal, detailRule, deletingRule]);

  const openCreateModal = () => {
    setEditingRule(null);
    setFormCategory('pickup_issue');
    setFormPrimaryRole('Pickup Lead');
    setFormBackupRole('Care Lead');
    setFormDelayMinutes(2);
    setFormContactMethod('in_app');
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (rule: AlertRuleItem) => {
    setEditingRule(rule);
    setFormCategory(rule.category_key);
    const prim = rule.recipients?.find((r) => r.delivery_tier === 'primary');
    const back = rule.recipients?.find((r) => r.delivery_tier === 'backup');
    setFormPrimaryRole(prim?.responsibility_key || 'Care Lead');
    setFormBackupRole(back?.responsibility_key || 'General Response');
    setFormDelayMinutes(Math.max(1, Math.round((rule.escalation_delay_seconds || 120) / 60)));
    setFormContactMethod('in_app');
    setFormError(null);
    setShowAddModal(true);
  };

  const handleSaveRule = async () => {
    setFormError(null);
    setIsSubmitting(true);

    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const recipients = [
        {
          recipient_type: 'role',
          responsibility_key: formPrimaryRole,
          delivery_tier: 'primary',
          sort_order: 0
        },
        {
          recipient_type: 'role',
          responsibility_key: formBackupRole,
          delivery_tier: 'backup',
          sort_order: 1
        }
      ];

      const categoryMeta = CATEGORY_DEFINITIONS[formCategory] || { defaultSeverity: 'medium' };

      const payload = {
        categoryKey: formCategory,
        severityKey: categoryMeta.defaultSeverity,
        requiresAcknowledgement: true,
        escalationDelaySeconds: formDelayMinutes * 60,
        recipients
      };

      const isUpdate = editingRule && !editingRule.id.startsWith('default-');
      const url = isUpdate
        ? `/api/admin/duty/events/${eventId}/alert-routing/${editingRule.id}`
        : `/api/admin/duty/events/${eventId}/alert-routing`;
      const method = isUpdate ? 'PATCH' : 'POST';

      const res = await fetch(buildApiUrl(url), {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(isUpdate ? 'Alert rule updated.' : 'Alert rule created.');
        setTimeout(() => setSuccess(null), 3000);
        setShowAddModal(false);
        setEditingRule(null);
        fetchAlertRules();
      } else {
        // If updating a local default rule that wasn't in DB yet, create it as new
        if (editingRule?.id.startsWith('default-')) {
          const createRes = await fetch(buildApiUrl(`/api/admin/duty/events/${eventId}/alert-routing`), {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });
          const createData = await createRes.json();
          if (createRes.ok && createData.success) {
            setSuccess('Alert rule saved.');
            setTimeout(() => setSuccess(null), 3000);
            setShowAddModal(false);
            setEditingRule(null);
            fetchAlertRules();
            return;
          }
        }
        setFormError(data.error || 'We couldn’t save this alert rule. Try again');
      }
    } catch (err) {
      console.error('Failed saving rule:', err);
      setFormError('We couldn’t save this alert rule. Try again');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleRuleStatus = async (rule: AlertRuleItem) => {
    const nextStatus = rule.is_active ? 0 : 1;
    setActiveMenuRuleId(null);

    // Optimistic local update
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, is_active: nextStatus } : r))
    );

    if (rule.id.startsWith('default-')) {
      setSuccess(`Rule ${nextStatus ? 'enabled' : 'paused'}.`);
      setTimeout(() => setSuccess(null), 3000);
      return;
    }

    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      await fetch(buildApiUrl(`/api/admin/duty/events/${eventId}/alert-routing/${rule.id}`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_active: nextStatus })
      });

      setSuccess(`Rule ${nextStatus ? 'enabled' : 'paused'}.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed toggling rule:', err);
      fetchAlertRules();
    }
  };

  const handleDeleteRule = async () => {
    if (!deletingRule) return;
    setIsSubmitting(true);

    if (deletingRule.id.startsWith('default-')) {
      setRules((prev) => prev.filter((r) => r.id !== deletingRule.id));
      setSuccess('Alert rule deleted.');
      setTimeout(() => setSuccess(null), 3000);
      setDeletingRule(null);
      setIsSubmitting(false);
      return;
    }

    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(buildApiUrl(`/api/admin/duty/events/${eventId}/alert-routing/${deletingRule.id}`), {
        method: 'DELETE',
        headers
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess('Alert rule deleted.');
        setTimeout(() => setSuccess(null), 3000);
        setDeletingRule(null);
        fetchAlertRules();
      } else {
        setError(data.error || 'We couldn’t delete this alert rule. Try again');
      }
    } catch (err) {
      console.error('Failed deleting rule:', err);
      setError('We couldn’t delete this alert rule. Try again');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in" data-view-version="admin-alert-rules-v5">
      {/* Toast Notifications */}
      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-xl flex items-center justify-between space-x-2 text-xs font-medium animate-fade-in shadow-2xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-950 rounded-xl flex items-center justify-between space-x-2 text-xs font-medium animate-fade-in shadow-2xs">
          <div className="flex items-center space-x-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 cursor-pointer p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAE8E1] pb-4">
        <div>
          <h2 className="text-xl font-bold text-[#18181B] tracking-tight">
            Alert Rules
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5 font-normal">
            Choose who should receive important event alerts and when.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-xs text-zinc-500 font-medium">
            {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
          </span>
          <button
            onClick={fetchAlertRules}
            disabled={loading}
            aria-label="Refresh alert rules"
            className="flex items-center space-x-2 px-3 py-1.5 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-xs font-medium text-[#18181B] rounded-lg transition-all shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#C59B27] hover:bg-[#A8821B] text-white text-xs font-medium rounded-lg transition-all shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add rule</span>
          </button>
        </div>
      </div>

      {/* 2. Rules List */}
      {loading && rules.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#C59B27]" />
          <span>Loading alert rules…</span>
        </div>
      ) : error && rules.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-rose-200 rounded-2xl space-y-3 shadow-2xs">
          <AlertTriangle className="w-6 h-6 mx-auto text-rose-500" />
          <div>
            <h3 className="font-semibold text-zinc-800 text-sm">{error}</h3>
            <p className="text-zinc-500 text-xs mt-0.5">Please check your connection or try loading alert rules again.</p>
          </div>
          <div className="pt-1">
            <button
              onClick={fetchAlertRules}
              className="px-3.5 py-1.5 bg-white border border-[#EAE8E1] text-zinc-700 text-xs font-medium rounded-xl hover:bg-zinc-50 cursor-pointer shadow-2xs"
            >
              Try again
            </button>
          </div>
        </div>
      ) : rules.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl space-y-3">
          <Bell className="w-6 h-6 mx-auto text-zinc-400" />
          <div>
            <h3 className="font-semibold text-zinc-800 text-sm">No alert rules configured</h3>
            <p className="text-zinc-500 text-xs mt-0.5">
              Set up rules to determine who receives event notifications when an issue occurs.
            </p>
          </div>
          <div className="pt-1">
            <button
              onClick={openCreateModal}
              className="px-3.5 py-1.5 bg-[#C59B27] text-white text-xs font-medium rounded-xl hover:bg-[#A8821B] cursor-pointer"
            >
              Add rule
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const meta = CATEGORY_DEFINITIONS[rule.category_key] || {
              name: rule.category_key.replace(/_/g, ' '),
              triggerText: `When ${rule.category_key.replace(/_/g, ' ')} is reported`,
              defaultSeverity: 'medium'
            };

            const primaryRec = rule.recipients?.find((r) => r.delivery_tier === 'primary');
            const backupRec = rule.recipients?.find((r) => r.delivery_tier === 'backup');
            const primaryName = primaryRec?.responsibility_key || 'Care Lead';
            const backupName = backupRec?.responsibility_key || 'General Response';
            const delayMinutes = Math.max(1, Math.round((rule.escalation_delay_seconds || 120) / 60));
            const isActive = rule.is_active !== 0;

            const isMenuOpen = activeMenuRuleId === rule.id;

            return (
              <div
                key={rule.id}
                className={`p-4 bg-white border rounded-xl transition-all shadow-2xs relative ${
                  isActive ? 'border-[#EAE8E1]' : 'border-zinc-200 bg-zinc-50/40 opacity-75'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center space-x-2.5">
                      <h3 className="font-semibold text-sm text-zinc-900">
                        {meta.name}
                      </h3>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                        }`}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* Human sentence rule description */}
                    <div className="text-xs text-zinc-700 leading-relaxed font-normal">
                      <span className="text-zinc-500">{meta.triggerText}: </span>
                      <strong className="text-zinc-900 font-medium">Notify {primaryName}</strong> by In-app alert.
                      {backupName && (
                        <span>
                          {' '}If there is no response within {delayMinutes} minute{delayMinutes === 1 ? '' : 's'}, also notify{' '}
                          <strong className="text-zinc-900 font-medium">{backupName}</strong>.
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-3 text-[11px] text-zinc-400 pt-0.5">
                      <span>Contact method: In-app alert</span>
                      <span>•</span>
                      <span>Response timeout: {delayMinutes}m</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-start">
                    <button
                      onClick={() => setDetailRule(rule)}
                      className="text-xs text-zinc-600 hover:text-zinc-900 font-medium px-2 py-1 rounded-lg hover:bg-zinc-50 cursor-pointer"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openEditModal(rule)}
                      className="text-xs text-[#C59B27] hover:text-[#A8821B] font-medium px-2 py-1 rounded-lg hover:bg-[#C59B27]/10 cursor-pointer"
                    >
                      Edit
                    </button>

                    {/* More dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setActiveMenuRuleId(isMenuOpen ? null : rule.id)}
                        className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 cursor-pointer"
                        aria-label="More actions"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 mt-1 w-36 bg-white border border-[#EAE8E1] rounded-xl shadow-lg py-1 z-20 text-xs animate-fade-in">
                          <button
                            onClick={() => handleToggleRuleStatus(rule)}
                            className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 flex items-center space-x-2 text-zinc-700 cursor-pointer font-medium"
                          >
                            <Power className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{isActive ? 'Pause rule' : 'Enable rule'}</span>
                          </button>
                          <button
                            onClick={() => {
                              setActiveMenuRuleId(null);
                              setDeletingRule(rule);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-rose-50 flex items-center space-x-2 text-rose-600 cursor-pointer font-medium"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete rule</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Add / Edit Alert Rule Modal */}
      {showAddModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="alert-modal-title"
        >
          <div className="bg-white border border-[#EAE8E1] rounded-2xl w-full max-w-xl max-h-[90vh] shadow-xl flex flex-col overflow-hidden font-sans">
            <div className="flex items-start justify-between border-b border-[#EAE8E1] px-6 py-4 shrink-0">
              <div>
                <h3 id="alert-modal-title" className="text-base font-bold text-[#18181B]">
                  {editingRule ? 'Edit alert rule' : 'Create alert rule'}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Choose who should be notified when something needs attention.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingRule(null);
                }}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-950 rounded-xl text-xs font-medium flex items-center space-x-2">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* When this happens */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-800">When this happens</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white cursor-pointer"
                >
                  {Object.entries(CATEGORY_DEFINITIONS).map(([key, item]) => (
                    <option key={key} value={key}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <p className="text-[12px] text-zinc-500 pt-0.5">
                  {CATEGORY_DEFINITIONS[formCategory]?.triggerText}
                </p>
              </div>

              {/* Notify first */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-800">Notify first</label>
                <select
                  value={formPrimaryRole}
                  onChange={(e) => setFormPrimaryRole(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white cursor-pointer"
                >
                  {RESPONSIBILITIES.map((r) => (
                    <option key={r} value={r}>{formatRoleDisplay(r)}</option>
                  ))}
                </select>
              </div>

              {/* Send alert by */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-800">Send alert by</label>
                <select
                  value={formContactMethod}
                  onChange={(e) => setFormContactMethod(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white cursor-pointer"
                >
                  <option value="in_app">In the app</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="whatsapp" disabled>WhatsApp (Coming soon)</option>
                </select>
              </div>

              {/* If no one responds */}
              <div className="space-y-2 pt-2 border-t border-[#EAE8E1]">
                <span className="block text-xs font-medium text-zinc-800">If no one responds</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="block text-xs text-zinc-600">After</label>
                    <select
                      value={formDelayMinutes}
                      onChange={(e) => setFormDelayMinutes(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white cursor-pointer"
                    >
                      <option value={1}>1 minute</option>
                      <option value={2}>2 minutes</option>
                      <option value={3}>3 minutes</option>
                      <option value={5}>5 minutes</option>
                      <option value={10}>10 minutes</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-zinc-600">Then notify</label>
                    <select
                      value={formBackupRole}
                      onChange={(e) => setFormBackupRole(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:bg-white cursor-pointer"
                    >
                      {RESPONSIBILITIES.map((r) => (
                        <option key={r} value={r}>{formatRoleDisplay(r)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-[#EAE8E1] bg-white shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingRule(null);
                }}
                disabled={isSubmitting}
                className="min-h-[44px] px-4 py-2 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-zinc-700 font-medium text-xs rounded-xl cursor-pointer disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRule}
                disabled={isSubmitting}
                className="min-h-[44px] px-5 py-2 bg-[#C59B27] hover:bg-[#A8821B] text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (editingRule ? 'Saving…' : 'Creating rule…') : editingRule ? 'Save changes' : 'Create rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. View Details Modal */}
      {detailRule && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-start justify-between border-b border-[#EAE8E1] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#18181B]">
                  {CATEGORY_DEFINITIONS[detailRule.category_key]?.name || detailRule.category_key}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Alert rule details</p>
              </div>
              <button
                onClick={() => setDetailRule(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <span className="text-zinc-500">Status</span>
                <span className={`font-semibold ${detailRule.is_active ? 'text-emerald-700' : 'text-zinc-500'}`}>
                  {detailRule.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl space-y-1">
                <span className="text-zinc-500 block">When this happens</span>
                <p className="font-medium text-zinc-800">
                  {CATEGORY_DEFINITIONS[detailRule.category_key]?.triggerText || detailRule.category_key}
                </p>
              </div>

              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl space-y-1">
                <span className="text-zinc-500 block">Notify first</span>
                <p className="font-medium text-zinc-800">
                  {formatRoleDisplay(detailRule.recipients?.find((r) => r.delivery_tier === 'primary')?.responsibility_key || 'Care Lead')}
                </p>
              </div>

              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl space-y-1">
                <span className="text-zinc-500 block">If no one responds after {Math.round((detailRule.escalation_delay_seconds || 120) / 60)} minutes</span>
                <p className="font-medium text-zinc-800">
                  Then notify {formatRoleDisplay(detailRule.recipients?.find((r) => r.delivery_tier === 'backup')?.responsibility_key || 'General Response')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#EAE8E1]">
              <button
                onClick={() => setDetailRule(null)}
                className="min-h-[44px] px-4 py-2 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-zinc-700 font-medium text-xs rounded-xl cursor-pointer transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const target = detailRule;
                  setDetailRule(null);
                  openEditModal(target);
                }}
                className="min-h-[44px] px-4 py-2 bg-[#C59B27] hover:bg-[#A8821B] text-white font-medium text-xs rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                Edit rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Delete Confirmation Modal */}
      {deletingRule && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-9 h-9 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="space-y-0.5 pr-4">
                <h3 className="text-base font-bold text-[#18181B]">Delete this alert rule?</h3>
                <p className="text-xs text-zinc-500">
                  This rule will no longer be used for future alerts.
                </p>
              </div>
              <button
                onClick={() => setDeletingRule(null)}
                disabled={isSubmitting}
                className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl p-3.5 space-y-1 text-xs">
              <span className="text-zinc-500">Rule category</span>
              <p className="font-semibold text-zinc-900">
                {CATEGORY_DEFINITIONS[deletingRule.category_key]?.name || deletingRule.category_key}
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-[#EAE8E1]">
              <button
                type="button"
                onClick={() => setDeletingRule(null)}
                disabled={isSubmitting}
                className="px-3.5 py-2 bg-white hover:bg-zinc-100 border border-[#EAE8E1] text-zinc-700 font-medium text-xs rounded-xl cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRule}
                disabled={isSubmitting}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Deleting…' : 'Delete rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

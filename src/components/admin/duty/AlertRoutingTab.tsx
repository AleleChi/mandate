import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Save, 
  BellRing, 
  MessageSquareCode, 
  CheckSquare, 
  Square 
} from 'lucide-react';

const REAL_EVENT_ID = 'the-general-assembly-2026';

interface RoutingRule {
  id: string;
  category_key: string;
  responsibility_key: string;
  assignment_level: 'primary' | 'backup' | 'broadcast';
  dispatch_method: 'push_only' | 'sms_fallback' | 'voice_dispatch';
  enable_sound: number;
  enable_voice: number;
  enable_vibration: number;
}

export default function AlertRoutingTab() {
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [rules, setRules] = useState<RoutingRule[]>([]);

  const categories = [
    { key: 'child_care', name: 'General Child Care Concern' },
    { key: 'medical_support', name: 'Medical or First Aid Support' },
    { key: 'pickup_issue', name: 'Pickup Concern' },
    { key: 'pass_issue', name: 'Pass/Check-in Concern' },
    { key: 'security_concern', name: 'Security / Missing Child Concerns' },
    { key: 'location_support', name: 'Room/Classroom Assistance' },
    { key: 'other', name: 'General Help' }
  ];

  const responsibilities = [
    'Care Lead',
    'Security Lead',
    'First Aid Team',
    'Gate/Check-in Lead',
    'Pickup Lead',
    'Room/Group Lead',
    'General Response',
    'Event Admin',
    'Super Admin'
  ];

  const fetchAlertRouting = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/alert-routing`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // If no rules exist on the server yet, we initialize a default rule for each category.
          if (!data.rules || data.rules.length === 0) {
            const defaults = categories.map((cat, i) => ({
              id: `temp-${cat.key}`,
              category_key: cat.key,
              responsibility_key: cat.key === 'medical_support' ? 'First Aid Team' : cat.key === 'security_concern' ? 'Security Lead' : 'General Response',
              assignment_level: 'primary' as const,
              dispatch_method: 'push_only' as const,
              enable_sound: 1,
              enable_voice: 1,
              enable_vibration: 1
            }));
            setRules(defaults);
          } else {
            setRules(data.rules);
          }
        } else {
          setError(data.error || 'Failed to fetch alert routing policy');
        }
      } else {
        setError('Failed to fetch routing rules');
      }
    } catch (err) {
      console.error('Failed to fetch routing:', err);
      setError('An error occurred loading routing policies');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRuleField = (categoryKey: string, field: keyof RoutingRule, value: any) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.category_key === categoryKey) {
          return { ...r, [field]: value };
        }
        return r;
      })
    );
  };

  const handleSaveRules = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/alert-routing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSuccess('Alert routing policies and physical dispatch criteria saved.');
          setTimeout(() => setSuccess(null), 3000);
          fetchAlertRouting();
        } else {
          setError(data.error || 'Failed to save rules');
        }
      } else {
        setError('Failed to save rules to server');
      }
    } catch (err) {
      console.error('Failed saving rules:', err);
      setError('Error occurred while saving routing policies.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchAlertRouting();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in" data-view-version="admin-routing-rules-v1">
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl flex items-center space-x-2 text-xs font-semibold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-950 rounded-2xl flex items-center space-x-2 text-xs font-semibold animate-fade-in">
          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 font-sans tracking-tight">Incident & Alert Routing Engine</h2>
          <p className="text-xs text-zinc-500">Map emergency and help incident categories to specific on-duty volunteer roles, escalate levels, and choose device notification protocols.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchAlertRouting}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-2 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${loading ? 'animate-spin' : ''}`} />
            <span>Reload Rules</span>
          </button>
          <button
            onClick={handleSaveRules}
            disabled={saving}
            className="flex items-center space-x-1.5 px-4 py-2 bg-[#C59B27] hover:bg-[#A8821B] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Policies'}</span>
          </button>
        </div>
      </div>

      {loading && rules.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-3xl">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#C59B27]" />
          <span>Loading routing policies...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const rule = rules.find(r => r.category_key === cat.key) || {
              id: `temp-${cat.key}`,
              category_key: cat.key,
              responsibility_key: 'General Response',
              assignment_level: 'primary' as const,
              dispatch_method: 'push_only' as const,
              enable_sound: 1,
              enable_voice: 1,
              enable_vibration: 1
            };

            return (
              <div key={cat.key} className="bg-white border border-[#EAE8E1] rounded-2xl p-5 hover:border-[#C59B27]/50 transition-all shadow-2xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1 lg:max-w-xs">
                    <h4 className="font-bold text-sm text-zinc-900 flex items-center space-x-2">
                      <BellRing className="w-4 h-4 text-[#C59B27]" />
                      <span>{cat.name}</span>
                    </h4>
                    <p className="text-[10px] font-semibold text-zinc-400">Routes alerts originating under this category to target responders.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                    {/* Responding Role Target */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Responder Target</label>
                      <select
                        value={rule.responsibility_key}
                        onChange={(e) => handleUpdateRuleField(cat.key, 'responsibility_key', e.target.value)}
                        className="w-full text-xs p-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-semibold"
                      >
                        {responsibilities.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>

                    {/* Escalate Tier */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Escalation Tier</label>
                      <select
                        value={rule.assignment_level}
                        onChange={(e) => handleUpdateRuleField(cat.key, 'assignment_level', e.target.value)}
                        className="w-full text-xs p-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-semibold"
                      >
                        <option value="primary">Primary Responders Only</option>
                        <option value="backup">Escalate to Backup Responders</option>
                        <option value="broadcast">Broadcast to All Levels</option>
                      </select>
                    </div>

                    {/* Dispatch Hardware Priority */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Network Priority</label>
                      <select
                        value={rule.dispatch_method}
                        onChange={(e) => handleUpdateRuleField(cat.key, 'dispatch_method', e.target.value)}
                        className="w-full text-xs p-2 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl font-semibold"
                      >
                        <option value="push_only">Standard Push Notification</option>
                        <option value="sms_fallback">Push + SMS Backup</option>
                        <option value="voice_dispatch">Voice Call Escalation</option>
                      </select>
                    </div>
                  </div>

                  {/* Device Criteria - physical sound, voice, haptic */}
                  <div className="border-t lg:border-t-0 lg:border-l border-zinc-100 pt-3 lg:pt-0 lg:pl-5 space-y-2 lg:max-w-[180px]">
                    <div className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Target Criteria</div>
                    <div className="flex flex-col space-y-1.5 font-semibold text-zinc-700">
                      <button
                        onClick={() => handleUpdateRuleField(cat.key, 'enable_sound', rule.enable_sound === 1 ? 0 : 1)}
                        className="flex items-center space-x-2 text-xs hover:text-[#C59B27] text-left cursor-pointer"
                      >
                        {rule.enable_sound === 1 ? (
                          <CheckSquare className="w-4 h-4 text-[#C59B27]" />
                        ) : (
                          <Square className="w-4 h-4 text-zinc-300" />
                        )}
                        <span>Require Speaker Sound</span>
                      </button>

                      <button
                        onClick={() => handleUpdateRuleField(cat.key, 'enable_voice', rule.enable_voice === 1 ? 0 : 1)}
                        className="flex items-center space-x-2 text-xs hover:text-[#C59B27] text-left cursor-pointer"
                      >
                        {rule.enable_voice === 1 ? (
                          <CheckSquare className="w-4 h-4 text-[#C59B27]" />
                        ) : (
                          <Square className="w-4 h-4 text-zinc-300" />
                        )}
                        <span>Spoken TTS Dispatch</span>
                      </button>

                      <button
                        onClick={() => handleUpdateRuleField(cat.key, 'enable_vibration', rule.enable_vibration === 1 ? 0 : 1)}
                        className="flex items-center space-x-2 text-xs hover:text-[#C59B27] text-left cursor-pointer"
                      >
                        {rule.enable_vibration === 1 ? (
                          <CheckSquare className="w-4 h-4 text-[#C59B27]" />
                        ) : (
                          <Square className="w-4 h-4 text-zinc-300" />
                        )}
                        <span>Haptic/Vibrate Pulse</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

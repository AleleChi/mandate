import React, { useEffect, useState } from 'react';
import { RefreshCw, Settings2, CheckCircle2, ChevronRight, SlidersHorizontal, Lock } from 'lucide-react';
import { api } from '../../services/api';
import { AutomationDetailModal, AutomationRecordItem } from './AutomationDetailModal';

interface EventAutomationsInboxProps {
  onNavigateTab: (tab: string) => void;
  onNavigateRoute: (route: string) => void;
  onPrepareConfirmedAction?: (actionKey: string, automation: AutomationRecordItem) => void;
}

export const EventAutomationsInbox: React.FC<EventAutomationsInboxProps> = ({
  onNavigateTab,
  onNavigateRoute,
  onPrepareConfirmedAction
}) => {
  const [activeItems, setActiveItems] = useState<AutomationRecordItem[]>([]);
  const [resolvedItems, setResolvedItems] = useState<AutomationRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'resolved'>('active');
  const [selectedItem, setSelectedItem] = useState<AutomationRecordItem | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [ruleSettings, setRuleSettings] = useState<any[]>([]);
  const [updatingRuleId, setUpdatingRuleId] = useState<string | null>(null);

  const fetchAutomations = async (evaluate = false) => {
    try {
      if (evaluate) setRefreshing(true);
      const res = await api.admin.getEventAutomations(evaluate);
      if (res.success) {
        setActiveItems(res.active || []);
        setResolvedItems(res.resolved || []);
      }
    } catch (err) {
      console.error('Failed to load event automations:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await api.admin.getEventAutomationSettings();
      if (res.success) {
        setRuleSettings(res.rules || []);
      }
    } catch (err) {
      console.error('Failed to load automation settings:', err);
    }
  };

  useEffect(() => {
    fetchAutomations();
  }, []);

  const handleToggleRule = async (ruleId: string, currentEnabled: boolean) => {
    setUpdatingRuleId(ruleId);
    try {
      const res = await api.admin.updateEventAutomationSetting(ruleId, !currentEnabled);
      if (res.success) {
        setRuleSettings(prev =>
          prev.map(r => (r.id === ruleId ? { ...r, isEnabled: !currentEnabled } : r))
        );
        // Re-evaluate with updated settings
        fetchAutomations(true);
      }
    } catch (err) {
      console.error('Failed to toggle automation rule:', err);
    } finally {
      setUpdatingRuleId(null);
    }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await api.admin.acknowledgeEventAutomation(id);
      fetchAutomations();
    } catch (err) {
      console.error('Failed to acknowledge automation:', err);
    }
  };

  const handleRouteClick = (route: string) => {
    if (['duty', 'duty_devices'].includes(route)) {
      onNavigateTab('duty_devices');
    } else if (route === 'events') {
      onNavigateTab('events');
    } else if (route === 'children') {
      onNavigateTab('children');
    } else if (route === 'reports') {
      onNavigateTab('reports');
    } else if (route === 'incidents' || route === 'escalations') {
      onNavigateTab('incidents');
    } else {
      onNavigateRoute(route);
    }
  };

  const displayedList = viewMode === 'active' ? activeItems : resolvedItems;

  return (
    <div
      className="bg-white rounded-2xl p-6 border border-[#EAE8E1]/80 shadow-2xs space-y-4 text-left"
      data-component-version="admin-event-automations-v1"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E1]/70">
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-base font-semibold text-zinc-900">
            Event automations
          </h3>
          {activeItems.length > 0 && (
            <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full border border-zinc-200/60">
              {activeItems.length} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Active / Resolved toggle */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg text-[11px] font-medium text-zinc-600">
            <button
              type="button"
              onClick={() => setViewMode('active')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'active' ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'hover:text-zinc-900'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setViewMode('resolved')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'resolved' ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'hover:text-zinc-900'
              }`}
            >
              Resolved ({resolvedItems.length})
            </button>
          </div>

          <button
            type="button"
            title="Refresh automations"
            onClick={() => fetchAutomations(true)}
            disabled={refreshing}
            className="p-1 text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-100 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            title="Automation settings"
            onClick={() => {
              if (!showSettings) fetchSettings();
              setShowSettings(!showSettings);
            }}
            className={`p-1 rounded-md transition-colors ${
              showSettings ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Settings view */}
      {showSettings && (
        <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200/70 space-y-3 mb-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-200/50">
            <span className="text-xs font-semibold text-zinc-800">Rule detection controls</span>
            <span className="text-[11px] text-zinc-500">Phase 3B Deterministic</span>
          </div>

          <div className="space-y-2">
            {ruleSettings.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between text-xs py-1">
                <div className="pr-4">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-zinc-800">{rule.name}</span>
                    {rule.isMandatory && (
                      <span title="Mandatory safety control" className="text-zinc-400">
                        <Lock className="w-3 h-3 inline" />
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-500 block">{rule.description}</span>
                </div>

                <div>
                  {rule.isMandatory ? (
                    <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-200/70 px-2 py-0.5 rounded">
                      Locked On
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={updatingRuleId === rule.id}
                      onClick={() => handleToggleRule(rule.id, rule.isEnabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        rule.isEnabled ? 'bg-[#9A7326]' : 'bg-zinc-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          rule.isEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List items */}
      {loading ? (
        <div className="py-6 text-center text-xs text-zinc-400">
          Evaluating event automations...
        </div>
      ) : displayedList.length === 0 ? (
        <p className="text-xs text-zinc-500 py-3">
          {viewMode === 'active'
            ? 'All operational criteria meet readiness standards. No active automations.'
            : 'No resolved automations for this event.'}
        </p>
      ) : (
        <div className="divide-y divide-[#EAE8E1]/60">
          {displayedList.map((item) => (
            <div
              key={item.id}
              className="py-3.5 first:pt-0 last:pb-0 space-y-1 group transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className="font-medium text-sm text-zinc-900 hover:text-[#9A7326] transition-colors text-left flex-1 cursor-pointer"
                >
                  {item.title}
                </button>

                {item.severity === 'urgent' && (
                  <span className="text-[11px] font-semibold text-rose-700 shrink-0">
                    Urgent
                  </span>
                )}
                {viewMode === 'resolved' && (
                  <span className="text-[11px] text-emerald-700 shrink-0">
                    Resolved
                  </span>
                )}
              </div>

              <p className="text-xs text-zinc-500 leading-relaxed">
                {item.summary}
              </p>

              {/* Action Links */}
              <div className="flex items-center gap-3 pt-1">
                {item.action_target_route && (
                  <button
                    type="button"
                    onClick={() => handleRouteClick(item.action_target_route!)}
                    className="text-xs font-semibold text-[#9A7326] hover:text-[#7A5B1C] hover:underline cursor-pointer"
                  >
                    {item.action_target_label || 'View details →'}
                  </button>
                )}

                {item.proposed_action_key && onPrepareConfirmedAction && viewMode === 'active' && (
                  <button
                    type="button"
                    onClick={() => onPrepareConfirmedAction(item.proposed_action_key!, item)}
                    className="text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:underline cursor-pointer"
                  >
                    {item.proposed_action_key === 'SEND_DUTY_REMINDERS' && 'Review reminder →'}
                    {item.proposed_action_key === 'REGENERATE_REPORT' && 'Regenerate report →'}
                    {item.proposed_action_key === 'CREATE_ADMIN_OPERATIONS_ALERT' && 'Review Admin alert →'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <AutomationDetailModal
        automation={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onNavigate={(route) => handleRouteClick(route)}
        onReviewAction={(item) => {
          if (onPrepareConfirmedAction && item.proposed_action_key) {
            onPrepareConfirmedAction(item.proposed_action_key, item);
          }
        }}
        onAcknowledge={handleAcknowledge}
      />
    </div>
  );
};

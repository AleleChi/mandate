import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, SlidersHorizontal, Lock, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';
import { AutomationDetailModal, AutomationRecordItem } from './AutomationDetailModal';
import { GroupedDetailModal } from './GroupedDetailModal';
import { FullEventWatchModal } from './FullEventWatchModal';
import {
  groupAutomationsForOverview,
  GroupedEventWatchItem,
  formatHumanDate
} from './eventWatchModel';

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

  // Modal states
  const [selectedItem, setSelectedItem] = useState<AutomationRecordItem | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupedEventWatchItem | null>(null);
  const [showFullModal, setShowFullModal] = useState(false);

  // Settings states
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

  // Grouping computation for overview
  const groupedResult = useMemo(() => {
    return groupAutomationsForOverview(activeItems, 5);
  }, [activeItems]);

  const { overviewItems, totalActiveCount, categorySummaries, hasMore } = groupedResult;

  // Bounded resolved items for overview
  const displayedResolved = useMemo(() => {
    return resolvedItems.slice(0, 4);
  }, [resolvedItems]);

  return (
    <div
      className="bg-white rounded-2xl p-6 border border-[#EAE8E1]/80 shadow-2xs space-y-4 text-left"
      data-component-version="admin-event-watch-v2"
    >
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#EAE8E1]/70 gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="font-serif text-base font-semibold text-zinc-900">
              Event watch
            </h3>
            {totalActiveCount > 0 ? (
              <span className="text-xs font-medium text-zinc-500">
                {categorySummaries.length > 1
                  ? `${categorySummaries.length} areas need attention`
                  : `${totalActiveCount} ${totalActiveCount === 1 ? 'item needs attention' : 'items need attention'}`}
              </span>
            ) : (
              <span className="text-xs font-medium text-emerald-700">
                All clear
              </span>
            )}
          </div>

          {/* Clean Category Summary Line (Section 12) */}
          {totalActiveCount > 0 && viewMode === 'active' && categorySummaries.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 mt-1">
              {categorySummaries.map((cat, idx) => (
                <span key={cat.name} className="inline-flex items-center gap-1.5">
                  <span className="text-zinc-700 font-medium">{cat.name}</span>
                  <span className="text-zinc-400 font-mono text-[11px]">{cat.count}</span>
                  {idx < categorySummaries.length - 1 && <span className="text-zinc-300">·</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action Controls & Human Tabs */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {/* Needs attention / Cleared toggle */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg text-[11px] font-medium text-zinc-600">
            <button
              type="button"
              onClick={() => setViewMode('active')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'active'
                  ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                  : 'hover:text-zinc-900'
              }`}
            >
              Needs attention {totalActiveCount > 0 && `(${totalActiveCount})`}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('resolved')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'resolved'
                  ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                  : 'hover:text-zinc-900'
              }`}
            >
              Cleared ({resolvedItems.length})
            </button>
          </div>

          <button
            type="button"
            title="Refresh event watch"
            onClick={() => fetchAutomations(true)}
            disabled={refreshing}
            className="p-1 text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            title="Monitoring settings"
            onClick={() => {
              if (!showSettings) fetchSettings();
              setShowSettings(!showSettings);
            }}
            className={`p-1 rounded-md transition-colors cursor-pointer ${
              showSettings ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Settings View (Controlled) */}
      {showSettings && (
        <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200/70 space-y-3 mb-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-200/50">
            <span className="text-xs font-semibold text-zinc-800">Rule detection controls</span>
            <span className="text-[11px] text-zinc-500">Operational Monitoring</span>
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

      {/* 3. List Content (Bounded Overview Rows) */}
      {loading ? (
        <div className="py-6 text-center text-xs text-zinc-400">
          Updating event watch...
        </div>
      ) : viewMode === 'active' ? (
        overviewItems.length === 0 ? (
          <p className="text-xs text-zinc-500 py-3">
            Everything currently being monitored looks clear.
          </p>
        ) : (
          <div className="divide-y divide-[#EAE8E1]/60">
            {overviewItems.map((group) => (
              <div
                key={group.id}
                className="py-3.5 first:pt-0 last:pb-0 space-y-1 group transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (group.isGroup) {
                        setSelectedGroup(group);
                      } else {
                        setSelectedItem(group.items[0]);
                      }
                    }}
                    className="font-medium text-sm text-zinc-900 hover:text-[#9A7326] transition-colors text-left flex-1 cursor-pointer"
                  >
                    {group.title}
                  </button>

                  {group.severity === 'urgent' && (
                    <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full shrink-0">
                      Urgent
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-500 leading-relaxed">
                  {group.summary}
                </p>

                {/* Direct Action Links */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (group.isGroup) {
                        setSelectedGroup(group);
                      } else if (group.actionTargetRoute) {
                        handleRouteClick(group.actionTargetRoute);
                      }
                    }}
                    className="text-xs font-semibold text-[#9A7326] hover:text-[#7A5B1C] hover:underline cursor-pointer"
                  >
                    {group.actionTargetLabel}
                  </button>

                  {!group.isGroup && group.proposedActionKey && onPrepareConfirmedAction && (
                    <button
                      type="button"
                      onClick={() => onPrepareConfirmedAction(group.proposedActionKey!, group.items[0])}
                      className="text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:underline cursor-pointer"
                    >
                      {group.proposedActionKey === 'SEND_DUTY_REMINDERS' && 'Review reminder →'}
                      {group.proposedActionKey === 'REGENERATE_REPORT' && 'Regenerate report →'}
                      {group.proposedActionKey === 'CREATE_ADMIN_OPERATIONS_ALERT' && 'Review Admin alert →'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Resolved / Cleared Tab */
        displayedResolved.length === 0 ? (
          <p className="text-xs text-zinc-500 py-3">
            No cleared items recorded for this event.
          </p>
        ) : (
          <div className="divide-y divide-[#EAE8E1]/60">
            {displayedResolved.map((item) => {
              const detectedStr = formatHumanDate(item.first_detected_at, true);
              const clearedStr = item.resolved_at ? formatHumanDate(item.resolved_at, true) : null;

              return (
                <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="font-medium text-sm text-zinc-900 hover:text-[#9A7326] transition-colors text-left flex-1 cursor-pointer"
                    >
                      {item.title}
                    </button>
                    <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                      Cleared
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">{item.summary}</p>
                  <p className="text-[11px] text-zinc-400">
                    Detected {detectedStr} {clearedStr && `· Cleared ${clearedStr}`}
                  </p>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* 4. Overview Footer Bounding: View all button */}
      {(hasMore || totalActiveCount > 5 || (viewMode === 'resolved' && resolvedItems.length > 4)) && (
        <div className="pt-2 border-t border-[#EAE8E1]/60">
          <button
            type="button"
            onClick={() => setShowFullModal(true)}
            className="text-xs font-semibold text-[#9A7326] hover:text-[#7A5B1C] hover:underline cursor-pointer flex items-center gap-1"
          >
            <span>
              {viewMode === 'active'
                ? `View all ${totalActiveCount} items →`
                : `View all ${resolvedItems.length} cleared records →`}
            </span>
          </button>
        </div>
      )}

      {/* Modals */}
      <GroupedDetailModal
        group={selectedGroup}
        isOpen={!!selectedGroup}
        onClose={() => setSelectedGroup(null)}
        onNavigateRoute={(route) => handleRouteClick(route)}
        onSelectItem={(item) => setSelectedItem(item)}
        onPrepareConfirmedAction={onPrepareConfirmedAction}
      />

      <FullEventWatchModal
        isOpen={showFullModal}
        onClose={() => setShowFullModal(false)}
        activeItems={activeItems}
        resolvedItems={resolvedItems}
        onSelectItem={(item) => setSelectedItem(item)}
        onNavigateRoute={(route) => handleRouteClick(route)}
        onPrepareConfirmedAction={onPrepareConfirmedAction}
      />

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

import React from 'react';
import { X, ExternalLink, Clock } from 'lucide-react';
import { GroupedEventWatchItem, formatHumanDate, formatHumanExpectedTime } from './eventWatchModel';
import { AutomationRecordItem } from './AutomationDetailModal';

interface GroupedDetailModalProps {
  group: GroupedEventWatchItem | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateRoute: (route: string) => void;
  onSelectItem: (item: AutomationRecordItem) => void;
  onPrepareConfirmedAction?: (actionKey: string, automation: AutomationRecordItem) => void;
}

export const GroupedDetailModal: React.FC<GroupedDetailModalProps> = ({
  group,
  isOpen,
  onClose,
  onNavigateRoute,
  onSelectItem,
  onPrepareConfirmedAction
}) => {
  if (!isOpen || !group) return null;

  const getEditorialExplanation = (category: string, signalType: string): string => {
    switch (signalType) {
      case 'REPORT_EXPIRED':
        return 'These reports remain available in your historical records, but their temporary download links have expired.';
      case 'VOLUNTEER_NO_SHOW':
        return 'These volunteers are assigned to active posts for this event but have not yet recorded a duty check-in on site.';
      case 'LOCATION_UNDERSTAFFED':
        return 'These locations currently have fewer assigned volunteers than required for safe and smooth event operations.';
      case 'CONFIGURATION_GAP':
        return 'These operational settings should be configured before the event begins to avoid admission or staffing bottlenecks.';
      case 'SAFETY_ITEM_OPEN':
        return 'Unresolved safeguarding alerts, medical notices, or open incident logs requiring administrative attention.';
      default:
        return 'Items detected during event monitoring that may require operational review.';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 text-left">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              {group.category}
            </span>
            <h3 className="font-serif text-lg font-semibold text-zinc-900 mt-0.5">
              {group.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Editorial Subhead */}
        <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-100 text-xs text-zinc-600 leading-relaxed">
          {getEditorialExplanation(group.category, group.signalType)}
        </div>

        {/* Bounded Scrollable Items List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1 divide-y divide-zinc-100">
          {group.items.map((item, idx) => {
            let payload: any = {};
            try {
              payload = JSON.parse(item.payload_json || '{}');
            } catch {}

            return (
              <div
                key={item.id || idx}
                className="pt-3 first:pt-0 space-y-1 group hover:bg-zinc-50/50 p-2 rounded-lg transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectItem(item);
                    }}
                    className="font-medium text-xs text-zinc-900 hover:text-[#9A7326] transition-colors text-left flex-1 cursor-pointer"
                  >
                    {item.title}
                  </button>

                  <span className="text-[11px] text-zinc-400 shrink-0 font-mono">
                    {formatHumanDate(item.last_detected_at || item.first_detected_at)}
                  </span>
                </div>

                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  {item.summary}
                </p>

                {/* Direct Action Link for Item */}
                <div className="flex items-center gap-3 pt-0.5">
                  {item.proposed_action_key && onPrepareConfirmedAction && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onPrepareConfirmedAction(item.proposed_action_key!, item);
                      }}
                      className="text-[11px] font-semibold text-[#9A7326] hover:text-[#7A5B1C] hover:underline cursor-pointer"
                    >
                      {item.proposed_action_key === 'SEND_DUTY_REMINDERS' && 'Review reminder →'}
                      {item.proposed_action_key === 'REGENERATE_REPORT' && 'Regenerate copy →'}
                      {item.proposed_action_key === 'CREATE_ADMIN_OPERATIONS_ALERT' && 'Review alert →'}
                    </button>
                  )}
                  {item.action_target_route && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNavigateRoute(item.action_target_route!);
                      }}
                      className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 hover:underline cursor-pointer"
                    >
                      {item.action_target_label || 'View section →'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            {group.items.length} {group.items.length === 1 ? 'record' : 'records'}
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateRoute(group.actionTargetRoute);
            }}
            className="text-xs font-semibold text-[#9A7326] hover:text-[#7A5B1C] transition-colors cursor-pointer flex items-center gap-1"
          >
            <span>{group.actionTargetLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

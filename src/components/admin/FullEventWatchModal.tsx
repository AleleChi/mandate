import React, { useState, useMemo } from 'react';
import { X, Search, CheckCircle2, AlertCircle, ChevronDown, Clock, Filter } from 'lucide-react';
import { AutomationRecordItem } from './AutomationDetailModal';
import { EventWatchCategory, resolveCategory, formatHumanDate } from './eventWatchModel';

interface FullEventWatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeItems: AutomationRecordItem[];
  resolvedItems: AutomationRecordItem[];
  onSelectItem: (item: AutomationRecordItem) => void;
  onNavigateRoute: (route: string) => void;
  onPrepareConfirmedAction?: (actionKey: string, automation: AutomationRecordItem) => void;
}

export const FullEventWatchModal: React.FC<FullEventWatchModalProps> = ({
  isOpen,
  onClose,
  activeItems,
  resolvedItems,
  onSelectItem,
  onNavigateRoute,
  onPrepareConfirmedAction
}) => {
  const [tab, setTab] = useState<'active' | 'cleared'>('active');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);

  if (!isOpen) return null;

  const currentPool = tab === 'active' ? activeItems : resolvedItems;

  // Filter and search
  const filteredItems = useMemo(() => {
    let list = currentPool;

    if (selectedCategory !== 'All') {
      list = list.filter(item => resolveCategory(item.signal_type) === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => {
        const titleMatch = item.title?.toLowerCase().includes(q);
        const summaryMatch = item.summary?.toLowerCase().includes(q);
        let payloadMatch = false;
        try {
          const p = JSON.parse(item.payload_json || '{}');
          payloadMatch =
            (p.volunteerName && p.volunteerName.toLowerCase().includes(q)) ||
            (p.locationName && p.locationName.toLowerCase().includes(q)) ||
            (p.reportType && p.reportType.toLowerCase().includes(q));
        } catch {}
        return titleMatch || summaryMatch || payloadMatch;
      });
    }

    return list;
  }, [currentPool, selectedCategory, searchQuery]);

  const displayedList = filteredItems.slice(0, visibleCount);
  const hasMore = filteredItems.length > visibleCount;

  // Categories present
  const availableCategories: EventWatchCategory[] = ['Safety', 'Duty', 'Event setup', 'Reports'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 text-left">
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#181817] rounded-2xl shadow-2xl border border-zinc-200 dark:border-[#2A2926] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-[#2A2926] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-sans text-xl font-semibold text-zinc-900 dark:text-[#F7F4ED]">
              Event watch
            </h2>
            <span className="text-xs text-zinc-400 dark:text-[#938C81] font-mono">
              {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#20201E] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection: Needs attention / Cleared */}
        <div className="px-6 pt-3 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center bg-zinc-200/70 p-0.5 rounded-lg text-xs font-medium text-zinc-600">
            <button
              type="button"
              onClick={() => {
                setTab('active');
                setVisibleCount(20);
              }}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                tab === 'active'
                  ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                  : 'hover:text-zinc-900'
              }`}
            >
              Needs attention ({activeItems.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('cleared');
                setVisibleCount(20);
              }}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                tab === 'cleared'
                  ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                  : 'hover:text-zinc-900'
              }`}
            >
              Cleared ({resolvedItems.length})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search volunteer, location, report..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(20);
              }}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:border-zinc-400"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="px-6 py-2.5 border-b border-zinc-100 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-zinc-400 text-[11px] font-medium mr-1 shrink-0">Filter:</span>
          {['All', ...availableCategories].map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat);
                  setVisibleCount(20);
                }}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-900 text-white font-medium'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* List Content */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1 divide-y divide-zinc-100">
          {displayedList.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              {tab === 'active'
                ? 'Everything currently being monitored looks clear.'
                : 'No cleared records match the selected filters.'}
            </div>
          ) : (
            displayedList.map((item) => {
              const cat = resolveCategory(item.signal_type);
              const detectedStr = formatHumanDate(item.first_detected_at, true);
              const clearedStr = item.resolved_at ? formatHumanDate(item.resolved_at, true) : null;

              return (
                <div
                  key={item.id}
                  className="pt-3.5 first:pt-0 space-y-1.5 group hover:bg-zinc-50/60 p-2.5 rounded-xl transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">
                        {cat}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onSelectItem(item);
                        }}
                        className="font-medium text-sm text-zinc-900 hover:text-[#9A7326] transition-colors text-left cursor-pointer"
                      >
                        {item.title}
                      </button>
                    </div>

                    {item.severity === 'urgent' && tab === 'active' && (
                      <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full shrink-0">
                        Urgent
                      </span>
                    )}
                    {tab === 'cleared' && (
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                        Cleared
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-zinc-500 leading-relaxed pl-1">
                    {item.summary}
                  </p>

                  {/* History / Timestamps */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pl-1 text-[11px] text-zinc-400">
                    <div>
                      {tab === 'active' ? (
                        <span>Detected {detectedStr}</span>
                      ) : (
                        <span>
                          Detected {detectedStr} {clearedStr && `· Cleared ${clearedStr}`}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      {item.proposed_action_key && onPrepareConfirmedAction && tab === 'active' && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onPrepareConfirmedAction(item.proposed_action_key!, item);
                          }}
                          className="text-xs font-semibold text-[#9A7326] hover:text-[#7A5B1C] hover:underline cursor-pointer"
                        >
                          {item.proposed_action_key === 'SEND_DUTY_REMINDERS' && 'Review reminder →'}
                          {item.proposed_action_key === 'REGENERATE_REPORT' && 'Regenerate report →'}
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
                          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 hover:underline cursor-pointer"
                        >
                          {item.action_target_label || 'View section →'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Show More Pagination Button */}
          {hasMore && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount(prev => prev + 20)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200/70 text-zinc-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Show more ({filteredItems.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-400">
          <span>Showing {displayedList.length} of {filteredItems.length} records</span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

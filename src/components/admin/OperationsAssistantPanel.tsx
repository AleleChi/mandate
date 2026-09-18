import React, { useState } from 'react';
import {
  Send,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { api } from '../../services/api';

export interface AttentionItem {
  id: string;
  title: string;
  explanation: string;
  severity: 'info' | 'attention' | 'urgent';
  count?: number;
  actionLabel: string;
  actionRoute: string;
  actionTab: string;
}

export interface EventReadinessReport {
  event: {
    id: string;
    title: string;
    status: string;
    startsAt?: string;
    endsAt?: string;
    capacity: number | null;
    placesRemaining: number | null;
    registrationClosesAt: string | null;
    volunteerRegistrationClosesAt: string | null;
  } | null;
  readinessStatus: 'READY' | 'NEEDS ATTENTION' | 'NOT READY';
  readinessReasons: string[];
  metrics: {
    registrations: number;
    selectedChildren: number;
    eventChildCapacity: number | null;
    placesRemaining: number | null;
    checkedIn: number;
    pickedUp: number;
    approvedVolunteers: number;
    volunteersAssigned: number;
    volunteersOnDuty: number;
    dutyLocations: number;
    locationsBelowTarget: number;
    selectedChildrenWithoutPasses: number;
    openSafetyNotices: number;
    unresolvedEscalations: number;
    registrationClosingDate: string | null;
  };
  needsAttention: AttentionItem[];
  automationTriggers: string[];
  lastUpdated: string;
}

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
  totalCount?: number;
  displayedCount?: number;
}

export interface BreakdownItem {
  label: string;
  primary: string | number;
  secondary?: string | number;
  meta?: string;
}

export interface DeepLinkItem {
  label: string;
  route?: string;
  tab?: string;
}

export interface GroundedQueryResult {
  answer: string;
  grounded: boolean;
  intent: string;
  provenance?: {
    source: string;
    updatedAt: string;
  };
  table?: TableData;
  breakdown?: {
    title?: string;
    items: BreakdownItem[];
  };
  deepLinks?: DeepLinkItem[];
  data?: any;
  suggestedQuestions?: string[];
  clarification?: boolean;
  actionAttempt?: boolean;
}

export interface OperationsAssistantPanelProps {
  onNavigateTab?: (tab: string) => void;
  onNavigateRoute?: (route: string) => void;
  className?: string;
}

const CATEGORIZED_SUGGESTIONS: Record<string, string[]> = {
  Children: [
    'How many children are checked in right now?',
    'List selected children without passes.',
    'Which age group has the highest registration?'
  ],
  Volunteers: [
    'List the volunteers currently on duty.',
    'Who is assigned to Grace Hall?',
    'How many approved volunteers are not assigned?'
  ],
  Duty: [
    'Which duty locations need more people?',
    'Which volunteers haven\'t reported for duty?',
    'Who is assigned to Grace Hall?'
  ],
  Applications: [
    'How many applications are under review?',
    'How many children are selected?',
    'Is registration still open?'
  ],
  Safety: [
    'Show unresolved escalations.',
    'Are there any open safety notices?',
    'What changed in the last hour?'
  ],
  Reports: [
    'What reports were generated today?',
    'Give me an event summary.',
    'What changed today?'
  ]
};

export const OperationsAssistantPanel: React.FC<OperationsAssistantPanelProps> = ({
  onNavigateTab,
  onNavigateRoute,
  className = ''
}) => {
  const [queryInput, setQueryInput] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<GroundedQueryResult | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Duty');

  const categories = Object.keys(CATEGORIZED_SUGGESTIONS);
  const currentSuggestions = CATEGORIZED_SUGGESTIONS[selectedCategory] || CATEGORIZED_SUGGESTIONS['Duty'];

  const handleRunQuery = async (questionText: string) => {
    const q = questionText.trim();
    if (!q) return;

    setQueryInput(q);
    setQueryLoading(true);

    try {
      const res = await api.admin.queryOperationsAssistant(q);
      if (res.success && res.result) {
        setQueryResult(res.result);
      } else {
        setQueryResult({
          answer: "I don't have enough event data to answer that yet.",
          grounded: false,
          intent: 'unsupported_query'
        });
      }
    } catch (err: any) {
      console.error('Operational query error:', err);
      setQueryResult({
        answer: "I don't have enough event data to answer that yet.",
        grounded: false,
        intent: 'unsupported_query'
      });
    } finally {
      setQueryLoading(false);
    }
  };

  const handleDeepLinkClick = (link: DeepLinkItem) => {
    if (link.tab && onNavigateTab) {
      onNavigateTab(link.tab);
    } else if (link.route && onNavigateRoute) {
      onNavigateRoute(link.route);
    }
  };

  return (
    <div
      className={`bg-white border border-[#EAE8E1]/80 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4 text-left ${className}`}
      data-component-version="admin-operations-assistant-human-refined-v4"
    >
      {/* Editorial Header */}
      <div className="space-y-0.5 pb-1">
        <h3 className="font-serif text-base font-semibold text-zinc-900">
          Operations Assistant
        </h3>
        <p className="text-xs text-zinc-500">
          Ask natural-language questions grounded in live system data
        </p>
      </div>

      {/* Query Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleRunQuery(queryInput);
        }}
        className="relative flex items-center"
      >
        <input
          type="text"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Ask about volunteers, duty, children, safety..."
          className="w-full pl-3.5 pr-18 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6]/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] transition-all font-sans text-zinc-900 placeholder:text-zinc-400"
        />
        <button
          type="submit"
          disabled={queryLoading || !queryInput.trim()}
          className="absolute right-1.5 px-3 py-1 bg-[#18181B] hover:bg-zinc-800 disabled:opacity-40 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          {queryLoading ? (
            <RefreshCw className="w-3 h-3 animate-spin text-[#C59B27]" />
          ) : (
            <Send className="w-3 h-3 text-[#C59B27]" />
          )}
          <span>Ask</span>
        </button>
      </form>

      {/* Organized Category Suggestion Discovery */}
      <div className="space-y-2 pt-0.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`text-[11px] px-2.5 py-0.5 rounded-md transition-colors cursor-pointer shrink-0 font-medium ${
                selectedCategory === cat
                  ? 'bg-[#FAF9F6] text-[#9A7326] border border-[#C59B27]/30'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          {currentSuggestions.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleRunQuery(q)}
              className="text-xs text-left text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer py-0.5 flex items-center justify-between group"
            >
              <span>{q}</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-[#C59B27] transition-opacity shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Answer Area with Rich Output Support */}
      {queryResult && (
        <div className="pt-3 border-t border-[#EAE8E1]/70 space-y-3 text-left">
          {/* Main Typography Answer */}
          <p className="text-xs text-zinc-800 leading-relaxed font-normal">
            {queryResult.answer}
          </p>

          {/* Structured Table Display */}
          {queryResult.table && queryResult.table.rows && queryResult.table.rows.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="overflow-x-auto rounded-lg border border-[#EAE8E1]/80 max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1]/80 text-[11px] text-zinc-500 font-medium">
                      {queryResult.table.columns.map((col, cIdx) => (
                        <th key={cIdx} className="py-2 px-3 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAE8E1]/60">
                    {queryResult.table.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-[#FAF9F6]/50 transition-colors">
                        {row.map((val, cellIdx) => (
                          <td key={cellIdx} className="py-1.5 px-3 text-zinc-800 whitespace-nowrap text-xs">
                            {val !== null && val !== undefined ? String(val) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {queryResult.table.totalCount !== undefined &&
                queryResult.table.displayedCount !== undefined &&
                queryResult.table.totalCount > queryResult.table.displayedCount && (
                  <p className="text-[11px] text-zinc-400 text-right">
                    Showing {queryResult.table.displayedCount} of {queryResult.table.totalCount} records
                  </p>
                )}
            </div>
          )}

          {/* Structured Breakdown Display */}
          {queryResult.breakdown && queryResult.breakdown.items && queryResult.breakdown.items.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {queryResult.breakdown.title && (
                <span className="text-[11px] font-medium text-zinc-500 block uppercase tracking-wider">
                  {queryResult.breakdown.title}
                </span>
              )}
              <div className="grid grid-cols-1 gap-1.5">
                {queryResult.breakdown.items.map((item, bIdx) => (
                  <div
                    key={bIdx}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#FAF9F6]/70 border border-[#EAE8E1]/60 text-xs"
                  >
                    <span className="font-medium text-zinc-800">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-900 font-semibold">{item.primary}</span>
                      {item.secondary && (
                        <span className="text-[11px] text-[#9A7326] font-medium">
                          ({item.secondary})
                        </span>
                      )}
                      {item.meta && (
                        <span className="text-[11px] text-zinc-400">
                          · {item.meta}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deep Link Action Shortcuts */}
          {queryResult.deepLinks && queryResult.deepLinks.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {queryResult.deepLinks.map((link, lIdx) => (
                <button
                  key={lIdx}
                  type="button"
                  onClick={() => handleDeepLinkClick(link)}
                  className="text-xs inline-flex items-center gap-1 font-medium text-[#9A7326] hover:text-[#7A5B1C] transition-colors cursor-pointer py-0.5"
                >
                  <span>{link.label}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}

          {/* Provenance Footer */}
          {queryResult.provenance && (
            <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-2 border-t border-[#EAE8E1]/60">
              <span className="truncate pr-2">Source: {queryResult.provenance.source}</span>
              <span className="shrink-0">{queryResult.provenance.updatedAt}</span>
            </div>
          )}

          {/* Contextual Follow-up Questions */}
          {queryResult.suggestedQuestions && queryResult.suggestedQuestions.length > 0 && (
            <div className="pt-2 space-y-1">
              <span className="text-[11px] text-zinc-400 block">Related:</span>
              <div className="flex flex-col gap-1">
                {queryResult.suggestedQuestions.map((sq, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleRunQuery(sq)}
                    className="text-xs text-left text-[#9A7326] hover:text-[#7A5B1C] hover:underline transition-colors cursor-pointer"
                  >
                    {sq}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

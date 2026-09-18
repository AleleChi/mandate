import React, { useState } from 'react';
import {
  Send,
  RefreshCw
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

interface GroundedQueryResult {
  answer: string;
  grounded: boolean;
  intent: string;
  data?: any;
  suggestedQuestions?: string[];
}

export interface OperationsAssistantPanelProps {
  onNavigateTab?: (tab: string) => void;
  onNavigateRoute?: (route: string) => void;
  className?: string;
}

export const OperationsAssistantPanel: React.FC<OperationsAssistantPanelProps> = ({
  onNavigateTab,
  onNavigateRoute,
  className = ''
}) => {
  const [queryInput, setQueryInput] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<GroundedQueryResult | null>(null);

  const SUGGESTED_QUERIES = [
    'Which locations need volunteers?',
    'How many children are selected?',
    'Is registration still open?',
    'How many volunteers are on duty?'
  ];

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

  return (
    <div
      className={`bg-white border border-[#EAE8E1] rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4 text-left ${className}`}
      data-component-version="admin-operations-assistant-compact-v2"
    >
      {/* Header */}
      <div className="border-b border-[#EAE8E1]/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#C59B27]" />
          <h3 className="text-[11px] font-mono font-bold tracking-widest text-zinc-500 uppercase">
            OPERATIONS ASSISTANT
          </h3>
        </div>
        <p className="text-sm font-serif font-semibold text-zinc-900 mt-1">
          Ask about the current event
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
          placeholder="Ask about the current event..."
          className="w-full pl-3.5 pr-20 py-2.5 text-xs rounded-xl border border-[#EAE8E1] bg-[#FAF9F6]/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C59B27]/20 focus:border-[#C59B27] transition-all font-sans text-zinc-900 placeholder:text-zinc-400"
        />
        <button
          type="submit"
          disabled={queryLoading || !queryInput.trim()}
          className="absolute right-1.5 px-3 py-1.5 bg-[#18181B] hover:bg-zinc-800 disabled:opacity-40 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          {queryLoading ? (
            <RefreshCw className="w-3 h-3 animate-spin text-[#C59B27]" />
          ) : (
            <Send className="w-3 h-3 text-[#C59B27]" />
          )}
          <span>Ask</span>
        </button>
      </form>

      {/* Suggested Questions */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block">
          Suggested questions:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_QUERIES.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleRunQuery(q)}
              className="text-[11px] px-2.5 py-1 bg-[#FAF9F6] hover:bg-zinc-100 text-zinc-700 border border-[#EAE8E1]/80 rounded-lg transition-colors cursor-pointer text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Grounded Query Answer Box */}
      {queryResult && (
        <div className="p-4 bg-[#FAF9F6] rounded-xl border border-[#EAE8E1] space-y-2.5 animate-fade-in text-left">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#9A7326] font-bold block">
              Operations Answer
            </span>
            <span
              className={`text-[9px] font-mono px-2 py-0.5 rounded shrink-0 border ${
                queryResult.grounded
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200'
              }`}
            >
              {queryResult.grounded ? 'Grounded in event data' : 'Notice'}
            </span>
          </div>

          <p className="text-xs text-zinc-800 font-medium leading-relaxed">
            {queryResult.answer}
          </p>

          {queryResult.suggestedQuestions && queryResult.suggestedQuestions.length > 0 && (
            <div className="pt-2 border-t border-[#EAE8E1] space-y-1">
              <span className="text-[10px] text-zinc-400 block">Follow-up questions:</span>
              <div className="flex flex-wrap gap-1.5">
                {queryResult.suggestedQuestions.map((sq, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleRunQuery(sq)}
                    className="text-[11px] text-[#9A7326] hover:text-[#7A5B1C] hover:underline transition-colors cursor-pointer text-left"
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

import React, { useState } from 'react';
import {
  Send,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { api } from '../../services/api';
import { OperationsAssistantModal } from './OperationsAssistantModal';

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
  actionPreview?: ActionPreview;
}

export interface ActionRecipient {
  id: string;
  name: string;
  locationName?: string;
  responsibility?: string;
  channel: 'whatsapp' | 'sms' | 'email' | 'push' | 'none';
  eligible: boolean;
  ineligibilityReason?: string;
  phone?: string;
  email?: string;
  preferredChannel?: string;
}

export interface ActionPreviewItem {
  label: string;
  value: string | number;
  secondary?: string;
  meta?: string;
}

export interface ActionPreview {
  actionKey: string;
  title: string;
  description: string;
  affectedCount: number;
  totalTargetsCount?: number;
  unavailableCount?: number;
  recipients?: ActionRecipient[];
  items?: ActionPreviewItem[];
  warnings?: string[];
  confirmLabel: string;
  cancelLabel: string;
  confirmationToken: string;
  expiresAt: string;
}

export interface ActionExecutionResult {
  success: boolean;
  actionKey: string;
  title: string;
  message: string;
  affectedCount: number;
  channelBreakdown?: Record<string, number>;
  deepLink?: DeepLinkItem;
  updatedAt: string;
  error?: string;
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
    'Remind volunteers who haven\'t reported.',
    'Which duty locations need more people?',
    'Alert Admin about understaffed locations.'
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
    'Regenerate the attendance report.',
    'Give me an event summary.',
    'What reports were generated today?'
  ]
};

export const OperationsAssistantPanel: React.FC<OperationsAssistantPanelProps> = ({
  onNavigateTab,
  onNavigateRoute,
  className = ''
}) => {
  const [queryInput, setQueryInput] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState<string | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<GroundedQueryResult | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Children');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<ActionExecutionResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const categories = Object.keys(CATEGORIZED_SUGGESTIONS);
  const currentSuggestions = CATEGORIZED_SUGGESTIONS[selectedCategory] || CATEGORIZED_SUGGESTIONS['Children'];

  const handleRunQuery = async (questionText: string, keepModalOpen = false) => {
    const q = questionText.trim();
    if (!q) return;

    setSubmittedQuestion(q);
    setQueryLoading(true);
    setQueryError(null);
    setActionResult(null);
    setActionError(null);
    if (!keepModalOpen) {
      setIsModalOpen(false);
    }

    try {
      const res = await api.admin.queryOperationsAssistant(q);
      if (res.success && res.result) {
        setQueryResult(res.result);
        setIsModalOpen(true);
      } else {
        setQueryResult(null);
        setQueryError(res.error || "We couldn't get that information right now. Please try again.");
        setIsModalOpen(false);
      }
    } catch (err: any) {
      console.error('Operational query error:', err);
      setQueryResult(null);
      setQueryError("We couldn't get that information right now. Please try again.");
      setIsModalOpen(false);
    } finally {
      setQueryLoading(false);
    }
  };

  const handleConfirmAction = async (token: string) => {
    if (!token || actionLoading) return;
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await api.admin.confirmOperationsAssistantAction(token);
      if (res.success && res.result) {
        setActionResult(res.result);
        // Clear preview once successfully confirmed; modal remains open showing result
        setQueryResult(prev => prev ? { ...prev, actionPreview: undefined } : null);
        // Refresh relevant duty/readiness data
        window.dispatchEvent(new CustomEvent('sse-ops-refresh', { detail: { type: 'duty.status_updated' } }));
      } else {
        setActionError(res.error || "We couldn't send the reminders. Please try again.");
      }
    } catch (err: any) {
      console.error('Action confirmation error:', err);
      setActionError("We couldn't send the reminders. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelAction = () => {
    // Immediately close modal, clear pending action UI and confirmation token without mutation, leaving previous answer visible
    setIsModalOpen(false);
    setQueryResult(prev => prev ? { ...prev, actionPreview: undefined } : null);
    setActionError(null);
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
      data-component-version="admin-operations-assistant-hierarchy-v1"
    >
      {/* Editorial Header */}
      <div className="space-y-0.5 pb-1">
        <h3 className="font-serif text-base font-semibold text-zinc-900">
          Operations Assistant
        </h3>
        <p className="text-xs text-zinc-500">
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

      {/* Suggested Questions: Prompts, not answers */}
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

        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
            {selectedCategory}
          </span>
          <div className="flex flex-col gap-1">
            {currentSuggestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQueryInput(q);
                  handleRunQuery(q);
                }}
                className="text-xs text-left text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer py-1 flex items-center justify-between group"
              >
                <span className="group-hover:underline underline-offset-2">{q}</span>
                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-[#C59B27] transition-opacity shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Query Loading State (Compact Inline) */}
      {queryLoading && !isModalOpen && (
        <div className="py-3 flex items-center gap-2 text-xs text-zinc-500 border-t border-[#EAE8E1]/80 pt-3">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C59B27]" />
          <span>Analyzing current operational data...</span>
        </div>
      )}

      {/* Query Error State (Compact Inline) */}
      {queryError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
          {queryError}
        </div>
      )}

      {/* Compact Last Answer Summary (Inside Panel) */}
      {submittedQuestion && !queryLoading && (queryResult || actionResult) && (
        <div className="pt-3 border-t border-[#EAE8E1]/80 space-y-2.5 text-left">
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
              YOUR QUESTION
            </span>
            <p className="text-xs font-medium text-zinc-800 leading-snug">
              {submittedQuestion}
            </p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9A7326] block">
              LAST ANSWER
            </span>
            <p className="text-xs text-zinc-700 leading-relaxed line-clamp-2">
              {actionResult ? `${actionResult.title} — ${actionResult.message}` : queryResult?.answer}
            </p>
          </div>

          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="text-xs inline-flex items-center gap-1.5 font-semibold text-[#9A7326] hover:text-[#7A5B1C] transition-colors cursor-pointer group"
            >
              <span>
                {queryResult?.breakdown
                  ? 'View full summary'
                  : (queryResult?.actionPreview ? 'Review action' : 'View full answer')}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[#C59B27] group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      )}

      {/* Universal Operations Assistant Response Modal */}
      <OperationsAssistantModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        question={submittedQuestion}
        queryResult={queryResult}
        queryLoading={queryLoading}
        actionLoading={actionLoading}
        actionResult={actionResult}
        actionError={actionError}
        onConfirmAction={handleConfirmAction}
        onCancelAction={handleCancelAction}
        onDeepLinkClick={handleDeepLinkClick}
        onSelectRelatedQuestion={(sq) => {
          setQueryInput(sq);
          handleRunQuery(sq, true);
        }}
      />
    </div>
  );
};

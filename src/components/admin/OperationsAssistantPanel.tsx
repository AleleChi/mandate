import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  Send,
  CheckCircle2,
  Calendar,
  Users,
  ShieldCheck,
  ShieldAlert,
  Clock,
  MapPin,
  Ticket,
  LifeBuoy
} from 'lucide-react';
import { api } from '../../services/api';

interface AttentionItem {
  id: string;
  title: string;
  explanation: string;
  severity: 'info' | 'attention' | 'urgent';
  count?: number;
  actionLabel: string;
  actionRoute: string;
  actionTab: string;
}

interface EventReadinessReport {
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

interface OperationsAssistantPanelProps {
  onNavigateTab: (tab: string) => void;
  onNavigateRoute?: (route: string) => void;
}

export const OperationsAssistantPanel: React.FC<OperationsAssistantPanelProps> = ({
  onNavigateTab,
  onNavigateRoute
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<EventReadinessReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ask Operations state
  const [queryInput, setQueryInput] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<GroundedQueryResult | null>(null);

  const fetchReadiness = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await api.admin.getOperationsAssistantReadiness();
      if (res.success && res.report) {
        setReport(res.report);
      } else {
        setError('Failed to load operations assistant data.');
      }
    } catch (err: any) {
      console.error('Error loading operations assistant:', err);
      setError(err?.message || 'Error communicating with operations service.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReadiness();
  }, []);

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

  const handleActionClick = (item: AttentionItem) => {
    if (item.actionTab) {
      onNavigateTab(item.actionTab);
    } else if (item.actionRoute && onNavigateRoute) {
      onNavigateRoute(item.actionRoute);
    }
  };

  const formatUpdateTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const SUGGESTED_QUERIES = [
    'How many children are selected?',
    'Which age group is closest to capacity?',
    'How many volunteers are currently on duty?',
    'Which locations need more volunteers?',
    'How many selected children do not have passes?',
    'What changed today?',
    'Is registration still open?'
  ];

  if (loading && !report) {
    return (
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 sm:p-8 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-4">
          <div className="space-y-1">
            <h3 className="text-xs font-mono font-semibold tracking-wider text-stone-500 uppercase">
              OPERATIONS ASSISTANT
            </h3>
            <p className="text-sm font-serif-koinonia text-stone-800">Evaluating event readiness...</p>
          </div>
        </div>
        <div className="py-8 text-center text-xs text-stone-400 font-sans">
          Loading live operational metrics for current event...
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4 shadow-xs text-left">
        <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-4">
          <h3 className="text-xs font-mono font-semibold tracking-wider text-stone-500 uppercase">
            OPERATIONS ASSISTANT
          </h3>
          <button
            onClick={() => fetchReadiness(true)}
            className="text-xs text-stone-600 hover:text-stone-900 flex items-center gap-1.5 font-medium cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
          {error}
        </div>
      </div>
    );
  }

  const metrics = report?.metrics;
  const readiness = report?.readinessStatus || 'NOT READY';
  const reasons = report?.readinessReasons || [];
  const needsAttention = report?.needsAttention || [];

  return (
    <div
      className="bg-white border border-[#EAE8E1] rounded-2xl p-6 sm:p-8 space-y-8 shadow-xs text-left"
      data-component-version="admin-operations-assistant-v1"
    >
      {/* 1. Header with Title & Updated Time */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#C59B27]" />
            <h2 className="text-xs font-mono font-bold tracking-widest text-[#9A7326] uppercase">
              OPERATIONS ASSISTANT
            </h2>
          </div>
          <p className="text-base sm:text-lg font-serif-koinonia font-semibold text-stone-900">
            {report?.event?.title ? `Event Readiness: ${report.event.title}` : 'Current Event Operations'}
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center">
          {report?.lastUpdated && (
            <span className="text-xs text-stone-400 font-sans">
              Updated {formatUpdateTime(report.lastUpdated)}
            </span>
          )}
          <button
            type="button"
            onClick={() => fetchReadiness(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#EAE8E1] bg-white hover:bg-stone-50 text-stone-700 rounded-xl text-xs font-medium transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            title="Refresh operational metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#C59B27]' : 'text-stone-500'}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Event Readiness Status Banner */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          readiness === 'READY'
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            : readiness === 'NEEDS ATTENTION'
            ? 'bg-amber-50/70 border-amber-200 text-amber-950'
            : 'bg-rose-50/70 border-rose-200 text-rose-950'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border font-mono ${
                  readiness === 'READY'
                    ? 'bg-emerald-100/90 text-emerald-800 border-emerald-300'
                    : readiness === 'NEEDS ATTENTION'
                    ? 'bg-amber-100/90 text-amber-900 border-amber-300'
                    : 'bg-rose-100/90 text-rose-900 border-rose-300'
                }`}
              >
                {readiness}
              </span>
              <span className="text-sm font-semibold">
                {readiness === 'READY'
                  ? 'All core operational requirements are fulfilled.'
                  : readiness === 'NEEDS ATTENTION'
                  ? `${reasons.length} operational item${reasons.length === 1 ? '' : 's'} should be resolved before the event:`
                  : 'Critical operational blockers must be resolved before proceeding:'}
              </span>
            </div>

            {reasons.length > 0 && (
              <ul className="mt-2 space-y-1 pl-1 text-xs text-stone-700 leading-relaxed font-sans">
                {reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-stone-400 mt-0.5">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 3. Event Readiness Live Metrics */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-1 border-b border-stone-100">
          <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider font-sans">
            Event Readiness Metrics
          </h3>
          {metrics?.registrationClosingDate && (
            <span className="text-[11px] text-stone-500 font-sans flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#C59B27]" />
              Closes {new Date(metrics.registrationClosingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Registrations */}
          <div className="p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Registrations
            </span>
            <span className="text-xl font-serif text-stone-900 font-bold block mt-1">
              {metrics?.registrations ?? 0}
            </span>
            <span className="text-[10px] text-stone-500 block mt-0.5">children recorded</span>
          </div>

          {/* Selected Children */}
          <div className="p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Selected Children
            </span>
            <span className="text-xl font-serif text-[#C59B27] font-bold block mt-1">
              {metrics?.selectedChildren ?? 0}
            </span>
            <span className="text-[10px] text-stone-500 block mt-0.5">approved for event</span>
          </div>

          {/* Child Capacity & Places Remaining */}
          <div className="p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Event Capacity
            </span>
            <span className="text-xl font-serif text-stone-900 font-bold block mt-1">
              {metrics?.eventChildCapacity !== null ? metrics?.eventChildCapacity : '—'}
            </span>
            <span className="text-[10px] text-stone-500 block mt-0.5">
              {metrics?.placesRemaining !== null ? `${metrics?.placesRemaining} places left` : 'Capacity unconfigured'}
            </span>
          </div>

          {/* Checked In / Attendance */}
          <div className="p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Checked In
            </span>
            <span className="text-xl font-serif text-stone-900 font-bold block mt-1">
              {metrics?.checkedIn ?? 0}
            </span>
            <span className="text-[10px] text-stone-500 block mt-0.5">
              {metrics?.pickedUp ? `${metrics.pickedUp} released` : 'present on site'}
            </span>
          </div>

          {/* Approved Volunteers */}
          <div className="p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Approved Volunteers
            </span>
            <span className="text-xl font-serif text-stone-900 font-bold block mt-1">
              {metrics?.approvedVolunteers ?? 0}
            </span>
            <span className="text-[10px] text-stone-500 block mt-0.5">vetted volunteer pool</span>
          </div>

          {/* Volunteers Assigned & On Duty */}
          <div className="p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Duty Responders
            </span>
            <span className="text-xl font-serif text-stone-900 font-bold block mt-1">
              {metrics?.volunteersOnDuty ?? 0}
              <span className="text-xs text-stone-400 font-normal font-sans ml-1">
                / {metrics?.volunteersAssigned ?? 0} assigned
              </span>
            </span>
            <span className="text-[10px] text-stone-500 block mt-0.5">currently on duty</span>
          </div>

          {/* Duty Locations & Understaffed */}
          <div className="p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Duty Locations
            </span>
            <span className="text-xl font-serif text-stone-900 font-bold block mt-1">
              {metrics?.dutyLocations ?? 0}
            </span>
            <span className={`text-[10px] block mt-0.5 ${metrics && metrics.locationsBelowTarget > 0 ? 'text-amber-700 font-medium' : 'text-stone-500'}`}>
              {metrics && metrics.locationsBelowTarget > 0
                ? `${metrics.locationsBelowTarget} below staffing target`
                : 'All locations covered'}
            </span>
          </div>

          {/* Passes Pending */}
          <div className="p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Passes Needing Issuance
            </span>
            <span className={`text-xl font-serif font-bold block mt-1 ${metrics && metrics.selectedChildrenWithoutPasses > 0 ? 'text-amber-600' : 'text-stone-900'}`}>
              {metrics?.selectedChildrenWithoutPasses ?? 0}
            </span>
            <span className="text-[10px] text-stone-500 block mt-0.5">selected without pass</span>
          </div>

          {/* Open Safety Notices */}
          <div className="p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Open Safety Notices
            </span>
            <span className={`text-xl font-serif font-bold block mt-1 ${metrics && metrics.openSafetyNotices > 0 ? 'text-rose-600' : 'text-stone-900'}`}>
              {metrics?.openSafetyNotices ?? 0}
            </span>
            <span className="text-[10px] text-stone-500 block mt-0.5">active alerts & incidents</span>
          </div>

          {/* Unresolved Escalations */}
          <div className="p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Active Escalations
            </span>
            <span className={`text-xl font-serif font-bold block mt-1 ${metrics && metrics.unresolvedEscalations > 0 ? 'text-rose-600' : 'text-stone-900'}`}>
              {metrics?.unresolvedEscalations ?? 0}
            </span>
            <span className="text-[10px] text-stone-500 block mt-0.5">guardian notification cycles</span>
          </div>
        </div>
      </div>

      {/* 4. Needs Attention Items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-1 border-b border-stone-100">
          <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider font-sans">
            Needs Attention ({needsAttention.length})
          </h3>
          <span className="text-[11px] text-stone-400 font-sans">Deterministic event rules</span>
        </div>

        {needsAttention.length === 0 ? (
          <div className="p-5 bg-stone-50/60 rounded-xl border border-stone-200/50 text-center text-xs text-stone-500 font-sans">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 inline-block mr-1.5 -mt-0.5" />
            All current event operational criteria meet readiness standards.
          </div>
        ) : (
          <div className="space-y-2.5">
            {needsAttention.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-stone-200/70 bg-white hover:border-stone-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        item.severity === 'urgent'
                          ? 'bg-rose-100 text-rose-800'
                          : item.severity === 'attention'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      {item.severity}
                    </span>
                    <h4 className="text-xs font-semibold text-stone-900">{item.title}</h4>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed pl-0.5">{item.explanation}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleActionClick(item)}
                  className="self-start sm:self-center shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[#9A7326] hover:text-[#805e1a] px-3 py-1.5 bg-[#FAF6EB] hover:bg-[#F5F0DC] rounded-lg transition-colors cursor-pointer"
                >
                  <span>{item.actionLabel}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Ask Operations (Grounded Query Interface) */}
      <div className="space-y-4 pt-2 border-t border-stone-100">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wider font-sans">
            Ask Operations
          </h3>
          <p className="text-xs text-stone-500 font-sans">
            Query live event data in natural language. Answers are grounded in real database records.
          </p>
        </div>

        {/* Query Input Box */}
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
            placeholder="Ask about the current event (e.g. How many children are selected?)..."
            className="w-full pl-4 pr-24 py-3 text-xs rounded-xl border border-[#EAE8E1] bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C59B27]/15 focus:border-[#C59B27] transition-all font-sans text-stone-900"
          />
          <button
            type="submit"
            disabled={queryLoading || !queryInput.trim()}
            className="absolute right-2 px-3 py-1.5 bg-[#18181B] hover:bg-stone-800 disabled:opacity-40 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {queryLoading ? (
              <RefreshCw className="w-3 h-3 animate-spin text-[#C59B27]" />
            ) : (
              <Send className="w-3 h-3 text-[#C59B27]" />
            )}
            <span>Ask</span>
          </button>
        </form>

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {SUGGESTED_QUERIES.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleRunQuery(q)}
              className="text-[11px] px-2.5 py-1 bg-stone-100/70 hover:bg-stone-200/70 text-stone-700 rounded-lg transition-colors cursor-pointer text-left"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Grounded Query Answer Box */}
        {queryResult && (
          <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/80 space-y-3 animate-fade-in text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#9A7326] font-bold block">
                  Operations Answer
                </span>
                <p className="text-xs text-stone-900 font-medium leading-relaxed">
                  {queryResult.answer}
                </p>
              </div>
              <span
                className={`text-[9px] font-mono px-2 py-0.5 rounded shrink-0 ${
                  queryResult.grounded
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-stone-200 text-stone-600'
                }`}
              >
                {queryResult.grounded ? 'Grounded' : 'Notice'}
              </span>
            </div>

            {queryResult.suggestedQuestions && queryResult.suggestedQuestions.length > 0 && (
              <div className="pt-2 border-t border-stone-200/60 space-y-1.5">
                <span className="text-[10px] text-stone-400 block font-sans">Suggested follow-ups:</span>
                <div className="flex flex-wrap gap-1.5">
                  {queryResult.suggestedQuestions.map((sq, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleRunQuery(sq)}
                      className="text-[11px] text-stone-600 hover:text-stone-950 underline underline-offset-2 transition-colors cursor-pointer text-left"
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
    </div>
  );
};

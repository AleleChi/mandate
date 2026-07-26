import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  AlertCircle, 
  Users, 
  Activity, 
  Search, 
  Filter, 
  Smartphone, 
  SlidersHorizontal, 
  UserPlus, 
  X
} from 'lucide-react';
import { safeStorage } from '../../../utils/storage';
import ResponseCoverageRow, { CoverageCategory, Responder } from './ResponseCoverageRow';
import ResponseCoverageCard from './ResponseCoverageCard';

const REAL_EVENT_ID = 'event-ga-2026';

type DutyTabType = 'devices_readiness' | 'event_team' | 'alert_routing' | 'response_coverage' | 'event_locations';

interface ResponseCoverageTabProps {
  onNavigateTab?: (tab: DutyTabType) => void;
}

interface CoverageSummary {
  activeResponders: number;
  coverageGaps: number;
  averageRespondersPerAlert: number | null;
  routingIssues: number;
  validCategoriesCount?: number;
}

export default function ResponseCoverageTab({ onNavigateTab }: ResponseCoverageTabProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [summary, setSummary] = useState<CoverageSummary>({
    activeResponders: 0,
    coverageGaps: 0,
    averageRespondersPerAlert: 0.0,
    routingIssues: 0,
    validCategoriesCount: 0
  });

  const [categories, setCategories] = useState<CoverageCategory[]>([]);
  const [limitations, setLimitations] = useState<string[]>([]);

  // Expanded row ID
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Search & Filters state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const fetchCoverageReport = async (isUserRefresh = false) => {
    if (isUserRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      let res = await fetch(`/api/admin/duty/events/${REAL_EVENT_ID}/response-coverage`, { headers });
      if (!res.ok && res.status === 404) {
        res = await fetch(`/api/admin/events/${REAL_EVENT_ID}/response-coverage`, { headers });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success !== false) {
          const rawSummary = data.summary || {};
          setSummary({
            activeResponders: rawSummary.activeResponders ?? 0,
            coverageGaps: rawSummary.coverageGaps ?? 0,
            averageRespondersPerAlert: (typeof rawSummary.averageRespondersPerAlert === 'number' && !isNaN(rawSummary.averageRespondersPerAlert))
              ? rawSummary.averageRespondersPerAlert
              : null,
            routingIssues: rawSummary.routingIssues ?? 0,
            validCategoriesCount: rawSummary.validCategoriesCount ?? 0
          });
          setCategories(data.categories || []);
          setLimitations(data.limitations || []);

          if (isUserRefresh) {
            setToastMessage('Coverage updated successfully.');
            setTimeout(() => setToastMessage(null), 3500);
          }
        } else {
          setError(data.message || data.error || 'Failed to fetch alert response coverage.');
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          setError('Permission Denied: Administrator access required to view response coverage.');
        } else {
          setError('We could not load response coverage. Please check your network connection.');
        }
      }
    } catch (err) {
      console.error('Failed fetching coverage report:', err);
      setError('An error occurred while loading alert coverage data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCoverageReport();
  }, []);

  // Filtered categories
  const filteredCategories = categories.filter((cat) => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const matchesName = cat.name.toLowerCase().includes(q);
      const matchesKey = cat.categoryKey.toLowerCase().includes(q);
      const matchesRoles = cat.expectedRoles.some(r => r.toLowerCase().includes(q));
      const matchesPrimary = cat.primaryResponders.some(r => r.name.toLowerCase().includes(q) || r.responsibility.toLowerCase().includes(q));
      const matchesBackup = cat.backupResponders.some(r => r.name.toLowerCase().includes(q) || r.responsibility.toLowerCase().includes(q));
      const matchesAction = cat.recommendedAction.toLowerCase().includes(q);
      if (!matchesName && !matchesKey && !matchesRoles && !matchesPrimary && !matchesBackup && !matchesAction) {
        return false;
      }
    }

    if (statusFilter !== 'all' && cat.coverageStatus !== statusFilter) {
      return false;
    }

    if (severityFilter !== 'all' && cat.severity !== severityFilter) {
      return false;
    }

    return true;
  });

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setSeverityFilter('all');
  };

  const formattedAverage = (summary?.averageRespondersPerAlert !== null && summary?.averageRespondersPerAlert !== undefined && typeof summary.averageRespondersPerAlert === 'number' && !isNaN(summary.averageRespondersPerAlert))
    ? summary.averageRespondersPerAlert.toFixed(1)
    : '—';

  return (
    <div className="space-y-6 animate-fade-in" data-view-version="admin-response-coverage-v3">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl flex items-center justify-between text-xs font-semibold animate-fade-in shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button 
            onClick={() => setToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200/80 pb-4">
        <div>
          <h2 className="text-xl font-serif font-bold text-stone-900 tracking-tight">Alert Response Coverage</h2>
          <p className="text-xs text-stone-500 mt-0.5">Ensure every alert category has assigned primary and backup responders for active event operations.</p>
        </div>
        <button
          onClick={() => fetchCoverageReport(true)}
          disabled={loading || refreshing}
          className="flex items-center space-x-2 px-4 py-2.5 bg-white hover:bg-stone-50 border border-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0 min-h-[40px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${(loading || refreshing) ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Refreshing…' : 'Refresh coverage'}</span>
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-6 bg-rose-50 border border-rose-200 text-rose-950 rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
          <XCircle className="w-8 h-8 text-rose-600" />
          <div>
            <h3 className="font-bold text-sm text-rose-900">Coverage Assessment Error</h3>
            <p className="text-xs text-rose-700 mt-1 max-w-md">{error}</p>
          </div>
          <button
            onClick={() => fetchCoverageReport(false)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
          >
            Try again
          </button>
        </div>
      )}

      {/* Data Quality Warnings Panel */}
      {!error && limitations.length > 0 && (
        <div className="p-4 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex items-start space-x-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block">Coverage Data Quality Warning</span>
            <ul className="list-disc list-inside space-y-0.5 text-amber-800">
              {limitations.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && !refreshing ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-stone-200 p-5 rounded-2xl space-y-3 shadow-2xs animate-pulse">
                <div className="h-3 w-24 bg-stone-200 rounded" />
                <div className="h-8 w-16 bg-stone-200 rounded" />
                <div className="h-2.5 w-32 bg-stone-100 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#C59B27]" />
            <span className="text-xs font-semibold text-stone-500 block">Evaluating active responder coverage…</span>
          </div>
        </div>
      ) : !error && (
        <div className="space-y-6">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Active Responders */}
            <div className="bg-white border border-stone-200/80 p-5 rounded-2xl space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider">Active Responders</span>
                <Users className="w-4 h-4 text-stone-400" />
              </div>
              <div className={`text-2xl font-bold font-mono tracking-tight ${summary.activeResponders > 0 ? 'text-stone-900' : 'text-stone-400'}`}>
                {summary.activeResponders}
              </div>
              <p className="text-[10px] font-medium text-stone-500">Available across alert response roles</p>
            </div>

            {/* Card 2: Coverage Gaps */}
            <div className="bg-white border border-stone-200/80 p-5 rounded-2xl space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider">Coverage Gaps</span>
                <AlertTriangle className={`w-4 h-4 ${summary.coverageGaps > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
              </div>
              <div className={`text-2xl font-bold font-mono tracking-tight ${summary.coverageGaps > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {summary.coverageGaps}
              </div>
              <p className="text-[10px] font-medium text-stone-500">Alert types requiring attention</p>
            </div>

            {/* Card 3: Average Responders per Alert */}
            <div className="bg-white border border-stone-200/80 p-5 rounded-2xl space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider">Avg Responders / Alert</span>
                <Activity className="w-4 h-4 text-stone-400" />
              </div>
              <div className="text-2xl font-bold text-stone-900 font-mono tracking-tight">
                {formattedAverage}
              </div>
              <p className="text-[10px] font-medium text-stone-500">
                {(summary.validCategoriesCount ?? 0) === 0 ? 'No routing rules available' : 'Average responders per category'}
              </p>
            </div>

            {/* Card 4: Routing Issues */}
            <div className="bg-white border border-stone-200/80 p-5 rounded-2xl space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider">Routing Issues</span>
                <AlertCircle className={`w-4 h-4 ${summary.routingIssues > 0 ? 'text-amber-500' : 'text-stone-400'}`} />
              </div>
              <div className={`text-2xl font-bold font-mono tracking-tight ${summary.routingIssues > 0 ? 'text-amber-600' : 'text-stone-700'}`}>
                {summary.routingIssues}
              </div>
              <p className="text-[10px] font-medium text-stone-500">Rules requiring correction</p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white border border-stone-200 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-2xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search alert types, roles, responders, or locations..."
                className="w-full pl-10 pr-8 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C59B27]/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-1 bg-stone-50 border border-stone-200 px-3 py-2 rounded-xl text-xs">
                <Filter className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span className="text-stone-500 font-medium">Coverage:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-transparent font-semibold text-stone-800 focus:outline-none cursor-pointer"
                >
                  <option value="all">All statuses</option>
                  <option value="Complete">Complete</option>
                  <option value="Limited">Limited</option>
                  <option value="No coverage">No coverage</option>
                  <option value="Routing issue">Routing issue</option>
                </select>
              </div>

              <div className="flex items-center space-x-1 bg-stone-50 border border-stone-200 px-3 py-2 rounded-xl text-xs">
                <span className="text-stone-500 font-medium">Severity:</span>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-transparent font-semibold text-stone-800 focus:outline-none cursor-pointer"
                >
                  <option value="all">All severities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              {(searchQuery || statusFilter !== 'all' || severityFilter !== 'all') && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 text-xs font-semibold text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-all cursor-pointer"
                >
                  Clear filters
                </button>
              )}

              <span className="text-xs font-mono font-bold text-stone-400 pl-2 border-l border-stone-200">
                {filteredCategories.length} {filteredCategories.length === 1 ? 'alert type' : 'alert types'}
              </span>
            </div>
          </div>

          {/* Categories List / Table */}
          {filteredCategories.length === 0 ? (
            <div className="p-12 text-center text-xs text-stone-500 bg-white border border-stone-200 rounded-2xl space-y-3 shadow-2xs">
              <ShieldCheck className="w-8 h-8 mx-auto text-stone-300" />
              <div>
                <span className="font-bold text-stone-700 block text-sm mb-1">No alert types match the selected filters</span>
                <p className="text-stone-500">Try adjusting your search query or clear active filters to view all categories.</p>
              </div>
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-white hover:bg-stone-50 border border-stone-200 text-xs font-bold text-stone-800 rounded-xl transition-all cursor-pointer shadow-2xs"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* DESKTOP 6-COLUMN TABLE VIEW (lg breakpoint and above) */}
              <div className="hidden lg:block bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="sticky top-0 z-10 bg-stone-50/90 backdrop-blur-xs border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase tracking-wider font-medium">
                        <th className="p-4 w-60 min-w-[220px]">Alert type</th>
                        <th className="p-4 w-52 min-w-[180px]">Expected roles</th>
                        <th className="p-4 min-w-[340px]">Response team</th>
                        <th className="p-4 w-40 min-w-[140px]">Device readiness</th>
                        <th className="p-4 w-36 min-w-[130px]">Coverage</th>
                        <th className="p-4 w-56 min-w-[200px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                      {filteredCategories.map((item) => {
                        const rowKey = item.id || item.categoryKey;
                        return (
                          <ResponseCoverageRow
                            key={rowKey}
                            item={item}
                            onNavigateTab={onNavigateTab}
                            isExpanded={expandedRowId === rowKey}
                            onToggleExpand={() => {
                              setExpandedRowId(expandedRowId === rowKey ? null : rowKey);
                            }}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TABLET / MOBILE CARD VIEW (below lg breakpoint) */}
              <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCategories.map((item) => (
                  <ResponseCoverageCard
                    key={item.id || item.categoryKey}
                    item={item}
                    onNavigateTab={onNavigateTab}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

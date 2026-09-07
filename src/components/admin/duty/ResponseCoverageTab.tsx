import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Users, 
  Search, 
  Plus, 
  X,
  MapPin
} from 'lucide-react';
import { safeStorage } from '../../../utils/storage';
import { buildApiUrl } from '../../../utils/urlHelper';
import { CoverageCategory, Responder, formatRoleName } from './ResponseCoverageRow';

type DutyTabType = 'devices_readiness' | 'event_team' | 'alert_routing' | 'response_coverage' | 'event_locations';

interface ResponseCoverageTabProps {
  eventId?: string;
  onNavigateTab?: (tab: DutyTabType) => void;
}

function getInitials(name?: string): string {
  if (!name) return 'TM';
  const clean = name.replace(/[^a-zA-Z\s]/g, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'TM';
}

function getHumanCoverageStatus(cat: CoverageCategory): {
  label: 'Covered' | 'Needs one more person' | 'Not covered';
  textClass: string;
  dotClass: string;
} {
  const totalAssigned = cat.primaryResponders.length + cat.backupResponders.length;
  if (cat.primaryResponders.length > 0 && cat.backupResponders.length > 0) {
    return { label: 'Covered', textClass: 'text-emerald-700', dotClass: 'bg-emerald-500' };
  }
  if (totalAssigned >= 1) {
    return { label: 'Needs one more person', textClass: 'text-amber-700', dotClass: 'bg-amber-500' };
  }
  return { label: 'Not covered', textClass: 'text-rose-600', dotClass: 'bg-rose-500' };
}

export default function ResponseCoverageTab({
  eventId = 'event-ga-2026',
  onNavigateTab
}: ResponseCoverageTabProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [categories, setCategories] = useState<CoverageCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

      let res = await fetch(buildApiUrl(`/api/admin/duty/events/${eventId}/response-coverage`), { headers });
      if (!res.ok && res.status === 404) {
        res = await fetch(buildApiUrl(`/api/admin/events/${eventId}/response-coverage`), { headers });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success !== false) {
          setCategories(data.categories || []);
          if (isUserRefresh) {
            setToastMessage('Coverage updated.');
            setTimeout(() => setToastMessage(null), 3000);
          }
        } else {
          setError(data.message || data.error || 'We couldn’t load the coverage data. Try again');
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          setError('Permission Denied: Administrator access required.');
        } else {
          setError('We couldn’t load the coverage data. Try again');
        }
      }
    } catch (err) {
      console.error('Failed fetching coverage report:', err);
      setError('We couldn’t load the coverage data. Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCoverageReport();
  }, [eventId]);

  // Compute restrained summary numbers
  const totalAreas = categories.length;
  const coveredAreas = categories.filter(
    (c) => getHumanCoverageStatus(c).label === 'Covered'
  ).length;
  const needSupport = totalAreas - coveredAreas;

  const filteredCategories = categories.filter((cat) => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const matchesName = cat.name.toLowerCase().includes(q);
      const matchesKey = cat.categoryKey.toLowerCase().includes(q);
      const matchesRoles = cat.expectedRoles.some((r) => r.toLowerCase().includes(q));
      const matchesPrimary = cat.primaryResponders.some(
        (r) => r.name.toLowerCase().includes(q) || r.responsibility.toLowerCase().includes(q)
      );
      if (!matchesName && !matchesKey && !matchesRoles && !matchesPrimary) {
        return false;
      }
    }

    if (statusFilter !== 'all') {
      const statusObj = getHumanCoverageStatus(cat);
      if (statusFilter === 'covered' && statusObj.label !== 'Covered') return false;
      if (statusFilter === 'needs_one' && statusObj.label !== 'Needs one more person') return false;
      if (statusFilter === 'not_covered' && statusObj.label !== 'Not covered') return false;
    }

    return true;
  });

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
  };

  return (
    <div className="space-y-5 animate-fade-in" data-view-version="admin-team-coverage-v5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-xl flex items-center justify-between text-xs font-medium animate-fade-in shadow-2xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button 
            onClick={() => setToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-950 rounded-xl flex items-center justify-between space-x-2 text-xs font-medium animate-fade-in shadow-2xs">
          <div className="flex items-center space-x-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 cursor-pointer p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAE8E1] pb-4">
        <div>
          <h2 className="text-xl font-bold text-[#18181B] tracking-tight">
            Team Coverage
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5 font-normal">
            Check that each event area has the people it needs.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchCoverageReport(true)}
            disabled={loading || refreshing}
            aria-label="Refresh coverage"
            className="flex items-center space-x-2 px-3 py-1.5 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-xs font-medium text-[#18181B] rounded-lg transition-all shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${(loading || refreshing) ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <button
            onClick={() => onNavigateTab?.('event_team')}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#C59B27] hover:bg-[#A8821B] text-white text-xs font-medium rounded-lg transition-all shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Assign team member</span>
          </button>
        </div>
      </div>

      {/* 2. Restrained Summary Row (Prompt Section 29) */}
      {!loading && !error && totalAreas > 0 && (
        <div className="bg-white border border-[#EAE8E1] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center divide-x divide-[#EAE8E1]">
            <div className="pr-6">
              <span className="text-[11px] text-zinc-400 font-medium block">Areas</span>
              <span className="text-lg font-bold text-zinc-900">{totalAreas}</span>
            </div>
            <div className="px-6">
              <span className="text-[11px] text-zinc-400 font-medium block">Covered</span>
              <span className="text-lg font-bold text-emerald-700">{coveredAreas}</span>
            </div>
            <div className="pl-6">
              <span className="text-[11px] text-zinc-400 font-medium block">Need support</span>
              <span className="text-lg font-bold text-amber-700">{needSupport}</span>
            </div>
          </div>

          <div className="text-xs font-medium self-start sm:self-center">
            {needSupport === 0 ? (
              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg inline-flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>All areas are covered.</span>
              </span>
            ) : (
              <span className="text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg inline-flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>
                  {needSupport === 1
                    ? '1 area needs additional team members.'
                    : `${needSupport} areas need additional team members.`}
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. Search and Status Filters */}
      <div className="p-3 bg-white border border-[#EAE8E1] rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shadow-2xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search areas or roles…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-900 placeholder:text-zinc-400 font-normal"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by coverage status"
            className="text-xs px-2.5 py-1.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-700 font-medium cursor-pointer"
          >
            <option value="all">All statuses</option>
            <option value="covered">Covered</option>
            <option value="needs_one">Needs one more person</option>
            <option value="not_covered">Not covered</option>
          </select>
        </div>
      </div>

      {/* 4. Table / List of Areas */}
      {loading && categories.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#C59B27]" />
          <span>Loading team coverage…</span>
        </div>
      ) : error && categories.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-rose-200 rounded-2xl space-y-3 shadow-2xs">
          <AlertTriangle className="w-6 h-6 mx-auto text-rose-500" />
          <div>
            <h3 className="font-semibold text-zinc-800 text-sm">{error}</h3>
            <p className="text-zinc-500 text-xs mt-0.5">Please check your connection or try loading team coverage again.</p>
          </div>
          <div className="pt-1">
            <button
              onClick={() => fetchCoverageReport(false)}
              className="px-3.5 py-1.5 bg-white border border-[#EAE8E1] text-zinc-700 text-xs font-medium rounded-xl hover:bg-zinc-50 cursor-pointer shadow-2xs"
            >
              Try again
            </button>
          </div>
        </div>
      ) : categories.length === 0 ? (
        /* Empty State (Section 30) */
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl space-y-3">
          <MapPin className="w-6 h-6 mx-auto text-zinc-400" />
          <div>
            <h3 className="font-semibold text-zinc-800 text-sm">No event areas have been added yet</h3>
            <p className="text-zinc-500 text-xs mt-0.5">
              Add the locations used during the event before assigning team coverage.
            </p>
          </div>
          <div className="pt-1">
            <button
              onClick={() => onNavigateTab?.('event_locations')}
              className="px-3.5 py-1.5 bg-[#C59B27] text-white text-xs font-medium rounded-xl hover:bg-[#A8821B] cursor-pointer"
            >
              Add location
            </button>
          </div>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl space-y-2">
          <Users className="w-6 h-6 mx-auto text-zinc-400" />
          <h3 className="font-semibold text-zinc-800 text-sm">No matching areas found</h3>
          <p className="text-zinc-500 text-xs">Try changing your filters or search.</p>
          <div className="pt-2">
            <button
              onClick={clearFilters}
              className="px-3.5 py-1.5 bg-white border border-[#EAE8E1] rounded-xl text-zinc-700 text-xs font-medium hover:bg-zinc-50 cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#EAE8E1] rounded-xl overflow-hidden shadow-2xs">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF9F5] border-b border-[#EAE8E1] text-zinc-500 font-medium text-[11px]">
                  <th className="p-3.5 pl-4 font-medium min-w-[200px]">Area</th>
                  <th className="p-3.5 font-medium w-[220px]">Required</th>
                  <th className="p-3.5 font-medium min-w-[220px]">Assigned</th>
                  <th className="p-3.5 font-medium w-[170px]">Status</th>
                  <th className="p-3.5 pr-4 font-medium text-right w-[140px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {filteredCategories.map((cat) => {
                  const statusInfo = getHumanCoverageStatus(cat);
                  const allAssigned = [...cat.primaryResponders, ...cat.backupResponders];

                  return (
                    <tr key={cat.id} className="hover:bg-zinc-50/60 transition-colors">
                      {/* Area */}
                      <td className="p-3.5 pl-4">
                        <div className="font-semibold text-zinc-900 text-xs">
                          {cat.name}
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {cat.severity} priority
                        </div>
                      </td>

                      {/* Required */}
                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1">
                          {cat.expectedRoles.map((role, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-md text-[11px] font-medium"
                            >
                              {formatRoleName(role)}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Assigned */}
                      <td className="p-3.5">
                        {allAssigned.length === 0 ? (
                          <span className="text-zinc-400 text-xs italic">
                            No one assigned yet
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center -space-x-1.5 overflow-hidden">
                              {allAssigned.slice(0, 4).map((r, i) => (
                                <div
                                  key={i}
                                  title={`${r.name} (${r.responsibility})`}
                                  className="w-6 h-6 rounded-full bg-[#C59B27]/10 text-[#C59B27] border border-white flex items-center justify-center font-medium text-[10px] shrink-0"
                                >
                                  {getInitials(r.name)}
                                </div>
                              ))}
                              {allAssigned.length > 4 && (
                                <div className="w-6 h-6 rounded-full bg-zinc-100 text-zinc-600 border border-white flex items-center justify-center font-medium text-[9px] shrink-0">
                                  +{allAssigned.length - 4}
                                </div>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-600 truncate max-w-xs">
                              {allAssigned.map((r) => r.name).join(', ')}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5">
                        <div className="flex items-center space-x-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                          <span className={`text-xs font-medium ${statusInfo.textClass}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 pr-4 text-right">
                        {statusInfo.label !== 'Covered' ? (
                          <button
                            onClick={() => onNavigateTab?.('event_team')}
                            className="text-xs text-[#C59B27] hover:text-[#A8821B] font-medium px-2 py-1 rounded-lg hover:bg-[#C59B27]/10 cursor-pointer"
                          >
                            Assign person
                          </button>
                        ) : (
                          <button
                            onClick={() => onNavigateTab?.('event_team')}
                            className="text-xs text-zinc-500 hover:text-zinc-800 font-medium px-2 py-1 rounded-lg hover:bg-zinc-100 cursor-pointer"
                          >
                            View team
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="block md:hidden divide-y divide-zinc-100">
            {filteredCategories.map((cat) => {
              const statusInfo = getHumanCoverageStatus(cat);
              const allAssigned = [...cat.primaryResponders, ...cat.backupResponders];

              return (
                <div key={cat.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-zinc-900 text-xs">{cat.name}</div>
                      <div className="text-[11px] text-zinc-400">{cat.severity} priority</div>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                      <span className={`text-xs font-medium ${statusInfo.textClass}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg text-xs space-y-1.5">
                    <div>
                      <span className="text-zinc-400 text-[11px] block">Required roles</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {cat.expectedRoles.map((r, i) => (
                          <span key={i} className="text-[11px] text-zinc-700 bg-white border border-[#EAE8E1] px-1.5 py-0.5 rounded">
                            {formatRoleName(r)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-zinc-400 text-[11px] block">Assigned team</span>
                      <span className="text-zinc-800 text-xs font-medium">
                        {allAssigned.length > 0 ? allAssigned.map(r => r.name).join(', ') : 'None'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-1">
                    <button
                      onClick={() => onNavigateTab?.('event_team')}
                      className="text-xs text-[#C59B27] font-medium hover:underline cursor-pointer"
                    >
                      {statusInfo.label !== 'Covered' ? 'Assign team member' : 'View assignments'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Download, ChevronDown, ArrowLeft } from 'lucide-react';
import { api } from '../../../services/api';
import { AgeGroupAttendanceTable } from './AgeGroupAttendanceTable';
import { EventActivityChart } from './EventActivityChart';
import { VolunteerActivityTable } from './VolunteerActivityTable';
import { RecentActivityTable } from './RecentActivityTable';
import { EventAnalyticsSnapshot, AnalyticsVolunteerRow, formatAnalyticsTime } from './types';
import { createAnalyticsLiveSyncController, LiveConnectionState } from './liveSyncController';

interface EventAnalyticsViewProps {
  onBackToOverview?: () => void;
  initialSnapshot?: EventAnalyticsSnapshot | null;
}

export const EventAnalyticsView: React.FC<EventAnalyticsViewProps> = ({
  onBackToOverview,
  initialSnapshot = null
}) => {
  const [snapshot, setSnapshot] = useState<EventAnalyticsSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState<boolean>(!initialSnapshot);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'pdf' | null>(null);

  const [selectedEventId, setSelectedEventId] = useState<string>(initialSnapshot?.event?.id || '');
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>('');
  const [volunteerFilter, setVolunteerFilter] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<'all' | 'check_in' | 'pickup'>('all');
  const [activityPage, setActivityPage] = useState<number>(1);
  const [viewAllActivity, setViewAllActivity] = useState<boolean>(false);

  const [connectionState, setConnectionState] = useState<LiveConnectionState>('connecting');

  const requestSeqRef = useRef(0);
  const activeFetchControllerRef = useRef<AbortController | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  const fetchSnapshot = useCallback(
    async (silent: boolean) => {
      const seq = ++requestSeqRef.current;
      if (activeFetchControllerRef.current) {
        try {
          activeFetchControllerRef.current.abort();
        } catch {}
      }
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      activeFetchControllerRef.current = controller;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data: EventAnalyticsSnapshot = await api.admin.getEventAnalytics(
          {
            eventId: selectedEventId || undefined,
            ageGroup: ageGroupFilter || undefined,
            volunteerId: volunteerFilter || undefined,
            action: actionFilter,
            activityPage,
            activityPageSize: viewAllActivity ? 100 : 20
          },
          controller ? { signal: controller.signal } : undefined
        );

        if (seq !== requestSeqRef.current) return;
        setSnapshot(data);
        setErrorMsg('');
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        if (seq !== requestSeqRef.current) return;
        if (!silent) {
          setErrorMsg(err?.message || 'Unable to load event analytics.');
        }
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedEventId, ageGroupFilter, volunteerFilter, actionFilter, activityPage, viewAllActivity]
  );

  // Initial and filter-driven fetch
  useEffect(() => {
    fetchSnapshot(Boolean(snapshot));
    return () => {
      if (activeFetchControllerRef.current) {
        try {
          activeFetchControllerRef.current.abort();
        } catch {}
      }
    };
  }, [fetchSnapshot]);

  // Separate read-only SSE channel with automatic 5s fallback polling while disconnected
  const activeEventIdForStream = selectedEventId || snapshot?.event?.id || '';
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }
    const streamUrl = api.admin.buildEventAnalyticsStreamUrl(activeEventIdForStream || undefined);
    const liveSync = createAnalyticsLiveSyncController({
      streamUrl,
      pollIntervalMs: 5000,
      onRefresh: () => {
        fetchSnapshot(true);
      },
      onStateChange: (nextState) => {
        setConnectionState(nextState);
      }
    });
    liveSync.start();
    return () => {
      liveSync.stop();
    };
  }, [activeEventIdForStream, fetchSnapshot]);

  // Close export menu on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleInspectVolunteer = useCallback(
    async (vol: AnalyticsVolunteerRow) => {
      const res: EventAnalyticsSnapshot = await api.admin.getEventAnalytics({
        eventId: selectedEventId || snapshot?.event?.id || undefined,
        ageGroup: ageGroupFilter || undefined,
        volunteerId: vol.volunteerId,
        action: actionFilter,
        activityPage: 1,
        activityPageSize: 40
      });
      return res.recentActivity || [];
    },
    [selectedEventId, snapshot?.event?.id, ageGroupFilter, actionFilter]
  );

  const handleExport = async (format: 'csv' | 'pdf') => {
    setExportOpen(false);
    setExportingFormat(format);
    try {
      await api.admin.downloadEventAnalyticsExport(format, {
        eventId: selectedEventId || snapshot?.event?.id || undefined,
        ageGroup: ageGroupFilter || undefined,
        volunteerId: volunteerFilter || undefined,
        action: actionFilter
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to export analytics.');
    } finally {
      setExportingFormat(null);
    }
  };

  const resetAllFilters = () => {
    setAgeGroupFilter('');
    setVolunteerFilter('');
    setActionFilter('all');
    setActivityPage(1);
    setViewAllActivity(false);
  };

  const hasActiveFilters = Boolean(ageGroupFilter || volunteerFilter || actionFilter !== 'all');
  const timeZone = snapshot?.event?.timezone || 'Europe/London';
  const lastUpdatedLabel = formatAnalyticsTime(snapshot?.updatedAt, timeZone);

  return (
    <div className="bg-[#FAF9F5] min-h-full p-4 sm:p-6 space-y-5 text-zinc-900">
      {/* Header */}
      <div className="bg-white border border-zinc-200 rounded-md p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            {onBackToOverview && (
              <button
                type="button"
                onClick={onBackToOverview}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to overview
              </button>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Event Analytics</h1>
              <span className="text-[11px] uppercase tracking-wider font-medium text-zinc-500 border border-zinc-200 bg-[#FAF9F5] px-2 py-0.5 rounded-sm">
                Read-Only
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
              <span>Last updated {lastUpdatedLabel}</span>
              <span>·</span>
              {connectionState === 'reconnecting' ? (
                <span className="text-amber-700 font-medium">Live updates reconnecting…</span>
              ) : (
                <span>Auto-refresh on</span>
              )}
              {refreshing && <span className="text-[#9A7616]">Updating…</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Event selector */}
            <label className="sr-only" htmlFor="analytics-event-select">
              Event selector
            </label>
            <select
              id="analytics-event-select"
              value={selectedEventId || snapshot?.event?.id || ''}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setActivityPage(1);
              }}
              className="text-xs font-medium border border-zinc-200 rounded bg-[#FAF9F5] px-3 py-2 text-zinc-800 focus:outline-none focus:border-[#C59B27]"
            >
              {(!snapshot?.availableEvents || snapshot.availableEvents.length === 0) && (
                <option value="">No events found</option>
              )}
              {snapshot?.availableEvents?.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.status === 'current' ? `Current Event · ${ev.title}` : `${ev.title} (${ev.status})`}
                </option>
              ))}
            </select>

            {/* Export dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                disabled={!snapshot?.event || exportingFormat !== null}
                onClick={() => setExportOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-medium border border-zinc-200 rounded bg-white hover:border-[#C59B27] px-3 py-2 text-zinc-800 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                {exportingFormat ? `Exporting ${exportingFormat.toUpperCase()}...` : 'Export analytics'}
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              </button>
              {exportOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white border border-zinc-200 rounded-md shadow-lg py-1 z-30">
                  <button
                    type="button"
                    onClick={() => handleExport('csv')}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-[#FAF9F5]"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('pdf')}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-[#FAF9F5]"
                  >
                    Export PDF Summary
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => fetchSnapshot(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 text-xs font-medium border border-zinc-200 rounded bg-white hover:border-zinc-400 px-3 py-2 text-zinc-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Compact Filter Strip */}
        <div className="mt-4 pt-3 border-t border-zinc-100 flex flex-wrap items-center gap-2.5">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-500 mr-1">Filters</span>

          <select
            aria-label="Age group filter"
            value={ageGroupFilter}
            onChange={(e) => {
              setAgeGroupFilter(e.target.value);
              setActivityPage(1);
            }}
            className="text-xs border border-zinc-200 rounded bg-[#FAF9F5] px-2.5 py-1.5 text-zinc-800 focus:outline-none focus:border-[#C59B27]"
          >
            <option value="">All age groups</option>
            {(snapshot?.ageGroups || []).map((g) => (
              <option key={g.ageGroup} value={g.ageGroup}>
                {g.ageGroup === 'Other' ? 'Other' : `Ages ${g.ageGroup}`}
              </option>
            ))}
          </select>

          <select
            aria-label="Volunteer filter"
            value={volunteerFilter}
            onChange={(e) => {
              setVolunteerFilter(e.target.value);
              setActivityPage(1);
            }}
            className="text-xs border border-zinc-200 rounded bg-[#FAF9F5] px-2.5 py-1.5 text-zinc-800 focus:outline-none focus:border-[#C59B27]"
          >
            <option value="">All volunteers</option>
            {(snapshot?.volunteers || []).map((v) => (
              <option key={v.volunteerId} value={v.volunteerId}>
                {v.name} ({v.totalActions})
              </option>
            ))}
          </select>

          <select
            aria-label="Action filter"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value as 'all' | 'check_in' | 'pickup');
              setActivityPage(1);
            }}
            className="text-xs border border-zinc-200 rounded bg-[#FAF9F5] px-2.5 py-1.5 text-zinc-800 focus:outline-none focus:border-[#C59B27]"
          >
            <option value="all">All actions (Check-ins & Pickups)</option>
            <option value="check_in">Check-ins only</option>
            <option value="pickup">Pickups / Released only</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs font-medium text-[#9A7616] hover:text-zinc-900 underline underline-offset-2 ml-auto"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-md px-4 py-3 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => fetchSnapshot(false)} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      {loading && !snapshot ? (
        <div className="bg-white border border-zinc-200 rounded-md p-10 text-center text-xs text-zinc-500">
          Loading event analytics…
        </div>
      ) : !snapshot?.event ? (
        <div className="bg-white border border-zinc-200 rounded-md p-10 text-center space-y-2">
          <p className="text-sm font-medium text-zinc-900">No active event available</p>
          <p className="text-xs text-zinc-500">
            Select an event from the selector above or designate a current event in Events management.
          </p>
        </div>
      ) : (
        <>
          {/* Flat 6-KPI Strip */}
          <section
            aria-label="Attendance summary metrics"
            className="bg-white border border-zinc-200 rounded-md grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200"
          >
            <div className="p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Selected</div>
              <div className="text-2xl font-semibold tabular-nums text-zinc-900 mt-1">
                {snapshot.summary.selected}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Eligible children</div>
            </div>

            <button
              type="button"
              onClick={() => {
                setActionFilter((prev) => (prev === 'check_in' ? 'all' : 'check_in'));
                setActivityPage(1);
              }}
              className={`p-4 text-left transition-colors ${
                actionFilter === 'check_in' ? 'bg-[#FAF5E6]' : 'hover:bg-zinc-50'
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Checked in</div>
              <div className="text-2xl font-semibold tabular-nums text-zinc-900 mt-1">
                {snapshot.summary.checkedIn}
              </div>
              <div className="text-[11px] text-[#9A7616] mt-0.5">
                {actionFilter === 'check_in' ? 'Filtering check-ins' : 'Cumulative arrivals'}
              </div>
            </button>

            <div className="p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Currently inside</div>
              <div className="text-2xl font-semibold tabular-nums text-zinc-900 mt-1">
                {snapshot.summary.inside}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Active in care</div>
            </div>

            <button
              type="button"
              onClick={() => {
                setActionFilter((prev) => (prev === 'pickup' ? 'all' : 'pickup'));
                setActivityPage(1);
              }}
              className={`p-4 text-left transition-colors ${
                actionFilter === 'pickup' ? 'bg-[#FAF5E6]' : 'hover:bg-zinc-50'
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Picked up</div>
              <div className="text-2xl font-semibold tabular-nums text-zinc-900 mt-1">
                {snapshot.summary.pickedUp}
              </div>
              <div className="text-[11px] text-[#9A7616] mt-0.5">
                {actionFilter === 'pickup' ? 'Filtering pickups' : 'Released to parent'}
              </div>
            </button>

            <div className="p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Not arrived</div>
              <div className="text-2xl font-semibold tabular-nums text-zinc-900 mt-1">
                {snapshot.summary.notArrived}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Awaiting check-in</div>
            </div>

            <div className="p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Attendance</div>
              <div className="text-2xl font-semibold tabular-nums text-[#9A7616] mt-1">
                {`${snapshot.summary.attendancePct.toFixed(1)}%`}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Checked in / Selected</div>
            </div>
          </section>

          {/* Age Group Breakdown */}
          <AgeGroupAttendanceTable
            ageGroups={snapshot.ageGroups}
            activeAgeGroup={ageGroupFilter}
            onSelectAgeGroup={(next) => {
              setAgeGroupFilter(next);
              setActivityPage(1);
            }}
            summaryTotals={snapshot.summary}
          />

          {/* 15-Minute Activity Timeline */}
          <EventActivityChart timeline={snapshot.timeline} timeZone={timeZone} />

          {/* Volunteer Summary + Read-only Drawer */}
          <VolunteerActivityTable
            volunteers={snapshot.volunteers}
            activeVolunteerId={volunteerFilter}
            onSelectVolunteerFilter={(volId) => {
              setVolunteerFilter(volId);
              setActivityPage(1);
            }}
            onInspectVolunteer={handleInspectVolunteer}
            timeZone={timeZone}
          />

          {/* Recent Activity Feed */}
          <RecentActivityTable
            items={snapshot.recentActivity}
            pagination={snapshot.activityPagination}
            viewAll={viewAllActivity}
            onToggleViewAll={() => {
              setViewAllActivity((prev) => !prev);
              setActivityPage(1);
            }}
            onPageChange={(nextPage) => setActivityPage(nextPage)}
            timeZone={timeZone}
          />
        </>
      )}
    </div>
  );
};

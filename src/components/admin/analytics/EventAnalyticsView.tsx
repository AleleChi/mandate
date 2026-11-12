import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Download, ChevronDown, ArrowLeft } from 'lucide-react';
import { api } from '../../../services/api';
import { AgeGroupAttendanceTable } from './AgeGroupAttendanceTable';
import { EventActivityChart } from './EventActivityChart';
import { VolunteerActivityTable } from './VolunteerActivityTable';
import { RecentActivityTable } from './RecentActivityTable';
import {
  EventAnalyticsSnapshot,
  AnalyticsVolunteerRow,
  formatAnalyticsTime,
  formatAnalyticsDateRange
} from './types';
import { createAnalyticsLiveSyncController, LiveConnectionState } from './liveSyncController';

interface EventAnalyticsViewProps {
  onBackToOverview?: () => void;
  onNavigate?: (route: string) => void;
  initialSnapshot?: EventAnalyticsSnapshot | null;
}

export const EventAnalyticsView: React.FC<EventAnalyticsViewProps> = ({
  onBackToOverview,
  onNavigate,
  initialSnapshot = null
}) => {
  const [dataModel, setDataModel] = useState<EventAnalyticsSnapshot | null>(initialSnapshot);
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

  const fetchAnalytics = useCallback(
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
        setDataModel(data);
        setErrorMsg('');
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        if (seq !== requestSeqRef.current) return;
        if (!silent) {
          setErrorMsg(err?.message || 'Event analytics could not be loaded.');
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
    fetchAnalytics(Boolean(dataModel));
    return () => {
      if (activeFetchControllerRef.current) {
        try {
          activeFetchControllerRef.current.abort();
        } catch {}
      }
    };
  }, [fetchAnalytics]);

  // Background updates with automatic 5s fallback polling while disconnected
  const activeEventIdForSync = selectedEventId || dataModel?.event?.id || '';
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }
    const streamUrl = api.admin.buildEventAnalyticsStreamUrl(activeEventIdForSync || undefined);
    const liveSync = createAnalyticsLiveSyncController({
      streamUrl,
      pollIntervalMs: 5000,
      onRefresh: () => {
        fetchAnalytics(true);
      },
      onStateChange: (nextState) => {
        setConnectionState(nextState);
      }
    });
    liveSync.start();
    return () => {
      liveSync.stop();
    };
  }, [activeEventIdForSync, fetchAnalytics]);

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
        eventId: selectedEventId || dataModel?.event?.id || undefined,
        ageGroup: ageGroupFilter || undefined,
        volunteerId: vol.volunteerId,
        action: actionFilter,
        activityPage: 1,
        activityPageSize: 40
      });
      return res.recentActivity || [];
    },
    [selectedEventId, dataModel?.event?.id, ageGroupFilter, actionFilter]
  );

  const handleManageAssignment = useCallback(
    (vol: AnalyticsVolunteerRow) => {
      if (!vol.assignmentId) return;
      const targetEventId = selectedEventId || dataModel?.event?.id || '';
      const params = new URLSearchParams();
      params.set('tab', 'team');
      params.set('assignment', vol.assignmentId);
      if (targetEventId) params.set('eventId', targetEventId);
      const targetUrl = `/admin/event-duty?${params.toString()}`;
      if (onNavigate) {
        onNavigate(targetUrl);
      } else if (typeof window !== 'undefined') {
        window.location.href = targetUrl;
      }
    },
    [selectedEventId, dataModel?.event?.id, onNavigate]
  );

  const handleExport = async (format: 'csv' | 'pdf') => {
    setExportOpen(false);
    setExportingFormat(format);
    try {
      await api.admin.downloadEventAnalyticsExport(format, {
        eventId: selectedEventId || dataModel?.event?.id || undefined,
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
  const timeZone = dataModel?.event?.timezone || 'Africa/Lagos';
  const lastUpdatedLabel = formatAnalyticsTime(dataModel?.updatedAt, timeZone);
  const dateRangeText = formatAnalyticsDateRange(dataModel?.event?.startsAt, dataModel?.event?.endsAt, timeZone);
  const availableEvents = dataModel?.availableEvents || [];
  const multipleEvents = availableEvents.length > 1;

  return (
    <div className="bg-[#FAF9F5] min-h-full px-4 sm:px-8 py-6 max-w-[1440px] mx-auto space-y-8 text-zinc-900">
      {/* Flat Page Header with Bottom Rule */}
      <header className="pb-5 border-b border-zinc-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="space-y-1">
            {onBackToOverview && (
              <button
                type="button"
                onClick={onBackToOverview}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 mb-2 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to overview
              </button>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Event Analytics</h1>
            <p className="text-sm text-zinc-600">
              {dataModel?.event
                ? dateRangeText
                  ? `${dataModel.event.title} · ${dateRangeText}`
                  : `Attendance and event activity for ${dataModel.event.title}.`
                : 'Track attendance, age-group activity and volunteer operations during the event.'}
            </p>
            <p className="text-xs text-zinc-500 pt-0.5">
              {refreshing || connectionState === 'reconnecting'
                ? 'Updating…'
                : lastUpdatedLabel !== '—'
                  ? `Updated ${lastUpdatedLabel}`
                  : 'Updated —'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="sr-only" htmlFor="analytics-event-select">
              Event selector
            </label>
            <select
              id="analytics-event-select"
              value={selectedEventId || dataModel?.event?.id || ''}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setActivityPage(1);
              }}
              className="text-xs font-medium border border-zinc-200 bg-white px-3 py-2 text-zinc-800 focus:outline-none focus:border-[#C59B27]"
            >
              {availableEvents.length === 0 && (
                <option value="">
                  {errorMsg ? 'Event analytics could not be loaded.' : 'No events available.'}
                </option>
              )}
              {availableEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {multipleEvents && ev.status === 'current'
                    ? `${ev.title} — Current`
                    : ev.status !== 'current'
                      ? `${ev.title} (${ev.status})`
                      : ev.title}
                </option>
              ))}
            </select>

            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                disabled={!dataModel?.event || exportingFormat !== null}
                onClick={() => setExportOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-medium border border-zinc-200 bg-white hover:border-zinc-400 px-3 py-2 text-zinc-800 disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {exportingFormat ? `Exporting ${exportingFormat.toUpperCase()}…` : 'Export'}
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              </button>
              {exportOpen && (
                <div className="absolute right-0 mt-1 w-40 bg-white border border-zinc-200 shadow-sm py-1 z-30">
                  <button
                    type="button"
                    onClick={() => handleExport('pdf')}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-[#FAF9F5] cursor-pointer"
                  >
                    PDF summary
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('csv')}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-[#FAF9F5] cursor-pointer"
                  >
                    CSV
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => fetchAnalytics(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 text-xs font-medium border border-zinc-200 bg-white hover:border-zinc-400 px-3 py-2 text-zinc-800 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Compact Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2">
          <select
            aria-label="Age group filter"
            value={ageGroupFilter}
            onChange={(e) => {
              setAgeGroupFilter(e.target.value);
              setActivityPage(1);
            }}
            className="text-xs border border-zinc-200 bg-white px-2.5 py-1.5 text-zinc-800 focus:outline-none focus:border-[#C59B27]"
          >
            <option value="">All age groups</option>
            {(dataModel?.ageGroups || []).map((g) => (
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
            className="text-xs border border-zinc-200 bg-white px-2.5 py-1.5 text-zinc-800 focus:outline-none focus:border-[#C59B27]"
          >
            <option value="">All staff</option>
            {(dataModel?.volunteers || []).map((v) => (
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
            className="text-xs border border-zinc-200 bg-white px-2.5 py-1.5 text-zinc-800 focus:outline-none focus:border-[#C59B27]"
          >
            <option value="all">All actions</option>
            <option value="check_in">Checked in</option>
            <option value="pickup">Picked up</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs font-medium text-[#9A7616] hover:text-zinc-900 underline underline-offset-2 ml-auto cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>
      </header>

      {errorMsg && (
        <div className="border border-red-200 bg-red-50/70 text-red-800 px-4 py-3 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => fetchAnalytics(false)} className="font-medium underline cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {loading && !dataModel ? (
        <div className="py-12 text-center text-xs text-zinc-500">
          Loading event analytics…
        </div>
      ) : !dataModel?.event ? (
        <div className="py-12 text-center space-y-1.5 border-y border-zinc-200 bg-white">
          <p className="text-sm font-medium text-zinc-900">
            {errorMsg ? 'Event analytics could not be loaded.' : 'No events available.'}
          </p>
          <p className="text-xs text-zinc-500">
            {errorMsg
              ? 'Please retry loading the event dashboard.'
              : 'Select an event from the selector above or designate a current event in Events management.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Flat Operational Summary Strip */}
          <section
            aria-label="Attendance summary metrics"
            className="border-y border-zinc-200 bg-white grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200"
          >
            <div className="px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Selected</div>
              <div className="text-[28px] sm:text-[30px] leading-tight font-semibold tabular-nums text-zinc-900 mt-1">
                {dataModel.summary.selected.toLocaleString()}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setActionFilter((prev) => (prev === 'check_in' ? 'all' : 'check_in'));
                setActivityPage(1);
              }}
              className={`px-5 py-4 text-left transition-colors cursor-pointer ${
                actionFilter === 'check_in' ? 'bg-[#FAF5E6]' : 'hover:bg-zinc-50/70'
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Checked in</div>
              <div className="text-[28px] sm:text-[30px] leading-tight font-semibold tabular-nums text-zinc-900 mt-1">
                {dataModel.summary.checkedIn.toLocaleString()}
              </div>
            </button>

            <div className="px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Inside</div>
              <div className="text-[28px] sm:text-[30px] leading-tight font-semibold tabular-nums text-zinc-900 mt-1">
                {dataModel.summary.inside.toLocaleString()}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setActionFilter((prev) => (prev === 'pickup' ? 'all' : 'pickup'));
                setActivityPage(1);
              }}
              className={`px-5 py-4 text-left transition-colors cursor-pointer ${
                actionFilter === 'pickup' ? 'bg-[#FAF5E6]' : 'hover:bg-zinc-50/70'
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Picked up</div>
              <div className="text-[28px] sm:text-[30px] leading-tight font-semibold tabular-nums text-zinc-900 mt-1">
                {dataModel.summary.pickedUp.toLocaleString()}
              </div>
            </button>

            <div className="px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Not arrived</div>
              <div className="text-[28px] sm:text-[30px] leading-tight font-semibold tabular-nums text-zinc-900 mt-1">
                {dataModel.summary.notArrived.toLocaleString()}
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Attendance</div>
              <div className="text-[28px] sm:text-[30px] leading-tight font-semibold tabular-nums text-[#9A7616] mt-1">
                {`${dataModel.summary.attendancePct.toFixed(1)}%`}
              </div>
            </div>
          </section>

          <AgeGroupAttendanceTable
            ageGroups={dataModel.ageGroups}
            activeAgeGroup={ageGroupFilter}
            onSelectAgeGroup={(next) => {
              setAgeGroupFilter(next);
              setActivityPage(1);
            }}
            summaryTotals={dataModel.summary}
          />

          <EventActivityChart timeline={dataModel.timeline} />

          <VolunteerActivityTable
            volunteers={dataModel.volunteers}
            activeVolunteerId={volunteerFilter}
            onSelectVolunteerFilter={(volId) => {
              setVolunteerFilter(volId);
              setActivityPage(1);
            }}
            onInspectVolunteer={handleInspectVolunteer}
            onManageAssignment={handleManageAssignment}
            timeZone={timeZone}
          />

          <RecentActivityTable
            items={dataModel.recentActivity}
            pagination={dataModel.activityPagination}
            viewAll={viewAllActivity}
            onToggleViewAll={() => {
              setViewAllActivity((prev) => !prev);
              setActivityPage(1);
            }}
            onPageChange={(nextPage) => setActivityPage(nextPage)}
            timeZone={timeZone}
          />
        </div>
      )}
    </div>
  );
};

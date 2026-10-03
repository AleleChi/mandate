import React, { useState, useEffect, Suspense } from 'react';
import { RefreshCw, ChevronDown, Plus, Users, Printer } from 'lucide-react';
import { safeStorage } from '../../utils/storage';
import { buildApiUrl } from '../../utils/urlHelper';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

export type DutyTabType = 'event_locations' | 'event_team' | 'response_coverage' | 'devices_readiness' | 'alert_routing';

const DevicesReadinessTab = lazyWithRetry(() => import('./duty/DevicesReadinessTab'), 'devices_readiness');
const EventTeamTab = lazyWithRetry(() => import('./duty/EventTeamTab'), 'event_team');
const AlertRoutingTab = lazyWithRetry(() => import('./duty/AlertRoutingTab'), 'alert_routing');
const ResponseCoverageTab = lazyWithRetry(() => import('./duty/ResponseCoverageTab'), 'response_coverage');
const AdminEventLocationsTab = lazyWithRetry(() => import('./duty/AdminEventLocationsTab'), 'event_locations');

const TabLoading = () => (
  <div className="p-12 text-center text-xs text-zinc-500 dark:text-[#7A7570] bg-white dark:bg-[#1D1D1A] border border-[#EAE8E1] dark:border-[#302E29] rounded-2xl space-y-3">
    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#C59B27]" />
    <span className="font-medium text-zinc-600 dark:text-[#B8B0A5] block">Loading section…</span>
  </div>
);

interface EventOption {
  id: string;
  title: string;
  status: string;
}

export function AdminDutyDevicesView() {
  const [activeTab, setActiveTab] = useState<DutyTabType>('event_locations');
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('event-ga-2026');
  const [triggerCreateLocation, setTriggerCreateLocation] = useState(0);
  const [triggerPrintAllCodes, setTriggerPrintAllCodes] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchEvents = async () => {
      try {
        const token = safeStorage.getItem('koinonia_token');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(buildApiUrl('/api/admin/events'), { headers });
        if (res.ok) {
          const data = await res.json();
          const list: EventOption[] = data.events || (Array.isArray(data) ? data : []);
          if (isMounted && list.length > 0) {
            setEvents(list);
            const currentEv = list.find((e) => e.status === 'current' || e.status === 'open') || list[0];
            if (currentEv?.id) {
              setSelectedEventId(currentEv.id);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load events for duty module:', err);
      }
    };

    fetchEvents();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6" data-view-version="admin-event-duty-v6">
      {/* 1. Page Header with clean human ministry title and primary actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#EAE8E1] dark:border-[#302E29]">
        <div>
          <h1 className="text-2xl font-bold font-sans text-[#18181B] dark:text-[#F0EBE3] tracking-tight">
            Event Duty
          </h1>
          <p className="text-xs text-zinc-500 dark:text-[#7A7570] mt-1 font-normal">
            Manage where teams are serving and see who is currently on duty.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {events.length > 0 && (
            <div className="flex items-center space-x-1.5 shrink-0 mr-1">
              <label htmlFor="duty-event-selector" className="text-xs text-zinc-500 dark:text-[#7A7570] font-medium">
                Event:
              </label>
              <div className="relative">
                <select
                  id="duty-event-selector"
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  aria-label="Select event"
                  className="appearance-none text-xs font-medium pl-3 pr-7 py-2 bg-white dark:bg-[#262520] border border-[#EAE8E1] dark:border-[#3A3835] rounded-xl text-zinc-800 dark:text-[#F0EBE3] shadow-2xs hover:border-zinc-300 dark:hover:border-[#47443F] focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} {ev.status === 'current' ? '(Current)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 dark:text-[#7A7570] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveTab('event_locations');
              setTriggerPrintAllCodes(prev => prev + 1);
            }}
            className="px-3 py-2 bg-white dark:bg-[#21211E] border border-[#EAE8E1] dark:border-[#302E29] hover:bg-zinc-50 dark:hover:bg-[#262520] text-zinc-700 dark:text-[#B8B0A5] text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 shadow-2xs"
            title="Print printable venue posters for all locations"
          >
            <Printer className="w-3.5 h-3.5 text-zinc-500 dark:text-[#7A7570]" />
            <span>Print duty QR codes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('event_team')}
            className={`px-3 py-2 border rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 shadow-2xs ${
              activeTab === 'event_team'
                ? 'bg-zinc-900 dark:bg-amber-400 text-white dark:text-[#18181B] border-zinc-900 dark:border-amber-400'
                : 'bg-white dark:bg-[#21211E] border-[#EAE8E1] dark:border-[#302E29] hover:bg-zinc-50 dark:hover:bg-[#262520] text-zinc-700 dark:text-[#B8B0A5]'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-zinc-500 dark:text-[#7A7570]" />
            <span>Assignments</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('event_locations');
              setTriggerCreateLocation(prev => prev + 1);
            }}
            className="px-3.5 py-2 bg-[#C59B27] hover:bg-[#A47E1F] text-white text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add location</span>
          </button>
        </div>
      </div>

      {/* 2. Restrained Admin Tab Navigation */}
      <div className="flex border-b border-[#EAE8E1] dark:border-[#302E29] overflow-x-auto" id="event-duty-tabs">
        <button
          onClick={() => setActiveTab('event_locations')}
          id="tab-duty-locations"
          className={`px-4 py-2.5 text-xs transition-all border-b-2 cursor-pointer focus:outline-none whitespace-nowrap ${
            activeTab === 'event_locations'
              ? 'border-[#C59B27] text-[#18181B] dark:text-[#F0EBE3] font-semibold'
              : 'border-transparent text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#B8B0A5] font-medium'
          }`}
        >
          Locations
        </button>

        <button
          onClick={() => setActiveTab('event_team')}
          id="tab-duty-team"
          className={`px-4 py-2.5 text-xs transition-all border-b-2 cursor-pointer focus:outline-none whitespace-nowrap ${
            activeTab === 'event_team'
              ? 'border-[#C59B27] text-[#18181B] dark:text-[#F0EBE3] font-semibold'
              : 'border-transparent text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#B8B0A5] font-medium'
          }`}
        >
          Team Assignments
        </button>

        <button
          onClick={() => setActiveTab('response_coverage')}
          id="tab-duty-coverage"
          className={`px-4 py-2.5 text-xs transition-all border-b-2 cursor-pointer focus:outline-none whitespace-nowrap ${
            activeTab === 'response_coverage'
              ? 'border-[#C59B27] text-[#18181B] dark:text-[#F0EBE3] font-semibold'
              : 'border-transparent text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#B8B0A5] font-medium'
          }`}
        >
          Team Coverage
        </button>

        <button
          onClick={() => setActiveTab('devices_readiness')}
          id="tab-duty-devices"
          className={`px-4 py-2.5 text-xs transition-all border-b-2 cursor-pointer focus:outline-none whitespace-nowrap ${
            activeTab === 'devices_readiness'
              ? 'border-[#C59B27] text-[#18181B] dark:text-[#F0EBE3] font-semibold'
              : 'border-transparent text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#B8B0A5] font-medium'
          }`}
        >
          Devices
        </button>

        <button
          onClick={() => setActiveTab('alert_routing')}
          id="tab-duty-alerts"
          className={`px-4 py-2.5 text-xs transition-all border-b-2 cursor-pointer focus:outline-none whitespace-nowrap ${
            activeTab === 'alert_routing'
              ? 'border-[#C59B27] text-[#18181B] dark:text-[#F0EBE3] font-semibold'
              : 'border-transparent text-zinc-400 dark:text-[#7A7570] hover:text-zinc-600 dark:hover:text-[#B8B0A5] font-medium'
          }`}
        >
          Alert Rules
        </button>
      </div>

      {/* 3. Tab Contents with Event Scoping */}
      <div className="relative">
        {activeTab === 'event_locations' && (
          <ErrorBoundary
            fallbackTitle="Locations couldn't load"
            fallbackDescription="We couldn't open this section right now. Refresh the page and try again."
          >
            <Suspense fallback={<TabLoading />}>
              <AdminEventLocationsTab
                eventId={selectedEventId}
                triggerCreateLocation={triggerCreateLocation}
                triggerPrintAllCodes={triggerPrintAllCodes}
                onNavigateTab={(tab) => setActiveTab(tab as DutyTabType)}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'event_team' && (
          <ErrorBoundary
            fallbackTitle="Team Assignments couldn't load"
            fallbackDescription="We couldn't open this section right now. Refresh the page and try again."
          >
            <Suspense fallback={<TabLoading />}>
              <EventTeamTab eventId={selectedEventId} />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'response_coverage' && (
          <ErrorBoundary
            fallbackTitle="Team Coverage couldn't load"
            fallbackDescription="We couldn't open this section right now. Refresh the page and try again."
          >
            <Suspense fallback={<TabLoading />}>
              <ResponseCoverageTab
                eventId={selectedEventId}
                onNavigateTab={(tab) => setActiveTab(tab as DutyTabType)}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'devices_readiness' && (
          <ErrorBoundary
            fallbackTitle="Devices couldn't load"
            fallbackDescription="We couldn't open this section right now. Refresh the page and try again."
          >
            <Suspense fallback={<TabLoading />}>
              <DevicesReadinessTab eventId={selectedEventId} />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'alert_routing' && (
          <ErrorBoundary
            fallbackTitle="Alert Rules couldn't load"
            fallbackDescription="We couldn't open this section right now. Refresh the page and try again."
          >
            <Suspense fallback={<TabLoading />}>
              <AlertRoutingTab eventId={selectedEventId} />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

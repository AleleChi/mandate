import React, { useState, useEffect, lazy, Suspense } from 'react';
import { RefreshCw, ChevronDown } from 'lucide-react';
import { safeStorage } from '../../utils/storage';
import { ErrorBoundary } from '../common/ErrorBoundary';

export type DutyTabType = 'devices_readiness' | 'event_team' | 'alert_routing' | 'response_coverage' | 'event_locations';

const DevicesReadinessTab = lazy(() => import('./duty/DevicesReadinessTab'));
const EventTeamTab = lazy(() => import('./duty/EventTeamTab'));
const AlertRoutingTab = lazy(() => import('./duty/AlertRoutingTab'));
const ResponseCoverageTab = lazy(() => import('./duty/ResponseCoverageTab'));
const AdminEventLocationsTab = lazy(() => import('./duty/AdminEventLocationsTab'));

const TabLoading = () => (
  <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl space-y-3">
    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#C59B27]" />
    <span className="font-medium text-zinc-600 block">Loading section…</span>
  </div>
);

interface EventOption {
  id: string;
  title: string;
  status: string;
}

export function AdminDutyDevicesView() {
  const [activeTab, setActiveTab] = useState<DutyTabType>('devices_readiness');
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('event-ga-2026');

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
        const res = await fetch('/api/admin/events', { headers });
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
    <div className="space-y-6" data-view-version="admin-duty-refined">
      {/* 1. Page Header with quiet heading and event scoping selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#EAE8E1]">
        <div>
          <h1
            className="text-2xl font-bold text-[#18181B] tracking-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Event Duty
          </h1>
          <p className="text-xs text-zinc-500 mt-1 font-normal">
            Manage the team, locations and tools needed to run the event.
          </p>
        </div>

        {events.length > 0 && (
          <div className="flex items-center space-x-2 shrink-0">
            <label htmlFor="duty-event-selector" className="text-xs text-zinc-500 font-medium">
              Event:
            </label>
            <div className="relative">
              <select
                id="duty-event-selector"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                aria-label="Select event"
                className="appearance-none text-xs font-medium pl-3 pr-8 py-2 bg-white border border-[#EAE8E1] rounded-xl text-zinc-800 shadow-2xs hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} {ev.status === 'current' ? '(Current)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* 2. Restrained Admin Tab Navigation */}
      <div className="flex border-b border-[#EAE8E1] overflow-x-auto" id="event-duty-tabs">
        <button
          onClick={() => setActiveTab('devices_readiness')}
          id="tab-duty-devices"
          className={`px-4 py-2.5 text-xs transition-all border-b-2 cursor-pointer focus:outline-none whitespace-nowrap ${
            activeTab === 'devices_readiness'
              ? 'border-[#C59B27] text-[#18181B] font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-600 font-medium'
          }`}
        >
          Devices
        </button>

        <button
          onClick={() => setActiveTab('event_team')}
          id="tab-duty-team"
          className={`px-4 py-2.5 text-xs transition-all border-b-2 cursor-pointer focus:outline-none whitespace-nowrap ${
            activeTab === 'event_team'
              ? 'border-[#C59B27] text-[#18181B] font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-600 font-medium'
          }`}
        >
          Team Assignments
        </button>

        <button
          onClick={() => setActiveTab('alert_routing')}
          id="tab-duty-alerts"
          className={`px-4 py-2.5 text-xs transition-all border-b-2 cursor-pointer focus:outline-none whitespace-nowrap ${
            activeTab === 'alert_routing'
              ? 'border-[#C59B27] text-[#18181B] font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-600 font-medium'
          }`}
        >
          Alert Rules
        </button>

        <button
          onClick={() => setActiveTab('response_coverage')}
          id="tab-duty-coverage"
          className={`px-4 py-2.5 text-xs transition-all border-b-2 cursor-pointer focus:outline-none whitespace-nowrap ${
            activeTab === 'response_coverage'
              ? 'border-[#C59B27] text-[#18181B] font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-600 font-medium'
          }`}
        >
          Team Coverage
        </button>

        <button
          onClick={() => setActiveTab('event_locations')}
          id="tab-duty-locations"
          className={`px-4 py-2.5 text-xs transition-all border-b-2 cursor-pointer focus:outline-none whitespace-nowrap ${
            activeTab === 'event_locations'
              ? 'border-[#C59B27] text-[#18181B] font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-600 font-medium'
          }`}
        >
          Locations
        </button>
      </div>

      {/* 3. Tab Contents with Event Scoping */}
      <div className="relative">
        {activeTab === 'devices_readiness' && (
          <ErrorBoundary fallbackTitle="Devices panel failed to load">
            <Suspense fallback={<TabLoading />}>
              <DevicesReadinessTab eventId={selectedEventId} />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'event_team' && (
          <ErrorBoundary fallbackTitle="Team Assignments panel failed to load">
            <Suspense fallback={<TabLoading />}>
              <EventTeamTab eventId={selectedEventId} />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'alert_routing' && (
          <ErrorBoundary fallbackTitle="Alert Rules panel failed to load">
            <Suspense fallback={<TabLoading />}>
              <AlertRoutingTab eventId={selectedEventId} />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'response_coverage' && (
          <ErrorBoundary fallbackTitle="Team Coverage panel failed to load">
            <Suspense fallback={<TabLoading />}>
              <ResponseCoverageTab
                eventId={selectedEventId}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'event_locations' && (
          <ErrorBoundary fallbackTitle="Locations panel failed to load">
            <Suspense fallback={<TabLoading />}>
              <AdminEventLocationsTab eventId={selectedEventId} />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

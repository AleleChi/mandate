import React, { useState, lazy, Suspense } from 'react';
import { Smartphone, Users, SlidersHorizontal, Activity, RefreshCw, MapPin } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

type TabType = 'devices_readiness' | 'event_team' | 'alert_routing' | 'response_coverage' | 'event_locations';

const DevicesReadinessTab = lazy(() => import('./duty/DevicesReadinessTab'));
const EventTeamTab = lazy(() => import('./duty/EventTeamTab'));
const AlertRoutingTab = lazy(() => import('./duty/AlertRoutingTab'));
const ResponseCoverageTab = lazy(() => import('./duty/ResponseCoverageTab'));
const AdminEventLocationsTab = lazy(() => import('./duty/AdminEventLocationsTab'));

const TabLoading = () => (
  <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-3xl space-y-3">
    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#C59B27]" />
    <span className="font-semibold block">Loading section components...</span>
  </div>
);

export function AdminDutyDevicesView() {
  const [activeTab, setActiveTab] = useState<TabType>('devices_readiness');

  return (
    <div className="space-y-6">
      {/* Tabs Selector Row */}
      <div className="flex flex-wrap border-b border-[#EAE8E1] gap-1 bg-zinc-50/50 p-1 rounded-2xl border">
        <button
          onClick={() => setActiveTab('devices_readiness')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'devices_readiness' 
              ? 'bg-white border border-[#EAE8E1] text-zinc-900 shadow-xs' 
              : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/50'
          }`}
        >
          <Smartphone className="w-4 h-4 text-[#C59B27]" />
          <span>Devices & Readiness</span>
        </button>

        <button
          onClick={() => setActiveTab('event_team')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'event_team' 
              ? 'bg-white border border-[#EAE8E1] text-zinc-900 shadow-xs' 
              : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/50'
          }`}
        >
          <Users className="w-4 h-4 text-[#C59B27]" />
          <span>Event Team Assignments</span>
        </button>

        <button
          onClick={() => setActiveTab('alert_routing')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'alert_routing' 
              ? 'bg-white border border-[#EAE8E1] text-zinc-900 shadow-xs' 
              : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/50'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 text-[#C59B27]" />
          <span>Alert Routing Rules</span>
        </button>

        <button
          onClick={() => setActiveTab('response_coverage')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'response_coverage' 
              ? 'bg-white border border-[#EAE8E1] text-zinc-900 shadow-xs' 
              : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/50'
          }`}
        >
          <Activity className="w-4 h-4 text-[#C59B27]" />
          <span>Response Coverage</span>
        </button>

        <button
          onClick={() => setActiveTab('event_locations')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'event_locations' 
              ? 'bg-white border border-[#EAE8E1] text-zinc-900 shadow-xs' 
              : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/50'
          }`}
        >
          <MapPin className="w-4 h-4 text-[#C59B27]" />
          <span>Event Locations</span>
        </button>
      </div>

      {/* Render selected active view wrapped in its own ErrorBoundary & Suspense boundary */}
      <div className="relative">
        {activeTab === 'devices_readiness' && (
          <ErrorBoundary fallbackTitle="Devices & Readiness panel failed to load">
            <Suspense fallback={<TabLoading />}>
              <DevicesReadinessTab />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'event_team' && (
          <ErrorBoundary fallbackTitle="Event Team Assignments panel failed to load">
            <Suspense fallback={<TabLoading />}>
              <EventTeamTab />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'alert_routing' && (
          <ErrorBoundary fallbackTitle="Alert Routing Rules panel failed to load">
            <Suspense fallback={<TabLoading />}>
              <AlertRoutingTab />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'response_coverage' && (
          <ErrorBoundary fallbackTitle="Response Coverage panel failed to load">
            <Suspense fallback={<TabLoading />}>
              <ResponseCoverageTab />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'event_locations' && (
          <ErrorBoundary fallbackTitle="Event Locations panel failed to load">
            <Suspense fallback={<TabLoading />}>
              <AdminEventLocationsTab />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

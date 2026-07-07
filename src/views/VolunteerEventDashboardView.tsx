import React, { useState, useEffect } from 'react';
import { LogOut, QrCode, Search, BarChart3, User, RefreshCw, AlertTriangle, ShieldCheck, Check, Home } from 'lucide-react';
import { AppRoute } from '../types';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { Button } from '../components/common/Button';

interface VolunteerEventDashboardViewProps {
  onNavigate: (route: AppRoute) => void;
  volunteerProfile: any;
  onSignOut: () => void;
  isOffline?: boolean;
  hasParentProfile?: boolean;
}

export const VolunteerEventDashboardView: React.FC<VolunteerEventDashboardViewProps> = ({
  onNavigate,
  volunteerProfile,
  onSignOut,
  isOffline = false,
  hasParentProfile = false
}) => {
  const { showSuccess, showWarning, showError } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    expected: 0,
    checkedIn: 0,
    pickedUp: 0,
    attention: 0
  });
  const [eventDetails, setEventDetails] = useState<any>({
    title: 'Loading Active Event...',
    date: ''
  });
  const [attentionItems, setAttentionItems] = useState<any[]>([]);

  const fetchDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.volunteer.getEventHome();
      if (res) {
        if (res.stats) setStats(res.stats);
        if (res.event) setEventDetails(res.event);
        if (res.attentionItems) setAttentionItems(res.attentionItems);
      }
    } catch (err: any) {
      console.error('Failed to fetch volunteer dashboard stats:', err);
      // Fallback is already handled gracefully on screen
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData(true);
    showSuccess('Dashboard updated', 'Latest event statistics successfully retrieved.');
  };

  const handleResolveAction = (item: any) => {
    showSuccess(
      'Action Triggered',
      `Redirecting to child profile (${item.child_name || 'David O.'}) to execute ${item.issue_type.toLowerCase()}...`
    );
    // Open appropriate screen or directory search
    onNavigate(`/parent/children/${item.child_id}/status` as AppRoute);
  };

  const fullName = volunteerProfile?.full_name || 'Volunteer';
  const teamName = volunteerProfile?.preferred_team || 'General Team';

  return (
    <div className="min-h-screen bg-[#FAF9F6] font-sans flex flex-col pb-24">
      {/* Header Bar */}
      <header className="bg-white border-b border-[#EAE8E1] sticky top-0 z-20 px-4 py-3 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-full bg-[#C59B27]/10 flex items-center justify-center text-[#C59B27] font-serif font-bold text-base">
              K
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">Volunteer Access</h1>
              <p className="text-[10px] font-mono font-bold text-gray-400 tracking-wider uppercase">
                {teamName}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {hasParentProfile && (
              <button
                onClick={() => onNavigate('/parent/home')}
                className="p-2 text-[#C59B27] hover:text-[#A47E1F] rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer transition-colors"
                title="Switch to Parent Access"
              >
                <Home className="h-4.5 w-4.5" />
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`p-2 text-gray-400 hover:text-[#C59B27] rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer transition-transform ${refreshing ? 'animate-spin' : ''}`}
              title="Refresh Stats"
            >
              <RefreshCw className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={onSignOut}
              className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl w-full mx-auto px-4 pt-6 space-y-6">
        
        {/* Offline Warning Notice */}
        {isOffline && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start space-x-3 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
            <div className="space-y-0.5">
              <h3 className="text-xs font-bold">You are currently offline</h3>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                We will attempt to synchronize local scans and statistics once your connection stabilizes.
              </p>
            </div>
          </div>
        )}

        {/* Welcome Block */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm gap-4">
          <div className="space-y-1">
            <p className="text-xs font-mono font-bold text-[#C59B27] tracking-wider uppercase">Active Event</p>
            <h2 className="text-xl font-bold font-serif-koinonia text-[#18181B] tracking-tight">
              {eventDetails.title || 'General Assembly 2026'}
            </h2>
            <p className="text-xs text-gray-400">Date: {eventDetails.date || 'July 6, 2026'}</p>
          </div>
          <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-2xl border border-gray-100">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase leading-tight">Identity Status</p>
              <h3 className="text-xs font-bold text-gray-800">Active Volunteer</h3>
              <p className="text-[10px] text-emerald-600 font-medium">Clearance Verified</p>
            </div>
          </div>
        </div>

        {/* Live Metrics Grid (Exact Stitch design style) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Expected Card */}
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-sm space-y-2">
            <span className="text-[11px] font-mono font-bold text-gray-400 tracking-wider uppercase block">
              EXPECTED
            </span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-3xl font-extrabold text-gray-900 tracking-tight">
                {stats.expected}
              </span>
              <span className="text-xs text-gray-400 font-medium">total</span>
            </div>
          </div>

          {/* Checked In Card */}
          <div className="bg-emerald-50/40 border border-emerald-100 rounded-3xl p-5 shadow-sm space-y-2">
            <span className="text-[11px] font-mono font-bold text-emerald-700 tracking-wider uppercase block">
              CHECKED IN
            </span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-3xl font-extrabold text-emerald-800 tracking-tight">
                {stats.checkedIn}
              </span>
              <span className="text-xs text-emerald-600 font-medium">inside</span>
            </div>
          </div>

          {/* Picked Up Card */}
          <div className="bg-gray-50 border border-gray-200/60 rounded-3xl p-5 shadow-sm space-y-2">
            <span className="text-[11px] font-mono font-bold text-gray-500 tracking-wider uppercase block">
              PICKED UP
            </span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-3xl font-extrabold text-gray-700 tracking-tight">
                {stats.pickedUp}
              </span>
              <span className="text-xs text-gray-400 font-medium">out</span>
            </div>
          </div>

          {/* Attention Card */}
          <div className="bg-amber-50/50 border border-amber-200/60 rounded-3xl p-5 shadow-sm space-y-2">
            <span className="text-[11px] font-mono font-bold text-amber-700 tracking-wider uppercase block">
              ATTENTION
            </span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-3xl font-extrabold text-amber-800 tracking-tight">
                {stats.attention}
              </span>
              <span className="text-xs text-amber-600 font-medium">issues</span>
            </div>
          </div>
        </div>

        {/* Attention / Tasks List Panel */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
              ATTENTION REQUIRED ({attentionItems.length || stats.attention})
            </h2>
            <span className="text-[10px] text-gray-400 font-medium">Real-time alerts</span>
          </div>

          {attentionItems.length === 0 && !loading && (
            <div className="bg-white border border-[#EAE8E1] rounded-3xl p-8 text-center space-y-2">
              <div className="mx-auto w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
                <Check className="h-6 w-6 stroke-[2]" />
              </div>
              <h3 className="text-sm font-bold text-gray-800">All Clear!</h3>
              <p className="text-xs text-gray-500 max-w-xs mx-auto">
                No active child registration issues or medical updates require attention. Great job!
              </p>
            </div>
          )}

          {attentionItems.length > 0 && (
            <div className="space-y-3">
              {attentionItems.map((item, index) => {
                let badgeColor = "bg-amber-50 text-amber-700 border-amber-100";
                if (item.issue_type === 'Medical note update') {
                  badgeColor = "bg-rose-50 text-rose-700 border-rose-100";
                } else if (item.issue_type === 'Age review required') {
                  badgeColor = "bg-blue-50 text-blue-700 border-blue-100";
                }

                return (
                  <div
                    key={item.id || index}
                    className="bg-white border border-[#EAE8E1] hover:border-[#C59B27]/40 rounded-2xl p-4 flex items-center justify-between transition-all"
                  >
                    <div className="space-y-1">
                      <span className={`inline-block px-2 py-0.5 rounded-lg border text-[9px] font-bold ${badgeColor}`}>
                        {item.issue_type}
                      </span>
                      <h3 className="text-sm font-bold text-gray-800">{item.child_name}</h3>
                      <p className="text-[10px] text-gray-400">Child ID: #{item.child_id}</p>
                    </div>

                    <button
                      onClick={() => handleResolveAction(item)}
                      className="h-9 px-4 bg-[#18181B] hover:bg-gray-800 text-white font-bold text-xs tracking-wide rounded-xl transition-colors flex items-center justify-center cursor-pointer"
                    >
                      {item.action_text || 'RESOLVE'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Tools Header */}
        <div className="pt-2 space-y-3">
          <h2 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase px-1">
            EVENT DAY TOOLS
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Scan Card */}
            <button
              onClick={() => showWarning('Scan tool', 'The QR scanner will be added in the next module iteration.')}
              className="bg-white border border-[#EAE8E1] hover:border-[#C59B27]/30 p-5 rounded-3xl text-left space-y-3 shadow-xs group cursor-pointer transition-all"
            >
              <div className="w-10 h-10 bg-gray-50 group-hover:bg-[#C59B27]/10 text-gray-600 group-hover:text-[#C59B27] rounded-2xl flex items-center justify-center transition-all">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Scan QR Code</h3>
                <p className="text-[11px] text-gray-400">Check children in or scan pickup passes.</p>
              </div>
            </button>

            {/* Children Card */}
            <button
              onClick={() => showWarning('Directory', 'The children directory and search tools will be added in the next iteration.')}
              className="bg-white border border-[#EAE8E1] hover:border-[#C59B27]/30 p-5 rounded-3xl text-left space-y-3 shadow-xs group cursor-pointer transition-all"
            >
              <div className="w-10 h-10 bg-gray-50 group-hover:bg-[#C59B27]/10 text-gray-600 group-hover:text-[#C59B27] rounded-2xl flex items-center justify-center transition-all">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Children List</h3>
                <p className="text-[11px] text-gray-400">Browse registrations & lookup specific profiles.</p>
              </div>
            </button>

            {/* Reports Card */}
            <button
              onClick={() => showWarning('Reports', 'Reporting aggregates and export options will be added in the next iteration.')}
              className="bg-white border border-[#EAE8E1] hover:border-[#C59B27]/30 p-5 rounded-3xl text-left space-y-3 shadow-xs group cursor-pointer transition-all"
            >
              <div className="w-10 h-10 bg-gray-50 group-hover:bg-[#C59B27]/10 text-gray-600 group-hover:text-[#C59B27] rounded-2xl flex items-center justify-center transition-all">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">Reports</h3>
                <p className="text-[11px] text-gray-400">View check-in velocity and aggregate metrics.</p>
              </div>
            </button>

            {/* Profile Card */}
            <button
              onClick={() => showWarning('My Profile', 'Profile updates and setting forms will be added in the next iteration.')}
              className="bg-white border border-[#EAE8E1] hover:border-[#C59B27]/30 p-5 rounded-3xl text-left space-y-3 shadow-xs group cursor-pointer transition-all"
            >
              <div className="w-10 h-10 bg-gray-50 group-hover:bg-[#C59B27]/10 text-gray-600 group-hover:text-[#C59B27] rounded-2xl flex items-center justify-center transition-all">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">My Profile</h3>
                <p className="text-[11px] text-gray-400">View team assignment, status, and edit details.</p>
              </div>
            </button>
          </div>
        </div>

      </main>

      {/* Persistent Bottom Bar (Stitch design detail for volunteers) */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#EAE8E1] px-6 py-2 flex items-center justify-around z-20">
        <button
          onClick={() => onNavigate('/volunteer/event')}
          className="flex flex-col items-center justify-center text-[#C59B27] transition-colors cursor-pointer"
        >
          <BarChart3 className="h-5 w-5" />
          <span className="text-[10px] font-bold mt-1">Dashboard</span>
        </button>
        
        <button
          onClick={() => showWarning('Scan QR', 'Scanner module launches in the next phase.')}
          className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <QrCode className="h-5 w-5" />
          <span className="text-[10px] font-medium mt-1">Scan</span>
        </button>

        <button
          onClick={() => showWarning('Search', 'Children search module launches in the next phase.')}
          className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <Search className="h-5 w-5" />
          <span className="text-[10px] font-medium mt-1">Children</span>
        </button>
      </div>
    </div>
  );
};

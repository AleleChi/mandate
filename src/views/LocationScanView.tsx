import React, { useState, useEffect } from 'react';
import { MapPin, CheckCircle2, AlertCircle, ArrowRight, LogIn, Clock, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { safeStorage } from '../utils/storage';
import { BrandLogo } from '../components/common/BrandLogo';

interface LocationScanViewProps {
  token: string;
  user?: any;
  onNavigate: (route: string) => void;
}

interface LocationData {
  id: string;
  name: string;
  type: string;
  shortName?: string | null;
  description?: string | null;
  instructions?: string | null;
  emergencyLabel?: string | null;
  capacity?: number;
  ageGroupKey?: string | null;
  teamKey?: string | null;
  pathLabel?: string;
  status?: string;
}

type ScanState = 
  | 'loading'
  | 'assigned_here_not_present'
  | 'assigned_here_present'
  | 'assigned_elsewhere'
  | 'no_assignment'
  | 'unauthenticated'
  | 'code_inactive';

export const LocationScanView: React.FC<LocationScanViewProps> = ({ token, user, onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [scanState, setScanState] = useState<ScanState>('loading');
  const [location, setLocation] = useState<LocationData | null>(null);
  const [assignedLocationName, setAssignedLocationName] = useState<string | null>(null);
  const [presentSince, setPresentSince] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justReported, setJustReported] = useState(false);

  const formatDisplayTime = (isoString?: string | null) => {
    if (!isoString) {
      const now = new Date();
      return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const resolveLocationToken = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await api.request<any>(`/api/duty/location-code/${encodeURIComponent(token)}`);
      if (!res || !res.success) {
        setScanState('code_inactive');
        return;
      }

      setLocation(res.location);

      if (!res.authenticated) {
        setScanState('unauthenticated');
        return;
      }

      if (res.state === 'assigned_here_present') {
        setScanState('assigned_here_present');
        setPresentSince(res.presentSince);
      } else if (res.state === 'assigned_here_not_present') {
        setScanState('assigned_here_not_present');
      } else if (res.state === 'assigned_elsewhere') {
        setScanState('assigned_elsewhere');
        setAssignedLocationName(res.assignedLocationName || 'Another location');
      } else {
        setScanState('no_assignment');
      }
    } catch (err: any) {
      console.error('Failed to verify location token:', err);
      setScanState('code_inactive');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      resolveLocationToken();
    }
  }, [token, user?.id]);

  const handleReportForDuty = async () => {
    if (!location) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await api.request<any>('/api/duty/current-location', {
        method: 'POST',
        body: JSON.stringify({
          locationId: location.id,
          scannedToken: token,
          source: 'scanned'
        })
      });

      if (res && res.success) {
        setJustReported(true);
        setScanState('assigned_here_present');
        setPresentSince(res.presence?.startedAt || new Date().toISOString());
      } else {
        setActionError(res?.message || res?.error || 'Could not report for duty. Please try again.');
      }
    } catch (err: any) {
      console.error('Error reporting for duty:', err);
      setActionError(err?.message || 'Could not report for duty. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSignInRedirect = () => {
    // Preserve scanned location context so volunteer returns directly here after signing in
    safeStorage.setItem('koinonia_return_route', `/duty/location/${encodeURIComponent(token)}`);
    onNavigate('/volunteer/sign-in');
  };

  return (
    <div 
      className="min-h-screen bg-[#FAF9F6] text-[#18181B] flex flex-col justify-between p-4 sm:p-6" 
      data-view-version="location-scan-view-v2"
    >
      {/* Top Brand Bar */}
      <header className="w-full max-w-md mx-auto pt-4 pb-6 flex items-center justify-between">
        <div className="flex items-center">
          <BrandLogo context="compact" className="h-7 w-auto" />
        </div>
        <span className="text-[11px] font-sans font-medium uppercase tracking-wider text-[#A47E1F] bg-[#C59B27]/10 px-2.5 py-1 rounded-full">
          Event Duty
        </span>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-md mx-auto my-auto py-4">
        {loading ? (
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-8 text-center space-y-4 shadow-xs">
            <RefreshCw className="w-7 h-7 animate-spin mx-auto text-[#C59B27]" />
            <div className="space-y-1">
              <h2 className="text-base font-serif font-bold text-[#18181B]">
                Opening location…
              </h2>
              <p className="text-xs text-zinc-500 font-sans">
                Connecting to the event directory.
              </p>
            </div>
          </div>
        ) : scanState === 'code_inactive' ? (
          /* STATE: INVALID / EXPIRED / CLOSED QR */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 text-center shadow-xs animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-zinc-500" />
            </div>

            <div className="space-y-2">
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Location closed
              </h1>
              <p className="text-xs text-zinc-600 font-sans leading-relaxed">
                This location sign-in code is no longer active.
                <br />
                Please contact your team lead or a ministry administrator.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('/')}
                className="w-full py-3 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-sans font-medium text-xs rounded-xl transition-all cursor-pointer"
              >
                Return to home
              </button>
            </div>
          </div>
        ) : scanState === 'unauthenticated' ? (
          /* STATE: NOT SIGNED IN */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs animate-fade-in text-center">
            <div className="w-11 h-11 rounded-2xl bg-[#C59B27]/10 text-[#C59B27] flex items-center justify-center mx-auto">
              <MapPin className="w-5 h-5" />
            </div>

            <div className="space-y-1.5">
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {location?.name || 'Event Location'}
              </h1>
              {location?.ageGroupKey && (
                <p className="text-xs text-[#C59B27] font-sans font-medium">
                  {location.ageGroupKey}
                  {location.capacity ? ` · Capacity ${location.capacity}` : ''}
                </p>
              )}
              <p className="text-xs text-zinc-500 font-sans pt-1">
                Sign in to report for duty at this location.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleSignInRedirect}
                className="w-full py-3.5 px-4 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-sans font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-xs"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign in</span>
              </button>
            </div>
          </div>
        ) : scanState === 'assigned_here_present' ? (
          /* STATE: VOLUNTEER ON DUTY (JUST REPORTED OR DUPLICATE SCAN) */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 text-center shadow-xs animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>

            <div className="space-y-2">
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                You're on duty
              </h1>
              <p className="text-sm font-semibold text-zinc-800 font-sans">
                {location?.name}
              </p>
              {location?.ageGroupKey && (
                <p className="text-xs text-zinc-500 font-sans">
                  {location.ageGroupKey}
                </p>
              )}
              <p className="text-xs text-zinc-600 font-sans flex items-center justify-center space-x-1.5 pt-1">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Reported at {formatDisplayTime(presentSince)}</span>
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('/volunteer/event')}
                className="w-full py-3.5 px-4 bg-[#18181B] hover:bg-zinc-800 text-white font-sans font-medium text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>View duty details</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : scanState === 'assigned_here_not_present' ? (
          /* STATE: VOLUNTEER ASSIGNED TO THIS LOCATION, READY TO REPORT */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs animate-fade-in text-center">
            <div className="w-11 h-11 rounded-2xl bg-[#C59B27]/10 text-[#C59B27] flex items-center justify-center mx-auto">
              <MapPin className="w-5 h-5" />
            </div>

            <div className="space-y-1.5">
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {location?.name}
              </h1>
              {location?.ageGroupKey && (
                <p className="text-xs text-[#C59B27] font-sans font-medium">
                  {location.ageGroupKey}
                  {location.capacity ? ` · Capacity ${location.capacity}` : ''}
                </p>
              )}
              <p className="text-sm font-medium text-zinc-700 font-sans pt-1">
                You're assigned to this location.
              </p>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-sans text-left">
                {actionError}
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={handleReportForDuty}
                disabled={actionLoading}
                className="w-full py-3.5 px-4 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-sans font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-xs disabled:opacity-50"
              >
                {actionLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Report for duty</span>
              </button>
            </div>
          </div>
        ) : scanState === 'assigned_elsewhere' ? (
          /* STATE: VOLUNTEER ASSIGNED ELSEWHERE */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs animate-fade-in text-center">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <div className="space-y-3">
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Wrong location
              </h1>
              
              <div className="space-y-2 text-xs text-zinc-700 font-sans leading-relaxed">
                <p className="font-semibold text-stone-900 text-sm">
                  You're assigned to {assignedLocationName}.
                </p>
                <p className="text-zinc-600">
                  This QR code is for {location?.name}.
                </p>
                <p className="text-amber-800 font-medium">
                  You can only report for duty at your assigned location.
                </p>
              </div>

              <div className="pt-2 border-t border-zinc-100">
                <p className="text-xs text-zinc-400 font-sans">
                  Need to serve somewhere else? A location change must be approved.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('/volunteer/event')}
                className="w-full py-3.5 px-4 bg-[#18181B] hover:bg-zinc-800 text-white font-sans font-medium text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-xs"
              >
                <span>View my assignment</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* STATE: NO ASSIGNMENT */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs animate-fade-in text-center">
            <div className="w-11 h-11 rounded-2xl bg-zinc-100 text-zinc-600 flex items-center justify-center mx-auto">
              <MapPin className="w-5 h-5" />
            </div>

            <div className="space-y-2">
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                No assignment
              </h1>
              <p className="text-sm font-semibold text-stone-900 font-sans">
                You don't have a duty location assigned yet.
              </p>
              <p className="text-xs text-zinc-500 font-sans">
                This QR code is for {location?.name}. You can only report for duty at your assigned location.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('/volunteer/event')}
                className="w-full py-3.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-sans font-medium text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>Return to event duty</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer info */}
      <footer className="w-full max-w-md mx-auto pb-4 text-center">
        <p className="text-[11px] text-zinc-400 font-sans">
          The Koinonia General Assembly • Children &amp; Teens
        </p>
      </footer>
    </div>
  );
};

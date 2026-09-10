import React, { useState, useEffect } from 'react';
import { MapPin, CheckCircle2, AlertCircle, ArrowRight, LogIn, Clock, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
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
  | 'unassigned_can_join'
  | 'unassigned_cannot_join'
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
      } else if (res.state === 'unassigned_cannot_join') {
        setScanState('unassigned_cannot_join');
      } else {
        setScanState('unassigned_can_join');
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

  const handleConfirmPresence = async () => {
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
        setScanState('assigned_here_present');
        setPresentSince(res.presence?.startedAt || new Date().toISOString());
      } else {
        setActionError(res?.message || res?.error || 'Could not confirm presence. Please try again.');
      }
    } catch (err: any) {
      console.error('Error confirming location presence:', err);
      setActionError(err?.message || 'Could not confirm presence. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinLocation = async () => {
    return handleConfirmPresence();
  };

  const handleSignInRedirect = () => {
    // Store current route so volunteer returns directly here after signing in
    safeStorage.setItem('koinonia_return_route', `/duty/location/${encodeURIComponent(token)}`);
    onNavigate('/volunteer/sign-in');
  };

  return (
    <div 
      className="min-h-screen bg-[#FAF9F6] text-[#18181B] flex flex-col justify-between p-4 sm:p-6" 
      data-view-version="location-scan-view-v1"
    >
      {/* Top Brand Bar */}
      <header className="w-full max-w-md mx-auto pt-4 pb-6 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <BrandLogo className="h-7 w-7" />
          <span className="font-serif font-bold text-base tracking-tight text-[#18181B]">
            Koinonia
          </span>
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
          /* STATE F: INVALID / EXPIRED / DISABLED QR */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 text-center shadow-xs animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-zinc-500" />
            </div>

            <div className="space-y-2">
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Location code inactive
              </h1>
              <p className="text-xs text-zinc-600 font-sans leading-relaxed">
                This location code is no longer active.
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
          /* STATE E: NOT SIGNED IN */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs animate-fade-in">
            <div className="space-y-2 text-center">
              <div className="w-11 h-11 rounded-2xl bg-[#C59B27]/10 text-[#C59B27] flex items-center justify-center mx-auto mb-3">
                <MapPin className="w-5 h-5" />
              </div>
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {location?.name || 'Event Location'}
              </h1>
              {location?.ageGroupKey && (
                <p className="text-xs text-[#C59B27] font-sans font-medium">
                  {location.ageGroupKey}
                </p>
              )}
              <p className="text-xs text-zinc-500 font-sans pt-1">
                Sign in to continue.
              </p>
            </div>

            <div className="space-y-2 pt-2">
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
          /* STATE A (Confirmed): VOLUNTEER CHECKED IN FOR DUTY */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 text-center shadow-xs animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-3 py-1 rounded-full inline-block">
                You're checked in for duty
              </span>
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight pt-1"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {location?.name}
              </h1>
              {location?.ageGroupKey && (
                <p className="text-xs text-zinc-500 font-sans font-medium">
                  {location.ageGroupKey}
                </p>
              )}
              <p className="text-xs text-zinc-600 font-sans flex items-center justify-center space-x-1 pt-1">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Here since {formatDisplayTime(presentSince)}</span>
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('/volunteer/dashboard')}
                className="w-full py-3.5 px-4 bg-[#18181B] hover:bg-zinc-800 text-white font-sans font-medium text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>View Event Duty dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : scanState === 'assigned_here_not_present' ? (
          /* STATE A (Unconfirmed): VOLUNTEER ALREADY ASSIGNED TO THIS LOCATION */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-11 h-11 rounded-2xl bg-[#C59B27]/10 text-[#C59B27] flex items-center justify-center mx-auto mb-2">
                <MapPin className="w-5 h-5" />
              </div>
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {location?.name}
              </h1>
              {location?.ageGroupKey && (
                <p className="text-xs text-[#C59B27] font-sans font-medium">
                  {location.ageGroupKey}
                </p>
              )}
              <p className="text-xs text-zinc-600 font-sans pt-1">
                You're assigned here today.
              </p>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-sans">
                {actionError}
              </div>
            )}

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleConfirmPresence}
                disabled={actionLoading}
                className="w-full py-3.5 px-4 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-sans font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-xs disabled:opacity-50"
              >
                {actionLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Confirm I'm here</span>
              </button>
            </div>
          </div>
        ) : scanState === 'assigned_elsewhere' ? (
          /* STATE B: VOLUNTEER ASSIGNED ELSEWHERE */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs animate-fade-in">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <div className="space-y-3 text-center">
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Different location
              </h1>
              
              <div className="space-y-1.5 py-1">
                <p className="text-xs text-zinc-800 font-sans">
                  You're assigned to <strong className="font-semibold text-[#18181B]">{assignedLocationName}</strong>.
                </p>
                <p className="text-xs text-zinc-500 font-sans">
                  This code is for <span className="font-medium text-zinc-700">{location?.name}</span>.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('/volunteer/dashboard')}
                className="w-full py-3.5 px-4 bg-[#18181B] hover:bg-zinc-800 text-white font-sans font-medium text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-xs"
              >
                <span>View my assignment</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : scanState === 'unassigned_can_join' ? (
          /* STATE C: UNASSIGNED + SELF-SELECTION ALLOWED */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-11 h-11 rounded-2xl bg-[#C59B27]/10 text-[#C59B27] flex items-center justify-center mx-auto mb-2">
                <MapPin className="w-5 h-5" />
              </div>
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {location?.name}
              </h1>
              {location?.ageGroupKey && (
                <p className="text-xs text-[#C59B27] font-sans font-medium">
                  {location.ageGroupKey}
                </p>
              )}
              <p className="text-xs text-zinc-600 font-sans pt-1">
                Serve at this location?
              </p>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-sans">
                {actionError}
              </div>
            )}

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleJoinLocation}
                disabled={actionLoading}
                className="w-full py-3.5 px-4 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-sans font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-xs disabled:opacity-50"
              >
                {actionLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Join this location</span>
              </button>
            </div>
          </div>
        ) : (
          /* STATE D: UNASSIGNED + SELF-SELECTION NOT ALLOWED */
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-11 h-11 rounded-2xl bg-zinc-100 text-zinc-600 flex items-center justify-center mx-auto mb-2">
                <MapPin className="w-5 h-5" />
              </div>
              <h1 
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {location?.name}
              </h1>
              <div className="space-y-1.5 py-1">
                <p className="text-xs text-zinc-700 font-sans">
                  You haven't been assigned to a location yet.
                </p>
                <p className="text-xs text-zinc-500 font-sans">
                  Please contact your team lead.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('/volunteer/dashboard')}
                className="w-full py-3.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-sans font-medium text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>View Event Duty</span>
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

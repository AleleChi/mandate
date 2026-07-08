import React, { useState, useEffect, useRef } from 'react';
import { 
  LogOut, QrCode, Search, BarChart3, User, RefreshCw, AlertTriangle, 
  ShieldCheck, Check, Home, Camera, CameraOff, X, Phone, MessageCircle, 
  ArrowRight, Sparkles, UserCheck, UserX, Clock, ChevronLeft, Calendar, Heart, Info
} from 'lucide-react';
import { AppRoute } from '../types';
import { api, extractApiError } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { Button } from '../components/common/Button';
import { BrowserQRCodeReader } from '@zxing/browser';
import { VolunteerProfileView } from './volunteer/VolunteerProfileView';

interface VolunteerEventDashboardViewProps {
  onNavigate: (route: AppRoute) => void;
  volunteerProfile: any;
  onSignOut: () => void;
  isOffline?: boolean;
  hasParentProfile?: boolean;
  currentRoute?: string;
}

export const VolunteerEventDashboardView: React.FC<VolunteerEventDashboardViewProps> = ({
  onNavigate,
  volunteerProfile,
  onSignOut,
  isOffline = false,
  hasParentProfile = false,
  currentRoute = '/volunteer/event'
}) => {
  const { showSuccess, showWarning, showError } = useNotification();
  
  // Dashboard states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    expected: 0,
    checkedIn: 0,
    pickedUp: 0,
    attention: 0
  });
  const [eventDetails, setEventDetails] = useState<any>({
    title: 'The General Assembly',
    date: '18th to 22nd November 2026'
  });
  const [attentionItems, setAttentionItems] = useState<any[]>([]);

  // Scan screen states
  const [scanMode, setScanMode] = useState<'check_in' | 'check_out'>('check_in');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [manualCode, setManualCode] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [lastVerifiedChild, setLastVerifiedChild] = useState<any | null>(null);
  const [lookedUpChild, setLookedUpChild] = useState<any | null>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);

  // Check-in success states
  const [checkedInSuccessChild, setCheckedInSuccessChild] = useState<any | null>(null);
  const [checkedInSuccessEntry, setCheckedInSuccessEntry] = useState<any | null>(null);

  // Pickup tool states
  const [pickupCode, setPickupCode] = useState('');
  const [pickupLoading, setPickupLoading] = useState(false);
  const [pickupChild, setPickupChild] = useState<any | null>(null);
  const [pickupSuccessResult, setPickupSuccessResult] = useState<any | null>(null);
  const [pickupStats, setPickupStats] = useState({ inside: 0, pickedUp: 0, attention: 0 });
  const [pickupLastChild, setPickupLastChild] = useState<any | null>(null);

  // Children search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedChildForRelease, setSelectedChildForRelease] = useState<any | null>(null);

  // Child Profile & Directory States
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childProfileData, setChildProfileData] = useState<any | null>(null);
  const [childProfileLoading, setChildProfileLoading] = useState(false);
  const [activeDirectoryFilter, setActiveDirectoryFilter] = useState<string>('all');
  const [directoryChildren, setDirectoryChildren] = useState<any[]>([]);

  // Scanner refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<any>(null);

  // Reports states
  const [reportsData, setReportsData] = useState<any | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportNotes, setReportNotes] = useState('');

  const cleanRoute = currentRoute.split('?')[0];

  // Fetch standard dashboard data
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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch scan/checkout history
  const fetchHistory = async () => {
    try {
      const history = await api.volunteer.getCheckInHistory();
      if (history) {
        setRecentScans(history);
      }
    } catch (err) {
      console.error('Failed to fetch scan history:', err);
    }
  };

  // Fetch pickup home data
  const fetchPickupData = async (silent = false) => {
    if (!silent) setPickupLoading(true);
    try {
      const res = await api.volunteer.getPickupHome();
      if (res && res.success) {
        setPickupStats(res.stats || { inside: 0, pickedUp: 0, attention: 0 });
        if (res.lastChild) {
          setPickupLastChild(res.lastChild);
        }
      }
    } catch (err) {
      console.error('Failed to fetch pickup data:', err);
    } finally {
      setPickupLoading(false);
    }
  };

  // Fetch reports data
  const fetchReportsData = async (silent = false) => {
    if (!silent) setReportsLoading(true);
    try {
      const res = await api.volunteer.getReports();
      if (res && res.success) {
        setReportsData(res);
        if (res.stats) setStats(res.stats);
        if (res.finalReport && res.finalReport.notes) {
          setReportNotes(res.finalReport.notes);
        } else {
          setReportNotes('');
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setReportsLoading(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!reportNotes.trim()) {
      showWarning('Required', 'Please enter some notes for the final event report.');
      return;
    }
    setSubmittingReport(true);
    try {
      const res = await api.volunteer.submitFinalReport(reportNotes);
      if (res && res.success) {
        showSuccess('Submitted', 'The final event report has been successfully submitted and logged.');
        fetchReportsData(true); // reload report data silently
      } else {
        showError('Submission Failed', 'Could not submit report at this moment.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Submission Error', apiErr.message || 'Error submitting report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Run on mount or route transition
  useEffect(() => {
    if (cleanRoute === '/volunteer/pickup') {
      fetchPickupData();
    } else if (cleanRoute === '/volunteer/reports') {
      fetchReportsData();
    } else {
      fetchDashboardData();
      fetchHistory();
    }
  }, [cleanRoute]);

  // Handle auto-clearing selected child when navigating away from children route
  useEffect(() => {
    if (cleanRoute !== '/volunteer/children') {
      setSelectedChildId(null);
    }
  }, [cleanRoute]);

  // Fetch directory children list based on search query and status filter
  const fetchChildrenDirectory = async () => {
    setSearching(true);
    try {
      const results = await api.volunteer.getChildren({
        q: searchQuery.trim(),
        status: activeDirectoryFilter
      });
      setDirectoryChildren(results || []);
    } catch (err: any) {
      console.error('Failed to fetch children directory:', err);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (cleanRoute === '/volunteer/children') {
      fetchChildrenDirectory();
    }
  }, [cleanRoute, activeDirectoryFilter]);

  // Load detailed child profile
  useEffect(() => {
    const fetchChildProfile = async () => {
      if (!selectedChildId) {
        setChildProfileData(null);
        return;
      }
      setChildProfileLoading(true);
      try {
        const res = await api.volunteer.getChildProfile(selectedChildId);
        if (res && res.success) {
          setChildProfileData(res);
        } else {
          showError('Load Failed', 'Failed to retrieve child profile details.');
        }
      } catch (err: any) {
        const apiErr = extractApiError(err);
        showError('Load Error', apiErr.message || 'Error fetching child profile.');
      } finally {
        setChildProfileLoading(false);
      }
    };
    fetchChildProfile();
  }, [selectedChildId]);

  // Prepare and initiate pickup check-out flow
  const handlePreparePickup = async (childId: string) => {
    setPickupLoading(true);
    try {
      const res = await api.volunteer.preparePickup(childId);
      if (res && res.success && res.child) {
        setPickupChild(res.child);
        onNavigate('/volunteer/pickup');
        showSuccess('Pickup Prepared', `Successfully verified authorized pickup person for ${res.child.fullName}.`);
      } else {
        showError('Pickup Action Denied', 'Unable to initiate pickup workflow.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Pickup Failed', apiErr.message || 'Error preparing child for pickup.');
    } finally {
      setPickupLoading(false);
    }
  };

  // Handle ZXing Camera Activation & Scanner Stream
  useEffect(() => {
    if (cleanRoute === '/volunteer/scan' && cameraActive) {
      startScanning();
    } else {
      stopScanning();
    }

    return () => {
      stopScanning();
    };
  }, [cleanRoute, cameraActive, selectedCameraId]);

  const startScanning = async () => {
    try {
      if (!codeReaderRef.current) {
        codeReaderRef.current = new BrowserQRCodeReader();
      }

      // List video inputs
      const devices = await BrowserQRCodeReader.listVideoInputDevices();
      setCameras(devices);

      if (devices.length > 0) {
        const deviceId = selectedCameraId || devices[0].deviceId;
        if (!selectedCameraId) {
          setSelectedCameraId(deviceId);
        }

        if (videoRef.current) {
          // Clean any prior controls
          if (controlsRef.current) {
            controlsRef.current.stop();
          }

          const controls = await codeReaderRef.current.decodeFromVideoDevice(
            deviceId,
            videoRef.current,
            (result, error) => {
              if (result) {
                const text = result.getText();
                handlePassScanned(text);
              }
            }
          );
          controlsRef.current = controls;
        }
      } else {
        showError('No Cameras Found', 'Please connect a camera or enter the pass reference code manually.');
        setCameraActive(false);
      }
    } catch (err) {
      console.error('ZXing QR reader initialization error:', err);
      showError('Camera Error', 'Could not open camera. Please grant camera permission.');
      setCameraActive(false);
    }
  };

  const stopScanning = () => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
  };

  // Process QR Scans or Manual Input
  const handlePassScanned = async (text: string) => {
    if (scanLoading) return;
    setScanLoading(true);
    
    // Stop scanning temporarily on success to prevent multi-scans
    stopScanning();

    try {
      const res = await api.volunteer.lookupPass({ passReference: text });
      
      if (res.success && res.child) {
        setLookedUpChild(res.child);
        showSuccess(
          'Child Found',
          `Pass verified for ${res.child.fullName}. Please confirm below.`
        );
        
        // Haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate([100]);
        }

        // Reset inputs
        setManualCode('');
      } else {
        showError('Not Found', 'Could not retrieve child details for this pass.');
        if (cameraActive) {
          startScanning();
        }
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Pass Error', apiErr.message || 'Pass verification failed.');
      // Restart scanning if error
      if (cameraActive) {
        startScanning();
      }
    } finally {
      setScanLoading(false);
    }
  };

  const handleManualVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      showWarning('Input required', 'Please enter a valid pass reference code.');
      return;
    }
    await handlePassScanned(manualCode.trim());
  };

  // Execute Search for Children
  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      showWarning('Query required', 'Please type a child or parent name.');
      return;
    }

    setSearching(true);
    try {
      const results = await api.volunteer.searchChildren(searchQuery.trim());
      setSearchResults(results || []);
      if (results && results.length === 0) {
        showWarning('No match found', 'We could not find any registered child or parent with that name.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Search Failed', apiErr.message);
    } finally {
      setSearching(false);
    }
  };

  // Check in directly from children search view (with lookup and transition)
  const handleCheckInDirectly = async (child: any) => {
    setScanLoading(true);
    try {
      const res = await api.volunteer.lookupPass({ childId: child.childId });
      if (res.success && res.child) {
        setLookedUpChild(res.child);
        setScanMode('check_in');
        onNavigate('/volunteer/scan');
        showSuccess('Child Found', `Retrieved details for ${res.child.fullName}. Please confirm check-in.`);
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Check-In Lookup Failed', apiErr.message);
    } finally {
      setScanLoading(false);
    }
  };

  // Trigger release lookup for direct checkout from children list
  const handleCheckOutDirectly = async (child: any) => {
    setScanLoading(true);
    try {
      const res = await api.volunteer.lookupPass({ childId: child.childId });
      if (res.success && res.child) {
        setLookedUpChild(res.child);
        setScanMode('check_out');
        onNavigate('/volunteer/scan');
        showSuccess('Child Found', `Retrieved details for ${res.child.fullName}. Please match photo card.`);
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Checkout Lookup Failed', apiErr.message);
    } finally {
      setScanLoading(false);
    }
  };

  // Confirm and perform Check-in
  const handleConfirmCheckIn = async (child: any) => {
    setScanLoading(true);
    try {
      const res = await api.volunteer.checkIn({ childEventEntryId: child.entryId || child.id });
      if (res.success) {
        showSuccess('Check-In Successful', `${child.fullName || (res.child && res.child.fullName)} is now checked in.`);
        
        setCheckedInSuccessChild(res.child || {
          id: child.id,
          fullName: child.fullName || child.childName,
          firstName: (child.fullName || child.childName || '').split(' ')[0],
          classGroup: child.ageGroup || 'General',
          entryStatus: 'checked_in',
          medicalNote: child.medicalNotes || '',
          allergies: child.hasMedicalNotes ? 'Yes' : 'No',
          extraSupport: child.needsExtraSupport ? 'Yes' : 'No',
          authorizedPickup: child.pickup ? [child.pickup] : []
        });

        setCheckedInSuccessEntry(res.entry || {
          checkedInAt: res.child?.checkedInAt || new Date().toISOString(),
          checkedInBy: res.entry?.checkedInBy || { fullName: volunteerProfile?.full_name || 'Volunteer' },
          point: 'Entrance A'
        });

        if (res.stats) {
          setStats({
            expected: res.stats.expected,
            checkedIn: res.stats.checkedIn,
            pickedUp: stats.pickedUp,
            attention: stats.attention
          });
        }

        setLookedUpChild(null);
        
        // Haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }

        // Refresh everything
        fetchDashboardData(true);
        fetchHistory();
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Check-In Failed', apiErr.message);
    } finally {
      setScanLoading(false);
    }
  };

  // Confirm and perform release of child
  const handleConfirmRelease = async (child: any) => {
    setScanLoading(true);
    try {
      const res = await api.volunteer.checkOut({ childEventEntryId: child.entryId || child.id || child.childEventEntryId });
      if (res.success) {
        showSuccess('Child Released', `${child.fullName || child.childName} successfully checked out.`);
        setLookedUpChild(null);
        setLastVerifiedChild(null);
        
        // Haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }

        // Refresh everything
        fetchDashboardData(true);
        handleSearchSubmit();
        fetchHistory();
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Release Failed', apiErr.message);
    } finally {
      setScanLoading(false);
    }
  };

  // Submit manual code or handle scanner results for pickup
  const handlePickupLookup = async (code: string) => {
    if (!code || !code.trim()) return;
    setPickupLoading(true);
    try {
      const res = await api.volunteer.lookupPickup({ passCode: code.trim().toUpperCase() });
      if (res && res.success && res.child) {
        setPickupChild(res.child);
        showSuccess('Child Found', `Retrieved details for ${res.child.fullName}. Please verify pickup person.`);
      } else {
        showError('Not Found', 'No active checked-in child found for this pass code.');
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Lookup Failed', apiErr.message || 'Pass code verification failed. Ensure child is checked in.');
    } finally {
      setPickupLoading(false);
    }
  };

  const handleConfirmPickupRelease = async (child: any, pickupPersonId?: string) => {
    setPickupLoading(true);
    try {
      const pPersonId = pickupPersonId || (child.authorizedPickup && child.authorizedPickup[0]?.id) || (child.pickup?.id);
      const res = await api.volunteer.markChildPickedUp({
        childId: child.id || child.childId,
        pickupPersonId: pPersonId
      });
      if (res && res.success) {
        setPickupSuccessResult(res);
        showSuccess('Pickup Confirmed', `${res.child?.fullName || child.fullName} has been successfully released.`);
        
        // Refresh pickup home data
        fetchPickupData(true);
        // Clear active child lookup
        setPickupChild(null);
        setPickupCode('');
        
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
      }
    } catch (err: any) {
      const apiErr = extractApiError(err);
      showError('Release Failed', apiErr.message || 'Failed to record child release.');
    } finally {
      setPickupLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData(true);
    await fetchHistory();
    showSuccess('Refreshed successfully', 'Latest live statistics and logs retrieved.');
  };

  const handleResolveAction = (item: any) => {
    showSuccess(
      'Action Triggered',
      `Opening search card for ${item.child_name || 'child'}...`
    );
    setSearchQuery(item.child_name || '');
    onNavigate('/volunteer/children');
  };

  const fullName = volunteerProfile?.full_name || 'Volunteer';
  const teamName = volunteerProfile?.preferred_team || 'General Team';

  return (
    <div className="min-h-screen bg-[#FAF9F6] font-sans flex flex-col pb-24">
      {/* Top Header Bar */}
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

      {/* Main Container */}
      <main className="max-w-4xl w-full mx-auto px-4 pt-6 space-y-6 flex-1">
        
        {/* Offline Notice */}
        {isOffline && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start space-x-3 text-amber-800 animate-pulse">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
            <div className="space-y-0.5">
              <h3 className="text-xs font-bold">Offline Operating Mode</h3>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Scan data is saved locally. Scans will sync automatically once internet access is restored.
              </p>
            </div>
          </div>
        )}

        {/* Dynamic Route Content Router */}
        {cleanRoute === '/volunteer/event' && (
          /* ==================== 1. EVENT TOOLS / METRICS VIEW ==================== */
          <div className="space-y-6">
            {/* Event Header Card */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm gap-4">
              <div className="space-y-1">
                <p className="text-xs font-mono font-bold text-[#C59B27] tracking-wider uppercase">Active Event</p>
                <h2 className="text-xl font-bold font-serif text-[#18181B] tracking-tight">
                  {eventDetails.title || 'The General Assembly'}
                </h2>
                <p className="text-xs text-gray-400">Date: {eventDetails.date || '18th to 22nd November 2026'}</p>
              </div>
              <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase leading-tight">Identity Status</p>
                  <h3 className="text-xs font-bold text-gray-800">{fullName}</h3>
                  <p className="text-[10px] text-emerald-600 font-medium">Verified Event Worker</p>
                </div>
              </div>
            </div>

            {/* Metrics Dashboard Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

            {/* Attention Required Items */}
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
                    No active children logs require emergency review or support.
                  </p>
                </div>
              )}

              {attentionItems.length > 0 && (
                <div className="space-y-3">
                  {attentionItems.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="bg-white border border-[#EAE8E1] hover:border-[#C59B27]/40 rounded-2xl p-4 flex items-center justify-between transition-all"
                    >
                      <div className="space-y-1">
                        <span className="inline-block px-2 py-0.5 rounded-lg border text-[9px] font-bold bg-rose-50 text-rose-700 border-rose-100">
                          {item.issue_type || 'Unresolved issue'}
                        </span>
                        <h3 className="text-sm font-bold text-gray-800">{item.child_name}</h3>
                        <p className="text-[10px] text-gray-400">Child Code: #{item.child_id}</p>
                      </div>

                      <button
                        onClick={() => handleResolveAction(item)}
                        className="h-9 px-4 bg-[#18181B] hover:bg-gray-800 text-white font-bold text-xs tracking-wide rounded-xl transition-colors flex items-center justify-center cursor-pointer"
                      >
                        {item.action_text || 'RESOLVE'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Direct Navigation Quick links */}
            <div className="space-y-3 pt-2">
              <h2 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase px-1">
                QUICK ACCESS PANEL
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => onNavigate('/volunteer/scan')}
                  className="bg-white border border-[#EAE8E1] hover:border-[#C59B27]/30 p-5 rounded-3xl text-left flex items-start space-x-4 shadow-xs group cursor-pointer transition-all"
                >
                  <div className="w-12 h-12 bg-gray-50 group-hover:bg-[#C59B27]/10 text-gray-600 group-hover:text-[#C59B27] rounded-2xl flex items-center justify-center shrink-0 transition-all">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 flex items-center">
                      Launch QR Scanner <ArrowRight className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Physical gate scan-in or entry release.</p>
                  </div>
                </button>

                <button
                  onClick={() => onNavigate('/volunteer/pickup')}
                  className="bg-white border border-[#EAE8E1] hover:border-[#C59B27]/30 p-5 rounded-3xl text-left flex items-start space-x-4 shadow-xs group cursor-pointer transition-all"
                >
                  <div className="w-12 h-12 bg-gray-50 group-hover:bg-[#C59B27]/10 text-gray-600 group-hover:text-[#C59B27] rounded-2xl flex items-center justify-center shrink-0 transition-all">
                    <UserCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 flex items-center">
                      Child Pickup Tool <ArrowRight className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Verify authorized guardians & exit release child.</p>
                  </div>
                </button>

                <button
                  onClick={() => onNavigate('/volunteer/children')}
                  className="bg-white border border-[#EAE8E1] hover:border-[#C59B27]/30 p-5 rounded-3xl text-left flex items-start space-x-4 shadow-xs group cursor-pointer transition-all"
                >
                  <div className="w-12 h-12 bg-gray-50 group-hover:bg-[#C59B27]/10 text-gray-600 group-hover:text-[#C59B27] rounded-2xl flex items-center justify-center shrink-0 transition-all">
                    <Search className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 flex items-center">
                      Children Directory <ArrowRight className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Manual search by parent phone, name & status lookup.</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {cleanRoute === '/volunteer/scan' && (
          checkedInSuccessChild ? (
            /* ==================== 2.6 CHECK-IN SUCCESS SCREEN (Request 3) ==================== */
            <div className="space-y-6 animate-fade-in" data-view-version="1.0" data-component-version="check-in-success">
              {/* Header Badge */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-8 text-center space-y-4 shadow-sm">
                <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 shadow-inner border border-emerald-100">
                  <Check className="h-8 w-8 stroke-[3]" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold text-gray-900 font-serif tracking-tight">Check-in successful</h2>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Child is cleared for entry and class placement.
                  </p>
                </div>
              </div>

              {/* Child Details Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
                  {checkedInSuccessChild.photoUrl ? (
                    <img
                      src={checkedInSuccessChild.photoUrl}
                      alt={checkedInSuccessChild.fullName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User className="h-8 w-8 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-gray-900 leading-tight truncate">
                    {checkedInSuccessChild.fullName}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 font-mono font-bold uppercase tracking-wider">
                    {checkedInSuccessChild.classGroup || 'Creche'} &bull; AGE: {checkedInSuccessChild.age || 4}
                  </p>
                </div>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 text-[11px] font-bold rounded-xl shrink-0 uppercase tracking-wider font-mono">
                  Checked In
                </span>
              </div>

              {/* Check-In Details / Info Box */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm space-y-4">
                <h4 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                  Check-In Info
                </h4>
                <div className="space-y-3.5 text-xs">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-400 font-medium">Checked-in At</span>
                    <span className="font-bold text-gray-800 font-mono">
                      {new Date(checkedInSuccessEntry?.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-400 font-medium">Checked-in By</span>
                    <span className="font-bold text-gray-800">
                      {checkedInSuccessEntry?.checkedInBy?.fullName || 'Event Worker'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-400 font-medium">Entrance Gate / Point</span>
                    <span className="font-bold text-gray-800 uppercase font-mono">
                      {checkedInSuccessEntry?.point || 'Entrance A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats Summary Panel */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
                  <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider block">EXPECTED</span>
                  <span className="text-lg font-bold text-gray-700 block mt-1">{stats.expected}</span>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 text-center">
                  <span className="text-[9px] font-mono font-bold text-emerald-700 uppercase tracking-wider block">INSIDE</span>
                  <span className="text-lg font-bold text-emerald-800 block mt-1">{stats.checkedIn}</span>
                </div>
                <div className="bg-amber-50/40 border border-amber-100 rounded-2xl p-4 text-center">
                  <span className="text-[9px] font-mono font-bold text-amber-700 uppercase tracking-wider block">WAITING</span>
                  <span className="text-lg font-bold text-amber-800 block mt-1">{Math.max(0, stats.expected - stats.checkedIn)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-3 pt-3">
                <button
                  onClick={() => {
                    setCheckedInSuccessChild(null);
                    setCheckedInSuccessEntry(null);
                    if (cameraActive) {
                      startScanning();
                    }
                  }}
                  className="w-full bg-neutral-900 hover:bg-neutral-800 text-white font-bold tracking-widest py-4 rounded-2xl text-sm transition-all shadow-md uppercase cursor-pointer"
                >
                  SCAN ANOTHER PASS
                </button>
                <button
                  onClick={() => {
                    setCheckedInSuccessChild(null);
                    setCheckedInSuccessEntry(null);
                    onNavigate('/volunteer/event');
                  }}
                  className="w-full border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-bold tracking-widest py-3.5 rounded-2xl text-sm transition-all uppercase text-center cursor-pointer block bg-white"
                >
                  BACK TO TOOLS
                </button>
              </div>
            </div>
          ) : lookedUpChild ? (
            /* ==================== 2.5 CHILD FOUND SCREEN (State 2) ==================== */
            <div className="space-y-6" data-view-version="1.0" data-component-version="child-found-view">
              
              {/* Back / Navigation Bar */}
              <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-4">
                <div className="flex items-center space-x-3">
                  <h2 className="text-2xl font-bold text-gray-900 leading-tight tracking-tight font-serif">Child found</h2>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-0.5 text-xs font-bold rounded-full">
                    Pass Ready
                  </span>
                </div>
                <button
                  onClick={() => {
                    setLookedUpChild(null);
                    if (cameraActive) {
                      startScanning();
                    }
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 cursor-pointer transition-colors"
                  title="Close and scan another"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Child Profile Details Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row items-center sm:items-start gap-5">
                <div className="w-20 h-20 rounded-full overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0 shadow-inner">
                  {lookedUpChild.photoUrl ? (
                    <img
                      src={lookedUpChild.photoUrl}
                      alt={lookedUpChild.fullName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User className="h-10 w-10 text-gray-300" />
                  )}
                </div>
                <div className="text-center sm:text-left space-y-3 flex-1 min-w-0">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">
                      {lookedUpChild.fullName}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1 font-mono font-bold uppercase tracking-wider">
                      {lookedUpChild.ageGroup || 'Creche'} &bull; {lookedUpChild.gender} &bull; DOB: {lookedUpChild.dateOfBirth || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100 text-xs inline-block text-left w-full max-w-sm">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block leading-none">Parent / Guardian</span>
                    <p className="font-bold text-gray-800 mt-2 text-sm">{lookedUpChild.parentName}</p>
                    <p className="text-gray-500 mt-1 flex items-center space-x-1.5">
                      <span>{lookedUpChild.parentPhone}</span>
                      {lookedUpChild.parentWhatsapp && (
                        <span className="text-emerald-600 font-medium">&bull; WhatsApp Registered</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Care Notes Card (Yellow/Red Alert Box if notes exist) */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs space-y-3">
                <h4 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                  Care Notes & Medical
                </h4>
                {lookedUpChild.hasMedicalNotes || lookedUpChild.needsExtraSupport ? (
                  <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-start space-x-3 text-xs text-rose-950">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
                    <div className="space-y-1">
                      <h5 className="font-bold text-rose-800">Allergies / Medical / Support Needs</h5>
                      <p className="text-[11px] text-rose-700 leading-relaxed">
                        {lookedUpChild.medicalNotes || lookedUpChild.supportNotes || 'Requires emergency attention or extra support.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-start space-x-3 text-xs text-gray-500">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                    <div className="space-y-0.5">
                      <h5 className="font-bold text-gray-700">No care conditions</h5>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        No allergies, medical needs, or extra physical support alerts registered for this child.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Entry Registration / Attendance Status Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs space-y-4">
                <h4 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                  Entry Status & Class Room
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block leading-none">Registration Status</span>
                    <span className="inline-block mt-2.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border bg-amber-50 text-amber-700 border-amber-200 capitalize">
                      {lookedUpChild.entryStatus ? lookedUpChild.entryStatus.replace('_', ' ') : 'Ready'}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block leading-none">School Name</span>
                    <span className="font-bold text-gray-800 block mt-2.5 truncate">
                      {lookedUpChild.schoolName || 'N/A'}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 sm:col-span-2">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block leading-none">Class Room Assignment</span>
                    <span className="font-bold text-gray-800 block mt-2 text-sm">
                      {lookedUpChild.schoolClass || 'General Assembly Room'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Authorized Pickup Card */}
              {lookedUpChild.pickup ? (
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs space-y-4">
                  <h4 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                    Authorized Pickup Person
                  </h4>
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-50 border border-gray-200 shrink-0 flex items-center justify-center">
                        {lookedUpChild.pickup.photoUrl ? (
                          <img
                            src={lookedUpChild.pickup.photoUrl}
                            alt={lookedUpChild.pickup.fullName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User className="h-6 w-6 text-gray-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-gray-900 leading-tight truncate">
                          {lookedUpChild.pickup.fullName}
                        </h4>
                        <p className="text-[11px] text-[#C59B27] font-semibold mt-0.5 font-mono uppercase tracking-wider">
                          {lookedUpChild.pickup.relationship || 'Parent'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      <a
                        href={`tel:${lookedUpChild.pickup.phone}`}
                        className="p-2 bg-gray-50 border border-gray-200 hover:border-[#C59B27] text-gray-600 hover:text-[#C59B27] rounded-xl transition-all shadow-xs"
                        title="Call pickup person"
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                      {lookedUpChild.pickup.whatsapp && (
                        <a
                          href={`https://wa.me/${lookedUpChild.pickup.whatsapp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 bg-gray-50 border border-gray-200 hover:border-emerald-500 text-gray-600 hover:text-emerald-500 rounded-xl transition-all shadow-xs"
                          title="WhatsApp pickup person"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-4 flex items-start space-x-3 text-amber-850">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
                    <div className="space-y-0.5">
                      <h5 className="font-bold text-amber-850 text-xs">Security Verification Check</h5>
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        Ensure the physical person picking up the child strictly matches the details and face photo listed above.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs space-y-3">
                  <h4 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                    Authorized Pickup Person
                  </h4>
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-start space-x-3 text-xs text-gray-500">
                    <User className="h-5 w-5 shrink-0 text-gray-400 mt-0.5" />
                    <div className="space-y-0.5">
                      <h5 className="font-bold text-gray-700">Self Pickup / Default Parent Only</h5>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        No secondary pickup person was assigned. The child is authorized to be released to their primary parent ({lookedUpChild.parentName}).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons (CTAs) */}
              <div className="space-y-3 pt-3">
                <button
                  onClick={() => {
                    if (scanMode === 'check_in') {
                      handleConfirmCheckIn(lookedUpChild);
                    } else {
                      handleConfirmRelease(lookedUpChild);
                    }
                  }}
                  disabled={scanLoading}
                  className="w-full bg-neutral-900 text-white font-bold tracking-widest py-4 rounded-2xl text-sm transition-all shadow-md uppercase hover:bg-neutral-800 disabled:bg-gray-200 disabled:text-gray-400 cursor-pointer flex items-center justify-center space-x-2"
                >
                  {scanLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Check className="h-4 w-4 stroke-[3]" />
                      <span>{scanMode === 'check_in' ? 'MARK CHECKED IN' : 'CONFIRM RELEASE'}</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setLookedUpChild(null);
                    if (cameraActive) {
                      startScanning();
                    }
                  }}
                  className="w-full border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-bold tracking-widest py-3.5 rounded-2xl text-sm transition-all uppercase text-center cursor-pointer block bg-white hover:bg-gray-50"
                >
                  SCAN ANOTHER PASS
                </button>
              </div>
            </div>
          ) : (
            /* ==================== 2. SCANNER VIEW (Screenshot A & B) ==================== */
            <div className="space-y-6">
              
              {/* Mode Switch and Active Cam Info */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 font-serif">QR Gate Scanner</h2>
                    <p className="text-[10px] text-gray-400 font-mono font-bold uppercase tracking-wider">
                      {scanMode === 'check_in' ? 'CHECK-IN ENTRANCE' : 'PICKUP RELEASE EXIT'}
                    </p>
                  </div>
                  
                  {/* Mode toggle */}
                  <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                    <button
                      onClick={() => setScanMode('check_in')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${scanMode === 'check_in' ? 'bg-[#18181B] text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Check-In
                    </button>
                    <button
                      onClick={() => setScanMode('check_out')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${scanMode === 'check_out' ? 'bg-[#C59B27] text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Check-Out
                    </button>
                  </div>
                </div>

                {/* Camera selection dropdown if multiple cameras exist */}
                {cameraActive && cameras.length > 1 && (
                  <div className="flex items-center justify-between gap-4 bg-gray-50 p-2.5 rounded-2xl border border-gray-100">
                    <span className="text-xs font-semibold text-gray-500">Camera Source:</span>
                    <select
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                      className="text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl px-2 py-1 outline-none focus:border-[#C59B27]"
                    >
                      {cameras.map((cam, i) => (
                        <option key={cam.deviceId} value={cam.deviceId}>
                          {cam.label || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Custom Camera Viewport (Matches Screenshot A Viewfinder) */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden shadow-sm relative">
                
                <div className="aspect-video bg-neutral-900 relative flex items-center justify-center overflow-hidden">
                  {cameraActive ? (
                    <>
                      <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                      />
                      
                      {/* Golden overlay frame animation */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-52 h-52 border-2 border-dashed border-white/30 rounded-2xl relative flex items-center justify-center">
                          {/* Antique Gold corner highlights */}
                          <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-[#C59B27] rounded-tl-lg"></div>
                          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-[#C59B27] rounded-tr-lg"></div>
                          <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-[#C59B27] rounded-bl-lg"></div>
                          <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-[#C59B27] rounded-br-lg"></div>
                          
                          {/* Scanning Sweep line animation */}
                          <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-[#C59B27] to-transparent top-0 animate-bounce"></div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-8 space-y-4">
                      <div className="w-16 h-16 bg-neutral-800 text-neutral-400 rounded-full flex items-center justify-center mx-auto border border-neutral-700">
                        <CameraOff className="h-7 w-7" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-neutral-200">Camera Feed Suspended</h3>
                        <p className="text-xs text-neutral-500 max-w-xs mx-auto mt-1">
                          Turn on the camera to scan parent entry QR passes automatically.
                        </p>
                      </div>
                      <button
                        onClick={() => setCameraActive(true)}
                        className="h-9 px-4 bg-[#C59B27] text-white hover:bg-[#A47E1F] font-bold text-xs tracking-wide rounded-xl cursor-pointer transition-colors inline-flex items-center space-x-1.5"
                      >
                        <Camera className="h-4 w-4" />
                        <span>Start Camera</span>
                      </button>
                    </div>
                  )}

                  {/* Top status bar overlay */}
                  {cameraActive && (
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                      <span className="px-2.5 py-1 bg-emerald-600 text-white font-mono font-bold text-[9px] rounded-full uppercase tracking-wider flex items-center space-x-1 shadow-sm">
                        <span>Scanner Active</span>
                      </span>
                      <button
                        onClick={() => setCameraActive(false)}
                        className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Manual Pass Code Entry Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-gray-900">Manual Entry Pass Code</h3>
                  <p className="text-xs text-gray-400">
                    Enter the 6-character pass reference code printed on the parent’s card (e.g. KOI-2026-6E80A7)
                  </p>
                </div>

                <form onSubmit={handleManualVerifySubmit} className="flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                      placeholder="e.g. 6E80A7"
                      disabled={scanLoading}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold tracking-widest placeholder:tracking-normal outline-none focus:border-[#C59B27] focus:bg-white transition-all disabled:opacity-60"
                    />
                    {manualCode && (
                      <button
                        type="button"
                        onClick={() => setManualCode('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={scanLoading || !manualCode}
                    className="px-5 bg-[#18181B] hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs tracking-wide rounded-xl transition-all cursor-pointer flex items-center justify-center font-mono uppercase"
                  >
                    {scanLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <span>Verify Pass</span>
                    )}
                  </button>
                </form>
              </div>

              {/* Real-Time Scan History stream (Screenshot B Section) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                    RECENT ACTIVITY LOG
                  </h2>
                  <span className="text-[10px] text-gray-400 font-medium">Real-time gate updates</span>
                </div>

                {recentScans.length === 0 && (
                  <div className="bg-white border border-[#EAE8E1] rounded-3xl p-8 text-center text-gray-500 text-xs">
                    No scan logs found. Start checking children in to populate history logs.
                  </div>
                )}

                {recentScans.length > 0 && (
                  <div className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden divide-y divide-gray-100 shadow-sm">
                    {recentScans.slice(0, 10).map((log, index) => {
                      const isCheckIn = log.status === 'checked_in' || log.status === 'inside';
                      return (
                        <div
                          key={log.childId + '-' + index}
                          className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 border border-gray-200/80 flex items-center justify-center shrink-0">
                              {log.photoUrl ? (
                                <img
                                  src={log.photoUrl}
                                  alt={log.childName}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <User className="h-5 w-5 text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold text-gray-800 truncate">{log.childName}</h4>
                              <p className="text-[10px] text-gray-400">{log.ageGroup || 'Creche'}</p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3 shrink-0">
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border ${isCheckIn ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              {isCheckIn ? 'Checked-In' : 'Released'}
                            </span>
                            <span className="text-[9px] font-mono font-bold text-gray-400 flex items-center space-x-0.5">
                              <Clock className="h-3 w-3" />
                              <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {cleanRoute === '/volunteer/pickup' && (
          /* ==================== 2.7 CHILD PICKUP & RELEASE VIEW (Request 4) ==================== */
          pickupSuccessResult ? (
            /* ==================== PICKUP SUCCESS SCREEN ==================== */
            <div className="space-y-6 animate-fade-in pb-12" data-view-version="volunteer-pickup-success-stitch-v1" data-component-version="pickup-success">
              {/* Header Success Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-8 text-center space-y-4 shadow-xs">
                <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 shadow-xs border border-emerald-100">
                  <Check className="h-8 w-8 stroke-[3]" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-3xl font-extrabold text-neutral-950 font-serif tracking-tight">Picked up</h2>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    {pickupSuccessResult.child?.firstName || pickupSuccessResult.child?.fullName?.split(' ')[0] || 'This child'} has been released to the approved pickup person.
                  </p>
                </div>
              </div>

              {/* Child Details Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
                  {pickupSuccessResult.child?.photoUrl ? (
                    <img
                      src={pickupSuccessResult.child.photoUrl}
                      alt={pickupSuccessResult.child.fullName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User className="h-8 w-8 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-gray-900 leading-tight truncate">
                    {pickupSuccessResult.child?.fullName}
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 font-semibold">
                    {pickupSuccessResult.child?.age} years old • {pickupSuccessResult.child?.classGroup}
                  </p>
                </div>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 text-[11px] font-bold rounded-xl shrink-0 uppercase tracking-wider font-mono">
                  Released
                </span>
              </div>

              {/* Pickup details Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs space-y-4">
                <h4 className="text-sm font-bold text-[#C59B27] font-serif uppercase tracking-wider">
                  Pickup details
                </h4>
                
                <div className="space-y-3.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-gray-50">
                    <span className="text-gray-400 font-medium">Picked up at</span>
                    <span className="font-bold text-gray-800 font-mono">
                      {pickupSuccessResult.pickup?.pickedUpAt ? new Date(pickupSuccessResult.pickup.pickedUpAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-50">
                    <span className="text-gray-400 font-medium">Picked up by</span>
                    <span className="font-bold text-gray-800">
                      {pickupSuccessResult.pickup?.pickedUpBy?.fullName || 'Approved Pickup Person'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-50">
                    <span className="text-gray-400 font-medium">Relationship</span>
                    <span className="font-bold text-gray-800">
                      {pickupSuccessResult.pickup?.pickedUpBy?.relationship || 'Parent'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-50">
                    <span className="text-gray-400 font-medium">Confirmed by</span>
                    <span className="font-bold text-gray-800">
                      {pickupSuccessResult.pickup?.confirmedBy?.fullName || volunteerProfile?.full_name || 'Event Worker'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-gray-400 font-medium">Pickup point</span>
                    <span className="font-bold text-[#C59B27] font-mono">
                      {pickupSuccessResult.pickup?.point || 'Main exit'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Checked Before Release Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs space-y-4">
                <h4 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                  Checked before release
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  {/* Child Photo Box */}
                  <div className="relative aspect-square w-full rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 flex flex-col justify-between">
                    {pickupSuccessResult.child?.photoUrl ? (
                      <img
                        src={pickupSuccessResult.child.photoUrl}
                        alt="Child"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <User className="h-10 w-10 text-gray-300" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-neutral-900/60 text-white text-[10px] font-bold text-center py-1.5 uppercase tracking-wider leading-none">
                      Child
                    </div>
                  </div>

                  {/* Pickup Person Photo Box */}
                  <div className="relative aspect-square w-full rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 flex flex-col justify-between">
                    {pickupSuccessResult.pickup?.pickedUpBy?.photoUrl ? (
                      <img
                        src={pickupSuccessResult.pickup.pickedUpBy.photoUrl}
                        alt="Pickup Person"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <User className="h-10 w-10 text-gray-300" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-neutral-900/60 text-white text-[10px] font-bold text-center py-1.5 uppercase tracking-wider leading-none">
                      Pickup Person
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 text-xs font-semibold">
                  <div className="flex items-center text-emerald-600 space-x-2">
                    <Check className="h-4 w-4 stroke-[3] text-emerald-500 bg-emerald-50 rounded-full p-0.5" />
                    <span>Child photo matched</span>
                  </div>
                  <div className="flex items-center text-emerald-600 space-x-2">
                    <Check className="h-4 w-4 stroke-[3] text-emerald-500 bg-emerald-50 rounded-full p-0.5" />
                    <span>Pickup person confirmed</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-3 pt-2">
                <button
                  onClick={() => {
                    setPickupSuccessResult(null);
                  }}
                  className="w-full bg-[#C59B27] hover:bg-[#A47E1F] text-white font-bold tracking-wider py-4 rounded-2xl text-sm transition-all shadow-md uppercase flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <QrCode className="h-4 w-4" />
                  <span>Scan another pass</span>
                </button>
                
                <button
                  onClick={() => {
                    setSearchQuery(pickupSuccessResult.child?.fullName || '');
                    setPickupSuccessResult(null);
                    onNavigate('/volunteer/children');
                  }}
                  className="w-full border-2 border-gray-200 hover:bg-gray-50 text-gray-700 font-bold tracking-wider py-3.5 rounded-2xl text-sm transition-all uppercase text-center cursor-pointer bg-white"
                >
                  View child record
                </button>

                <button
                  onClick={() => {
                    setPickupSuccessResult(null);
                    onNavigate('/volunteer/event');
                  }}
                  className="w-full text-center text-xs font-semibold text-[#C59B27] hover:text-[#A47E1F] cursor-pointer block pt-2 underline transition-all"
                >
                  Back to Event Home
                </button>
              </div>

              {/* Bottom Event Stats Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm">
                <div className="grid grid-cols-3 gap-4 text-center divide-x divide-gray-100">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Children inside</span>
                    <span className="text-xl font-extrabold text-neutral-900 block">
                      {pickupSuccessResult.stats?.inside ?? 0}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Picked up</span>
                    <span className="text-xl font-extrabold text-neutral-900 block">
                      {pickupSuccessResult.stats?.pickedUp ?? 0}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-[#C59B27] uppercase tracking-wider block">Needs attention</span>
                    <span className="text-xl font-extrabold text-[#C59B27] block">
                      {pickupSuccessResult.stats?.attention ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : pickupChild ? (
            /* ==================== ACTIVE PICKUP CARD / VERIFICATION SCREEN ==================== */
            <div className="space-y-6 animate-fade-in" data-view-version="1.0" data-component-version="pickup-verification">
              
              {/* Back / Navigation Bar */}
              <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-4">
                <div className="flex items-center space-x-3">
                  <h2 className="text-2xl font-bold text-gray-900 leading-tight tracking-tight font-serif">Pickup Release</h2>
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-0.5 text-xs font-bold rounded-full">
                    Verification Needed
                  </span>
                </div>
                <button
                  onClick={() => {
                    setPickupChild(null);
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 cursor-pointer transition-colors"
                  title="Cancel release lookup"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Child Details Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row items-center sm:items-start gap-5">
                <div className="w-20 h-20 rounded-full overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0 shadow-inner">
                  {pickupChild.photoUrl ? (
                    <img
                      src={pickupChild.photoUrl}
                      alt={pickupChild.fullName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User className="h-10 w-10 text-gray-300" />
                  )}
                </div>
                <div className="text-center sm:text-left space-y-3 flex-1 min-w-0">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">
                      {pickupChild.fullName}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1 font-mono font-bold uppercase tracking-wider">
                      {pickupChild.ageGroup || 'Creche'} &bull; {pickupChild.gender} &bull; DOB: {pickupChild.dateOfBirth || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100 text-xs inline-block text-left w-full max-w-sm">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block leading-none">Primary Parent</span>
                    <p className="font-bold text-gray-800 mt-2 text-sm">{pickupChild.parentName}</p>
                    <p className="text-gray-500 mt-1 flex items-center space-x-1.5">
                      <span>{pickupChild.parentPhone}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Medical / Allergies Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs space-y-3">
                <h4 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                  Care Notes & Medical
                </h4>
                {pickupChild.hasMedicalNotes || pickupChild.needsExtraSupport ? (
                  <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-start space-x-3 text-xs text-rose-950">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
                    <div className="space-y-1">
                      <h5 className="font-bold text-rose-800">Allergies / Medical / Support Needs</h5>
                      <p className="text-[11px] text-rose-700 leading-relaxed">
                        {pickupChild.medicalNotes || pickupChild.supportNotes || 'Requires emergency attention or extra support.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-start space-x-3 text-xs text-gray-500">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                    <div className="space-y-0.5">
                      <h5 className="font-bold text-gray-700">No care conditions</h5>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        No allergies, medical needs, or extra physical support alerts registered for this child.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Authorized Pickup Person Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs space-y-4">
                <h4 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                  Authorized Pickup Person
                </h4>
                
                {pickupChild.pickup ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-50 border border-gray-200 shrink-0 flex items-center justify-center">
                          {pickupChild.pickup.photoUrl ? (
                            <img
                              src={pickupChild.pickup.photoUrl}
                              alt={pickupChild.pickup.fullName}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <User className="h-6 w-6 text-gray-300" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 leading-tight truncate">
                            {pickupChild.pickup.fullName}
                          </h4>
                          <p className="text-[11px] text-[#C59B27] font-semibold mt-0.5 font-mono uppercase tracking-wider">
                            {pickupChild.pickup.relationship || 'Authorized Pickup'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <a
                          href={`tel:${pickupChild.pickup.phone}`}
                          className="p-2 bg-gray-50 border border-gray-200 hover:border-[#C59B27] text-gray-600 hover:text-[#C59B27] rounded-xl transition-all shadow-xs"
                          title="Call pickup person"
                        >
                          <Phone className="h-4 w-4" />
                        </a>
                      </div>
                    </div>

                    <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-4 flex items-start space-x-3 text-amber-850">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
                      <div className="space-y-0.5">
                        <h5 className="font-bold text-amber-850 text-xs">Security Verification Check</h5>
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                          Ensure the physical person picking up the child strictly matches the details and face photo listed above.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-start space-x-3 text-xs text-gray-500">
                      <User className="h-5 w-5 shrink-0 text-gray-400 mt-0.5" />
                      <div className="space-y-0.5">
                        <h5 className="font-bold text-gray-700">Self Pickup / Primary Parent Only</h5>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          No secondary pickup person was assigned. The child is authorized to be released strictly to their primary parent ({pickupChild.parentName}).
                        </p>
                      </div>
                    </div>

                    <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-4 flex items-start space-x-3 text-amber-850">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
                      <div className="space-y-0.5">
                        <h5 className="font-bold text-amber-850 text-xs">Security Verification Check</h5>
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                          Verify identity against primary parent profile. Do not release to any unlisted individuals.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-3">
                <button
                  onClick={() => handleConfirmPickupRelease(pickupChild)}
                  disabled={pickupLoading}
                  className="w-full bg-neutral-900 hover:bg-neutral-800 text-white font-bold tracking-widest py-4 rounded-2xl text-sm transition-all shadow-md uppercase flex items-center justify-center space-x-2 cursor-pointer disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {pickupLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Check className="h-4 w-4 stroke-[3]" />
                      <span>MARK PICKED UP</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setPickupChild(null);
                  }}
                  className="w-full border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-bold tracking-widest py-3.5 rounded-2xl text-sm transition-all uppercase text-center cursor-pointer block bg-white"
                >
                  CANCEL / RELEASE ANOTHER
                </button>
              </div>
            </div>
          ) : (
            /* ==================== PICKUP DASHBOARD / HOME SCREEN ==================== */
            <div className="space-y-6 animate-fade-in" data-view-version="1.0" data-component-version="pickup-home">
              
              {/* Pickup Metrics Dashboard */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-4 text-center space-y-1">
                  <span className="text-[9px] font-mono font-bold text-emerald-700 uppercase tracking-wider block">INSIDE</span>
                  <span className="text-xl font-extrabold text-emerald-800 block">
                    {pickupStats.inside || stats.checkedIn}
                  </span>
                </div>
                <div className="bg-gray-50 border border-gray-200/60 rounded-2xl p-4 text-center space-y-1">
                  <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-wider block">PICKED UP</span>
                  <span className="text-xl font-extrabold text-gray-700 block">
                    {pickupStats.pickedUp || stats.pickedUp}
                  </span>
                </div>
                <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-4 text-center space-y-1">
                  <span className="text-[9px] font-mono font-bold text-amber-700 uppercase tracking-wider block">ATTENTION</span>
                  <span className="text-xl font-extrabold text-amber-800 block">
                    {pickupStats.attention || stats.attention}
                  </span>
                </div>
              </div>

              {/* Pass Code Manual Search */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-gray-900">Manual Entry Pass Code</h3>
                  <p className="text-xs text-gray-400">
                    Enter the 6-character pass reference code printed on the parent’s card (e.g. KOI-2026-6E80A7)
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handlePickupLookup(pickupCode);
                  }}
                  className="flex gap-3"
                >
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={pickupCode}
                      onChange={(e) => setPickupCode(e.target.value.toUpperCase())}
                      placeholder="e.g. 6E80A7"
                      disabled={pickupLoading}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold tracking-widest placeholder:tracking-normal outline-none focus:border-[#C59B27] focus:bg-white transition-all disabled:opacity-60"
                    />
                    {pickupCode && (
                      <button
                        type="button"
                        onClick={() => setPickupCode('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={pickupLoading || !pickupCode}
                    className="px-5 bg-neutral-900 hover:bg-neutral-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs tracking-wide rounded-xl transition-all cursor-pointer flex items-center justify-center font-mono uppercase"
                  >
                    {pickupLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <span>Verify Release</span>
                    )}
                  </button>
                </form>
              </div>

              {/* Camera Activation Quick Entry */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 text-center space-y-4 shadow-sm">
                <div className="w-12 h-12 bg-[#C59B27]/10 text-[#C59B27] rounded-2xl flex items-center justify-center mx-auto">
                  <QrCode className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-gray-800">Scan Guardian QR Code</h3>
                  <p className="text-xs text-gray-500 max-w-xs mx-auto">
                    Launch the QR scanner to instantly identify checked-in children and verify their pickup person.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setScanMode('check_out');
                    setCameraActive(true);
                    onNavigate('/volunteer/scan');
                  }}
                  className="h-10 px-5 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-bold text-xs tracking-wider rounded-xl transition-all inline-flex items-center space-x-1.5 shadow-sm uppercase cursor-pointer"
                >
                  <Camera className="h-4 w-4" />
                  <span>Launch Camera Scanner</span>
                </button>
              </div>

              {/* Last Released Child Card */}
              {pickupLastChild && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                      LAST RELEASED CHILD
                    </h2>
                    <span className="text-[10px] font-medium text-emerald-600">Verification complete</span>
                  </div>

                  <div className="bg-white border border-[#EAE8E1] rounded-3xl p-4 flex items-center justify-between shadow-xs">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-100 border border-gray-200/80 flex items-center justify-center shrink-0">
                        {pickupLastChild.photoUrl ? (
                          <img
                            src={pickupLastChild.photoUrl}
                            alt={pickupLastChild.childName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-gray-800 truncate">{pickupLastChild.childName}</h4>
                        <p className="text-[10px] text-gray-400">Class assigned: {pickupLastChild.schoolClass || 'General'}</p>
                      </div>
                    </div>

                    <span className="text-[9px] font-mono font-bold text-gray-400 flex items-center space-x-0.5 shrink-0">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(pickupLastChild.timestamp || pickupLastChild.releasedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {cleanRoute === '/volunteer/children' && (
          selectedChildId ? (
            /* ==================== CHILD PROFILE VIEW ==================== */
            childProfileLoading || !childProfileData ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="w-12 h-12 border-4 border-[#C59B27]/30 border-t-[#C59B27] rounded-full animate-spin"></div>
                <p className="text-sm font-semibold text-gray-500 font-mono animate-pulse">Loading child record...</p>
              </div>
            ) : (
              <div className="space-y-6 animate-fade-in pb-10" data-view-version="1.0" data-component-version="child-profile-full">
                
                {/* 1. Header Bar */}
                <div className="flex items-center space-x-3.5">
                  <button
                    onClick={() => setSelectedChildId(null)}
                    className="p-2 border border-gray-200 hover:border-[#C59B27] bg-white text-gray-600 hover:text-[#C59B27] rounded-xl transition-all shadow-xs cursor-pointer shrink-0"
                    title="Back to Directory"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0">
                    <h1 className="text-base font-bold text-gray-900 leading-tight">Child profile</h1>
                    <p className="text-[11px] text-[#C59B27] font-semibold truncate leading-none mt-1">
                      {childProfileData.event?.name || 'More Than Conquerors'}
                    </p>
                  </div>
                </div>

                {/* 2. Hero Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm text-center flex flex-col items-center space-y-4">
                  {/* Photo with Overlay Badge */}
                  <div className="relative">
                    <div className="w-28 h-28 rounded-full border-4 border-[#C59B27]/30 p-1 bg-white shadow-sm inline-block overflow-hidden relative">
                      {childProfileData.child.photoUrl ? (
                        <img
                          src={childProfileData.child.photoUrl}
                          alt={childProfileData.child.fullName}
                          className="w-full h-full object-cover rounded-full"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-50 flex items-center justify-center rounded-full">
                          <User className="h-12 w-12 text-gray-300" />
                        </div>
                      )}
                    </div>
                    {/* Status Badge overlay at bottom of photo */}
                    <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 shrink-0 shadow-sm leading-none whitespace-nowrap">
                      {childProfileData.child.status === 'inside' && (
                        <span className="inline-flex items-center space-x-1 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>Inside</span>
                        </span>
                      )}
                      {childProfileData.child.status === 'not_arrived' && (
                        <span className="inline-flex items-center space-x-1 px-3 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                          <span>Not arrived</span>
                        </span>
                      )}
                      {childProfileData.child.status === 'picked_up' && (
                        <span className="inline-flex items-center space-x-1 px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-100 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          <span>Picked up</span>
                        </span>
                      )}
                      {childProfileData.child.status === 'needs_attention' && (
                        <span className="inline-flex items-center space-x-1 px-3 py-1.5 bg-rose-50 text-rose-800 border border-rose-100 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          <span>Needs attention</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Identity Detail */}
                  <div className="pt-2">
                    <h2 className="text-xl font-bold text-gray-900 leading-tight font-serif">{childProfileData.child.fullName}</h2>
                    <div className="flex items-center justify-center space-x-2 mt-2">
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-[10px] font-bold uppercase tracking-wide">
                        {childProfileData.child.age} Years Old
                      </span>
                      <span className="px-2.5 py-1 bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 rounded-lg text-[10px] font-bold uppercase tracking-wide">
                        {childProfileData.child.classGroup || 'No class assigned'}
                      </span>
                    </div>
                  </div>

                  {/* Core fields row */}
                  <div className="w-full grid grid-cols-3 gap-3 pt-3.5 border-t border-gray-100 text-xs">
                    <div className="text-center">
                      <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Gender</p>
                      <h4 className="font-bold text-gray-800 mt-1.5 truncate">{childProfileData.child.gender}</h4>
                    </div>
                    <div className="text-center border-x border-gray-100 px-1">
                      <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Parent</p>
                      <h4 className="font-bold text-gray-800 mt-1.5 truncate" title={childProfileData.parent.fullName}>
                        {childProfileData.parent.fullName}
                      </h4>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Phone</p>
                      <h4 className="font-bold text-gray-800 mt-1.5 truncate font-mono">{childProfileData.parent.phone}</h4>
                    </div>
                  </div>
                </div>

                {/* 3. Action Buttons Section */}
                <div className="space-y-3">
                  <button
                    onClick={() => handlePreparePickup(childProfileData.child.id)}
                    disabled={childProfileData.child.status !== 'inside' || pickupLoading}
                    className={`w-full py-4 rounded-2xl text-sm font-bold transition-all shadow-sm uppercase flex items-center justify-center space-x-2 ${childProfileData.child.status === 'inside' ? 'bg-[#C59B27] hover:bg-[#A47E1F] text-white cursor-pointer hover:shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}
                  >
                    <LogOut className="h-4.5 w-4.5" />
                    <span>{pickupLoading ? 'Processing...' : 'Start pickup'}</span>
                  </button>

                  <button
                    onClick={() => onNavigate('/volunteer/scan')}
                    className="w-full py-3.5 bg-white hover:bg-gray-50 text-gray-700 font-bold text-sm tracking-wide rounded-2xl transition-colors border-2 border-gray-200 uppercase flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <QrCode className="h-4 w-4" />
                    <span>Scan another pass</span>
                  </button>
                </div>

                {/* 4. Today Section */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-sm space-y-3.5">
                  <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase flex items-center space-x-1.5">
                    <Clock className="h-4 w-4 text-[#C59B27]" />
                    <span>Today</span>
                  </h3>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-gray-50">
                      <span className="text-gray-500 font-medium">Entry</span>
                      <span className="font-bold text-gray-800">
                        {childProfileData.child.checkedInAt ? (
                          `Checked in at ${new Date(childProfileData.child.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        ) : (
                          'Not checked in yet'
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-gray-500 font-medium">Pickup</span>
                      <span className="font-bold text-gray-800">
                        {childProfileData.child.pickedUpAt ? (
                          `Picked up at ${new Date(childProfileData.child.pickedUpAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        ) : (
                          'Not picked up yet'
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. Care Notes Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-sm space-y-4">
                  <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase flex items-center space-x-1.5">
                    <Heart className="h-4 w-4 text-rose-500 fill-rose-500/10" />
                    <span>Care notes</span>
                  </h3>

                  <div className="space-y-3">
                    <div className="p-3 bg-gray-50/70 border border-gray-100 rounded-xl space-y-1">
                      <p className="text-[10px] text-gray-400 font-bold uppercase leading-none">Medical note</p>
                      <p className="text-xs font-semibold text-gray-700 leading-relaxed pt-0.5">
                        {childProfileData.child.medicalNote || 'No medical note added.'}
                      </p>
                    </div>

                    <div className="p-3 bg-gray-50/70 border border-gray-100 rounded-xl space-y-1">
                      <p className="text-[10px] text-gray-400 font-bold uppercase leading-none">Allergies</p>
                      <p className="text-xs font-semibold text-gray-700 leading-relaxed pt-0.5">
                        {childProfileData.child.allergies || 'No allergy added.'}
                      </p>
                    </div>

                    <div className="p-3 bg-gray-50/70 border border-gray-100 rounded-xl space-y-1">
                      <p className="text-[10px] text-gray-400 font-bold uppercase leading-none">Extra support</p>
                      <p className="text-xs font-semibold text-gray-700 leading-relaxed pt-0.5">
                        {childProfileData.child.extraSupport || 'No extra support added.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 6. Parent Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-sm space-y-4">
                  <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                    Parent
                  </h3>

                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-50 border border-gray-200 shrink-0 flex items-center justify-center">
                        {childProfileData.parent.photoUrl ? (
                          <img
                            src={childProfileData.parent.photoUrl}
                            alt={childProfileData.parent.fullName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User className="h-6 w-6 text-gray-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-gray-900 leading-tight truncate">{childProfileData.parent.fullName}</h4>
                        <p className="text-[11px] text-[#C59B27] mt-0.5 font-semibold">
                          {childProfileData.parent.relationship || 'Mother'}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                          {childProfileData.parent.phone}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      <a
                        href={`tel:${childProfileData.parent.phone}`}
                        className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-150 text-gray-600 rounded-xl transition-all shadow-xs"
                        title="Call parent"
                      >
                        <Phone className="h-4.5 w-4.5" />
                      </a>
                      <a
                        href={`https://wa.me/${childProfileData.parent.phone?.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-150 text-emerald-600 rounded-xl transition-all shadow-xs"
                        title="WhatsApp parent"
                      >
                        <MessageCircle className="h-4.5 w-4.5" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* 7. Pickup Person Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                      Pickup person
                    </h3>
                    {childProfileData.pickupPeople?.[0] && (
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 uppercase tracking-wider">
                        {childProfileData.pickupPeople[0].label || 'Alternative'}
                      </span>
                    )}
                  </div>

                  {childProfileData.pickupPeople?.[0] ? (
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-50 border border-gray-200 shrink-0 flex items-center justify-center">
                          {childProfileData.pickupPeople[0].photoUrl ? (
                            <img
                              src={childProfileData.pickupPeople[0].photoUrl}
                              alt={childProfileData.pickupPeople[0].fullName}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <User className="h-6 w-6 text-gray-300" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 leading-tight truncate">
                            {childProfileData.pickupPeople[0].fullName
                          }</h4>
                          <p className="text-[11px] text-gray-500 mt-0.5 font-medium">
                            {childProfileData.pickupPeople[0].relationship || 'Authorized'}
                          </p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                            {childProfileData.pickupPeople[0].phone}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <a
                          href={`tel:${childProfileData.pickupPeople[0].phone}`}
                          className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-150 text-gray-600 rounded-xl transition-all shadow-xs"
                          title="Call pickup person"
                        >
                          <Phone className="h-4.5 w-4.5" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl text-center">
                      <p className="text-xs text-gray-400 font-medium">No alternative pickup person registered.</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Only primary parents/guardians are authorized.</p>
                    </div>
                  )}
                </div>

                {/* 8. Event Details Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-sm space-y-4">
                  <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                    Event details
                  </h3>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Session</p>
                      <h4 className="font-bold text-gray-800 mt-1">{childProfileData.event?.section || 'Children and Teens'}</h4>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Event</p>
                      <h4 className="font-bold text-gray-800 mt-1">{childProfileData.event?.name || 'The General Assembly'}</h4>
                    </div>
                    <div className="pt-2 border-t border-gray-50">
                      <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Date</p>
                      <h4 className="font-bold text-gray-800 mt-1">{childProfileData.event?.dateLabel || '18th to 22nd November 2026'}</h4>
                    </div>
                    <div className="pt-2 border-t border-gray-50">
                      <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Time</p>
                      <h4 className="font-bold text-[#C59B27] mt-1 font-mono">{childProfileData.event?.timeLabel || '9:00 AM to 7:00 PM'}</h4>
                    </div>
                  </div>
                </div>

                {/* 9. Today's Activity Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-sm space-y-4">
                  <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                    Today’s activity
                  </h3>

                  <div className="relative pl-5 border-l border-gray-200 space-y-6 text-xs text-gray-600">
                    {/* Timeline node 1: Check-in */}
                    <div className="relative">
                      {/* Timeline Dot */}
                      <span className="absolute -left-[25.5px] top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white shadow-xs"></span>
                      <div className="space-y-0.5">
                        <h4 className="font-bold text-gray-800">
                          {childProfileData.todayActivity?.checkedInAt ? (
                            `Checked in at ${new Date(childProfileData.todayActivity.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          ) : (
                            'Pending event check-in'
                          )}
                        </h4>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {childProfileData.todayActivity?.checkedInBy ? (
                            `By ${childProfileData.todayActivity.checkedInBy.fullName}`
                          ) : (
                            'Waiting at Gate check-in point'
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Timeline node 2: Pickup */}
                    <div className="relative">
                      {/* Timeline Dot */}
                      <span className={`absolute -left-[25.5px] top-1.5 w-2.5 h-2.5 rounded-full border border-white shadow-xs ${childProfileData.todayActivity?.pickedUpAt ? 'bg-amber-500' : 'bg-gray-300'}`}></span>
                      <div className="space-y-0.5">
                        <h4 className="font-bold text-gray-800">
                          {childProfileData.todayActivity?.pickedUpAt ? (
                            `Picked up at ${new Date(childProfileData.todayActivity.pickedUpAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          ) : (
                            'Not picked up yet'
                          )}
                        </h4>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {childProfileData.todayActivity?.pickedUpAt ? (
                            `Released by ${childProfileData.todayActivity.pickedUpBy?.fullName || 'Event Worker'} to ${childProfileData.todayActivity.pickupPerson?.fullName || 'Parent'}`
                          ) : (
                            'Must match authorization card'
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )
          ) : (
            /* ==================== DIRECTORY VIEW ==================== */
            <div className="space-y-6">
              
              {/* Directory Search & Filter Header Card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-sm space-y-4">
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-gray-900">Volunteer Access</h2>
                  <p className="text-xs text-[#C59B27] font-semibold">
                    Children and Teens &bull; event team
                  </p>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); fetchChildrenDirectory(); }} className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search name, parent, phone..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold outline-none focus:border-[#C59B27] focus:bg-white transition-all"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => { setSearchQuery(''); setTimeout(fetchChildrenDirectory, 0); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="px-5 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-bold text-xs tracking-wide rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1 font-sans"
                  >
                    <Search className="h-4 w-4" />
                    <span>Search</span>
                  </button>
                </form>

                {/* Filter Tabs Block (Screenshot A styling) */}
                <div className="flex items-center space-x-1 overflow-x-auto pb-1 border-t border-gray-100 pt-3.5 text-xs">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'inside', label: 'Inside' },
                    { id: 'not_arrived', label: 'Not Arrived' },
                    { id: 'picked_up', label: 'Picked Up' },
                    { id: 'attention', label: 'Attention' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveDirectoryFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-lg font-semibold tracking-wide whitespace-nowrap cursor-pointer transition-all ${activeDirectoryFilter === tab.id ? 'bg-[#C59B27] text-white shadow-xs' : 'bg-gray-50 text-gray-500 hover:bg-gray-150'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Children Grid List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">
                    REGISTRATIONS ({directoryChildren.length})
                  </h3>
                  {searching && (
                    <div className="w-4 h-4 border-2 border-[#C59B27]/30 border-t-[#C59B27] rounded-full animate-spin"></div>
                  )}
                </div>

                <div className="space-y-4">
                  {directoryChildren.length > 0 ? (
                    directoryChildren.map((child) => {
                      const isInside = child.entryStatus === 'checked_in' || child.entryStatus === 'inside';
                      const isPickedUp = child.entryStatus === 'picked_up' || child.entryStatus === 'checked_out';
                      const isAttention = child.hasMedicalNotes || child.needsExtraSupport || child.entryStatus === 'under_review';

                      return (
                        <div
                          key={child.childId}
                          onClick={() => setSelectedChildId(child.childId)}
                          className="bg-white border border-[#EAE8E1] hover:border-[#C59B27]/40 rounded-3xl p-5 shadow-xs space-y-4 transition-all cursor-pointer group active:scale-[0.99] relative text-left"
                        >
                          {/* Row Header Info */}
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-3.5 min-w-0">
                              <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-50 border border-gray-150 shrink-0 flex items-center justify-center relative">
                                {child.photoUrl ? (
                                  <img
                                    src={child.photoUrl}
                                    alt={child.childName}
                                    className="w-full h-full object-cover rounded-full"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <User className="h-6 w-6 text-gray-300" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <h3 className="text-sm font-bold text-gray-900 leading-tight group-hover:text-[#C59B27] transition-colors">
                                  {child.childName}
                                </h3>
                                <p className="text-[11px] text-gray-400 mt-1 font-medium">
                                  {child.ageGroup || 'Creche'} &bull; {child.gender}
                                </p>
                              </div>
                            </div>

                            {/* Status Badge */}
                            <div>
                              {isInside && (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wider">
                                  Inside
                                </span>
                              )}
                              {isPickedUp && (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-gray-50 text-gray-500 border border-gray-200 uppercase tracking-wider">
                                  Picked up
                                </span>
                              )}
                              {!isInside && !isPickedUp && !isAttention && (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-gray-50 text-gray-400 border border-gray-150 uppercase tracking-wider">
                                  Registered
                                </span>
                              )}
                              {isAttention && (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wider">
                                  Attention
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Middle Parent row */}
                          <div className="grid grid-cols-2 gap-4 bg-gray-50/70 rounded-2xl p-3 border border-gray-100 text-xs">
                            <div>
                              <p className="text-[8px] text-gray-400 font-bold uppercase leading-none">Parent/Guardian</p>
                              <h4 className="font-bold text-gray-800 mt-1 truncate">{child.parentName}</h4>
                            </div>
                            <div className="text-right flex flex-col justify-center">
                              <p className="text-[8px] text-gray-400 font-bold uppercase leading-none">Contact Phone</p>
                              <p className="font-mono text-gray-600 font-bold mt-1 text-[10px]">{child.parentPhone}</p>
                            </div>
                          </div>

                          {/* Quick indicators */}
                          <div className="flex items-center space-x-2 pt-1">
                            {child.hasMedicalNotes && (
                              <span className="inline-flex items-center space-x-1 px-2 py-1 bg-rose-50 text-rose-700 rounded-md text-[9px] font-bold border border-rose-100">
                                <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                                <span>Medical</span>
                              </span>
                            )}
                            {child.needsExtraSupport && (
                              <span className="inline-flex items-center space-x-1 px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-[9px] font-bold border border-amber-100">
                                <Info className="h-3 w-3 text-amber-500 shrink-0" />
                                <span>Support</span>
                              </span>
                            )}
                            {child.passReference && (
                              <span className="text-[9px] text-gray-400 font-mono font-bold uppercase ml-auto">
                                PASS: {child.passReference}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="bg-white border border-[#EAE8E1] rounded-3xl p-10 text-center text-gray-400">
                      <User className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold">No registrations found matching the filters.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )
        )}

      </main>

      {/* Dynamic Side-by-Side Verification Overlay (Screenshot A/B logic) */}
      {lastVerifiedChild && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-[#EAE8E1] flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-[#EAE8E1] flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  {scanMode === 'check_in' ? 'Check-In Verification' : 'Pickup Release Verification'}
                </h3>
                <p className="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-wider">
                  {scanMode === 'check_in' ? 'Gate Admission Granted' : 'Identity Photo Matching'}
                </p>
              </div>
              <button
                onClick={() => setLastVerifiedChild(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {scanMode === 'check_in' ? (
                /* CHECK-IN SUCCESS SUMMARY */
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-emerald-500 shadow-sm bg-gray-100 flex items-center justify-center">
                    {lastVerifiedChild.photoUrl ? (
                      <img
                        src={lastVerifiedChild.photoUrl}
                        alt={lastVerifiedChild.fullName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User className="h-10 w-10 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-900">{lastVerifiedChild.fullName}</h4>
                    <p className="text-xs text-gray-500 font-medium">Age Group: {lastVerifiedChild.ageGroup || 'Creche'}</p>
                    <p className="text-xs text-[#C59B27] font-semibold mt-1">Parent: {lastVerifiedChild.parentName} ({lastVerifiedChild.parentPhone})</p>
                  </div>
                  <div className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center space-x-3 text-emerald-800 text-left">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                    <p className="text-[11px] text-emerald-700 leading-relaxed font-semibold">
                      This child is now successfully checked in. Ensure they are guided to their age group department.
                    </p>
                  </div>
                </div>
              ) : (
                /* CHECK-OUT SIDE-BY-SIDE VERIFICATION */
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Left: Child */}
                    <div className="space-y-2 text-center bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">CHILD</p>
                      <div className="w-20 h-20 rounded-full overflow-hidden mx-auto border border-gray-200 bg-white flex items-center justify-center">
                        {lastVerifiedChild.photoUrl ? (
                          <img
                            src={lastVerifiedChild.photoUrl}
                            alt={lastVerifiedChild.fullName || lastVerifiedChild.childName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User className="h-8 w-8 text-gray-300" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-bold text-gray-800 truncate">{lastVerifiedChild.fullName || lastVerifiedChild.childName}</h4>
                        <p className="text-[10px] text-gray-400">{lastVerifiedChild.ageGroup || 'Creche'}</p>
                      </div>
                    </div>

                    {/* Right: Pickup Person */}
                    <div className="space-y-2 text-center bg-[#C59B27]/5 p-4 rounded-2xl border border-[#C59B27]/10">
                      <p className="text-[10px] font-mono font-bold text-[#C59B27] uppercase tracking-wider">PICKUP PERSON</p>
                      <div className="w-20 h-20 rounded-full overflow-hidden mx-auto border border-[#C59B27]/20 bg-white flex items-center justify-center">
                        {lastVerifiedChild.pickup?.photoUrl ? (
                          <img
                            src={lastVerifiedChild.pickup.photoUrl}
                            alt={lastVerifiedChild.pickup.fullName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User className="h-8 w-8 text-gray-300" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-bold text-gray-800 truncate">
                          {lastVerifiedChild.pickup?.fullName || lastVerifiedChild.parentName || 'Self Pickup'}
                        </h4>
                        <p className="text-[10px] text-[#C59B27] font-semibold">
                          {lastVerifiedChild.pickup?.relationship || 'Parent'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start space-x-3 text-amber-800">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold">Important Security Notice</h4>
                      <p className="text-[10px] text-amber-700 leading-relaxed">
                        Verify that the physical person releasing the child strictly matches the photo card on the right. Release child only after matching.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-[#EAE8E1] bg-gray-50 flex space-x-3">
              {scanMode === 'check_in' ? (
                <>
                  <button
                    onClick={() => setLastVerifiedChild(null)}
                    className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs tracking-wide rounded-xl transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      const cid = lastVerifiedChild.id || lastVerifiedChild.childId;
                      if (cid) {
                        setSelectedChildId(cid);
                      }
                      setLastVerifiedChild(null);
                      onNavigate('/volunteer/children');
                    }}
                    className="flex-1 py-2.5 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-bold text-xs tracking-wide rounded-xl transition-colors cursor-pointer text-center font-bold"
                  >
                    View Record
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setLastVerifiedChild(null)}
                    className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs tracking-wide rounded-xl transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  {scanMode === 'check_out' && (
                    <button
                      onClick={() => handleConfirmRelease(lastVerifiedChild)}
                      disabled={scanLoading}
                      className="flex-1 py-2.5 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-bold text-xs tracking-wide rounded-xl transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
                    >
                      {scanLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          <span>Confirm Release</span>
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {cleanRoute === '/volunteer/reports' && (
        /* ==================== 4. EVENT REPORTS VIEW ==================== */
        <div data-view-version="volunteer-reports-v1" className="space-y-6 pb-16 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-gray-900 leading-tight tracking-tight font-serif">Event Reports</h2>
              <p className="text-xs text-gray-500">
                Live status overview and audit summaries for Children and Teens.
              </p>
            </div>
            <button
              onClick={() => fetchReportsData(false)}
              disabled={reportsLoading}
              className="p-2.5 text-gray-500 hover:text-[#C59B27] hover:bg-[#C59B27]/10 active:scale-95 border border-[#EAE8E1] rounded-2xl transition-all cursor-pointer bg-white"
              title="Refresh Data"
              id="btn-reports-refresh-top"
            >
              <RefreshCw className={`h-4.5 w-4.5 ${reportsLoading ? 'animate-spin text-[#C59B27]' : ''}`} />
            </button>
          </div>

          {reportsLoading && !reportsData ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-10 h-10 border-3 border-[#C59B27]/20 border-t-[#C59B27] rounded-full animate-spin"></div>
              <p className="text-xs text-gray-400 font-medium">Aggregating live church metrics...</p>
            </div>
          ) : (
            <>
              {/* Today's Stats Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-1.5" id="card-reports-expected">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">EXPECTED</span>
                  <span className="text-2xl font-extrabold text-neutral-900 block">{stats.expected}</span>
                </div>
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-1.5" id="card-reports-inside">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">INSIDE</span>
                  <span className="text-2xl font-extrabold text-emerald-700 block">{stats.checkedIn}</span>
                </div>
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-1.5" id="card-reports-picked-up">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">PICKED UP</span>
                  <span className="text-2xl font-extrabold text-gray-800 block">{stats.pickedUp}</span>
                </div>
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-1.5" id="card-reports-attention">
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">ATTENTION</span>
                  <span className="text-2xl font-extrabold text-amber-700 block">{stats.attention}</span>
                </div>
              </div>

              {/* Needs Attention Alert List */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" id="section-reports-attention">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">NEEDS ATTENTION</h3>
                  <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-full border border-amber-100">
                    {reportsData?.needsAttention?.length || 0} active alerts
                  </span>
                </div>

                {reportsData?.needsAttention && reportsData.needsAttention.length > 0 ? (
                  <div className="space-y-3">
                    {reportsData.needsAttention.map((item: any, idx: number) => (
                      <div key={item.id || idx} className="p-3.5 bg-amber-50/40 border border-amber-100 rounded-2xl flex items-center justify-between space-x-3 text-xs">
                        <div className="flex items-start space-x-2.5">
                          <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-500 mt-0.5" />
                          <div className="space-y-0.5">
                            <h4 className="font-bold text-neutral-800">{item.childName}</h4>
                            <p className="text-[10px] text-amber-700 font-medium">{item.issueType}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (item.id) {
                              // We can search for the child in the directory
                              setSearchQuery(item.childName);
                              onNavigate('/volunteer/children');
                            } else {
                              onNavigate('/volunteer/event');
                            }
                          }}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded-xl transition-colors cursor-pointer"
                        >
                          {item.actionText || 'RESOLVE'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50/40 border border-emerald-100 text-emerald-800 rounded-2xl flex items-center space-x-2.5 text-xs">
                    <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
                    <span className="font-medium text-emerald-700">All registered children and active gate releases are fully verified. No alerts.</span>
                  </div>
                )}
              </div>

              {/* Age Group Section */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" id="section-reports-age-groups">
                <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">AGE GROUPS DISTRIBUTION</h3>
                <div className="divide-y divide-gray-100">
                  {reportsData?.ageGroups && reportsData.ageGroups.length > 0 ? (
                    reportsData.ageGroups.map((group: any, idx: number) => (
                      <div key={group.ageGroup || idx} className="py-3 flex items-center justify-between text-xs first:pt-0 last:pb-0">
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-gray-800">{group.ageGroup}</h4>
                          <p className="text-[10px] text-gray-400 font-mono font-medium">Expected: {group.expected}</p>
                        </div>
                        <div className="flex items-center space-x-4 font-mono">
                          <div className="text-right">
                            <span className="text-[10px] text-gray-400 font-bold block uppercase">INSIDE</span>
                            <span className="text-xs font-extrabold text-emerald-600">{group.checkedIn}</span>
                          </div>
                          <div className="text-right border-l border-gray-100 pl-4">
                            <span className="text-[10px] text-gray-400 font-bold block uppercase">PICKED UP</span>
                            <span className="text-xs font-extrabold text-neutral-700">{group.pickedUp}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 py-2 text-center">No age group distribution data is currently logged.</p>
                  )}
                </div>
              </div>

              {/* Entry Logs Section */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" id="section-reports-entry-logs">
                <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">ENTRY LOG (LAST 10 CHECK-INS)</h3>
                
                {reportsData?.recentEntries && reportsData.recentEntries.length > 0 ? (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {reportsData.recentEntries.map((item: any, idx: number) => (
                      <div key={item.id || idx} className="p-3 bg-gray-50/50 border border-[#F4F4F0] rounded-2xl flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-gray-800">{item.childName}</h4>
                          <p className="text-[10px] text-gray-400 font-medium">
                            Staff: <span className="text-gray-500 font-semibold">{item.volunteerName}</span>
                          </p>
                        </div>
                        <div className="text-right space-y-0.5 font-mono">
                          <div className="flex items-center space-x-1 justify-end text-[10px] text-emerald-600 font-bold">
                            <Clock className="h-3 w-3" />
                            <span>{formatTime(item.checkedInAt)}</span>
                          </div>
                          <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                            INSIDE
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-gray-400 text-xs">
                    No active children check-ins are logged for this event.
                  </div>
                )}
              </div>

              {/* Pickup Logs Section */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" id="section-reports-pickup-logs">
                <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">PICKUP LOG (LAST 10 RELEASES)</h3>
                
                {reportsData?.recentPickups && reportsData.recentPickups.length > 0 ? (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {reportsData.recentPickups.map((item: any, idx: number) => (
                      <div key={item.id || idx} className="p-3 bg-gray-50/50 border border-[#F4F4F0] rounded-2xl flex items-center justify-between text-xs">
                        <div className="space-y-1">
                          <h4 className="font-bold text-gray-800">{item.childName}</h4>
                          <div className="space-y-0.5">
                            <p className="text-[10px] text-gray-400 font-medium">
                              Released to: <span className="text-gray-600 font-bold">{item.pickupPersonName}</span> <span className="text-[10px] text-gray-400 font-medium">({item.relationship})</span>
                            </p>
                            <p className="text-[10px] text-gray-400 font-medium">
                              Staff: <span className="text-gray-500 font-semibold">{item.volunteerName}</span>
                            </p>
                          </div>
                        </div>
                        <div className="text-right space-y-0.5 font-mono">
                          <div className="flex items-center space-x-1 justify-end text-[10px] text-gray-500 font-bold">
                            <Clock className="h-3 w-3" />
                            <span>{formatTime(item.pickedUpAt)}</span>
                          </div>
                          <span className="text-[9px] bg-neutral-100 text-neutral-700 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider block text-center">
                            RELEASED
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-gray-400 text-xs">
                    No active children releases are logged for this event.
                  </div>
                )}
              </div>

              {/* Final Report Notes Section */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" id="section-reports-final-note">
                <div className="space-y-1">
                  <h3 className="text-xs font-mono font-bold text-gray-400 tracking-wider uppercase">FINAL EVENT REPORT</h3>
                  <p className="text-[10px] text-gray-400">
                    Submit audit reviews, observations, or incident reports for admin review.
                  </p>
                </div>

                <div className="space-y-3.5">
                  <textarea
                    value={reportNotes}
                    onChange={(e) => setReportNotes(e.target.value)}
                    placeholder="Enter observations, incident notes, or care reviews for today's session..."
                    rows={4}
                    className="w-full text-xs bg-gray-50 border border-[#EAE8E1] rounded-2xl p-4 text-gray-800 placeholder-gray-400 focus:bg-white focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] outline-hidden transition-all resize-none"
                    id="textarea-reports-final-note"
                    disabled={submittingReport}
                  />

                  {reportsData?.finalReport && (
                    <div className="p-3.5 bg-neutral-50 border border-neutral-200/60 rounded-2xl text-[10.5px] text-neutral-600 space-y-0.5 leading-relaxed">
                      <p className="font-bold text-neutral-700">Last Report Details:</p>
                      <p className="italic text-neutral-500">"{reportsData.finalReport.notes}"</p>
                      <p className="text-[9.5px] text-neutral-400 font-medium">
                        Submitted by <span className="font-bold">{reportsData.finalReport.submittedBy}</span> at <span className="font-mono">{formatDate(reportsData.finalReport.submittedAt)}</span>
                      </p>
                    </div>
                  )}

                  <div className="flex space-x-3 pt-1">
                    <button
                      onClick={() => fetchReportsData(false)}
                      disabled={reportsLoading}
                      className="flex-1 py-3 border border-[#EAE8E1] hover:bg-gray-50 active:scale-98 text-gray-700 font-bold text-xs tracking-wide rounded-2xl transition-all cursor-pointer flex items-center justify-center space-x-2 bg-white"
                      id="btn-reports-refresh"
                    >
                      <RefreshCw className={`h-4 w-4 text-gray-500 ${reportsLoading ? 'animate-spin text-[#C59B27]' : ''}`} />
                      <span>Refresh Data</span>
                    </button>
                    <button
                      onClick={handleSubmitReport}
                      disabled={submittingReport || !reportNotes.trim()}
                      className="flex-1 py-3 bg-[#C59B27] hover:bg-[#A47E1F] disabled:opacity-50 disabled:hover:bg-[#C59B27] disabled:cursor-not-allowed active:scale-98 text-white font-bold text-xs tracking-wide rounded-2xl transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-xs"
                      id="btn-reports-submit"
                    >
                      {submittingReport ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          <span>Submit Report</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {cleanRoute === '/volunteer/profile' && (
        /* ==================== 5. VOLUNTEER PROFILE VIEW ==================== */
        <VolunteerProfileView
          onSignOut={onSignOut}
          showSuccess={showSuccess}
          showError={showError}
          showWarning={showWarning}
          isOffline={isOffline}
        />
      )}

      {/* Persistent Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#EAE8E1] px-4 py-2 flex items-center justify-around z-20 shadow-lg">
        <button
          onClick={() => onNavigate('/volunteer/event')}
          className={`flex flex-col items-center justify-center transition-colors cursor-pointer ${cleanRoute === '/volunteer/event' || cleanRoute === '/volunteer/pickup' ? 'text-[#C59B27]' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px] font-bold mt-1">Event</span>
        </button>
        
        <button
          onClick={() => {
            setCameraActive(true);
            onNavigate('/volunteer/scan');
          }}
          className={`flex flex-col items-center justify-center transition-colors cursor-pointer ${cleanRoute === '/volunteer/scan' ? 'text-[#C59B27]' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <QrCode className="h-5 w-5" />
          <span className="text-[10px] font-medium mt-1">Scan</span>
        </button>

        <button
          onClick={() => onNavigate('/volunteer/children')}
          className={`flex flex-col items-center justify-center transition-colors cursor-pointer ${cleanRoute === '/volunteer/children' ? 'text-[#C59B27]' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <Search className="h-5 w-5" />
          <span className="text-[10px] font-medium mt-1">Children</span>
        </button>

        <button
          onClick={() => onNavigate('/volunteer/reports')}
          className={`flex flex-col items-center justify-center transition-colors cursor-pointer ${cleanRoute === '/volunteer/reports' ? 'text-[#C59B27]' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <BarChart3 className="h-5 w-5" />
          <span className="text-[10px] font-medium mt-1">Reports</span>
        </button>

        <button
          onClick={() => onNavigate('/volunteer/profile')}
          className={`flex flex-col items-center justify-center transition-colors cursor-pointer ${cleanRoute === '/volunteer/profile' ? 'text-[#C59B27]' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <User className="h-5 w-5" />
          <span className="text-[10px] font-medium mt-1">Profile</span>
        </button>
      </div>
    </div>
  );
};

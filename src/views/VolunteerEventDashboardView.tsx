import React, { useState, useEffect, useRef } from 'react';
import { 
  LogOut, QrCode, Search, BarChart3, User, RefreshCw, AlertTriangle, 
  ShieldCheck, Check, Home, Camera, CameraOff, X, Phone, MessageCircle, 
  ArrowRight, Sparkles, UserCheck, UserX, Clock, ChevronLeft, Calendar, Heart, Info, Keyboard,
  Settings, ChevronRight, Users, LogIn
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
  const [showManualInput, setShowManualInput] = useState(false);
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
  const [showPickupManualInput, setShowPickupManualInput] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);

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
  const [directoryError, setDirectoryError] = useState<boolean>(false);

  // Scanner refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<any>(null);

  // Reports states
  const [reportsData, setReportsData] = useState<any | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportNotes, setReportNotes] = useState('');
  const [showAttentionModal, setShowAttentionModal] = useState(false);

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

  const calculateAge = (dobString?: string) => {
    if (!dobString) return '';
    try {
      const dob = new Date(dobString);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      return age > 0 ? `${age} years old` : '';
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

  const mapAgeGroupDisplayName = (name: string) => {
    const norm = (name || '').toLowerCase().trim();
    if (norm.includes('creche') || norm.includes('1-3') || norm.includes('toddler')) return 'Ages 1-3';
    if (norm.includes('preschool') || norm.includes('4-6') || norm.includes('4-8')) return 'Ages 4-6';
    if (norm.includes('7-9')) return 'Ages 7-9';
    if (norm.includes('teens') || norm.includes('10-12') || norm.includes('teen')) return 'Ages 10-12';
    return name;
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
    setDirectoryError(false);
    try {
      const results = await api.volunteer.getChildren({
        q: searchQuery.trim(),
        status: activeDirectoryFilter
      });
      setDirectoryChildren(results || []);
    } catch (err: any) {
      console.error('Failed to fetch children directory:', err);
      setDirectoryError(true);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (cleanRoute === '/volunteer/children' || cleanRoute === '/volunteer/reports') {
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
    if ((cleanRoute === '/volunteer/scan' || cleanRoute === '/volunteer/pickup') && cameraActive) {
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
      setCameraUnavailable(false);
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
        setCameraUnavailable(true);
      }
    } catch (err) {
      console.error('ZXing QR reader initialization error:', err);
      showError('Camera Error', 'Could not open camera. Please grant camera permission.');
      setCameraActive(false);
      setCameraUnavailable(true);
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
      if (cleanRoute === '/volunteer/pickup') {
        let passCode = text;
        if (text.includes('/pass/')) {
          passCode = text.split('/pass/')[1]?.split('?')[0] || text;
        } else if (text.includes('code=')) {
          passCode = text.split('code=')[1]?.split('&')[0] || text;
        }
        
        const res = await api.volunteer.lookupPickup({ passCode: passCode.trim().toUpperCase() });
        if (res && res.success && res.child) {
          setPickupChild(res.child);
          setCameraActive(false);
          showSuccess('Child Found', `Retrieved details for ${res.child.fullName}. Please verify pickup person.`);
          if (navigator.vibrate) {
            navigator.vibrate([100]);
          }
        } else {
          showError('Not Found', 'No active checked-in child found for this pass.');
          if (cameraActive) {
            startScanning();
          }
        }
      } else {
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
    <div className="min-h-screen bg-[#FAF9F6] font-sans flex flex-col pb-24" data-view-version="volunteer-event-dashboard-v2-stitch">
      {/* Top Header Bar */}
      {cleanRoute === '/volunteer/scan' ? (
        checkedInSuccessChild ? (
          <header className="bg-white border-b border-[#EAE8E1] sticky top-0 z-20 px-4 py-3 shadow-sm" data-component-version="volunteer-checked-in-header-v1-stitch">
            <div className="max-w-md mx-auto flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => {
                    setCheckedInSuccessChild(null);
                    setCheckedInSuccessEntry(null);
                    if (cameraActive) {
                      startScanning();
                    }
                  }} 
                  className="p-1.5 -ml-1 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                  id="btn-volunteer-success-back"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <div>
                  <h1 className="text-sm font-serif font-bold text-gray-950 leading-tight">Check-In Portal</h1>
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider leading-none">
                    The General Assembly Children and Teens
                  </p>
                </div>
              </div>
              <button 
                onClick={() => onNavigate('/volunteer/profile')}
                className="p-1.5 text-gray-500 hover:text-[#C59B27] transition-colors cursor-pointer"
                id="btn-volunteer-success-settings"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </header>
        ) : lookedUpChild ? (
          <header className="bg-white border-b border-[#EAE8E1] sticky top-0 z-20 px-4 py-3 shadow-sm" data-component-version="volunteer-child-found-header-v1-stitch">
            <div className="max-w-md mx-auto flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => {
                    setLookedUpChild(null);
                    if (cameraActive) {
                      startScanning();
                    }
                  }} 
                  className="p-1.5 -ml-1 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                  id="btn-volunteer-scan-back"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <div>
                  <h1 className="text-sm font-serif font-bold text-gray-950 leading-tight">Check-in Portal</h1>
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider leading-none">
                    The General Assembly Children and Teens
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-[#C59B27] bg-[#C59B27]/5 border border-[#C59B27]/10 px-2.5 py-1 rounded-full shrink-0">
                <span className="w-1.5 h-1.5 bg-[#C59B27] rounded-full"></span>
                <span>Ready to scan</span>
              </div>
            </div>
          </header>
        ) : (
          <header className="bg-white border-b border-[#EAE8E1] sticky top-0 z-20 px-4 py-3 shadow-sm" data-component-version="volunteer-check-in-header-v2-stitch">
            <div className="max-w-md mx-auto flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => onNavigate('/volunteer/event')} 
                  className="p-1.5 -ml-1 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                  id="btn-volunteer-scan-back"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <div>
                  <h1 className="text-sm font-serif font-bold text-gray-900 leading-tight">Check-in</h1>
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider leading-none">
                    The General Assembly Children and Teens
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-[#C59B27] bg-[#C59B27]/5 border border-[#C59B27]/10 px-2.5 py-1 rounded-full shrink-0">
                <span className="w-1.5 h-1.5 bg-[#C59B27] rounded-full"></span>
                <span>Ready to scan</span>
              </div>
            </div>
          </header>
        )
      ) : cleanRoute === '/volunteer/pickup' ? (
          <header className="bg-white border-b border-[#EAE8E1] sticky top-0 z-20 px-4 py-3 shadow-sm animate-fade-in" data-component-version={pickupSuccessResult ? "volunteer-pickup-success-header-v1-stitch" : "volunteer-pickup-header-v1-stitch"}>
            <div className="max-w-md mx-auto flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => {
                    if (pickupChild || pickupSuccessResult) {
                      setPickupChild(null);
                      setPickupSuccessResult(null);
                    } else {
                      onNavigate('/volunteer/event');
                    }
                  }}
                  className="p-1.5 -ml-1 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                  id="btn-volunteer-pickup-back"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <div>
                  <h1 className="text-sm font-serif font-bold text-gray-900 leading-tight">Pickup</h1>
                  <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider leading-none mt-0.5">
                    The General Assembly Children and Teens
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1 text-[11px] font-semibold text-[#C59B27] bg-[#C59B27]/5 border border-[#C59B27]/10 px-2.5 py-1 rounded-full shrink-0">
                <span>Ready to scan</span>
              </div>
            </div>
          </header>
        ) : cleanRoute === '/volunteer/children' ? (
          selectedChildId ? (
            <header className="bg-white border-b border-[#EAE8E1] sticky top-0 z-20 px-4 py-3 shadow-sm" data-component-version="volunteer-child-profile-header-v1-stitch">
              <div className="max-w-md mx-auto flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button 
                    onClick={() => setSelectedChildId(null)}
                    className="p-1.5 -ml-1 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                    id="btn-volunteer-child-profile-back"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div>
                    <h1 className="text-sm font-serif font-bold text-gray-900 leading-tight">Child profile</h1>
                    <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider leading-none mt-0.5">
                      The General Assembly
                    </p>
                  </div>
                </div>
              </div>
            </header>
          ) : (
            <header className="bg-white border-b border-[#EAE8E1] sticky top-0 z-20 px-4 py-3 shadow-sm" data-component-version="volunteer-children-header-v1-stitch">
              <div className="max-w-md mx-auto flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button 
                    onClick={() => {
                      if (selectedChildId) {
                        setSelectedChildId(null);
                      } else {
                        onNavigate('/volunteer/event');
                      }
                    }}
                    className="p-1.5 -ml-1 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                    id="btn-volunteer-children-back"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div>
                    <h1 className="text-sm font-serif font-bold text-gray-900 leading-tight">Children</h1>
                    <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider leading-none mt-0.5">
                      The General Assembly Children and Teens
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-1 text-[11px] font-semibold text-[#C59B27] bg-[#C59B27]/5 border border-[#C59B27]/10 px-2.5 py-1 rounded-full shrink-0">
                  <span>Ready to search</span>
                </div>
              </div>
            </header>
          )
        ) : cleanRoute === '/volunteer/reports' ? (
          <header className="bg-white border-b border-[#EAE8E1] sticky top-0 z-20 px-4 py-3 shadow-sm" data-component-version="volunteer-reports-header-v3-stitch-layout-fixed">
            <div className="max-w-md mx-auto flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => onNavigate('/volunteer/event')}
                  className="p-1.5 -ml-1 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                  id="btn-volunteer-reports-back"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <div>
                  <h1 className="text-sm font-serif font-bold text-gray-900 leading-tight">Children’s Ministry</h1>
                </div>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className={`p-1.5 text-gray-400 hover:text-[#C59B27] rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer transition-transform ${refreshing ? 'animate-spin' : ''}`}
                title="Refresh Stats"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </header>
        ) : (
          <header className="bg-white border-b border-[#EAE8E1] sticky top-0 z-20 px-4 py-3 shadow-sm" data-component-version="volunteer-event-header-v2-stitch">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-full bg-[#C59B27]/10 flex items-center justify-center text-[#C59B27] font-serif font-bold text-base overflow-hidden">
                {volunteerProfile?.photoUrl ? (
                  <img src={volunteerProfile.photoUrl} alt={fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  fullName.charAt(0)
                )}
              </div>
              <div>
                <h1 className="text-sm font-serif font-bold text-gray-900 leading-tight">Event Dashboard</h1>
                <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                  {eventDetails.title || 'The General Assembly'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <span className="text-[11px] text-gray-400 font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Ready to scan
              </span>
              {hasParentProfile && (
                <button
                  onClick={() => onNavigate('/parent/home')}
                  className="p-1.5 text-[#C59B27] hover:text-[#A47E1F] rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer transition-colors"
                  title="Switch to Parent Access"
                >
                  <Home className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className={`p-1.5 text-gray-400 hover:text-[#C59B27] rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer transition-transform ${refreshing ? 'animate-spin' : ''}`}
                title="Refresh Stats"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={onSignOut}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-50 flex items-center justify-center cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
      )}

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
          <div className="space-y-6 animate-fade-in" data-view-version="volunteer-event-dashboard-v2-stitch">
            {/* Hero Greeting */}
            <div className="space-y-1">
              <h2 className="text-3xl font-serif font-medium text-gray-900 tracking-tight">
                Welcome, {fullName.split(' ')[0]}.
              </h2>
              <p className="text-sm text-gray-500">
                {teamName}
              </p>
            </div>

            {/* Stitch Search Field */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                onNavigate('/volunteer/children');
              }}
              className="relative w-full"
              data-component-version="volunteer-event-search-v2-stitch"
            >
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4.5 w-4.5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find child by name or parent phone"
                className="w-full pl-10 pr-4 py-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-2xl text-sm text-gray-800 placeholder-gray-400 focus:bg-white focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] outline-hidden transition-all"
              />
            </form>

            {/* Primary Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-component-version="volunteer-event-actions-v2-stitch">
              {/* Check-in Card */}
              <div className="bg-[#FDFDFB] border border-[#EAE8E1] rounded-3xl p-6 shadow-xs flex flex-col justify-between">
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-start">
                    <h3 className="text-xl font-serif font-bold text-gray-900">Check-in</h3>
                    <QrCode className="h-5 w-5 text-[#C59B27]" />
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Scan a child’s pass at entry.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCameraActive(true);
                    setScanMode('check_in');
                    onNavigate('/volunteer/scan');
                  }}
                  className="w-full py-3 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-bold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer shadow-sm text-center"
                >
                  Start check-in
                </button>
              </div>

              {/* Pickup Card */}
              <div className="bg-[#FDFDFB] border border-[#EAE8E1] rounded-3xl p-6 shadow-xs flex flex-col justify-between">
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between items-start">
                    <h3 className="text-xl font-serif font-bold text-gray-900">Pickup</h3>
                    <UserCheck className="h-5 w-5 text-[#C59B27]" />
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Confirm the approved person before releasing.
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('/volunteer/pickup')}
                  className="w-full py-3 bg-white border border-[#EAE8E1] hover:bg-gray-50 text-gray-800 font-bold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer shadow-xs text-center"
                >
                  Start pickup
                </button>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-4" data-component-version="volunteer-event-metrics-v2-stitch">
              <div className="bg-[#FDFDFB] border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1 relative">
                <span className="text-[10px] font-mono font-bold text-gray-400 tracking-wider uppercase block">
                  EXPECTED
                </span>
                <span className="text-4xl font-serif font-medium text-gray-900 block leading-tight">
                  {stats.expected || 0}
                </span>
              </div>

              <div className="bg-[#FDFDFB] border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1 relative">
                <span className="text-[10px] font-mono font-bold text-gray-400 tracking-wider uppercase block">
                  CHECKED IN
                </span>
                <span className="text-4xl font-serif font-medium text-gray-900 block leading-tight text-[#C59B27]">
                  {stats.checkedIn || 0}
                </span>
              </div>

              <div className="bg-[#FDFDFB] border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1 relative">
                <span className="text-[10px] font-mono font-bold text-gray-400 tracking-wider uppercase block">
                  PICKED UP
                </span>
                <span className="text-4xl font-serif font-medium text-gray-900 block leading-tight">
                  {stats.pickedUp || 0}
                </span>
              </div>

              <div className="bg-[#FDFDFB] border border-[#EAE8E1] rounded-2xl p-4 shadow-xs space-y-1 relative">
                <span className="text-[10px] font-mono font-bold text-gray-400 tracking-wider uppercase block">
                  ATTENTION
                </span>
                <span className="text-4xl font-serif font-medium text-[#C59B27] block leading-tight">
                  {stats.attention || 0}
                </span>
                <div className="absolute top-4 right-4 w-3.5 h-3.5 bg-[#C59B27] rounded-xs" />
              </div>
            </div>

            {/* Needs Attention Section */}
            <div className="bg-[#FDFDFB] border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" data-component-version="volunteer-event-attention-v2-stitch">
              <div className="flex items-center space-x-2 border-b border-gray-100 pb-3">
                <AlertTriangle className="h-5 w-5 text-[#C59B27]" />
                <h3 className="text-lg font-serif font-bold text-gray-900">Needs Attention</h3>
              </div>

              {attentionItems.length === 0 && !loading && (
                <div className="py-4 text-center text-xs text-gray-400">
                  No attention items right now.
                </div>
              )}

              {attentionItems.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {attentionItems.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-start space-x-3">
                        <span className="text-sm font-serif font-bold text-[#C59B27] mt-0.5">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-gray-900 leading-tight">
                            {item.issue_type || 'Unresolved issue'}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {item.child_name} {item.child_id ? `(ID: ${item.child_id})` : ''}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleResolveAction(item)}
                        className="text-[11px] font-bold text-[#C59B27] hover:text-[#A47E1F] tracking-wider uppercase shrink-0 transition-colors cursor-pointer"
                      >
                        {item.action_text === 'RESOLVE' ? 'Resolve' : item.action_text === 'VERIFY' ? 'Verify' : 'Review'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {cleanRoute === '/volunteer/scan' && (
          checkedInSuccessChild ? (
            /* ==================== 2.6 CHECK-IN SUCCESS SCREEN (Request 3) ==================== */
            (() => {
              const firstName = checkedInSuccessChild.firstName || (checkedInSuccessChild.fullName || '').split(' ')[0] || '';
              const ageNum = checkedInSuccessChild.age;
              const ageLabel = ageNum !== undefined && ageNum !== null ? `${ageNum} ${ageNum === 1 ? 'year' : 'years'} old` : 'Age verified';
              const ageGroup = checkedInSuccessChild.classGroup || checkedInSuccessChild.ageGroup || '';

              const medicalNote = checkedInSuccessChild.medicalNote || checkedInSuccessChild.medicalNotes || lookedUpChild?.medicalNotes || '';
              const allergies = checkedInSuccessChild.allergies || lookedUpChild?.allergies || '';
              const extraSupport = checkedInSuccessChild.extraSupport || checkedInSuccessChild.supportNotes || lookedUpChild?.supportNotes || lookedUpChild?.extraSupport || '';

              const checkInTime = checkedInSuccessEntry?.checkedInAt 
                ? new Date(checkedInSuccessEntry.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const checkedInBy = checkedInSuccessEntry?.checkedInBy?.fullName || volunteerProfile?.full_name || 'Event Worker';
              const checkInPoint = checkedInSuccessEntry?.point || 'Main entrance';

              const hasCareNotes = medicalNote || (allergies && allergies.toLowerCase() !== 'no') || (extraSupport && extraSupport.toLowerCase() !== 'no');

              return (
                <div className="max-w-md mx-auto w-full px-4 space-y-6 pt-4 pb-12 animate-fade-in" data-view-version="volunteer-checked-in-success-v1-stitch">
                  {/* Event label */}
                  <div className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[#C59B27] font-bold">
                    THE GENERAL ASSEMBLY CHILDREN AND TEENS
                  </div>

                  {/* Success Title Block */}
                  <div className="text-center space-y-3" data-component-version="volunteer-checked-in-title-v1-stitch">
                    <div className="flex justify-center">
                      <div className="w-16 h-16 bg-[#8F7020] text-white rounded-full flex items-center justify-center shadow-md">
                        <Check className="h-8 w-8 stroke-[3.5]" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-3xl font-serif font-black text-gray-900 leading-tight">Checked in</h2>
                      <p className="text-sm text-gray-600 font-medium font-sans">
                        {firstName ? `${firstName} has been marked present.` : 'This child has been marked present.'}
                      </p>
                    </div>
                  </div>

                  {/* Child summary card */}
                  <div className="bg-white border border-[#EAE8E1] rounded-3xl p-4 flex items-center space-x-4 shadow-sm" data-component-version="volunteer-checked-in-child-card-v1-stitch">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 shrink-0 shadow-inner flex items-center justify-center">
                      {checkedInSuccessChild.photoUrl ? (
                        <img
                          src={checkedInSuccessChild.photoUrl}
                          alt={checkedInSuccessChild.fullName}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <User className="h-8 w-8 text-gray-300 stroke-[1.5]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-serif font-bold text-gray-950 leading-snug truncate">
                        {checkedInSuccessChild.fullName || 'Registered Child'}
                      </h3>
                      <div className="flex items-center space-x-1.5 mt-1 text-xs text-gray-500 font-semibold">
                        <span>{ageLabel}</span>
                        {ageLabel && ageGroup && <span className="text-gray-300">&bull;</span>}
                        {ageGroup && (
                          <span className="bg-[#FAF9F6] border border-[#EAE8E1] text-[#C59B27] px-2 py-0.5 text-[9px] font-bold uppercase rounded-md tracking-wider">
                            {ageGroup}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Entry details card */}
                  <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-sm space-y-4" data-component-version="volunteer-checked-in-entry-details-v1-stitch">
                    <h4 className="text-[10px] font-mono font-bold text-[#8F7020] uppercase tracking-[0.15em] border-b border-gray-100 pb-2">
                      ENTRY DETAILS
                    </h4>
                    <div className="space-y-3.5 text-xs pt-1">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 font-mono font-bold uppercase tracking-wider text-[9px]">TIME</span>
                        <span className="font-semibold text-gray-800">{checkInTime}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 font-mono font-bold uppercase tracking-wider text-[9px]">BY</span>
                        <span className="font-semibold text-gray-800">{checkedInBy}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 font-mono font-bold uppercase tracking-wider text-[9px]">POINT</span>
                        <span className="font-semibold text-gray-800">{checkInPoint}</span>
                      </div>
                    </div>
                  </div>

                  {/* Care notes card */}
                  <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-sm space-y-4" data-component-version="volunteer-checked-in-care-notes-v1-stitch">
                    <h4 className="text-[10px] font-mono font-bold text-[#8F7020] uppercase tracking-[0.15em] border-b border-gray-100 pb-2">
                      CARE NOTES
                    </h4>
                    {hasCareNotes ? (
                      <div className="space-y-3.5">
                        {medicalNote && (
                          <div className="flex items-start space-x-2.5 text-xs text-gray-700">
                            <span className="p-1.5 bg-rose-50 rounded-lg text-rose-600 shrink-0 mt-0.5">
                              <Heart className="h-3.5 w-3.5 fill-rose-600 stroke-rose-600" />
                            </span>
                            <div className="min-w-0">
                              <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider block">MEDICAL</span>
                              <p className="font-semibold text-gray-800 leading-normal mt-0.5">{medicalNote}</p>
                            </div>
                          </div>
                        )}
                        {allergies && allergies.toLowerCase() !== 'no' && (
                          <div className="flex items-start space-x-2.5 text-xs text-gray-700">
                            <span className="p-1.5 bg-amber-50 rounded-lg text-amber-600 shrink-0 mt-0.5">
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                              <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider block">ALLERGIES</span>
                              <p className="font-semibold text-gray-800 leading-normal mt-0.5">{allergies}</p>
                            </div>
                          </div>
                        )}
                        {extraSupport && extraSupport.toLowerCase() !== 'no' && (
                          <div className="flex items-start space-x-2.5 text-xs text-gray-700">
                            <span className="p-1.5 bg-blue-50 rounded-lg text-blue-600 shrink-0 mt-0.5">
                              <Info className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                              <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider block">EXTRA SUPPORT</span>
                              <p className="font-semibold text-gray-800 leading-normal mt-0.5">{extraSupport}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 font-medium italic text-center py-2 bg-gray-50 rounded-2xl border border-gray-100">
                        No care notes added.
                      </p>
                    )}
                  </div>

                  {/* Children inside / Waiting metrics card */}
                  <div className="grid grid-cols-2 gap-4 bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-sm" data-component-version="volunteer-checked-in-metrics-v1-stitch">
                    <div className="text-center space-y-1 border-r border-gray-100 pr-2">
                      <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider block">CHILDREN INSIDE</span>
                      <span className="text-3xl font-serif font-black text-gray-900">{stats.checkedIn}</span>
                    </div>
                    <div className="text-center space-y-1 pl-2">
                      <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider block">WAITING</span>
                      <span className="text-3xl font-serif font-black text-gray-900">{Math.max(0, stats.expected - stats.checkedIn)}</span>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="space-y-3 pt-2" data-component-version="volunteer-checked-in-actions-v1-stitch">
                    <button
                      onClick={() => {
                        setCheckedInSuccessChild(null);
                        setCheckedInSuccessEntry(null);
                        if (cameraActive) {
                          startScanning();
                        }
                      }}
                      className="w-full bg-[#C59B27] hover:bg-[#A47E1F] text-white font-bold tracking-widest py-3.5 rounded-2xl text-xs transition-all shadow-md uppercase cursor-pointer flex items-center justify-center space-x-2"
                    >
                      <QrCode className="h-4 w-4 stroke-[2.5]" />
                      <span>SCAN ANOTHER PASS</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setSelectedChildId(checkedInSuccessChild.id);
                        setCheckedInSuccessChild(null);
                        setCheckedInSuccessEntry(null);
                        onNavigate('/volunteer/children');
                      }}
                      className="w-full border border-gray-300 hover:border-gray-400 text-gray-850 font-bold tracking-widest py-3.5 rounded-2xl text-xs transition-all uppercase text-center cursor-pointer block bg-white hover:bg-gray-50 flex items-center justify-center space-x-2"
                    >
                      <User className="h-4 w-4 text-gray-600 stroke-[2]" />
                      <span>VIEW CHILD PROFILE</span>
                    </button>

                    <div className="text-center pt-2">
                      <button
                        onClick={() => {
                          setCheckedInSuccessChild(null);
                          setCheckedInSuccessEntry(null);
                          onNavigate('/volunteer/event');
                        }}
                        className="text-xs font-serif font-bold text-[#C59B27] hover:text-[#A47E1F] transition-colors underline underline-offset-4 cursor-pointer uppercase tracking-wider"
                      >
                        Back to Event Home
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : lookedUpChild ? (() => {
            const isAlreadyCheckedIn = lookedUpChild.entryStatus === 'checked_in' || lookedUpChild.entryStatus === 'inside';
            const medicalNoteText = lookedUpChild.medicalNotes || '';
            const allergiesText = lookedUpChild.allergies || '';
            const extraSupportText = lookedUpChild.supportNotes || lookedUpChild.extraSupport || '';

            return (
              <div className="space-y-6 max-w-md mx-auto w-full pb-12" data-view-version="volunteer-child-found-v1-stitch">
                {/* Scan successful & Child found title */}
                <div className="text-center pt-2 pb-1 space-y-1.5" data-component-version="volunteer-child-found-title-v1-stitch">
                  <div className="inline-flex items-center space-x-1.5 text-[10px] font-bold text-[#C59B27] uppercase tracking-wider font-mono">
                    <span className="p-1 bg-[#C59B27]/10 text-[#C59B27] rounded-full flex items-center justify-center">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                    <span>Scan successful</span>
                  </div>
                  <h2 className="text-3xl font-serif font-bold text-gray-950 leading-tight">Child found</h2>
                </div>

                {/* Child Identity Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" data-component-version="volunteer-child-identity-card-v1-stitch">
                  {/* Photo area */}
                  <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden bg-gray-50 border border-gray-150 relative">
                    {lookedUpChild.photoUrl ? (
                      <img
                        src={lookedUpChild.photoUrl}
                        alt={lookedUpChild.fullName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                        <User className="h-14 w-14 stroke-[1]" />
                        <span className="text-xs font-semibold text-gray-400 mt-2">No photo available</span>
                      </div>
                    )}
                  </div>

                  {/* Child details */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xl font-serif font-bold text-gray-900 leading-tight truncate">
                        {lookedUpChild.fullName}
                      </h3>
                      <span className="bg-[#FAF9F6] border border-[#EAE8E1] text-[#C59B27] px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-md tracking-wider shrink-0 leading-none">
                        Pass Ready
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-medium">
                      {calculateAge(lookedUpChild.dateOfBirth) || 'Age verified'}
                    </p>
                  </div>

                  {/* Two column grid */}
                  <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3.5 text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider block">Class</span>
                      <span className="font-semibold text-gray-800 block mt-0.5 truncate">
                        {lookedUpChild.ageGroup || lookedUpChild.className || 'General Room'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider block">Gender</span>
                      <span className="font-semibold text-gray-800 block mt-0.5 capitalize">
                        {lookedUpChild.gender || 'Not specified'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Care Notes Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" data-component-version="volunteer-child-care-notes-v1-stitch">
                  <div className="flex items-center space-x-2 text-gray-900 pb-1 border-b border-gray-50">
                    <ShieldCheck className="h-4.5 w-4.5 text-gray-500" />
                    <h4 className="text-sm font-serif font-bold">Care Notes</h4>
                  </div>
                  
                  <div className="space-y-3 text-xs">
                    {/* Medical Note Row */}
                    {medicalNoteText ? (
                      <div className="bg-[#FFF8F2] border border-[#FFEADA] rounded-2xl p-3 flex items-start space-x-2.5">
                        <span className="text-[#E07A5F] font-bold text-[10px] mt-0.5">⚠️</span>
                        <div>
                          <span className="text-[9px] font-bold text-[#E07A5F] uppercase tracking-wider block font-mono">Medical Note</span>
                          <p className="text-gray-800 font-medium mt-0.5 leading-relaxed">{medicalNoteText}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 flex items-start space-x-2.5">
                        <span className="text-gray-400 font-bold text-[10px] mt-0.5">✓</span>
                        <div>
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block font-mono">Medical Note</span>
                          <p className="text-gray-500 mt-0.5 font-medium">No medical note added.</p>
                        </div>
                      </div>
                    )}

                    {/* Allergies Row */}
                    {allergiesText ? (
                      <div className="bg-[#FFF8F2] border border-[#FFEADA] rounded-2xl p-3 flex items-start space-x-2.5">
                        <span className="text-[#E07A5F] font-bold text-[10px] mt-0.5">⚠️</span>
                        <div>
                          <span className="text-[9px] font-bold text-[#E07A5F] uppercase tracking-wider block font-mono">Allergies</span>
                          <p className="text-gray-800 font-medium mt-0.5 leading-relaxed">{allergiesText}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 flex items-start space-x-2.5">
                        <span className="text-gray-400 font-bold text-[10px] mt-0.5">✓</span>
                        <div>
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block font-mono">Allergies</span>
                          <p className="text-gray-500 mt-0.5 font-medium">No allergy added.</p>
                        </div>
                      </div>
                    )}

                    {/* Extra Support Row */}
                    {extraSupportText ? (
                      <div className="bg-[#FFF8F2] border border-[#FFEADA] rounded-2xl p-3 flex items-start space-x-2.5">
                        <span className="text-[#E07A5F] font-bold text-[10px] mt-0.5">⚠️</span>
                        <div>
                          <span className="text-[9px] font-bold text-[#E07A5F] uppercase tracking-wider block font-mono">Extra Support</span>
                          <p className="text-gray-800 font-medium mt-0.5 leading-relaxed">{extraSupportText}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 flex items-start space-x-2.5">
                        <span className="text-gray-400 font-bold text-[10px] mt-0.5">✓</span>
                        <div>
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block font-mono">Extra Support</span>
                          <p className="text-gray-500 mt-0.5 font-medium">None required.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Entry Status Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" data-component-version="volunteer-child-entry-status-v1-stitch">
                  <h4 className="text-lg font-serif font-bold text-gray-950">Entry Status</h4>
                  
                  {/* Status Info Box */}
                  <div className="flex items-start space-x-3.5 bg-gray-50/50 border border-gray-100 rounded-2xl p-4">
                    <div className="p-2 bg-amber-50 rounded-xl text-amber-600 shrink-0">
                      <Clock className="h-5 w-5 stroke-[2]" />
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-gray-900 leading-tight">
                        {isAlreadyCheckedIn ? 'Already checked in' : 'Not checked in yet'}
                      </h5>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {isAlreadyCheckedIn 
                          ? `Checked in at ${formatTime(lookedUpChild.checkedInAt || lookedUpChild.checked_in_at || new Date().toISOString())}` 
                          : 'Ready for processing'}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="space-y-3 pt-1">
                    <button
                      onClick={() => {
                        if (isAlreadyCheckedIn) {
                          showSuccess('Record Active', `${lookedUpChild.fullName} is already checked in.`);
                        } else {
                          handleConfirmCheckIn(lookedUpChild);
                        }
                      }}
                      disabled={scanLoading}
                      className={`w-full text-white font-bold tracking-widest py-3.5 rounded-2xl text-xs transition-all shadow-md uppercase cursor-pointer flex items-center justify-center space-x-2 ${
                        isAlreadyCheckedIn 
                          ? 'bg-gray-400 hover:bg-gray-500' 
                          : 'bg-[#C59B27] hover:bg-[#A47E1F] text-white'
                      }`}
                    >
                      {scanLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <UserCheck className="h-4 w-4 stroke-[2.5]" />
                          <span>{isAlreadyCheckedIn ? 'VIEW RECORD' : 'MARK CHECKED IN'}</span>
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
                      className="w-full border border-gray-300 hover:border-gray-400 text-gray-800 font-bold tracking-widest py-3.5 rounded-2xl text-xs transition-all uppercase text-center cursor-pointer block bg-white hover:bg-gray-50 flex items-center justify-center space-x-2"
                    >
                      <QrCode className="h-4 w-4 text-gray-600 stroke-[2]" />
                      <span>SCAN ANOTHER PASS</span>
                    </button>
                  </div>

                  {/* Helper Reminder */}
                  <div className="flex items-center justify-center space-x-1.5 text-[10px] text-gray-400 mt-2">
                    <Info className="h-3.5 w-3.5" />
                    <span>Confirm the child photo before marking entry.</span>
                  </div>
                </div>

                {/* Authorized Pickup Card */}
                {lookedUpChild.pickup ? (
                  <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" data-component-version="volunteer-child-authorized-pickup-v1-stitch">
                    <h4 className="text-[10px] font-mono font-bold text-gray-400 tracking-wider uppercase">
                      Authorized Pickup
                    </h4>
                    <div className="flex items-center space-x-3.5">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-50 border border-gray-150 shrink-0 flex items-center justify-center">
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
                        <h5 className="text-sm font-bold text-gray-900 leading-tight">
                          {lookedUpChild.pickup.fullName}
                        </h5>
                        <p className="text-[10px] text-[#C59B27] font-bold font-mono uppercase tracking-wider mt-0.5">
                          {lookedUpChild.pickup.relationship || 'Authorized Person'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {lookedUpChild.pickup.phone || 'No phone number provided'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-3" data-component-version="volunteer-child-authorized-pickup-v1-stitch">
                    <h4 className="text-[10px] font-mono font-bold text-gray-400 tracking-wider uppercase">
                      Authorized Pickup
                    </h4>
                    <p className="text-xs text-gray-500 leading-relaxed bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
                      No pickup person has been added.
                    </p>
                  </div>
                )}
              </div>
            );
          })() : (
            /* ==================== 2. SCANNER VIEW (Stitch Design) ==================== */
            <div className="max-w-md mx-auto space-y-6 w-full pb-12" data-view-version="volunteer-check-in-v2-stitch">
              
              {/* Tall Portrait Scan Card */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden shadow-xs relative" 
                data-component-version="volunteer-check-in-scan-card-v2-stitch"
              >
                <div className="aspect-[3/4] bg-neutral-950 relative flex flex-col items-center justify-center overflow-hidden">
                  {/* Blurred warm background when camera is inactive */}
                  {!cameraActive && (
                    <div 
                      className="absolute inset-0 bg-cover bg-center filter blur-xs opacity-45 scale-105"
                      style={{ 
                        backgroundImage: `url('https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&q=80&w=600')`,
                        referrerPolicy: 'no-referrer' as any
                      }}
                    />
                  )}

                  {cameraActive ? (
                    <>
                      <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                      />
                      
                      {/* Gold overlay frame */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-56 h-56 border border-white/25 rounded-2xl relative flex items-center justify-center">
                          {/* Antique Gold corner highlights */}
                          <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-[#C59B27] rounded-tl-lg"></div>
                          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-[#C59B27] rounded-tr-lg"></div>
                          <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-[#C59B27] rounded-bl-lg"></div>
                          <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-[#C59B27] rounded-br-lg"></div>
                          
                          {/* Scanning Sweep line */}
                          <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-[#C59B27] to-transparent top-0 animate-bounce"></div>
                        </div>
                      </div>

                      {/* Camera Controls Overlay */}
                      <div className="absolute top-3 right-3 flex items-center space-x-2">
                        {cameras.length > 1 && (
                          <select
                            value={selectedCameraId}
                            onChange={(e) => setSelectedCameraId(e.target.value)}
                            className="text-[10px] font-bold text-gray-800 bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none shadow-xs cursor-pointer"
                          >
                            {cameras.map((cam, i) => (
                              <option key={cam.deviceId} value={cam.deviceId}>
                                {cam.label || `Cam ${i + 1}`}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => setCameraActive(false)}
                          className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-6 z-10">
                      {/* Antique Gold corners even when camera is inactive */}
                      <div className="absolute inset-12 pointer-events-none border border-white/10 rounded-2xl">
                        <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-[#C59B27] rounded-tl-lg"></div>
                        <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-[#C59B27] rounded-tr-lg"></div>
                        <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-[#C59B27] rounded-bl-lg"></div>
                        <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-[#C59B27] rounded-br-lg"></div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-white font-serif font-bold text-lg">Scan child pass</p>
                        <p className="text-xs text-white/60 max-w-[200px] mx-auto leading-relaxed">
                          Align the child's entry pass QR inside the viewfinder area.
                        </p>
                      </div>

                      <button
                        onClick={() => setCameraActive(true)}
                        className="px-6 py-3 bg-white text-gray-900 font-bold text-xs tracking-wider rounded-full hover:bg-gray-100 transition-all active:scale-95 shadow-md flex items-center space-x-2 uppercase cursor-pointer"
                      >
                        <Camera className="h-4 w-4" />
                        <span>Scan child pass</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Support message if scanner is not available on device */}
              {cameras.length === 0 && !cameraActive && (
                <div className="text-xs text-center text-amber-600 bg-amber-50 border border-amber-100 rounded-2xl p-4">
                  Scanner is not available on this device. Enter the pass code manually.
                </div>
              )}

              {/* Manual Pass Code Toggle Button */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="w-full border border-gray-200 hover:border-gray-300 text-gray-700 font-bold text-xs tracking-wider py-4 px-4 rounded-2xl transition-all uppercase flex items-center justify-center space-x-2 bg-white hover:bg-gray-50 cursor-pointer shadow-xs"
                  data-component-version="volunteer-check-in-manual-pass-v2-stitch"
                >
                  <Keyboard className="h-4 w-4 text-gray-400" />
                  <span>Enter pass code manually</span>
                </button>

                {/* Manual Pass Code Input Form */}
                {showManualInput && (
                  <form onSubmit={handleManualVerifySubmit} className="flex gap-3 animate-fade-in bg-white border border-[#EAE8E1] p-4 rounded-3xl shadow-sm">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                        placeholder="e.g. 6E80A7"
                        disabled={scanLoading}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-sm font-bold tracking-widest placeholder:tracking-normal outline-none focus:border-[#C59B27] focus:bg-white transition-all disabled:opacity-60"
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
                      className="px-5 bg-neutral-900 hover:bg-neutral-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs tracking-wide rounded-xl transition-all cursor-pointer flex items-center justify-center font-mono uppercase shrink-0"
                    >
                      {scanLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <span>Verify Pass</span>
                      )}
                    </button>
                  </form>
                )}
              </div>

              {/* Child Search Field */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchQuery.trim()) {
                    onNavigate('/volunteer/children');
                  }
                }}
                className="relative w-full"
                data-component-version="volunteer-check-in-search-v2-stitch"
              >
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find child by name or parent phone"
                  className="w-full bg-white border border-[#EAE8E1] rounded-2xl pl-11 pr-4 py-3.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-[#C59B27] transition-all shadow-xs"
                />
              </form>

              {/* Last Checked In Card */}
              {(() => {
                const lastCheckedInItem = recentScans.find(
                  (log) => log.status === 'checked_in' || log.status === 'inside'
                ) || recentScans[0];

                return (
                  <div 
                    className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs flex items-center justify-between"
                    data-component-version="volunteer-check-in-last-v2-stitch"
                  >
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[#C59B27]/10 border border-[#C59B27]/25 flex items-center justify-center text-[#C59B27] shrink-0">
                        <Check className="h-5 w-5 stroke-[2.5]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Last checked in</p>
                        {lastCheckedInItem ? (
                          <>
                            <h4 className="text-sm font-bold text-gray-900 leading-tight truncate">
                              {lastCheckedInItem.childName}{lastCheckedInItem.ageGroup ? `, ${lastCheckedInItem.ageGroup}` : ''}
                            </h4>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              Checked in at {formatTime(lastCheckedInItem.timestamp)}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-500 font-medium mt-0.5">
                            No child has been checked in yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Metrics Row */}
              <div 
                className="grid grid-cols-3 gap-3"
                data-component-version="volunteer-check-in-metrics-v2-stitch"
              >
                <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 text-center">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block font-mono">Expected</span>
                  <span className="text-2xl font-serif text-gray-900 font-bold block mt-1.5">{stats.expected || 0}</span>
                </div>
                <div className="bg-[#C59B27]/5 border border-[#C59B27]/20 rounded-2xl p-4 text-center">
                  <span className="text-[9px] font-bold text-[#C59B27] uppercase tracking-widest block font-mono">Checked in</span>
                  <span className="text-2xl font-serif text-[#C59B27] font-bold block mt-1.5">{stats.checkedIn || 0}</span>
                </div>
                <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 text-center">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block font-mono">Waiting</span>
                  <span className="text-2xl font-serif text-gray-800 font-bold block mt-1.5">
                    {Math.max((stats.expected || 0) - (stats.checkedIn || 0), 0)}
                  </span>
                </div>
              </div>

              {/* Offline Note */}
              <div className="text-center pt-2">
                <p className="text-[10px] text-gray-400 font-mono tracking-wider uppercase">
                  Offline mode available if connection drops
                </p>
              </div>

            </div>
          )
        )}

        {cleanRoute === '/volunteer/pickup' && (
          /* ==================== 2.7 CHILD PICKUP & RELEASE VIEW (Request 4) ==================== */
          pickupSuccessResult ? (
            /* ==================== PICKUP SUCCESS SCREEN ==================== */
            <div className="max-w-md mx-auto w-full px-4 space-y-6 pt-6 pb-12 animate-fade-in" data-view-version="volunteer-pickup-success-v1-stitch">
              
              {/* Centered success block */}
              <div className="text-center space-y-4" data-component-version="volunteer-pickup-success-title-v1-stitch">
                <div className="mx-auto w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 border border-emerald-100">
                  <Check className="h-6 w-6 stroke-[3]" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-3xl font-serif font-black text-gray-900 tracking-tight">Picked up</h2>
                  <p className="text-xs text-gray-500 leading-normal max-w-sm mx-auto">
                    {pickupSuccessResult.child?.firstName || pickupSuccessResult.child?.fullName?.split(' ')[0] || 'This child'} has been released to the approved pickup person.
                  </p>
                </div>
              </div>

              {/* Child summary card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-4 flex items-center space-x-3.5 shadow-xs" data-component-version="volunteer-pickup-success-child-card-v1-stitch">
                <div className="w-12 h-12 rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center shrink-0">
                  {pickupSuccessResult.child?.photoUrl ? (
                    <img
                      src={pickupSuccessResult.child.photoUrl}
                      alt="Child"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User className="h-6 w-6 text-gray-400 stroke-[1.5]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-serif font-bold text-gray-950 truncate">
                    {pickupSuccessResult.child?.fullName}
                  </h3>
                  <p className="text-[11px] text-gray-500 font-semibold mt-0.5">
                    {pickupSuccessResult.child?.age ? `${pickupSuccessResult.child.age} years old` : 'Verified age'} • {pickupSuccessResult.child?.classGroup || 'Class assigned'}
                  </p>
                </div>
              </div>

              {/* Pickup details card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" data-component-version="volunteer-pickup-success-details-v1-stitch">
                <h4 className="text-xs font-serif font-bold text-gray-900 tracking-wide">
                  Pickup details
                </h4>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-gray-50">
                    <span className="text-gray-400 font-semibold">Picked up at</span>
                    <span className="font-mono font-bold text-gray-900">
                      {pickupSuccessResult.pickup?.pickedUpAt ? new Date(pickupSuccessResult.pickup.pickedUpAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-50">
                    <span className="text-gray-400 font-semibold">Picked up by</span>
                    <span className="font-bold text-gray-900">
                      {pickupSuccessResult.pickup?.pickedUpBy?.fullName || 'Approved Pickup Person'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-50">
                    <span className="text-gray-400 font-semibold">Relationship</span>
                    <span className="font-bold text-gray-950">
                      {pickupSuccessResult.pickup?.pickedUpBy?.relationship || 'Parent'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-gray-50">
                    <span className="text-gray-400 font-semibold">Confirmed by</span>
                    <span className="font-bold text-gray-950">
                      {pickupSuccessResult.pickup?.confirmedBy?.fullName || volunteerProfile?.full_name || 'Event Worker'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-gray-400 font-semibold">Pickup point</span>
                    <span className="font-bold text-[#C59B27]">
                      {pickupSuccessResult.pickup?.point || 'Main exit'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Checked before release card */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4" data-component-version="volunteer-pickup-success-verification-v1-stitch">
                <h4 className="text-xs font-serif font-bold text-gray-900 tracking-wide">
                  Checked before release
                </h4>
                
                <div className="grid grid-cols-2 gap-3.5">
                  {/* Child Photo Box */}
                  <div className="relative aspect-square w-full rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 flex flex-col justify-end">
                    {pickupSuccessResult.child?.photoUrl ? (
                      <img
                        src={pickupSuccessResult.child.photoUrl}
                        alt="Child"
                        className="absolute inset-0 w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <User className="h-8 w-8 text-gray-300 stroke-[1.5]" />
                      </div>
                    )}
                    <div className="relative z-10 bg-neutral-950/65 text-white text-[9px] font-bold text-center py-1.5 uppercase tracking-wider leading-none">
                      Child
                    </div>
                  </div>

                  {/* Pickup Person Photo Box */}
                  <div className="relative aspect-square w-full rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 flex flex-col justify-end">
                    {pickupSuccessResult.pickup?.pickedUpBy?.photoUrl ? (
                      <img
                        src={pickupSuccessResult.pickup.pickedUpBy.photoUrl}
                        alt="Pickup Person"
                        className="absolute inset-0 w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <User className="h-8 w-8 text-gray-300 stroke-[1.5]" />
                      </div>
                    )}
                    <div className="relative z-10 bg-neutral-950/65 text-white text-[9px] font-bold text-center py-1.5 uppercase tracking-wider leading-none">
                      Pickup Person
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1 text-xs font-semibold text-gray-900">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-100">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                    <span className="text-gray-800">Child photo matched</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-100">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                    <span className="text-gray-800">Pickup person confirmed</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-3.5 pt-2" data-component-version="volunteer-pickup-success-actions-v1-stitch">
                <button
                  onClick={() => {
                    setPickupSuccessResult(null);
                    setPickupChild(null);
                  }}
                  className="w-full bg-[#C59B27] hover:bg-[#A47E1F] text-white font-bold tracking-wider py-4 rounded-2xl text-xs uppercase flex items-center justify-center space-x-2 transition-all shadow-sm cursor-pointer"
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
                  className="w-full bg-white border border-[#EAE8E1] hover:bg-gray-50 text-gray-800 font-bold tracking-wider py-3.5 rounded-2xl text-xs uppercase text-center transition-all cursor-pointer shadow-xs"
                >
                  View child record
                </button>

                <button
                  onClick={() => {
                    setPickupSuccessResult(null);
                    onNavigate('/volunteer/event');
                  }}
                  className="w-full text-center text-xs font-serif font-bold text-[#C59B27] hover:text-[#A47E1F] cursor-pointer block py-2 transition-all"
                >
                  Back to Event Home
                </button>
              </div>

              {/* Stitch Metrics Card */}
              <div className="grid grid-cols-3 gap-1 bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs text-center" data-component-version="volunteer-pickup-success-metrics-v1-stitch">
                <div className="space-y-1">
                  <span className="text-xl font-serif font-black text-gray-900 block">
                    {Number(pickupSuccessResult.stats?.inside ?? stats.checkedIn ?? 0)}
                  </span>
                  <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider block">Children inside</span>
                </div>
                <div className="space-y-1 border-x border-gray-100">
                  <span className="text-xl font-serif font-black text-gray-900 block">
                    {Number(pickupSuccessResult.stats?.pickedUp ?? stats.pickedUp ?? 0)}
                  </span>
                  <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider block">Picked up</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xl font-serif font-black text-[#C59B27] block">
                    {Number(pickupSuccessResult.stats?.attention ?? stats.attention ?? 0)}
                  </span>
                  <span className="text-[9px] font-mono font-bold text-[#C59B27] uppercase tracking-wider block">Needs attention</span>
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
            <div className="max-w-md mx-auto w-full px-4 space-y-6 pt-4 pb-12 animate-fade-in" data-view-version="volunteer-pickup-v1-stitch">
              
              {/* Event label */}
              <div className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[#C59B27] font-bold">
                THE GENERAL ASSEMBLY CHILDREN AND TEENS
              </div>

              {/* Scan Viewfinder (Phase 4) */}
              <div 
                className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden shadow-xs relative" 
                data-component-version="volunteer-pickup-scan-card-v1-stitch"
              >
                <div className="aspect-[3/4] bg-neutral-950 relative flex flex-col items-center justify-center overflow-hidden">
                  {/* Blurred warm background when camera is inactive */}
                  {!cameraActive && (
                    <div 
                      className="absolute inset-0 bg-cover bg-center filter blur-xs opacity-45 scale-105"
                      style={{ 
                        backgroundImage: `url('https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&q=80&w=600')`,
                        referrerPolicy: 'no-referrer' as any
                      }}
                    />
                  )}

                  {cameraActive ? (
                    <>
                      <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                      />
                      
                      {/* Gold overlay frame */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-56 h-56 border border-white/25 rounded-2xl relative flex items-center justify-center">
                          {/* Antique Gold corner highlights */}
                          <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-[#C59B27] rounded-tl-lg"></div>
                          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-[#C59B27] rounded-tr-lg"></div>
                          <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-[#C59B27] rounded-bl-lg"></div>
                          <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-[#C59B27] rounded-br-lg"></div>
                          
                          {/* Scanning Sweep line */}
                          <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-[#C59B27] to-transparent top-0 animate-bounce"></div>
                        </div>
                      </div>

                      {/* Camera Controls Overlay */}
                      <div className="absolute top-3 right-3 flex items-center space-x-2">
                        {cameras.length > 1 && (
                          <select
                            value={selectedCameraId}
                            onChange={(e) => setSelectedCameraId(e.target.value)}
                            className="text-[10px] font-bold text-gray-800 bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none shadow-xs cursor-pointer"
                          >
                            {cameras.map((cam) => (
                              <option key={cam.deviceId} value={cam.deviceId}>
                                {cam.label || 'Camera'}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => setCameraActive(false)}
                          className="bg-white/85 text-gray-800 hover:bg-white rounded-lg p-1.5 text-xs font-bold shadow-xs cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Gold corners framing the scan target */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-56 h-56 relative">
                          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-[#C59B27] rounded-tl-lg"></div>
                          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-[#C59B27] rounded-tr-lg"></div>
                          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-[#C59B27] rounded-bl-lg"></div>
                          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-[#C59B27] rounded-br-lg"></div>
                        </div>
                      </div>

                      {/* Pill button at the center */}
                      <button
                        onClick={() => {
                          setScanMode('check_out');
                          setCameraActive(true);
                        }}
                        className="relative z-10 bg-white hover:bg-gray-50 text-gray-950 font-serif font-extrabold text-sm px-6 py-3 rounded-full flex items-center space-x-2 shadow-lg transition-all cursor-pointer border border-[#EAE8E1]"
                      >
                        <QrCode className="h-4.5 w-4.5 text-[#C59B27]" />
                        <span>Scan child pass</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Manual Pass Code Button & Slide Section (Phase 5) */}
              <div className="space-y-3" data-component-version="volunteer-pickup-manual-pass-v1-stitch">
                <button
                  onClick={() => setShowPickupManualInput(!showPickupManualInput)}
                  className="w-full bg-white border border-[#EAE8E1] hover:bg-gray-50 text-gray-800 font-bold py-3.5 rounded-2xl text-xs transition-all uppercase cursor-pointer flex items-center justify-center space-x-2 shadow-xs"
                >
                  <Keyboard className="h-4 w-4 text-gray-600" />
                  <span>Enter pass code manually</span>
                </button>

                {showPickupManualInput && (
                  <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-4 animate-fade-in">
                    <div className="space-y-1 text-center">
                      <h5 className="text-xs font-bold text-gray-900">Enter Pass Code</h5>
                      <p className="text-[11px] text-gray-400">
                        Enter the 6-character pass reference code (e.g. 6E80A7)
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
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold tracking-widest placeholder:tracking-normal outline-none focus:border-[#C59B27] focus:bg-white transition-all disabled:opacity-60 text-center uppercase"
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
                        className="px-5 bg-[#C59B27] hover:bg-[#A47E1F] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center uppercase"
                      >
                        {pickupLoading ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                          <span>Verify</span>
                        )}
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* OR Divider (Phase 6) */}
              <div className="flex items-center space-x-3 py-1" data-component-version="volunteer-pickup-divider-v1-stitch">
                <div className="flex-1 h-[1px] bg-gray-200"></div>
                <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest">OR</span>
                <div className="flex-1 h-[1px] bg-gray-200"></div>
              </div>

              {/* Search Field (Phase 7) */}
              <div className="relative" data-component-version="volunteer-pickup-search-v1-stitch">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Find child by name or parent phone"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSearchQuery(e.currentTarget.value);
                      onNavigate('/volunteer/children');
                    }
                  }}
                  className="w-full bg-white border border-[#EAE8E1] rounded-2xl pl-10 pr-4 py-3 text-xs font-semibold text-gray-800 placeholder-gray-400 focus:border-[#C59B27] outline-none transition-all shadow-xs"
                />
              </div>

              {/* Confirm before release alert (Phase 8) */}
              <div className="bg-amber-50/50 border border-amber-200/60 rounded-3xl p-5 shadow-xs flex items-start space-x-3 text-amber-800" data-component-version="volunteer-pickup-warning-v1-stitch">
                <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h5 className="text-xs font-bold text-amber-900">Confirm before release</h5>
                  <p className="text-[11px] text-amber-700 leading-normal">
                    Check the child photo and pickup person before marking pickup.
                  </p>
                </div>
              </div>

              {/* Pickup metrics (Phase 9) */}
              <div className="grid grid-cols-3 gap-1 bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs text-center" data-component-version="volunteer-pickup-metrics-v1-stitch">
                <div className="space-y-1">
                  <span className="text-xl font-serif font-black text-gray-900 block">
                    {Number(pickupStats.inside || stats.checkedIn || 0)}
                  </span>
                  <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider block">INSIDE</span>
                </div>
                <div className="space-y-1 border-x border-gray-100">
                  <span className="text-xl font-serif font-black text-gray-900 block">
                    {Number(pickupStats.pickedUp || stats.pickedUp || 0)}
                  </span>
                  <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider block">PICKED UP</span>
                </div>
                <div className="space-y-1">
                  <span className="text-xl font-serif font-black text-[#C59B27] block">
                    {Number(pickupStats.attention || stats.attention || 0)}
                  </span>
                  <span className="text-[9px] font-mono font-bold text-[#C59B27] uppercase tracking-wider block">ATTENTION</span>
                </div>
              </div>

              {/* Last Picked Up card (Phase 10) */}
              <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 shadow-xs space-y-3.5" data-component-version="volunteer-pickup-last-v1-stitch">
                <h4 className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-[0.15em]">
                  LAST PICKED UP
                </h4>
                {pickupLastChild ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {pickupLastChild.photoUrl ? (
                          <img
                            src={pickupLastChild.photoUrl}
                            alt={pickupLastChild.childName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User className="h-5 w-5 text-gray-400 stroke-[1.5]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-sm font-serif font-bold text-gray-950 truncate">
                          {pickupLastChild.childName || 'Child'}
                        </h5>
                        <p className="text-[10px] text-gray-500 font-semibold mt-0.5">
                          {pickupLastChild.age ? `${pickupLastChild.age} yrs` : pickupLastChild.schoolClass || 'Class verified'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-[10px] text-gray-400 font-mono font-semibold">
                        {new Date(pickupLastChild.timestamp || pickupLastChild.releasedAt || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="w-5 h-5 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-100">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic text-center py-2 bg-[#FAF9F6] border border-[#EAE8E1]/60 rounded-2xl">
                    No child has been picked up yet.
                  </p>
                )}
              </div>
            </div>
          )
        )}

        {cleanRoute === '/volunteer/children' && (
          selectedChildId ? (
            /* ==================== CHILD PROFILE VIEW ==================== */
            childProfileLoading || !childProfileData ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="w-12 h-12 border-4 border-[#C59B27]/30 border-t-[#C59B27] rounded-full animate-spin"></div>
                <p className="text-sm font-semibold text-gray-500 font-mono">Loading child profile...</p>
              </div>
            ) : (
              <div className="space-y-6 animate-fade-in pb-12 max-w-md mx-auto" data-view-version="volunteer-child-profile-v1-stitch">
                
                {/* Child Identity Section */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 shadow-xs text-center flex flex-col items-center space-y-4" data-component-version="volunteer-child-profile-identity-v1-stitch">
                  {/* Photo with soft gold border */}
                  <div className="relative">
                    <div className="w-28 h-28 rounded-3xl border-2 border-[#C59B27]/40 p-1 bg-white shadow-xs inline-block overflow-hidden relative">
                      {childProfileData.child.photoUrl ? (
                        <img
                          src={childProfileData.child.photoUrl}
                          alt={childProfileData.child.fullName || childProfileData.child.name}
                          className="w-full h-full object-cover rounded-2xl"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full bg-[#FAF9F5] flex items-center justify-center rounded-2xl">
                          <User className="h-12 w-12 text-[#C59B27]/30" />
                        </div>
                      )}
                    </div>
                    {/* Overlapping status badge below photo */}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 shadow-xs whitespace-nowrap z-10">
                      {childProfileData.child.status === 'inside' && (
                        <span className="inline-flex items-center space-x-1 px-3 py-1 bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9] rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4CAF50]"></span>
                          <span>Inside</span>
                        </span>
                      )}
                      {childProfileData.child.status === 'not_arrived' && (
                        <span className="inline-flex items-center space-x-1 px-3 py-1 bg-[#F5F5F5] text-[#616161] border border-[#E0E0E0] rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#9E9E9E]"></span>
                          <span>Not arrived</span>
                        </span>
                      )}
                      {childProfileData.child.status === 'picked_up' && (
                        <span className="inline-flex items-center space-x-1 px-3 py-1 bg-[#FFF8E1] text-[#F57F17] border border-[#FFE082] rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#FFC107]"></span>
                          <span>Picked up</span>
                        </span>
                      )}
                      {childProfileData.child.status === 'needs_attention' && (
                        <span className="inline-flex items-center space-x-1 px-3 py-1 bg-[#FFEBEE] text-[#C62828] border border-[#FFCDD2] rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F44336]"></span>
                          <span>Needs attention</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Identity Detail */}
                  <div className="pt-2">
                    <h2 className="text-xl font-serif font-bold text-gray-950 leading-tight">
                      {childProfileData.child.fullName || childProfileData.child.name}
                    </h2>
                    <div className="flex items-center justify-center space-x-2 mt-2">
                      <span className="px-2.5 py-1 bg-[#FAF9F5] border border-[#EAE8E1] text-gray-700 rounded-lg text-[10px] font-bold uppercase tracking-wide">
                        {childProfileData.child.age ? `${childProfileData.child.age} years old` : 'Age unknown'}
                      </span>
                      {childProfileData.child.classGroup && (
                        <span className="px-2.5 py-1 bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 rounded-lg text-[10px] font-bold uppercase tracking-wide">
                          {childProfileData.child.classGroup}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick Facts Row */}
                  <div className="grid grid-cols-3 gap-1 border-t border-b border-[#FAF9F5] py-4 w-full" data-component-version="volunteer-child-profile-facts-v1-stitch">
                    <div className="flex flex-col items-center text-center px-1">
                      <User className="h-4 w-4 text-[#C59B27]/60 mb-1" />
                      <span className="text-[10px] text-gray-400 font-medium">Gender</span>
                      <span className="text-xs font-bold text-gray-800 mt-1 truncate max-w-full">
                        {childProfileData.child.gender || 'Not provided'}
                      </span>
                    </div>
                    <div className="flex flex-col items-center text-center border-x border-gray-100 px-1">
                      <Users className="h-4 w-4 text-[#C59B27]/60 mb-1" />
                      <span className="text-[10px] text-gray-400 font-medium">Parent</span>
                      <span className="text-xs font-bold text-gray-800 mt-1 truncate max-w-full">
                        {childProfileData.parent.fullName || childProfileData.parent.name || 'Not provided'}
                      </span>
                    </div>
                    <div className="flex flex-col items-center text-center px-1">
                      <Phone className="h-4 w-4 text-[#C59B27]/60 mb-1" />
                      <span className="text-[10px] text-gray-400 font-medium">Contact</span>
                      <span className="text-xs font-mono font-bold text-gray-800 mt-1 truncate max-w-full">
                        {childProfileData.parent.phone || 'Not provided'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="space-y-3" data-component-version="volunteer-child-profile-actions-v1-stitch">
                  <button
                    onClick={() => handlePreparePickup(childProfileData.child.id)}
                    disabled={childProfileData.child.status !== 'inside' || pickupLoading}
                    className={`w-full py-3.5 rounded-2xl text-xs font-bold uppercase transition-all flex items-center justify-center space-x-2 ${
                      childProfileData.child.status === 'inside'
                        ? 'bg-[#C59B27] hover:bg-[#A47E1F] text-white cursor-pointer hover:shadow-xs active:scale-[0.99]'
                        : 'bg-[#F5F4F0] text-gray-400 border border-gray-150 cursor-not-allowed'
                    }`}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>{pickupLoading ? 'Processing...' : 'Start pickup'}</span>
                  </button>

                  <button
                    onClick={() => onNavigate('/volunteer/scan')}
                    className="w-full py-3 bg-white hover:bg-[#FAF9F5] text-gray-700 font-bold text-xs tracking-wider rounded-2xl transition-all border border-[#EAE8E1] uppercase flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.99]"
                  >
                    <QrCode className="h-4 w-4 text-[#C59B27]" />
                    <span>Scan another pass</span>
                  </button>
                </div>

                {/* Today Status Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 space-y-4" data-component-version="volunteer-child-profile-today-v1-stitch">
                  <h3 className="text-xs font-serif font-bold text-gray-950 uppercase tracking-wide">Today</h3>
                  
                  <div className="space-y-3 text-xs">
                    {/* Entry Row */}
                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                      <div className="flex items-center space-x-2.5">
                        <LogIn className="h-4 w-4 text-emerald-600" />
                        <span className="text-gray-500 font-medium">Entry</span>
                      </div>
                      <span className="font-bold text-gray-800">
                        {childProfileData.child.checkedInAt ? (
                          `Checked in at ${new Date(childProfileData.child.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        ) : (
                          'Not checked in yet'
                        )}
                      </span>
                    </div>

                    {/* Pickup Row */}
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center space-x-2.5">
                        <LogOut className="h-4 w-4 text-[#C59B27]" />
                        <span className="text-gray-500 font-medium">Pickup</span>
                      </div>
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

                {/* Care Notes Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 space-y-4" data-component-version="volunteer-child-profile-care-notes-v1-stitch">
                  <h3 className="text-xs font-serif font-bold text-gray-950 uppercase tracking-wide">Care notes</h3>
                  
                  <div className="space-y-2.5">
                    {childProfileData.child.medicalNote ? (
                      <div className="p-3 bg-red-50/50 border border-red-100 rounded-2xl flex items-start space-x-2.5">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-red-500 font-bold uppercase leading-none">Medical Note</p>
                          <p className="text-xs font-semibold text-red-800 mt-1">{childProfileData.child.medicalNote}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2.5 text-xs text-gray-400 py-1 px-1">
                        <Check className="h-4 w-4 text-gray-300" />
                        <span>No medical note added</span>
                      </div>
                    )}

                    {childProfileData.child.allergies ? (
                      <div className="p-3 bg-orange-50/50 border border-orange-100 rounded-2xl flex items-start space-x-2.5">
                        <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-orange-500 font-bold uppercase leading-none">Allergy</p>
                          <p className="text-xs font-semibold text-orange-800 mt-1">{childProfileData.child.allergies}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2.5 text-xs text-gray-400 py-1 px-1 border-t border-gray-50">
                        <Check className="h-4 w-4 text-gray-300" />
                        <span>No allergy added</span>
                      </div>
                    )}

                    {childProfileData.child.extraSupport ? (
                      <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-start space-x-2.5">
                        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-blue-500 font-bold uppercase leading-none">Extra Support</p>
                          <p className="text-xs font-semibold text-blue-800 mt-1">{childProfileData.child.extraSupport}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2.5 text-xs text-gray-400 py-1 px-1 border-t border-gray-50">
                        <Check className="h-4 w-4 text-gray-300" />
                        <span>No extra support added</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Parent Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 space-y-4" data-component-version="volunteer-child-profile-parent-v1-stitch">
                  <h3 className="text-xs font-serif font-bold text-gray-950 uppercase tracking-wide">Parent</h3>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-50 border border-gray-150 shrink-0 flex items-center justify-center">
                        {childProfileData.parent.photoUrl ? (
                          <img
                            src={childProfileData.parent.photoUrl}
                            alt={childProfileData.parent.fullName || childProfileData.parent.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User className="h-6 w-6 text-gray-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-gray-900 truncate leading-tight">
                          {childProfileData.parent.fullName || childProfileData.parent.name || 'Parent details not provided'}
                        </h4>
                        <p className="text-[10px] text-[#C59B27] mt-0.5 font-semibold">
                          {childProfileData.parent.relationship || 'Guardian'}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                          {childProfileData.parent.phone}
                        </p>
                      </div>
                    </div>

                    {childProfileData.parent.phone && (
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <a
                          href={`tel:${childProfileData.parent.phone}`}
                          className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-150 text-gray-600 rounded-xl transition-all shadow-xs"
                          title="Call parent"
                        >
                          <Phone className="h-4 w-4" />
                        </a>
                        <a
                          href={`https://wa.me/${childProfileData.parent.phone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-150 text-emerald-600 rounded-xl transition-all shadow-xs"
                          title="WhatsApp parent"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pickup Person Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 space-y-4" data-component-version="volunteer-child-profile-pickup-person-v1-stitch">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-serif font-bold text-gray-950 uppercase tracking-wide">Pickup person</h3>
                    {childProfileData.pickupPeople?.[0] && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 uppercase tracking-wider shrink-0">
                        {childProfileData.pickupPeople[0].label || 'Alternative'}
                      </span>
                    )}
                  </div>

                  {childProfileData.pickupPeople?.[0] ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-50 border border-gray-150 shrink-0 flex items-center justify-center">
                          {childProfileData.pickupPeople[0].photoUrl ? (
                            <img
                              src={childProfileData.pickupPeople[0].photoUrl}
                              alt={childProfileData.pickupPeople[0].fullName || childProfileData.pickupPeople[0].name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <User className="h-6 w-6 text-gray-300" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-gray-900 truncate leading-tight">
                            {childProfileData.pickupPeople[0].fullName || childProfileData.pickupPeople[0].name}
                          </h4>
                          <p className="text-[10px] text-gray-500 mt-0.5 font-semibold">
                            {childProfileData.pickupPeople[0].relationship || 'Authorized Pickup'}
                          </p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                            {childProfileData.pickupPeople[0].phone}
                          </p>
                        </div>
                      </div>

                      {childProfileData.pickupPeople[0].phone && (
                        <div className="flex items-center space-x-1.5 shrink-0">
                          <a
                            href={`tel:${childProfileData.pickupPeople[0].phone}`}
                            className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-150 text-gray-600 rounded-xl transition-all shadow-xs"
                            title="Call pickup person"
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic py-2 bg-gray-50/50 border border-gray-100 rounded-2xl text-center">
                      No pickup person has been added.
                    </p>
                  )}
                </div>

                {/* Event Details Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 space-y-4" data-component-version="volunteer-child-profile-event-details-v1-stitch">
                  <h3 className="text-xs font-serif font-bold text-gray-950 uppercase tracking-wide">Event details</h3>
                  
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

                {/* Today’s Activity Card */}
                <div className="bg-white border border-[#EAE8E1] rounded-3xl p-5 space-y-4" data-component-version="volunteer-child-profile-activity-v1-stitch">
                  <h3 className="text-xs font-serif font-bold text-gray-950 uppercase tracking-wide">Today’s activity</h3>
                  
                  <div className="relative pl-5 border-l border-gray-150 space-y-5 text-xs text-gray-600">
                    {/* Check-in Activity */}
                    <div className="relative">
                      <span className="absolute -left-[25.5px] top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white shadow-xs"></span>
                      <div className="space-y-0.5 text-left">
                        <h4 className="font-bold text-gray-800">
                          {childProfileData.todayActivity?.checkedInAt ? (
                            `Checked in at ${new Date(childProfileData.todayActivity.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          ) : (
                            'Pending event check-in'
                          )}
                        </h4>
                        <p className="text-[10px] text-gray-400">
                          {childProfileData.todayActivity?.checkedInBy ? (
                            `By ${childProfileData.todayActivity.checkedInBy.fullName}`
                          ) : (
                            'Waiting at Gate check-in point'
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Pickup Activity */}
                    <div className="relative">
                      <span className={`absolute -left-[25.5px] top-1.5 w-2.5 h-2.5 rounded-full border border-white shadow-xs ${childProfileData.todayActivity?.pickedUpAt ? 'bg-amber-500' : 'bg-gray-200'}`}></span>
                      <div className="space-y-0.5 text-left">
                        <h4 className="font-bold text-gray-800">
                          {childProfileData.todayActivity?.pickedUpAt ? (
                            `Picked up at ${new Date(childProfileData.todayActivity.pickedUpAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          ) : (
                            'Pickup waiting'
                          )}
                        </h4>
                        <p className="text-[10px] text-gray-400">
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
            <div className="space-y-6 max-w-md mx-auto" data-view-version="volunteer-children-v1-stitch">
              
              {/* Search Field */}
              <div className="relative" data-component-version="volunteer-children-search-v1-stitch">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <form onSubmit={(e) => { e.preventDefault(); fetchChildrenDirectory(); }} className="w-full">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Find child by name or parent phone"
                    className="w-full bg-[#F5F4F0] border-none rounded-2xl pl-12 pr-10 py-4 text-sm font-medium outline-none text-gray-800 placeholder-gray-400 focus:bg-white focus:ring-1 focus:ring-[#C59B27] transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(''); setTimeout(fetchChildrenDirectory, 0); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </form>
              </div>

              {/* Filter Chips */}
              <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1" data-component-version="volunteer-children-filters-v1-stitch">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'inside', label: 'Inside' },
                  { id: 'not_arrived', label: 'Not arrived' },
                  { id: 'picked_up', label: 'Picked up' }
                ].map((chip) => {
                  const isActive = activeDirectoryFilter === chip.id;
                  return (
                    <button
                      key={chip.id}
                      onClick={() => setActiveDirectoryFilter(chip.id)}
                      className={`px-5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-250 cursor-pointer ${
                        isActive 
                          ? 'bg-[#C59B27] text-white shadow-xs' 
                          : 'bg-white border border-[#EAE8E1] text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              {/* Metrics Strip */}
              <div className="bg-[#FAF9F5] border border-[#EAE8E1] rounded-3xl p-5" data-component-version="volunteer-children-metrics-v1-stitch">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="flex flex-col justify-between">
                    <span className="text-lg font-serif font-bold text-gray-950 leading-none">
                      {stats.expected || 0}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium mt-1.5 uppercase tracking-wide">
                      Expected
                    </span>
                  </div>
                  <div className="flex flex-col justify-between border-l border-gray-150">
                    <span className="text-lg font-serif font-bold text-[#2A7545] leading-none">
                      {stats.checkedIn || 0}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium mt-1.5 uppercase tracking-wide">
                      Inside
                    </span>
                  </div>
                  <div className="flex flex-col justify-between border-l border-gray-150">
                    <span className="text-lg font-serif font-bold text-gray-600 leading-none">
                      {stats.pickedUp || 0}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium mt-1.5 uppercase tracking-wide">
                      Picked Up
                    </span>
                  </div>
                  <div className="flex flex-col justify-between border-l border-gray-150">
                    <span className="text-lg font-serif font-bold text-[#C59B27] leading-none">
                      {stats.attention || 0}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium mt-1.5 uppercase tracking-wide">
                      Attention
                    </span>
                  </div>
                </div>
              </div>

              {/* Child List Cards */}
              <div className="space-y-3.5" data-component-version="volunteer-children-list-v1-stitch">
                {searching ? (
                  <div className="flex flex-col items-center justify-center py-16 space-y-3">
                    <div className="w-8 h-8 border-2 border-[#C59B27]/30 border-t-[#C59B27] rounded-full animate-spin"></div>
                    <p className="text-xs text-gray-400 font-mono">Loading children...</p>
                  </div>
                ) : directoryError ? (
                  <div className="bg-white border border-[#EAE8E1] rounded-3xl p-10 text-center text-red-500">
                    <p className="text-xs font-semibold">We could not load children right now. Please try again.</p>
                  </div>
                ) : directoryChildren.length > 0 ? (
                  directoryChildren.map((child) => {
                    const isInside = child.entryStatus === 'checked_in' || child.entryStatus === 'inside';
                    const isPickedUp = child.entryStatus === 'picked_up' || child.entryStatus === 'checked_out';
                    const isAttention = child.hasMedicalNotes || child.needsExtraSupport || child.entryStatus === 'under_review';
                    
                    // Determine status details
                    let statusLabel = 'Not arrived';
                    let badgeClass = 'bg-gray-100 text-gray-500 border border-gray-250';
                    let sideStripeClass = 'border-r-4 border-r-gray-300';
                    
                    if (isInside) {
                      statusLabel = 'Inside';
                      badgeClass = 'bg-emerald-50 text-[#2A7545] border border-emerald-100/50';
                      sideStripeClass = 'border-r-4 border-r-emerald-500';
                    } else if (isPickedUp) {
                      statusLabel = 'Picked up';
                      badgeClass = 'bg-[#F2F1EC] text-gray-500 border border-[#E4E2DC]';
                      sideStripeClass = 'border-r-4 border-r-gray-200';
                    } else if (isAttention) {
                      statusLabel = 'Needs attention';
                      badgeClass = 'bg-orange-50 text-orange-700 border border-orange-100';
                      sideStripeClass = 'border-r-4 border-r-orange-400';
                    } else {
                      statusLabel = 'Not arrived';
                      badgeClass = 'bg-gray-50 text-gray-400 border border-gray-150';
                      sideStripeClass = 'border-r-4 border-r-amber-300';
                    }

                    // Format age details if present
                    const ageText = child.age ? `${child.age} years` : 'Age unknown';
                    const ageGroupText = child.ageGroup ? ` • ${child.ageGroup}` : '';

                    return (
                      <div
                        key={child.childId}
                        onClick={() => setSelectedChildId(child.childId)}
                        className={`bg-white border border-[#EAE8E1] hover:border-[#C59B27]/40 rounded-3xl p-4 flex items-center justify-between transition-all duration-200 cursor-pointer shadow-xs active:scale-[0.99] group overflow-hidden ${sideStripeClass}`}
                      >
                        {/* Left Side: Photo & Identity */}
                        <div className="flex items-center space-x-3.5 min-w-0 flex-1 pr-3">
                          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-50 border border-gray-150 shrink-0 flex items-center justify-center">
                            {child.photoUrl ? (
                              <img
                                src={child.photoUrl}
                                alt={child.childName}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                                <User className="h-6 w-6 text-gray-300" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center space-x-2">
                              <h3 className="text-sm font-serif font-bold text-gray-900 truncate leading-tight group-hover:text-[#C59B27] transition-colors">
                                {child.childName}
                              </h3>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 ${badgeClass}`}>
                                {statusLabel}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-400 font-medium">
                              {ageText}{ageGroupText}
                            </p>
                            <p className="text-[11px] text-gray-500 font-medium leading-tight truncate">
                              {child.parentPhone ? `Phone: ${child.parentPhone}` : `Parent: ${child.parentName || 'Guardian'}`}
                            </p>
                            {child.hasMedicalNotes && (
                              <p className="text-[11px] font-semibold text-orange-600 leading-tight pt-0.5">
                                Medical note attached
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right Side Arrow */}
                        <ChevronRight className="h-4.5 w-4.5 text-gray-300 group-hover:text-[#C59B27] transition-colors shrink-0" />
                      </div>
                    );
                  })
                ) : (
                  <div className="bg-white border border-[#EAE8E1] rounded-3xl p-10 text-center text-gray-400">
                    <User className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold">No child matched your search.</p>
                  </div>
                )}
              </div>

              {/* Helper Note */}
              <div className="text-center pt-2 pb-6" data-component-version="volunteer-children-helper-v1-stitch">
                <p className="text-xs italic text-gray-400 font-medium">
                  Use search if a parent cannot open the pass.
                </p>
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
        <div data-view-version="volunteer-reports-v3-stitch-layout-fixed" className="max-w-md mx-auto w-full space-y-6 pb-20 px-4 animate-fade-in">
          {/* Main title & Subtitle */}
          <div className="space-y-1">
            <h2 className="text-3xl font-extrabold text-neutral-900 tracking-tight font-serif">Reports</h2>
            <p className="text-xs text-gray-500 font-medium">The General Assembly Children and Teens</p>
          </div>

          {reportsLoading && !reportsData ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-10 h-10 border-3 border-[#C59B27]/20 border-t-[#C59B27] rounded-full animate-spin"></div>
              <p className="text-xs text-gray-400 font-medium">Loading reports...</p>
            </div>
          ) : (
            <>
              {/* Today Summary Grid */}
              {(() => {
                const medicalPendingCount = reportsData?.needsAttention?.filter((item: any) => item.issueType === 'Medical alert' || item.issueType === 'Medical note pending')?.length || 0;
                const missingPhotoCount = reportsData?.needsAttention?.filter((item: any) => item.issueType === 'Missing pickup photo')?.length || 0;
                const manualReviewCount = reportsData?.needsAttention?.filter((item: any) => item.issueType === 'Needs age group review' || item.issueType === 'Manual review required')?.length || 0;
                const totalAttention = medicalPendingCount + missingPhotoCount + manualReviewCount;

                return (
                  <div className="space-y-6">
                    {/* Today Stats */}
                    <div data-component-version="volunteer-reports-today-v3-stitch-layout-fixed" className="space-y-4">
                      <h3 className="text-xl font-bold text-neutral-900 font-serif">Today</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Expected Card */}
                        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-xs flex flex-col justify-between h-28">
                          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Expected</span>
                          <span className="text-4xl font-bold font-serif text-neutral-900 leading-none">
                            {stats.expected || 0}
                          </span>
                        </div>
                        
                        {/* Checked In Card */}
                        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-xs flex flex-col justify-between h-28">
                          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Checked in</span>
                          <span className="text-4xl font-bold font-serif text-neutral-900 leading-none">
                            {stats.checkedIn || 0}
                          </span>
                        </div>
                        
                        {/* Picked Up Card */}
                        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-xs flex flex-col justify-between h-28">
                          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Picked up</span>
                          <span className="text-4xl font-bold font-serif text-neutral-900 leading-none">
                            {stats.pickedUp || 0}
                          </span>
                        </div>
                        
                        {/* Inside Card with Warm Gold Accent */}
                        <div className="bg-[#FAF9F5] border border-[#EAE8E1] rounded-2xl p-5 shadow-xs flex flex-col justify-between h-28">
                          <span className="text-[11px] font-bold text-[#C59B27] uppercase tracking-wider block">Inside</span>
                          <span className="text-4xl font-bold font-serif text-[#C59B27] leading-none">
                            {Math.max(0, (stats.checkedIn || 0) - (stats.pickedUp || 0))}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Needs Attention Card */}
                    <div data-component-version="volunteer-reports-attention-v3-stitch-layout-fixed" className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-xl font-bold text-neutral-900 font-serif">Needs attention</h3>
                        {totalAttention > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F97316] px-1.5 text-[11px] font-bold text-white leading-none">
                            {totalAttention}
                          </span>
                        )}
                      </div>
                      
                      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-xs">
                        {totalAttention > 0 ? (
                          <div className="space-y-4">
                            {medicalPendingCount > 0 && (
                              <div className="flex items-center justify-between py-1 border-b border-[#F4F3EF] last:border-0 last:pb-0 first:pt-0">
                                <div className="flex items-center space-x-3 text-gray-700">
                                  <Heart className="h-4 w-4 text-[#C59B27]" />
                                  <span className="text-xs font-medium">Medical note pending</span>
                                </div>
                                <span className="text-xs font-bold text-gray-500">({medicalPendingCount})</span>
                              </div>
                            )}

                            {missingPhotoCount > 0 && (
                              <div className="flex items-center justify-between py-1 border-b border-[#F4F3EF] last:border-0 last:pb-0 first:pt-0">
                                <div className="flex items-center space-x-3 text-gray-700">
                                  <Camera className="h-4 w-4 text-[#C59B27]" />
                                  <span className="text-xs font-medium">Missing pickup photo</span>
                                </div>
                                <span className="text-xs font-bold text-gray-500">({missingPhotoCount})</span>
                              </div>
                            )}

                            {manualReviewCount > 0 && (
                              <div className="flex items-center justify-between py-1 last:border-0 last:pb-0">
                                <div className="flex items-center space-x-3 text-gray-700">
                                  <UserCheck className="h-4 w-4 text-[#C59B27]" />
                                  <span className="text-xs font-medium">Manual review required</span>
                                </div>
                                <span className="text-xs font-bold text-gray-500">({manualReviewCount})</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 text-center py-2 font-medium">No attention items right now.</p>
                        )}
                      </div>
                    </div>

                    {/* Age Groups Distribution */}
                    <div data-component-version="volunteer-reports-age-groups-v3-stitch-layout-fixed" className="space-y-4">
                      <h3 className="text-xl font-bold text-neutral-900 font-serif">Age groups</h3>
                      <div className="space-y-4">
                        {(() => {
                          const ageGroupCards = [
                            { key: 'ages_1_3', name: 'Ages 1–3', matchKeys: ['creche', '1-3', 'toddler'], boys: 0, girls: 0, inside: 0 },
                            { key: 'ages_4_6', name: 'Ages 4–6', matchKeys: ['preschool', '4-6', '4-8'], boys: 0, girls: 0, inside: 0 },
                            { key: 'ages_7_9', name: 'Ages 7–9', matchKeys: ['7-9'], boys: 0, girls: 0, inside: 0 },
                            { key: 'ages_10_12', name: 'Ages 10–12', matchKeys: ['teens', '10-12', 'teen'], boys: 0, girls: 0, inside: 0 },
                          ];

                          // 1. Populate from reportsData.ageGroups for inside counts
                          if (reportsData?.ageGroups) {
                            reportsData.ageGroups.forEach((group: any) => {
                              const groupName = (group.ageGroup || '').toLowerCase();
                              const matchedCard = ageGroupCards.find(card => 
                                card.matchKeys.some(key => groupName.includes(key))
                              );
                              if (matchedCard) {
                                matchedCard.inside += Math.max(0, group.checkedIn - group.pickedUp);
                              }
                            });
                          }

                          // 2. Populate from directoryChildren to get precise boys, girls, inside counts
                          if (directoryChildren && directoryChildren.length > 0) {
                            // Reset counts first before using detailed children logic so we don't double count
                            ageGroupCards.forEach(card => {
                              card.boys = 0;
                              card.girls = 0;
                              card.inside = 0;
                            });

                            directoryChildren.forEach((child: any) => {
                              const childAgeGroup = (child.ageGroup || child.age_group || '').toLowerCase();
                              const matchedCard = ageGroupCards.find(card => 
                                card.matchKeys.some(key => childAgeGroup.includes(key))
                              );
                              if (matchedCard) {
                                const isInside = child.status === 'checked_in' || child.status === 'inside' || child.attendanceStatus === 'checked_in' || child.attendanceStatus === 'inside';
                                const genderStr = (child.gender || '').toLowerCase();
                                const isBoy = genderStr.startsWith('b') || genderStr === 'male' || genderStr === 'm';
                                const isGirl = genderStr.startsWith('g') || genderStr === 'female' || genderStr === 'f';
                                
                                if (isInside) {
                                  matchedCard.inside++;
                                  if (isBoy) matchedCard.boys++;
                                  if (isGirl) matchedCard.girls++;
                                }
                              }
                            });
                          }

                          return ageGroupCards.map((group) => (
                            <div key={group.key} className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-xs space-y-3">
                              <h4 className="text-sm font-bold text-neutral-900 font-serif">{group.name}</h4>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Boys</span>
                                  <span className="font-semibold text-neutral-900 text-sm block">{group.boys}</span>
                                </div>
                                <div className="space-y-1 border-l border-[#F4F3EF] pl-3">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Girls</span>
                                  <span className="font-semibold text-neutral-900 text-sm block">{group.girls}</span>
                                </div>
                                <div className="space-y-1 border-l border-[#F4F3EF] pl-3">
                                  <span className="text-[10px] font-bold text-[#C59B27] uppercase tracking-wider block">Inside</span>
                                  <span className="font-extrabold text-[#C59B27] text-sm block">{group.inside}</span>
                                </div>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    {/* Entry Summary Section */}
                    <div data-component-version="volunteer-reports-entry-v3-stitch-layout-fixed" className="space-y-4">
                      <h3 className="text-xl font-bold text-neutral-900 font-serif">Entry</h3>
                      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-xs space-y-3.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-600">Checked in</span>
                          <span className="font-bold text-neutral-900 text-sm">{stats.checkedIn || 0}</span>
                        </div>
                        <div className="h-px bg-[#F4F3EF]"></div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-600">Not arrived</span>
                          <span className="font-bold text-neutral-900 text-sm">
                            {Math.max(0, (stats.expected || 0) - (stats.checkedIn || 0))}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pickup Summary Section */}
                    <div data-component-version="volunteer-reports-pickup-v3-stitch-layout-fixed" className="space-y-4">
                      <h3 className="text-xl font-bold text-neutral-900 font-serif">Pickup</h3>
                      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 shadow-xs space-y-3.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-600">Picked up</span>
                          <span className="font-bold text-neutral-900 text-sm">{stats.pickedUp || 0}</span>
                        </div>
                        <div className="h-px bg-[#F4F3EF]"></div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-600">Still inside</span>
                          <span className="font-bold text-neutral-900 text-sm">
                            {Math.max(0, (stats.checkedIn || 0) - (stats.pickedUp || 0))}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons Section */}
                    <div data-component-version="volunteer-reports-actions-v3-stitch-layout-fixed" className="flex flex-col space-y-3 pt-2">
                      <button
                        onClick={() => {
                          setActiveDirectoryFilter('inside');
                          onNavigate('/volunteer/children');
                        }}
                        className="w-full py-3 bg-[#C59B27] hover:bg-[#A47E1F] active:scale-98 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-xs"
                        id="btn-volunteer-reports-view-inside"
                      >
                        <span>View children inside</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveDirectoryFilter('attention');
                          onNavigate('/volunteer/children');
                        }}
                        className="w-full py-3 bg-white hover:bg-gray-50 border border-[#EAE8E1] text-gray-700 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2"
                        id="btn-volunteer-reports-view-attention"
                      >
                        <span>View needs attention</span>
                      </button>
                    </div>

                    {/* Footer Note */}
                    <p className="text-center text-[11px] text-gray-400 italic pt-2">
                      Final report will be available after the event.
                    </p>
                  </div>
                );
              })()}
            </>
          )}

          {/* Attention Details Modal */}
          {showAttentionModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 z-50 animate-fade-in">
              <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl border border-[#EAE8E1]">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <h3 className="text-lg font-serif font-bold text-neutral-900">Needs Attention List</h3>
                  <button 
                    onClick={() => setShowAttentionModal(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {reportsData?.needsAttention && reportsData.needsAttention.length > 0 ? (
                    reportsData.needsAttention.map((item: any, idx: number) => (
                      <div key={item.id || idx} className="p-4 bg-amber-50/30 border border-amber-100 rounded-2xl flex items-center justify-between space-x-3 text-xs">
                        <div className="flex items-start space-x-3">
                          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
                          <div className="space-y-1">
                            <h4 className="font-bold text-neutral-800 text-sm">{item.childName}</h4>
                            <p className="text-xs text-amber-700 font-medium">{item.issueType}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setShowAttentionModal(false);
                            if (item.id) {
                              setSearchQuery(item.childName);
                              onNavigate('/volunteer/children');
                            } else {
                              onNavigate('/volunteer/event');
                            }
                          }}
                          className="px-3 py-1.5 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                        >
                          {item.actionText || 'RESOLVE'}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-gray-400 text-xs">
                      No active alerts or needs attention items.
                    </div>
                  )}
                </div>
              </div>
            </div>
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
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#EAE8E1] px-4 py-2 flex items-center justify-around z-20 shadow-lg" data-component-version="volunteer-bottom-nav-v2-stitch">
        <button
          onClick={() => onNavigate('/volunteer/event')}
          className={`flex flex-col items-center justify-center transition-colors cursor-pointer ${cleanRoute === '/volunteer/event' || cleanRoute === '/volunteer/pickup' ? 'text-[#C59B27]' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <Calendar className="h-5 w-5" />
          <span className="text-[10px] font-bold mt-1">Events</span>
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
          <Users className="h-5 w-5" />
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

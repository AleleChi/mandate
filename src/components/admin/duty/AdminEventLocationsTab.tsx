import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  MapPin,
  Plus,
  Search,
  RefreshCw,
  Edit,
  QrCode,
  Printer,
  AlertTriangle,
  Users,
  Check,
  X,
  CheckCircle2,
  Clock,
  Download,
  AlertCircle,
  FileText,
  Shield,
  Phone,
  Pause,
  Play
} from 'lucide-react';
import { safeStorage } from '../../../utils/storage';
import { buildApiUrl } from '../../../utils/urlHelper';

interface AdminEventLocationsTabProps {
  eventId?: string;
  triggerCreateLocation?: number;
  triggerPrintAllCodes?: number;
  onNavigateTab?: (tab: string) => void;
}

interface EventLocation {
  id: string;
  eventId: string;
  parentLocationId: string | null;
  type: string;
  name: string;
  shortName: string | null;
  description: string | null;
  instructions: string | null;
  capacity: number | null;
  ageGroupKey: string | null;
  teamKey: string | null;
  emergencyLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  pathLabel: string;
  assignedCount?: number;
  presentCount?: number;
  alertCount?: number;
  needsAttention?: boolean;
}

interface LocationCoverage {
  locationId: string;
  activeResponders: any[];
  assignedResponders: any[];
  activeAlerts: any[];
}

export default function AdminEventLocationsTab({
  eventId = 'event-ga-2026',
  triggerCreateLocation = 0,
  triggerPrintAllCodes = 0,
  onNavigateTab
}: AdminEventLocationsTabProps) {
  const [locations, setLocations] = useState<EventLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [locToToggleActive, setLocToToggleActive] = useState<EventLocation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Summary counts
  const [summary, setSummary] = useState({
    locations: 0,
    volunteersAssigned: 0,
    currentlyOnDuty: 0,
    needAssignment: 0,
    locationsNeedingAttention: 0
  });

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');

  // Selection
  const [selectedLocation, setSelectedLocation] = useState<EventLocation | null>(null);
  const [selectedCoverage, setSelectedCoverage] = useState<LocationCoverage | null>(null);
  const [coverageLoading, setCoverageLoading] = useState<boolean>(false);

  // Form Modal State
  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [formId, setFormId] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formType, setFormType] = useState<string>('room');
  const [formCapacity, setFormCapacity] = useState<string>('');
  const [formAgeGroup, setFormAgeGroup] = useState<string>('Ages 4 to 6');
  const [formTeamKey, setFormTeamKey] = useState<string>('General Response');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formInstructions, setFormInstructions] = useState<string>('');
  const [formEmergencyLabel, setFormEmergencyLabel] = useState<string>('');
  const [savingLocation, setSavingLocation] = useState<boolean>(false);

  // QR Code Modal State
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [confirmReplaceModal, setConfirmReplaceModal] = useState<boolean>(false);

  // Batch Print Posters Modal
  const [showBatchPrintModal, setShowBatchPrintModal] = useState<boolean>(false);
  const [batchQRMap, setBatchQRMap] = useState<Record<string, string>>({});
  const [batchLoading, setBatchLoading] = useState<boolean>(false);

  // External trigger for Create Location
  const lastCreateTrigger = useRef(triggerCreateLocation);
  useEffect(() => {
    if (triggerCreateLocation > 0 && triggerCreateLocation !== lastCreateTrigger.current) {
      lastCreateTrigger.current = triggerCreateLocation;
      openCreateModal();
    }
  }, [triggerCreateLocation]);

  // External trigger for Batch Print Location Codes
  const lastPrintTrigger = useRef(triggerPrintAllCodes);
  useEffect(() => {
    if (triggerPrintAllCodes > 0 && triggerPrintAllCodes !== lastPrintTrigger.current) {
      lastPrintTrigger.current = triggerPrintAllCodes;
      handleOpenBatchPrint();
    }
  }, [triggerPrintAllCodes]);

  // Generate real QR code matrix image whenever qrToken updates
  useEffect(() => {
    if (qrToken) {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://koinonia12.netlify.app';
      const accessUrl = `${origin}/duty/scan/${qrToken}`;
      QRCode.toDataURL(accessUrl, {
        margin: 2,
        width: 340,
        color: { dark: '#18181B', light: '#FFFFFF' },
        errorCorrectionLevel: 'M'
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('Error generating QR data URL:', err));
    } else {
      setQrDataUrl(null);
    }
  }, [qrToken]);

  // Format time display helper
  const formatDisplayTime = (isoString?: string | null) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  // Format type label helper
  const formatTypeLabel = (type?: string) => {
    if (!type) return 'Location';
    if (type === 'room') return 'Room';
    if (type === 'hall') return 'Hall';
    if (type === 'gate' || type === 'check_in_point') return 'Entry Point';
    if (type === 'pickup_point') return 'Pickup Point';
    if (type === 'zone') return 'Zone';
    return type.replace(/_/g, ' ');
  };

  // Fetch Locations
  const fetchLocations = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const queryParams = new URLSearchParams();
      if (filterType && filterType !== 'all') {
        queryParams.append('type', filterType);
      }
      if (searchTerm) {
        queryParams.append('search', searchTerm);
      }

      let res = await fetch(buildApiUrl(`/api/admin/events/${eventId}/locations?${queryParams.toString()}`), { headers });
      if (!res.ok) {
        res = await fetch(buildApiUrl(`/api/admin/locations?${queryParams.toString()}`), { headers });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success !== false) {
          const rawItems = data.locations || data.items || [];
          const normItems: EventLocation[] = rawItems.map((loc: any) => ({
            id: loc.id,
            eventId: loc.eventId || loc.event_id || eventId,
            parentLocationId: loc.parentLocationId ?? loc.parent_location_id ?? null,
            type: loc.type || loc.location_type || 'room',
            name: loc.name,
            shortName: loc.shortName || loc.short_name || null,
            description: loc.description || null,
            instructions: loc.instructions || null,
            capacity: loc.capacity !== undefined && loc.capacity !== null ? Number(loc.capacity) : null,
            ageGroupKey: loc.ageGroupKey || loc.age_group_key || null,
            teamKey: loc.teamKey || loc.team_key || null,
            emergencyLabel: loc.emergencyLabel || loc.emergency_label || null,
            sortOrder: loc.sortOrder ?? loc.sort_order ?? 0,
            isActive: loc.isActive !== undefined ? Boolean(loc.isActive) : loc.is_active === 1 || loc.is_active === true,
            pathLabel: loc.pathLabel || loc.name,
            assignedCount: loc.assignedCount || 0,
            presentCount: loc.presentCount || 0,
            alertCount: loc.alertCount || 0,
            needsAttention: !!loc.needsAttention
          }));

          setLocations(normItems);

          if (data.summary) {
            setSummary({
              locations: data.summary.locations || data.summary.totalLocations || normItems.length,
              volunteersAssigned: data.summary.volunteersAssigned || 0,
              currentlyOnDuty: data.summary.currentlyOnDuty || 0,
              needAssignment: data.summary.needAssignment || 0,
              locationsNeedingAttention: data.summary.locationsNeedingAttention || 0
            });
          }

          // Select first location by default if none selected or refreshed
          if (!selectedLocation && normItems.length > 0) {
            setSelectedLocation(normItems[0]);
          } else if (selectedLocation) {
            const found = normItems.find(l => l.id === selectedLocation.id);
            if (found) setSelectedLocation(found);
          }
        } else {
          setError(data.message || data.error || 'We couldn’t load event locations. Try again');
        }
      } else {
        setError('We couldn’t load event locations. Try again');
      }
    } catch (err) {
      console.error('Error fetching event locations:', err);
      setError('We couldn’t load event locations. Try again');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Coverage for selected location
  const fetchLocationCoverage = async (locId: string) => {
    setCoverageLoading(true);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let res = await fetch(buildApiUrl(`/api/admin/events/${eventId}/locations/${locId}/coverage`), { headers });
      if (!res.ok) {
        res = await fetch(buildApiUrl(`/api/admin/locations/${locId}/coverage`), { headers });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const coverage = data.coverage || {};
          setSelectedCoverage({
            locationId: locId,
            activeResponders: coverage.activePresence || data.responders || [],
            assignedResponders: coverage.assignedResponders || [],
            activeAlerts: coverage.activeAlerts || data.alerts || []
          });
        }
      }
    } catch (err) {
      console.error('Error fetching location coverage:', err);
    } finally {
      setCoverageLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, [eventId, filterType]);

  useEffect(() => {
    if (showFormModal || showQRModal || locToToggleActive || confirmReplaceModal || showBatchPrintModal) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (showFormModal) setShowFormModal(false);
          if (showQRModal) setShowQRModal(false);
          if (locToToggleActive) setLocToToggleActive(null);
          if (confirmReplaceModal) setConfirmReplaceModal(false);
          if (showBatchPrintModal) setShowBatchPrintModal(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showFormModal, showQRModal, locToToggleActive, confirmReplaceModal, showBatchPrintModal]);

  useEffect(() => {
    if (selectedLocation) {
      fetchLocationCoverage(selectedLocation.id);

      // Load active QR token for the selected location
      const fetchQR = async () => {
        try {
          const token = safeStorage.getItem('koinonia_token');
          const headers: Record<string, string> = {};
          if (token) headers['Authorization'] = `Bearer ${token}`;

          let res = await fetch(buildApiUrl(`/api/admin/locations/${selectedLocation.id}/qr`), { headers });
          if (!res.ok) {
            res = await fetch(buildApiUrl(`/api/admin/events/${eventId}/locations/${selectedLocation.id}/code`), { headers });
          }
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              setQrToken(data.code?.token_hash || data.token || null);
            }
          }
        } catch (err) {
          console.error('Error loading location QR:', err);
        }
      };
      fetchQR();
    } else {
      setSelectedCoverage(null);
      setQrToken(null);
    }
  }, [selectedLocation?.id]);

  // Open Form Modal
  const openCreateModal = () => {
    setIsEditing(false);
    setFormId('');
    setFormName('');
    setFormType('room');
    setFormCapacity('');
    setFormAgeGroup('Ages 4 to 6');
    setFormTeamKey('General Response');
    setFormDescription('');
    setFormInstructions('');
    setFormEmergencyLabel('');
    setFormError(null);
    setShowFormModal(true);
  };

  const openEditModal = (loc: EventLocation) => {
    setIsEditing(true);
    setFormId(loc.id);
    setFormName(loc.name);
    setFormType(loc.type);
    setFormCapacity(loc.capacity ? String(loc.capacity) : '');
    setFormAgeGroup(loc.ageGroupKey || 'Ages 4 to 6');
    setFormTeamKey(loc.teamKey || 'General Response');
    setFormDescription(loc.description || '');
    setFormInstructions(loc.instructions || '');
    setFormEmergencyLabel(loc.emergencyLabel || '');
    setFormError(null);
    setShowFormModal(true);
  };

  // Submit Form
  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError('Please enter a location name.');
      return;
    }

    setSavingLocation(true);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        name: formName.trim(),
        locationType: formType,
        type: formType,
        capacity: formCapacity ? parseInt(formCapacity, 10) : null,
        ageGroupKey: formAgeGroup,
        teamKey: formTeamKey,
        description: formDescription.trim() || null,
        instructions: formInstructions.trim() || null,
        emergencyLabel: formEmergencyLabel.trim() || null
      };

      const url = isEditing
        ? `/api/admin/events/${eventId}/locations/${formId}`
        : `/api/admin/events/${eventId}/locations`;

      let res = await fetch(buildApiUrl(url), {
        method: isEditing ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const fallbackUrl = isEditing ? `/api/admin/locations/${formId}` : '/api/admin/locations';
        res = await fetch(buildApiUrl(fallbackUrl), {
          method: isEditing ? 'PUT' : 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success !== false) {
          setShowFormModal(false);
          setSuccess(isEditing ? 'Location updated successfully.' : 'Location added successfully.');
          setTimeout(() => setSuccess(null), 4000);
          await fetchLocations();
        } else {
          setFormError(data.error || data.message || 'Failed to save location.');
        }
      } else {
        setFormError('Failed to save location. Please check details.');
      }
    } catch (err) {
      console.error('Error saving location:', err);
      setFormError('Network error saving location.');
    } finally {
      setSavingLocation(false);
    }
  };

  // Toggle Active / Pause Location
  const handleToggleLocationActive = async (loc: EventLocation) => {
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const newActive = !loc.isActive;
      const url = `/api/admin/events/${eventId}/locations/${loc.id}`;

      let res = await fetch(buildApiUrl(url), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isActive: newActive })
      });

      if (!res.ok) {
        res = await fetch(buildApiUrl(`/api/admin/locations/${loc.id}`), {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ isActive: newActive })
        });
      }

      if (res.ok) {
        setLocToToggleActive(null);
        setSuccess(newActive ? `${loc.name} is now open for duty.` : `${loc.name} has been paused.`);
        setTimeout(() => setSuccess(null), 4000);
        await fetchLocations();
      }
    } catch (err) {
      console.error('Error toggling location status:', err);
    }
  };

  // Replace QR Code
  const handleReplaceQR = async () => {
    if (!selectedLocation) return;
    setQrLoading(true);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let res = await fetch(buildApiUrl(`/api/admin/locations/${selectedLocation.id}/qr`), {
        method: 'POST',
        headers
      });

      if (!res.ok) {
        res = await fetch(buildApiUrl(`/api/admin/events/${eventId}/locations/${selectedLocation.id}/code/rotate`), {
          method: 'POST',
          headers
        });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success && (data.token || data.code?.token_hash)) {
          setQrToken(data.token || data.code?.token_hash);
          setSuccess('QR code replaced. Previously printed physical codes will no longer work.');
          setTimeout(() => setSuccess(null), 5000);
        }
      }
    } catch (err) {
      console.error('Error replacing location QR code:', err);
    } finally {
      setQrLoading(false);
      setConfirmReplaceModal(false);
    }
  };

  // Download QR Code Image
  const handleDownloadQR = () => {
    if (!qrDataUrl || !selectedLocation) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${selectedLocation.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-duty-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Print Single Location QR
  const handlePrintSingleQR = () => {
    window.print();
  };

  // Open Batch Print Modal & load tokens for all active locations
  const handleOpenBatchPrint = async () => {
    setShowBatchPrintModal(true);
    setBatchLoading(true);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://koinonia12.netlify.app';
      const map: Record<string, string> = {};

      for (const loc of locations.filter(l => l.isActive)) {
        try {
          const res = await fetch(buildApiUrl(`/api/admin/locations/${loc.id}/qr`), { headers });
          if (res.ok) {
            const data = await res.json();
            const tokenStr = data.code?.token_hash || data.token;
            if (tokenStr) {
              const accessUrl = `${origin}/duty/scan/${tokenStr}`;
              const dataUrl = await QRCode.toDataURL(accessUrl, {
                margin: 2,
                width: 320,
                color: { dark: '#18181B', light: '#FFFFFF' }
              });
              map[loc.id] = dataUrl;
            }
          }
        } catch (e) {}
      }
      setBatchQRMap(map);
    } catch (err) {
      console.error('Error preparing batch prints:', err);
    } finally {
      setBatchLoading(false);
    }
  };

  // Filtered locations
  const filteredLocations = locations.filter(loc => {
    if (filterType === 'rooms' && loc.type !== 'room') return false;
    if (filterType === 'entry' && !['gate', 'check_in_point'].includes(loc.type)) return false;
    if (filterType === 'pickup' && loc.type !== 'pickup_point') return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchName = loc.name.toLowerCase().includes(term);
      const matchAge = (loc.ageGroupKey || '').toLowerCase().includes(term);
      const matchTeam = (loc.teamKey || '').toLowerCase().includes(term);
      return matchName || matchAge || matchTeam;
    }
    return true;
  });

  return (
    <div className="space-y-6" data-view-version="admin-event-locations-v6">
      {/* Toast Alert */}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-sans flex items-center space-x-2 animate-fade-in shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-sans flex items-center justify-between animate-fade-in shadow-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={fetchLocations} className="text-xs font-semibold underline cursor-pointer">
            Try again
          </button>
        </div>
      )}

      {/* SUMMARY BAR: Clean operational metrics (Part 5) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 space-y-1 shadow-2xs">
          <span className="text-[11px] font-sans font-medium text-zinc-500 block">
            Locations
          </span>
          <span
            className="text-2xl font-bold text-[#18181B] block"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {summary.locations}
          </span>
        </div>

        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 space-y-1 shadow-2xs">
          <span className="text-[11px] font-sans font-medium text-zinc-500 block">
            Volunteers assigned
          </span>
          <span
            className="text-2xl font-bold text-[#18181B] block"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {summary.volunteersAssigned}
          </span>
        </div>

        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 space-y-1 shadow-2xs">
          <span className="text-[11px] font-sans font-medium text-zinc-500 block">
            Currently on duty
          </span>
          <span
            className="text-2xl font-bold text-emerald-700 block"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {summary.currentlyOnDuty}
          </span>
        </div>

        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-4 space-y-1 shadow-2xs">
          <span className="text-[11px] font-sans font-medium text-zinc-500 block">
            Need assignment
          </span>
          <span
            className="text-2xl font-bold text-[#A47E1F] block"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {summary.needAssignment}
          </span>
        </div>

        {summary.locationsNeedingAttention > 0 && (
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-1 shadow-2xs">
            <span className="text-[11px] font-sans font-medium text-amber-800 block">
              Needing attention
            </span>
            <span
              className="text-2xl font-bold text-amber-900 block"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {summary.locationsNeedingAttention}
            </span>
          </div>
        )}
      </div>

      {/* FILTER & SEARCH BAR (Part 7) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-sans font-medium transition-all cursor-pointer whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-[#18181B] text-white shadow-2xs'
                : 'bg-white border border-[#EAE8E1] text-zinc-600 hover:text-zinc-900'
            }`}
          >
            All locations
          </button>
          <button
            type="button"
            onClick={() => setFilterType('rooms')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-sans font-medium transition-all cursor-pointer whitespace-nowrap ${
              filterType === 'rooms'
                ? 'bg-[#18181B] text-white shadow-2xs'
                : 'bg-white border border-[#EAE8E1] text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Rooms
          </button>
          <button
            type="button"
            onClick={() => setFilterType('entry')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-sans font-medium transition-all cursor-pointer whitespace-nowrap ${
              filterType === 'entry'
                ? 'bg-[#18181B] text-white shadow-2xs'
                : 'bg-white border border-[#EAE8E1] text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Entry points
          </button>
          <button
            type="button"
            onClick={() => setFilterType('pickup')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-sans font-medium transition-all cursor-pointer whitespace-nowrap ${
              filterType === 'pickup'
                ? 'bg-[#18181B] text-white shadow-2xs'
                : 'bg-white border border-[#EAE8E1] text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Pickup points
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search locations"
            className="w-full pl-9 pr-3.5 py-1.5 bg-white border border-[#EAE8E1] rounded-xl text-xs font-sans text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27] shadow-2xs"
          />
        </div>
      </div>

      {/* TWO-COLUMN WORKFLOW: Location List (Left) & Location Detail (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* LEFT PANEL: Clean Location List (Part 6) */}
        <div className="lg:col-span-5 bg-white border border-[#EAE8E1] rounded-2xl divide-y divide-[#EAE8E1] overflow-hidden shadow-xs">
          {loading && locations.length === 0 ? (
            <div className="p-8 text-center space-y-2 text-xs text-zinc-400">
              <RefreshCw className="w-4 h-4 animate-spin mx-auto text-[#C59B27]" />
              <span>Loading locations…</span>
            </div>
          ) : filteredLocations.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <MapPin className="w-6 h-6 text-zinc-300 mx-auto" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-800">No duty locations yet</p>
                <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                  Add rooms, entry points or pickup areas volunteers will use during this event.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-2 px-3.5 py-1.5 bg-[#C59B27] hover:bg-[#A47E1F] text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-2xs"
              >
                Add first location
              </button>
            </div>
          ) : (
            filteredLocations.map((loc) => {
              const isSelected = selectedLocation?.id === loc.id;
              return (
                <div
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc)}
                  className={`p-4 transition-all cursor-pointer select-none space-y-1.5 ${
                    isSelected
                      ? 'bg-[#FAF9F6] border-l-4 border-l-[#C59B27]'
                      : 'hover:bg-zinc-50/80 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-sans font-semibold text-[#18181B]">
                        {loc.name}
                      </h3>
                      {loc.ageGroupKey && (
                        <p className="text-xs font-sans text-[#A47E1F] font-medium mt-0.5">
                          {loc.ageGroupKey}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-sans font-medium text-zinc-500 uppercase tracking-wider bg-zinc-100 px-2 py-0.5 rounded-md shrink-0">
                      {formatTypeLabel(loc.type)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-sans text-zinc-500 pt-1">
                    <span>
                      {loc.capacity ? `${loc.capacity} capacity` : 'No capacity set'}
                      {loc.assignedCount !== undefined ? ` · ${loc.assignedCount} volunteers assigned` : ''}
                    </span>

                    <span className="flex items-center space-x-1.5 shrink-0 text-[11px]">
                      <span className={`w-1.5 h-1.5 rounded-full ${loc.isActive ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                      <span className={loc.isActive ? 'text-zinc-700 font-medium' : 'text-zinc-400'}>
                        {loc.isActive ? 'Open for duty' : 'Paused'}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT PANEL: Clean Location Detail (Part 8, 9, 10, 11) */}
        <div className="lg:col-span-7">
          {selectedLocation ? (
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-5 sm:p-6 space-y-6 shadow-xs">

              {/* DETAIL HEADER */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-[#EAE8E1]">
                <div className="space-y-1">
                  <h2
                    className="text-2xl font-bold text-[#18181B] tracking-tight"
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                  >
                    {selectedLocation.name}
                  </h2>
                  <div className="flex items-center space-x-2 text-xs font-sans text-zinc-500">
                    <span>{formatTypeLabel(selectedLocation.type)}</span>
                    <span>•</span>
                    <span className={`font-medium ${selectedLocation.isActive ? 'text-emerald-700' : 'text-zinc-500'}`}>
                      {selectedLocation.isActive ? 'Open for duty' : 'Paused'}
                    </span>
                  </div>
                  <div className="text-xs font-sans text-zinc-600 pt-0.5">
                    {selectedLocation.ageGroupKey || 'All ages'}
                    {selectedLocation.capacity ? ` · Capacity ${selectedLocation.capacity}` : ''}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedLocation)}
                    className="px-3 py-1.5 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                  >
                    <Edit className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Edit location</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowQRModal(true)}
                    className="px-3 py-1.5 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                  >
                    <Printer className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Print QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLocToToggleActive(selectedLocation)}
                    className={`px-3 py-1.5 border rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 shadow-2xs ${
                      selectedLocation.isActive
                        ? 'bg-zinc-50 border-[#EAE8E1] hover:bg-zinc-100 text-zinc-700'
                        : 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {selectedLocation.isActive ? (
                      <>
                        <Pause className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Pause location</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Open for duty</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* VOLUNTEERS SECTION (Part 11) */}
              <div className="space-y-3 pb-5 border-b border-[#EAE8E1]">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-700">
                      Volunteers
                    </h3>
                    <div className="flex items-center space-x-3 text-xs font-sans text-zinc-500 mt-0.5">
                      <span><strong>{selectedCoverage?.activeResponders?.length || 0}</strong> here now</span>
                      <span>•</span>
                      <span><strong>{selectedCoverage?.assignedResponders?.length || 0}</strong> assigned</span>
                    </div>
                  </div>

                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab('event_team')}
                      className="text-xs text-[#C59B27] hover:text-[#A47E1F] font-sans font-medium transition-colors cursor-pointer"
                    >
                      Manage assignments
                    </button>
                  )}
                </div>

                {coverageLoading ? (
                  <div className="p-4 text-center text-xs text-zinc-400 space-y-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto text-[#C59B27]" />
                    <span>Loading team presence…</span>
                  </div>
                ) : (selectedCoverage?.assignedResponders?.length || 0) === 0 && (selectedCoverage?.activeResponders?.length || 0) === 0 ? (
                  <div className="p-4 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl text-center space-y-2">
                    <p className="text-xs text-zinc-500 font-sans">No volunteers assigned yet.</p>
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab('event_team')}
                        className="text-xs font-sans font-semibold text-[#C59B27] hover:underline cursor-pointer"
                      >
                        Assign volunteers
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 border border-[#EAE8E1] rounded-xl overflow-hidden">
                    {/* Render assigned volunteers with real presence indicators */}
                    {(selectedCoverage?.assignedResponders || []).map((resp: any) => (
                      <div key={resp.id || resp.userId} className="p-3 flex items-center justify-between text-xs font-sans bg-white hover:bg-zinc-50/50">
                        <div>
                          <div className="font-semibold text-[#18181B]">{resp.fullName || 'Volunteer'}</div>
                          <div className="text-[11px] text-zinc-500">{resp.responsibilityKey || resp.role || 'General'}</div>
                        </div>
                        <div>
                          {resp.isPresent ? (
                            <span className="inline-flex items-center space-x-1.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                              <span>Here since {formatDisplayTime(resp.presentSince)}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1.5 text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full text-[11px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                              <span>Not here yet</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Also show unassigned volunteers who scanned in here */}
                    {(selectedCoverage?.activeResponders || [])
                      .filter((p: any) => !(selectedCoverage?.assignedResponders || []).some((a: any) => a.userId === p.userId))
                      .map((resp: any) => (
                        <div key={resp.id || resp.userId} className="p-3 flex items-center justify-between text-xs font-sans bg-amber-50/30 hover:bg-amber-50/60">
                          <div>
                            <div className="font-semibold text-[#18181B]">{resp.fullName || 'Volunteer'}</div>
                            <div className="text-[11px] text-zinc-500">Joined at venue</div>
                          </div>
                          <span className="inline-flex items-center space-x-1.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            <span>Here since {formatDisplayTime(resp.startedAt)}</span>
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* LOCATION DETAILS SECTION (Part 8) */}
              <div className="space-y-3 pb-5 border-b border-[#EAE8E1]">
                <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-700">
                  Location details
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                  <div>
                    <span className="text-zinc-500 block">Age group</span>
                    <span className="font-semibold text-[#18181B] mt-0.5 block">
                      {selectedLocation.ageGroupKey || 'All ages'}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-500 block">Capacity</span>
                    <span className="font-semibold text-[#18181B] mt-0.5 block">
                      {selectedLocation.capacity ? `${selectedLocation.capacity} persons` : 'No limit set'}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-500 block">Team</span>
                    <span className="font-semibold text-[#18181B] mt-0.5 block">
                      {selectedLocation.teamKey || 'General Response'}
                    </span>
                  </div>

                  {selectedLocation.emergencyLabel && (
                    <div>
                      <span className="text-zinc-500 block">Emergency identifier</span>
                      <span className="font-semibold text-rose-700 mt-0.5 block">
                        {selectedLocation.emergencyLabel}
                      </span>
                    </div>
                  )}
                </div>

                {selectedLocation.description && (
                  <div className="pt-2">
                    <span className="text-zinc-500 text-xs block">Description</span>
                    <p className="text-xs text-zinc-700 font-sans mt-1 leading-relaxed bg-[#FAF9F6] p-3 rounded-xl border border-[#EAE8E1]">
                      {selectedLocation.description}
                    </p>
                  </div>
                )}

                {selectedLocation.instructions && (
                  <div className="pt-1">
                    <span className="text-zinc-500 text-xs block">Special instructions</span>
                    <p className="text-xs text-zinc-700 font-sans mt-1 leading-relaxed bg-amber-50/50 p-3 rounded-xl border border-amber-200/60 whitespace-pre-line">
                      {selectedLocation.instructions}
                    </p>
                  </div>
                )}
              </div>

              {/* QR CODE SECTION (Part 9) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-700">
                    Location QR code
                  </h3>
                </div>

                <p className="text-xs text-zinc-600 font-sans leading-relaxed">
                  Volunteers can scan this code when they arrive at {selectedLocation.name} to confirm their duty location.
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQRModal(true)}
                    className="px-3.5 py-2 bg-[#C59B27] hover:bg-[#A47E1F] text-white text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>View QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintSingleQR}
                    className="px-3.5 py-2 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                  >
                    <Printer className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Print</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmReplaceModal(true)}
                    className="px-3.5 py-2 text-zinc-500 hover:text-zinc-800 text-xs font-medium rounded-xl transition-all cursor-pointer"
                  >
                    Replace QR code
                  </button>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-12 text-center space-y-3">
              <MapPin className="w-8 h-8 text-zinc-300 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-800">Select a location</h3>
                <p className="text-xs text-zinc-500">Choose a location from the left to view details and manage QR codes.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: EDIT / ADD LOCATION FORM */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 w-full max-w-lg shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-4">
              <h3
                className="text-xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {isEditing ? 'Edit location' : 'Add location'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-sans">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveLocation} className="space-y-4 text-xs font-sans">
              <div className="space-y-1.5">
                <label className="font-semibold text-zinc-700 block">
                  Location name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Grace Hall Primary"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#EAE8E1] rounded-xl text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-zinc-700 block">Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-[#EAE8E1] rounded-xl text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] cursor-pointer"
                  >
                    <option value="room">Room</option>
                    <option value="hall">Hall</option>
                    <option value="gate">Entry point</option>
                    <option value="pickup_point">Pickup point</option>
                    <option value="zone">Zone</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-zinc-700 block">Capacity</label>
                  <input
                    type="number"
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(e.target.value)}
                    placeholder="e.g. 40"
                    min="1"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#EAE8E1] rounded-xl text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-zinc-700 block">Age group</label>
                  <input
                    type="text"
                    value={formAgeGroup}
                    onChange={(e) => setFormAgeGroup(e.target.value)}
                    placeholder="e.g. Ages 4 to 6"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#EAE8E1] rounded-xl text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-zinc-700 block">Team</label>
                  <input
                    type="text"
                    value={formTeamKey}
                    onChange={(e) => setFormTeamKey(e.target.value)}
                    placeholder="e.g. Protocol"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#EAE8E1] rounded-xl text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-zinc-700 block">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief description for volunteers arriving at this area"
                  rows={2}
                  className="w-full px-3.5 py-2 bg-white border border-[#EAE8E1] rounded-xl text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-zinc-700 block">Special instructions</label>
                <textarea
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  placeholder="Specific instructions shown to volunteers on duty"
                  rows={2}
                  className="w-full px-3.5 py-2 bg-white border border-[#EAE8E1] rounded-xl text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-[#EAE8E1]">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLocation}
                  className="px-5 py-2.5 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-semibold rounded-xl text-xs transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {savingLocation ? 'Saving…' : isEditing ? 'Save changes' : 'Add location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CLEAN QR MODAL (Part 10) */}
      {showQRModal && selectedLocation && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-7 w-full max-w-sm shadow-xl space-y-5 text-center">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowQRModal(false)}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <h3
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {selectedLocation.name}
              </h3>
              <p className="text-xs text-zinc-500 font-sans">
                The General Assembly {selectedLocation.ageGroupKey ? `· ${selectedLocation.ageGroupKey}` : ''}
              </p>
            </div>

            {/* Clean High-Contrast QR Code */}
            <div className="w-56 h-56 bg-white border border-[#EAE8E1] rounded-2xl mx-auto flex items-center justify-center p-3 shadow-2xs">
              {qrLoading ? (
                <RefreshCw className="w-6 h-6 animate-spin text-[#C59B27]" />
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt={`${selectedLocation.name} QR Code`} className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-zinc-400 italic">Generating QR code…</span>
              )}
            </div>

            <p className="text-xs text-zinc-500 font-sans">
              Scan to open this duty location.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handlePrintSingleQR}
                className="w-full py-3 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-sans font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-xs flex items-center justify-center space-x-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadQR}
                  disabled={!qrDataUrl}
                  className="py-2.5 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 font-sans font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1.5 shadow-2xs disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Download</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowQRModal(false)}
                  className="py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-sans font-semibold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CONFIRM REPLACE QR CODE (Part 3, Part 9) */}
      {confirmReplaceModal && selectedLocation && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 w-full max-w-sm shadow-xl space-y-4 text-center">
            <div className="w-11 h-11 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <div className="space-y-1.5">
              <h4
                className="text-xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Replace QR code?
              </h4>
              <p className="text-xs text-zinc-600 font-sans leading-relaxed">
                Previously printed physical codes for <strong>{selectedLocation.name}</strong> will stop working immediately.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setConfirmReplaceModal(false)}
                className="py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReplaceQR}
                disabled={qrLoading}
                className="py-2.5 bg-[#C59B27] hover:bg-[#A47E1F] text-white rounded-xl text-xs font-semibold cursor-pointer transition-all shadow-xs disabled:opacity-50"
              >
                {qrLoading ? 'Replacing…' : 'Replace QR code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIRM PAUSE / RESUME LOCATION */}
      {locToToggleActive && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 w-full max-w-sm shadow-xl space-y-4 text-center">
            <div className="w-11 h-11 rounded-full bg-zinc-100 text-zinc-700 flex items-center justify-center mx-auto">
              {locToToggleActive.isActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 text-emerald-600" />}
            </div>

            <div className="space-y-1.5">
              <h4
                className="text-xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {locToToggleActive.isActive ? 'Pause location?' : 'Open location for duty?'}
              </h4>
              <p className="text-xs text-zinc-600 font-sans leading-relaxed">
                {locToToggleActive.isActive
                  ? `Pausing ${locToToggleActive.name} will deactivate the location and prevent volunteer check-ins.`
                  : `Opening ${locToToggleActive.name} will allow volunteers to check in and serve.`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setLocToToggleActive(null)}
                className="py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleToggleLocationActive(locToToggleActive)}
                className="py-2.5 bg-[#18181B] hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition-all shadow-xs"
              >
                {locToToggleActive.isActive ? 'Pause location' : 'Open for duty'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: BATCH PRINT VENUE POSTERS */}
      {showBatchPrintModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 w-full max-w-md shadow-xl space-y-4 text-center">
            <div className="space-y-1">
              <h3
                className="text-2xl font-bold text-[#18181B] tracking-tight"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Print location codes
              </h3>
              <p className="text-xs text-zinc-500 font-sans">
                Print physical venue posters for all active duty locations.
              </p>
            </div>

            {batchLoading ? (
              <div className="py-8 space-y-2 text-xs text-zinc-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#C59B27]" />
                <p>Generating location codes…</p>
              </div>
            ) : (
              <div className="space-y-3 py-2 text-left">
                <p className="text-xs text-zinc-600 font-sans">
                  Ready to print posters for {locations.filter(l => l.isActive).length} active locations:
                </p>
                <div className="max-h-48 overflow-y-auto divide-y divide-zinc-100 border border-[#EAE8E1] rounded-xl">
                  {locations.filter(l => l.isActive).map(loc => (
                    <div key={loc.id} className="p-2.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-800">{loc.name}</span>
                      <span className="text-[11px] text-zinc-500">{loc.ageGroupKey || 'All ages'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#EAE8E1]">
              <button
                type="button"
                onClick={() => setShowBatchPrintModal(false)}
                className="py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold cursor-pointer transition-all"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={batchLoading}
                className="py-2.5 bg-[#C59B27] hover:bg-[#A47E1F] text-white rounded-xl text-xs font-semibold cursor-pointer transition-all shadow-xs flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                <span>Print all posters</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT-ONLY VENUE POSTER LAYOUT (Part 10) */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #venue-print-container, #venue-print-container * {
            visibility: visible !important;
          }
          #venue-print-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .venue-poster-page {
            page-break-after: always;
            break-after: page;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            padding: 3rem 2rem;
            box-sizing: border-box;
          }
        }
      `}</style>

      <div id="venue-print-container" className="hidden print:block text-zinc-950 font-sans">
        {/* Single print poster if only selectedLocation is active */}
        {selectedLocation && !showBatchPrintModal && (
          <div className="venue-poster-page text-center">
            <div className="space-y-3 pt-6">
              <div className="text-sm font-bold uppercase tracking-[0.25em] text-zinc-700">
                KOINONIA CHILDREN &amp; TEENS
              </div>
              <h1 className="text-4xl sm:text-5xl font-serif font-black uppercase tracking-tight text-zinc-950">
                {selectedLocation.name}
              </h1>
              {selectedLocation.ageGroupKey && (
                <p className="text-lg font-medium text-zinc-700">
                  {selectedLocation.ageGroupKey}
                </p>
              )}
            </div>

            <div className="w-80 h-80 my-auto p-4 border-4 border-zinc-950 rounded-3xl flex items-center justify-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`${selectedLocation.name} QR Code`} className="w-full h-full object-contain" />
              ) : (
                <div className="text-sm text-zinc-400 italic">Code not available</div>
              )}
            </div>

            <div className="space-y-1 pb-8">
              <div className="text-xl font-bold uppercase tracking-wider text-zinc-950">
                VOLUNTEERS
              </div>
              <p className="text-base text-zinc-700">
                Scan when you arrive.
              </p>
            </div>
          </div>
        )}

        {/* Batch print posters for all active locations */}
        {showBatchPrintModal && locations.filter(l => l.isActive).map((loc) => {
          const locQR = batchQRMap[loc.id] || (selectedLocation?.id === loc.id ? qrDataUrl : null);
          return (
            <div key={loc.id} className="venue-poster-page text-center">
              <div className="space-y-3 pt-6">
                <div className="text-sm font-bold uppercase tracking-[0.25em] text-zinc-700">
                  KOINONIA CHILDREN &amp; TEENS
                </div>
                <h1 className="text-4xl sm:text-5xl font-serif font-black uppercase tracking-tight text-zinc-950">
                  {loc.name}
                </h1>
                {loc.ageGroupKey && (
                  <p className="text-lg font-medium text-zinc-700">
                    {loc.ageGroupKey}
                  </p>
                )}
              </div>

              <div className="w-80 h-80 my-auto p-4 border-4 border-zinc-950 rounded-3xl flex items-center justify-center">
                {locQR ? (
                  <img src={locQR} alt={`${loc.name} QR Code`} className="w-full h-full object-contain" />
                ) : (
                  <div className="text-sm text-zinc-400 italic">Code not available</div>
                )}
              </div>

              <div className="space-y-1 pb-8">
                <div className="text-xl font-bold uppercase tracking-wider text-zinc-950">
                  VOLUNTEERS
                </div>
                <p className="text-base text-zinc-700">
                  Scan when you arrive.
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

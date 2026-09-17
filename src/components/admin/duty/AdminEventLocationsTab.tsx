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
  X,
  CheckCircle2,
  Clock,
  Download,
  AlertCircle,
  Pause,
  Play,
  UserCheck,
  LogOut
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
    stillExpected: 0,
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
      // Use hash route so mobile phone scans route directly inside the SPA without server rewrites
      const accessUrl = `${origin}/#/duty/location/${qrToken}`;
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

  const formatDisplayTime = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const formatTypeLabel = (type: string) => {
    switch (type) {
      case 'room': return 'Room';
      case 'hall': return 'Main Hall';
      case 'gate': return 'Gate';
      case 'pickup_point': return 'Pickup Point';
      case 'check_in_point': return 'Check-in Point';
      case 'zone': return 'Zone';
      default: return 'Location';
    }
  };

  // Fetch Locations list
  const fetchLocations = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const queryParams = new URLSearchParams();
      if (searchTerm) queryParams.set('search', searchTerm);
      if (filterType !== 'all') {
        if (filterType === 'rooms') queryParams.set('type', 'room');
        if (filterType === 'entry') queryParams.set('type', 'gate');
        if (filterType === 'pickup') queryParams.set('type', 'pickup_point');
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
            const assigned = data.summary.volunteersAssigned || 0;
            const onDuty = data.summary.currentlyOnDuty || 0;
            const expected = data.summary.stillExpected !== undefined
              ? data.summary.stillExpected
              : Math.max(0, assigned - onDuty);

            setSummary({
              locations: data.summary.locations || data.summary.totalLocations || normItems.length,
              volunteersAssigned: assigned,
              currentlyOnDuty: onDuty,
              stillExpected: expected,
              locationsNeedingAttention: data.summary.locationsNeedingAttention || 0
            });
          }

          // Preserve selection or select first
          if (!selectedLocation && normItems.length > 0) {
            setSelectedLocation(normItems[0]);
          } else if (selectedLocation) {
            const found = normItems.find(l => l.id === selectedLocation.id);
            if (found) setSelectedLocation(found);
          }
        } else {
          setError(data.message || data.error || 'Could not load event locations.');
        }
      } else {
        setError('Could not load event locations.');
      }
    } catch (err) {
      console.error('Error fetching event locations:', err);
      setError('Could not load event locations.');
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
  }, [eventId, searchTerm, filterType]);

  useEffect(() => {
    if (selectedLocation) {
      fetchLocationCoverage(selectedLocation.id);

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
          setSuccess(isEditing ? 'Location updated.' : 'Location added.');
          setTimeout(() => setSuccess(null), 3500);
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

  // Toggle Active / Close Location
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
        setSuccess(newActive ? `${loc.name} is now open.` : `${loc.name} is now closed.`);
        setTimeout(() => setSuccess(null), 3500);
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
          setSuccess('QR replaced. A new code was generated.');
          setTimeout(() => setSuccess(null), 4000);
        }
      }
    } catch (err) {
      console.error('Error replacing location QR code:', err);
    } finally {
      setQrLoading(false);
      setConfirmReplaceModal(false);
    }
  };

  // Admin Manual Presence Action (Mark Arrived / End Duty)
  const handleModifyPresence = async (userId: string, action: 'check_in' | 'end_duty') => {
    if (!selectedLocation) return;
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(buildApiUrl(`/api/admin/events/${eventId}/locations/${selectedLocation.id}/presence`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, action })
      });

      if (res.ok) {
        setSuccess(action === 'check_in' ? 'Volunteer marked arrived.' : 'Duty ended.');
        setTimeout(() => setSuccess(null), 3500);
        await fetchLocationCoverage(selectedLocation.id);
        await fetchLocations();
      }
    } catch (err) {
      console.error('Error modifying duty presence:', err);
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
              const accessUrl = `${origin}/#/duty/location/${tokenStr}`;
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

  // Derived Coverage lists for selected location
  const onDutyResponders = selectedCoverage?.activeResponders || [];
  const assignedResponders = selectedCoverage?.assignedResponders || [];
  const stillExpectedResponders = assignedResponders.filter(
    a => !a.isPresent && !onDutyResponders.some(p => p.userId === a.userId)
  );

  return (
    <div className="space-y-6" data-view-version="admin-event-locations-v7">

      {/* Success Notification */}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-sans flex items-center justify-between animate-fade-in shadow-2xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Notification */}
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

      {/* TOP SUMMARY (Section 9): Practical operational metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
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
            Still expected
          </span>
          <span
            className="text-2xl font-bold text-[#A47E1F] block"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {summary.stillExpected}
          </span>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
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

      {/* TWO-COLUMN LAYOUT: Location List (Left) & Location Detail (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* LEFT PANEL: Clean Location List (Section 10) */}
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
                      <p className="text-xs font-sans text-zinc-500 mt-0.5">
                        {loc.ageGroupKey || 'All ages'}
                        {loc.capacity ? ` · ${loc.capacity} capacity` : ''}
                      </p>
                    </div>

                    <span className="flex items-center space-x-1.5 shrink-0 text-[11px] font-sans">
                      <span className={`w-1.5 h-1.5 rounded-full ${loc.isActive ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                      <span className={loc.isActive ? 'text-zinc-700 font-medium' : 'text-zinc-400'}>
                        {loc.isActive ? 'Open' : 'Closed'}
                      </span>
                    </span>
                  </div>

                  <div className="text-xs font-sans text-zinc-600 pt-0.5">
                    <span>{loc.assignedCount || 0} volunteers assigned · {loc.presentCount || 0} currently on duty</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT PANEL: Location Details (Section 11, 12, 14) */}
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
                  <div className="text-xs font-sans text-zinc-600">
                    <span>{selectedLocation.ageGroupKey || 'All ages'}</span>
                    <span> · </span>
                    <span>Capacity {selectedLocation.capacity ? selectedLocation.capacity : '—'}</span>
                    <span> · </span>
                    <span>Team {selectedLocation.teamKey || 'General'}</span>
                  </div>
                  <div className="text-xs font-sans font-medium text-emerald-800 pt-0.5">
                    On duty: {onDutyResponders.length} of {assignedResponders.length} present
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedLocation)}
                    className="px-3 py-1.5 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                  >
                    <Edit className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Edit</span>
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
                        <span>Close location</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Reopen location</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* STAFF ON-DUTY SECTION (Section 14) */}
              <div className="space-y-4 pb-5 border-b border-[#EAE8E1]">
                {/* On duty now */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-700">
                      On duty now
                    </h3>
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {onDutyResponders.length} present
                    </span>
                  </div>

                  {coverageLoading ? (
                    <div className="p-4 text-center text-xs text-zinc-400 space-y-1">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto text-[#C59B27]" />
                      <span>Checking presence…</span>
                    </div>
                  ) : onDutyResponders.length === 0 ? (
                    <p className="text-xs text-zinc-500 font-sans italic bg-[#FAF9F6] p-3 rounded-xl border border-[#EAE8E1]">
                      No volunteers currently on duty at this location.
                    </p>
                  ) : (
                    <div className="divide-y divide-zinc-100 border border-[#EAE8E1] rounded-xl overflow-hidden">
                      {onDutyResponders.map((resp: any) => (
                        <div key={resp.id || resp.userId} className="p-3 flex items-center justify-between text-xs font-sans bg-white hover:bg-zinc-50/50">
                          <div>
                            <div className="font-semibold text-[#18181B]">{resp.fullName || 'Volunteer'}</div>
                            <div className="text-[11px] text-zinc-500 flex items-center space-x-1 pt-0.5">
                              <Clock className="w-3 h-3 text-zinc-400" />
                              <span>Reported {formatDisplayTime(resp.startedAt)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleModifyPresence(resp.userId, 'end_duty')}
                            className="px-2.5 py-1 text-zinc-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1"
                            title="End duty for this volunteer"
                          >
                            <LogOut className="w-3 h-3" />
                            <span>End duty</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Still expected */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-700">
                      Still expected
                    </h3>
                    <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                      {stillExpectedResponders.length} expected
                    </span>
                  </div>

                  {stillExpectedResponders.length === 0 ? (
                    <p className="text-xs text-zinc-500 font-sans italic bg-[#FAF9F6] p-3 rounded-xl border border-[#EAE8E1]">
                      All assigned volunteers have reported.
                    </p>
                  ) : (
                    <div className="divide-y divide-zinc-100 border border-[#EAE8E1] rounded-xl overflow-hidden">
                      {stillExpectedResponders.map((resp: any) => (
                        <div key={resp.id || resp.userId} className="p-3 flex items-center justify-between text-xs font-sans bg-white hover:bg-zinc-50/50">
                          <div>
                            <div className="font-semibold text-[#18181B]">{resp.fullName || 'Volunteer'}</div>
                            <div className="text-[11px] text-zinc-500">{resp.responsibilityKey || 'General Response'}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleModifyPresence(resp.userId, 'check_in')}
                            className="px-2.5 py-1 text-[#C59B27] hover:text-[#A47E1F] hover:bg-[#C59B27]/10 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1"
                            title="Mark volunteer arrived manually"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>Mark arrived</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {onNavigateTab && (
                  <div className="pt-1 text-right">
                    <button
                      type="button"
                      onClick={() => onNavigateTab('event_team')}
                      className="text-xs text-[#C59B27] hover:text-[#A47E1F] font-sans font-medium transition-colors cursor-pointer"
                    >
                      Manage team assignments ›
                    </button>
                  </div>
                )}
              </div>

              {/* LOCATION DETAILS SECTION (Section 11) */}
              <div className="space-y-3 pb-5 border-b border-[#EAE8E1]">
                <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-700">
                  Duty instructions
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-sans">
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
                    <span className="text-zinc-500 block">Assigned team</span>
                    <span className="font-semibold text-[#18181B] mt-0.5 block">
                      {selectedLocation.teamKey || 'General Response'}
                    </span>
                  </div>
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
                    <p className="text-xs text-zinc-700 font-sans mt-1 leading-relaxed bg-amber-50/40 p-3 rounded-xl border border-amber-200/60 whitespace-pre-line">
                      {selectedLocation.instructions}
                    </p>
                  </div>
                )}
              </div>

              {/* LOCATION SIGN-IN QR SECTION (Section 12) */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-zinc-700">
                  Location sign-in QR
                </h3>

                <p className="text-xs text-zinc-600 font-sans leading-relaxed">
                  Display this QR at the location so assigned volunteers can report for duty.
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
                    <span>Print QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmReplaceModal(true)}
                    className="px-3.5 py-2 text-zinc-500 hover:text-zinc-800 text-xs font-medium rounded-xl transition-all cursor-pointer"
                  >
                    Replace QR
                  </button>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-12 text-center space-y-3">
              <MapPin className="w-8 h-8 text-zinc-300 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-800">Select a location</h3>
                <p className="text-xs text-zinc-500">Choose a location to view duty details and manage QR codes.</p>
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
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-sans">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveLocation} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-zinc-700 font-medium mb-1">
                  Location name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Grace Hall Primary"
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 font-medium mb-1">
                    Location type
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#EAE8E1] rounded-xl text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] bg-white"
                  >
                    <option value="room">Room</option>
                    <option value="hall">Main Hall</option>
                    <option value="gate">Gate / Entry</option>
                    <option value="check_in_point">Check-in Point</option>
                    <option value="pickup_point">Pickup Point</option>
                    <option value="zone">Zone</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-700 font-medium mb-1">
                    Capacity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(e.target.value)}
                    placeholder="e.g. 40"
                    className="w-full px-3.5 py-2 border border-[#EAE8E1] rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 font-medium mb-1">
                    Age group
                  </label>
                  <select
                    value={formAgeGroup}
                    onChange={(e) => setFormAgeGroup(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#EAE8E1] rounded-xl text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] bg-white"
                  >
                    <option value="Ages 4 to 6">Ages 4 to 6</option>
                    <option value="Ages 7 to 9">Ages 7 to 9</option>
                    <option value="Ages 10 to 12">Ages 10 to 12</option>
                    <option value="Teens">Teens</option>
                    <option value="All Ages">All Ages</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-700 font-medium mb-1">
                    Assigned team
                  </label>
                  <select
                    value={formTeamKey}
                    onChange={(e) => setFormTeamKey(e.target.value)}
                    className="w-full px-3.5 py-2 border border-[#EAE8E1] rounded-xl text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#C59B27] bg-white"
                  >
                    <option value="General Response">General Response</option>
                    <option value="Child Care">Child Care</option>
                    <option value="Security & Safety">Security & Safety</option>
                    <option value="Registration & Entry">Registration & Entry</option>
                    <option value="Medical & Support">Medical & Support</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 font-medium mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. Ground floor west wing room"
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>

              <div>
                <label className="block text-zinc-700 font-medium mb-1">
                  Duty instructions
                </label>
                <textarea
                  rows={2}
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  placeholder="e.g. Ensure all children have name tags before entry."
                  className="w-full px-3.5 py-2 border border-[#EAE8E1] rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[#C59B27]"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#EAE8E1]">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 rounded-xl font-medium cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLocation}
                  className="px-4 py-2 bg-[#C59B27] hover:bg-[#A47E1F] text-white rounded-xl font-semibold cursor-pointer transition-all shadow-xs disabled:opacity-50"
                >
                  {savingLocation ? 'Saving…' : (isEditing ? 'Save changes' : 'Add location')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: VIEW QR PREVIEW (Section 13) */}
      {showQRModal && selectedLocation && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 sm:p-8 w-full max-w-sm shadow-xl space-y-5 text-center">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowQRModal(false)}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Clean Editorial Poster Header */}
            <div className="space-y-1">
              <div className="text-[11px] font-sans font-bold uppercase tracking-[0.2em] text-[#A47E1F]">
                Koinonia
              </div>
              <div className="text-xs font-sans text-zinc-500 font-medium">
                Children &amp; Teens
              </div>
              <h3
                className="text-2xl font-bold text-[#18181B] tracking-tight pt-2"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {selectedLocation.name}
              </h3>
              <p className="text-xs text-zinc-600 font-sans pt-1">
                Scan to report for duty
              </p>
            </div>

            {/* High-Contrast QR Code */}
            <div className="w-56 h-56 bg-white border border-[#EAE8E1] rounded-2xl mx-auto flex items-center justify-center p-3 shadow-2xs">
              {qrLoading ? (
                <RefreshCw className="w-6 h-6 animate-spin text-[#C59B27]" />
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt={`${selectedLocation.name} QR Code`} className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-zinc-400 italic">Generating QR code…</span>
              )}
            </div>

            {/* Event Dates & Notice */}
            <div className="space-y-1 font-sans">
              <p className="text-xs font-semibold text-zinc-800">
                The General Assembly
              </p>
              <p className="text-[11px] text-zinc-500">
                18–22 November 2026
              </p>
              <p className="text-[10px] text-zinc-400 pt-1">
                For assigned team members only.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-2 border-t border-[#EAE8E1]">
              <button
                type="button"
                onClick={handlePrintSingleQR}
                className="w-full py-3 bg-[#C59B27] hover:bg-[#A47E1F] text-white font-sans font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-xs flex items-center justify-center space-x-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print QR</span>
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

      {/* MODAL 3: CONFIRM REPLACE QR CODE (Section 12) */}
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
                Replace QR?
              </h4>
              <p className="text-xs text-zinc-600 font-sans leading-relaxed">
                The current QR will stop working and a new one will be created.
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
                {qrLoading ? 'Replacing…' : 'Replace QR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIRM CLOSE / REOPEN LOCATION (Section 19) */}
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
                {locToToggleActive.isActive ? 'Close location?' : 'Reopen location?'}
              </h4>
              <p className="text-xs text-zinc-600 font-sans leading-relaxed">
                {locToToggleActive.isActive
                  ? 'Volunteers will no longer be able to report for duty at this location.'
                  : 'Volunteers will be able to report for duty at this location.'}
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
                {locToToggleActive.isActive ? 'Close location' : 'Reopen location'}
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
                Print duty QR codes
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

      {/* PRINT-ONLY VENUE POSTER LAYOUT */}
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
            <div className="space-y-2 pt-6">
              <div className="text-base font-bold uppercase tracking-[0.25em] text-[#A47E1F]">
                KOINONIA
              </div>
              <div className="text-sm font-medium text-zinc-600">
                Children &amp; Teens
              </div>
              <h1 className="text-4xl sm:text-5xl font-serif font-black tracking-tight text-zinc-950 pt-4">
                {selectedLocation.name}
              </h1>
              <p className="text-lg font-medium text-zinc-700 pt-1">
                Scan to report for duty
              </p>
            </div>

            <div className="w-80 h-80 my-auto p-4 border-4 border-zinc-950 rounded-3xl flex items-center justify-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`${selectedLocation.name} QR Code`} className="w-full h-full object-contain" />
              ) : (
                <div className="text-sm text-zinc-400 italic">Code not available</div>
              )}
            </div>

            <div className="space-y-1 pb-8 font-sans">
              <div className="text-lg font-bold uppercase tracking-wider text-zinc-950">
                The General Assembly
              </div>
              <p className="text-sm text-zinc-600">
                18–22 November 2026
              </p>
              <p className="text-xs text-zinc-400 pt-2">
                For assigned team members only.
              </p>
            </div>
          </div>
        )}

        {/* Batch print posters for all active locations */}
        {showBatchPrintModal && locations.filter(l => l.isActive).map((loc) => {
          const locQR = batchQRMap[loc.id] || (selectedLocation?.id === loc.id ? qrDataUrl : null);
          return (
            <div key={loc.id} className="venue-poster-page text-center">
              <div className="space-y-2 pt-6">
                <div className="text-base font-bold uppercase tracking-[0.25em] text-[#A47E1F]">
                  KOINONIA
                </div>
                <div className="text-sm font-medium text-zinc-600">
                  Children &amp; Teens
                </div>
                <h1 className="text-4xl sm:text-5xl font-serif font-black tracking-tight text-zinc-950 pt-4">
                  {loc.name}
                </h1>
                <p className="text-lg font-medium text-zinc-700 pt-1">
                  Scan to report for duty
                </p>
              </div>

              <div className="w-80 h-80 my-auto p-4 border-4 border-zinc-950 rounded-3xl flex items-center justify-center">
                {locQR ? (
                  <img src={locQR} alt={`${loc.name} QR Code`} className="w-full h-full object-contain" />
                ) : (
                  <div className="text-sm text-zinc-400 italic">Code not available</div>
                )}
              </div>

              <div className="space-y-1 pb-8 font-sans">
                <div className="text-lg font-bold uppercase tracking-wider text-zinc-950">
                  The General Assembly
                </div>
                <p className="text-sm text-zinc-600">
                  18–22 November 2026
                </p>
                <p className="text-xs text-zinc-400 pt-2">
                  For assigned team members only.
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

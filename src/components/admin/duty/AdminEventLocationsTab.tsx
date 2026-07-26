import React, { useState, useEffect } from 'react';
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
  ShieldAlert, 
  Users, 
  Check, 
  X, 
  Archive,
  DoorClosed,
  DoorOpen,
  Layers,
  CheckCircle2,
  Building2,
  Phone,
  Shield,
  FileText
} from 'lucide-react';
import { safeStorage } from '../../../utils/storage';

const REAL_EVENT_ID = 'event-ga-2026';

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
}

interface LocationCoverage {
  locationId: string;
  activeResponders: any[];
  activeAlerts: any[];
}

export default function AdminEventLocationsTab() {
  const [locations, setLocations] = useState<EventLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Summary counts
  const [summary, setSummary] = useState({
    totalLocations: 0,
    activeLocations: 0,
    gates: 0,
    rooms: 0,
    zones: 0
  });

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Selection
  const [selectedLocation, setSelectedLocation] = useState<EventLocation | null>(null);
  const [selectedCoverage, setSelectedCoverage] = useState<LocationCoverage | null>(null);
  const [coverageLoading, setCoverageLoading] = useState<boolean>(false);

  // Form Modal State
  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [formId, setFormId] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formShortName, setFormShortName] = useState<string>('');
  const [formType, setFormType] = useState<string>('room');
  const [formParentId, setFormParentId] = useState<string>('');
  const [formCapacity, setFormCapacity] = useState<string>('');
  const [formAgeGroup, setFormAgeGroup] = useState<string>('all');
  const [formTeamKey, setFormTeamKey] = useState<string>('General Response');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formInstructions, setFormInstructions] = useState<string>('');
  const [formEmergencyLabel, setFormEmergencyLabel] = useState<string>('');
  const [formSortOrder, setFormSortOrder] = useState<number>(0);
  const [savingLocation, setSavingLocation] = useState<boolean>(false);

  // QR Code Modal State
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [confirmActionModal, setConfirmActionModal] = useState<'rotate' | 'disable' | null>(null);

  // Generate real QR code matrix image whenever qrToken updates
  useEffect(() => {
    if (qrToken) {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://koinonia.church';
      const accessUrl = `${origin}/event-duty/location-access/${qrToken}`;
      QRCode.toDataURL(accessUrl, {
        margin: 2,
        width: 320,
        color: { dark: '#18181B', light: '#FFFFFF' },
        errorCorrectionLevel: 'M'
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('Error generating QR data URL:', err));
    } else {
      setQrDataUrl(null);
    }
  }, [qrToken]);

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
      if (filterType) queryParams.append('type', filterType);
      if (searchTerm) queryParams.append('search', searchTerm);

      // Call primary endpoint
      let res = await fetch(`/api/admin/events/${REAL_EVENT_ID}/locations?${queryParams.toString()}`, { headers });
      if (!res.ok) {
        // Fallback endpoint
        res = await fetch(`/api/admin/locations?${queryParams.toString()}`, { headers });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success !== false) {
          const rawItems = data.locations || data.items || [];
          const normItems: EventLocation[] = rawItems.map((loc: any) => ({
            id: loc.id,
            eventId: loc.eventId || loc.event_id || REAL_EVENT_ID,
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
            pathLabel: loc.pathLabel || loc.name
          }));

          setLocations(normItems);

          if (data.summary) {
            setSummary({
              totalLocations: data.summary.totalLocations || normItems.length,
              activeLocations: data.summary.activeLocations || normItems.filter(l => l.isActive).length,
              gates: data.summary.gates || normItems.filter(l => ['gate', 'check_in_point', 'pickup_point'].includes(l.type)).length,
              rooms: data.summary.rooms || normItems.filter(l => l.type === 'room').length,
              zones: data.summary.zones || normItems.filter(l => l.type === 'zone').length
            });
          } else {
            setSummary({
              totalLocations: normItems.length,
              activeLocations: normItems.filter(l => l.isActive).length,
              gates: normItems.filter(l => ['gate', 'check_in_point', 'pickup_point'].includes(l.type)).length,
              rooms: normItems.filter(l => l.type === 'room').length,
              zones: normItems.filter(l => l.type === 'zone').length
            });
          }

          // If a location was selected, refresh its object reference
          if (selectedLocation) {
            const found = normItems.find(l => l.id === selectedLocation.id);
            if (found) setSelectedLocation(found);
          }
        } else {
          setError(data.message || data.error || 'Failed to fetch locations');
        }
      } else {
        setError('We could not load event locations. Please check your connection.');
      }
    } catch (err) {
      console.error('Error fetching event locations:', err);
      setError('We could not load event locations. Please refresh and try again.');
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

      let res = await fetch(`/api/admin/events/${REAL_EVENT_ID}/locations/${locId}/coverage`, { headers });
      if (!res.ok) {
        res = await fetch(`/api/admin/locations/${locId}/coverage`, { headers });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const coverage = data.coverage || {};
          setSelectedCoverage({
            locationId: locId,
            activeResponders: coverage.activePresence || data.responders || [],
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
  }, [filterType]);

  useEffect(() => {
    if (selectedLocation) {
      fetchLocationCoverage(selectedLocation.id);
      
      // Also fetch active QR token for the selected location detail view
      const fetchQR = async () => {
        try {
          const token = safeStorage.getItem('koinonia_token');
          const headers: Record<string, string> = {};
          if (token) headers['Authorization'] = `Bearer ${token}`;

          let res = await fetch(`/api/admin/locations/${selectedLocation.id}/qr`, { headers });
          if (!res.ok) {
            res = await fetch(`/api/admin/events/${REAL_EVENT_ID}/locations/${selectedLocation.id}/code`, { headers });
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

  const handleSelectLocation = (loc: EventLocation) => {
    setSelectedLocation(loc);
  };

  // Circular reference check
  const wouldBeCircular = (locId: string, parentId: string): boolean => {
    if (!parentId) return false;
    if (locId === parentId) return true;
    
    let currentParentId: string | null = parentId;
    const visited = new Set<string>();
    while (currentParentId) {
      if (visited.has(currentParentId)) return true;
      visited.add(currentParentId);
      if (currentParentId === locId) return true;
      
      const parentLoc = locations.find(l => l.id === currentParentId);
      currentParentId = parentLoc ? parentLoc.parentLocationId : null;
    }
    return false;
  };

  // Open Form Modal
  const openCreateModal = () => {
    setIsEditing(false);
    setFormId('');
    setFormName('');
    setFormShortName('');
    setFormType('room');
    setFormParentId('');
    setFormCapacity('');
    setFormAgeGroup('all');
    setFormTeamKey('General Response');
    setFormDescription('');
    setFormInstructions('');
    setFormEmergencyLabel('');
    setFormSortOrder(0);
    setShowFormModal(true);
  };

  const openEditModal = (loc: EventLocation) => {
    setIsEditing(true);
    setFormId(loc.id);
    setFormName(loc.name);
    setFormShortName(loc.shortName || '');
    setFormType(loc.type);
    setFormParentId(loc.parentLocationId || '');
    setFormCapacity(loc.capacity ? String(loc.capacity) : '');
    setFormAgeGroup(loc.ageGroupKey || 'all');
    setFormTeamKey(loc.teamKey || 'General Response');
    setFormDescription(loc.description || '');
    setFormInstructions(loc.instructions || '');
    setFormEmergencyLabel(loc.emergencyLabel || '');
    setFormSortOrder(loc.sortOrder || 0);
    setShowFormModal(true);
  };

  // Handle Save Location
  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Location name is required');
      return;
    }

    if (isEditing && formParentId && wouldBeCircular(formId, formParentId)) {
      alert('Circular reference detected! A location cannot be set to a parent that is itself or a child of this location.');
      return;
    }

    const payload = {
      name: formName.trim(),
      shortName: formShortName.trim() || null,
      type: formType,
      locationType: formType,
      parentLocationId: formParentId || null,
      capacity: formCapacity ? parseInt(formCapacity) : null,
      ageGroupKey: formAgeGroup || 'all',
      teamKey: formTeamKey || 'General Response',
      description: formDescription.trim() || null,
      instructions: formInstructions.trim() || null,
      emergencyLabel: formEmergencyLabel.trim() || null,
      sortOrder: Number(formSortOrder) || 0
    };

    setSavingLocation(true);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const primaryUrl = isEditing 
        ? `/api/admin/events/${REAL_EVENT_ID}/locations/${formId}` 
        : `/api/admin/events/${REAL_EVENT_ID}/locations`;
      const fallbackUrl = isEditing 
        ? `/api/admin/locations/${formId}` 
        : `/api/admin/locations`;
      
      const method = isEditing ? 'PATCH' : 'POST';

      let res = await fetch(primaryUrl, { method, headers, body: JSON.stringify(payload) });
      if (!res.ok && res.status === 404) {
        res = await fetch(fallbackUrl, { method: isEditing ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success !== false) {
          setSuccess(isEditing ? 'Location updated successfully.' : 'Location created successfully.');
          setShowFormModal(false);
          await fetchLocations();
        } else {
          alert(data.error || 'Failed to save location.');
        }
      } else {
        alert('Server returned an error saving the location.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error trying to save location.');
    } finally {
      setSavingLocation(false);
    }
  };

  // Archive / Restore
  const handleToggleArchive = async (loc: EventLocation) => {
    const action = loc.isActive ? 'archive' : 'restore';
    if (!confirm(`Are you sure you want to ${action} "${loc.name}"?`)) return;

    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let res = await fetch(`/api/admin/events/${REAL_EVENT_ID}/locations/${loc.id}/${action}`, { method: 'POST', headers });
      if (!res.ok) {
        res = await fetch(`/api/admin/locations/${loc.id}/${action}`, { method: 'POST', headers });
      }

      if (res.ok) {
        setSuccess(`Location ${action}d successfully.`);
        await fetchLocations();
      } else {
        alert(`Failed to ${action} location.`);
      }
    } catch (err) {
      console.error(err);
      alert(`Error during location ${action}.`);
    }
  };

  // QR Code Modal Actions
  const handleOpenQRModal = async (loc: EventLocation) => {
    setSelectedLocation(loc);
    setShowQRModal(true);
    setQrLoading(true);
    setQrToken(null);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let res = await fetch(`/api/admin/locations/${loc.id}/qr`, { headers });
      if (!res.ok) {
        res = await fetch(`/api/admin/events/${REAL_EVENT_ID}/locations/${loc.id}/code`, { headers });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setQrToken(data.code?.token_hash || data.token || null);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setQrLoading(false);
    }
  };

  const handleGenerateQR = async () => {
    if (!selectedLocation) return;
    setQrLoading(true);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let res = await fetch(`/api/admin/locations/${selectedLocation.id}/qr`, { method: 'POST', headers });
      if (!res.ok) {
        res = await fetch(`/api/admin/events/${REAL_EVENT_ID}/locations/${selectedLocation.id}/code`, { method: 'POST', headers });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setQrToken(data.token || data.code?.token_hash || null);
          setSuccess('New unguessable QR token generated.');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setQrLoading(false);
    }
  };

  const handleDisableQR = async () => {
    if (!selectedLocation || !confirm('Are you sure you want to disable this QR code? Volunteers will no longer be able to scan it for check-in.')) return;
    setQrLoading(true);
    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let res = await fetch(`/api/admin/locations/${selectedLocation.id}/qr`, { method: 'DELETE', headers });
      if (!res.ok) {
        res = await fetch(`/api/admin/events/${REAL_EVENT_ID}/locations/${selectedLocation.id}/code/disable`, { method: 'POST', headers });
      }

      if (res.ok) {
        setQrToken(null);
        setSuccess('QR code disabled.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setQrLoading(false);
    }
  };

  const handlePrintCard = () => {
    window.print();
  };

  // Helper badge styling
  const getTypeBadge = (type: string) => {
    const classes: Record<string, string> = {
      room: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      zone: 'bg-amber-50 text-amber-700 border-amber-200',
      gate: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      pickup_point: 'bg-rose-50 text-rose-700 border-rose-200',
      check_in_point: 'bg-sky-50 text-sky-700 border-sky-200',
      first_aid_point: 'bg-red-50 text-red-700 border-red-200',
    };
    const labels: Record<string, string> = {
      room: 'Room',
      zone: 'Zone',
      gate: 'Gate',
      pickup_point: 'Pickup Point',
      check_in_point: 'Check-in Point',
      first_aid_point: 'First Aid Point',
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${classes[type] || 'bg-zinc-50 text-zinc-700 border-zinc-200'}`}>
        {labels[type] || type}
      </span>
    );
  };

  // Client filtering
  const filteredLocations = locations.filter(loc => {
    const matchSearch = !searchTerm.trim() || 
      loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (loc.shortName && loc.shortName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      loc.pathLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loc.type.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchType = !filterType || loc.type === filterType;
    const matchArchive = showArchived ? !loc.isActive : loc.isActive;
    return matchSearch && matchType && matchArchive;
  });

  return (
    <div 
      data-view-version="admin-event-locations-v2-premium"
      className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-3xl p-6 shadow-xs space-y-6"
    >
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-5">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center space-x-2.5">
            <div className="p-2 bg-[#C59B27]/10 rounded-xl text-[#C59B27]">
              <MapPin className="w-5 h-5" />
            </div>
            <span>Event Locations Directory</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Manage event rooms, zones, gates, and service points, including capacity, QR access labels, and operational readiness.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setShowArchived(!showArchived);
              setSelectedLocation(null);
            }}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
              showArchived 
                ? 'bg-amber-50 border-amber-200 text-amber-700' 
                : 'bg-white border-[#EAE8E1] text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>{showArchived ? 'Viewing Archived' : 'View Archived'}</span>
          </button>

          <button
            onClick={fetchLocations}
            className="p-2 bg-white border border-[#EAE8E1] rounded-xl text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-all cursor-pointer"
            title="Refresh Locations"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={openCreateModal}
            className="flex items-center space-x-1.5 px-4 py-2 bg-[#C59B27] text-white rounded-xl text-xs font-bold hover:bg-[#A37E1C] transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Location</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700 p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <p className="font-bold">We could not load event locations</p>
              <p className="text-[11px] text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
          <button 
            onClick={fetchLocations}
            className="px-3 py-1 bg-white border border-rose-200 text-rose-700 rounded-lg font-bold hover:bg-rose-100 transition-all cursor-pointer text-[11px]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary Metrics Strip (5 Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-3.5 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-stone-100 text-stone-700 rounded-xl shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Total Locations</span>
            <span className="text-lg font-bold text-zinc-900">{summary.totalLocations}</span>
          </div>
        </div>

        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-3.5 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl shrink-0">
            <DoorClosed className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Rooms</span>
            <span className="text-lg font-bold text-zinc-900">{summary.rooms}</span>
          </div>
        </div>

        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-3.5 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl shrink-0">
            <DoorOpen className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Gates & Points</span>
            <span className="text-lg font-bold text-zinc-900">{summary.gates}</span>
          </div>
        </div>

        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-3.5 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Zones</span>
            <span className="text-lg font-bold text-zinc-900">{summary.zones}</span>
          </div>
        </div>

        <div className="bg-white border border-[#EAE8E1] rounded-2xl p-3.5 shadow-xs flex items-center space-x-3 col-span-2 sm:col-span-1">
          <div className="p-2.5 bg-[#C59B27]/10 text-[#C59B27] rounded-xl shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Active Points</span>
            <span className="text-lg font-bold text-zinc-900">{summary.activeLocations}</span>
          </div>
        </div>
      </div>

      {/* Main Grid Layout: Directory (Left) + Location Details (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* LEFT PANEL: Directory List */}
        <div className="lg:col-span-5 bg-white border border-[#EAE8E1] rounded-2xl overflow-hidden shadow-xs space-y-0">
          
          {/* Search & Filter Controls */}
          <div className="p-4 border-b border-[#EAE8E1] bg-zinc-50/50 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search locations, rooms, gates or zones..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white pl-9 pr-8 py-2 border border-[#EAE8E1] rounded-xl text-xs focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] focus:outline-none"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')} 
                  className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Type Filter Chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                { key: '', label: 'All' },
                { key: 'room', label: 'Rooms' },
                { key: 'zone', label: 'Zones' },
                { key: 'gate', label: 'Gates' },
                { key: 'pickup_point', label: 'Pickups' },
                { key: 'check_in_point', label: 'Check-ins' },
                { key: 'first_aid_point', label: 'First Aid' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setFilterType(t.key)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold shrink-0 border cursor-pointer transition-all ${
                    filterType === t.key 
                      ? 'bg-[#C59B27] text-white border-[#C59B27]' 
                      : 'bg-white border-[#EAE8E1] text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location List Items */}
          <div className="divide-y divide-[#EAE8E1] max-h-[580px] overflow-y-auto">
            {loading && locations.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#C59B27]" />
                <p className="font-semibold text-zinc-600">Loading directory...</p>
              </div>
            ) : filteredLocations.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 space-y-2">
                <MapPin className="w-6 h-6 mx-auto text-zinc-300" />
                <p className="font-bold text-zinc-700">No event locations found</p>
                <p className="text-[11px] max-w-xs mx-auto text-zinc-400">
                  {searchTerm || filterType 
                    ? 'No locations match your filter settings. Try clearing your search.' 
                    : 'Click "Add Location" to register your first room, gate, or zone.'}
                </p>
                {searchTerm || filterType ? (
                  <button 
                    onClick={() => { setSearchTerm(''); setFilterType(''); }}
                    className="px-3 py-1 bg-zinc-100 text-zinc-700 rounded-lg text-[11px] font-bold hover:bg-zinc-200 mt-2"
                  >
                    Clear Filters
                  </button>
                ) : (
                  <button 
                    onClick={openCreateModal}
                    className="px-3 py-1 bg-[#C59B27] text-white rounded-lg text-[11px] font-bold hover:bg-[#A37E1C] mt-2"
                  >
                    Add Location
                  </button>
                )}
              </div>
            ) : (
              filteredLocations.map(loc => {
                const isSelected = selectedLocation?.id === loc.id;
                return (
                  <div
                    key={loc.id}
                    onClick={() => handleSelectLocation(loc)}
                    className={`p-4 text-left cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-[#C59B27]/5 border-l-4 border-[#C59B27]' 
                        : 'hover:bg-zinc-50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-xs text-zinc-900 truncate">
                            {loc.name}
                          </span>
                          {loc.shortName && (
                            <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.2 rounded font-mono border border-zinc-200">
                              {loc.shortName}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                          {loc.pathLabel || 'Event root level'}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center space-x-1.5">
                        {getTypeBadge(loc.type)}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-500">
                      <div className="flex items-center space-x-2">
                        {loc.capacity ? (
                          <span className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded font-medium text-[10px]">
                            Cap: <strong>{loc.capacity}</strong>
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-[10px]">No cap set</span>
                        )}

                        {loc.teamKey && (
                          <span className="bg-[#C59B27]/10 text-[#A37E1C] px-2 py-0.5 rounded text-[10px] font-semibold">
                            {loc.teamKey}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-1 text-[10px]">
                        <span className={`w-2 h-2 rounded-full ${loc.isActive ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                        <span className="text-zinc-500">{loc.isActive ? 'Active' : 'Archived'}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Selected Location Detail View */}
        <div className="lg:col-span-7 space-y-6">
          {selectedLocation ? (
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 shadow-xs space-y-6">
              
              {/* SECTION A — Header & Quick Actions */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#EAE8E1] pb-5">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                    <h3 className="text-xl font-serif font-bold text-zinc-900 tracking-tight">
                      {selectedLocation.name}
                    </h3>
                    {getTypeBadge(selectedLocation.type)}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      selectedLocation.isActive 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                    }`}>
                      {selectedLocation.isActive ? 'Active' : 'Archived'}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-500 font-medium flex items-center space-x-1">
                    <span>Hierarchy Path:</span>
                    <strong className="text-zinc-800">{selectedLocation.pathLabel}</strong>
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => openEditModal(selectedLocation)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#EAE8E1] rounded-xl text-xs font-bold text-zinc-700 hover:text-zinc-900 hover:bg-zinc-50 transition-all cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => handleOpenQRModal(selectedLocation)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#EAE8E1] rounded-xl text-xs font-bold text-zinc-700 hover:text-zinc-900 hover:bg-zinc-50 transition-all cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5 text-zinc-500" />
                    <span>QR Code</span>
                  </button>

                  <button
                    onClick={() => handleToggleArchive(selectedLocation)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                      selectedLocation.isActive 
                        ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' 
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>{selectedLocation.isActive ? 'Archive' : 'Restore'}</span>
                  </button>
                </div>
              </div>

              {/* SECTION B — Operational Summary Cards (4 Cards) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-[#FAF9F6] border border-[#EAE8E1] p-3.5 rounded-xl space-y-1">
                  <span className="text-zinc-400 block text-[10px] uppercase font-bold tracking-wider">
                    Capacity
                  </span>
                  <span className="text-sm font-bold text-zinc-900 block">
                    {selectedLocation.capacity ? `${selectedLocation.capacity} persons` : 'No limit set'}
                  </span>
                </div>

                <div className="bg-[#FAF9F6] border border-[#EAE8E1] p-3.5 rounded-xl space-y-1">
                  <span className="text-zinc-400 block text-[10px] uppercase font-bold tracking-wider">
                    Age Target
                  </span>
                  <span className="text-sm font-bold text-[#C59B27] block capitalize">
                    {selectedLocation.ageGroupKey || 'All ages'}
                  </span>
                </div>

                <div className="bg-[#FAF9F6] border border-[#EAE8E1] p-3.5 rounded-xl space-y-1">
                  <span className="text-zinc-400 block text-[10px] uppercase font-bold tracking-wider">
                    Assigned Team
                  </span>
                  <span className="text-sm font-bold text-zinc-900 block truncate">
                    {selectedLocation.teamKey || 'General'}
                  </span>
                </div>

                <div className="bg-[#FAF9F6] border border-[#EAE8E1] p-3.5 rounded-xl space-y-1">
                  <span className="text-zinc-400 block text-[10px] uppercase font-bold tracking-wider">
                    On Duty Present
                  </span>
                  <span className="text-sm font-bold text-emerald-700 block">
                    {selectedCoverage?.activeResponders?.length || 0} active
                  </span>
                </div>
              </div>

              {/* SECTION C — Descriptions & Directives */}
              <div className="space-y-4 text-xs border-t border-[#EAE8E1] pt-5">
                {selectedLocation.description && (
                  <div className="space-y-1">
                    <h4 className="font-bold text-zinc-800 flex items-center space-x-1.5">
                      <FileText className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Description</span>
                    </h4>
                    <p className="text-zinc-600 bg-zinc-50 p-3 rounded-xl border border-zinc-200/60 text-xs">
                      {selectedLocation.description}
                    </p>
                  </div>
                )}

                {selectedLocation.instructions && (
                  <div className="space-y-1">
                    <h4 className="font-bold text-zinc-800 flex items-center space-x-1.5">
                      <Shield className="w-3.5 h-3.5 text-amber-500" />
                      <span>Special Instructions</span>
                    </h4>
                    <p className="text-amber-900 bg-amber-50/50 p-3 rounded-xl border border-amber-200/60 whitespace-pre-line text-xs">
                      {selectedLocation.instructions}
                    </p>
                  </div>
                )}

                {selectedLocation.emergencyLabel && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                    <span className="font-bold text-rose-800 flex items-center space-x-1.5 text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>EMERGENCY DISPATCH LABEL</span>
                    </span>
                    <p className="text-rose-900 font-semibold text-xs">
                      {selectedLocation.emergencyLabel}
                    </p>
                  </div>
                )}
              </div>

              {/* SECTION D — Printable QR Code Card Section */}
              <div className="border-t border-[#EAE8E1] pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                      Printable QR Access Card
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Display or print this QR card at the physical location entry point.
                    </p>
                  </div>

                  <button
                    onClick={() => handleOpenQRModal(selectedLocation)}
                    className="px-3 py-1.5 bg-[#C59B27]/10 text-[#C59B27] hover:bg-[#C59B27]/20 border border-[#C59B27]/30 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Manage Card & Token</span>
                  </button>
                </div>

                <div className="bg-[#FAF9F6] border-2 border-dashed border-[#EAE8E1] rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-20 h-20 bg-white border border-[#EAE8E1] rounded-xl flex items-center justify-center p-2 shadow-xs shrink-0">
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="Location QR Access Pass" className="w-full h-full object-contain" />
                      ) : (
                        <QrCode className="w-12 h-12 text-zinc-300 animate-pulse" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold uppercase text-[#C59B27] tracking-wider block">
                          KOINONIA EVENT ACCESS
                        </span>
                        {qrToken && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active Pass
                          </span>
                        )}
                      </div>
                      <h5 className="font-bold text-sm text-zinc-900">{selectedLocation.name}</h5>
                      <p className="text-[11px] text-zinc-500">
                        Scan to confirm your location and open the permitted Event Duty tools.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={handlePrintCard}
                      className="px-3.5 py-2 bg-white border border-[#EAE8E1] text-zinc-700 hover:text-zinc-900 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 shadow-xs"
                    >
                      <Printer className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Print Label</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION E — On-Duty Coverage & Active Responders Feed */}
              <div className="border-t border-[#EAE8E1] pt-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                  <span>Active Responders & Safety Feeds</span>
                  <span className="text-[10px] text-zinc-400 font-normal">Real-time status</span>
                </h4>

                {coverageLoading ? (
                  <div className="p-4 text-center text-xs text-zinc-400 space-y-2">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto text-[#C59B27]" />
                    <span>Loading active coverage...</span>
                  </div>
                ) : selectedCoverage ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    
                    {/* Active Responders */}
                    <div className="border border-[#EAE8E1] rounded-xl p-4 bg-zinc-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-800 flex items-center space-x-1.5">
                          <Users className="w-4 h-4 text-zinc-500" />
                          <span>Responders Present</span>
                        </span>
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          {selectedCoverage.activeResponders.length} active
                        </span>
                      </div>

                      {selectedCoverage.activeResponders.length === 0 ? (
                        <p className="text-[11px] text-zinc-400 italic">
                          No responders currently logged present at this location.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                          {selectedCoverage.activeResponders.map((resp: any, idx: number) => (
                            <div key={resp.id || idx} className="bg-white border border-[#EAE8E1] p-2.5 rounded-lg flex items-center justify-between text-xs">
                              <div>
                                <span className="font-bold text-zinc-800 block">{resp.fullName || resp.full_name}</span>
                                <span className="text-[10px] text-zinc-400">{resp.role}</span>
                              </div>
                              {resp.phone && (
                                <a href={`tel:${resp.phone}`} className="text-[10px] text-[#C59B27] font-bold flex items-center space-x-1 bg-[#C59B27]/10 px-2 py-1 rounded">
                                  <Phone className="w-3 h-3" />
                                  <span>{resp.phone}</span>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Active Safety Alerts */}
                    <div className="border border-[#EAE8E1] rounded-xl p-4 bg-zinc-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-800 flex items-center space-x-1.5">
                          <ShieldAlert className="w-4 h-4 text-zinc-500" />
                          <span>Active Location Alerts</span>
                        </span>
                        <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          {selectedCoverage.activeAlerts.length} open
                        </span>
                      </div>

                      {selectedCoverage.activeAlerts.length === 0 ? (
                        <p className="text-[11px] text-zinc-400 italic">
                          Clear. No open safety alerts for this location.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                          {selectedCoverage.activeAlerts.map((alert: any, idx: number) => (
                            <div key={alert.id || idx} className="bg-white border border-rose-200 p-2.5 rounded-lg text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-zinc-900">{alert.title}</span>
                                <span className="text-[9px] font-bold uppercase bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                                  {alert.severity}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                ) : null}
              </div>

            </div>
          ) : (
            /* EMPTY STATE when no location is selected */
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-12 text-center text-xs text-zinc-400 space-y-4 shadow-xs">
              <div className="w-16 h-16 bg-[#C59B27]/10 text-[#C59B27] rounded-full flex items-center justify-center mx-auto">
                <MapPin className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-zinc-800">No Location Selected</h3>
                <p className="text-xs text-zinc-500">
                  Select a room, zone, or gate from the directory list on the left to review occupancy capacity, print QR scanning cards, and track active responders.
                </p>
              </div>
              <button
                onClick={openCreateModal}
                className="px-4 py-2 bg-[#C59B27] text-white rounded-xl text-xs font-bold hover:bg-[#A37E1C] transition-all cursor-pointer inline-flex items-center space-x-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add Location</span>
              </button>
            </div>
          )}
        </div>

      </div>

      {/* MODAL 1: ADD / EDIT LOCATION FORM */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 w-full max-w-lg shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-4">
              <h3 className="text-base font-bold text-zinc-900 tracking-tight flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-[#C59B27]" />
                <span>{isEditing ? 'Edit Location Configuration' : 'Add New Event Location'}</span>
              </h3>
              <button 
                onClick={() => setShowFormModal(false)}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLocation} className="space-y-4 text-xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700 block">Location Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grace Hall Primary, Gate A"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-700 block">Short Code / Tag</label>
                  <input
                    type="text"
                    placeholder="e.g. GH-101, GATE-A"
                    value={formShortName}
                    onChange={(e) => setFormShortName(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] focus:outline-none font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700 block">Location Type *</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none font-bold"
                  >
                    <option value="room">Room</option>
                    <option value="zone">Zone</option>
                    <option value="gate">Gate</option>
                    <option value="pickup_point">Pickup Point</option>
                    <option value="check_in_point">Check-in Point</option>
                    <option value="first_aid_point">First Aid Point</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-700 block">Parent Location (Hierarchy)</label>
                  <select
                    value={formParentId}
                    onChange={(e) => setFormParentId(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                  >
                    <option value="">None (Root Level)</option>
                    {locations
                      .filter(l => l.id !== formId && l.isActive)
                      .map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.type})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700 block">Capacity Limit</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 50"
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-700 block">Age Target</label>
                  <select
                    value={formAgeGroup}
                    onChange={(e) => setFormAgeGroup(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                  >
                    <option value="all">All Ages</option>
                    <option value="nursery">Nursery / Infants</option>
                    <option value="toddlers">Toddlers</option>
                    <option value="preschool">Preschool</option>
                    <option value="elementary">Elementary</option>
                    <option value="teens">Teens</option>
                    <option value="adults">Adults</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-700 block">Duty Team</label>
                  <select
                    value={formTeamKey}
                    onChange={(e) => setFormTeamKey(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                  >
                    <option value="General Response">General Response</option>
                    <option value="Child Check-in">Child Check-in</option>
                    <option value="Medical / First Aid">Medical / First Aid</option>
                    <option value="Security / Safety">Security / Safety</option>
                    <option value="Facilities">Facilities</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700 block">Emergency Dispatch Label</label>
                <input
                  type="text"
                  placeholder="e.g. Sector 2 Emergency Point - Medical Kit Available"
                  value={formEmergencyLabel}
                  onChange={(e) => setFormEmergencyLabel(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700 block">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief operational description of room purpose or layout..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700 block">Special Instructions for Duty Responders</label>
                <textarea
                  rows={2}
                  placeholder="Check wristband color before parent release. Keep fire exit clear..."
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#EAE8E1]">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 bg-white border border-[#EAE8E1] text-zinc-600 rounded-xl font-bold hover:bg-zinc-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLocation}
                  className="px-5 py-2 bg-[#C59B27] text-white rounded-xl font-bold hover:bg-[#A37E1C] transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {savingLocation && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEditing ? 'Save Changes' : 'Create Location'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PRINT / MANAGE QR CARD */}
      {showQRModal && selectedLocation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 w-full max-w-md shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-4">
              <h3 className="text-base font-bold text-zinc-900 tracking-tight flex items-center space-x-2">
                <QrCode className="w-5 h-5 text-[#C59B27]" />
                <span>Location QR Access Label</span>
              </h3>
              <button 
                onClick={() => setShowQRModal(false)}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-center">
              {/* QR Card Preview */}
              <div className="bg-[#FAF9F6] border-2 border-[#EAE8E1] p-6 rounded-2xl space-y-3 max-w-xs mx-auto shadow-xs">
                <div className="text-[10px] font-bold uppercase text-[#C59B27] tracking-widest">
                  KOINONIA CHURCH EVENT
                </div>
                
                <h4 className="font-serif font-bold text-lg text-zinc-900">{selectedLocation.name}</h4>
                <p className="text-[11px] text-zinc-500 font-medium">{selectedLocation.pathLabel}</p>

                <div className="w-44 h-44 bg-white border border-[#EAE8E1] rounded-2xl mx-auto flex items-center justify-center p-2 shadow-xs">
                  {qrLoading ? (
                    <RefreshCw className="w-6 h-6 animate-spin text-[#C59B27]" />
                  ) : qrDataUrl ? (
                    <img src={qrDataUrl} alt="Scannable Location Access QR Code" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-zinc-400 italic">No active QR code generated</span>
                  )}
                </div>

                {qrToken ? (
                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      QR Access Active
                    </span>
                    <p className="text-[10px] text-zinc-500 font-medium leading-tight pt-1">
                      Scan to confirm location &amp; open permitted Event Duty tools.
                    </p>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                    QR Access Disabled
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handlePrintCard}
                  disabled={!qrToken || qrLoading}
                  className="w-full py-2.5 bg-[#C59B27] text-white rounded-xl text-xs font-bold hover:bg-[#A37E1C] transition-all cursor-pointer shadow-xs flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Location Label</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirmActionModal('rotate')}
                    disabled={qrLoading}
                    className="py-2 bg-white border border-[#EAE8E1] text-zinc-700 hover:text-zinc-900 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${qrLoading ? 'animate-spin' : ''}`} />
                    <span>Rotate Token</span>
                  </button>

                  <button
                    onClick={() => setConfirmActionModal('disable')}
                    disabled={!qrToken || qrLoading}
                    className="py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                  >
                    Disable Code
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR ROTATE / DISABLE */}
      {confirmActionModal && selectedLocation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 text-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${confirmActionModal === 'rotate' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
              {confirmActionModal === 'rotate' ? <RefreshCw className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-base text-zinc-900">
                {confirmActionModal === 'rotate' ? 'Rotate QR Code Token?' : 'Disable Location QR Access?'}
              </h4>
              <p className="text-xs text-zinc-600 leading-relaxed">
                {confirmActionModal === 'rotate'
                  ? 'Rotating this code will immediately invalidate previously printed physical labels. Duty volunteers will need to scan the newly printed code to register presence.'
                  : 'Disabling QR access will prevent volunteers from scanning this location label until a new code is generated by an administrator.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setConfirmActionModal(null)}
                className="py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmActionModal === 'rotate') {
                    handleGenerateQR();
                  } else {
                    handleDisableQR();
                  }
                  setConfirmActionModal(null);
                }}
                className={`py-2 text-white rounded-xl text-xs font-bold cursor-pointer transition-all ${confirmActionModal === 'rotate' ? 'bg-[#C59B27] hover:bg-[#A37E1C]' : 'bg-rose-600 hover:bg-rose-700'}`}
              >
                {confirmActionModal === 'rotate' ? 'Confirm Rotation' : 'Disable Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE PHYSICAL LOCATION ACCESS LABEL */}
      {selectedLocation && (
        <>
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #printable-location-label, #printable-location-label * {
                visibility: visible !important;
              }
              #printable-location-label {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                display: block !important;
                margin: 0 !important;
                box-shadow: none !important;
              }
            }
          `}</style>
          <div id="printable-location-label" className="hidden print:block p-8 bg-white text-zinc-900 font-sans max-w-lg mx-auto border-4 border-zinc-900 rounded-3xl space-y-6 text-center">
            <div className="border-b-2 border-zinc-900 pb-4 space-y-1">
              <div className="text-[12px] font-bold uppercase tracking-widest text-[#C59B27]">
                KOINONIA CHURCH EVENT DUTY
              </div>
              <h1 className="text-3xl font-serif font-black tracking-tight text-zinc-950">{selectedLocation.name}</h1>
              <p className="text-sm font-semibold text-zinc-600">{selectedLocation.pathLabel}</p>
            </div>

            <div className="w-64 h-64 mx-auto bg-white border-2 border-zinc-900 p-3 rounded-2xl flex items-center justify-center shadow-md">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Location Access QR Code" className="w-full h-full object-contain" />
              ) : (
                <div className="text-xs text-zinc-400 italic">QR Code Not Generated</div>
              )}
            </div>

            <div className="space-y-2 border-t-2 border-zinc-900 pt-4">
              <p className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                Event Duty Volunteers: Scan to Register Active Presence
              </p>
              <p className="text-[11px] text-zinc-600 max-w-sm mx-auto leading-relaxed">
                Point your mobile terminal camera at this QR label to confirm active duty location presence and access permitted operational controls.
              </p>
            </div>

            <div className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest pt-2 border-t border-zinc-200">
              Official Ministry Location Pass • Do Not Cover, Obscure or Alter
            </div>
          </div>
        </>
      )}

    </div>
  );
}

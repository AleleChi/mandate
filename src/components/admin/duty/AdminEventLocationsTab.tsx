import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Plus, 
  Search, 
  RefreshCw, 
  Trash2, 
  Edit, 
  QrCode, 
  Printer, 
  AlertTriangle, 
  ShieldAlert, 
  Users, 
  Check, 
  Eye, 
  EyeOff, 
  X, 
  ArrowRight,
  Info,
  Archive,
  Maximize2
} from 'lucide-react';

const REAL_EVENT_ID = 'the-general-assembly-2026';

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
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Selection
  const [selectedLocation, setSelectedLocation] = useState<EventLocation | null>(null);
  const [selectedCoverage, setSelectedCoverage] = useState<LocationCoverage | null>(null);
  const [coverageLoading, setCoverageLoading] = useState<boolean>(false);

  // Form State
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

  // QR Code details state
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState<boolean>(false);

  // Fetch Locations
  const fetchLocations = async () => {
    setLoading(true);
    setError(null);
    try {
      // Include optional filterType
      const queryParams = new URLSearchParams();
      if (filterType) {
        queryParams.append('type', filterType);
      }
      // Let's call /api/admin/locations endpoint
      const res = await fetch(`/api/admin/locations?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // If viewing archived, we can filter differently. 
          // The backend returns all locations. 
          setLocations(data.items || []);
        } else {
          setError(data.error || 'Failed to fetch locations');
        }
      } else {
        setError('Server returned an error fetching locations');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred connecting to the server');
    } finally {
      setLoading(false);
    }
  };

  // Fetch coverage for selected location
  const fetchLocationCoverage = async (locId: string) => {
    setCoverageLoading(true);
    try {
      const res = await fetch(`/api/admin/locations/${locId}/coverage`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSelectedCoverage({
            locationId: locId,
            activeResponders: data.responders || [],
            activeAlerts: data.alerts || []
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
    } else {
      setSelectedCoverage(null);
    }
  }, [selectedLocation]);

  // Handle Select Location
  const handleSelectLocation = (loc: EventLocation) => {
    setSelectedLocation(loc);
  };

  // Prevent circular relationships check
  const wouldBeCircular = (locId: string, parentId: string): boolean => {
    if (!parentId) return false;
    if (locId === parentId) return true;
    
    // Find the proposed parent's parent, trace up
    let currentParentId: string | null = parentId;
    const visited = new Set<string>();
    while (currentParentId) {
      if (visited.has(currentParentId)) return true; // loop
      visited.add(currentParentId);
      if (currentParentId === locId) return true;
      
      const parentLoc = locations.find(l => l.id === currentParentId);
      currentParentId = parentLoc ? parentLoc.parentLocationId : null;
    }
    return false;
  };

  // Open Form modal
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

    setLoading(true);
    try {
      const url = isEditing ? `/api/admin/locations/${formId}` : '/api/admin/locations';
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSuccess(isEditing ? 'Location updated successfully!' : 'Location created successfully!');
          setShowFormModal(false);
          await fetchLocations();
          if (isEditing && selectedLocation?.id === formId) {
            // Refresh selected details
            const updated = data.location;
            if (updated) {
              setSelectedLocation({
                id: updated.id,
                eventId: updated.event_id,
                parentLocationId: updated.parent_location_id,
                type: updated.location_type,
                name: updated.name,
                shortName: updated.short_name,
                description: updated.description,
                instructions: updated.instructions,
                capacity: updated.capacity,
                ageGroupKey: updated.age_group_key,
                teamKey: updated.team_key,
                emergencyLabel: updated.emergency_label,
                sortOrder: updated.sort_order,
                isActive: !!updated.is_active,
                pathLabel: updated.name // path label will refresh on fetchLocations
              });
            }
          }
        } else {
          alert(data.error || 'Failed to save location');
        }
      } else {
        alert('An error occurred on the server.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error trying to save location');
    } finally {
      setLoading(false);
    }
  };

  // Handle Archive / Restore
  const handleToggleArchive = async (loc: EventLocation) => {
    const action = loc.isActive ? 'archive' : 'restore';
    if (!confirm(`Are you sure you want to ${action} "${loc.name}"?`)) return;

    try {
      const res = await fetch(`/api/admin/locations/${loc.id}/${action}`, { method: 'POST' });
      if (res.ok) {
        setSuccess(`Location ${action}d successfully.`);
        await fetchLocations();
        if (selectedLocation?.id === loc.id) {
          setSelectedLocation(null);
        }
      } else {
        alert(`Failed to ${action} location.`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // QR Code Actions
  const handleOpenQRModal = async (loc: EventLocation) => {
    setSelectedLocation(loc);
    setShowQRModal(true);
    setQrLoading(true);
    setQrToken(null);
    try {
      const res = await fetch(`/api/admin/locations/${loc.id}/qr`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.code) {
          setQrToken(data.code.token_hash);
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
      const res = await fetch(`/api/admin/locations/${selectedLocation.id}/qr`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.code) {
          setQrToken(data.code.token_hash);
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
    if (!selectedLocation || !confirm('Are you sure you want to disable this QR code? Volunteers will no longer be able to scan it.')) return;
    setQrLoading(true);
    try {
      const res = await fetch(`/api/admin/locations/${selectedLocation.id}/qr`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setQrToken(null);
          setSuccess('QR code code disabled.');
        }
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

  // Helper colors for type badge
  const getTypeBadge = (type: string) => {
    const classes: Record<string, string> = {
      room: 'bg-indigo-50 text-indigo-700 border-indigo-100',
      zone: 'bg-amber-50 text-amber-700 border-amber-100',
      gate: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      pickup_point: 'bg-rose-50 text-rose-700 border-rose-100',
      check_in_point: 'bg-sky-50 text-sky-700 border-sky-100',
      first_aid_point: 'bg-red-50 text-red-700 border-red-100',
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
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${classes[type] || 'bg-zinc-50 text-zinc-700 border-zinc-100'}`}>
        {labels[type] || type}
      </span>
    );
  };

  // Filter and search logic for client display
  const filteredLocations = locations.filter(loc => {
    const matchSearch = searchTerm.trim() === '' || 
      loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (loc.shortName && loc.shortName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      loc.pathLabel.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchArchive = showArchived ? !loc.isActive : loc.isActive;
    return matchSearch && matchArchive;
  });

  return (
    <div 
      data-view-version="admin-event-locations-v1-premium"
      className="bg-[#FAF9F6] border border-[#EAE8E1] rounded-3xl p-6 shadow-xs space-y-6"
    >
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-5">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 tracking-tight flex items-center space-x-2">
            <MapPin className="w-5 h-5 text-[#C59B27]" />
            <span>Event Locations Directory</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Configure rooms, zones, check-in gates, first-aid areas, capacity metrics, and printable QR codes.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setShowArchived(!showArchived);
              setSelectedLocation(null);
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
              showArchived 
                ? 'bg-amber-50 border-amber-200 text-amber-700' 
                : 'bg-white border-[#EAE8E1] text-zinc-600 hover:text-zinc-900'
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

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-xl flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Left List, Right Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Directory List */}
        <div className="lg:col-span-5 bg-white border border-[#EAE8E1] rounded-2xl overflow-hidden shadow-xs">
          {/* List Search Bar */}
          <div className="p-4 border-b border-[#EAE8E1] bg-zinc-50/50 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search location name, room, path..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white pl-9 pr-4 py-2 border border-[#EAE8E1] rounded-xl text-xs focus:ring-1 focus:ring-[#C59B27] focus:border-[#C59B27] focus:outline-none"
              />
            </div>
            
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[
                { key: '', label: 'All Types' },
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
                      : 'bg-white border-[#EAE8E1] text-zinc-500 hover:text-zinc-950'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Directory Locations List */}
          <div className="divide-y divide-[#EAE8E1] max-h-[550px] overflow-y-auto">
            {loading && locations.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#C59B27]" />
                <span>Loading location directory...</span>
              </div>
            ) : filteredLocations.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 space-y-1">
                <MapPin className="w-5 h-5 mx-auto text-zinc-300 mb-1" />
                <p className="font-semibold text-zinc-500">No locations found</p>
                <p className="text-[10px]">Try adapting your search term or select another filter.</p>
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
                          <span className="font-bold text-xs text-zinc-900 truncate">
                            {loc.name}
                          </span>
                          {loc.shortName && (
                            <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.2 rounded font-mono">
                              {loc.shortName}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                          {loc.pathLabel || 'Event root level'}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center space-x-1.5">
                        {getTypeBadge(loc.type)}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center gap-3 text-[10px] text-zinc-500">
                      {loc.capacity && (
                        <span>Cap: <strong className="text-zinc-700">{loc.capacity}</strong></span>
                      )}
                      {loc.teamKey && (
                        <span className="bg-[#C59B27]/10 text-[#A37E1C] px-1.5 py-0.2 rounded-sm font-semibold">
                          {loc.teamKey}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Location Detail Card & Metrics */}
        <div className="lg:col-span-7 space-y-6">
          {selectedLocation ? (
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 shadow-xs space-y-6">
              
              {/* Top Banner details */}
              <div className="flex items-start justify-between gap-4 border-b border-[#EAE8E1] pb-5">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <h3 className="text-base font-bold text-zinc-900 tracking-tight">
                      {selectedLocation.name}
                    </h3>
                    {getTypeBadge(selectedLocation.type)}
                    {!selectedLocation.isActive && (
                      <span className="bg-zinc-100 text-zinc-600 border border-zinc-200 text-[9px] font-bold px-2 py-0.5 rounded">
                        Archived
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">
                    Path: {selectedLocation.pathLabel}
                  </p>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    onClick={() => openEditModal(selectedLocation)}
                    className="p-2 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 rounded-xl transition-all cursor-pointer"
                    title="Edit Location Settings"
                  >
                    <Edit className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleOpenQRModal(selectedLocation)}
                    className="p-2 hover:bg-[#C59B27]/10 text-zinc-600 hover:text-[#C59B27] rounded-xl transition-all cursor-pointer"
                    title="QR Code Management"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleToggleArchive(selectedLocation)}
                    className={`p-2 rounded-xl transition-all cursor-pointer ${
                      selectedLocation.isActive 
                        ? 'hover:bg-amber-50 text-amber-600 hover:text-amber-800' 
                        : 'hover:bg-emerald-50 text-emerald-600 hover:text-emerald-800'
                    }`}
                    title={selectedLocation.isActive ? 'Archive Location' : 'Restore Location'}
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Detailed Specs Block */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-[#FAF9F6] border border-[#EAE8E1] p-3.5 rounded-xl space-y-1">
                  <span className="text-zinc-400 block text-[10px] uppercase font-bold tracking-wider">
                    Location Directives
                  </span>
                  <div className="text-zinc-800 font-semibold space-y-1.5 pt-1">
                    <p>Age Group: <span className="text-[#C59B27]">{selectedLocation.ageGroupKey || 'All kids'}</span></p>
                    <p>Assigned Team: <span className="text-zinc-900">{selectedLocation.teamKey || 'None'}</span></p>
                    <p>Sort Weight: <span className="text-zinc-500 font-mono">{selectedLocation.sortOrder}</span></p>
                  </div>
                </div>

                <div className="bg-[#FAF9F6] border border-[#EAE8E1] p-3.5 rounded-xl space-y-2">
                  <span className="text-zinc-400 block text-[10px] uppercase font-bold tracking-wider">
                    Capacity Utilization
                  </span>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-zinc-700 font-medium">
                      <span>Capacity Limit:</span>
                      <span className="font-bold">{selectedLocation.capacity || 'No limit'}</span>
                    </div>
                    {selectedLocation.capacity ? (
                      <div className="space-y-1">
                        <div className="w-full bg-zinc-200 rounded-full h-2">
                          {/* We estimate from active responders + alerts or arbitrary */}
                          <div 
                            className="bg-[#C59B27] h-2 rounded-full" 
                            style={{ width: `${Math.min(100, ((selectedCoverage?.activeResponders.length || 0) / selectedLocation.capacity) * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-zinc-400">
                          <span>0% occupancy</span>
                          <span>Estimated coverage: {selectedCoverage?.activeResponders.length || 0} active</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-zinc-400">
                        This location does not specify an absolute room capacity.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Descriptions & Instructions */}
              <div className="space-y-3.5 text-xs">
                {selectedLocation.description && (
                  <div className="space-y-1">
                    <h4 className="font-bold text-zinc-800">Description</h4>
                    <p className="text-zinc-600 bg-zinc-50 p-3 rounded-xl border border-zinc-100/50 italic">
                      "{selectedLocation.description}"
                    </p>
                  </div>
                )}

                {selectedLocation.instructions && (
                  <div className="space-y-1">
                    <h4 className="font-bold text-zinc-800">Special Instructions</h4>
                    <p className="text-zinc-600 bg-amber-50/30 text-amber-900 p-3 rounded-xl border border-amber-100/30 whitespace-pre-line">
                      {selectedLocation.instructions}
                    </p>
                  </div>
                )}

                {selectedLocation.emergencyLabel && (
                  <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl space-y-1">
                    <span className="font-bold text-red-800 flex items-center space-x-1">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span>EMERGENCY DISPATCH DIRECTIVE</span>
                    </span>
                    <p className="text-red-700 font-semibold">
                      {selectedLocation.emergencyLabel}
                    </p>
                  </div>
                )}
              </div>

              {/* Location Coverage Status (Live Feed) */}
              <div className="border-t border-[#EAE8E1] pt-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Location Coverage Status
                </h4>

                {coverageLoading ? (
                  <div className="p-4 text-center text-xs text-zinc-400 space-y-2">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto text-[#C59B27]" />
                    <span>Loading coverage details...</span>
                  </div>
                ) : selectedCoverage ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    
                    {/* Active Responders */}
                    <div className="border border-[#EAE8E1] rounded-xl p-4 bg-zinc-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-800 flex items-center space-x-1.5">
                          <Users className="w-4 h-4 text-zinc-500" />
                          <span>On Duty Here</span>
                        </span>
                        <span className="bg-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded text-[9px] font-bold">
                          {selectedCoverage.activeResponders.length} active
                        </span>
                      </div>

                      {selectedCoverage.activeResponders.length === 0 ? (
                        <p className="text-[10px] text-zinc-400 italic">
                          No responders currently verified present at this location.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                          {selectedCoverage.activeResponders.map((resp: any) => (
                            <div key={resp.id} className="bg-white border border-[#EAE8E1] p-2 rounded-lg flex items-center justify-between text-[11px]">
                              <div>
                                <span className="font-bold text-zinc-800 block">{resp.full_name}</span>
                                <span className="text-[9px] text-zinc-400">{resp.email}</span>
                              </div>
                              <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded font-semibold border border-emerald-100">
                                {resp.source}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Active Alerts in location */}
                    <div className="border border-[#EAE8E1] rounded-xl p-4 bg-zinc-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-800 flex items-center space-x-1.5">
                          <ShieldAlert className="w-4 h-4 text-zinc-500" />
                          <span>Active Safety Alerts</span>
                        </span>
                        <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[9px] font-bold">
                          {selectedCoverage.activeAlerts.length} open
                        </span>
                      </div>

                      {selectedCoverage.activeAlerts.length === 0 ? (
                        <p className="text-[10px] text-zinc-400 italic">
                          Clear. No active safety concerns reported here.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                          {selectedCoverage.activeAlerts.map((alert: any) => (
                            <div key={alert.id} className="bg-white border border-[#EAE8E1] p-2 rounded-lg text-[11px] space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-zinc-900">{alert.title}</span>
                                <span className={`text-[8px] font-bold uppercase px-1.5 rounded ${
                                  alert.severity === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {alert.severity}
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-500 truncate">{alert.message || 'No description'}</p>
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
            <div className="bg-white border border-[#EAE8E1] rounded-2xl p-12 text-center text-xs text-zinc-400 space-y-2 shadow-xs">
              <MapPin className="w-10 h-10 text-zinc-300 mx-auto" />
              <p className="font-semibold text-zinc-500">No Location Selected</p>
              <p className="text-[10px] max-w-sm mx-auto">
                Select a room, zone, or gate from the directory list on the left to review occupancy capacity, print QR scanning cards, and track active responders.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* FORM MODAL: CREATE / EDIT LOCATION */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 w-full max-w-lg shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-4">
              <h3 className="text-base font-bold text-zinc-900 tracking-tight flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-[#C59B27]" />
                <span>{isEditing ? 'Edit Location Configuration' : 'Configure New Location'}</span>
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
                  <label className="font-bold text-zinc-700 block">Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Room 102, Zone A"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-700 block">Short Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. R102, ZA"
                    value={formShortName}
                    onChange={(e) => setFormShortName(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700 block">Type *</label>
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
                    <option value="">None (Root Location)</option>
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
                    placeholder="None"
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-700 block">Age Group</label>
                  <select
                    value={formAgeGroup}
                    onChange={(e) => setFormAgeGroup(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                  >
                    <option value="all">All Ages</option>
                    <option value="nursery">Nursery</option>
                    <option value="toddlers">Toddlers</option>
                    <option value="preschool">Preschool</option>
                    <option value="kindergarten">Kindergarten</option>
                    <option value="teens">Teens</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-700 block">Sort Order</label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                    className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700 block">Assigned Response Team / Responsibility</label>
                <select
                  value={formTeamKey}
                  onChange={(e) => setFormTeamKey(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                >
                  <option value="General Response">General Response Team</option>
                  <option value="Care Lead">Care Leads</option>
                  <option value="Security Lead">Security Leads</option>
                  <option value="First Aid Team">First Aid Team</option>
                  <option value="Gate/Check-in Lead">Gate/Check-in Leads</option>
                  <option value="Pickup Lead">Pickup Leads</option>
                  <option value="Room/Group Lead">Room/Group Leads</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700 block">Description (Scope & Boundaries)</label>
                <textarea
                  placeholder="Describe where this room starts, boundaries, layout parameters..."
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700 block">Volunteer On Duty Special Instructions</label>
                <textarea
                  placeholder="Instructions shown to volunteers when they scan or select this location..."
                  rows={2}
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-[#C59B27] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-700 block">Emergency Dispatch Directive (Evacuation/Threats)</label>
                <input
                  type="text"
                  placeholder="e.g. Exit through East fire gate directly to South parking lot assembly point B"
                  value={formEmergencyLabel}
                  onChange={(e) => setFormEmergencyLabel(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-[#EAE8E1] rounded-xl focus:ring-1 focus:ring-red-300 focus:outline-none text-red-700 font-medium"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-[#EAE8E1]">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 hover:bg-zinc-100 text-zinc-600 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-[#C59B27] text-white rounded-xl font-bold hover:bg-[#A37E1C] disabled:opacity-50 transition-all cursor-pointer shadow-xs"
                >
                  {loading ? 'Saving Settings...' : 'Save Location'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* QR CODE DETAILS & PRINT CARD MODAL */}
      {showQRModal && selectedLocation && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 print:bg-white print:p-0">
          <div className="bg-white border border-[#EAE8E1] rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-6 max-h-[95vh] overflow-y-auto print:border-none print:shadow-none print:m-0 print:p-0 print:w-full print:max-w-none print:max-h-none">
            
            {/* Modal Header - Hidden in Print */}
            <div className="flex items-center justify-between border-b border-[#EAE8E1] pb-4 print:hidden">
              <h3 className="text-base font-bold text-zinc-900 tracking-tight flex items-center space-x-2">
                <QrCode className="w-5 h-5 text-[#C59B27]" />
                <span>Location QR Card Manager</span>
              </h3>
              <button 
                onClick={() => setShowQRModal(false)}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR Card Representation: Designed to be a printable physical placard */}
            <div className="border border-zinc-200 rounded-3xl p-8 bg-white shadow-xs text-center space-y-6 mx-auto max-w-sm border-dashed border-2 print:border-solid print:border-3 print:rounded-none print:p-12 print:shadow-none print:max-w-none">
              
              {/* Header block on card */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono tracking-widest text-[#C59B27] font-bold uppercase block">
                  KOINONIA FELLOWSHIP
                </span>
                <h4 className="text-xl font-black text-zinc-950 uppercase tracking-tight">
                  {selectedLocation.name}
                </h4>
                {selectedLocation.shortName && (
                  <span className="bg-zinc-100 text-zinc-800 text-[10px] font-bold px-2 py-0.5 rounded font-mono">
                    CODE: {selectedLocation.shortName}
                  </span>
                )}
                {selectedLocation.pathLabel !== selectedLocation.name && (
                  <p className="text-[10px] text-zinc-400 font-semibold uppercase">
                    {selectedLocation.pathLabel.replace(' › ' + selectedLocation.name, '')}
                  </p>
                )}
              </div>

              {/* Scannable Graphic representation - Standardized visual styling */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 flex flex-col items-center justify-center space-y-3 max-w-[240px] mx-auto relative print:bg-white print:border-zinc-300">
                {qrLoading ? (
                  <div className="py-8 text-zinc-400 text-xs flex flex-col items-center space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#C59B27]" />
                    <span>Preparing security code...</span>
                  </div>
                ) : qrToken ? (
                  <>
                    <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-xs shrink-0">
                      {/* Premium simulated high-contrast geometric vector design acting as high quality QR */}
                      <div className="w-28 h-28 bg-zinc-950 p-2 rounded flex flex-wrap content-between justify-between relative overflow-hidden">
                        {/* 4 corner position squares */}
                        <div className="w-8 h-8 bg-white border-4 border-zinc-950 flex items-center justify-center">
                          <div className="w-3 h-3 bg-zinc-950" />
                        </div>
                        <div className="w-8 h-8 bg-white border-4 border-zinc-950 flex items-center justify-center">
                          <div className="w-3 h-3 bg-zinc-950" />
                        </div>
                        <div className="w-8 h-8 bg-white border-4 border-zinc-950 flex items-center justify-center absolute bottom-2 left-2">
                          <div className="w-3 h-3 bg-zinc-950" />
                        </div>
                        {/* simulated randomized code pattern */}
                        <div className="w-full h-full flex flex-wrap content-center justify-center gap-1 opacity-90 p-4">
                          {[...Array(25)].map((_, i) => (
                            <div 
                              key={i} 
                              className={`w-1 h-1 rounded-xs ${
                                (i * 3 + qrToken.charCodeAt(i % qrToken.length)) % 2 === 0 ? 'bg-white' : 'bg-zinc-950'
                              }`} 
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="text-[9px] text-zinc-400 font-mono tracking-widest block truncate max-w-full uppercase">
                      SECURE: {qrToken.substring(0, 16)}...
                    </span>
                  </>
                ) : (
                  <div className="py-8 text-zinc-400 text-xs font-semibold flex flex-col items-center space-y-2">
                    <AlertTriangle className="w-6 h-6 text-zinc-300" />
                    <span>No Active Scannable Token</span>
                    <button 
                      onClick={handleGenerateQR}
                      className="px-3 py-1 bg-[#C59B27] text-white rounded-lg text-[10px] font-bold"
                    >
                      Generate New Token
                    </button>
                  </div>
                )}
              </div>

              {/* Instructions and footer */}
              <div className="space-y-3 text-zinc-600 text-left text-[11px] leading-relaxed max-w-xs mx-auto">
                <p className="font-bold text-center text-zinc-800 uppercase tracking-wide text-[10px]">
                  Volunteer On-Duty Instructions
                </p>
                <ol className="list-decimal pl-4 space-y-1.5 text-zinc-600">
                  <li>Open the <strong>Volunteer Dashboard</strong> on your device.</li>
                  <li>Tap on <strong>"Scan Location Code"</strong> or <strong>"Change Location"</strong>.</li>
                  <li>Scan this QR code with your camera to confirm your active presence.</li>
                  <li>Confirming presence ensures alerts inside this room are routed to you instantly!</li>
                </ol>
              </div>

              {selectedLocation.instructions && (
                <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-xl text-left text-[10px] text-amber-900 leading-relaxed max-w-xs mx-auto">
                  <span className="font-bold block uppercase tracking-wide mb-1 text-[8px] text-amber-800">
                    Room-Specific Guideline:
                  </span>
                  {selectedLocation.instructions}
                </div>
              )}
            </div>

            {/* Actions Bar - Hidden in Print */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#EAE8E1] print:hidden">
              <div className="flex gap-2">
                {qrToken && (
                  <>
                    <button
                      onClick={handleGenerateQR}
                      disabled={qrLoading}
                      className="px-3.5 py-2 hover:bg-zinc-100 text-zinc-700 rounded-xl text-xs font-bold border border-[#EAE8E1] cursor-pointer"
                    >
                      Rotate Code Token
                    </button>
                    <button
                      onClick={handleDisableQR}
                      disabled={qrLoading}
                      className="px-3.5 py-2 hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-bold border border-rose-100 cursor-pointer"
                    >
                      Disable Code
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setShowQRModal(false)}
                  className="px-4 py-2 hover:bg-zinc-100 text-zinc-600 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Close Manager
                </button>
                {qrToken && (
                  <button
                    onClick={handlePrintCard}
                    className="flex items-center space-x-1.5 px-5 py-2 bg-zinc-900 text-white hover:bg-zinc-800 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print QR Card</span>
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { MapPin, Info, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { buildApiUrl } from '../../utils/urlHelper';

interface EventLocation {
  id: string;
  name: string;
  shortName: string | null;
  type: string;
  pathLabel: string;
  instructions: string | null;
  emergencyLabel: string | null;
}

interface EventLocationSelectorProps {
  selectedLocationId: string | null;
  onSelectLocationId: (id: string | null) => void;
  customLocationLabel: string;
  onChangeCustomLocationLabel: (label: string) => void;
  locationDetail: string;
  onChangeLocationDetail: (detail: string) => void;
  locationSource: 'selected' | 'scanned' | 'manually_entered';
  onSelectLocationSource: (source: 'selected' | 'scanned' | 'manually_entered') => void;
}

export function EventLocationSelector({
  selectedLocationId,
  onSelectLocationId,
  customLocationLabel,
  onChangeCustomLocationLabel,
  locationDetail,
  onChangeLocationDetail,
  locationSource,
  onSelectLocationSource,
}: EventLocationSelectorProps) {
  const [locations, setLocations] = useState<EventLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(locationSource === 'manually_entered');

  useEffect(() => {
    const fetchLocations = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.request<{ success: boolean; items: EventLocation[] }>('/api/duty/locations');
        if (data && data.success) {
          setLocations(data.items || []);
        } else {
          setError('Failed to fetch location list');
        }
      } catch (err: any) {
        console.error('Error fetching locations:', err);
        setError('Network error fetching locations');
      } finally {
        setLoading(false);
      }
    };

    fetchLocations();
  }, []);

  // Sync mode with locationSource prop if it changes externally (like after a scanned code)
  useEffect(() => {
    if (locationSource === 'manually_entered') {
      setIsCustomMode(true);
    } else {
      setIsCustomMode(false);
    }
  }, [locationSource]);

  const handleSelectManagedLocation = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsCustomMode(true);
      onSelectLocationId(null);
      onSelectLocationSource('manually_entered');
    } else {
      setIsCustomMode(false);
      onSelectLocationId(val || null);
      onSelectLocationSource('selected');
    }
  };

  const selectedLocation = locations.find(l => l.id === selectedLocationId);

  return (
    <div 
      data-view-version="event-location-selector-v1"
      className="space-y-4 bg-gray-50/50 dark:bg-[#21211E] p-4 rounded-2xl border border-gray-100 dark:border-[#302E29]"
    >
      <div className="space-y-1.5">
        <label className="text-[10px] font-mono font-bold text-gray-400 dark:text-[#B8B0A5] uppercase tracking-wider block">
          Alert Incident Location <span className="text-rose-500">*</span>
        </label>
        
        {loading ? (
          <div className="flex items-center space-x-2 text-xs text-zinc-400 dark:text-[#7A7570] py-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C59B27]" />
            <span>Loading active ministry directory...</span>
          </div>
        ) : error ? (
          <div className="text-[10px] text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-xl border border-amber-100 dark:border-amber-900/40 flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5" />
            <span>{error}. Switching to manual text entry.</span>
          </div>
        ) : null}

        {/* Mode Selector Toggle Dropdown or Custom option */}
        {!isCustomMode ? (
          <div className="space-y-2">
            <select
              value={selectedLocationId || ''}
              onChange={handleSelectManagedLocation}
              className="w-full bg-white dark:bg-[#262520] border border-gray-200 dark:border-[#3A3835] text-neutral-900 dark:text-[#F0EBE3] rounded-xl px-3.5 py-3 text-xs font-semibold focus:border-[#C59B27] focus:ring-1 focus:ring-[#C59B27] outline-none transition-colors"
            >
              <option value="" className="dark:bg-[#262520] dark:text-[#F0EBE3]">-- Choose Managed Location from Directory --</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id} className="dark:bg-[#262520] dark:text-[#F0EBE3]">
                  {loc.pathLabel} ({loc.type.replace('_', ' ')})
                </option>
              ))}
              <option value="__custom__" className="dark:bg-[#262520] dark:text-[#F0EBE3]">✍️ Custom Location / Other Area...</option>
            </select>
            
            <p className="text-[9px] text-gray-400 dark:text-[#7A7570] leading-normal">
              Selecting a managed location routes the alert directly to the response team assigned to this area.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. In parking lot under the big tree, Hallway by main lobby"
                value={customLocationLabel}
                onChange={(e) => onChangeCustomLocationLabel(e.target.value.substring(0, 100))}
                className="w-full bg-white dark:bg-[#262520] border border-gray-200 dark:border-[#3A3835] text-neutral-900 dark:text-[#F0EBE3] placeholder:text-gray-400 dark:placeholder:text-[#7A7570] rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:border-[#C59B27] focus:ring-1 focus:ring-[#C59B27] outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => {
                  setIsCustomMode(false);
                  onChangeCustomLocationLabel('');
                  onSelectLocationSource('selected');
                }}
                className="px-3 py-2 bg-zinc-100 dark:bg-[#262520] hover:bg-zinc-200 dark:hover:bg-[#2A2926] text-zinc-600 dark:text-[#B8B0A5] border border-transparent dark:border-[#302E29] rounded-xl text-[10px] font-bold cursor-pointer shrink-0 transition-all"
              >
                Choose Listed
              </button>
            </div>
            <p className="text-[9px] text-gray-400 dark:text-[#7A7570] leading-normal">
              Enter a clear human-readable description of your exact current location so responders can find you.
            </p>
          </div>
        )}
      </div>

      {/* Optional Room Comment / Location Detail Input */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-mono font-bold text-gray-400 dark:text-[#B8B0A5] uppercase tracking-wider block">
          Additional Room Details (Optional)
        </label>
        <input
          type="text"
          placeholder="e.g. Back row, near window, near the playpen"
          value={locationDetail}
          onChange={(e) => onChangeLocationDetail(e.target.value.substring(0, 100))}
          className="w-full bg-white dark:bg-[#262520] border border-gray-200 dark:border-[#3A3835] text-neutral-900 dark:text-[#F0EBE3] placeholder:text-gray-400 dark:placeholder:text-[#7A7570] rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:border-[#C59B27] focus:ring-1 focus:ring-[#C59B27] outline-none transition-colors"
        />
        <p className="text-[9px] text-gray-400 dark:text-[#7A7570] leading-normal">
          Adds precise detail (e.g. "Table 4") to prevent generic lookups.
        </p>
      </div>

      {/* Show special instructions if managed location selected */}
      {selectedLocation && (
        <div className="space-y-2 pt-1">
          {selectedLocation.instructions && (
            <div className="p-3 bg-amber-50/50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded-xl text-[10px] text-amber-900 dark:text-amber-200 leading-relaxed flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block uppercase tracking-wide text-[8px] text-amber-800 dark:text-amber-400">
                  Room Special Instructions:
                </span>
                {selectedLocation.instructions}
              </div>
            </div>
          )}

          {selectedLocation.emergencyLabel && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-xl text-[10px] text-red-900 dark:text-red-200 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block uppercase tracking-wide text-[8px] text-red-800 dark:text-red-400">
                  EMERGENCY DISPATCH INSTRUCTION:
                </span>
                <span className="font-semibold">{selectedLocation.emergencyLabel}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

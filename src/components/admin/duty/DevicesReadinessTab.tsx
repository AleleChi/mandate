import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Trash2,
  Send,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  Search,
  Sliders,
  Wifi,
  WifiOff,
  Bell,
  Volume2,
  VolumeX,
  Vibrate,
  ShieldAlert,
  Info
} from 'lucide-react';
import { safeStorage } from '../../../utils/storage';
import { buildApiUrl } from '../../../utils/urlHelper';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface CapabilitySet {
  alertSound: boolean;
  spokenAlerts: boolean;
  pushAlerts: boolean;
  vibration: boolean;
}

interface DeviceItem {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: string;
  roleLabel: string;
  deviceLabel: string;
  deviceType: string;
  assignedArea: string;
  dutyStatus: 'on_duty' | 'off_duty' | 'shift_ended' | 'upcoming';
  dutyStatusLabel: string;
  notificationReadiness: 'ready' | 'limited' | 'action_needed';
  notificationReadinessLabel: string;
  notificationReadinessDescription: string;
  capabilities: CapabilitySet;
  connectionStatus: 'online' | 'recently_active' | 'offline';
  connectionStatusLabel: string;
  lastActiveAt: string;
  allowedActions: string[];
}

function getInitials(name: string): string {
  if (!name) return 'KA';
  const clean = name.replace(/[^a-zA-Z\s]/g, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'KA';
}

function formatLastActive(timestampStr: string | null | undefined): string {
  if (!timestampStr) return 'No recent activity';
  const date = new Date(timestampStr);
  if (isNaN(date.getTime())) return 'No recent activity';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';

  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;

  const isToday = now.toDateString() === date.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = yesterday.toDateString() === date.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
}

export function DevicesReadinessTab() {
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshingDevices, setRefreshingDevices] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [deviceItems, setDeviceItems] = useState<DeviceItem[]>([]);
  const [devicePagination, setDevicePagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false
  });

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterDuty, setFilterDuty] = useState<string>('');
  const [filterReadiness, setFilterReadiness] = useState<string>('');
  const [filterConnection, setFilterConnection] = useState<string>('');

  // Row actions & Modals
  const [sendingAlertDeviceId, setSendingAlertDeviceId] = useState<string | null>(null);
  const [selectedDeviceForRemoval, setSelectedDeviceForRemoval] = useState<DeviceItem | null>(null);
  const [selectedDeviceForReadiness, setSelectedDeviceForReadiness] = useState<DeviceItem | null>(null);
  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);

  const fetchDevices = async (page = 1, isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshingDevices(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(devicePagination.limit),
        role: filterRole,
        dutyStatus: filterDuty,
        readiness: filterReadiness,
        connection: filterConnection,
        search: searchQuery
      });

      const endpoint = buildApiUrl(`/api/admin/duty/devices?${queryParams.toString()}`);
      const res = await fetch(endpoint, { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDeviceItems(data.items || []);
          setDevicePagination(data.pagination || {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false
          });
          if (isManualRefresh) {
            setSuccess('Device list updated.');
            setTimeout(() => setSuccess(null), 3000);
          }
        } else {
          setError(data.error || 'Failed to fetch registered devices.');
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          setError('Permission Denied: Admin access required.');
        } else {
          setError('We could not load registered devices.');
        }
      }
    } catch (err: any) {
      console.error('Error fetching devices:', err);
      setError('An unexpected error occurred while loading devices.');
    } finally {
      setLoading(false);
      setRefreshingDevices(false);
    }
  };

  const handleSendTestAlert = async (item: DeviceItem) => {
    const deviceId = item.id;
    const deviceLabel = item.deviceLabel || 'Device';
    setSendingAlertDeviceId(deviceId);
    setError(null);

    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const endpoint = buildApiUrl(`/api/admin/duty/devices/${deviceId}/remind`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        credentials: 'include'
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setSuccess(`Test alert sent to ${deviceLabel}.`);
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError(data.error || `The device could not receive the test alert.`);
      }
    } catch (err) {
      console.error('Failed to send test alert:', err);
      setError(`The device could not receive the test alert.`);
    } finally {
      setSendingAlertDeviceId(null);
    }
  };

  const handleConfirmRemoveDevice = async () => {
    if (!selectedDeviceForRemoval) return;
    const deviceId = selectedDeviceForRemoval.id;
    const deviceLabel = selectedDeviceForRemoval.deviceLabel || 'Device';

    setRemovingDeviceId(deviceId);
    setError(null);

    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const endpoint = buildApiUrl(`/api/admin/duty/devices/${deviceId}`);
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setSelectedDeviceForRemoval(null);
        setSuccess(`Device removed.`);
        setTimeout(() => setSuccess(null), 4000);
        fetchDevices(devicePagination.page);
      } else {
        setError(data.error || `Could not remove ${deviceLabel}.`);
      }
    } catch (err) {
      console.error('Failed to remove device:', err);
      setError(`Could not remove ${deviceLabel}.`);
    } finally {
      setRemovingDeviceId(null);
    }
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterRole('');
    setFilterDuty('');
    setFilterReadiness('');
    setFilterConnection('');
  };

  useEffect(() => {
    fetchDevices(1);
  }, [filterRole, filterDuty, filterReadiness, filterConnection, searchQuery]);

  return (
    <div className="space-y-5 animate-fade-in" data-view-version="admin-duty-devices-v4-refined">
      {/* Toast Notifications */}
      {success && (
        <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 text-emerald-950 rounded-xl flex items-center justify-between space-x-2 text-xs font-medium animate-fade-in shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && deviceItems.length > 0 && (
        <div className="p-3.5 bg-rose-50/90 border border-rose-200 text-rose-950 rounded-xl flex items-center justify-between space-x-2 text-xs font-medium animate-fade-in shadow-xs">
          <div className="flex items-center space-x-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 cursor-pointer p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAE8E1] pb-4">
        <div>
          <h2 className="text-xl font-serif font-medium text-[#18181B] tracking-tight">
            Devices & readiness
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Review registered Event Duty devices, notification readiness and recent activity.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-xs text-zinc-500 font-medium px-2.5 py-1 bg-zinc-100/80 border border-zinc-200/80 rounded-lg shrink-0">
            {error && deviceItems.length === 0 ? 'Devices unavailable' : `${devicePagination.total} ${devicePagination.total === 1 ? 'device' : 'devices'}`}
          </span>
          <button
            onClick={() => fetchDevices(devicePagination.page, true)}
            disabled={loading || refreshingDevices}
            aria-label="Refresh devices"
            id="btn-refresh-devices"
            className="flex items-center space-x-2 px-3 py-1.5 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-xs font-medium text-[#18181B] rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${refreshingDevices ? 'animate-spin' : ''}`} />
            <span>{refreshingDevices ? 'Refreshing…' : 'Refresh devices'}</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Filter Bar */}
      <div className="p-3 bg-white border border-[#EAE8E1] rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search people or devices"
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-900 placeholder:text-zinc-400"
          />
        </div>

        {/* Filters inline */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:flex lg:items-center">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-700 font-medium cursor-pointer"
          >
            <option value="">All roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Administrator</option>
            <option value="safeguarding_lead">Safeguarding Lead</option>
            <option value="attendance_lead">Attendance Lead</option>
            <option value="pickup_lead">Pickup Lead</option>
            <option value="volunteer_lead">Volunteer Lead</option>
            <option value="volunteer">Volunteer</option>
          </select>

          <select
            value={filterDuty}
            onChange={(e) => setFilterDuty(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-700 font-medium cursor-pointer"
          >
            <option value="">All statuses</option>
            <option value="on_duty">On duty</option>
            <option value="off_duty">Off duty</option>
            <option value="shift_ended">Shift ended</option>
          </select>

          <select
            value={filterReadiness}
            onChange={(e) => setFilterReadiness(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-700 font-medium cursor-pointer"
          >
            <option value="">All readiness states</option>
            <option value="ready">Ready</option>
            <option value="limited">Limited</option>
            <option value="action_needed">Needs attention</option>
          </select>

          <select
            value={filterConnection}
            onChange={(e) => setFilterConnection(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-700 font-medium cursor-pointer"
          >
            <option value="">All connections</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      {/* 3. List/Table Content */}
      {loading && deviceItems.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#C59B27]" />
          <span>Loading registered devices…</span>
        </div>
      ) : error && deviceItems.length === 0 ? (
        <div className="p-10 text-center text-xs bg-white border border-[#EAE8E1] rounded-2xl space-y-3">
          <XCircle className="w-6 h-6 mx-auto text-rose-600" />
          <div className="text-zinc-800 font-medium">We could not load registered devices.</div>
          <button
            onClick={() => fetchDevices(1)}
            className="px-3 py-1.5 bg-zinc-900 text-white rounded-lg font-medium text-xs hover:bg-zinc-800 cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : deviceItems.length === 0 ? (
        <div className="p-10 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl space-y-2">
          <Smartphone className="w-6 h-6 mx-auto text-[#C59B27] opacity-60" />
          <p className="font-medium text-zinc-800">No registered devices found.</p>
          <p className="text-zinc-500 text-[11px]">Try changing the filters or search criteria.</p>
          {(searchQuery || filterRole || filterDuty || filterReadiness || filterConnection) && (
            <button
              onClick={clearAllFilters}
              className="mt-2 text-[#C59B27] hover:underline font-medium cursor-pointer text-xs"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#EAE8E1] rounded-xl overflow-hidden shadow-xs">
          {/* Desktop & Tablet Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF9F6] border-b border-[#EAE8E1] text-zinc-500 font-medium text-[11px]">
                  <th className="p-3.5 pl-4 font-medium w-[220px]">Person</th>
                  <th className="p-3.5 font-medium min-w-[200px]">Device</th>
                  <th className="p-3.5 font-medium w-[120px]">Duty</th>
                  <th className="p-3.5 font-medium w-[220px]">Notification readiness</th>
                  <th className="p-3.5 font-medium w-[130px]">Connection</th>
                  <th className="p-3.5 font-medium w-[140px]">Last active</th>
                  <th className="p-3.5 pr-4 font-medium text-right w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {deviceItems.map((item) => {
                  const isSendingAlert = sendingAlertDeviceId === item.id;
                  const isRemoving = removingDeviceId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors">
                      {/* Person Cell */}
                      <td className="p-3.5 pl-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 flex items-center justify-center font-medium text-xs shrink-0">
                            {getInitials(item.displayName)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-zinc-900 text-xs truncate">
                              {item.displayName}
                            </div>
                            <div className="text-[11px] text-zinc-500 font-normal truncate">
                              {item.roleLabel}
                            </div>
                            {item.email && (
                              <div className="text-[10px] text-zinc-400 font-normal truncate">
                                {item.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Device Cell */}
                      <td className="p-3.5">
                        <div className="flex items-start space-x-2">
                          <Smartphone className="w-4 h-4 text-[#C59B27] shrink-0 mt-0.5" />
                          <div>
                            <div className="font-medium text-zinc-900 text-xs">
                              {item.deviceLabel}
                            </div>
                            <div className="text-[11px] text-zinc-500 font-normal">
                              {item.assignedArea}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Duty Status */}
                      <td className="p-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                          item.dutyStatus === 'on_duty' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : item.dutyStatus === 'shift_ended'
                            ? 'bg-zinc-100 text-zinc-500 border border-zinc-200'
                            : item.dutyStatus === 'upcoming'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                        }`}>
                          {item.dutyStatusLabel}
                        </span>
                      </td>

                      {/* Notification Readiness */}
                      <td className="p-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ${
                              item.notificationReadiness === 'ready'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.notificationReadiness === 'limited'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {item.notificationReadinessLabel}
                            </span>
                            <button
                              onClick={() => setSelectedDeviceForReadiness(item)}
                              className="text-[11px] text-[#C59B27] hover:underline font-normal cursor-pointer"
                            >
                              View readiness
                            </button>
                          </div>
                          <p className="text-[11px] text-zinc-500 font-normal leading-tight">
                            {item.notificationReadinessDescription}
                          </p>
                        </div>
                      </td>

                      {/* Connection */}
                      <td className="p-3.5">
                        <div className="flex items-center space-x-1.5 text-xs text-zinc-700">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            item.connectionStatus === 'online'
                              ? 'bg-emerald-500'
                              : item.connectionStatus === 'recently_active'
                              ? 'bg-amber-500'
                              : 'bg-zinc-300'
                          }`} />
                          <span className="font-normal text-[11px]">
                            {item.connectionStatusLabel}
                          </span>
                        </div>
                      </td>

                      {/* Last Active */}
                      <td className="p-3.5 text-[11px] text-zinc-500 font-normal">
                        {formatLastActive(item.lastActiveAt)}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 pr-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleSendTestAlert(item)}
                            disabled={isSendingAlert || isRemoving}
                            title="Send test alert"
                            aria-label={`Send test alert to ${item.deviceLabel}`}
                            className="p-1.5 text-zinc-600 hover:text-[#C59B27] hover:bg-[#C59B27]/10 rounded-lg transition-all cursor-pointer disabled:opacity-40"
                          >
                            {isSendingAlert ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-[#C59B27]" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            onClick={() => setSelectedDeviceForReadiness(item)}
                            title="View readiness"
                            aria-label={`View readiness for ${item.deviceLabel}`}
                            className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all cursor-pointer"
                          >
                            <Sliders className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setSelectedDeviceForRemoval(item)}
                            disabled={isSendingAlert || isRemoving}
                            title="Remove device"
                            aria-label={`Remove device ${item.deviceLabel}`}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer disabled:opacity-40"
                          >
                            {isRemoving ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-rose-600" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Device Cards View */}
          <div className="block md:hidden divide-y divide-zinc-100">
            {deviceItems.map((item) => {
              const isSendingAlert = sendingAlertDeviceId === item.id;
              const isRemoving = removingDeviceId === item.id;

              return (
                <div key={item.id} className="p-4 space-y-3">
                  {/* Row 1: Person & Duty */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 flex items-center justify-center font-medium text-xs shrink-0">
                        {getInitials(item.displayName)}
                      </div>
                      <div>
                        <div className="font-medium text-zinc-900 text-xs">{item.displayName}</div>
                        <div className="text-[11px] text-zinc-500">{item.roleLabel}</div>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium shrink-0 ${
                      item.dutyStatus === 'on_duty' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                    }`}>
                      {item.dutyStatusLabel}
                    </span>
                  </div>

                  {/* Row 2: Device & Location */}
                  <div className="p-2.5 bg-[#FAF9F6] border border-[#EAE8E1] rounded-lg text-xs space-y-1">
                    <div className="flex items-center space-x-2">
                      <Smartphone className="w-3.5 h-3.5 text-[#C59B27]" />
                      <span className="font-medium text-zinc-900">{item.deviceLabel}</span>
                    </div>
                    <div className="text-[11px] text-zinc-500 pl-5.5">
                      {item.assignedArea}
                    </div>
                  </div>

                  {/* Row 3: Readiness & Connection */}
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ${
                        item.notificationReadiness === 'ready'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {item.notificationReadinessLabel}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {formatLastActive(item.lastActiveAt)}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 text-[11px] text-zinc-600">
                      <span className={`w-2 h-2 rounded-full ${item.connectionStatus === 'online' ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                      <span>{item.connectionStatusLabel}</span>
                    </div>
                  </div>

                  {/* Row 4: Actions */}
                  <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-100">
                    <button
                      onClick={() => handleSendTestAlert(item)}
                      disabled={isSendingAlert || isRemoving}
                      className="px-3 py-1.5 bg-[#C59B27]/10 hover:bg-[#C59B27]/20 text-[#C59B27] font-medium text-xs rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isSendingAlert ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Test alert</span>
                    </button>

                    <button
                      onClick={() => setSelectedDeviceForReadiness(item)}
                      className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-medium text-xs rounded-lg transition-all cursor-pointer"
                    >
                      View readiness
                    </button>

                    <button
                      onClick={() => setSelectedDeviceForRemoval(item)}
                      disabled={isSendingAlert || isRemoving}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                      title="Remove device"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Footer */}
          <div className="p-3.5 border-t border-[#EAE8E1] bg-[#FAF9F6] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs" data-component-version="admin-duty-device-pagination-v4">
            <div className="text-zinc-500 text-xs">
              Showing {deviceItems.length} of {devicePagination.total} devices
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => fetchDevices(devicePagination.page - 1)}
                disabled={!devicePagination.hasPreviousPage || loading || refreshingDevices}
                className="px-2.5 py-1 bg-white border border-[#EAE8E1] rounded-lg hover:bg-zinc-50 disabled:opacity-40 cursor-pointer font-medium text-xs"
              >
                Previous
              </button>
              <span className="text-zinc-600 font-medium text-xs px-1">
                Page {devicePagination.page} of {devicePagination.totalPages || 1}
              </span>
              <button
                onClick={() => fetchDevices(devicePagination.page + 1)}
                disabled={!devicePagination.hasNextPage || loading || refreshingDevices}
                className="px-2.5 py-1 bg-white border border-[#EAE8E1] rounded-lg hover:bg-zinc-50 disabled:opacity-40 cursor-pointer font-medium text-xs"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Device Readiness Details Modal */}
      {selectedDeviceForReadiness && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-[#EAE8E1] shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start justify-between border-b border-[#EAE8E1] pb-3">
              <div>
                <h3 className="text-base font-serif font-medium text-[#18181B]">Device readiness</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {selectedDeviceForReadiness.deviceLabel} • {selectedDeviceForReadiness.displayName} ({selectedDeviceForReadiness.roleLabel})
                </p>
              </div>
              <button
                onClick={() => setSelectedDeviceForReadiness(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-zinc-700 font-medium">
                  <Volume2 className="w-4 h-4 text-[#C59B27]" />
                  <span>Alert sound</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedDeviceForReadiness.capabilities.alertSound ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  {selectedDeviceForReadiness.capabilities.alertSound ? 'Ready' : 'Disabled'}
                </span>
              </div>

              <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-zinc-700 font-medium">
                  <Info className="w-4 h-4 text-[#C59B27]" />
                  <span>Spoken alerts</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedDeviceForReadiness.capabilities.spokenAlerts ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                  {selectedDeviceForReadiness.capabilities.spokenAlerts ? 'Supported' : 'Unavailable'}
                </span>
              </div>

              <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-zinc-700 font-medium">
                  <Bell className="w-4 h-4 text-[#C59B27]" />
                  <span>Push alerts</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedDeviceForReadiness.capabilities.pushAlerts ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  {selectedDeviceForReadiness.capabilities.pushAlerts ? 'Ready' : 'Needs attention'}
                </span>
              </div>

              <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-zinc-700 font-medium">
                  <Vibrate className="w-4 h-4 text-[#C59B27]" />
                  <span>Vibration</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${selectedDeviceForReadiness.capabilities.vibration ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-600 border border-zinc-200'}`}>
                  {selectedDeviceForReadiness.capabilities.vibration ? 'Supported' : 'Unsupported'}
                </span>
              </div>

              <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-zinc-700 font-medium">
                  <Wifi className="w-4 h-4 text-[#C59B27]" />
                  <span>Connection & last active</span>
                </div>
                <span className="text-zinc-600 font-normal">
                  {selectedDeviceForReadiness.connectionStatusLabel} • {formatLastActive(selectedDeviceForReadiness.lastActiveAt)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#EAE8E1]">
              <button
                type="button"
                onClick={() => setSelectedDeviceForReadiness(null)}
                className="px-3.5 py-2 bg-white hover:bg-zinc-100 border border-[#EAE8E1] text-zinc-700 font-medium text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const dev = selectedDeviceForReadiness;
                  setSelectedDeviceForReadiness(null);
                  handleSendTestAlert(dev);
                }}
                className="px-3.5 py-2 bg-[#C59B27] hover:bg-[#B38A22] text-white font-medium text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send test alert</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Branded Device Removal Confirmation Modal */}
      {selectedDeviceForRemoval && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-[#EAE8E1] shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-9 h-9 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="space-y-0.5 pr-4">
                <h3 className="text-base font-serif font-medium text-[#18181B]">Remove registered device?</h3>
                <p className="text-xs text-zinc-500">
                  Please confirm that you want to remove this device registration.
                </p>
              </div>
              <button
                onClick={() => setSelectedDeviceForRemoval(null)}
                disabled={removingDeviceId !== null}
                className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-[#FAF9F6] border border-[#EAE8E1] rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Device</span>
                <span className="font-medium text-zinc-900">{selectedDeviceForRemoval.deviceLabel}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-[#EAE8E1]">
                <span className="text-zinc-500 font-medium">Assigned to</span>
                <span className="font-medium text-zinc-800">
                  {selectedDeviceForRemoval.displayName} ({selectedDeviceForRemoval.roleLabel})
                </span>
              </div>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              This device will stop receiving Event Duty notifications until it is registered again.
            </p>

            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-[#EAE8E1]">
              <button
                type="button"
                onClick={() => setSelectedDeviceForRemoval(null)}
                disabled={removingDeviceId !== null}
                className="px-3.5 py-2 bg-white hover:bg-zinc-100 border border-[#EAE8E1] text-zinc-700 font-medium text-xs rounded-xl cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveDevice}
                disabled={removingDeviceId !== null}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {removingDeviceId !== null ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing device…</span>
                  </>
                ) : (
                  <span>Remove device</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DevicesReadinessTab;

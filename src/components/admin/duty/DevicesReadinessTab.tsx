import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Trash2,
  Send,
  Sliders,
  X,
  Search,
  Volume2,
  VolumeX,
  Bell,
  Vibrate,
  Wifi,
  AlertTriangle
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

interface DevicesReadinessTabProps {
  eventId?: string;
}

function getInitials(name: string): string {
  if (!name) return 'TM';
  const clean = name.replace(/[^a-zA-Z\s]/g, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'TM';
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
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;

  const isToday = now.toDateString() === date.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = yesterday.toDateString() === date.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
}

export function DevicesReadinessTab({ eventId }: DevicesReadinessTabProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshingDevices, setRefreshingDevices] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [deviceItems, setDeviceItems] = useState<DeviceItem[]>([]);
  const [devicePagination, setDevicePagination] = useState<Pagination>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false
  });

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterDuty, setFilterDuty] = useState<string>('');
  const [filterAlerts, setFilterAlerts] = useState<string>('');
  const [filterConnection, setFilterConnection] = useState<string>('');

  // Actions & Modals
  const [sendingAlertDeviceId, setSendingAlertDeviceId] = useState<string | null>(null);
  const [selectedDeviceForRemoval, setSelectedDeviceForRemoval] = useState<DeviceItem | null>(null);
  const [selectedDeviceForDetails, setSelectedDeviceForDetails] = useState<DeviceItem | null>(null);
  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);

  const hasActiveFilters = Boolean(searchQuery || filterRole || filterDuty || filterAlerts || filterConnection);

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
        readiness: filterAlerts,
        connection: filterConnection,
        search: searchQuery
      });

      if (eventId) {
        queryParams.set('eventId', eventId);
      }

      const endpoint = buildApiUrl(`/api/admin/duty/devices?${queryParams.toString()}`);
      const res = await fetch(endpoint, { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDeviceItems(data.items || []);
          setDevicePagination(data.pagination || {
            page: 1,
            limit: 15,
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
          setError(data.error || 'We couldn’t load the devices. Try again');
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          setError('Permission Denied: Administrator access required.');
        } else {
          setError('We couldn’t load the devices. Try again');
        }
      }
    } catch (err: any) {
      console.error('Error fetching devices:', err);
      setError('We couldn’t load the devices. Try again');
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
        setSuccess('Device removed.');
        setTimeout(() => setSuccess(null), 3000);
        fetchDevices(devicePagination.page);
      } else {
        setError(data.error || 'We couldn’t remove this device. Try again');
      }
    } catch (err) {
      console.error('Failed to remove device:', err);
      setError('We couldn’t remove this device. Try again');
    } finally {
      setRemovingDeviceId(null);
    }
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterRole('');
    setFilterDuty('');
    setFilterAlerts('');
    setFilterConnection('');
  };

  useEffect(() => {
    fetchDevices(1);
  }, [eventId, filterRole, filterDuty, filterAlerts, filterConnection, searchQuery]);

  return (
    <div className="space-y-5 animate-fade-in" data-view-version="admin-duty-devices-v5">
      {/* Toast Notifications */}
      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-xl flex items-center justify-between space-x-2 text-xs font-medium animate-fade-in shadow-2xs">
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
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-950 rounded-xl flex items-center justify-between space-x-2 text-xs font-medium animate-fade-in shadow-2xs">
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
          <h2 className="text-xl font-bold text-[#18181B] tracking-tight">
            Devices
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5 font-normal">
            View the devices being used by the event team and whether they can receive alerts.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-xs text-zinc-500 font-medium">
            {devicePagination.total} {devicePagination.total === 1 ? 'device' : 'devices'}
          </span>
          <button
            onClick={() => fetchDevices(devicePagination.page, true)}
            disabled={loading || refreshingDevices}
            aria-label="Refresh devices"
            id="btn-refresh-devices"
            className="flex items-center space-x-2 px-3 py-1.5 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-xs font-medium text-[#18181B] rounded-lg transition-all shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${refreshingDevices ? 'animate-spin' : ''}`} />
            <span>{refreshingDevices ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Search & Human Filter Bar */}
      <div className="p-3 bg-white border border-[#EAE8E1] rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search people or devices"
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-900 placeholder:text-zinc-400 font-normal"
          >
          </input>
        </div>

        {/* Human Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:flex lg:items-center">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            aria-label="Filter by role"
            className="text-xs px-2.5 py-1.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-700 font-medium cursor-pointer"
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
            aria-label="Filter by duty status"
            className="text-xs px-2.5 py-1.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-700 font-medium cursor-pointer"
          >
            <option value="">All statuses</option>
            <option value="on_duty">Active</option>
            <option value="off_duty">Inactive</option>
            <option value="shift_ended">Shift ended</option>
          </select>

          <select
            value={filterAlerts}
            onChange={(e) => setFilterAlerts(e.target.value)}
            aria-label="Filter by alert readiness"
            className="text-xs px-2.5 py-1.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-700 font-medium cursor-pointer"
          >
            <option value="">All alert states</option>
            <option value="ready">Ready for alerts</option>
            <option value="action_needed">Needs attention</option>
          </select>

          <select
            value={filterConnection}
            onChange={(e) => setFilterConnection(e.target.value)}
            aria-label="Filter by connection status"
            className="text-xs px-2.5 py-1.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C59B27] text-zinc-700 font-medium cursor-pointer"
          >
            <option value="">All connection states</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      {/* 3. List / Table Content */}
      {loading && deviceItems.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#C59B27]" />
          <span>Loading devices…</span>
        </div>
      ) : error && deviceItems.length === 0 ? (
        <div className="p-10 text-center text-xs bg-white border border-[#EAE8E1] rounded-2xl space-y-3">
          <XCircle className="w-6 h-6 mx-auto text-rose-600" />
          <div className="text-zinc-800 font-medium">We couldn’t load the devices.</div>
          <button
            onClick={() => fetchDevices(1)}
            className="px-3.5 py-1.5 bg-[#18181B] text-white rounded-xl font-medium text-xs hover:bg-zinc-800 cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : deviceItems.length === 0 ? (
        hasActiveFilters ? (
          /* State B: Filtered zero-result state */
          <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl space-y-2">
            <Smartphone className="w-6 h-6 mx-auto text-zinc-400" />
            <h3 className="font-semibold text-zinc-800 text-sm">No matching devices</h3>
            <p className="text-zinc-500 text-xs">Try changing your filters or search.</p>
            <div className="pt-2">
              <button
                onClick={clearAllFilters}
                className="px-3.5 py-1.5 bg-white border border-[#EAE8E1] rounded-xl text-zinc-700 text-xs font-medium hover:bg-zinc-50 cursor-pointer"
              >
                Clear filters
              </button>
            </div>
          </div>
        ) : (
          /* State A: True zero-data state */
          <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-2xl space-y-2">
            <Smartphone className="w-6 h-6 mx-auto text-zinc-400" />
            <h3 className="font-semibold text-zinc-800 text-sm">No devices connected yet</h3>
            <p className="text-zinc-500 text-xs max-w-sm mx-auto">
              Devices used by event team members will appear here once they sign in.
            </p>
          </div>
        )
      ) : (
        <div className="bg-white border border-[#EAE8E1] rounded-xl overflow-hidden shadow-2xs">
          {/* Desktop & Tablet Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF9F5] border-b border-[#EAE8E1] text-zinc-500 font-medium text-[11px]">
                  <th className="p-3.5 pl-4 font-medium w-[220px]">Team member</th>
                  <th className="p-3.5 font-medium w-[140px]">Role</th>
                  <th className="p-3.5 font-medium min-w-[180px]">Device</th>
                  <th className="p-3.5 font-medium w-[160px]">Alert status</th>
                  <th className="p-3.5 font-medium w-[130px]">Last active</th>
                  <th className="p-3.5 pr-4 font-medium text-right w-[110px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {deviceItems.map((item) => {
                  const isSendingAlert = sendingAlertDeviceId === item.id;
                  const isRemoving = removingDeviceId === item.id;

                  const isAlertReady = item.notificationReadiness === 'ready';
                  const alertStatusText = isAlertReady ? 'Ready for alerts' : 'Needs attention';

                  return (
                    <tr key={item.id} className="hover:bg-zinc-50/60 transition-colors">
                      {/* Team Member */}
                      <td className="p-3.5 pl-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 flex items-center justify-center font-medium text-xs shrink-0">
                            {getInitials(item.displayName)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-zinc-900 text-xs truncate">
                              {item.displayName}
                            </div>
                            {item.email && (
                              <div className="text-[11px] text-zinc-400 font-normal truncate">
                                {item.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="p-3.5 text-zinc-700 font-medium">
                        {item.roleLabel}
                      </td>

                      {/* Device */}
                      <td className="p-3.5">
                        <div className="flex items-center space-x-2">
                          <Smartphone className="w-4 h-4 text-zinc-400 shrink-0" />
                          <div>
                            <div className="font-medium text-zinc-900 text-xs">
                              {item.deviceLabel}
                            </div>
                            {item.assignedArea && (
                              <div className="text-[11px] text-zinc-400">
                                {item.assignedArea}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Alert Status */}
                      <td className="p-3.5">
                        <div className="flex items-center space-x-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isAlertReady ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                          />
                          <span
                            className={`text-xs font-medium ${
                              isAlertReady ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {alertStatusText}
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
                            className="p-1.5 text-zinc-500 hover:text-[#C59B27] hover:bg-[#C59B27]/10 rounded-lg transition-all cursor-pointer disabled:opacity-40"
                          >
                            {isSendingAlert ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-[#C59B27]" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            onClick={() => setSelectedDeviceForDetails(item)}
                            title="View details"
                            aria-label={`View details for ${item.deviceLabel}`}
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all cursor-pointer"
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

          {/* Mobile Cards View */}
          <div className="block md:hidden divide-y divide-zinc-100">
            {deviceItems.map((item) => {
              const isSendingAlert = sendingAlertDeviceId === item.id;
              const isRemoving = removingDeviceId === item.id;
              const isAlertReady = item.notificationReadiness === 'ready';

              return (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#C59B27]/10 text-[#C59B27] border border-[#C59B27]/20 flex items-center justify-center font-medium text-xs shrink-0">
                        {getInitials(item.displayName)}
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-900 text-xs">{item.displayName}</div>
                        <div className="text-[11px] text-zinc-500">{item.roleLabel}</div>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md">
                      {item.dutyStatusLabel}
                    </span>
                  </div>

                  <div className="p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-lg text-xs space-y-1">
                    <div className="flex items-center space-x-2">
                      <Smartphone className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="font-medium text-zinc-900">{item.deviceLabel}</span>
                    </div>
                    {item.assignedArea && (
                      <div className="text-[11px] text-zinc-500 pl-5.5">
                        {item.assignedArea}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <div className="flex items-center space-x-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isAlertReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className={`text-xs font-medium ${isAlertReady ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {isAlertReady ? 'Ready for alerts' : 'Needs attention'}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400">
                      {formatLastActive(item.lastActiveAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-100">
                    <button
                      onClick={() => handleSendTestAlert(item)}
                      disabled={isSendingAlert || isRemoving}
                      className="px-3 py-1.5 bg-[#C59B27]/10 hover:bg-[#C59B27]/20 text-[#C59B27] font-medium text-xs rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isSendingAlert ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Test alert</span>
                    </button>

                    <button
                      onClick={() => setSelectedDeviceForDetails(item)}
                      className="px-3 py-1.5 bg-white border border-[#EAE8E1] text-zinc-700 font-medium text-xs rounded-xl hover:bg-zinc-50 cursor-pointer"
                    >
                      Details
                    </button>

                    <button
                      onClick={() => setSelectedDeviceForRemoval(item)}
                      disabled={isSendingAlert || isRemoving}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer disabled:opacity-50"
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
          <div className="p-3.5 border-t border-[#EAE8E1] bg-[#FAF9F5] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
            <div className="text-zinc-500 text-xs">
              Showing {deviceItems.length} of {devicePagination.total} devices
            </div>
            {devicePagination.totalPages > 1 && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => fetchDevices(devicePagination.page - 1)}
                  disabled={!devicePagination.hasPreviousPage || loading || refreshingDevices}
                  className="px-2.5 py-1 bg-white border border-[#EAE8E1] rounded-lg hover:bg-zinc-50 disabled:opacity-40 cursor-pointer font-medium text-xs"
                >
                  Previous
                </button>
                <span className="text-zinc-600 font-medium text-xs px-1">
                  Page {devicePagination.page} of {devicePagination.totalPages}
                </span>
                <button
                  onClick={() => fetchDevices(devicePagination.page + 1)}
                  disabled={!devicePagination.hasNextPage || loading || refreshingDevices}
                  className="px-2.5 py-1 bg-white border border-[#EAE8E1] rounded-lg hover:bg-zinc-50 disabled:opacity-40 cursor-pointer font-medium text-xs"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Device Details Modal */}
      {selectedDeviceForDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-[#EAE8E1] shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start justify-between border-b border-[#EAE8E1] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#18181B]">Device Details</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {selectedDeviceForDetails.displayName} • {selectedDeviceForDetails.roleLabel}
                </p>
              </div>
              <button
                onClick={() => setSelectedDeviceForDetails(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-zinc-700 font-medium">
                  <Smartphone className="w-4 h-4 text-[#C59B27]" />
                  <span>Device</span>
                </div>
                <span className="font-medium text-zinc-900">
                  {selectedDeviceForDetails.deviceLabel}
                </span>
              </div>

              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-zinc-700 font-medium">
                  <Bell className="w-4 h-4 text-[#C59B27]" />
                  <span>Alert status</span>
                </div>
                <span
                  className={`font-medium ${
                    selectedDeviceForDetails.notificationReadiness === 'ready'
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  {selectedDeviceForDetails.notificationReadiness === 'ready'
                    ? 'Ready for alerts'
                    : 'Needs attention'}
                </span>
              </div>

              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-zinc-700 font-medium">
                  {selectedDeviceForDetails.capabilities.alertSound ? (
                    <Volume2 className="w-4 h-4 text-[#C59B27]" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-zinc-400" />
                  )}
                  <span>Sound</span>
                </div>
                <span className="font-medium text-zinc-800">
                  {selectedDeviceForDetails.capabilities.alertSound ? 'Ready' : 'Sound is off'}
                </span>
              </div>

              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-zinc-700 font-medium">
                  <Vibrate className="w-4 h-4 text-[#C59B27]" />
                  <span>Vibration</span>
                </div>
                <span className="font-medium text-zinc-800">
                  {selectedDeviceForDetails.capabilities.vibration ? 'Supported' : 'Not supported'}
                </span>
              </div>

              <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-zinc-700 font-medium">
                  <Wifi className="w-4 h-4 text-[#C59B27]" />
                  <span>Last active</span>
                </div>
                <span className="text-zinc-600 font-medium">
                  {formatLastActive(selectedDeviceForDetails.lastActiveAt)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#EAE8E1]">
              <button
                type="button"
                onClick={() => setSelectedDeviceForDetails(null)}
                className="px-3.5 py-2 bg-white hover:bg-zinc-100 border border-[#EAE8E1] text-zinc-700 font-medium text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const dev = selectedDeviceForDetails;
                  setSelectedDeviceForDetails(null);
                  handleSendTestAlert(dev);
                }}
                className="px-3.5 py-2 bg-[#C59B27] hover:bg-[#B38A22] text-white font-medium text-xs rounded-xl shadow-2xs transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send test alert</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Device Removal Confirmation Modal */}
      {selectedDeviceForRemoval && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-[#EAE8E1] shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-9 h-9 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="space-y-0.5 pr-4">
                <h3 className="text-base font-bold text-[#18181B]">Remove this device?</h3>
                <p className="text-xs text-zinc-500">
                  This team member will no longer receive alerts on this device until they sign in again.
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

            <div className="p-3 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-medium">Device</span>
                <span className="font-medium text-zinc-900">{selectedDeviceForRemoval.deviceLabel}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-[#EAE8E1]">
                <span className="text-zinc-500 font-medium">Team member</span>
                <span className="font-medium text-zinc-800">
                  {selectedDeviceForRemoval.displayName} ({selectedDeviceForRemoval.roleLabel})
                </span>
              </div>
            </div>

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
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs rounded-xl shadow-2xs transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {removingDeviceId !== null ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing…</span>
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

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
  X
} from 'lucide-react';
import { safeStorage } from '../../../utils/storage';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function DevicesReadinessTab() {
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshingDevices, setRefreshingDevices] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [deviceItems, setDeviceItems] = useState<any[]>([]);
  const [devicePagination, setDevicePagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false
  });

  const [filterRole, setFilterRole] = useState<string>('');
  const [filterDuty, setFilterDuty] = useState<string>('');
  const [filterReadiness, setFilterReadiness] = useState<string>('');
  const [filterConnection, setFilterConnection] = useState<string>('');

  // Row-level action states
  const [sendingReminderDeviceId, setSendingReminderDeviceId] = useState<string | null>(null);
  const [selectedDeviceForRemoval, setSelectedDeviceForRemoval] = useState<any | null>(null);
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
        connection: filterConnection
      });

      const res = await fetch(`/api/admin/duty/devices?${queryParams.toString()}`, { headers });
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
            setSuccess('Devices list refreshed successfully.');
            setTimeout(() => setSuccess(null), 3000);
          }
        } else {
          setError(data.error || 'Failed to fetch registered devices.');
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          setError('Permission Denied: Admin access required.');
        } else {
          setError('Failed to contact server for registered devices.');
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

  const handleSendReminder = async (item: any) => {
    const deviceId = item.id;
    const deviceLabel = item.device_label || 'Device';
    setSendingReminderDeviceId(deviceId);
    setError(null);

    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/admin/duty/devices/${deviceId}/remind`, {
        method: 'POST',
        headers
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setSuccess(`Readiness reminder sent to ${deviceLabel}.`);
        setTimeout(() => setSuccess(null), 4000);
      } else {
        setError(data.error || `Failed to send readiness reminder to ${deviceLabel}.`);
      }
    } catch (err) {
      console.error('Failed to send reminder:', err);
      setError(`Failed to send readiness reminder to ${deviceLabel}.`);
    } finally {
      setSendingReminderDeviceId(null);
    }
  };

  const handleConfirmRemoveDevice = async () => {
    if (!selectedDeviceForRemoval) return;
    const deviceId = selectedDeviceForRemoval.id;
    const deviceLabel = selectedDeviceForRemoval.device_label || 'Device';

    setRemovingDeviceId(deviceId);
    setError(null);

    try {
      const token = safeStorage.getItem('koinonia_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/admin/duty/devices/${deviceId}`, {
        method: 'DELETE',
        headers
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setSelectedDeviceForRemoval(null);
        setSuccess(`Device removed.`);
        setTimeout(() => setSuccess(null), 4000);
        fetchDevices(devicePagination.page);
      } else {
        setError(data.error || `Failed to remove ${deviceLabel}.`);
      }
    } catch (err) {
      console.error('Failed to remove device:', err);
      setError(`Failed to remove ${deviceLabel}.`);
    } finally {
      setRemovingDeviceId(null);
    }
  };

  useEffect(() => {
    fetchDevices(1);
  }, [filterRole, filterDuty, filterReadiness, filterConnection]);

  return (
    <div className="space-y-6 animate-fade-in" data-view-version="admin-duty-device-overview-v2">
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl flex items-center justify-between space-x-2 text-xs font-semibold animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-950 rounded-2xl flex items-center justify-between space-x-2 text-xs font-semibold animate-fade-in">
          <div className="flex items-center space-x-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 cursor-pointer p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 font-sans tracking-tight">Registered Duty Devices</h2>
          <p className="text-xs text-zinc-500">Monitor active user duty status, sound readiness, push alerts, and connectivity metrics.</p>
        </div>
        <button
          onClick={() => fetchDevices(devicePagination.page, true)}
          disabled={loading || refreshingDevices}
          aria-label="Refresh registered devices list"
          id="btn-refresh-devices"
          className="flex items-center space-x-2 px-3.5 py-2 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${refreshingDevices ? 'animate-spin' : ''}`} />
          <span>{refreshingDevices ? 'Refreshing…' : 'Refresh Devices'}</span>
        </button>
      </div>

      {/* Filters Row */}
      <div className="p-4 bg-white border border-[#EAE8E1] rounded-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Role</label>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-semibold"
          >
            <option value="">All Roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="volunteer">Volunteer</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Duty State</label>
          <select
            value={filterDuty}
            onChange={(e) => setFilterDuty(e.target.value)}
            className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-semibold"
          >
            <option value="">All Statuses</option>
            <option value="on_duty">On Duty</option>
            <option value="off_duty">Off Duty</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Readiness</label>
          <select
            value={filterReadiness}
            onChange={(e) => setFilterReadiness(e.target.value)}
            className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-semibold"
          >
            <option value="">All States</option>
            <option value="ready">Ready</option>
            <option value="limited">Limited</option>
            <option value="action_needed">Action Needed</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Connection</label>
          <select
            value={filterConnection}
            onChange={(e) => setFilterConnection(e.target.value)}
            className="w-full text-xs p-2.5 bg-[#FAF9F5] border border-[#EAE8E1] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C59B27] font-semibold"
          >
            <option value="">All Connections</option>
            <option value="connected">Connected</option>
            <option value="disconnected">Disconnected</option>
          </select>
        </div>
      </div>

      {/* List/Table */}
      {loading && deviceItems.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-3xl">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#C59B27]" />
          <span>Loading registered duty devices…</span>
        </div>
      ) : error && deviceItems.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-3xl">
          <XCircle className="w-6 h-6 mx-auto mb-2 text-rose-600" />
          <span className="font-bold text-zinc-700 block mb-1">Failed to Load Devices</span>
          <span>{error}</span>
        </div>
      ) : deviceItems.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-3xl">
          <Smartphone className="w-6 h-6 mx-auto mb-2 text-[#C59B27] opacity-60" />
          <span className="font-bold text-zinc-700 block mb-1">No registered duty devices match these criteria</span>
          <span>Adjust your filters or register a new device to view devices here.</span>
        </div>
      ) : (
        <div className="bg-white border border-[#EAE8E1] rounded-3xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF9F5] border-b border-[#EAE8E1] text-zinc-500 font-mono text-[10px] uppercase tracking-wider">
                  <th className="p-4 font-bold">User / Role</th>
                  <th className="p-4 font-bold">Device Label</th>
                  <th className="p-4 font-bold">Duty Status</th>
                  <th className="p-4 font-bold">Readiness Status</th>
                  <th className="p-4 font-bold">Hardware support</th>
                  <th className="p-4 font-bold">Last Seen</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-semibold text-zinc-700">
                {deviceItems.map((item) => {
                  const isOnDuty = item.duty_started_at && !item.duty_ended_at;
                  const isSendingReminder = sendingReminderDeviceId === item.id;
                  const isRemoving = removingDeviceId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-zinc-900">{item.user_name || 'Unknown User'}</div>
                        <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wide">{item.role || 'Volunteer'}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <Smartphone className="w-4 h-4 text-[#C59B27]" />
                          <span className="font-bold text-zinc-800">{item.device_label || 'Unnamed Device'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${isOnDuty ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-500'}`}>
                          {isOnDuty ? 'ON DUTY' : 'OFF DUTY'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          item.readiness_status === 'ready' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : item.readiness_status === 'limited' 
                            ? 'bg-amber-50 text-amber-700 border-amber-200' 
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {item.readiness_status === 'ready' ? 'READY' : item.readiness_status === 'limited' ? 'LIMITED' : 'ACTION NEEDED'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2 text-[10px] text-zinc-500">
                          <span className={item.sound_enabled === 1 ? 'text-emerald-700 font-bold' : 'text-zinc-400'}>🔊 Sound</span>
                          <span>•</span>
                          <span className={item.voice_enabled === 1 ? 'text-emerald-700 font-bold' : 'text-zinc-400'}>🗣️ Speech</span>
                          <span>•</span>
                          <span className={item.vibration_enabled === 1 ? 'text-emerald-700 font-bold' : 'text-zinc-400'}>📳 Haptic</span>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-[10px] text-zinc-500">
                        {item.last_seen_at ? new Date(item.last_seen_at).toLocaleTimeString() : 'Unknown'}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleSendReminder(item)}
                            disabled={isSendingReminder || isRemoving}
                            title="Send readiness reminder"
                            aria-label={`Send readiness reminder to ${item.device_label || 'device'}`}
                            className="w-9 h-9 flex items-center justify-center text-[#C59B27] hover:bg-[#C59B27]/10 rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27] disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isSendingReminder ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-[#C59B27]" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            onClick={() => setSelectedDeviceForRemoval(item)}
                            disabled={isSendingReminder || isRemoving}
                            title="Remove device registration"
                            aria-label={`Remove device registration for ${item.device_label || 'device'}`}
                            className="w-9 h-9 flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-40 disabled:cursor-not-allowed"
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

          {/* Pagination footer */}
          <div className="p-4 border-t border-zinc-100 bg-[#FAF9F5] flex items-center justify-between text-xs" data-component-version="admin-duty-device-pagination-v2">
            <div className="text-zinc-500 font-semibold font-mono text-[10px]">
              Showing {deviceItems.length} of {devicePagination.total} registered devices
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => fetchDevices(devicePagination.page - 1)}
                disabled={!devicePagination.hasPreviousPage || loading || refreshingDevices}
                className="p-2 bg-white border border-[#EAE8E1] rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:hover:bg-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold font-mono text-zinc-700">Page {devicePagination.page} / {devicePagination.totalPages || 1}</span>
              <button
                onClick={() => fetchDevices(devicePagination.page + 1)}
                disabled={!devicePagination.hasNextPage || loading || refreshingDevices}
                className="p-2 bg-white border border-[#EAE8E1] rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:hover:bg-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branded Device Removal Confirmation Modal */}
      {selectedDeviceForRemoval && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-[#EAE8E1] shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 pr-6">
                <h3 className="text-base font-bold text-zinc-900 font-sans tracking-tight">Remove registered device?</h3>
                <p className="text-xs text-zinc-500">
                  Are you sure you want to remove this device registration?
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

            <div className="p-4 bg-[#FAF9F5] border border-[#EAE8E1] rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-[#EAE8E1] pb-2">
                <span className="text-zinc-500 font-mono text-[10px] uppercase font-bold">Device</span>
                <span className="font-bold text-zinc-900">{selectedDeviceForRemoval.device_label || 'Unnamed Device'}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-zinc-500 font-mono text-[10px] uppercase font-bold">Assigned User</span>
                <span className="font-bold text-zinc-800">
                  {selectedDeviceForRemoval.user_name || 'User'} ({selectedDeviceForRemoval.role || 'Role'})
                </span>
              </div>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              This device will no longer receive Event Duty notifications until it is registered again.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedDeviceForRemoval(null)}
                disabled={removingDeviceId !== null}
                className="px-4 py-2.5 bg-white hover:bg-zinc-100 border border-[#EAE8E1] text-zinc-700 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveDevice}
                disabled={removingDeviceId !== null}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
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

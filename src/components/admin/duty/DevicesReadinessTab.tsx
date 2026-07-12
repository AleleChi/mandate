import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Trash2,
  Send,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const REAL_EVENT_ID = 'the-general-assembly-2026';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export default function DevicesReadinessTab() {
  const [loading, setLoading] = useState<boolean>(false);
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

  const fetchDevices = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(devicePagination.limit),
        role: filterRole,
        dutyStatus: filterDuty,
        readiness: filterReadiness,
        connection: filterConnection
      });

      const res = await fetch(`/api/admin/duty/devices?${queryParams.toString()}`);
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
        } else {
          setError(data.error || 'Failed to fetch registered devices');
        }
      } else {
        setError('Failed to contact server for devices');
      }
    } catch (err: any) {
      console.error('Error fetching devices:', err);
      setError('An error occurred while loading devices');
    } finally {
      setLoading(false);
    }
  };

  const handleSendReminder = async (deviceId: string) => {
    try {
      const res = await fetch(`/api/admin/duty/devices/${deviceId}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setSuccess("Readiness reminder notification sent successfully.");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError("Failed to send reminder.");
      }
    } catch (err) {
      console.error('Failed to send reminder:', err);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to remove this device registration? The user must run a readiness check to reregister.");
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/duty/devices/${deviceId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSuccess("Device registration removed.");
        setTimeout(() => setSuccess(null), 3000);
        fetchDevices(devicePagination.page);
      } else {
        setError("Failed to remove device.");
      }
    } catch (err) {
      console.error('Failed to delete device:', err);
    }
  };

  useEffect(() => {
    fetchDevices(1);
  }, [filterRole, filterDuty, filterReadiness, filterConnection]);

  return (
    <div className="space-y-6 animate-fade-in" data-view-version="admin-duty-device-overview-v1">
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl flex items-center space-x-2 text-xs font-semibold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-950 rounded-2xl flex items-center space-x-2 text-xs font-semibold animate-fade-in">
          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE8E1] pb-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 font-sans tracking-tight">Registered Duty Devices</h2>
          <p className="text-xs text-zinc-500">Monitor active user duty status, sound readiness, push alerts, and connectivity metrics.</p>
        </div>
        <button
          onClick={() => fetchDevices(devicePagination.page)}
          disabled={loading}
          className="flex items-center space-x-2 px-3.5 py-2 bg-white hover:bg-zinc-50 border border-[#EAE8E1] text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#C59B27] ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Devices</span>
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
          <span>Loading duty devices…</span>
        </div>
      ) : deviceItems.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 bg-white border border-[#EAE8E1] rounded-3xl">
          <span>No registered duty devices match these criteria.</span>
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
                  return (
                    <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-zinc-900">{item.user_name || 'Unknown User'}</div>
                        <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wide">{item.role || 'Volunteer'}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <Smartphone className="w-4 h-4 text-[#C59B27]" />
                          <span>{item.device_label || 'Unnamed Device'}</span>
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
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleSendReminder(item.id)}
                            className="p-2 text-[#C59B27] hover:bg-[#C59B27]/10 rounded-xl transition-all cursor-pointer"
                            title="Send readiness reminder"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDevice(item.id)}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                            title="Remove device registration"
                          >
                            <Trash2 className="w-4 h-4" />
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
          <div className="p-4 border-t border-zinc-100 bg-[#FAF9F5] flex items-center justify-between text-xs" data-component-version="admin-duty-device-pagination-v1">
            <div className="text-zinc-500 font-semibold font-mono text-[10px]">
              Showing {deviceItems.length} of {devicePagination.total} registered devices
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => fetchDevices(devicePagination.page - 1)}
                disabled={!devicePagination.hasPreviousPage || loading}
                className="p-2 bg-white border border-[#EAE8E1] rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:hover:bg-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold font-mono text-zinc-700">Page {devicePagination.page} / {devicePagination.totalPages || 1}</span>
              <button
                onClick={() => fetchDevices(devicePagination.page + 1)}
                disabled={!devicePagination.hasNextPage || loading}
                className="p-2 bg-white border border-[#EAE8E1] rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:hover:bg-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

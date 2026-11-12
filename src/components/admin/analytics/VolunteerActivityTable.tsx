import React, { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { AnalyticsActivityItem, AnalyticsVolunteerRow, formatAnalyticsTime } from './types';

interface VolunteerActivityTableProps {
  volunteers: AnalyticsVolunteerRow[];
  activeVolunteerId: string;
  onSelectVolunteerFilter: (volunteerId: string) => void;
  onInspectVolunteer: (volunteer: AnalyticsVolunteerRow) => Promise<AnalyticsActivityItem[]>;
  timeZone?: string;
}

export const VolunteerActivityTable: React.FC<VolunteerActivityTableProps> = ({
  volunteers,
  activeVolunteerId,
  onSelectVolunteerFilter,
  onInspectVolunteer,
  timeZone
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVolunteer, setSelectedVolunteer] = useState<AnalyticsVolunteerRow | null>(null);
  const [drawerActions, setDrawerActions] = useState<AnalyticsActivityItem[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const filteredVolunteers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return volunteers;
    return volunteers.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.dutyRole && v.dutyRole.toLowerCase().includes(q))
    );
  }, [volunteers, searchTerm]);

  const handleOpenDrawer = async (vol: AnalyticsVolunteerRow) => {
    setSelectedVolunteer(vol);
    setDrawerLoading(true);
    try {
      const items = await onInspectVolunteer(vol);
      setDrawerActions(items);
    } catch {
      setDrawerActions([]);
    } finally {
      setDrawerLoading(false);
    }
  };

  return (
    <>
      <section className="bg-white border border-zinc-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Volunteer Activity Summary</h2>
            <p className="text-xs text-zinc-500">
              Completed check-ins and pickups per volunteer. Click any row for operation details.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeVolunteerId && (
              <button
                type="button"
                onClick={() => onSelectVolunteerFilter('')}
                className="text-xs font-medium text-[#9A7616] hover:text-zinc-900 underline underline-offset-2"
              >
                Clear volunteer filter
              </button>
            )}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter volunteer..."
                className="pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded bg-[#FAF9F5] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#C59B27]"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="sticky top-0 bg-[#FAF9F5] border-b border-zinc-200 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 z-10">
              <tr>
                <th className="py-2.5 px-4">Volunteer</th>
                <th className="py-2.5 px-3">Duty / Role</th>
                <th className="py-2.5 px-3 text-right tabular-nums">Check-ins</th>
                <th className="py-2.5 px-3 text-right tabular-nums">Pickups</th>
                <th className="py-2.5 px-3 text-right tabular-nums">Total actions</th>
                <th className="py-2.5 px-4 text-right tabular-nums">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredVolunteers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 px-4 text-center text-xs text-zinc-500">
                    No volunteer activity recorded for the selected filters yet.
                  </td>
                </tr>
              ) : (
                filteredVolunteers.map((vol) => {
                  const isActive = activeVolunteerId === vol.volunteerId;
                  return (
                    <tr
                      key={vol.volunteerId}
                      onClick={() => handleOpenDrawer(vol)}
                      className={`cursor-pointer transition-colors ${
                        isActive ? 'bg-[#FAF5E6]' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-medium text-zinc-900">
                        <div className="flex items-center gap-2">
                          <span>{vol.name}</span>
                          {isActive && (
                            <span className="text-[10px] uppercase font-semibold text-[#9A7616] border border-[#C59B27]/40 px-1.5 py-0.5 rounded-sm">
                              Filtered
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-zinc-600">{vol.dutyRole || 'Event Staff'}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{vol.checkIns}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{vol.pickups}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-zinc-900">
                        {vol.totalActions}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-xs text-zinc-500">
                        {formatAnalyticsTime(vol.lastActivityAt, timeZone)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedVolunteer && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-zinc-950/30"
          role="dialog"
          aria-modal="true"
          aria-label={`Volunteer details for ${selectedVolunteer.name}`}
          onClick={() => setSelectedVolunteer(null)}
        >
          <div
            className="w-full max-w-md bg-white h-full border-l border-zinc-200 flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-zinc-200 flex items-start justify-between gap-3 bg-[#FAF9F5]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Volunteer Operational Record
                </p>
                <h3 className="text-base font-semibold text-zinc-900 mt-0.5">{selectedVolunteer.name}</h3>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {selectedVolunteer.dutyRole || 'Assigned Staff'}
                  {selectedVolunteer.assignedAgeGroups ? ` · ${selectedVolunteer.assignedAgeGroups}` : ''}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close drawer"
                onClick={() => setSelectedVolunteer(null)}
                className="p-1 text-zinc-400 hover:text-zinc-900 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 divide-x divide-zinc-200 border-b border-zinc-200 bg-white">
              <div className="p-3 text-center">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Check-ins</div>
                <div className="text-lg font-semibold tabular-nums text-zinc-900 mt-0.5">
                  {selectedVolunteer.checkIns}
                </div>
              </div>
              <div className="p-3 text-center">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Pickups</div>
                <div className="text-lg font-semibold tabular-nums text-zinc-900 mt-0.5">
                  {selectedVolunteer.pickups}
                </div>
              </div>
              <div className="p-3 text-center">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Total</div>
                <div className="text-lg font-semibold tabular-nums text-[#9A7616] mt-0.5">
                  {selectedVolunteer.totalActions}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Last activity: {formatAnalyticsTime(selectedVolunteer.lastActivityAt, timeZone)}
              </span>
              <button
                type="button"
                onClick={() => {
                  const target =
                    activeVolunteerId === selectedVolunteer.volunteerId ? '' : selectedVolunteer.volunteerId;
                  onSelectVolunteerFilter(target);
                  setSelectedVolunteer(null);
                }}
                className="text-xs font-medium px-2.5 py-1 border border-zinc-300 rounded hover:border-[#C59B27] text-zinc-800"
              >
                {activeVolunteerId === selectedVolunteer.volunteerId
                  ? 'Clear dashboard filter'
                  : 'Filter dashboard to volunteer'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Recent Completed Operations
              </h4>
              {drawerLoading ? (
                <div className="text-xs text-zinc-500 py-6 text-center">Loading operations...</div>
              ) : drawerActions.length === 0 ? (
                <div className="text-xs text-zinc-500 py-6 text-center">
                  No check-ins or pickups recorded yet for this volunteer.
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-md">
                  {drawerActions.map((act) => (
                    <div key={act.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="font-medium text-zinc-900">{act.childName}</div>
                        <div className="text-zinc-500">
                          Ages {act.ageGroup}
                          {act.location ? ` · ${act.location}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded-sm font-medium ${
                            act.action === 'check_in'
                              ? 'bg-zinc-100 text-zinc-800'
                              : 'bg-[#FAF5E6] text-[#9A7616]'
                          }`}
                        >
                          {act.action === 'check_in' ? 'Checked In' : 'Picked Up'}
                        </span>
                        <div className="text-[11px] text-zinc-500 tabular-nums mt-0.5">
                          {formatAnalyticsTime(act.time, timeZone)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};


import React, { useMemo, useState } from 'react';
import { X, Search, ChevronRight } from 'lucide-react';
import { AnalyticsActivityItem, AnalyticsVolunteerRow, formatAnalyticsTime } from './types';

interface VolunteerActivityTableProps {
  volunteers: AnalyticsVolunteerRow[];
  activeVolunteerId: string;
  onSelectVolunteerFilter: (volunteerId: string) => void;
  onInspectVolunteer: (volunteer: AnalyticsVolunteerRow) => Promise<AnalyticsActivityItem[]>;
  onManageAssignment?: (volunteer: AnalyticsVolunteerRow) => void;
  timeZone?: string;
}

type VolunteerSortOption = 'most_active' | 'name_asc' | 'recent';

function isProfileMissing(v: AnalyticsVolunteerRow): boolean {
  if (v.profileState === 'profile_missing') return true;
  if (v.hasDutyAssignment && v.hasVolunteerProfile === false) return true;
  if (!v.hasVolunteerProfile && v.email && v.name === v.email && v.hasDutyAssignment) return true;
  return false;
}

function formatShiftRange(startsAt?: string | null, endsAt?: string | null, timeZone?: string): string {
  const startStr = formatAnalyticsTime(startsAt, timeZone);
  const endStr = formatAnalyticsTime(endsAt, timeZone);
  if (startStr === '—' && endStr === '—') return '';
  if (startStr !== '—' && endStr !== '—') return `${startStr} – ${endStr}`;
  return startStr !== '—' ? startStr : endStr;
}

export const VolunteerActivityTable: React.FC<VolunteerActivityTableProps> = ({
  volunteers,
  activeVolunteerId,
  onSelectVolunteerFilter,
  onInspectVolunteer,
  onManageAssignment,
  timeZone
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<VolunteerSortOption>('most_active');
  const [selectedVolunteer, setSelectedVolunteer] = useState<AnalyticsVolunteerRow | null>(null);
  const [drawerActions, setDrawerActions] = useState<AnalyticsActivityItem[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const visibleVolunteers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const matched = q
      ? volunteers.filter((v) => {
          const ageGroupText = v.assignedAgeGroups || (v.hasVolunteerProfile ? 'All groups' : 'Not assigned');
          return (
            v.name.toLowerCase().includes(q) ||
            (v.email && v.email.toLowerCase().includes(q)) ||
            (v.dutyRole && v.dutyRole.toLowerCase().includes(q)) ||
            ageGroupText.toLowerCase().includes(q)
          );
        })
      : [...volunteers];

    matched.sort((a, b) => {
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'recent') {
        const aMs = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
        const bMs = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
        if (bMs !== aMs) return bMs - aMs;
        if (b.totalActions !== a.totalActions) return b.totalActions - a.totalActions;
        return a.name.localeCompare(b.name);
      }
      // Default: Most active (Total actions DESC, Last activity DESC, Name ASC)
      if (b.totalActions !== a.totalActions) return b.totalActions - a.totalActions;
      const aMs = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bMs = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      if (bMs !== aMs) return bMs - aMs;
      return a.name.localeCompare(b.name);
    });

    return matched;
  }, [volunteers, searchTerm, sortBy]);

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
      <section className="space-y-3 pb-8 border-b border-zinc-200">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Volunteer activity</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Completed check-ins and pickups by event staff.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeVolunteerId && (
              <button
                type="button"
                onClick={() => onSelectVolunteerFilter('')}
                className="text-xs font-medium text-[#9A7616] hover:text-zinc-900 underline underline-offset-2 cursor-pointer"
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
                placeholder="Search volunteer"
                aria-label="Search volunteer"
                className="pl-8 pr-3 py-1.5 text-xs border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#C59B27]"
              />
            </div>

            <select
              aria-label="Sort volunteers"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as VolunteerSortOption)}
              className="text-xs border border-zinc-200 bg-white px-2.5 py-1.5 text-zinc-800 focus:outline-none focus:border-[#C59B27]"
            >
              <option value="most_active">Most active</option>
              <option value="name_asc">Name A–Z</option>
              <option value="recent">Recently active</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto bg-white border-y border-zinc-200">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="sticky top-0 bg-white border-b border-zinc-200 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 z-10">
              <tr>
                <th className="py-3 pr-4 pl-2">Volunteer</th>
                <th className="py-3 px-3">Duty</th>
                <th className="py-3 px-3">Age group</th>
                <th className="py-3 px-3 text-right tabular-nums">Check-ins</th>
                <th className="py-3 px-3 text-right tabular-nums">Pickups</th>
                <th className="py-3 px-3 text-right tabular-nums">Total</th>
                <th className="py-3 pl-3 pr-2 text-right tabular-nums">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visibleVolunteers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 px-4 text-center text-xs text-zinc-500">
                    No volunteer activity recorded yet.
                  </td>
                </tr>
              ) : (
                visibleVolunteers.map((vol) => {
                  const isActive = activeVolunteerId === vol.volunteerId;
                  const missingProfile = isProfileMissing(vol);
                  const ageGroupDisplay =
                    vol.assignedAgeGroups || (vol.hasVolunteerProfile ? 'All groups' : 'Not assigned');

                  return (
                    <tr
                      key={vol.volunteerId}
                      onClick={() => handleOpenDrawer(vol)}
                      className={`group cursor-pointer transition-colors ${
                        isActive ? 'bg-[#FAF5E6]' : 'hover:bg-zinc-50/70'
                      }`}
                    >
                      <td className="py-3 pr-4 pl-2">
                        {missingProfile ? (
                          <div>
                            <div className="text-zinc-700 font-normal">{vol.email || vol.name}</div>
                            <div className="text-xs text-zinc-500">Profile details unavailable</div>
                          </div>
                        ) : (
                          <div className="font-medium text-zinc-900">{vol.name}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-zinc-600">{vol.dutyRole || 'Event staff'}</td>
                      <td className="py-3 px-3 text-xs text-zinc-600 whitespace-nowrap">{ageGroupDisplay}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-zinc-800">{vol.checkIns.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-zinc-800">{vol.pickups.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right tabular-nums font-semibold text-zinc-900">
                        {vol.totalActions.toLocaleString()}
                      </td>
                      <td className="py-3 pl-3 pr-2 text-right tabular-nums text-xs text-zinc-500 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{formatAnalyticsTime(vol.lastActivityAt, timeZone)}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-600 transition-colors" />
                        </span>
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
          className="fixed inset-0 z-50 flex justify-end bg-zinc-950/25"
          role="dialog"
          aria-modal="true"
          aria-label={`Volunteer details for ${selectedVolunteer.name}`}
          onClick={() => setSelectedVolunteer(null)}
        >
          <div
            className="w-full max-w-md bg-white h-full border-l border-zinc-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-zinc-200 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  className={`text-lg tracking-tight break-words ${
                    isProfileMissing(selectedVolunteer)
                      ? 'font-normal text-zinc-700'
                      : 'font-semibold text-zinc-900'
                  }`}
                >
                  {isProfileMissing(selectedVolunteer)
                    ? selectedVolunteer.email || selectedVolunteer.name
                    : selectedVolunteer.name}
                </h3>
                <p className="text-xs text-zinc-600 mt-1">
                  {selectedVolunteer.dutyRole || 'Event staff'}
                </p>
                {selectedVolunteer.assignedAgeGroups && (
                  <p className="text-xs text-zinc-500 mt-0.5">{selectedVolunteer.assignedAgeGroups}</p>
                )}
              </div>
              <button
                type="button"
                aria-label="Close drawer"
                onClick={() => setSelectedVolunteer(null)}
                className="p-1 text-zinc-400 hover:text-zinc-900 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile missing note */}
            {isProfileMissing(selectedVolunteer) && (
              <div className="px-6 py-4 bg-[#FAF9F5] border-b border-zinc-200">
                <div className="text-xs font-medium text-zinc-800">Profile details unavailable</div>
                <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                  This account is assigned to the event but does not have a linked Volunteer profile.
                </p>
              </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-3 divide-x divide-zinc-200 border-b border-zinc-200">
              <div className="p-4">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Check-ins</div>
                <div className="text-2xl font-semibold tabular-nums text-zinc-900 mt-1">
                  {selectedVolunteer.checkIns}
                </div>
              </div>
              <div className="p-4">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Pickups</div>
                <div className="text-2xl font-semibold tabular-nums text-zinc-900 mt-1">
                  {selectedVolunteer.pickups}
                </div>
              </div>
              <div className="p-4">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Total</div>
                <div className="text-2xl font-semibold tabular-nums text-[#9A7616] mt-1">
                  {selectedVolunteer.totalActions}
                </div>
              </div>
            </div>

            {/* Metadata: Last activity + Assignment + Filter toggle */}
            <div className="px-6 py-4 border-b border-zinc-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Last activity</span>
                <span className="font-medium tabular-nums text-zinc-900">
                  {formatAnalyticsTime(selectedVolunteer.lastActivityAt, timeZone)}
                </span>
              </div>

              {selectedVolunteer.hasDutyAssignment && (
                <div>
                  <div className="text-zinc-500 mb-0.5">Assignment</div>
                  <div className="font-medium text-zinc-900">
                    {selectedVolunteer.assignmentLocation || selectedVolunteer.dutyRole || 'Assigned to event'}
                  </div>
                  {formatShiftRange(selectedVolunteer.assignmentStartsAt, selectedVolunteer.assignmentEndsAt, timeZone) && (
                    <div className="text-zinc-500 tabular-nums mt-0.5">
                      {formatShiftRange(selectedVolunteer.assignmentStartsAt, selectedVolunteer.assignmentEndsAt, timeZone)}
                    </div>
                  )}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => {
                    const target =
                      activeVolunteerId === selectedVolunteer.volunteerId ? '' : selectedVolunteer.volunteerId;
                    onSelectVolunteerFilter(target);
                    setSelectedVolunteer(null);
                  }}
                  className="text-xs font-medium text-[#9A7616] hover:text-zinc-900 underline underline-offset-2 cursor-pointer"
                >
                  {activeVolunteerId === selectedVolunteer.volunteerId
                    ? 'Clear volunteer filter'
                    : 'Filter dashboard to this staff member'}
                </button>
              </div>
            </div>

            {/* Recent operations */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Recent operations
              </h4>
              {drawerLoading ? (
                <div className="text-xs text-zinc-500 py-4">Loading operations…</div>
              ) : drawerActions.length === 0 ? (
                <div className="text-xs text-zinc-500 py-4">
                  No completed check-ins or pickups recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 border-t border-zinc-200">
                  {drawerActions.map((act) => (
                    <div key={act.id} className="py-2.5 flex items-baseline justify-between gap-3 text-xs">
                      <div className="text-zinc-800">
                        <span className="tabular-nums text-zinc-500 mr-2.5">
                          {formatAnalyticsTime(act.time, timeZone)}
                        </span>
                        <span className={act.action === 'pickup' ? 'text-[#9A7616] font-medium' : 'text-zinc-700'}>
                          {act.action === 'check_in' ? 'Checked in' : 'Picked up'}
                        </span>{' '}
                        <span className="font-medium text-zinc-900">{act.childName}</span>
                      </div>
                      <span className="text-[11px] text-zinc-400 shrink-0">Ages {act.ageGroup}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer: Manage assignment ONLY when an assignment exists */}
            {selectedVolunteer.assignmentId && onManageAssignment && (
              <div className="px-6 py-4 border-t border-zinc-200 bg-[#FAF9F5] flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const targetVol = selectedVolunteer;
                    setSelectedVolunteer(null);
                    onManageAssignment(targetVol);
                  }}
                  className="text-xs font-semibold text-zinc-900 hover:text-[#9A7616] underline underline-offset-4 cursor-pointer"
                >
                  Manage assignment
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

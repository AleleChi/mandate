import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AnalyticsAgeGroupRow } from './types';

interface AgeGroupAttendanceTableProps {
  ageGroups: AnalyticsAgeGroupRow[];
  activeAgeGroup: string;
  onSelectAgeGroup: (ageGroup: string) => void;
  summaryTotals: {
    selected: number;
    checkedIn: number;
    inside: number;
    pickedUp: number;
    notArrived: number;
    attendancePct: number;
  };
}

export const AgeGroupAttendanceTable: React.FC<AgeGroupAttendanceTableProps> = ({
  ageGroups,
  activeAgeGroup,
  onSelectAgeGroup,
  summaryTotals
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleExpand = (ageGroup: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroups((prev) => ({ ...prev, [ageGroup]: !prev[ageGroup] }));
  };

  return (
    <section className="space-y-3 pb-8 border-b border-zinc-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Attendance by age group</h2>
        </div>
        {activeAgeGroup && (
          <button
            type="button"
            onClick={() => onSelectAgeGroup('')}
            className="text-xs font-medium text-[#9A7616] hover:text-zinc-900 underline underline-offset-2 cursor-pointer"
          >
            Clear age filter (Ages {activeAgeGroup})
          </button>
        )}
      </div>

      <div className="overflow-x-auto bg-white border-y border-zinc-200">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <th className="py-3 pr-4 pl-2">Age group</th>
              <th className="py-3 px-3 text-right tabular-nums">Selected</th>
              <th className="py-3 px-3 text-right tabular-nums">Checked in</th>
              <th className="py-3 px-3 text-right tabular-nums">Inside</th>
              <th className="py-3 px-3 text-right tabular-nums">Picked up</th>
              <th className="py-3 px-3 text-right tabular-nums">Not arrived</th>
              <th className="py-3 pl-3 pr-2 text-right tabular-nums">Attendance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {ageGroups.map((row) => {
              const isSelected = activeAgeGroup === row.ageGroup;
              const isExpanded = Boolean(expandedGroups[row.ageGroup]);
              const hasExact = row.exactAges && row.exactAges.length > 0;

              return (
                <React.Fragment key={row.ageGroup}>
                  <tr
                    onClick={() => onSelectAgeGroup(isSelected ? '' : row.ageGroup)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#FAF5E6] text-zinc-900' : 'hover:bg-zinc-50/70 text-zinc-800'
                    }`}
                  >
                    <td className="py-3 pr-4 pl-2 font-medium">
                      <div className="flex items-center gap-2">
                        {hasExact ? (
                          <button
                            type="button"
                            aria-label={isExpanded ? `Collapse Ages ${row.ageGroup}` : `Expand Ages ${row.ageGroup}`}
                            onClick={(e) => toggleExpand(row.ageGroup, e)}
                            className="p-0.5 text-zinc-400 hover:text-zinc-900"
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <span className="w-4 inline-block" />
                        )}
                        <span className={isSelected ? 'text-[#9A7616] font-semibold' : 'text-zinc-900'}>
                          {row.ageGroup === 'Other' ? 'Other' : `Ages ${row.ageGroup}`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">{row.selected.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{row.checkedIn.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right tabular-nums font-medium text-zinc-900">{row.inside.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-zinc-600">{row.pickedUp.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-zinc-500">{row.notArrived.toLocaleString()}</td>
                    <td className="py-3 pl-3 pr-2 text-right tabular-nums font-medium text-zinc-900">
                      {`${row.attendancePct.toFixed(1)}%`}
                    </td>
                  </tr>

                  {isExpanded && hasExact &&
                    row.exactAges.map((exact) => (
                      <tr key={`${row.ageGroup}-age-${exact.age}`} className="bg-[#FAF9F5] text-xs text-zinc-600">
                        <td className="py-2 pl-10 pr-4 font-medium text-zinc-700">Age {exact.age}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{exact.selected.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{exact.checkedIn.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{exact.inside.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{exact.pickedUp.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{exact.notArrived.toLocaleString()}</td>
                        <td className="py-2 pl-3 pr-2 text-right tabular-nums">{`${exact.attendancePct.toFixed(1)}%`}</td>
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 bg-[#FAF9F5] font-semibold text-zinc-900">
              <td className="py-3 pr-4 pl-8">Total</td>
              <td className="py-3 px-3 text-right tabular-nums">{summaryTotals.selected.toLocaleString()}</td>
              <td className="py-3 px-3 text-right tabular-nums">{summaryTotals.checkedIn.toLocaleString()}</td>
              <td className="py-3 px-3 text-right tabular-nums">{summaryTotals.inside.toLocaleString()}</td>
              <td className="py-3 px-3 text-right tabular-nums">{summaryTotals.pickedUp.toLocaleString()}</td>
              <td className="py-3 px-3 text-right tabular-nums">{summaryTotals.notArrived.toLocaleString()}</td>
              <td className="py-3 pl-3 pr-2 text-right tabular-nums">{`${summaryTotals.attendancePct.toFixed(1)}%`}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
};

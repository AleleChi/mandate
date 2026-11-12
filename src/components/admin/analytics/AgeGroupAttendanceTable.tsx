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
    <section className="bg-white border border-zinc-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Age Group Attendance Breakdown</h2>
          <p className="text-xs text-zinc-500">
            Click an age group row to filter activity and timeline, or expand for exact ages.
          </p>
        </div>
        {activeAgeGroup && (
          <button
            type="button"
            onClick={() => onSelectAgeGroup('')}
            className="text-xs font-medium text-[#9A7616] hover:text-zinc-900 underline underline-offset-2"
          >
            Clear age filter (Ages {activeAgeGroup})
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-[#FAF9F5] text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <th className="py-2.5 px-4">Age group</th>
              <th className="py-2.5 px-3 text-right tabular-nums">Selected</th>
              <th className="py-2.5 px-3 text-right tabular-nums">Checked in</th>
              <th className="py-2.5 px-3 text-right tabular-nums">Inside</th>
              <th className="py-2.5 px-3 text-right tabular-nums">Picked up</th>
              <th className="py-2.5 px-3 text-right tabular-nums">Not arrived</th>
              <th className="py-2.5 px-4 text-right tabular-nums">Attendance %</th>
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
                      isSelected
                        ? 'bg-[#FAF5E6] text-zinc-900'
                        : 'hover:bg-zinc-50 text-zinc-800'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-medium">
                      <div className="flex items-center gap-2">
                        {hasExact ? (
                          <button
                            type="button"
                            aria-label={isExpanded ? `Collapse Ages ${row.ageGroup}` : `Expand Ages ${row.ageGroup}`}
                            onClick={(e) => toggleExpand(row.ageGroup, e)}
                            className="p-0.5 text-zinc-400 hover:text-zinc-800 rounded"
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <span className="w-4 inline-block" />
                        )}
                        <span className={isSelected ? 'text-[#9A7616] font-semibold' : 'text-zinc-900'}>
                          {row.ageGroup === 'Other' ? 'Other' : `Ages ${row.ageGroup}`}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-[#9A7616] border border-[#C59B27]/40 px-1.5 py-0.5 rounded-sm">
                            Active
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium">{row.selected}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{row.checkedIn}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium text-zinc-900">{row.inside}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-zinc-600">{row.pickedUp}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-zinc-500">{row.notArrived}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-medium">
                      {`${row.attendancePct.toFixed(1)}%`}
                    </td>
                  </tr>

                  {isExpanded && hasExact &&
                    row.exactAges.map((exact) => (
                      <tr key={`${row.ageGroup}-age-${exact.age}`} className="bg-[#FAF9F5]/70 text-xs text-zinc-600">
                        <td className="py-2 pl-12 pr-4 font-medium text-zinc-700">Age {exact.age}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{exact.selected}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{exact.checkedIn}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{exact.inside}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{exact.pickedUp}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{exact.notArrived}</td>
                        <td className="py-2 px-4 text-right tabular-nums">{`${exact.attendancePct.toFixed(1)}%`}</td>
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 bg-[#FAF9F5] font-semibold text-zinc-900">
              <td className="py-2.5 px-4 pl-10">Total</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{summaryTotals.selected}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{summaryTotals.checkedIn}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{summaryTotals.inside}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{summaryTotals.pickedUp}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{summaryTotals.notArrived}</td>
              <td className="py-2.5 px-4 text-right tabular-nums">{`${summaryTotals.attendancePct.toFixed(1)}%`}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
};

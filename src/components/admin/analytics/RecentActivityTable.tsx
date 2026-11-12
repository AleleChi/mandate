import React from 'react';
import { AnalyticsActivityItem, formatAnalyticsTime } from './types';

interface RecentActivityTableProps {
  items: AnalyticsActivityItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
  viewAll: boolean;
  onToggleViewAll: () => void;
  onPageChange: (nextPage: number) => void;
  timeZone?: string;
}

export const RecentActivityTable: React.FC<RecentActivityTableProps> = ({
  items,
  pagination,
  viewAll,
  onToggleViewAll,
  onPageChange,
  timeZone
}) => {
  return (
    <section className="bg-white border border-zinc-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Recent Attendance Operations</h2>
          <p className="text-xs text-zinc-500">
            Showing {items.length} of {pagination.totalRecords} completed operations (newest first).
          </p>
        </div>

        {pagination.totalRecords > 20 && (
          <button
            type="button"
            onClick={onToggleViewAll}
            className="text-xs font-medium px-2.5 py-1 border border-zinc-200 rounded bg-[#FAF9F5] hover:border-[#C59B27] text-zinc-800"
          >
            {viewAll ? 'Show latest 20' : 'View all activity'}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-[#FAF9F5] text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <th className="py-2.5 px-4">Time</th>
              <th className="py-2.5 px-3">Action</th>
              <th className="py-2.5 px-3">Child</th>
              <th className="py-2.5 px-3">Age group</th>
              <th className="py-2.5 px-3">Volunteer</th>
              <th className="py-2.5 px-4">Location / Gate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 px-4 text-center text-xs text-zinc-500">
                  No check-ins or pickups recorded yet.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50">
                  <td className="py-2.5 px-4 tabular-nums text-xs text-zinc-600 whitespace-nowrap">
                    {formatAnalyticsTime(item.time, timeZone)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-medium rounded-sm border ${
                        item.action === 'check_in'
                          ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                          : 'bg-[#FAF5E6] border-[#C59B27]/40 text-[#9A7616]'
                      }`}
                    >
                      {item.action === 'check_in' ? 'Checked In' : 'Picked Up'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-zinc-900">{item.childName}</td>
                  <td className="py-2.5 px-3 text-xs text-zinc-600 whitespace-nowrap">
                    {item.ageGroup === 'Other' ? 'Other' : `Ages ${item.ageGroup}`}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-zinc-800">{item.volunteerName}</td>
                  <td className="py-2.5 px-4 text-xs text-zinc-500">{item.location || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="px-4 py-2.5 border-t border-zinc-200 bg-[#FAF9F5] flex items-center justify-between text-xs text-zinc-600">
          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              className="px-2.5 py-1 border border-zinc-200 rounded bg-white disabled:opacity-40 hover:border-zinc-400"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              className="px-2.5 py-1 border border-zinc-200 rounded bg-white disabled:opacity-40 hover:border-zinc-400"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
};


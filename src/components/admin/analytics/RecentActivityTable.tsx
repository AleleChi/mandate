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
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Recent activity</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Showing {items.length} of {pagination.totalRecords.toLocaleString()} completed operations.
          </p>
        </div>

        {pagination.totalRecords > 20 && (
          <button
            type="button"
            onClick={onToggleViewAll}
            className="text-xs font-medium text-[#9A7616] hover:text-zinc-900 underline underline-offset-2 cursor-pointer"
          >
            {viewAll ? 'Show latest 20' : 'View all activity'}
          </button>
        )}
      </div>

      <div className="overflow-x-auto bg-white border-y border-zinc-200">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <th className="py-3 pr-4 pl-2">Time</th>
              <th className="py-3 px-3">Action</th>
              <th className="py-3 px-3">Child</th>
              <th className="py-3 px-3">Age group</th>
              <th className="py-3 px-3">Volunteer</th>
              <th className="py-3 pl-3 pr-2">Location</th>
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
                <tr key={item.id} className="hover:bg-zinc-50/70">
                  <td className="py-2.5 pr-4 pl-2 tabular-nums text-xs text-zinc-600 whitespace-nowrap">
                    {formatAnalyticsTime(item.time, timeZone)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-xs font-medium">
                    <span className={item.action === 'pickup' ? 'text-[#9A7616]' : 'text-zinc-900'}>
                      {item.action === 'check_in' ? 'Checked in' : 'Picked up'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-zinc-900">{item.childName}</td>
                  <td className="py-2.5 px-3 text-xs text-zinc-600 whitespace-nowrap">
                    {item.ageGroup === 'Other' ? 'Other' : `Ages ${item.ageGroup}`}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-zinc-800">{item.volunteerName}</td>
                  <td className="py-2.5 pl-3 pr-2 text-xs text-zinc-500">{item.location || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="pt-1 flex items-center justify-between text-xs text-zinc-600">
          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              className="px-2.5 py-1 border border-zinc-200 bg-white disabled:opacity-40 hover:border-zinc-400 cursor-pointer disabled:cursor-default"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              className="px-2.5 py-1 border border-zinc-200 bg-white disabled:opacity-40 hover:border-zinc-400 cursor-pointer disabled:cursor-default"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

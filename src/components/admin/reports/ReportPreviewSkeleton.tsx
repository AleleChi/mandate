import React from 'react';

export const ReportPreviewSkeleton: React.FC = () => {
  return (
    <div className="max-w-[840px] mx-auto bg-white border border-stone-200 rounded-xl p-8 sm:p-12 space-y-8 animate-pulse my-4">
      {/* Header Skeleton */}
      <div className="border-b border-stone-200 pb-6 space-y-3">
        <div className="flex justify-between items-center">
          <div className="h-3 w-32 bg-stone-200 rounded" />
          <div className="h-5 w-24 bg-stone-200 rounded-full" />
        </div>
        <div className="h-8 w-3/4 bg-stone-200 rounded" />
        <div className="h-4 w-1/2 bg-stone-200 rounded" />
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-stone-100 rounded-xl border border-stone-200 p-4 space-y-2">
            <div className="h-3 w-16 bg-stone-200 rounded" />
            <div className="h-6 w-12 bg-stone-200 rounded" />
            <div className="h-2 w-20 bg-stone-200 rounded" />
          </div>
        ))}
      </div>

      {/* Sections Skeleton */}
      <div className="space-y-6">
        {[1, 2].map((s) => (
          <div key={s} className="bg-stone-50 border border-stone-200 rounded-xl p-6 space-y-4">
            <div className="h-5 w-48 bg-stone-200 rounded" />
            <div className="space-y-2">
              <div className="h-3 w-full bg-stone-200 rounded" />
              <div className="h-3 w-5/6 bg-stone-200 rounded" />
              <div className="h-3 w-4/6 bg-stone-200 rounded" />
            </div>
            <div className="h-32 bg-stone-200/60 rounded-lg" />
          </div>
        ))}
      </div>

      <div className="text-center py-4">
        <p className="text-xs text-stone-500 font-medium">Loading report preview…</p>
      </div>
    </div>
  );
};

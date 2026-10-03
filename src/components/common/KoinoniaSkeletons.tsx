import React from 'react';

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  showHeader?: boolean;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  cols = 4,
  showHeader = true,
}) => {
  return (
    <div className="w-full bg-white border border-[#EAE8E1] rounded-2xl p-4 space-y-4 animate-pulse">
      {/* Header filter/search bar skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#F4F3EF]">
        <div className="h-9 bg-zinc-100 rounded-xl w-64" />
        <div className="flex gap-2">
          <div className="h-9 bg-zinc-100 rounded-xl w-24" />
          <div className="h-9 bg-zinc-100 rounded-xl w-28" />
        </div>
      </div>

      {/* Table header */}
      {showHeader && (
        <div className="grid grid-cols-12 gap-4 px-3 py-2 bg-[#FAF9F5] rounded-xl">
          {Array.from({ length: cols }).map((_, idx) => (
            <div
              key={idx}
              className={`h-3 bg-zinc-200/80 rounded-md ${
                cols === 4 ? 'col-span-3' : cols === 3 ? 'col-span-4' : 'col-span-2'
              }`}
            />
          ))}
        </div>
      )}

      {/* Table rows */}
      <div className="space-y-3 pt-1">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div
            key={rIdx}
            className="grid grid-cols-12 gap-4 items-center px-3 py-3 border-b border-[#F4F3EF] last:border-0"
          >
            <div className="col-span-4 flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-zinc-200/80 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 bg-zinc-200/80 rounded-md w-3/4" />
                <div className="h-2.5 bg-zinc-100 rounded-md w-1/2" />
              </div>
            </div>
            <div className="col-span-3">
              <div className="h-3 bg-zinc-200/60 rounded-md w-2/3" />
            </div>
            <div className="col-span-3">
              <div className="h-3 bg-zinc-200/60 rounded-md w-1/2" />
            </div>
            <div className="col-span-2 flex justify-end">
              <div className="h-7 bg-zinc-100 rounded-lg w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface CardSkeletonProps {
  count?: number;
  cols?: string;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({
  count = 3,
  cols = 'grid-cols-1 md:grid-cols-3'
}) => {
  return (
    <div className={`grid ${cols} gap-4 animate-pulse`}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white border border-[#EAE8E1] rounded-2xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 bg-zinc-200/80 rounded-md w-1/3" />
            <div className="w-8 h-8 rounded-xl bg-zinc-100" />
          </div>
          <div className="h-3 bg-zinc-100 rounded-md w-5/6" />
          <div className="h-3 bg-zinc-100 rounded-md w-2/3" />
          <div className="pt-2 flex items-center justify-between border-t border-[#F4F3EF]">
            <div className="h-3 bg-zinc-100 rounded-md w-1/4" />
            <div className="h-6 bg-zinc-100 rounded-full w-16" />
          </div>
        </div>
      ))}
    </div>
  );
};

interface ListSkeletonProps {
  items?: number;
}

export const ListSkeleton: React.FC<ListSkeletonProps> = ({ items = 4 }) => {
  return (
    <div className="space-y-3 animate-pulse bg-white border border-[#EAE8E1] rounded-2xl p-4">
      {Array.from({ length: items }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between p-3 border-b border-[#F4F3EF] last:border-0"
        >
          <div className="flex items-center space-x-3 flex-1">
            <div className="w-9 h-9 rounded-xl bg-zinc-200/70 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 bg-zinc-200/80 rounded-md w-2/5" />
              <div className="h-3 bg-zinc-100 rounded-md w-3/5" />
            </div>
          </div>
          <div className="h-8 bg-zinc-100 rounded-xl w-20" />
        </div>
      ))}
    </div>
  );
};

interface SectionSkeletonProps {
  title?: string;
}

export const SectionSkeleton: React.FC<SectionSkeletonProps> = () => {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-5 bg-zinc-200/80 rounded-md w-48" />
      <div className="bg-white border border-[#EAE8E1] rounded-2xl p-6 space-y-4">
        <div className="h-4 bg-zinc-200/80 rounded-md w-1/3" />
        <div className="h-3 bg-zinc-100 rounded-md w-full" />
        <div className="h-3 bg-zinc-100 rounded-md w-4/5" />
        <div className="h-10 bg-zinc-100 rounded-xl w-32" />
      </div>
    </div>
  );
};

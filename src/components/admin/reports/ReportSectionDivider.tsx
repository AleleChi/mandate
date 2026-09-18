import React from 'react';

interface ReportSectionDividerProps {
  number?: string;
  title: string;
  description?: string;
}

export const ReportSectionDivider: React.FC<ReportSectionDividerProps> = ({
  number,
  title,
  description
}) => {
  // Extract number if title starts with 01, 02, etc.
  let displayNum = number;
  let cleanTitle = title;
  const match = title.match(/^(\d{2})\s+(.+)$/);
  if (match) {
    displayNum = displayNum || match[1];
    cleanTitle = match[2];
  }

  return (
    <div className="pt-10 pb-6 border-b border-stone-200/90 space-y-3">
      <div className="flex items-baseline gap-4">
        {displayNum && (
          <span className="text-3xl sm:text-4xl font-serif font-light text-[#C59B27] tracking-tight">
            {displayNum}
          </span>
        )}
        <div>
          <h3 className="text-xl sm:text-2xl font-serif font-medium text-stone-900 tracking-tight">
            {cleanTitle}
          </h3>
          {description && (
            <p className="text-xs sm:text-sm text-stone-500 font-sans font-normal mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
